import type { D1Database } from '@cloudflare/workers-types';
import {
  characterXpForLevel,
  expeditionDay,
  expeditionGrace,
  expeditionMinute,
  expeditionRewards,
} from '@guild/shared';
import type { ExpeditionState, Skill } from '@guild/shared';
import { missions, modifiers } from './content';
import { chapterOneComplete } from '../story/chronicle';

export interface PartyRow {
  id: string;
  mission: string;
  chapter: string;
  modifier: string | null;
  leader_id: string;
  state: ExpeditionState;
  seed: number;
  created_at: number;
  scheduled_at: number | null;
  grace_until: number | null;
  started_at: number | null;
  ends_at: number | null;
  baseline_renown: number;
  shared_bonus: number;
  shared_discovery: number;
}

const ready = `(SELECT COUNT(*) FROM expedition_members e JOIN members m ON m.id = e.member_id
  WHERE e.party_id = expedition_parties.id AND e.released_at IS NULL AND m.status = 'active')`;
const leaderActive = `EXISTS (SELECT 1 FROM members WHERE id = expedition_parties.leader_id AND status = 'active')`;

export async function findParty(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM expedition_parties WHERE id = ?').bind(id).first<PartyRow>();
}

export async function createParty(
  db: D1Database,
  member: string,
  key: string,
  role: Skill,
  approach: string,
  delay: number | null,
  now: number,
  modifier?: string,
) {
  const mission = missions.get(key);
  if (!mission?.approaches.some((item) => item.key === approach)) return false;
  if (modifier && (mission.tier === 'tutorial' || !modifiers.has(modifier))) return false;
  if (mission.chapter === 'chapter2' && !(await chapterOneComplete(db))) return false;
  const id = crypto.randomUUID();
  const [created] = await db.batch([
    db
      .prepare(
        `INSERT INTO expedition_parties (id, mission, chapter, leader_id, state, seed, created_at, leader_since, scheduled_at, modifier)
      SELECT ?, ?, ?, m.id, 'recruiting', ?, ?, ?, ?, ? FROM members m JOIN characters c ON c.member_id = m.id
      WHERE m.id = ? AND m.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM expedition_members WHERE member_id = m.id AND released_at IS NULL)`,
      )
      .bind(
        id,
        key,
        mission.chapter,
        crypto.getRandomValues(new Uint32Array(1))[0]!,
        now,
        now,
        delay === null ? null : now + delay * expeditionMinute,
        modifier ?? null,
        member,
      ),
    db
      .prepare(
        `INSERT INTO expedition_members (party_id, member_id, character_id, role, approach, joined_at)
      SELECT p.id, c.member_id, c.id, ?, ?, ? FROM expedition_parties p JOIN characters c ON c.member_id = p.leader_id WHERE p.id = ?`,
      )
      .bind(role, approach, now, id),
  ]);
  return created?.meta.changes === 1 ? id : false;
}

export async function joinParty(
  db: D1Database,
  id: string,
  member: string,
  role: Skill,
  approach: string,
  now: number,
) {
  const party = await findParty(db, id);
  if (!party || !missions.get(party.mission)?.approaches.some((item) => item.key === approach))
    return false;
  const joined = await db
    .prepare(
      `INSERT INTO expedition_members (party_id, member_id, character_id, role, approach, joined_at)
    SELECT p.id, m.id, c.id, ?, ?, ? FROM expedition_parties p CROSS JOIN members m JOIN characters c ON c.member_id = m.id
    WHERE p.id = ? AND m.id = ? AND m.status = 'active'
    AND ((p.state = 'recruiting' AND (p.scheduled_at > ? OR (p.scheduled_at IS NULL AND p.created_at > ?)))
      OR (p.state = 'grace' AND p.grace_until > ?))
    AND (SELECT COUNT(*) FROM expedition_members e JOIN members pm ON pm.id = e.member_id
      WHERE e.party_id = p.id AND e.released_at IS NULL AND pm.status = 'active') < CASE p.state WHEN 'grace' THEN 2 ELSE 4 END
    AND NOT EXISTS (SELECT 1 FROM expedition_members WHERE member_id = m.id AND released_at IS NULL)
    ON CONFLICT(party_id, member_id) DO UPDATE SET role = excluded.role, approach = excluded.approach,
      joined_at = excluded.joined_at, released_at = NULL`,
    )
    .bind(role, approach, now, id, member, now, now - expeditionDay, now)
    .run();
  return joined.meta.changes === 1;
}

export type BeforeDeparture = (members: string[], at: number) => Promise<void>;

