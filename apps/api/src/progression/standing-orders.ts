import type { D1Database } from '@cloudflare/workers-types';
import {
  specializationCooldown,
  skillLevel,
  skillSchema,
  standingOrderInterval,
  standingOrders,
} from '@guild/shared';
import type { CharacterProgression, Skill, Specialization, TrainingKey } from '@guild/shared';

const timeColumns = {
  Scribing: 'scribing_ms',
  Research: 'research_ms',
  Restoration: 'restoration_ms',
} as const;

type OrderState = {
  character_id: string;
  skill: Skill;
  accounted_at: number;
  suspended_at: number | null;
  version: number;
  specialization: Specialization | null;
} & Record<(typeof timeColumns)[Skill], number>;

export function orderAccrual(order: OrderState, now: number, connectedSince?: number) {
  const end = Math.max(order.accounted_at, Math.min(now, order.suspended_at ?? now));
  const start = Math.max(order.accounted_at, connectedSince ?? end);
  const elapsed = order[timeColumns[order.skill]] + Math.max(0, end - start);
  return {
    end,
    elapsed,
    units: Math.floor(elapsed / standingOrderInterval),
    remainder: elapsed % standingOrderInterval,
  };
}

export async function settleStandingOrder(
  db: D1Database,
  memberId: string,
  {
    now = Date.now(),
    connectedSince,
    skill,
    checkpoint = false,
  }: {
    now?: number;
    connectedSince?: number;
    skill?: Skill;
    checkpoint?: boolean;
  } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await db
      .prepare(
        `SELECT so.*, ch.id AS character_id, ch.specialization FROM characters ch
      JOIN members m ON m.id = ch.member_id LEFT JOIN standing_orders so ON so.character_id = ch.id
      WHERE m.id = ? AND m.status = 'active'`,
      )
      .bind(memberId)
      .first<OrderState>();
    if (!current) return false;
    if (!current.skill) {
      if (!skill) return false;
      const [insert] = await db.batch([
        db
          .prepare(
            `INSERT INTO standing_orders (character_id, skill, accounted_at)
          SELECT ch.id, ?, ? FROM characters ch JOIN members m ON m.id = ch.member_id
          WHERE m.id = ? AND m.status = 'active' ON CONFLICT (character_id) DO NOTHING`,
          )
          .bind(skill, now, memberId),
        db
          .prepare(
            `UPDATE characters SET hall_station = ?, hall_station_at = ?
          WHERE member_id = ? AND changes() = 1`,
          )
          .bind(standingOrders[skill].station, now, memberId),
      ]);
      if (insert?.meta.changes) return true;
      continue;
    }
    const next = orderAccrual(current, now, connectedSince);
    const switching = skill !== undefined && skill !== current.skill;
    if (!switching && !next.units && !checkpoint) return false;
    const batch = [];
    if (next.units) {
      const rate = standingOrders[current.skill];
      const gold = next.units * rate.gold;
      const bonus =
        current.skill === 'Scribing' && current.specialization === 'Chronicler'
          ? Math.floor(gold / 10)
          : 0;
      batch.push(
        db
          .prepare(
            `INSERT INTO reward_ledger (character_id, source_type, source_id, skill, xp, skill_xp, gold, awarded_at)
        SELECT so.character_id, 'standing_order', CAST(so.version AS TEXT), so.skill, ?, ?, ?, ?
        FROM standing_orders so JOIN characters ch ON ch.id = so.character_id JOIN members m ON m.id = ch.member_id
        WHERE m.id = ? AND m.status = 'active' AND so.version = ?`,
          )
          .bind(
            next.units * rate.xp,
            next.units * rate.skillXp,
            gold + bonus,
            next.end,
            memberId,
            current.version,
          ),
      );
    }
    const updateIndex = batch.length;
    batch.push(
      db
        .prepare(
          `UPDATE standing_orders SET skill = ?, accounted_at = ?,
      ${timeColumns[current.skill]} = ?, version = version + 1 WHERE character_id = ? AND version = ?
      AND EXISTS (SELECT 1 FROM members WHERE id = ? AND status = 'active')`,
        )
        .bind(
          skill ?? current.skill,
          next.end,
          next.remainder,
          current.character_id,
          current.version,
          memberId,
        ),
    );
    if (switching)
      batch.push(
        db
          .prepare(
            `UPDATE characters SET hall_station = ?, hall_station_at = ?
      WHERE member_id = ? AND changes() = 1`,
          )
          .bind(standingOrders[skill].station, Math.max(now, current.accounted_at), memberId),
      );
    const result = await db.batch(batch);
    if (result[updateIndex]?.meta.changes) return switching || next.units > 0;
  }
  throw new Error('Standing order changed concurrently');
}

export async function characterProgression(
  db: D1Database,
  characterId: string,
  connectedSince?: number,
): Promise<CharacterProgression> {
  const [orderResult, skillResult, rewardResult, trainingResult, specResult] = await db.batch([
    db.prepare('SELECT * FROM standing_orders WHERE character_id = ?').bind(characterId),
    db.prepare('SELECT skill, xp FROM character_skills WHERE character_id = ?').bind(characterId),
    db
      .prepare(
        `SELECT skill, xp, skill_xp AS skillXp, gold, awarded_at AS at FROM reward_ledger
      WHERE character_id = ? AND source_type = 'standing_order' ORDER BY awarded_at DESC LIMIT 1`,
      )
      .bind(characterId),
    db
      .prepare('SELECT upgrade_key AS key, rank FROM training_purchases WHERE character_id = ?')
      .bind(characterId),
    db
      .prepare(
        'SELECT specialization, specialization_switched_at AS switchedAt FROM characters WHERE id = ?',
      )
      .bind(characterId),
  ]);
  const order = orderResult?.results[0] as OrderState | undefined;
  const rows = (skillResult?.results ?? []) as { skill: Skill; xp: number }[];
  const skills = Object.fromEntries(
    skillSchema.options.map((skill) => {
      const xp = rows.find((row) => row.skill === skill)?.xp ?? 0;
      return [skill, { xp, level: skillLevel(xp) }];
    }),
  ) as CharacterProgression['skills'];
  const training = (trainingResult?.results ?? []) as { key: TrainingKey; rank: number }[];
  const spec = specResult?.results[0] as
    { specialization: Specialization | null; switchedAt: number | null } | undefined;
  return {
    training: Object.fromEntries(training.map(({ key, rank }) => [key, rank])),
    specialization: spec?.specialization ?? null,
    canSwitchAt: spec?.switchedAt == null ? null : spec.switchedAt + specializationCooldown,
    order: order
      ? {
          skill: order.skill,
          remainingMs: Math.max(
            0,
            standingOrderInterval - orderAccrual(order, Date.now(), connectedSince).elapsed,
          ),
          running: connectedSince !== undefined && order.suspended_at === null,
        }
      : null,
    skills,
    latestReward:
      (rewardResult?.results[0] as CharacterProgression['latestReward'] | undefined) ?? null,
  };
}
