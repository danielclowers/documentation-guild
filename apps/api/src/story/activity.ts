import type { D1Database } from '@cloudflare/workers-types';
import { expeditionDay } from '@guild/shared';
import type { GuildActivity, GuildFeed } from '@guild/shared';
import { z } from 'zod';
import { discoveries, missions, optionalDiscovery, roll } from '../expeditions/content';

const retention = 30 * expeditionDay;
const pageSize = 20;
const cursorSchema = z.tuple([z.int().nonnegative(), z.string().regex(/^[a-z0-9_:-]{1,100}$/)]);

export function readFeedCursor(value: string | undefined) {
  if (value === undefined) return undefined;
  if (value.length > 180) return null;
  try {
    const cursor = cursorSchema.safeParse(JSON.parse(atob(value)));
    return cursor.success ? cursor.data : null;
  } catch {
    return null;
  }
}

type FeedRow = { id: string; kind: GuildActivity['kind']; at: number; key: string; amount: number };

export async function guildFeed(
  db: D1Database,
  now: number,
  cursor?: NonNullable<ReturnType<typeof readFeedCursor>>,
): Promise<GuildFeed> {
  const since = now - retention;
  const [feed, guild] = await db.batch([
    db
      .prepare(
        `WITH activity AS (
      SELECT 'expedition:' || p.id AS id, 'expedition' AS kind, p.ends_at AS at, p.mission AS key,
        p.baseline_renown AS amount FROM expedition_parties p WHERE p.state = 'completed' AND p.ends_at >= ?1
      UNION ALL
      SELECT 'clue:' || c.clue, 'clue', p.ends_at, c.clue, 0
        FROM expedition_chronicle c JOIN expedition_parties p ON p.id = c.party_id WHERE p.ends_at >= ?1
      UNION ALL
      SELECT 'discovery:' || p.id, 'discovery', COALESCE(p.shared_discovered_at, (
        SELECT MIN(d.discovered_at) FROM expedition_members e JOIN personal_discoveries d ON d.character_id = e.character_id
        WHERE e.party_id = p.id AND d.source_type = 'expedition_shared' AND d.source_id = p.id
      ), p.ends_at), '', p.seed
      FROM expedition_parties p WHERE p.state = 'completed' AND p.shared_discovery = 1 AND p.ends_at >= ?1 - ?2
      UNION ALL
      SELECT 'renown:' || renown, 'renown', reached_at, '', renown
        FROM guild_renown_milestones WHERE reached_at >= ?1
    ) SELECT * FROM activity WHERE at >= ?1 AND (at < ?3 OR (at = ?3 AND id < ?4))
      ORDER BY at DESC, id DESC LIMIT ?5`,
      )
      .bind(since, expeditionDay, cursor?.[0] ?? now + 1, cursor?.[1] ?? '', pageSize + 1),
    db.prepare("SELECT renown FROM guilds WHERE id = 'documentation-guild'"),
  ]);
  const rows = feed!.results as FeedRow[];
  const entries = rows.slice(0, pageSize).map(({ id, kind, at, key, amount }): GuildActivity => {
    switch (kind) {
      case 'expedition':
        return { id, kind, at, title: missions.get(key)!.title, renown: amount };
      case 'clue':
        return { id, kind, at, title: discoveries.get(key)!.title };
      case 'discovery':
        return { id, kind, at, title: optionalDiscovery(roll(amount, 'shared-item')).title };
      case 'renown':
        return { id, kind, at, renown: amount };
    }
  });
  const last = entries.at(-1);
  return {
    entries,
    renown: (guild!.results[0] as { renown: number }).renown,
    next: rows.length > pageSize && last ? btoa(JSON.stringify([last.at, last.id])) : null,
  };
}
