import { execFile } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { HallMember, HallMessage } from '../../packages/shared/src';
import { convertV4MiniflareOptions, Miniflare, type WebSocket } from 'miniflare';
import { afterAll, beforeAll, expect, it } from 'vitest';

const origin = 'https://guild.example.test';
const issuer = 'https://clerk.example.test';
const audience = 'documentation-guild-api';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
let runtime: Miniflare;
let output: string;
const sockets: WebSocket[] = [];

function bearer(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    aud: audience,
    azp: origin,
    sid: `sess_${id}`,
    sub: `user_${id}`,
    iat: now,
    nbf: now - 1,
    exp: now + 60,
  };
  const unsigned = [{ alg: 'RS256', typ: 'JWT' }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  return `Bearer ${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'guild-hall-test-'));
  const apiDir = fileURLToPath(new URL('../../apps/api', import.meta.url));
  const wrangler = join(apiDir, 'node_modules/wrangler/bin/wrangler.js');
  await promisify(execFile)(
    process.execPath,
    [wrangler, 'deploy', '--dry-run', '--outdir', output],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG_PATH: join(output, 'wrangler.log'),
      },
    },
  );
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: (await readFile(join(output, 'index.js'), 'utf8')).replace(
        /^\/\/# sourceMappingURL=.*$/m,
        '',
      ),
      compatibilityDate: '2026-07-01',
      durableObjects: { GUILD_ROOM: { className: 'GuildRoom', useSQLite: true } },
      d1Databases: ['DB'],
      bindings: {
        ALLOWED_ORIGINS: origin,
        CLERK_ISSUER: issuer,
        CLERK_AUDIENCE: audience,
        CLERK_SECRET_KEY: 'test-fixture',
        CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    }),
  );
  const db = await runtime.getD1Database('DB');
  const migrations = join(apiDir, 'migrations');
  for (const file of (await readdir(migrations)).sort()) {
    const sql = await readFile(join(migrations, file), 'utf8');
    await db.batch(
      sql
        .split(/;[ \t]*\n+(?=(?:CREATE|ALTER|INSERT)\b)/)
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.prepare(statement)),
    );
  }
  for (const [id, name, role] of [
    ['ada', 'Ada', 'admin'],
    ['bea', 'Bea', 'member'],
    ['cal', 'Cal', 'member'],
  ]) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO members (id,guild_id,clerk_user_id,auth_username,role,status,joined_at)
        VALUES (?,'documentation-guild',?,?,?,'active',0)`,
        )
        .bind(id, `user_${id}`, `${id}_fixture`, role),
      db
        .prepare(
          `INSERT INTO characters (id,member_id,display_name,hair_style,hair_color,tunic_color)
        VALUES (?,?,?,0,0,0)`,
        )
        .bind(`character_${id}`, id, name),
    ]);
  }
}, 20_000);

afterAll(async () => {
  for (const socket of sockets) if (socket.readyState === 1) socket.close();
  await runtime?.dispose();
  if (output) await rm(output, { recursive: true, force: true });
});

async function request(
  path: string,
  { id, method, body }: { id?: string; method?: string; body?: unknown } = {},
) {
  const headers = new Headers({ Origin: origin });
  if (id) headers.set('Authorization', bearer(id));
  if (body) headers.set('Content-Type', 'application/json');
  return runtime.dispatchFetch(`${origin}/api/v1${path}`, {
    method,
    headers: Object.fromEntries(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ticketFor(id: string) {
  const response = await request('/realtime/ticket', { id, method: 'POST' });
  expect(response.status).toBe(200);
  return ((await response.json()) as { ticket: string }).ticket;
}

function upgrade(ticket: string, from = origin) {
  return runtime.dispatchFetch(`${origin}/api/v1/realtime/socket`, {
    headers: {
      Origin: from,
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': `guild-v1, ticket.${ticket}`,
    },
  });
}

async function connect(id: string, ticket?: string) {
  const response = await upgrade(ticket ?? (await ticketFor(id)));
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error('Expected WebSocket');
  sockets.push(socket);
  const messages: HallMessage[] = [];
  let members: HallMember[] | undefined;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)) as HallMessage;
    messages.push(message);
    if (message.type === 'roster') members = message.members;
  });
  socket.accept();
  return { socket, messages, roster: () => members };
}

it('gates tickets, synchronizes three members, deduplicates tabs and disconnects suspended members', async () => {
  expect((await request('/realtime/ticket', { method: 'POST' })).status).toBe(401);
  expect((await request('/realtime/ticket', { method: 'POST', id: 'outsider' })).status).toBe(403);
  const ticket = await ticketFor('ada');
  expect((await upgrade(ticket, 'https://other.example.test')).status).toBe(403);
  const ada = await connect('ada', ticket);
  expect((await upgrade(ticket)).status).toBe(401);
  const expired = await ticketFor('ada');
  const db = await runtime.getD1Database('DB');
  await db.prepare('UPDATE hall_tickets SET expires_at = 0').run();
  expect((await upgrade(expired)).status).toBe(401);

  const secondTab = await connect('ada');
  const bea = await connect('bea');
  const cal = await connect('cal');
  for (const peer of [ada, secondTab, bea, cal]) {
    await expect.poll(() => peer.roster()?.map(({ id }) => id)).toEqual(['ada', 'bea', 'cal']);
  }
  expect(ada.roster()?.[0]).not.toHaveProperty('clerkUserId');
  const renewal = await ticketFor('ada');
  ada.socket.send(`refresh.${renewal}`);
  await expect
    .poll(async () => await db.prepare('SELECT COUNT(*) AS count FROM hall_tickets').first('count'))
    .toBe(0);
  expect(ada.socket.readyState).toBe(1);
  expect(
    (await request('/me/hall-station', { id: 'bea', method: 'PUT', body: { station: 'Archives' } }))
      .status,
  ).toBe(204);
  await expect.poll(() => ada.roster()?.find(({ id }) => id === 'bea')?.station).toBe('Archives');
  bea.socket.send('wave');
  await expect
    .poll(() =>
      ada.messages.some((message) => message.type === 'wave' && message.memberId === 'bea'),
    )
    .toBe(true);
  secondTab.socket.close();
  cal.socket.close();
  await expect.poll(() => bea.roster()?.map(({ id }) => id)).toEqual(['ada', 'bea']);
  const closeCode = new Promise<number>((resolve) =>
    bea.socket.addEventListener('close', (event) => resolve(event.code), { once: true }),
  );
  expect(
    (
      await request('/admin/members/bea', {
        id: 'ada',
        method: 'PATCH',
        body: { status: 'suspended' },
      })
    ).status,
  ).toBe(204);
  expect(await closeCode).toBe(4003);
  await expect.poll(() => ada.roster()?.map(({ id }) => id)).toEqual(['ada']);
  expect((await request('/realtime/ticket', { method: 'POST', id: 'bea' })).status).toBe(403);
}, 20_000);
