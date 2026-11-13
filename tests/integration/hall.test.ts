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

it('pauses the order only after the last hall connection closes', async () => {
  const first = await connect('cal');
  const second = await connect('cal');
  const order = () =>
    request('/me', { id: 'cal' }).then(async (response) => {
      expect(response.status).toBe(200);
      return ((await response.json()) as import('../../packages/shared/src').GuildProfile).character
        ?.progression.order;
    });
  expect(
    (await request('/me/standing-order', { id: 'cal', method: 'PUT', body: { skill: 'Research' } }))
      .status,
  ).toBe(200);
  const db = await runtime.getD1Database('DB');
  await db
    .prepare("UPDATE standing_orders SET research_ms = 120000 WHERE character_id = 'character_cal'")
    .run();
  first.socket.close(1000);
  expect(await order()).toMatchObject({ running: true });
  second.socket.close(1000);
  await expect.poll(async () => (await order())?.running).toBe(false);
  const paused = await order();
  expect(paused?.remainingMs).toBeGreaterThan(175_000);
  expect(paused?.remainingMs).toBeLessThanOrEqual(180_000);
  await db
    .prepare(
      "UPDATE standing_orders SET accounted_at = accounted_at - 86400000 WHERE character_id = 'character_cal'",
    )
    .run();
  expect(await order()).toEqual(paused);
  const resumed = await connect('cal');
  const running = await order();
  expect(running?.running).toBe(true);
  expect(running?.remainingMs).toBeGreaterThan(175_000);
  expect(running?.remainingMs).toBeLessThanOrEqual(paused?.remainingMs ?? 0);
  expect(
    await db
      .prepare("SELECT COUNT(*) AS count FROM reward_ledger WHERE character_id = 'character_cal'")
      .first('count'),
  ).toBe(0);
  resumed.socket.close(1000);
}, 20_000);

type Board = import('../../packages/shared/src').ExpeditionBoard;
const minute = 60_000;
const expeditionRole = { role: 'Scribing', approach: 'careful' };

async function expeditionMembers(...ids: string[]) {
  const db = await runtime.getD1Database('DB');
  await db.batch(
    ids.flatMap((id) => [
      db
        .prepare(
          `INSERT INTO members (id,guild_id,clerk_user_id,auth_username,role,status,joined_at)
      VALUES (?,'documentation-guild',?,?,'member','active',0)`,
        )
        .bind(id, `user_${id}`, id),
      db
        .prepare(
          `INSERT INTO characters (id,member_id,display_name,hair_style,hair_color,tunic_color)
      VALUES (?,?,?,0,0,0)`,
        )
        .bind(`character_${id}`, id, id),
    ]),
  );
  return db;
}

