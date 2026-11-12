import type { D1Database } from '@cloudflare/workers-types';
import type { CharacterAppearance, GuildInvitation } from '@guild/shared';
import { CredentialsRejected, type IdentityProvider } from './identity';

const MINUTE = 60_000;
const LEASE = 2 * MINUTE;
export const INVITE_LIFETIME = 7 * 24 * 60 * MINUTE;

export function randomInviteToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function hashInvite(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface StoredInvitation {
  id: string;
  status: Exclude<GuildInvitation['status'], 'expired'>;
  issued_at: number;
  expires_at: number;
  used_at: number | null;
  pending_until: number | null;
  reserved_username: string | null;
}

export function publicInvitation(row: StoredInvitation, now: number): GuildInvitation {
  const expired = ['issued', 'pending'].includes(row.status) && row.expires_at <= now;
  return {
    id: row.id,
    status: expired ? 'expired' : row.status,
    createdAt: row.issued_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

async function findInvitation(db: D1Database, hash: string) {
  return db
    .prepare(
      `SELECT id, status, issued_at, expires_at, used_at, pending_until, reserved_username
    FROM invitations WHERE token_hash = ?`,
    )
    .bind(hash)
    .first<StoredInvitation>();
}

export async function invitationState(db: D1Database, hash: string, now: number) {
  const row = await findInvitation(db, hash);
  if (!row) return 'invalid';
  const { status } = publicInvitation(row, now);
  if (status === 'pending' && row.pending_until !== null && row.pending_until <= now)
    return 'retry';
  return status;
}

interface RedemptionInput {
  username: string;
  password: string;
  character: CharacterAppearance;
}

export async function redeemInvitation(
  db: D1Database,
  identity: IdentityProvider,
  hash: string,
  input: RedemptionInput,
) {
  const now = Date.now();
  const original = await findInvitation(db, hash);
  if (!original) return 'invalid';
  const externalId = `guild-invite-${original.id}`;
  const leaseEndsAt = now + LEASE;
  const held = await db
    .prepare(
      `UPDATE invitations
    SET status = 'pending', redemption_key = ?, pending_until = ?, reserved_username = ?
    WHERE id = ? AND expires_at > ? AND (status = 'issued' OR
      (status = 'pending' AND pending_until <= ? AND reserved_username = ?))
    RETURNING id`,
    )
    .bind(externalId, leaseEndsAt, input.username, original.id, now, now, input.username)
    .first();
  if (!held) return invitationState(db, hash, now);

  let user;
  try {
    user =
      (await identity.findByExternalId(externalId)) ??
      (await identity.createUser({
        externalId,
        username: input.username,
        password: input.password,
      }));
  } catch (error) {
    // A previous or ambiguous provider call may still create this identity. Keep its reservation.
    if (!(error instanceof CredentialsRejected) || original.status !== 'issued') return 'pending';
    await db
      .prepare(
        `UPDATE invitations SET status = 'issued', pending_until = NULL,
      reserved_username = NULL, redemption_key = NULL WHERE id = ? AND status = 'pending'
      AND pending_until = ?`,
      )
      .bind(original.id, leaseEndsAt)
      .run();
    return error.code;
  }

  if (!user.id || user.username?.toLowerCase() !== input.username) return 'pending';
  const finishedAt = Date.now();
  if (finishedAt >= leaseEndsAt) return 'pending';
  const memberId = crypto.randomUUID();
  const { displayName, hairStyle, hairColor, tunicColor } = input.character;
  try {
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO members (id, guild_id, clerk_user_id, auth_username, role, status, joined_at)
        SELECT ?, 'documentation-guild', ?, ?, 'member', 'active', ? FROM invitations
        WHERE id = ? AND status = 'pending' AND pending_until = ? AND expires_at > ?`,
        )
        .bind(memberId, user.id, input.username, finishedAt, original.id, leaseEndsAt, finishedAt),
      db
        .prepare(
          `INSERT INTO characters (id, member_id, display_name, hair_style, hair_color, tunic_color)
        SELECT ?, id, ?, ?, ?, ? FROM members WHERE id = ?`,
        )
        .bind(crypto.randomUUID(), displayName, hairStyle, hairColor, tunicColor, memberId),
      db
        .prepare(
          `UPDATE invitations SET status = 'consumed', pending_until = NULL, used_at = ?, redeemed_member_id = ?
        WHERE id = ? AND status = 'pending' AND pending_until = ? AND EXISTS (SELECT 1 FROM members WHERE id = ?)`,
        )
        .bind(finishedAt, memberId, original.id, leaseEndsAt, memberId),
    ]);
    if (result[2]?.meta.changes === 1) return 'created';
    return invitationState(db, hash, finishedAt);
  } catch {
    return 'pending';
  }
}
