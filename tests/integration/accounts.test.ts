import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clerkIdentity, CredentialsRejected } from '../../apps/api/src/accounts/identity';
import type { IdentityProvider, ProvisionedUser } from '../../apps/api/src/accounts/identity';
import { hashInvite, type invitationState } from '../../apps/api/src/accounts/invitations';
import { accountRoutes } from '../../apps/api/src/accounts/routes';
import { settleStandingOrder } from '../../apps/api/src/progression/standing-orders';
import { characterXpForLevel, standingOrderInterval } from '../../packages/shared/src';

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
    '0006_character_training.sql',
    '0007_guild_business.sql',
    '0008_expeditions.sql',
    '0009_guild_activity.sql',
    '0010_player_guidance.sql',
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
      'guild_renown_milestones',
      'expedition_invites',
      'expedition_chronicle',
      'expedition_events',
      'expedition_members',
      'expedition_parties',
      'personal_discoveries',
      'business_cases',
      'training_purchases',
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

it('pauses with three minutes left, earns nothing while away, and resumes the saved cycle', async () => {
  const { memberId, read } = await progressionMember();
  const minute = 60_000;
  const start = Date.now() - 7 * 24 * 60 * minute;
  const closedAt = start + 2 * minute;
  const returnAt = Date.now();
  await settleStandingOrder(db, memberId, { now: start, skill: 'Research' });
  await settleStandingOrder(db, memberId, {
    now: closedAt,
    connectedSince: start,
    checkpoint: true,
  });
  await settleStandingOrder(db, memberId, { now: returnAt - minute });
  expect(await read()).toMatchObject({
    character: {
      xp: 0,
      gold: 0,
      progression: { order: { skill: 'Research', remainingMs: 180_000, running: false } },
    },
  });
  await settleStandingOrder(db, memberId, {
    now: returnAt + 3 * minute - 1,
    connectedSince: returnAt,
  });
  expect(await db.prepare('SELECT COUNT(*) AS count FROM reward_ledger').first('count')).toBe(0);
  await Promise.all(
    [1, 2].map(() =>
      settleStandingOrder(db, memberId, {
        now: returnAt + 3 * minute,
        connectedSince: returnAt,
      }),
    ),
  );
  expect(await read()).toMatchObject({
    character: {
      xp: 3,
      gold: 2,
      progression: { skills: { Research: { xp: 5 } } },
    },
  });
});

it('continues earning during uninterrupted hall presence', async () => {
  const { memberId } = await progressionMember();
  const twoDays = 2 * 24 * 60 * 60_000;
  const start = Date.now() - twoDays;
  await settleStandingOrder(db, memberId, { now: start, skill: 'Scribing' });
  await settleStandingOrder(db, memberId, { now: start + twoDays, connectedSince: start });
  expect(await db.prepare('SELECT total_xp FROM characters').first('total_xp')).toBe(1728);
});

