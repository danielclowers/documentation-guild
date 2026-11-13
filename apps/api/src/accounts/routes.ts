import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import {
  characterLevel,
  characterSchema,
  inviteTokenSchema,
  hallStations,
  passwordSchema,
  skillSchema,
  specializationKeys,
  trainingKeys,
  usernameSchema,
} from '@guild/shared';
import type { GuildMember, GuildProfile, MemberRole } from '@guild/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { clerkIdentity, type ClerkBindings } from './identity';
import {
  hashInvite,
  invitationState,
  INVITE_LIFETIME,
  publicInvitation,
  randomInviteToken,
  redeemInvitation,
} from './invitations';

import { guildRoom, notifyHall, settleGuildMember, type HallBindings } from '../realtime/hall-data';
import { characterProgression } from '../progression/standing-orders';
import { businessAnswerSchema } from '../business/cases';
import { businessBoard, submitBusinessCase } from '../business/business';
import { chooseSpecialization, purchaseTraining } from '../progression/training';

interface Bindings extends ClerkBindings, HallBindings {
  WEB_URL?: string;
  ALLOWED_ORIGINS?: string;
  AUTH_RATE_LIMIT?: RateLimit;
}

type Membership = { id: string; role: MemberRole };
type AccountEnv = { Bindings: Bindings; Variables: { member: Membership } };
const redeemSchema = z.strictObject({
  token: inviteTokenSchema,
  username: usernameSchema,
  password: passwordSchema,
  character: characterSchema,
});
const tokenSchema = z.strictObject({ token: inviteTokenSchema });
const recoverySchema = tokenSchema.extend({ password: passwordSchema });
const memberStatusSchema = z.strictObject({ status: z.enum(['active', 'suspended']) });
const RECOVERY_LIFETIME = 30 * 60_000;

function allowedOrigins(env: Bindings): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function guildWebUrl(env: Bindings): URL | null {
  if (!env.WEB_URL) return null;
  const link = new URL(env.WEB_URL);
  if (
    !allowedOrigins(env).includes(link.origin) ||
    link.search ||
    link.hash ||
    link.username ||
    link.password
  )
    return null;
  if (
    link.protocol === 'https:' ||
    (link.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(link.hostname))
  )
    return link;
  return null;
}

