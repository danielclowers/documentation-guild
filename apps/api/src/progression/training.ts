import type { D1Database } from '@cloudflare/workers-types';
import {
  characterXpForLevel,
  specializationCooldown,
  specializationLevel,
  specializationSwitchCost,
  trainingCosts,
  trainingLevel,
} from '@guild/shared';
import type { Specialization, TrainingKey } from '@guild/shared';

export async function purchaseTraining(
  db: D1Database,
  memberId: string,
  key: TrainingKey,
  expectedRank: number,
) {
  const cost = trainingCosts[expectedRank];
  if (cost === undefined) return false;
  const [purchase] = await db.batch([
    db
      .prepare(
        `INSERT INTO training_purchases (character_id, upgrade_key, rank)
      SELECT ch.id, ?, ? FROM characters ch JOIN members m ON m.id = ch.member_id
      WHERE m.id = ? AND m.status = 'active' AND ch.total_xp >= ? AND ch.gold >= ?
        AND COALESCE((SELECT rank FROM training_purchases WHERE character_id = ch.id AND upgrade_key = ?), 0) = ?
      ON CONFLICT (character_id, upgrade_key) DO UPDATE SET rank = excluded.rank`,
      )
      .bind(
        key,
        expectedRank + 1,
        memberId,
        characterXpForLevel(trainingLevel),
        cost,
        key,
        expectedRank,
      ),
    db
      .prepare(
        'UPDATE characters SET gold = gold - ?, version = version + 1 WHERE member_id = ? AND changes() = 1',
      )
      .bind(cost, memberId),
  ]);
  return purchase?.meta.changes === 1;
}

export async function chooseSpecialization(
  db: D1Database,
  memberId: string,
  specialization: Specialization,
  expected: Specialization | null,
  now = Date.now(),
) {
  const cost = expected ? specializationSwitchCost : 0;
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE characters SET specialization = ?, gold = gold - ?, version = version + 1,
      specialization_switched_at = CASE WHEN specialization IS NULL THEN NULL ELSE ? END
      WHERE member_id = ? AND specialization IS ? AND total_xp >= ? AND gold >= ?
        AND (specialization_switched_at IS NULL OR specialization_switched_at <= ?)
        AND EXISTS (SELECT 1 FROM members WHERE id = ? AND status = 'active')`,
      )
      .bind(
        specialization,
        cost,
        now,
        memberId,
        expected,
        characterXpForLevel(specializationLevel),
        cost,
        now - specializationCooldown,
        memberId,
      ),
    // Invalidate any payout calculation already in flight with the old specialization.
    db
      .prepare(
        `UPDATE standing_orders SET version = version + 1
      WHERE character_id = (SELECT id FROM characters WHERE member_id = ?) AND changes() = 1`,
      )
      .bind(memberId),
  ]);
  return update?.meta.changes === 1;
}
