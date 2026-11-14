import type { D1Database } from '@cloudflare/workers-types';
import type { ExpeditionSnapshot } from './content';
import type { Skill } from '@guild/shared';
import {
  challengeChance,
  expeditionEvents,
  missions,
  modifiers,
  optionalDiscovery,
  roll,
} from './content';
import { findParty } from './parties';

export const eventEffects = {
  reliable_bonus: 'Safer approach · +10 to success chance',
  discovery_chance: 'Chance of a personal discovery',
  guild_renown: '+5 renown on success',
};

export async function resolveEvent(
  db: D1Database,
  partyId: string,
  memberId: string,
  slot: number,
  optionId: string,
  now: number,
  retry = false,
) {
  const party = await findParty(db, partyId);
  if (
    !party ||
    !['running', 'completed'].includes(party.state) ||
    party.started_at === null ||
    party.ends_at === null
  )
    return false;
  const mission = missions.get(party.mission);
  const member = await db
    .prepare(
      `SELECT e.character_id, e.role, e.approach, e.snapshot
    FROM expedition_members e JOIN members m ON m.id = e.member_id
    WHERE e.party_id = ? AND e.member_id = ? AND e.snapshot IS NOT NULL AND m.status = 'active'`,
    )
    .bind(partyId, memberId)
    .first<{ character_id: string; role: Skill; approach: string; snapshot: string }>();
  if (!mission || !member) return false;
  const event = expeditionEvents(
    mission,
    party.seed,
    memberId,
    party.started_at,
    party.ends_at,
    party.modifier,
  )[slot];
  const option = event?.options.find((item) => item.id === optionId);
  if (!event || !option || now < event.availableAt || now >= event.expiresAt) return false;

  const snapshot = JSON.parse(member.snapshot) as ExpeditionSnapshot;
  if (retry && (!event.deductionClue || snapshot.specialization !== 'Investigator')) return false;
  const key = memberId + ':' + slot;
  const modifier = party.modifier ? modifiers.get(party.modifier) : undefined;
  const chance = challengeChance(
    event.skill,
    mission.recommended_level,
    snapshot,
    member.role,
    (mission.approaches.find(({ key }) => key === member.approach)?.strategy_bonus ?? 0) +
      (option.effect === 'reliable_bonus' ? 10 : 0) +
      (party.modifier === 'ancient_wards' &&
      member.approach === 'careful' &&
      event.skill === 'Restoration'
        ? 3
        : 0),
    modifier,
  );
  const success = roll(party.seed, key + ':check') % 100 < chance;
  const renown =
    success && option.effect === 'guild_renown' ? 5 + Number(member.role === 'Scribing') : 0;
  const xpRoll = roll(party.seed, key + ':xp') % 11;
  const goldRoll = roll(party.seed, key + ':gold') % 11;
  const bonusXpRoll =
    party.modifier === 'unstable_enchantments' && event.skill === 'Restoration'
      ? Math.max(xpRoll, roll(party.seed, key + ':modifier-xp') % 11)
      : xpRoll;
  const bonusGoldRoll =
    party.modifier === 'royal_inspection' && event.skill === 'Scribing'
      ? Math.max(goldRoll, roll(party.seed, key + ':modifier-gold') % 11)
      : goldRoll;
  const xp = success ? Math.floor(((10 + bonusXpRoll) * (100 + snapshot.readiness * 2)) / 100) : 0;
  const gold = success ? 5 + bonusGoldRoll : 0;
  const resolution = crypto.randomUUID();
  const discovery = optionalDiscovery(roll(party.seed, key + ':item'));
  const discoveryChance = Math.min(
    30,
    12 +
      (member.role === 'Research' ? 5 : 0) +
      (member.approach === 'curious' ? 5 : 0) +
      (party.modifier === 'missing_references' && event.skill === 'Research' ? 5 : 0) +
      (event.skill === 'Research' && snapshot.specialization === 'Archivist' ? 8 : 0),
  );
  const sharedDiscovery = optionalDiscovery(roll(party.seed, 'shared-item'));
  // Use a request marker so a concurrent replay cannot run any payout statements.
  const statements = [
    retry
      ? db
          .prepare(
            `UPDATE expedition_events SET option_id = ?, success = ?, renown = ?, resolved_at = ?, resolution_id = ?, retried = 1
        WHERE party_id = ? AND member_id = ? AND slot = ? AND success = 0 AND option_id <> ?
        AND NOT EXISTS (SELECT 1 FROM expedition_events WHERE party_id = ? AND member_id = ? AND retried = 1)
        AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND state IN ('running','completed'))
        AND EXISTS (SELECT 1 FROM members WHERE id = ? AND status = 'active')`,
          )
          .bind(
            optionId,
            Number(success),
            renown,
            now,
            resolution,
            partyId,
            memberId,
            slot,
            optionId,
            partyId,
            memberId,
            partyId,
            memberId,
          )
      : db
          .prepare(
            `INSERT OR IGNORE INTO expedition_events (party_id, member_id, slot, option_id, success, renown, resolved_at, resolution_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM members m JOIN expedition_parties p ON p.id = ?
      WHERE m.id = ? AND m.status = 'active' AND p.state IN ('running','completed')`,
          )
          .bind(
            partyId,
            memberId,
            slot,
            optionId,
            Number(success),
            renown,
            now,
            resolution,
            partyId,
            memberId,
          ),
    db
      .prepare(
        `INSERT INTO reward_ledger (character_id, source_type, source_id, skill, xp, skill_xp, gold, awarded_at)
      SELECT ?, 'expedition_event', ?, ?, ?, 0, ?, ? FROM expedition_events WHERE resolution_id = ? AND success = 1`,
      )
      .bind(member.character_id, partyId + ':' + slot, event.skill, xp, gold, now, resolution),
    db
      .prepare(
        `UPDATE guilds SET renown = renown + ? WHERE id = 'documentation-guild'
      AND EXISTS (SELECT 1 FROM expedition_events WHERE resolution_id = ? AND renown > 0)`,
      )
      .bind(renown, resolution),
  ];
  if (
    success &&
    option.effect === 'discovery_chance' &&
    roll(party.seed, key + ':discover') % 100 < discoveryChance
  ) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO personal_discoveries
      (character_id, discovery_key, source_type, source_id, discovered_at)
      SELECT ?, ?, 'expedition_event', ?, ? FROM expedition_events WHERE resolution_id = ?`,
        )
        .bind(member.character_id, discovery.key, partyId + ':' + slot, now, resolution),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE expedition_parties SET shared_bonus = 20, resolved_by = ? WHERE id = ? AND shared_bonus = 0
      AND EXISTS (SELECT 1 FROM expedition_events WHERE resolution_id = ?)
      AND (SELECT COUNT(DISTINCT member_id) FROM expedition_events WHERE party_id = ?) >= 2`,
      )
      .bind(resolution, partyId, resolution, partyId),
    db
      .prepare(
        `UPDATE guilds SET renown = renown + 20 WHERE id = 'documentation-guild'
      AND EXISTS (SELECT 1 FROM expedition_parties WHERE id = ? AND resolved_by = ?)`,
      )
      .bind(partyId, resolution),
    db
      .prepare(
        `UPDATE expedition_parties SET shared_discovery = ?, shared_discovered_at = ?, resolved_by = ? WHERE id = ? AND shared_discovery = 0
      AND EXISTS (SELECT 1 FROM expedition_events WHERE resolution_id = ?)
      AND (SELECT COUNT(DISTINCT member_id) FROM expedition_events WHERE party_id = ?) >= 3`,
      )
      .bind(
        roll(party.seed, 'shared-discover') % 100 < 15 ? 1 : -1,
        now,
        resolution + ':discovery',
        partyId,
        resolution,
        partyId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO personal_discoveries (character_id, discovery_key, source_type, source_id, discovered_at)
      SELECT e.character_id, ?, 'expedition_shared', p.id, ? FROM expedition_members e JOIN expedition_parties p ON p.id = e.party_id
      JOIN members m ON m.id = e.member_id
      WHERE p.id = ? AND p.resolved_by = ? AND p.shared_discovery = 1 AND e.snapshot IS NOT NULL AND m.status = 'active'`,
      )
      .bind(sharedDiscovery.key, now, partyId, resolution + ':discovery'),
  );
  const [result] = await db.batch(statements);
  return result?.meta.changes === 1;
}
