import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clerkIdentity, CredentialsRejected } from '../../apps/api/src/accounts/identity';
import type { IdentityProvider, ProvisionedUser } from '../../apps/api/src/accounts/identity';
import { hashInvite, type invitationState } from '../../apps/api/src/accounts/invitations';
import { accountRoutes } from '../../apps/api/src/accounts/routes';
import { settleStandingOrder } from '../../apps/api/src/progression/standing-orders';
import { offlineStandingOrderLimit, standingOrderInterval } from '../../packages/shared/src';

const origin = 'http://localhost:5173';
const issuer = 'https://guild.example.test';
const audience = 'documentation-guild-api';
const appearance = { displayName: 'Ada Quill', hairStyle: 1, hairColor: 0, tunicColor: 2 };
const account = {
  username: 'ada_quill',
  password: 'SyntheticTestPassword123!',
  character: appearance,
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const clerkEnv = {
  CLERK_SECRET_KEY: 'unused-local-fixture',
  CLERK_ISSUER: issuer,
  CLERK_AUDIENCE: audience,
  CLERK_JWT_KEY: jwtKey,
};

function tokenFor(sub: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    aud: audience,
    azp: origin,
    sid: 'sess_fixture',
    sub,
    iat: now,
    nbf: now - 1,
    exp: now + 60,
    ...overrides,
  };
  const unsigned = [JSON.stringify({ alg: 'RS256', typ: 'JWT' }), JSON.stringify(payload)]
    .map((part) => Buffer.from(part).toString('base64url'))
    .join('.');
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

const authenticate = clerkIdentity(clerkEnv, [origin])!.authenticate;
const identities = new Map<string, ProvisionedUser>();
const resetPassword = vi.fn<IdentityProvider['resetPassword']>();
const provision = vi.fn<IdentityProvider['createUser']>();
const router = accountRoutes(() => ({
  authenticate,
  resetPassword,
  createUser: provision,
  findByExternalId: async (id) => identities.get(id),
}));
let runtime: Miniflare;
type Database = Parameters<typeof invitationState>[0];
let db: Database;
let rateAllowed = true;

async function call(
  path: string,
  options: { method?: string; auth?: string; body?: unknown; origin?: string } = {},
) {
  const headers = new Headers({ Origin: options.origin ?? origin });
  if (options.auth) headers.set('Authorization', `Bearer ${options.auth}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return router.request(
    path,
    {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    {
      DB: db,
      WEB_URL: `${origin}/documentation-guild/`,
      ALLOWED_ORIGINS: origin,
      AUTH_RATE_LIMIT: { limit: async () => ({ success: rateAllowed }) },
    },
  );
}

async function createInvitation() {
  const response = await call('/admin/invitations', {
    method: 'POST',
    auth: tokenFor('user_admin'),
  });
  expect(response.status).toBe(201);
  const { id, url } = (await response.json()) as { id: string; url: string };
  return { id, token: new URL(url).hash.slice('#/redeem/'.length) };
}

function redeem(token: string) {
  return call('/auth/redeem', { method: 'POST', body: { ...account, token } });
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch() {return new Response(null)}}',
      d1Databases: ['DB'],
    }),
  );
  db = (await runtime.getD1Database('DB')) as unknown as typeof db;
  for (const migration of [
    '0001_guild_membership.sql',
    '0002_invitation_leases.sql',
    '0003_account_recovery.sql',
    '0004_hall_presence.sql',
    '0005_standing_orders.sql',
  ]) {
    const sql = await readFile(
      new URL(`../../apps/api/migrations/${migration}`, import.meta.url),
      'utf8',
    );
    await db.batch(
      sql
        .split(/;[ \t]*\n+(?=(?:CREATE|ALTER|INSERT)\b)/)
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.prepare(statement)),
    );
  }
});

afterAll(async () => {
  await runtime?.dispose();
});

beforeEach(async () => {
  rateAllowed = true;
  resetPassword.mockReset();
  identities.clear();
  provision.mockReset().mockImplementation(async ({ externalId, username }) => {
    const user = { id: 'user_redeemed', username };
    identities.set(externalId, user);
    return user;
  });
  await db.batch(
    [
      'reward_ledger',
      'character_skills',
      'standing_orders',
      'account_recovery',
      'audit_log',
      'invitations',
      'characters',
      'members',
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
  await db
    .prepare(
      `INSERT INTO members (id, guild_id, clerk_user_id, auth_username, role, status, joined_at)
    VALUES ('guild-admin', 'documentation-guild', 'user_admin', 'admin_user', 'admin', 'active', 0)`,
    )
    .run();
});

describe('guild accounts with local D1 and signed test identities', () => {
  it('checks the signature, issuer, audience, expiry, origin and active membership', async () => {
    const valid = tokenFor('user_admin');
    const badSignature = valid.replace(
      /\.([^.]*)$/,
      (_match, signature: string) => `.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`,
    );
    for (const auth of [
      undefined,
      badSignature,
      tokenFor('user_admin', { iss: 'https://other.test' }),
      tokenFor('user_admin', { aud: 'other' }),
      tokenFor('user_admin', { aud: undefined }),
      tokenFor('user_admin', { exp: 1 }),
      tokenFor('user_admin', { azp: undefined }),
      tokenFor('user_admin', { sts: 'pending' }),
    ]) {
      expect((await call('/me', { auth })).status).toBe(401);
    }
    expect((await call('/me', { auth: valid, origin: 'https://other.test' })).status).toBe(403);
    expect((await call('/me', { auth: tokenFor('user_outside') })).status).toBe(403);
    expect((await call('/me', { auth: valid })).status).toBe(200);
  });

  it('creates exactly one character from simultaneous redemption requests and hides the token', async () => {
    const invite = await createInvitation();
    const results = await Promise.all([redeem(invite.token), redeem(invite.token)]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(provision).toHaveBeenCalledTimes(1);
    expect((await redeem(invite.token)).status).toBe(409);
    expect(await db.prepare('SELECT token_hash AS hash FROM invitations').first('hash')).toBe(
      await hashInvite(invite.token),
    );
    const list = await call('/admin/invitations', { auth: tokenFor('user_admin') });
    const listing = await list.text();
    expect(listing).not.toContain(invite.token);
    expect(listing).not.toContain(await hashInvite(invite.token));
    const auth = tokenFor('user_redeemed');
    const response = await call('/me', { auth });
    expect(await response.json()).toMatchObject({
      role: 'member',
      character: { ...appearance, xp: 0, gold: 0, level: 1 },
    });
    expect((await call('/admin/invitations', { auth, method: 'POST' })).status).toBe(403);
  });

  it('reconciles a provider timeout after user creation without creating a second identity', async () => {
    const invite = await createInvitation();
    provision.mockImplementationOnce(async ({ externalId, username }) => {
      identities.set(externalId, { id: 'user_redeemed', username });
      throw new Error('Simulated timeout after provider committed');
    });
    expect((await redeem(invite.token)).status).toBe(409);
    expect((await call('/me', { auth: tokenFor('user_redeemed') })).status).toBe(403);
    await db.prepare('UPDATE invitations SET pending_until = 0').run();
    const otherUser = await call('/auth/redeem', {
      method: 'POST',
      body: { ...account, token: invite.token, username: 'other_user' },
    });
    expect(otherUser.status).toBe(409);
    expect((await redeem(invite.token)).status).toBe(201);
    expect(provision).toHaveBeenCalledTimes(1);
  });

  it('lets a duplicate username be corrected and denies expired, revoked or unknown links', async () => {
    const invite = await createInvitation();
    provision.mockRejectedValueOnce(new CredentialsRejected('USERNAME_TAKEN'));
    expect(await (await redeem(invite.token)).json()).toEqual({
      error: { code: 'USERNAME_TAKEN' },
    });
    expect((await redeem(invite.token)).status).toBe(201);
    const revoked = await createInvitation();
    expect(
      (
        await call(`/admin/invitations/${revoked.id}`, {
          method: 'DELETE',
          auth: tokenFor('user_admin'),
        })
      ).status,
    ).toBe(204);
    expect(await (await redeem(revoked.token)).json()).toEqual({
      error: { code: 'INVITE_REVOKED' },
    });
    const expired = await createInvitation();
    await db
      .prepare('UPDATE invitations SET issued_at = 0, expires_at = 1 WHERE id = ?')
      .bind(expired.id)
      .run();
    expect(await (await redeem(expired.token)).json()).toEqual({
      error: { code: 'INVITE_EXPIRED' },
    });
    expect((await redeem('a'.repeat(43))).status).toBe(404);
  });

  it('protects character edits, suspends and reinstates membership, and writes an audit entry', async () => {
    const invite = await createInvitation();
    expect((await redeem(invite.token)).status).toBe(201);
    const auth = tokenFor('user_redeemed');
    const me = (await (await call('/me', { auth })).json()) as { memberId: string };
    const changed = { ...appearance, hairStyle: 2, displayName: 'Ada Ink' };
    const profile = await call('/me/character', { method: 'PATCH', auth, body: changed });
    expect(await profile.json()).toMatchObject({ character: changed });
    expect(
      (await call('/me/character', { method: 'PATCH', auth, body: { ...changed, gold: 200 } }))
        .status,
    ).toBe(400);
    const admin = tokenFor('user_admin');
    const path = `/admin/members/${me.memberId}`;
    expect(
      (await call(path, { method: 'PATCH', auth: admin, body: { status: 'suspended' } })).status,
    ).toBe(204);
    expect((await call('/me', { auth })).status).toBe(403);
    expect(
      (await call(path, { method: 'PATCH', auth: admin, body: { status: 'active' } })).status,
    ).toBe(204);
    expect((await call('/me', { auth })).status).toBe(200);
    const audit = await (await call('/admin/audit', { auth: admin })).text();
    expect(audit).toContain('member.suspended');
    expect(audit).not.toContain(account.password);
    expect(audit).not.toContain(invite.token);
  });

  it('blocks public auth calls when the rate limit is reached', async () => {
    rateAllowed = false;
    expect((await redeem('a'.repeat(43))).status).toBe(429);
    expect(provision).not.toHaveBeenCalled();
  });

  it('issues a recovery link after admin verification and accepts it only once', async () => {
    const invite = await createInvitation();
    expect((await redeem(invite.token)).status).toBe(201);
    const auth = tokenFor('user_redeemed');
    const me = (await (await call('/me', { auth })).json()) as { memberId: string };
    const path = `/admin/members/${me.memberId}/recovery`;
    const admin = tokenFor('user_admin');
    expect(
      (await call(path, { method: 'POST', auth: admin, body: { recipientVerified: false } }))
        .status,
    ).toBe(400);
    expect(
      (await call(path, { method: 'POST', auth, body: { recipientVerified: true } })).status,
    ).toBe(403);
    const response = await call(path, {
      method: 'POST',
      auth: admin,
      body: { recipientVerified: true },
    });
    expect(response.status).toBe(201);
    const { url } = (await response.json()) as { url: string };
    const token = new URL(url).hash.slice('#/recover/'.length);
    const body = { token, password: 'SyntheticReplacementPassword123!' };
    const results = await Promise.all([
      call('/auth/recover', { method: 'POST', body }),
      call('/auth/recover', { method: 'POST', body }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([204, 410]);
    expect(resetPassword).toHaveBeenCalledExactlyOnceWith('user_redeemed', body.password);
    expect(await db.prepare('SELECT token_hash FROM account_recovery').first('token_hash')).toBe(
      await hashInvite(token),
    );
  });
});

async function progressionMember() {
  const invite = await createInvitation();
  expect((await redeem(invite.token)).status).toBe(201);
  const auth = tokenFor('user_redeemed');
  const read = async () =>
    (await (
      await call('/me', { auth })
    ).json()) as import('../../packages/shared/src').GuildProfile;
  const profile = await read();
  return { auth, read, memberId: profile.memberId };
}

it('settles one payout across concurrent requests and carries each skill’s partial cycle through switches', async () => {
  const { auth, read, memberId } = await progressionMember();
  const choose = (skill: string) =>
    call('/me/standing-order', { method: 'PUT', auth, body: { skill } });
  expect((await choose('Unknown')).status).toBe(400);
  const response = await choose('Scribing');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    character: { xp: 0, gold: 0, progression: { order: { skill: 'Scribing' } } },
  });
  const start = await db
    .prepare('SELECT accounted_at FROM standing_orders')
    .first<number>('accounted_at');
  if (start === null) throw new Error('Missing standing order');
  const tick = standingOrderInterval;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      settleStandingOrder(db, memberId, { now: start + tick, connectedSince: start }),
    ),
  );
  expect(await db.prepare('SELECT COUNT(*) AS count FROM reward_ledger').first('count')).toBe(1);
  await settleStandingOrder(db, memberId, {
    now: start + 1.5 * tick,
    connectedSince: start,
    skill: 'Research',
  });
  expect(await db.prepare('SELECT hall_station FROM characters').first('hall_station')).toBe(
    'Archives',
  );
  await settleStandingOrder(db, memberId, {
    now: start + 2.5 * tick,
    connectedSince: start,
    skill: 'Scribing',
  });
  await settleStandingOrder(db, memberId, { now: start + 3 * tick, connectedSince: start });
  expect(await read()).toMatchObject({
    character: {
      xp: 9,
      gold: 8,
      progression: {
        skills: { Scribing: { xp: 10 }, Research: { xp: 5 }, Restoration: { xp: 0 } },
      },
    },
  });
});

it('caps a seven-day absence across repeated settlements, then credits connected time', async () => {
  const { memberId } = await progressionMember();
  const start = Date.now() - 7 * offlineStandingOrderLimit;
  await settleStandingOrder(db, memberId, { now: start, skill: 'Restoration' });
  await settleStandingOrder(db, memberId, { now: start + offlineStandingOrderLimit / 2 });
  await settleStandingOrder(db, memberId, { now: start + 5 * offlineStandingOrderLimit });
  const returnAt = start + 7 * offlineStandingOrderLimit;
  await settleStandingOrder(db, memberId, { now: returnAt, connectedSince: returnAt });
  expect(await db.prepare('SELECT gold, total_xp FROM characters').first()).toEqual({
    gold: 576,
    total_xp: 864,
  });
  await settleStandingOrder(db, memberId, {
    now: returnAt + standingOrderInterval,
    connectedSince: returnAt,
  });
  expect(await db.prepare('SELECT gold, total_xp FROM characters').first()).toEqual({
    gold: 578,
    total_xp: 867,
  });
  expect(await db.prepare('SELECT xp FROM character_skills').first('xp')).toBe(1445);
});

it('does not apply the offline cap to continuous hall presence', async () => {
  const { memberId } = await progressionMember();
  const start = Date.now() - 2 * offlineStandingOrderLimit;
  await settleStandingOrder(db, memberId, { now: start, skill: 'Scribing' });
  await settleStandingOrder(db, memberId, {
    now: start + 2 * offlineStandingOrderLimit,
    connectedSince: start,
  });
  expect(await db.prepare('SELECT total_xp FROM characters').first('total_xp')).toBe(1728);
});