async function createExpedition(id: string, delay: number | null, mission = 'missing_pages') {
  const response = await request('/expeditions', {
    id,
    method: 'POST',
    body: { ...expeditionRole, mission, delay },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

const expeditionAction = (id: string, party: string, action: string, values = {}) =>
  request(`/expeditions/${party}`, { id, method: 'POST', body: { action, ...values } });

async function boardParty(id: string, party: string) {
  const response = await request('/expeditions', { id });
  expect(response.status).toBe(200);
  return ((await response.json()) as Board).parties.find((entry) => entry.id === party);
}

async function runExpeditionCron() {
  const worker = await runtime.getWorker();
  const result = await worker.scheduled({ cron: '* * * * *' });
  expect(result.outcome).toBe('ok');
}

it('locks a manual roster at four, animates departure and pays everyone after disconnect', async () => {
  const db = await expeditionMembers('mlead', 'msecond', 'mthird', 'mfourth', 'mfifth');
  expect((await request('/expeditions')).status).toBe(401);
  const lead = await connect('mlead');
  const other = await connect('msecond');
  const party = await createExpedition('mlead', null);
  expect((await expeditionAction('mlead', party, 'start')).status).toBe(409);
  expect((await expeditionAction('mlead', party, 'invite', { memberId: 'msecond' })).status).toBe(
    200,
  );
  expect(await boardParty('msecond', party)).toMatchObject({ invited: true });
  expect(
    (await expeditionAction('msecond', party, 'join', { role: 'Research', approach: 'careful' }))
      .status,
  ).toBe(200);
  expect((await expeditionAction('msecond', party, 'start')).status).toBe(409);
  expect((await expeditionAction('mthird', party, 'join', expeditionRole)).status).toBe(200);
  const last = await Promise.all(
    ['mfourth', 'mfifth'].map((id) => expeditionAction(id, party, 'join', expeditionRole)),
  );
  expect(last.map(({ status }) => status).sort()).toEqual([200, 409]);
  const alternate = await createExpedition(last[0]!.ok ? 'mfifth' : 'mfourth', null);
  expect((await expeditionAction('msecond', alternate, 'join', expeditionRole)).status).toBe(409);
  expect((await expeditionAction('mlead', party, 'start')).status).toBe(200);
  expect((await expeditionAction('msecond', party, 'leave')).status).toBe(409);
  await expect
    .poll(() => lead.roster()?.find(({ id }) => id === 'msecond')?.expeditionAt)
    .toBeTypeOf('number');
  const launched = await boardParty('mlead', party);
  expect(launched?.roster).toHaveLength(4);
  expect((launched?.endsAt ?? 0) - (launched?.startedAt ?? 0)).toBe(10 * minute);
  expect(
    (await expeditionAction('mlead', party, 'event', { slot: 0, option: 'option_1' })).status,
  ).toBe(409);
  lead.socket.close(1000);
  other.socket.close(1000);
  await db
    .prepare('UPDATE expedition_parties SET started_at = ?, ends_at = ? WHERE id = ?')
    .bind(Date.now() - 11 * minute, Date.now() - minute, party)
    .run();
  await Promise.all([runExpeditionCron(), runExpeditionCron()]);
  const returned = await boardParty('msecond', party);
  expect(returned).toMatchObject({
    state: 'completed',
    report: { reward: { xp: 60, skillXp: 20, gold: 35, renown: 10 }, sharedRenown: 40 },
  });
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) FROM reward_ledger WHERE source_type = 'expedition' AND source_id = ?",
      )
      .bind(party)
      .first('COUNT(*)'),
  ).toBe(4);
  expect(
    await db
      .prepare(
        "SELECT xp FROM character_skills WHERE character_id = 'character_msecond' AND skill = 'Research'",
      )
      .first('xp'),
  ).toBe(20);
});

it('honors scheduled departures, a single grace period, and manual abandonment', async () => {
  const db = await expeditionMembers('slead', 'ssecond', 'glead', 'gsecond', 'elead', 'alead');
  const scheduled = await createExpedition('slead', 5, 'forgotten_archives');
  expect((await expeditionAction('ssecond', scheduled, 'join', expeditionRole)).status).toBe(200);
  expect((await expeditionAction('slead', scheduled, 'start')).status).toBe(409);
  await runExpeditionCron();
  expect(await boardParty('slead', scheduled)).toMatchObject({ state: 'recruiting' });

  const grace = await createExpedition('glead', 5);
  const expiring = await createExpedition('elead', 5);
  const stale = await createExpedition('alead', null);
  const due = Date.now() - 1000;
  await db.batch([
    db
      .prepare('UPDATE expedition_parties SET scheduled_at = ? WHERE id IN (?, ?, ?)')
      .bind(due, scheduled, grace, expiring),
    db
      .prepare('UPDATE expedition_parties SET created_at = ? WHERE id = ?')
      .bind(due - 24 * 60 * minute, stale),
  ]);
  await runExpeditionCron();
  expect(await boardParty('slead', scheduled)).toMatchObject({
    state: 'running',
    startedAt: due,
    endsAt: due + 20 * minute,
  });
  expect(await boardParty('glead', grace)).toMatchObject({
    state: 'grace',
    graceUntil: due + 15 * minute,
  });
  await runExpeditionCron();
  expect(await boardParty('glead', grace)).toMatchObject({
    state: 'grace',
    graceUntil: due + 15 * minute,
  });
  expect((await expeditionAction('glead', grace, 'reschedule', { delay: 5 })).status).toBe(409);
  expect((await expeditionAction('gsecond', grace, 'join', expeditionRole)).status).toBe(200);
  expect(await boardParty('gsecond', grace)).toMatchObject({ state: 'running' });
  await db
    .prepare('UPDATE expedition_parties SET grace_until = ? WHERE id = ?')
    .bind(due, expiring)
    .run();
  await runExpeditionCron();
  expect(await boardParty('elead', expiring)).toMatchObject({ state: 'expired' });
  expect(await boardParty('alead', stale)).toMatchObject({ state: 'expired' });
  expect((await expeditionAction('elead', expiring, 'start')).status).toBe(409);
  expect(await createExpedition('elead', null)).toBeTypeOf('string');
});