it('charges training ranks once, rejects stale purchases and preserves gold on rejection', async () => {
  const { auth, read } = await progressionMember();
  const buy = (expectedRank: number) =>
    call('/me/training/efficient_scribing', {
      auth,
      method: 'POST',
      body: { expectedRank },
    });
  await db.prepare('UPDATE characters SET gold = 650').run();
  expect((await buy(0)).status).toBe(409);
  await db.prepare('UPDATE characters SET total_xp = ?').bind(characterXpForLevel(3)).run();
  expect((await Promise.all([buy(0), buy(0)])).map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect((await buy(1)).status).toBe(200);
  expect((await buy(2)).status).toBe(200);
  expect((await buy(3)).status).toBe(400);
  expect((await buy(2)).status).toBe(409);
  expect(await read()).toMatchObject({
    character: { gold: 0, progression: { training: { efficient_scribing: 3 } } },
  });
  const other = await call('/me/training/steady_hands', {
    auth,
    method: 'POST',
    body: { expectedRank: 0 },
  });
  expect(other.status).toBe(409);
});

it('settles before choosing Chronicler and enforces the paid specialization cooldown', async () => {
  const { auth, read, memberId } = await progressionMember();
  const choose = (specialization: string, expected: string | null) =>
    call('/me/specialization', {
      auth,
      method: 'POST',
      body: { specialization, expected },
    });
  expect((await choose('Chronicler', null)).status).toBe(409);
  const start = Date.now() - 8 * standingOrderInterval;
  await settleStandingOrder(db, memberId, { now: start, skill: 'Scribing' });
  await db
    .prepare('UPDATE characters SET total_xp = ?, gold = 500')
    .bind(characterXpForLevel(10))
    .run();
  await settleStandingOrder(db, memberId, {
    now: start + 8 * standingOrderInterval,
    connectedSince: start,
  });
  expect((await choose('Chronicler', null)).status).toBe(200);
  expect(await db.prepare('SELECT gold FROM characters').first('gold')).toBe(524);
  const settled = await db
    .prepare('SELECT accounted_at FROM standing_orders')
    .first<number>('accounted_at');
  if (settled === null) throw new Error('Missing order');
  await settleStandingOrder(db, memberId, {
    now: settled + 10 * standingOrderInterval,
    connectedSince: settled,
  });
  expect(await db.prepare('SELECT gold FROM characters').first('gold')).toBe(557);
  expect((await choose('Editor', 'Chronicler')).status).toBe(200);
  expect((await choose('Warden', 'Editor')).status).toBe(409);
  expect(await read()).toMatchObject({
    character: {
      gold: 357,
      progression: { specialization: 'Editor', skills: { Scribing: { xp: 90 } } },
    },
  });
  await db.prepare('UPDATE characters SET specialization_switched_at = 0').run();
  expect((await choose('Warden', 'Editor')).status).toBe(200);
  expect(await db.prepare('SELECT gold FROM characters').first('gold')).toBe(157);
});

it('preserves old puzzles and applies the same preview, payout, and rolling allowance atomically', async () => {
  const { auth, read, memberId } = await progressionMember();
  const character = (await read()).character!.id;
  const { businessBoard, submitBusinessCase } =
    await import('../../apps/api/src/business/business');
  const board = async () => {
    const res = await call('/business', { auth });
    expect(res.status).toBe(200);
    return (await res.json()) as import('../../packages/shared/src').BusinessBoard;
  };
  const send = (id: string, answer: import('../../packages/shared/src').BusinessAnswer) =>
    call(`/business/${id}/submit`, { auth, method: 'POST', body: answer });
  const id = crypto.randomUUID();
  const firstChoice = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE characters SET specialization = 'Editor' WHERE id = ?").bind(character),
    db
      .prepare(
        "INSERT INTO training_purchases (character_id, upgrade_key, rank) VALUES (?, 'efficient_scribing', 3), (?, 'careful_research', 2)",
      )
      .bind(character, character),
    db
      .prepare(
        "INSERT INTO business_cases (id, character_id, position, template_key, seed, attempts) VALUES (?, ?, 4, 'pages_in_order', 0, 2), (?, ?, 5, 'market_map', 0, 0)",
      )
      .bind(id, character, firstChoice, character),
  ]);
  const [first, other] = await Promise.all([board(), board()]);
  expect(first).toEqual(other);
  expect(first.cases).toHaveLength(3);
  expect(first.allowance).toEqual({ limit: 8, remaining: 8, nextAt: null });
  expect(JSON.stringify(first)).not.toMatch(/template_key|seed|solution/);
  const legacy = first.cases.find((item) => item.id === id)!;
  expect(legacy).toMatchObject({
    type: 'sequence',
    attempts: 2,
    preview: { xp: 20, skillXp: 10, gold: 14 },
  });
  if (legacy.type !== 'sequence') throw Error('Expected the retained puzzle');
  expect(
    (
      await call(`/business/${id}/submit`, {
        auth: tokenFor('user_admin'),
        method: 'POST',
        body: { type: 'sequence', tiles: [1, 2, 3, 4] },
      })
    ).status,
  ).toBe(404);
  const wrong = () => send(id, { type: 'sequence', tiles: legacy.tiles });
  expect(await (await wrong()).json()).toMatchObject({ status: 'retry', attempts: 3 });
  expect(await (await wrong()).json()).toMatchObject({ status: 'retry', attempts: 3 });
  const retry = (await board()).cases.find((item) => item.id === id)!;
  expect(retry.preview).toMatchObject({ xp: 15, skillXp: 7, gold: 11, retryPenalty: true });
  await db.prepare('UPDATE business_cases SET retry_at = 0 WHERE id = ?').bind(id).run();
  const answer = { type: 'sequence', tiles: [...legacy.tiles].sort((a, b) => a - b) } as const;
  const solve = () => send(id, { type: answer.type, tiles: [...answer.tiles] });
  const [left, right] = await Promise.all([solve(), solve()]);
  const result = await left.json();
  expect(await right.json()).toEqual(result);
  expect(result).toMatchObject({
    status: 'completed',
    reward: {
      xp: 15,
      skillXp: 7,
      gold: 11,
      full: true,
      discovery: { rarity: 'common', known: false },
    },
  });

  const choice = (await board()).cases.find((item) => item.id === firstChoice)!;
  if (choice.type !== 'choice') throw Error('Expected the tradeoff case');
  const effectId = (effect: string) =>
    choice.options.find((option) => option.effect === effect)!.id;
  expect(choice.choicePreviews?.[effectId('guaranteed_gold')]).toMatchObject({ gold: 19 });
  expect(choice.choicePreviews?.[effectId('renown_bonus')]).toMatchObject({ gold: 14, renown: 5 });
  expect(choice.choicePreviews?.[effectId('discovery_roll')]).toMatchObject({
    discoveryChance: 20,
    newDiscoveryChance: expect.closeTo((20 * 11) / 12),
  });
  expect(
    await (await send(firstChoice, { type: 'choice', option: effectId('renown_bonus') })).json(),
  ).toMatchObject({
    reward: { renown: 5, discovery: { key: 'unending_footnote', known: true } },
  });
  expect(
    await db
      .prepare('SELECT COUNT(*) AS count FROM personal_discoveries WHERE character_id = ?')
      .bind(character)
      .first('count'),
  ).toBe(1);

  const at = Date.now();
  await db.batch(
    Array.from({ length: 6 }, (_, index) =>
      db
        .prepare("INSERT INTO reward_ledger VALUES (?, 'business', ?, 'Scribing', 20, 10, 12, ?)")
        .bind(character, `mature-${index}`, at - 86_400_000 + 10_000 + index * 1000),
    ),
  );
  const exhausted = await businessBoard(db, memberId, at);
  expect(exhausted?.allowance).toEqual({ limit: 8, remaining: 0, nextAt: at + 10_000 });
  expect(
    exhausted?.cases.every(
      ({ preview }) =>
        !preview.full &&
        preview.xp === 5 &&
        preview.gold === 2 &&
        preview.skillXp === 0 &&
        preview.renown === 0 &&
        preview.discoveryChance === 0,
    ),
  ).toBe(true);

  const reduced = crypto.randomUUID();
  const member = (await read()).memberId;
  await db
    .prepare(
      'UPDATE business_cases SET completed_at = ? WHERE character_id = ? AND completed_at IS NULL',
    )
    .bind(at, character)
    .run();
  await db
    .prepare(
      "INSERT INTO business_cases (id, character_id, position, template_key, seed) VALUES (?, ?, 100, 'fog_ribbons', 0)",
    )
    .bind(reduced, character)
    .run();
  const ready = await businessBoard(db, member, at);
  const reducedChoice = ready?.cases.find((item) => item.id === reduced);
  if (!reducedChoice?.choicePreviews) throw Error('Expected choice previews');
  expect(
    Object.values(reducedChoice.choicePreviews).every(
      (value) => !value.full && value.renown === 0 && value.discoveryChance === 0,
    ),
  ).toBe(true);
  expect(
    await submitBusinessCase(db, member, reduced, { type: 'choice', option: 2 }, at + 9999),
  ).toMatchObject({
    reward: { xp: 5, skillXp: 0, gold: 2, renown: 0, full: false, discovery: null },
  });
  expect((await businessBoard(db, member, at + 10_000))?.allowance.remaining).toBe(1);
  await db.prepare('UPDATE guilds SET renown = 0').run();
});

