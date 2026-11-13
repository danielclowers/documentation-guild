export class GuildApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function accountApi(baseUrl: string, getToken?: () => Promise<string | null>) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (getToken) {
      const token = await getToken();
      if (!token) throw new GuildApiError('UNAUTHORIZED');
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    if (response.status === 204) return undefined as T;
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new GuildApiError(payload?.error?.code ?? 'UNAVAILABLE');
    }
    return (await response.json()) as T;
  };
}

export type AccountApi = ReturnType<typeof accountApi>;

const messages: Record<string, string> = {
  INVALID_INPUT: 'Check the highlighted fields and try again.',
  INVITE_INVALID: 'This invitation link is invalid.',
  INVITE_EXPIRED: 'This invitation has expired. Ask a guild admin for a fresh link.',
  INVITE_CONSUMED:
    'This invitation has already been used. If you created the account, sign in below.',
  INVITE_REVOKED: 'A guild admin revoked this invitation.',
  INVITE_PENDING:
    'This invitation is being processed. If it stays here, wait two minutes and retry with the same username.',
  USERNAME_TAKEN: 'That username is already in use. Choose another.',
  CREDENTIALS_REJECTED:
    'Clerk rejected these credentials. Try a stronger password or a different username.',
  RECOVERY_INVALID: 'This recovery link is invalid, expired, or already used.',
  RECOVERY_FAILED:
    'The password could not be confirmed. Try signing in with the new password or ask the guild admin for a replacement link.',
  RATE_LIMITED: 'Too many requests. Wait a minute and try again.',
  UNAUTHORIZED: 'Your session has ended. Sign out and sign in again.',
  NOT_MEMBER: 'This account has no active guild membership. Contact a guild admin.',
  TRAINING_UNAVAILABLE:
    'Training requires the listed level, gold, and current rank. Check your updated profile and try again.',
  SPECIALIZATION_UNAVAILABLE:
    'Check your level, gold, and when you can switch specializations again.',
  EXPEDITION_CONFLICT:
    'That expedition action is unavailable. Check the roster, departure time, level requirement, or your current party.',
  INVALID_STATE: 'This record has already changed. Refresh the list and try again.',
};

export function accountError(error: unknown): string {
  return (
    (error instanceof GuildApiError && messages[error.code]) ||
    'Guild access is temporarily unavailable. Try again shortly.'
  );
}
