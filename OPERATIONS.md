# Guild account operations

## Invitations

In **Guild administration**, create a link for one coworker and copy it directly to them. Links expire in seven days and are displayed only when created. Use **Revoke** to invalidate an unused link. If redemption was interrupted, the coworker can reopen the original link and retry with the same username after two minutes. If the account already exists, they should sign in with the password they first submitted. The server looks up the original Clerk account by its reservation identifier before trying to create one.

## Membership and password recovery

- **Suspend** immediately prevents new authenticated guild API requests. **Reinstate** restores membership and retains the character.
- A signed-in member can change their password using Clerk reverification.
- For a forgotten password, first verify the coworker's identity in a trusted channel. Use **Recover** on their member record and send them the resulting 30-minute link privately. Issuing a replacement invalidates earlier unused links. If Clerk cannot confirm a reset, the member can try the new password or ask for a replacement link.
- The admin can read recent membership, invitation, and recovery issuance events through `GET /api/v1/admin/audit`. The log records internal IDs and actions. Passwords and raw links are excluded.

If a revoked or expired invite leaves a Clerk user without membership, confirm the invite and user are related before performing any Clerk cleanup. Those accounts cannot access the guild.

## Shared hall

The roster includes authenticated members who have a current hall connection. Multiple tabs share one avatar. A 20-second heartbeat tracks connections, and a socket expires after 60 seconds without a heartbeat. Membership is rechecked periodically and suspension closes the member's sockets. When deploying the hall, apply D1 migration `0004_hall_presence.sql` and keep the `hall-v1` Durable Object migration in the Worker config. [Hosted API health](https://documentation-guild-preview.guild-api.workers.dev/health)

## Standing orders

Members start a standing order from the character panel. One complete five-minute cycle pays character XP, XP in the selected skill and gold. Switching settles the old order before changing stations. Each skill retains its unfinished cycle. Standing orders count connected time, including idle time. Closing the last tab saves the unfinished cycle. If a connection drops without a clean close, the server counts time through the last confirmed heartbeat. The reward ledger records each payout. Apply `0005_standing_orders.sql` before deploying a Worker that uses this feature.

## Training and specialization

Training opens at level 3 and costs 100, 200, and 350 gold per upgrade. The first specialization is free at level 10. Switching costs 200 gold and starts a 24-hour cooldown. Training and skill XP persist through switches. Each specialization applies to the activity described on the training panel. Apply `0006_character_training.sql` before deploying the updated Worker.

## Guild Business

Members can open Guild Business in their character panel and choose among three personal cases. The board refills when a case is complete. The first eight full payouts in a rolling 24-hour window include skill XP and a discovery chance. Later cases stay playable for 5 character XP and 2 gold. Apply `0007_guild_business.sql` before deploying the updated Worker.

## Cooperative expeditions

An active guild member can create a party at the Expedition Board and invite other members. Joining selects a role and approach and reserves one of four spots. A manual party can depart with two ready players and closes after 24 hours. Another member can claim manual leadership after five minutes of leader absence. A scheduled party departs at its assigned time with two ready players, or enters one 15-minute extension. A second eligible join during the extension launches the party immediately.

The Worker records departure and return times. Disconnects preserve the roster, and the scheduled Worker credits eligible party members on return even when the hall is empty. Connected standing orders pause during the expedition and keep their partial cycles. Guild Business remains available. Individual bonus challenges open during the run and stay available for 24 hours after return. Optional results and shared rewards appear in each member's report.

If an expedition is unrecoverable, a guild admin can end it from the board. The Worker releases the roster, ends the standing-order pause, and records `expedition.failed` in the audit log. Completed optional rewards remain credited. Expeditions have no entry fee. Check Worker Cron Trigger logs and `/health` if scheduled parties appear stuck.

## Journal, activity and return summary

Journal & Chronicle shows previously collected personal discoveries, two connected mysteries, and unlocked guild story scenes. Required clues come from expedition milestones, and all members can read them. Guild activity shows expedition returns, shared discoveries, story clues, and renown milestones from the last 30 days. The feed does not include personal discoveries or balances.

While you were away uses the last check-in recorded for this character in the current browser. It shows completed expeditions, open challenges and invitations, discoveries, guild milestones, and standing-order rewards already earned during connected play. A new browser uses a seven-day recap.

From the Expedition Board, a leader can choose one optional modifier for a standard or advanced mission. The board previews its effect before creation. The choice applies to optional challenges and remains fixed for the party. Advanced and tutorial baseline rewards remain the same.
