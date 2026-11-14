import type { D1Database } from '@cloudflare/workers-types';
import { expeditionDay } from '@guild/shared';
import type { GuildRecap } from '@guild/shared';
import { expeditionEvents, missions, type ExpeditionSnapshot } from '../expeditions/content';

export async function playerRecap(
  db: D1Database,
  member: string,
  since: number,
  now: number,
): Promise<GuildRecap> {
  const [standing, returned, counts, rosters, resolutions] = await db.batch([
    db
      .prepare(
        `SELECT COALESCE(SUM(r.xp),0) AS xp, COALESCE(SUM(r.skill_xp),0) AS skillXp, COALESCE(SUM(r.gold),0) AS gold
      FROM reward_ledger r JOIN characters c ON c.id = r.character_id
      WHERE c.member_id = ? AND r.source_type = 'standing_order' AND r.awarded_at >= ?`,
      )
      .bind(member, since),
    db
      .prepare(
        `SELECT p.id, p.mission, r.xp, r.gold FROM expedition_members e JOIN expedition_parties p ON p.id = e.party_id
      JOIN reward_ledger r ON r.character_id = e.character_id AND r.source_type = 'expedition' AND r.source_id = p.id
      WHERE e.member_id = ? AND p.state = 'completed' AND e.released_at >= ? ORDER BY p.ends_at DESC LIMIT 10`,
      )
      .bind(member, since),
    db
      .prepare(
        `SELECT
      (SELECT COUNT(*) FROM personal_discoveries d JOIN characters c ON c.id = d.character_id
        WHERE c.member_id = ?1 AND d.discovered_at >= ?2) AS discoveries,
      (SELECT COUNT(*) FROM expedition_invites i JOIN expedition_parties p ON p.id = i.party_id
        WHERE i.member_id = ?1 AND p.state IN ('recruiting', 'grace')
        AND NOT EXISTS (SELECT 1 FROM expedition_members WHERE member_id = ?1 AND released_at IS NULL)
        AND (SELECT COUNT(*) FROM expedition_members e JOIN members m ON m.id = e.member_id
          WHERE e.party_id = p.id AND e.released_at IS NULL AND m.status = 'active') < 4)
        AS invitations,
      (SELECT COUNT(*) FROM guild_renown_milestones WHERE reached_at >= ?2) +
      (SELECT COUNT(*) FROM expedition_chronicle c JOIN expedition_parties p ON p.id = c.party_id WHERE p.ends_at >= ?2)
        AS milestones`,
      )
      .bind(member, since),
    db
      .prepare(
        `SELECT p.id, p.mission, p.seed, p.started_at, p.ends_at, p.modifier, e.snapshot
      FROM expedition_members e JOIN expedition_parties p ON p.id = e.party_id
      WHERE e.member_id = ? AND e.snapshot IS NOT NULL AND p.state IN ('running','completed') AND p.ends_at > ?`,
      )
      .bind(member, now - expeditionDay),
    db
      .prepare(
        `SELECT e.party_id, e.slot, e.success, e.retried FROM expedition_events e JOIN expedition_parties p ON p.id = e.party_id
      WHERE e.member_id = ? AND p.state IN ('running','completed') AND p.ends_at > ?`,
      )
      .bind(member, now - expeditionDay),
  ]);
  const roster = rosters!.results as {
    id: string;
    mission: string;
    seed: number;
    started_at: number;
    ends_at: number;
    modifier: string | null;
    snapshot: string;
  }[];
  const outcomes = resolutions!.results as {
    party_id: string;
    slot: number;
    success: number;
    retried: number;
  }[];
  let challenges = 0;
  for (const party of roster) {
    const snapshot = JSON.parse(party.snapshot) as ExpeditionSnapshot;
    const attempts = outcomes.filter((item) => item.party_id === party.id);
    for (const event of expeditionEvents(
      missions.get(party.mission)!,
      party.seed,
      member,
      party.started_at,
      party.ends_at,
      party.modifier,
    )) {
      if (now < event.availableAt || now >= event.expiresAt) continue;
      const outcome = attempts.find((item) => item.slot === event.slot);
      if (
        !outcome ||
        (outcome.success === 0 &&
          event.deductionClue &&
          snapshot.specialization === 'Investigator' &&
          !attempts.some(({ retried }) => retried))
      )
        challenges++;
    }
  }
  return {
    checkedAt: now,
    standing: standing!.results[0] as GuildRecap['standing'],
    returned: (
      returned!.results as { id: string; mission: string; xp: number; gold: number }[]
    ).map(({ id, mission, xp, gold }) => ({ id, title: missions.get(mission)!.title, xp, gold })),
    ...(counts!.results[0] as Pick<GuildRecap, 'discoveries' | 'invitations' | 'milestones'>),
    challenges,
  };
}
