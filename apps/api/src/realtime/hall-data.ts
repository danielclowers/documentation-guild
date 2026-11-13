import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import { characterLevel } from '@guild/shared';
import type { HallMember, Skill } from '@guild/shared';
import { settleStandingOrder } from '../progression/standing-orders';

export type HallCharacter = Omit<HallMember, 'presence' | 'arrivalAt' | 'slot'>;
export interface HallBindings {
  DB: D1Database;
  GUILD_ROOM?: DurableObjectNamespace;
}

export async function hallCharacters(db: D1Database, ids: string[]): Promise<HallCharacter[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT m.id, c.display_name AS displayName, c.hair_style AS hairStyle,
    c.hair_color AS hairColor, c.tunic_color AS tunicColor, c.total_xp AS xp, c.hall_station AS station,
    c.hall_station_at AS stationAt,
    (SELECT p.started_at FROM expedition_members e JOIN expedition_parties p ON p.id = e.party_id
      WHERE e.character_id = c.id AND e.snapshot IS NOT NULL AND p.state = 'running' AND p.ends_at > ?) AS expeditionAt
    FROM members m INNER JOIN characters c ON c.member_id = m.id
    WHERE m.status = 'active' AND m.guild_id = 'documentation-guild' AND m.id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(Date.now(), ...ids)
    .all<Omit<HallCharacter, 'level'> & { xp: number }>();
  return results.map(({ xp, ...character }) => ({ ...character, level: characterLevel(xp) }));
}

export function guildRoom(env: HallBindings) {
  return env.GUILD_ROOM?.get(env.GUILD_ROOM.idFromName('documentation-guild'));
}

export async function notifyHall(env: HallBindings, memberId: string, revoked = false) {
  const room = guildRoom(env);
  if (!room) return;
  await room.fetch('https://guild-room.internal/update', {
    method: 'POST',
    body: JSON.stringify({ memberId, revoked }),
  });
}

export async function settleGuildMember(env: HallBindings, memberId: string, skill?: Skill) {
  const room = guildRoom(env);
  if (!room) {
    await settleStandingOrder(env.DB, memberId, { skill });
    return undefined;
  }
  const response = await room.fetch('https://guild-room.internal/settle', {
    method: 'POST',
    body: JSON.stringify({ memberId, skill }),
  });
  if (!response.ok) throw new Error('Standing order settlement unavailable');
  return (await response.json<{ connectedSince?: number }>()).connectedSince;
}

export function checkpointExpedition(env: HallBindings) {
  return async (members: string[], at: number) => {
    const room = guildRoom(env);
    if (!room) return;
    const response = await room.fetch('https://guild-room.internal/departure', {
      method: 'POST',
      body: JSON.stringify({ members, at }),
    });
    if (!response.ok) throw new Error('Expedition checkpoint unavailable');
  };
}
