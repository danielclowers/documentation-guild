import type { D1Database } from '@cloudflare/workers-types';
import { characterLevel } from '@guild/shared';
import type {
  BusinessAnswer,
  BusinessBoard,
  BusinessReward,
  BusinessSubmission,
  Skill,
} from '@guild/shared';
import { discoveryFind } from '../story/finds';
import { casePuzzle, optionalDiscoveries, type CaseInstance } from './cases';
import {
  allowance,
  businessWindow,
  caseReward,
  fullPayouts,
  fullRewardLimit,
  reducedCasePayout,
  type RewardModifiers,
} from './rewards';
import { nextCase } from './selection';

const queueSize = 3;
const modifierColumns =
  'c.specialization, COALESCE(t.rank, 0) AS scribingRank, COALESCE(r.rank, 0) AS researchRank';
const modifierJoins = `LEFT JOIN training_purchases t ON t.character_id = c.id AND t.upgrade_key = 'efficient_scribing'
  LEFT JOIN training_purchases r ON r.character_id = c.id AND r.upgrade_key = 'careful_research'`;

export async function businessBoard(
  db: D1Database,
  memberId: string,
  now = Date.now(),
): Promise<BusinessBoard | null> {
  const character = await db
    .prepare(
      `SELECT c.id, c.total_xp AS xp, ${modifierColumns}
    FROM characters c JOIN members m ON m.id = c.member_id ${modifierJoins}
    WHERE m.id = ? AND m.status = 'active'`,
    )
    .bind(memberId)
    .first<RewardModifiers & { id: string; xp: number }>();
  if (!character) return null;
  const pending = db
    .prepare(
      'SELECT * FROM business_cases WHERE character_id = ? AND completed_at IS NULL ORDER BY position LIMIT 3',
    )
    .bind(character.id);
  let { results } = await pending.all<CaseInstance>();
  for (let attempt = 0; results.length < queueSize && attempt < 5; attempt++) {
    const [snapshot, history, latest] = await db.batch([
      pending,
      db
        .prepare(
          `SELECT template_key FROM business_cases WHERE character_id = ? AND completed_at IS NOT NULL
        ORDER BY completed_at DESC, position DESC LIMIT 10`,
        )
        .bind(character.id),
      db
        .prepare(
          'SELECT COALESCE(MAX(position), -1) AS position FROM business_cases WHERE character_id = ?',
        )
        .bind(character.id),
    ]);
    results = snapshot!.results as CaseInstance[];
    const active = results.map(({ template_key }) => template_key);
    const recent = (history!.results as Pick<CaseInstance, 'template_key'>[]).map(
      ({ template_key }) => template_key,
    );
    const start = (latest!.results[0] as { position: number }).position + 1;
    if (results.length === queueSize) break;
    await db.batch(
      Array.from({ length: queueSize - results.length }, (_, index) => {
        const position = start + index;
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
        const template = nextCase(position, characterLevel(character.xp), active, recent, seed);
        active.push(template);
        return db
          .prepare(
            `INSERT OR IGNORE INTO business_cases (id, character_id, position, template_key, seed)
        SELECT ?, c.id, ?, ?, ? FROM characters c JOIN members m ON m.id = c.member_id
        WHERE c.id = ? AND m.status = 'active'
        AND (SELECT COALESCE(MAX(position), -1) FROM business_cases WHERE character_id = c.id) = ?
        AND (SELECT COUNT(*) FROM business_cases WHERE character_id = c.id AND completed_at IS NULL) < ?
        AND NOT EXISTS (SELECT 1 FROM business_cases WHERE character_id = c.id AND completed_at IS NULL AND template_key = ?)`,
          )
          .bind(
            crypto.randomUUID(),
            position,
            template,
            seed,
            character.id,
            position - 1,
            queueSize,
            template,
          );
      }),
    );
    results = (await pending.all<CaseInstance>()).results;
  }
  const [window, known] = await Promise.all([
    allowance(
      db
        .prepare(`SELECT COUNT(*) AS used, MIN(awarded_at) AS oldest ${fullPayouts}`)
        .bind(character.id, now - businessWindow),
    ),
    db
      .prepare('SELECT discovery_key FROM personal_discoveries WHERE character_id = ?')
      .bind(character.id)
      .all<{ discovery_key: string }>(),
  ]);
  const seen = new Set(known.results.map(({ discovery_key }) => discovery_key));
  const unseen =
    optionalDiscoveries.filter(({ key }) => !seen.has(key)).length / optionalDiscoveries.length;
  const full = window.remaining > 0;
  return {
    allowance: window,
    cases: results.map((row) => {
      const { view } = casePuzzle(row);
      const preview = caseReward(view, character, full, undefined, unseen);
      const choicePreviews =
        view.type === 'choice'
          ? Object.fromEntries(
              view.options.map(({ id, effect }) => [
                id,
                caseReward(view, character, full, effect, unseen),
              ]),
            )
          : undefined;
      return { ...view, preview, choicePreviews };
    }),
  };
}