export async function depart(
  db: D1Database,
  party: PartyRow,
  at: number,
  manualLeader?: string,
  beforeDeparture?: BeforeDeparture,
) {
  const mission = missions.get(party.mission);
  if (!mission) throw new Error('Unknown expedition mission');
  const minimumXp =
    mission.tier === 'advanced' ? characterXpForLevel(mission.recommended_level) : 0;
  const marker = crypto.randomUUID();
  const eligible = manualLeader
    ? "state = 'recruiting' AND scheduled_at IS NULL AND leader_id = ? AND created_at > ?"
    : "((state = 'recruiting' AND scheduled_at = ?) OR (state = 'grace' AND grace_until > ?))";
  const eligibility = `id = ? AND ${eligible} AND ${ready} BETWEEN 2 AND 4 AND ${leaderActive}
      AND EXISTS (SELECT 1 FROM expedition_members e JOIN characters c ON c.id = e.character_id
        JOIN members m ON m.id = e.member_id WHERE e.party_id = expedition_parties.id
        AND e.released_at IS NULL AND m.status = 'active' AND c.total_xp >= ?)`;
  const checks = [
    party.id,
    ...(manualLeader ? [manualLeader, at - expeditionDay] : [at, at]),
    minimumXp,
  ];
  if (beforeDeparture) {
    const roster = await db
      .prepare(
        `SELECT e.member_id FROM expedition_members e JOIN members m ON m.id = e.member_id
      WHERE e.party_id IN (SELECT id FROM expedition_parties WHERE ${eligibility})
      AND e.released_at IS NULL AND m.status = 'active'`,
      )
      .bind(...checks)
      .all<{ member_id: string }>();
    if (!roster.results.length) return false;
    await beforeDeparture(
      roster.results.map(({ member_id }) => member_id),
      at,
    );
  }
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE expedition_parties SET state = 'running', started_at = ?, ends_at = ?, resolved_by = ?
      WHERE ${eligibility}`,
      )
      .bind(at, at + mission.duration_minutes * expeditionMinute, marker, ...checks),
    db
      .prepare(
        `UPDATE expedition_members SET released_at = ? WHERE party_id = ? AND released_at IS NULL
      AND member_id IN (SELECT id FROM members WHERE status <> 'active')
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(at, party.id, party.id, marker),
    db
      .prepare(
        `UPDATE expedition_members AS e SET snapshot = (SELECT json_object(
        'name', c.display_name, 'specialization', c.specialization,
        'scribing', COALESCE((SELECT xp FROM character_skills WHERE character_id = c.id AND skill = 'Scribing'),0),
        'research', COALESCE((SELECT xp FROM character_skills WHERE character_id = c.id AND skill = 'Research'),0),
        'restoration', COALESCE((SELECT xp FROM character_skills WHERE character_id = c.id AND skill = 'Restoration'),0),
        'researchTraining', COALESCE((SELECT rank FROM training_purchases WHERE character_id = c.id AND upgrade_key = 'careful_research'),0),
        'readiness', COALESCE((SELECT rank FROM training_purchases WHERE character_id = c.id AND upgrade_key = 'expedition_readiness'),0),
        'steadyHands', COALESCE((SELECT rank FROM training_purchases WHERE character_id = c.id AND upgrade_key = 'steady_hands'),0))
        FROM characters c WHERE c.id = e.character_id)
      WHERE party_id = ? AND released_at IS NULL AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(party.id, party.id, marker),
    db
      .prepare(
        `UPDATE standing_orders SET version = version + 1 WHERE character_id IN
      (SELECT character_id FROM expedition_members WHERE party_id = ? AND snapshot IS NOT NULL)
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(party.id, party.id, marker),
  ]);
  return result?.meta.changes === 1;
}

