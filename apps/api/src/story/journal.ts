import type { D1Database } from '@cloudflare/workers-types';
import type { GuildJournal, JournalDiscovery } from '@guild/shared';
import { discoveries } from '../expeditions/content';
import {
  chapterProgressSql,
  chronicle,
  storyCluesSql,
  type ChapterProgress,
  type StoryClue,
} from './chronicle';

const sources = {
  business: 'case',
  expedition_event: 'challenge',
  expedition_shared: 'party',
} as const;

const chainTitles: Record<string, string> = {
  missing_history: 'The Missing History',
  catalog_mystery: 'The Catalog Mystery',
};

export async function playerJournal(db: D1Database, member: string): Promise<GuildJournal> {
  const [personal, progress, shared] = await db.batch([
    db
      .prepare(
        `SELECT d.discovery_key, d.source_type, d.discovered_at FROM personal_discoveries d
      JOIN characters c ON c.id = d.character_id WHERE c.member_id = ?`,
      )
      .bind(member),
    db.prepare(chapterProgressSql),
    db.prepare(storyCluesSql),
  ]);
  const clues = shared!.results as StoryClue[];
  const story = chronicle(progress!.results as ChapterProgress[], clues);
  type Found = { discovery_key: string; source_type: keyof typeof sources; discovered_at: number };
  const entries = new Map<string, JournalDiscovery>();
  function record(key: string, source: JournalDiscovery['source'], discoveredAt: number) {
    const item = discoveries.get(key);
    if (item && (!entries.has(key) || entries.get(key)!.discoveredAt > discoveredAt))
      entries.set(key, {
        key,
        title: item.title,
        text: item.text,
        rarity: item.rarity,
        source,
        discoveredAt,
      });
  }
  for (const row of personal!.results as Found[]) {
    record(row.discovery_key, sources[row.source_type], row.discovered_at);
  }
  for (const clue of clues) {
    if (story.some(({ key }) => key === clue.chapter)) record(clue.clue, 'chronicle', clue.at);
  }
  return {
    discoveries: [...entries.values()].sort(
      (a, b) => b.discoveredAt - a.discoveredAt || a.title.localeCompare(b.title),
    ),
    chains: Object.entries(chainTitles).map(([key, title]) => {
      const chain = [...discoveries.values()].filter((item) => item.chain_key === key);
      const found = chain.flatMap((item) => {
        const entry = entries.get(item.key);
        return entry && item.chain_step !== null ? [{ ...entry, step: item.chain_step }] : [];
      });
      return {
        key,
        title,
        steps: chain.length,
        discoveries: found.sort((a, b) => a.step - b.step),
      };
    }),
    chronicle: story,
  };
}