async function resultFor(db: D1Database, row: CaseInstance): Promise<BusinessSubmission> {
  if (row.completed_at === null)
    return { status: 'retry', attempts: row.attempts, retryAt: row.retry_at };
  const reward = await db
    .prepare(
      `SELECT r.xp, r.skill_xp AS skillXp, r.gold, b.renown, r.skill, b.chosen_option AS chosenOption,
      COALESCE(b.discovery_roll_key, d.discovery_key) AS discoveryKey, d.discovery_key IS NOT NULL AS newDiscovery
    FROM reward_ledger r JOIN business_cases b ON b.id = r.source_id AND b.character_id = r.character_id
    LEFT JOIN personal_discoveries d ON d.character_id = b.character_id AND d.source_id = b.id AND d.source_type = 'business'
    WHERE r.character_id = ? AND r.source_type = 'business' AND r.source_id = ?`,
    )
    .bind(row.character_id, row.id)
    .first<
      Pick<BusinessReward, 'xp' | 'skillXp' | 'gold' | 'renown'> & {
        skill: Skill;
        chosenOption: number | null;
        discoveryKey: string | null;
        newDiscovery: number;
      }
    >();
  if (!reward) throw new Error('Completed case missing its reward');
  const { chosenOption, discoveryKey, newDiscovery, ...payout } = reward;
  const full = payout.skillXp > 0;
  return {
    status: 'completed',
    reward: {
      ...payout,
      full,
      outcome:
        !full && casePuzzle(row).view.type === 'choice'
          ? 'You filed the case as a routine report.'
          : casePuzzle(row).outcome(chosenOption ?? undefined),
      discovery: discoveryFind(discoveryKey, !newDiscovery),
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
      `SELECT b.*, ${modifierColumns}
    FROM business_cases b JOIN characters c ON c.id = b.character_id JOIN members m ON m.id = c.member_id
    ${modifierJoins}
    WHERE b.id = ? AND m.id = ? AND m.status = 'active'`,
    )
    .bind(id, memberId);
  const row = await find.first<CaseInstance & RewardModifiers>();
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
    const payout = caseReward(view, row, true, effect);
    const selected = view.type === 'choice' && answer.type === 'choice' ? answer.option : null;
    const discovery =
      row.seed % 100 < payout.discoveryChance
        ? optionalDiscoveries[Math.floor(row.seed / 100) % optionalDiscoveries.length]
        : undefined;
    const resolutionId = crypto.randomUUID();
    const reward = `(SELECT COUNT(*) < ? ${fullPayouts})`;
    const params = [fullRewardLimit, row.character_id, now - businessWindow] as const;
    const statements = [
      db
        .prepare(
          `UPDATE business_cases SET completed_at = ?, outcome_key = ?, resolution_id = ?,
        chosen_option = ?, renown = CASE WHEN ${reward} THEN ? ELSE 0 END,
        discovery_roll_key = CASE WHEN ${reward} THEN ? ELSE NULL END
        WHERE id = ? AND completed_at IS NULL AND attempts = ? AND ${activeMember}`,
        )
        .bind(
          now,
          effect ?? null,
          resolutionId,
          selected,
          ...params,
          payout.renown,
          ...params,
          discovery?.key ?? null,
          id,
          row.attempts,
          memberId,
        ),
      db
        .prepare(
          `INSERT INTO reward_ledger (character_id, source_type, source_id, skill, xp, skill_xp, gold, awarded_at)
        SELECT character_id, 'business', id, ?, CASE WHEN full_reward THEN ? ELSE ? END,
          CASE WHEN full_reward THEN ? ELSE ? END, CASE WHEN full_reward THEN ? ELSE ? END, ?
        FROM (SELECT character_id, id, ${reward} AS full_reward FROM business_cases WHERE id = ? AND resolution_id = ?)`,
        )
        .bind(
          view.skill,
          payout.xp,
          reducedCasePayout.xp,
          payout.skillXp,
          reducedCasePayout.skillXp,
          payout.gold,
          reducedCasePayout.gold,
          now,
          ...params,
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