it('starts new characters with an optional tour and preserves its status through edits', async () => {
  const { auth, read } = await progressionMember();
  expect((await read()).character?.tutorialStatus).toBe('pending');
  expect((await call('/me/tutorial', { method: 'PUT' })).status).toBe(401);
  expect((await call('/me/tutorial', { method: 'PUT', auth })).status).toBe(204);
  expect((await call('/me/tutorial', { method: 'PUT', auth })).status).toBe(204);
  expect((await read()).character?.tutorialStatus).toBe('done');
  await db.prepare('UPDATE characters SET tutorial_status = NULL').run();
  expect((await call('/me/character', { method: 'PATCH', auth, body: appearance })).status).toBe(
    200,
  );
  expect((await read()).character?.tutorialStatus).toBeNull();
});

it('keeps the journal and recap private and pages through guild-safe activity', async () => {
  const admin = tokenFor('user_admin');
  const invite = await createInvitation();
  expect((await redeem(invite.token)).status).toBe(201);
  const player = tokenFor('user_redeemed');
  const profile = (await (
    await call('/me', { auth: player })
  ).json()) as import('../../packages/shared/src').GuildProfile;
  const character = profile.character!.id;
  const at = Date.now() - 1000;
  await db.batch([
    db
      .prepare(
        "INSERT INTO personal_discoveries VALUES (?, 'echoing_index', 'business', 'case-1', ?)",
      )
      .bind(character, at),
    db
      .prepare(
        "INSERT INTO personal_discoveries VALUES (?, 'library_within', 'expedition_event', 'party-1:0', ?)",
      )
      .bind(character, at),
    db
      .prepare(
        "INSERT INTO reward_ledger VALUES (?, 'standing_order', '1', 'Scribing', 3, 5, 3, ?)",
      )
      .bind(character, at),
    db.prepare('UPDATE guilds SET renown = 0'),
    db.prepare('UPDATE guilds SET renown = 350'),
    ...Array.from({ length: 23 }, (_, index) =>
      db
        .prepare(
          `INSERT INTO expedition_parties (id, mission, chapter, leader_id, leader_since, state, seed, created_at, ends_at, baseline_renown)
       VALUES (?, 'missing_pages', 'chapter1', 'guild-admin', 0, 'completed', 1, 0, ?, 20)`,
        )
        .bind('public-party-' + index, at),
    ),
    db
      .prepare(
        "INSERT INTO expedition_parties (id, mission, chapter, leader_id, leader_since, state, seed, created_at, ends_at) VALUES ('stale-party', 'missing_pages', 'chapter1', 'guild-admin', 0, 'completed', 1, 0, ?)",
      )
      .bind(at - 31 * 86_400_000),
    db.prepare(
      "INSERT INTO expedition_chronicle VALUES ('missing_chapter', 'chapter1', 'public-party-0')",
    ),
  ]);
  for (const path of ['/me/journal', '/me/recap', '/guild/feed']) {
    expect((await call(path)).status).toBe(401);
    expect((await call(path, { auth: tokenFor('user_outside') })).status).toBe(403);
  }
  const journalResponse = await call('/me/journal', { auth: player });
  expect(journalResponse.status).toBe(200);
  const journal =
    (await journalResponse.json()) as import('../../packages/shared/src').GuildJournal;
  expect(journal.discoveries.map(({ key }) => key).sort()).toEqual([
    'echoing_index',
    'library_within',
    'missing_chapter',
  ]);
  expect(
    journal.chains
      .find(({ key }) => key === 'catalog_mystery')
      ?.discoveries.map(({ step }) => step),
  ).toEqual([1, 3]);
  expect(journal.chronicle).toHaveLength(1);
  expect(journal.chronicle[0]?.scenes).toHaveLength(2);
  expect(await (await call('/me/journal', { auth: admin })).json()).toMatchObject({
    discoveries: [{ key: 'missing_chapter', source: 'chronicle' }],
  });
  const recap = await (await call(`/me/recap?since=${at}`, { auth: player })).json();
  expect(recap).toMatchObject({ standing: { xp: 3, skillXp: 5, gold: 3 }, discoveries: 2 });
  expect(await (await call(`/me/recap?since=${at}`, { auth: admin })).json()).toMatchObject({
    standing: { xp: 0, skillXp: 0, gold: 0 },
    discoveries: 0,
    milestones: 3,
  });
  expect((await call('/me/recap?since=bad', { auth: admin })).status).toBe(400);
  const feedResponse = await call('/guild/feed', { auth: admin });
  expect(feedResponse.status).toBe(200);
  const feed = (await feedResponse.json()) as import('../../packages/shared/src').GuildFeed;
  expect(feed.entries).toHaveLength(20);
  expect(feed.renown).toBe(350);
  expect(feed.next).toBeTypeOf('string');
  const next = (await (
    await call('/guild/feed?before=' + encodeURIComponent(feed.next!), { auth: player })
  ).json()) as typeof feed;
  expect(next.next).toBeNull();
  const all = [...feed.entries, ...next.entries];
  expect(new Set(all.map(({ id }) => id)).size).toBe(26);
  expect(all.map(({ id }) => id)).not.toContain('expedition:stale-party');
  expect(all.map(({ id }) => id)).toContain('renown:300');
  expect(JSON.stringify(all)).not.toContain('The Library Within');
  expect((await call('/guild/feed?before=invalid', { auth: player })).status).toBe(400);
});
