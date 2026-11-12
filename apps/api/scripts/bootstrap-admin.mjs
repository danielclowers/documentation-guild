import { createClerkClient } from '@clerk/backend';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

const [target, userId, ...config] = process.argv.slice(2);
const secretKey = process.env.CLERK_SECRET_KEY;
const configValid =
  config.length === 0 || (config.length === 2 && config[0] === '--config' && config[1]);

async function main() {
  if (
    !['--local', '--remote'].includes(target) ||
    !/^user_[a-zA-Z0-9]+$/.test(userId ?? '') ||
    !secretKey ||
    !configValid ||
    (target === '--remote' && config.length !== 2)
  ) {
    throw new Error(
      'Usage: pnpm bootstrap:admin --local|--remote user_ID [--config path]. Set CLERK_SECRET_KEY in the environment. Remote requires an explicit config.',
    );
  }
  const clerk = createClerkClient({ secretKey, telemetry: { disabled: true } });
  let user;
  try {
    user = await clerk.users.getUser(userId);
  } catch {
    throw new Error('Clerk could not verify that user in the configured instance.');
  }
  const username = user.username?.toLowerCase();
  if (
    user.id !== userId ||
    !username ||
    !/^[a-z0-9_]{4,32}$/.test(username) ||
    user.banned ||
    user.locked ||
    !user.passwordEnabled
  ) {
    throw new Error('The Clerk user must have an eligible username and an enabled password.');
  }
  const now = Date.now();
  const sql = `INSERT INTO members (id, guild_id, clerk_user_id, auth_username, role, status, joined_at)
    SELECT 'guild-admin', 'documentation-guild', '${userId}', '${username}', 'admin', 'active', ${now}
    WHERE NOT EXISTS (SELECT 1 FROM members WHERE role = 'admin');
    SELECT EXISTS (SELECT 1 FROM members WHERE clerk_user_id = '${userId}' AND role = 'admin' AND status = 'active') AS admin_ready;`;
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'DB', target, ...config, '--command', sql, '--json'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      'Wrangler could not initialize the admin. Verify the selected D1 database and migrations.',
    );
  const rows = JSON.parse(result.stdout);
  if (!rows.some((entry) => entry.results?.some((row) => row.admin_ready === 1))) {
    throw new Error('A different admin already exists or the selected account is inactive.');
  }
  console.log('Guild admin is active. Sign in to create the admin character.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
