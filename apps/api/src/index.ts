import type { D1Database } from '@cloudflare/workers-types';
import { catalog } from '@guild/content';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { accountRoutes } from './accounts/routes';

type Bindings = { DB: D1Database };

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', secureHeaders());
app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
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

export default app;
