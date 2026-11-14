import type { D1Database } from '@cloudflare/workers-types';
import { expeditionRewards } from '@guild/shared';
import type { ExpeditionBoard, ExpeditionParty } from '@guild/shared';
import {
  type ExpeditionSnapshot,
  discoveries,
  expeditionEvents,
  missions,
  modifiers,
  modifierView,
  optionalDiscovery,
  roll,
} from './content';
import { eventEffects } from './events';
import type { PartyRow } from './parties';
import {
  chapterProgressSql,
  chronicle,
  storyCluesSql,
  type ChapterProgress,
  type StoryClue,
} from '../story/chronicle';

export async function expeditionBoard(
  db: D1Database,
  member: string,
  now: number,
): Promise<ExpeditionBoard> {
  const visible = `SELECT p.id FROM expedition_parties p WHERE p.state IN ('recruiting','grace','running')
    OR (p.state IN ('completed','failed','cancelled','expired') AND EXISTS (SELECT 1 FROM expedition_members e
      WHERE e.party_id = p.id AND e.member_id = ? AND (e.snapshot IS NOT NULL OR e.released_at >= p.closed_at)))
    ORDER BY CASE WHEN p.state IN ('recruiting','grace','running') THEN 0 ELSE 1 END, p.created_at DESC LIMIT 50`;
  const [parties, roster, outcomes, invitees, invitations, progress, clues] = await db.batch([
    db
      .prepare(
        `WITH visible AS (${visible}) SELECT p.*, (SELECT COALESCE(SUM(e.renown),0) FROM expedition_events e
          WHERE e.party_id = p.id) AS event_renown FROM visible JOIN expedition_parties p ON p.id = visible.id
          ORDER BY CASE WHEN p.state IN ('recruiting','grace','running') THEN 0 ELSE 1 END, p.created_at DESC`,
      )
      .bind(member),
    db
      .prepare(
        `WITH visible AS (${visible}) SELECT e.party_id, e.member_id AS id, COALESCE(json_extract(e.snapshot,'$.name'), c.display_name) AS name, e.role, e.approach,
      e.snapshot, r.xp, r.skill_xp AS skillXp, r.gold
      FROM expedition_members e JOIN characters c ON c.id = e.character_id JOIN expedition_parties p ON p.id = e.party_id
      JOIN visible v ON v.id = p.id JOIN members m ON m.id = e.member_id
      LEFT JOIN reward_ledger r ON r.character_id = e.character_id AND r.source_type = 'expedition' AND r.source_id = p.id
      WHERE (e.released_at IS NULL AND m.status = 'active') OR e.snapshot IS NOT NULL
      OR (p.state IN ('cancelled','expired') AND e.released_at >= p.closed_at) ORDER BY e.joined_at`,
      )
      .bind(member),
    db
      .prepare(
        `WITH visible AS (${visible}) SELECT e.party_id, e.slot, e.option_id, e.success, e.renown, e.retried, d.discovery_key, COALESCE(r.xp,0) AS xp, COALESCE(r.gold,0) AS gold
      FROM expedition_events e JOIN visible v ON v.id = e.party_id JOIN expedition_members m ON m.party_id = e.party_id AND m.member_id = e.member_id
      LEFT JOIN reward_ledger r ON r.character_id = m.character_id AND r.source_type = 'expedition_event' AND r.source_id = e.party_id || ':' || e.slot
      LEFT JOIN personal_discoveries d ON d.character_id = m.character_id AND d.source_type = 'expedition_event' AND d.source_id = e.party_id || ':' || e.slot
      WHERE e.member_id = ?`,
      )
      .bind(member, member),
    db
      .prepare(
        "SELECT m.id, c.display_name AS name FROM members m JOIN characters c ON c.member_id = m.id WHERE m.status = 'active' AND m.id <> ? ORDER BY c.display_name",
      )
      .bind(member),
    db
      .prepare(
        `WITH visible AS (${visible}) SELECT i.party_id FROM expedition_invites i JOIN visible v ON v.id = i.party_id WHERE i.member_id = ?`,
      )
      .bind(member, member),
    db.prepare(chapterProgressSql),
    db.prepare(storyCluesSql),
  ]);
  type Roster = ExpeditionParty['roster'][number] & {
    party_id: string;
    snapshot: string | null;
    xp: number | null;
    skillXp: number;
    gold: number;
  };
  type Outcome = {
    party_id: string;
    slot: number;
    option_id: string;
    success: number;
    xp: number;
    gold: number;
    renown: number;
    retried: number;
    discovery_key: string | null;
  };
  const inviteRows = invitations!.results as { party_id: string }[];
  const story = chronicle(progress!.results as ChapterProgress[], clues!.results as StoryClue[]);
  const members = roster!.results as Roster[];
  const events = outcomes!.results as Outcome[];
  return {
    missions: [...missions.values()].map((m) => ({
      key: m.key,
      title: m.title,
      summary: m.summary,
      minutes: m.duration_minutes,
      tier: m.tier,
      recommendedLevel: m.recommended_level,
      unlocked: story.some(({ key }) => key === m.chapter),
      approaches: m.approaches.map(({ key, label, description }) => ({ key, label, description })),
    })),
    modifiers: [...modifiers.values()].map(modifierView),
    invitees: invitees!.results as ExpeditionBoard['invitees'],
    parties: (parties!.results as (PartyRow & { event_renown: number })[]).map((p) => {
      const mission = missions.get(p.mission)!;
      const modifier = p.modifier ? modifiers.get(p.modifier) : undefined;
      const rows = members.filter((item) => item.party_id === p.id);
      const me = rows.find((item) => item.id === member);
      const personal =
        me?.snapshot &&
        p.started_at !== null &&
        p.ends_at !== null &&
        ['running', 'completed'].includes(p.state)
          ? expeditionEvents(mission, p.seed, member, p.started_at, p.ends_at, p.modifier).map(
              (event) => {
                const outcome = events.find(
                  (item) => item.party_id === p.id && item.slot === event.slot,
                );
                const retry =
                  outcome?.success === 0 &&
                  Boolean(event.deductionClue) &&
                  (JSON.parse(me.snapshot!) as ExpeditionSnapshot).specialization ===
                    'Investigator' &&
                  !events.some((item) => item.party_id === p.id && item.retried);
                return {
                  slot: event.slot,
                  title: event.title,
                  context: event.deductionClue
                    ? event.context + ' ' + event.deductionClue
                    : event.context,
                  retry,
                  skill: event.skill,
                  availableAt: event.availableAt,
                  expiresAt: event.expiresAt,
                  options:
                    now >= event.availableAt && now < event.expiresAt && (!outcome || retry)
                      ? event.options
                          .filter(({ id }) => id !== outcome?.option_id)
                          .map(({ id, label, effect }) => ({
                            id,
                            label,
                            effect:
                              effect === 'guild_renown' && me.role === 'Scribing'
                                ? '+6 renown on success with your Scribing role'
                                : eventEffects[effect],
                          }))
                      : [],
                  result: outcome
                    ? {
                        success: Boolean(outcome.success),
                        xp: outcome.xp,
                        gold: outcome.gold,
                        renown: outcome.renown,
                        discovery: outcome.discovery_key
                          ? discoveries.get(outcome.discovery_key)?.title
                          : undefined,
                        text: outcome.success
                          ? (event.options.find(({ id }) => id === outcome.option_id)
                              ?.consequence ?? 'You helped the party.')
                          : 'The attempt fell short. The expedition’s baseline rewards are safe.',
                      }
                    : undefined,
                };
              },
            )
          : [];
      return {
        id: p.id,
        mission: p.mission,
        leaderId: p.leader_id,
        modifier: modifier && modifierView(modifier),
        state: p.state,
        scheduledAt: p.scheduled_at,
        graceUntil: p.grace_until,
        startedAt: p.started_at,
        endsAt: p.ends_at,
        roster: rows.map(({ id, name, role, approach }) => ({ id, name, role, approach })),
        events: personal,
        invited: inviteRows.some((item) => item.party_id === p.id),
        report:
          p.state === 'completed'
            ? {
                text: mission.story_beats.return,
                reward:
                  me?.xp != null
                    ? {
                        xp: me.xp,
                        skillXp: me.skillXp,
                        gold: me.gold,
                        renown: expeditionRewards[mission.tier].renown,
                      }
                    : undefined,
                sharedRenown: p.baseline_renown + p.shared_bonus + p.event_renown,
                discovery:
                  p.shared_discovery === 1
                    ? optionalDiscovery(roll(p.seed, 'shared-item')).title
                    : null,
              }
            : p.state === 'running'
              ? {
                  text:
                    now >= p.started_at! + (p.ends_at! - p.started_at!) / 2
                      ? mission.story_beats.midpoint
                      : mission.story_beats.departure,
                  sharedRenown: 0,
                  discovery: null,
                }
              : undefined,
      };
    }),
    chronicle: story,
  };
}
