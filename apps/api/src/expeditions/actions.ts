import type { D1Database } from '@cloudflare/workers-types';
import { expeditionDay, expeditionMinute } from '@guild/shared';

export async function leaveParty(db: D1Database, id: string, member: string, now: number) {
  return (
    (
      await db
        .prepare(
          `UPDATE expedition_members SET released_at = ? WHERE party_id = ? AND member_id = ? AND released_at IS NULL
    AND EXISTS (SELECT 1 FROM expedition_parties p WHERE p.id = ?
      AND (p.state = 'grace' AND p.grace_until > ? OR p.state = 'recruiting' AND
        (p.scheduled_at > ? OR p.scheduled_at IS NULL AND p.created_at > ?)))
    AND member_id <> (SELECT leader_id FROM expedition_parties WHERE id = ?)`,
        )
        .bind(now, id, member, id, now, now, now - expeditionDay, id)
        .run()
    ).meta.changes === 1
  );
}

export async function transferParty(
  db: D1Database,
  id: string,
  member: string,
  former: string,
  now: number,
  absentBefore: number,
) {
  return (
    (
      await db
        .prepare(
          `UPDATE expedition_parties SET leader_id = ?, leader_since = ? WHERE id = ? AND leader_id = ?
    AND state = 'recruiting' AND scheduled_at IS NULL AND leader_since <= ? AND created_at > ?
    AND EXISTS (SELECT 1 FROM expedition_members e JOIN members m ON m.id = e.member_id
      WHERE e.party_id = ? AND e.member_id = ? AND e.released_at IS NULL AND m.status = 'active')`,
        )
        .bind(member, now, id, former, absentBefore, now - expeditionDay, id, member)
        .run()
    ).meta.changes === 1
  );
}

export async function rescheduleParty(
  db: D1Database,
  id: string,
  member: string,
  delay: number,
  now: number,
) {
  return (
    (
      await db
        .prepare(
          `UPDATE expedition_parties SET scheduled_at = ? WHERE id = ? AND leader_id = ?
    AND state = 'recruiting' AND scheduled_at > ?`,
        )
        .bind(now + delay * expeditionMinute, id, member, now)
        .run()
    ).meta.changes === 1
  );
}

export async function inviteToParty(db: D1Database, id: string, leader: string, member: string) {
  return (
    (
      await db
        .prepare(
          `INSERT OR IGNORE INTO expedition_invites (party_id, member_id)
    SELECT p.id, m.id FROM expedition_parties p CROSS JOIN members m JOIN characters c ON c.member_id = m.id
    WHERE p.id = ? AND p.leader_id = ? AND p.state IN ('recruiting','grace') AND m.id = ? AND m.status = 'active' AND m.id <> p.leader_id`,
        )
        .bind(id, leader, member)
        .run()
    ).meta.changes === 1
  );
}