it('keeps post-return events personal and awards shared bonuses once under retries', async () => {
  const db = await expeditionMembers('olead', 'osecond', 'othird', 'outsider2');
  const party = await createExpedition('olead', null, 'forgotten_archives');
  for (const id of ['osecond', 'othird'])
    expect((await expeditionAction(id, party, 'join', expeditionRole)).status).toBe(200);
  expect((await expeditionAction('olead', party, 'start')).status).toBe(200);
  const finished = Date.now() - minute;
  await db
    .prepare('UPDATE expedition_parties SET started_at = ?, ends_at = ? WHERE id = ?')
    .bind(finished - 20 * minute, finished, party)
    .run();
  await runExpeditionCron();
  const eligible = await boardParty('olead', party);
  expect(eligible?.events.length).toBeGreaterThanOrEqual(1);
  expect(eligible?.events.length).toBeLessThanOrEqual(2);
  expect(eligible?.events[0]).toMatchObject({
    availableAt: finished - 12 * minute,
    expiresAt: finished + 24 * 60 * minute,
  });
  expect(eligible?.events[0]?.options).toHaveLength(3);
  expect(await boardParty('outsider2', party)).toBeUndefined();
  const choice = { slot: 0, option: 'option_3' };
  expect((await expeditionAction('outsider2', party, 'event', choice)).status).toBe(409);
  const duplicate = await Promise.all(
    [1, 2].map(() => expeditionAction('olead', party, 'event', choice)),
  );
  expect(duplicate.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect((await expeditionAction('osecond', party, 'event', choice)).status).toBe(200);
  const first = await boardParty('olead', party);
  const second = await boardParty('osecond', party);
  expect(first?.report?.sharedRenown).toBe(second?.report?.sharedRenown);
  expect(first?.report?.sharedRenown).toBe(
    65 + (first?.events[0]?.result?.renown ?? 0) + (second?.events[0]?.result?.renown ?? 0),
  );
  const shared = await db
    .prepare('SELECT shared_bonus, shared_discovery FROM expedition_parties WHERE id = ?')
    .bind(party)
    .first();
  expect(shared).toEqual({ shared_bonus: 20, shared_discovery: 0 });
  await db
    .prepare('UPDATE expedition_parties SET ends_at = ? WHERE id = ?')
    .bind(finished - 24 * 60 * minute, party)
    .run();
  expect((await expeditionAction('othird', party, 'event', choice)).status).toBe(409);
  expect((await boardParty('othird', party))?.events[0]?.options).toEqual([]);
});

it('preserves partial standing orders through the expedition and an offline interval', async () => {
  const { settleStandingOrder } = await import('../../apps/api/src/progression/standing-orders');
  const db = await expeditionMembers('plead', 'psecond');
  const apiDb = db as unknown as Parameters<typeof settleStandingOrder>[0];
  const party = await createExpedition('plead', null);
  expect((await expeditionAction('psecond', party, 'join', expeditionRole)).status).toBe(200);
  expect((await expeditionAction('plead', party, 'start')).status).toBe(200);
  const start = Date.now() - 22 * minute;
  const departure = start + 2 * minute;
  const end = departure + 10 * minute;
  await db
    .prepare('UPDATE expedition_parties SET started_at = ?, ends_at = ? WHERE id = ?')
    .bind(departure, end, party)
    .run();
  const query = () =>
    db
      .prepare("SELECT research_ms FROM standing_orders WHERE character_id = 'character_plead'")
      .first('research_ms');
  await settleStandingOrder(apiDb, 'plead', { now: start, skill: 'Research' });
  await settleStandingOrder(apiDb, 'plead', {
    now: departure + minute,
    connectedSince: start,
    checkpoint: true,
  });
  expect(await query()).toBe(2 * minute);
  await settleStandingOrder(apiDb, 'plead', { now: end + 5 * minute });
  expect(await query()).toBe(2 * minute);
  await settleStandingOrder(apiDb, 'plead', {
    now: end + 8 * minute,
    connectedSince: end + 5 * minute,
  });
  expect(await query()).toBe(0);
  const ledger = await db
    .prepare(
      "SELECT source_type, xp, gold FROM reward_ledger WHERE character_id = 'character_plead' ORDER BY awarded_at",
    )
    .all();
  expect(ledger.results).toEqual([
    { source_type: 'expedition', xp: 60, gold: 35 },
    { source_type: 'standing_order', xp: 3, gold: 2 },
  ]);
});

it('allows one leadership transfer after absence and audits administrative closure', async () => {
  const db = await expeditionMembers('tlead', 'tsecond', 'tthird', 'absent_leader');
  const lead = await connect('tlead');
  const party = await createExpedition('tlead', null);
  for (const id of ['tsecond', 'tthird'])
    expect((await expeditionAction(id, party, 'join', expeditionRole)).status).toBe(200);
  await db
    .prepare(
      'UPDATE expedition_parties SET created_at = created_at - ?, leader_since = leader_since - ? WHERE id = ?',
    )
    .bind(6 * minute, 6 * minute, party)
    .run();
  expect((await expeditionAction('tsecond', party, 'transfer')).status).toBe(409);

  lead.socket.close(1000);
  expect((await expeditionAction('tsecond', party, 'transfer')).status).toBe(409);
  await db.batch([
    db
      .prepare(
        "UPDATE expedition_members SET member_id = 'absent_leader', character_id = 'character_absent_leader' WHERE party_id = ? AND member_id = 'tlead'",
      )
      .bind(party),
    db
      .prepare("UPDATE expedition_parties SET leader_id = 'absent_leader' WHERE id = ?")
      .bind(party),
  ]);
  const claims = await Promise.all(
    ['tsecond', 'tthird'].map((id) => expeditionAction(id, party, 'transfer')),
  );
  expect(claims.map(({ status }) => status).sort()).toEqual([200, 409]);
  const winner = claims[0]?.ok ? 'tsecond' : 'tthird';
  expect((await expeditionAction('absent_leader', party, 'leave')).status).toBe(200);
  expect((await expeditionAction(winner, party, 'start')).status).toBe(200);
  expect((await expeditionAction(winner, party, 'fail')).status).toBe(409);
  expect((await expeditionAction('ada', party, 'fail')).status).toBe(200);
  expect((await expeditionAction('ada', party, 'fail')).status).toBe(409);
  expect(await boardParty(winner, party)).toMatchObject({ state: 'failed' });
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) FROM audit_log WHERE action = 'expedition.failed' AND object_id = ?",
      )
      .bind(party)
      .first('COUNT(*)'),
  ).toBe(1);
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) FROM reward_ledger WHERE source_type = 'expedition' AND source_id = ?",
      )
      .bind(party)
      .first('COUNT(*)'),
  ).toBe(0);
});

