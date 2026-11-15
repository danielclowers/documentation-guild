import { ClerkProvider, useAuth, useClerk, useSignIn } from '@clerk/react';
import { characterSchema, passwordSchema, usernameSchema } from '@guild/shared';
import type { CharacterAppearance, GuildProfile } from '@guild/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { accountApi, accountError, GuildApiError } from './api';
import { PasswordSettings, RecoveryForm } from './password';
import { CharacterEditor, CharacterFields, startingAppearance } from './character';
import { GuildGame } from '../game/guild-game';

interface AccessProps {
  apiUrl: string;
  invitation: string | null;
  recovery?: string | null;
  recoveryComplete?: boolean;
  onEnter?: (inside: boolean) => void;
  showHelp?: boolean;
  onDismissHelp?: () => void;
}

function SignInForm({ apiUrl, invitation, recoveryComplete }: AccessProps) {
  const { signIn, fetchStatus } = useSignIn();
  const [token, setToken] = useState(invitation);
  const [inviteState, setInviteState] = useState<string>('checking');
  const [revision, setRevision] = useState(0);
  const [appearance, setAppearance] = useState(startingAppearance);
  const [message, setMessage] = useState(
    recoveryComplete ? 'Password reset. Sign in with your new password.' : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useMemo(() => accountApi(apiUrl), [apiUrl]);
  const redeeming = token !== null && ['issued', 'retry'].includes(inviteState);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void request<{ status: string }>('/auth/invitation-status', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setInviteState(result.status);
      })
      .catch(() => {
        if (!controller.signal.aborted) setInviteState('unavailable');
      });
    return () => controller.abort();
  }, [request, revision, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = usernameSchema.safeParse(fields.get('username'));
    const password = fields.get('password');
    setError('');
    setMessage('');
    if (!username.success || typeof password !== 'string') {
      setError('Enter a username with 4 to 32 letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    try {
      if (redeeming) {
        const character = characterSchema.safeParse(appearance);
        if (!character.success || !passwordSchema.safeParse(password).success) {
          setError(
            'Use 2 to 24 characters for the display name and at least 8 characters for the password.',
          );
          return;
        }
        await request('/auth/redeem', {
          method: 'POST',
          body: JSON.stringify({
            token,
            username: username.data,
            password,
            character: character.data,
          }),
        });
        setToken(null);
        setMessage(
          'Your guild account is ready. Sign in with the username and password you chose.',
        );
        form.reset();
        return;
      }
      const { error: signInError } = await signIn.password({ identifier: username.data, password });
      if (signInError) {
        setError('That username and password could not be used to sign in.');
      } else if (signIn.status === 'complete') {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) setError('Clerk could not finish signing in. Try again.');
      } else {
        setError('This account requires an additional sign-in step. Contact a guild admin.');
      }
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  const stateCode = {
    invalid: 'INVITE_INVALID',
    consumed: 'INVITE_CONSUMED',
    revoked: 'INVITE_REVOKED',
    expired: 'INVITE_EXPIRED',
    pending: 'INVITE_PENDING',
    unavailable: 'UNAVAILABLE',
  }[inviteState];
  return (
    <div className="account-panel">
      <h2>{redeeming ? 'Accept your invitation' : 'Guild sign-in'}</h2>
      {token && inviteState === 'checking' && <p role="status">Checking your invitation…</p>}
      {token && stateCode && <p role="status">{accountError(new GuildApiError(stateCode))}</p>}
      {token && inviteState === 'retry' && (
        <p role="status">Use the same username you submitted before.</p>
      )}
      {token && ['pending', 'unavailable'].includes(inviteState) && (
        <button
          type="button"
          onClick={() => {
            setInviteState('checking');
            setRevision((value) => value + 1);
          }}
        >
          Check invitation again
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        <label>
          Username
          <input name="username" autoComplete="username" required minLength={4} maxLength={32} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={redeeming ? 8 : undefined}
            maxLength={128}
            autoComplete={redeeming ? 'new-password' : 'current-password'}
          />
        </label>
        {redeeming && <CharacterFields value={appearance} onChange={setAppearance} />}
        <button type="submit" disabled={busy || fetchStatus === 'fetching'}>
          {redeeming ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function MemberAccess({
  apiUrl,
  invitation,
  recoveryComplete,
  onEnter,
  showHelp,
  onDismissHelp,
}: AccessProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const request = useMemo(() => accountApi(apiUrl, getToken), [apiUrl, getToken]);
  const [profile, setProfile] = useState<GuildProfile>();
  const [hallConnected, setHallConnected] = useState(false);
  const progressVersion = useRef(0);
  function updateProgress(next: GuildProfile) {
    progressVersion.current++;
    setProfile(next);
  }
  const [error, setError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isSignedIn) return;
    const controller = new AbortController();
    void request<GuildProfile>('/me', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(accountError(err));
      });
    return () => controller.abort();
  }, [isSignedIn, request, revision]);

  const updateHallConnection = useCallback((connected: boolean) => setHallConnected(connected), []);

  useEffect(() => {
    if (!isSignedIn || !profile?.character) return;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      const version = progressVersion.current;
      try {
        const next = await request<GuildProfile>('/me', { signal: controller.signal });
        if (!controller.signal.aborted && version === progressVersion.current) setProfile(next);
      } catch (err) {
        if (
          !controller.signal.aborted &&
          err instanceof GuildApiError &&
          ['UNAUTHORIZED', 'NOT_MEMBER'].includes(err.code)
        ) {
          setError(accountError(err));
          setProfile(undefined);
        }
      } finally {
        pending = false;
      }
    };
    if (hallConnected) void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVisible = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isSignedIn, Boolean(profile?.character), request, hallConnected]);

  async function saveAppearance(appearance: CharacterAppearance) {
    const data = await request<GuildProfile>('/me/character', {
      method: 'PATCH',
      body: JSON.stringify(appearance),
    });
    updateProgress(data);
  }

  function exitGuild() {
    void signOut()
      .then(() => {
        setProfile(undefined);
        setError('');
        setSignOutError('');
      })
      .catch(() => setSignOutError('Sign-out failed. Try again.'));
  }

  const inside = Boolean(isSignedIn && profile?.character);
  useEffect(() => {
    onEnter?.(inside);
    return () => onEnter?.(false);
  }, [inside, onEnter]);

  if (!isLoaded) return <p role="status">Loading guild sign-in…</p>;
  if (!isSignedIn)
    return (
      <SignInForm apiUrl={apiUrl} invitation={invitation} recoveryComplete={recoveryComplete} />
    );
  if (profile?.character) {
    return (
      <GuildGame
        apiUrl={apiUrl}
        profile={{ ...profile, character: profile.character }}
        request={request}
        onChange={updateProgress}
        onConnection={updateHallConnection}
        onSaveAppearance={saveAppearance}
        onSignOut={exitGuild}
        showHelp={showHelp}
        onDismissHelp={onDismissHelp}
        accountSettings={
          <>
            <PasswordSettings />
            {signOutError && <p role="alert">{signOutError}</p>}
          </>
        }
      />
    );
  }
  return (
    <div className="account-panel">
      <h2>Your guild account</h2>
      {error && <p role="alert">{error}</p>}
      {signOutError && <p role="alert">{signOutError}</p>}
      {profile ? (
        <CharacterEditor value={startingAppearance} onSave={saveAppearance} />
      ) : error ? (
        <button
          type="button"
          onClick={() => {
            setError('');
            setRevision((value) => value + 1);
          }}
        >
          Try again
        </button>
      ) : (
        <p role="status">Checking guild membership…</p>
      )}
      {profile && <PasswordSettings />}
      <button type="button" onClick={exitGuild}>
        Sign out
      </button>
    </div>
  );
}

export default function GuildAccess({
  publishableKey,
  recovery,
  ...props
}: AccessProps & { publishableKey: string }) {
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  if (recovery && !recoveryComplete) {
    return (
      <RecoveryForm
        token={recovery}
        apiUrl={props.apiUrl}
        onDone={() => setRecoveryComplete(true)}
      />
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} telemetry={false}>
      <SessionAccess {...props} recoveryComplete={recoveryComplete} />
    </ClerkProvider>
  );
}

function SessionAccess(props: AccessProps) {
  const { sessionId } = useAuth();
  return <MemberAccess key={sessionId ?? 'signed-out'} {...props} />;
}