async function complete(db: D1Database, party: PartyRow, now: number) {
  const mission = missions.get(party.mission);
  if (!mission) throw new Error('Unknown expedition mission');
  const reward = expeditionRewards[mission.tier];
  const marker = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        "UPDATE expedition_parties SET state = 'completed', resolved_by = ? WHERE id = ? AND state = 'running' AND ends_at <= ?",
      )
      .bind(marker, party.id, now),
    db
      .prepare(
        `INSERT INTO reward_ledger (character_id, source_type, source_id, skill, xp, skill_xp, gold, awarded_at)
      SELECT e.character_id, 'expedition', p.id, e.role, ?, ?, ?, p.ends_at
      FROM expedition_members e JOIN expedition_parties p ON p.id = e.party_id JOIN members m ON m.id = e.member_id
      WHERE p.id = ? AND p.resolved_by = ? AND e.snapshot IS NOT NULL AND m.status = 'active'`,
      )
      .bind(reward.xp, reward.skillXp, reward.gold, party.id, marker),
    db
      .prepare(
        `UPDATE expedition_parties SET baseline_renown = ? * (SELECT COUNT(*) FROM reward_ledger WHERE source_type = 'expedition' AND source_id = ?)
      WHERE id = ? AND resolved_by = ?`,
      )
      .bind(reward.renown, party.id, party.id, marker),
    db
      .prepare(
        `UPDATE guilds SET renown = renown + (SELECT baseline_renown FROM expedition_parties WHERE id = ?)
      WHERE id = 'documentation-guild' AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(party.id, party.id, marker),
    db
      .prepare(
        `UPDATE expedition_members SET released_at = ? WHERE party_id = ? AND released_at IS NULL
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(party.ends_at, party.id, party.id, marker),
  ];
  const clues =
    party.chapter === 'chapter1'
      ? ([
          ['missing_chapter', party.mission === 'missing_pages' ? 1 : 3],
          ['unnamed_historian', 3],
        ] as const)
      : ([
          ['prior_draft', 3],
          ['first_margin', 4],
          ['last_editor', 5],
        ] as const);
  for (const [clue, count] of clues)
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO expedition_chronicle (clue, chapter, party_id)
    SELECT ?, chapter, id FROM expedition_parties WHERE id = ? AND resolved_by = ?
    AND (SELECT COUNT(*) FROM expedition_parties WHERE state = 'completed' AND chapter = ?) >= ?`,
        )
        .bind(clue, party.id, marker, party.chapter, count),
    );
  await db.batch(statements);
}

export async function closeParty(
  db: D1Database,
  id: string,
  now: number,
  state: 'cancelled' | 'expired' | 'failed',
  actor?: string,
) {
  const marker = crypto.randomUUID();
  const predicate =
    state === 'failed'
      ? "state = 'running'"
      : state === 'cancelled'
        ? "state IN ('recruiting','grace') AND leader_id = ?"
        : "((state = 'grace' AND grace_until <= ?) OR (state = 'recruiting' AND scheduled_at IS NULL AND created_at <= ?))";
  const statements = [
    db
      .prepare(
        `UPDATE expedition_parties SET state = ?, resolved_by = ?, closed_at = ?,
      ends_at = CASE WHEN state = 'running' THEN MIN(ends_at, ?) ELSE ends_at END WHERE id = ? AND ${predicate}`,
      )
      .bind(
        state,
        marker,
        now,
        now,
        id,
        ...(state === 'cancelled'
          ? [actor!]
          : state === 'expired'
            ? [now, now - expeditionDay]
            : []),
      ),
    db
      .prepare(
        `UPDATE expedition_members SET released_at = ? WHERE party_id = ? AND released_at IS NULL
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(now, id, id, marker),
  ];
  if (state === 'failed')
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_log (id, actor_member_id, action, object_id, created_at)
      SELECT ?, ?, 'expedition.failed', id, ? FROM expedition_parties WHERE id = ? AND resolved_by = ?`,
        )
        .bind(marker, actor!, now, id, marker),
      db
        .prepare(
          `UPDATE standing_orders SET version = version + 1 WHERE character_id IN
      (SELECT character_id FROM expedition_members WHERE party_id = ? AND snapshot IS NOT NULL)
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
        )
        .bind(id, id, marker),
    );
  const [result] = await db.batch(statements);
  return result?.meta.changes === 1;
}

export async function reconcileExpeditions(
  db: D1Database,
  now: number,
  onlyId?: string,
  beforeDeparture?: BeforeDeparture,
) {
  const { results } = await db
    .prepare(
      `SELECT * FROM expedition_parties WHERE
    ((state = 'recruiting' AND (scheduled_at <= ? OR (scheduled_at IS NULL AND created_at <= ?)))
      OR state = 'grace' OR (state = 'running' AND ends_at <= ?))
    ${onlyId ? 'AND id = ?' : ''} ORDER BY COALESCE(ends_at, scheduled_at, created_at), id`,
    )
    .bind(now, now - expeditionDay, now, ...(onlyId ? [onlyId] : []))
    .all<PartyRow>();
  for (let party of results) {
    if (party.state === 'recruiting' && party.scheduled_at !== null) {
      const departed = await depart(db, party, party.scheduled_at, undefined, beforeDeparture);
      if (!departed)
        await db
          .prepare(
            `UPDATE expedition_parties SET state = 'grace', grace_until = scheduled_at + ?
        WHERE id = ? AND state = 'recruiting' AND scheduled_at = ?`,
          )
          .bind(expeditionGrace, party.id, party.scheduled_at)
          .run();
      party = (await findParty(db, party.id)) ?? party;
    }
    if (party.state === 'grace' && party.grace_until !== null) {
      const { results: roster } = await db
        .prepare(
          `SELECT e.joined_at FROM expedition_members e JOIN members m ON m.id = e.member_id
        WHERE e.party_id = ? AND e.released_at IS NULL AND m.status = 'active' ORDER BY e.joined_at LIMIT 2`,
        )
        .bind(party.id)
        .all<{ joined_at: number }>();
      if (roster[1]) {
        await depart(
          db,
          party,
          Math.max(party.scheduled_at!, roster[1].joined_at),
          undefined,
          beforeDeparture,
        );
        party = (await findParty(db, party.id)) ?? party;
      }
    }
    if (party.state === 'running' && party.ends_at !== null && party.ends_at <= now)
      await complete(db, party, now);
    else if (party.state === 'grace' || party.state === 'recruiting')
      await closeParty(db, party.id, now, 'expired');
  }
}