it('lets an Investigator retry a failed deduction once without rerolling its seed', async () => {
  const { expeditionEvents, missions, roll } =
    await import('../../apps/api/src/expeditions/content');
  const db = await expeditionMembers('investigator', 'insecond');
  await db
    .prepare(
      "UPDATE characters SET specialization = 'Investigator' WHERE id = 'character_investigator'",
    )
    .run();
  const party = await createExpedition('investigator', null);
  expect((await expeditionAction('insecond', party, 'join', expeditionRole)).status).toBe(200);
  expect((await expeditionAction('investigator', party, 'start')).status).toBe(200);
  const finish = Date.now() - minute;
  const mission = missions.get('missing_pages')!;
  const start = finish - 10 * minute;
  let seed = 0;
  while (
    !expeditionEvents(mission, seed, 'investigator', start, finish)[0]?.deductionClue ||
    roll(seed, 'investigator:0:check') % 100 < 60 ||
    roll(seed, 'investigator:0:check') % 100 >= 70
  )
    seed++;
  await db
    .prepare('UPDATE expedition_parties SET started_at = ?, ends_at = ?, seed = ? WHERE id = ?')
    .bind(start, finish, seed, party)
    .run();
  await runExpeditionCron();
  const first = { slot: 0, option: 'option_3' };
  expect((await expeditionAction('investigator', party, 'retry', first)).status).toBe(409);
  expect((await expeditionAction('investigator', party, 'event', first)).status).toBe(200);
  expect((await boardParty('investigator', party))?.events[0]).toMatchObject({
    retry: true,
    result: { success: false },
  });
  expect((await expeditionAction('investigator', party, 'retry', first)).status).toBe(409);
  const attempts = await Promise.all(
    [1, 2].map(() =>
      expeditionAction('investigator', party, 'retry', { slot: 0, option: 'option_1' }),
    ),
  );
  expect(attempts.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect((await boardParty('investigator', party))?.events[0]).toMatchObject({
    retry: false,
    result: { success: true },
  });
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) FROM reward_ledger WHERE source_type = 'expedition_event' AND source_id = ?",
      )
      .bind(party + ':0')
      .first('COUNT(*)'),
  ).toBe(1);
});
