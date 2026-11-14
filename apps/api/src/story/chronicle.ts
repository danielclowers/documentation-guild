import type { D1Database } from '@cloudflare/workers-types';
import type { ChronicleChapter } from '@guild/shared';
import { chapters, discoveries } from '../expeditions/content';

export const chapterProgressSql = `SELECT p.chapter, COUNT(*) AS count, SUM(p.baseline_renown + p.shared_bonus +
  (SELECT COALESCE(SUM(e.renown),0) FROM expedition_events e WHERE e.party_id = p.id)) AS renown
  FROM expedition_parties p WHERE p.state = 'completed' GROUP BY p.chapter`;

export const storyCluesSql = `SELECT c.chapter, c.clue, p.ends_at AS at FROM expedition_chronicle c
  JOIN expedition_parties p ON p.id = c.party_id ORDER BY c.rowid`;

export type StoryClue = { chapter: string; clue: string; at: number };
export type ChapterProgress = { chapter: string; count: number; renown: number };

export function chronicle(progress: ChapterProgress[], clues: StoryClue[]): ChronicleChapter[] {
  const visible: ChronicleChapter[] = [];
  for (const chapter of chapters) {
    const current = progress.find((row) => row.chapter === chapter.key);
    const chapterClues = clues.filter((clue) => clue.chapter === chapter.key);
    const targetExpeditions = chapter.objectives.find(({ key }) => key === 'expeditions')!.target;
    const targetRenown = chapter.objectives.find(({ key }) => key === 'renown')!.target;
    const targetClues = chapter.guaranteed_clue_rules.length;
    const expeditions = current?.count ?? 0;
    const renown = current?.renown ?? 0;
    const complete =
      expeditions >= targetExpeditions &&
      renown >= targetRenown &&
      chapterClues.length >= targetClues;
    visible.push({
      key: chapter.key,
      title: chapter.title,
      intro: chapter.intro,
      expeditions,
      renown,
      targetExpeditions,
      targetRenown,
      targetClues,
      clues: chapterClues.map(({ clue }) => discoveries.get(clue)!.title),
      scenes: chapter.scenes.slice(0, complete ? undefined : chapterClues.length + 1),
      recap: complete ? chapter.recap : undefined,
    });
    if (!complete) break;
  }
  return visible;
}

export async function chapterOneComplete(db: D1Database) {
  const chapter = chapters.find(({ key }) => key === 'chapter1')!;
  const completionTarget = chapter.objectives.find(({ key }) => key === 'expeditions')!.target;
  const renownTarget = chapter.objectives.find(({ key }) => key === 'renown')!.target;
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM (${chapterProgressSql}) WHERE chapter = ? AND count >= ? AND renown >= ?
      AND (SELECT COUNT(*) FROM expedition_chronicle WHERE chapter = ?) >= ?`,
      )
      .bind(
        chapter.key,
        completionTarget,
        renownTarget,
        chapter.key,
        chapter.guaranteed_clue_rules.length,
      )
      .first(),
  );
}