async function parseBody<T>(c: Context<AccountEnv>, schema: z.ZodType<T>) {
  if (c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return null;
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function getProfile(
  db: D1Database,
  member: Membership,
  connectedSince?: number,
): Promise<GuildProfile> {
  const character = await db
    .prepare(
      `SELECT id, display_name AS displayName, hair_style AS hairStyle,
    hair_color AS hairColor, tunic_color AS tunicColor, total_xp AS xp, gold FROM characters WHERE member_id = ?`,
    )
    .bind(member.id)
    .first<Omit<NonNullable<GuildProfile['character']>, 'level' | 'progression'>>();
  return {
    memberId: member.id,
    role: member.role,
    character: character && {
      ...character,
      level: characterLevel(character.xp),
      progression: await characterProgression(db, character.id, connectedSince),
    },
  };
}

function audit(
  db: D1Database,
  actorId: string,
  action: string,
  objectId: string,
  now: number,
  changedOnly = false,
) {
  return db
    .prepare(
      `INSERT INTO audit_log (id, actor_member_id, action, object_id, created_at)
    SELECT ?, ?, ?, ?, ?${changedOnly ? ' WHERE changes() = 1' : ''}`,
    )
    .bind(crypto.randomUUID(), actorId, action, objectId, now);
}

export function accountRoutes(makeIdentity = clerkIdentity) {
  const router = new Hono<AccountEnv>();

  router.use('*', async (c, next) => {
    const origins = allowedOrigins(c.env);
    const origin = c.req.header('Origin');
    if (origin && !origins.includes(origin))
      return c.json({ error: { code: 'ORIGIN_DENIED' } }, 403);
    if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') return next();
    return cors({
      origin: origins,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    })(c, next);
  });
  router.use(
    '*',
    bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: { code: 'INVALID_INPUT' } }, 413) }),
  );
  router.use('/auth/*', async (c, next) => {
    if (!c.env.AUTH_RATE_LIMIT) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const key = c.req.header('CF-Connecting-IP') ?? 'local';
    if (!(await c.env.AUTH_RATE_LIMIT.limit({ key })).success) {
      c.header('Retry-After', '60');
      return c.json({ error: { code: 'RATE_LIMITED' } }, 429);
    }
    return next();
  });

  router.get('/realtime/socket', async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.body(null, 426);
    if (!c.req.header('Origin')) return c.body(null, 403);
    const room = guildRoom(c.env);
    if (!room) return c.body(null, 503);
    const request = new Request('https://guild-room.internal/connect', {
      headers: c.req.raw.headers,
    });
    return (await room.fetch(
      request as unknown as Parameters<typeof room.fetch>[0],
    )) as unknown as Response;
  });

  router.post('/auth/invitation-status', async (c) => {
    const input = await parseBody(c, tokenSchema);
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    return c.json({
      status: await invitationState(c.env.DB, await hashInvite(input.token), Date.now()),
    });
  });

  router.post('/auth/recover', async (c) => {
    const input = await parseBody(c, recoverySchema);
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const identity = makeIdentity(c.env, allowedOrigins(c.env));
    if (!identity) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const now = Date.now();
    const recovery = await c.env.DB.prepare(
      `UPDATE account_recovery SET used_at = ?
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM members WHERE id = member_id AND status = 'active')
      RETURNING (SELECT clerk_user_id FROM members WHERE id = member_id) AS userId`,
    )
      .bind(now, await hashInvite(input.token), now)
      .first<{ userId: string }>();
    if (!recovery) return c.json({ error: { code: 'RECOVERY_INVALID' } }, 410);
    try {
      await identity.resetPassword(recovery.userId, input.password);
    } catch {
      // The provider can commit before a response fails. A replacement link is required.
      return c.json({ error: { code: 'RECOVERY_FAILED' } }, 409);
    }
    return c.body(null, 204);
  });

  router.post('/auth/redeem', async (c) => {
    const input = await parseBody(c, redeemSchema);
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const identity = makeIdentity(c.env, allowedOrigins(c.env));
    if (!identity) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const outcome = await redeemInvitation(
      c.env.DB,
      identity,
      await hashInvite(input.token),
      input,
    );
    switch (outcome) {
      case 'created':
        return c.json({ status: 'created' }, 201);
      case 'invalid':
        return c.json({ error: { code: 'INVITE_INVALID' } }, 404);
      case 'revoked':
      case 'expired':
        return c.json(
          { error: { code: outcome === 'revoked' ? 'INVITE_REVOKED' : 'INVITE_EXPIRED' } },
          410,
        );
      case 'consumed':
        return c.json({ error: { code: 'INVITE_CONSUMED' } }, 409);
      case 'USERNAME_TAKEN':
        return c.json({ error: { code: outcome } }, 409);
      case 'CREDENTIALS_REJECTED':
        return c.json({ error: { code: outcome } }, 422);
      default:
        return c.json({ error: { code: 'INVITE_PENDING' } }, 409);
    }
  });

  const members = new Hono<AccountEnv>();
  members.use('*', async (c, next) => {
    const token = /^Bearer (\S{1,8192})$/i.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const identity = makeIdentity(c.env, allowedOrigins(c.env));
    if (!identity) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const clerkId = await identity.authenticate(token, c.req.header('Origin'));
    if (!clerkId) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const member = await c.env.DB.prepare(
      `SELECT id, role FROM members
      WHERE clerk_user_id = ? AND status = 'active' AND guild_id = 'documentation-guild'`,
    )
      .bind(clerkId)
      .first<Membership>();
    if (!member) return c.json({ error: { code: 'NOT_MEMBER' } }, 403);
    c.set('member', member);
    return next();
  });

  members.post('/realtime/ticket', async (c) => {
    const origin = c.req.header('Origin');
    if (!origin || !guildRoom(c.env)) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const now = Date.now();
    const token = randomInviteToken();
    const [, inserted] = await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM hall_tickets WHERE expires_at <= ?').bind(now),
      c.env.DB.prepare(
        `INSERT INTO hall_tickets (token_hash, member_id, origin, expires_at)
        SELECT ?, m.id, ?, ? FROM members m JOIN characters ch ON ch.member_id = m.id
        WHERE m.id = ? AND m.status = 'active' AND
          (SELECT COUNT(*) FROM hall_tickets WHERE member_id = m.id) < 8`,
      ).bind(await hashInvite(token), origin, now + 30_000, c.var.member.id),
    ]);
    if (inserted?.meta.changes !== 1) return c.json({ error: { code: 'INVALID_STATE' } }, 409);
    return c.json({ ticket: token });
  });

  members.put('/me/hall-station', async (c) => {
    const input = await parseBody(c, z.strictObject({ station: z.enum(hallStations) }));
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const memberId = c.var.member.id;
    const result = await c.env.DB.prepare(
      `UPDATE characters SET hall_station = ?, hall_station_at = ?
      WHERE member_id = ? AND hall_station <> ? AND EXISTS
        (SELECT 1 FROM members WHERE id = ? AND status = 'active')`,
    )
      .bind(input.station, Date.now(), memberId, input.station, memberId)
      .run();
    if (result.meta.changes) await notifyHall(c.env, memberId).catch(() => undefined);
    return c.body(null, 204);
  });

  members.get('/me', async (c) => {
    const connectedSince = await settleGuildMember(c.env, c.var.member.id);
    return c.json(await getProfile(c.env.DB, c.var.member, connectedSince));
  });

  members.put('/me/standing-order', async (c) => {
    const input = await parseBody(c, z.strictObject({ skill: skillSchema }));
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const connectedSince = await settleGuildMember(c.env, c.var.member.id, input.skill);
    return c.json(await getProfile(c.env.DB, c.var.member, connectedSince));
  });
  members.post('/me/training/:key', async (c) => {
    const key = z.enum(trainingKeys).safeParse(c.req.param('key'));
    const input = await parseBody(c, z.strictObject({ expectedRank: z.int().min(0).max(2) }));
    if (!key.success || !input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const member = c.var.member;
    const connectedSince = await settleGuildMember(c.env, member.id);
    if (!(await purchaseTraining(c.env.DB, member.id, key.data, input.expectedRank))) {
      return c.json({ error: { code: 'TRAINING_UNAVAILABLE' } }, 409);
    }
    return c.json(await getProfile(c.env.DB, member, connectedSince));
  });

  members.post('/me/specialization', async (c) => {
    const key = z.enum(specializationKeys);
    const input = await parseBody(
      c,
      z.strictObject({ specialization: key, expected: key.nullable() }),
    );
    if (!input || input.specialization === input.expected)
      return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const member = c.var.member;
    const connectedSince = await settleGuildMember(c.env, member.id);
    if (!(await chooseSpecialization(c.env.DB, member.id, input.specialization, input.expected))) {
      return c.json({ error: { code: 'SPECIALIZATION_UNAVAILABLE' } }, 409);
    }
    return c.json(await getProfile(c.env.DB, member, connectedSince));
  });

  members.get('/business', async (c) => {
    const cases = await businessBoard(c.env.DB, c.var.member.id);
    if (!cases) return c.json({ error: { code: 'INVALID_STATE' } }, 409);
    return c.json({ cases });
  });

  members.post('/business/:id/submit', async (c) => {
    const input = await parseBody(c, businessAnswerSchema);
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!input || !id.success) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const memberId = c.var.member.id;
    const result = await submitBusinessCase(c.env.DB, memberId, id.data, input);
    if (!result) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    if (result === 'invalid') return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    if (result.status === 'completed') await notifyHall(c.env, memberId).catch(() => undefined);
    return c.json(result);
  });

  members.patch('/me/character', async (c) => {
    const input = await parseBody(c, characterSchema);
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const { displayName, hairStyle, hairColor, tunicColor } = input;
    await c.env.DB.prepare(
      `INSERT INTO characters (id, member_id, display_name, hair_style, hair_color, tunic_color)
      SELECT ?, id, ?, ?, ?, ? FROM members WHERE id = ? AND status = 'active'
      ON CONFLICT (member_id) DO UPDATE SET display_name = excluded.display_name, hair_style = excluded.hair_style,
      hair_color = excluded.hair_color, tunic_color = excluded.tunic_color, version = version + 1`,
    )
      .bind(crypto.randomUUID(), displayName, hairStyle, hairColor, tunicColor, c.var.member.id)
      .run();
    await notifyHall(c.env, c.var.member.id).catch(() => undefined);
    const connectedSince = await settleGuildMember(c.env, c.var.member.id);
    return c.json(await getProfile(c.env.DB, c.var.member, connectedSince));
  });

  members.use('/admin/*', async (c, next) => {
    if (c.var.member.role !== 'admin') return c.json({ error: { code: 'FORBIDDEN' } }, 403);
    return next();
  });

  members.post('/admin/invitations', async (c) => {
    const link = guildWebUrl(c.env);
    if (!link) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const id = crypto.randomUUID();
    const token = randomInviteToken();
    const now = Date.now();
    const expiresAt = now + INVITE_LIFETIME;
    link.hash = `/redeem/${token}`;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO invitations (id, token_hash, issued_by, issued_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, await hashInvite(token), c.var.member.id, now, expiresAt),
      audit(c.env.DB, c.var.member.id, 'invitation.issued', id, now),
    ]);
    return c.json({ id, expiresAt, url: link.href }, 201);
  });

  members.get('/admin/invitations', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, status, issued_at, expires_at, used_at
      FROM invitations ORDER BY issued_at DESC, id DESC LIMIT 100`,
    ).all<Parameters<typeof publicInvitation>[0]>();
    const now = Date.now();
    return c.json({ invitations: results.map((row) => publicInvitation(row, now)) });
  });

  members.delete('/admin/invitations/:id', async (c) => {
    const { id } = c.req.param();
    const now = Date.now();
    const [update] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE invitations SET status = 'revoked', revoked_at = ?, pending_until = NULL
        WHERE id = ? AND status IN ('issued', 'pending') AND expires_at > ?`,
      ).bind(now, id, now),
      audit(c.env.DB, c.var.member.id, 'invitation.revoked', id, now, true),
    ]);
    if (update?.meta.changes !== 1) return c.json({ error: { code: 'INVALID_STATE' } }, 409);
    return c.body(null, 204);
  });

  members.get('/admin/members', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT m.id, m.auth_username AS username,
      ch.display_name AS displayName, m.role, m.status FROM members m LEFT JOIN characters ch ON ch.member_id = m.id
      WHERE m.guild_id = 'documentation-guild' ORDER BY m.auth_username LIMIT 100`,
    ).all<GuildMember>();
    return c.json({ members: results });
  });

  members.patch('/admin/members/:id', async (c) => {
    const input = await parseBody(c, memberStatusSchema);
    if (!input) return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    const { id } = c.req.param();
    const [update] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE members SET status = ? WHERE id = ? AND role = 'member'
        AND guild_id = 'documentation-guild' AND status <> ?`,
      ).bind(input.status, id, input.status),
      audit(c.env.DB, c.var.member.id, `member.${input.status}`, id, Date.now(), true),
    ]);
    if (update?.meta.changes !== 1) return c.json({ error: { code: 'INVALID_STATE' } }, 409);
    if (input.status === 'suspended') await notifyHall(c.env, id, true).catch(() => undefined);
    return c.body(null, 204);
  });

  members.get('/admin/audit', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT action, object_id AS objectId, actor_member_id AS actorId,
      created_at AS createdAt FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 50`,
    ).all();
    return c.json({ entries: results });
  });

  members.post('/admin/members/:id/recovery', async (c) => {
    if (!(await parseBody(c, z.strictObject({ recipientVerified: z.literal(true) })))) {
      return c.json({ error: { code: 'INVALID_INPUT' } }, 400);
    }
    const link = guildWebUrl(c.env);
    if (!link) return c.json({ error: { code: 'UNAVAILABLE' } }, 503);
    const memberId = c.req.param('id');
    const now = Date.now();
    const expiresAt = now + RECOVERY_LIFETIME;
    const token = randomInviteToken();
    const [, inserted] = await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE account_recovery SET used_at = ? WHERE member_id = ? AND used_at IS NULL',
      ).bind(now, memberId),
      c.env.DB.prepare(
        `INSERT INTO account_recovery (id, member_id, issued_by, token_hash, expires_at)
        SELECT ?, id, ?, ?, ? FROM members WHERE id = ? AND role = 'member' AND status = 'active'`,
      ).bind(crypto.randomUUID(), c.var.member.id, await hashInvite(token), expiresAt, memberId),
      audit(c.env.DB, c.var.member.id, 'recovery.issued', memberId, now, true),
    ]);
    if (inserted?.meta.changes !== 1) return c.json({ error: { code: 'INVALID_STATE' } }, 409);
    link.hash = `/recover/${token}`;
    return c.json({ url: link.href, expiresAt }, 201);
  });

  router.route('/', members);
  router.onError((_error, c) => c.json({ error: { code: 'UNAVAILABLE' } }, 503));
  return router;
}
