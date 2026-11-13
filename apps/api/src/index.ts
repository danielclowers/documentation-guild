import type { D1Database } from '@cloudflare/workers-types';
import { catalog } from '@guild/content';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { reconcileExpeditions } from './expeditions/parties';
import { checkpointExpedition, type HallBindings } from './realtime/hall-data';
import { accountRoutes } from './accounts/routes';

export { GuildRoom } from './realtime/guild-room';

type Bindings = { DB: D1Database };

const app = new Hono<{ Bindings: Bindings }>();

const applyHeaders = secureHeaders();
app.use('*', (c, next) => (c.req.header('Upgrade') ? next() : applyHeaders(c, next)));
app.use('*', async (c, next) => {
  await next();
  if (!c.req.header('Upgrade')) c.header('Cache-Control', 'no-store');
});

app.get('/health', async (c) => {
  try {
    const guild = await c.env.DB.prepare('SELECT 1 AS present FROM guilds WHERE id = ?')
      .bind('documentation-guild')
      .first<number>('present');
    if (guild === 1) return c.json({ status: 'ok', contentVersion: catalog.schema_version });
  } catch {
    // Keep storage errors out of the public response.
  }
  return c.json({ status: 'unavailable' }, 503);
});

app.route('/api/v1', accountRoutes());

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND' } }, 404));

export default {
  fetch: app.fetch,
  scheduled: (_controller: unknown, env: HallBindings) =>
    reconcileExpeditions(env.DB, Date.now(), undefined, checkpointExpedition(env)),
};
