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

Members start a standing order from the character panel. One complete five-minute cycle pays character XP, XP in the selected skill and gold. Switching settles the old order before changing stations. Each skill retains its unfinished cycle. The server caps disconnected earning time at 24 hours and records each payout in the reward ledger. Apply `0005_standing_orders.sql` before deploying a Worker that uses this feature.
