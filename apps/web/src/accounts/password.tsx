import { useReverification, useUser } from '@clerk/react';
import { passwordSchema } from '@guild/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { accountApi, accountError } from './api';

export function PasswordSettings() {
  const { user } = useUser();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = useReverification(async (currentPassword: string, newPassword: string) => {
    if (!user) throw new Error('No active user');
    await user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: true });
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = data.get('currentPassword');
    const next = passwordSchema.safeParse(data.get('newPassword'));
    if (typeof current !== 'string' || !next.success) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await update(current, next.data);
      form.reset();
      setNotice('Password changed. Other sessions were signed out.');
    } catch {
      setError(
        'Password could not be changed. Check your current password and try a stronger new one.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="guild-admin">
      <summary>Change password</summary>
      <form className="account-form" onSubmit={(event) => void save(event)}>
        <label>
          Current password
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={busy}>
          Update password
        </button>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </form>
    </details>
  );
}

export function RecoveryForm({
  token,
  apiUrl,
  onDone,
}: {
  token: string;
  apiUrl: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = passwordSchema.safeParse(fields.get('password'));
    if (!password.success || fields.get('confirmPassword') !== password.data) {
      setError('Enter matching passwords of at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await accountApi(apiUrl)('/auth/recover', {
        method: 'POST',
        body: JSON.stringify({ token, password: password.data }),
      });
      onDone();
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-panel">
      <h2>Reset guild password</h2>
      <form className="account-form" onSubmit={(event) => void save(event)}>
        <label>
          New password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={busy}>
          Reset password
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}
