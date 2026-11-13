import type { D1Database } from '@cloudflare/workers-types';
import type { BusinessAnswer, BusinessReward, BusinessSubmission } from '@guild/shared';
import { casePuzzle, caseRotation, optionalDiscoveries, type CaseInstance } from './cases';

const DAY = 86_400_000;
const QUEUE_SIZE = 3;
const FULL_REWARD_LIMIT = 8;

export async function businessBoard(db: D1Database, memberId: string) {
  const character = await db
    .prepare(
      `SELECT c.id FROM characters c JOIN members m ON m.id = c.member_id
    WHERE m.id = ? AND m.status = 'active'`,
    )
    .bind(memberId)
    .first<{ id: string }>();
  if (!character) return null;
  const pending = db
    .prepare(
      'SELECT * FROM business_cases WHERE character_id = ? AND completed_at IS NULL ORDER BY position LIMIT 3',
    )
    .bind(character.id);
  const { results } = await pending.all<CaseInstance>();
  if (results.length === QUEUE_SIZE) return results.map((row) => casePuzzle(row).view);
  const latest = await db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) AS latest FROM business_cases WHERE character_id = ?',
    )
    .bind(character.id)
    .first<number>('latest');
  // Recount inside the insertion transaction so simultaneous board loads cannot overfill it.
  await db.batch(
    Array.from({ length: QUEUE_SIZE }, (_, index) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO business_cases (id, character_id, position, template_key, seed)
     SELECT ?, c.id, ?, ?, ? FROM characters c JOIN members m ON m.id = c.member_id
     WHERE c.id = ? AND m.status = 'active'
       AND (SELECT COUNT(*) FROM business_cases WHERE character_id = c.id AND completed_at IS NULL) < ?`,
        )
        .bind(
          crypto.randomUUID(),
          (latest ?? -1) + index + 1,
          caseRotation[((latest ?? -1) + index + 1) % caseRotation.length],
          crypto.getRandomValues(new Uint32Array(1))[0]!,
          character.id,
          QUEUE_SIZE,
        ),
    ),
  );
  return (await pending.all<CaseInstance>()).results.map((row) => casePuzzle(row).view);
}

async function resultFor(db: D1Database, row: CaseInstance): Promise<BusinessSubmission> {
  if (row.completed_at === null)
    return { status: 'retry', attempts: row.attempts, retryAt: row.retry_at };
  const reward = await db
    .prepare(
      `SELECT r.xp, r.skill_xp AS skillXp, r.gold, b.renown, d.discovery_key AS discoveryKey
    FROM reward_ledger r JOIN business_cases b ON b.id = r.source_id AND b.character_id = r.character_id
    LEFT JOIN personal_discoveries d ON d.character_id = b.character_id AND d.source_id = b.id AND d.source_type = 'business'
    WHERE r.character_id = ? AND r.source_type = 'business' AND r.source_id = ?`,
    )
    .bind(row.character_id, row.id)
    .first<Omit<BusinessReward, 'discovery'> & { discoveryKey: string | null }>();
  if (!reward) throw new Error('Completed case missing its reward');
  const { discoveryKey, ...payout } = reward;
  const discovery = optionalDiscoveries.find(({ key }) => key === discoveryKey);
  return {
    status: 'completed',
    reward: {
      ...payout,
      discovery: discovery ? { title: discovery.title, text: discovery.text } : null,
    },
  };
}

export async function submitBusinessCase(
  db: D1Database,
  memberId: string,
  id: string,
  answer: BusinessAnswer,
  now = Date.now(),
) {
  const find = db
    .prepare(
      `SELECT b.*, c.specialization, COALESCE(t.rank, 0) AS scribingRank, COALESCE(r.rank, 0) AS researchRank
    FROM business_cases b JOIN characters c ON c.id = b.character_id JOIN members m ON m.id = c.member_id
    LEFT JOIN training_purchases t ON t.character_id = c.id AND t.upgrade_key = 'efficient_scribing'
    LEFT JOIN training_purchases r ON r.character_id = c.id AND r.upgrade_key = 'careful_research'
    WHERE b.id = ? AND m.id = ? AND m.status = 'active'`,
    )
    .bind(id, memberId);
  const row = await find.first<
    CaseInstance & { specialization: string | null; scribingRank: number; researchRank: number }
  >();
  if (!row) return null;
  if (row.completed_at !== null || row.retry_at > now) return resultFor(db, row);

  const { view, solve } = casePuzzle(row);
  if (view.type !== answer.type) return 'invalid';
  const activeMember = "EXISTS (SELECT 1 FROM members WHERE id = ? AND status = 'active')";
  if (!solve(answer)) {
    await db
      .prepare(
        `UPDATE business_cases SET attempts = attempts + 1, retry_at = ?
      WHERE id = ? AND completed_at IS NULL AND attempts = ? AND ${activeMember}`,
      )
      .bind(now + 3000, id, row.attempts, memberId)
      .run();
  } else {
    const effect =
      view.type === 'choice' && answer.type === 'choice'
        ? view.options.find((option) => option.id === answer.option)?.effect
        : undefined;
    const advanced = view.difficulty === 'advanced';
    const penalty = row.attempts > 2 ? 0.75 : 1;
    const bonusPercent =
      view.skill === 'Scribing'
        ? (row.specialization === 'Editor' ? 15 : 0) + row.scribingRank * 3
        : view.skill === 'Restoration' && row.specialization === 'Mender'
          ? 10
          : 0;
    const baseGold = (advanced ? 20 : 12) + (effect === 'guaranteed_gold' ? 4 : 0);
    const gold = Math.floor((baseGold * penalty * (100 + Math.min(25, bonusPercent))) / 100);
    const chance =
      (advanced ? 12 : 8) +
      (effect === 'discovery_roll' ? 12 : 0) +
      (view.skill === 'Research' ? row.researchRank * 2 : 0);
    const discovery =
      row.seed % 100 < chance
        ? optionalDiscoveries[Math.floor(row.seed / 100) % optionalDiscoveries.length]
        : undefined;
    const resolutionId = crypto.randomUUID();
    const reward =
      "(SELECT COUNT(*) < ? FROM reward_ledger WHERE character_id = ? AND source_type = 'business' AND skill_xp > 0 AND awarded_at > ?)";
    const fullReward = [FULL_REWARD_LIMIT, row.character_id, now - DAY] as const;
    const statements = [
      db
        .prepare(
          `UPDATE business_cases SET completed_at = ?, outcome_key = ?, resolution_id = ?,
        renown = CASE WHEN ? = 'renown_bonus' AND ${reward} THEN 5 ELSE 0 END
        WHERE id = ? AND completed_at IS NULL AND attempts = ? AND ${activeMember}`,
        )
        .bind(
          now,
          effect ?? null,
          resolutionId,
          effect ?? null,
          ...fullReward,
          id,
          row.attempts,
          memberId,
        ),
      db
        .prepare(
          `INSERT INTO reward_ledger (character_id, source_type, source_id, skill, xp, skill_xp, gold, awarded_at)
        SELECT character_id, 'business', id, ?, CASE WHEN full_reward THEN ? ELSE 5 END,
          CASE WHEN full_reward THEN ? ELSE 0 END, CASE WHEN full_reward THEN ? ELSE 2 END, ?
        FROM (SELECT character_id, id, ${reward} AS full_reward FROM business_cases WHERE id = ? AND resolution_id = ?)`,
        )
        .bind(
          view.skill,
          Math.floor((advanced ? 35 : 20) * penalty),
          Math.floor((advanced ? 16 : 10) * penalty),
          gold,
          now,
          ...fullReward,
          id,
          resolutionId,
        ),
      db
        .prepare(
          `UPDATE guilds SET renown = renown + COALESCE((SELECT renown FROM business_cases WHERE id = ? AND resolution_id = ?), 0)
        WHERE id = 'documentation-guild' AND EXISTS (SELECT 1 FROM business_cases WHERE id = ? AND resolution_id = ? AND renown > 0)`,
        )
        .bind(id, resolutionId, id, resolutionId),
    ];
    if (discovery)
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO personal_discoveries
      (character_id, discovery_key, source_type, source_id, discovered_at)
      SELECT b.character_id, ?, 'business', b.id, ? FROM business_cases b JOIN reward_ledger r
        ON r.character_id = b.character_id AND r.source_id = b.id AND r.source_type = 'business'
      WHERE b.id = ? AND b.resolution_id = ? AND r.skill_xp > 0`,
          )
          .bind(discovery.key, now, id, resolutionId),
      );
    await db.batch(statements);
  }
  const updated = await find.first<CaseInstance>();
  return updated ? resultFor(db, updated) : null;
}
