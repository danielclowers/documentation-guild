# Guild account operations

## Invitations

In **Guild administration**, create a link for one coworker and copy it directly to them. Links expire in seven days and are displayed only when created. Use **Revoke** to invalidate an unused link. If redemption was interrupted, the coworker can reopen the original link and retry with the same username after two minutes. If the account already exists, they should sign in with the password they first submitted. The server looks up the original Clerk account by its reservation identifier before trying to create one.

## Membership and password recovery

- **Suspend** immediately prevents new authenticated guild API requests. **Reinstate** restores membership and retains the character.
- A signed-in member can change their password using Clerk reverification.
- For a forgotten password, first verify the coworker's identity in a trusted channel. Use **Recover** on their member record and send them the resulting 30-minute link privately. Issuing a replacement invalidates earlier unused links. If Clerk cannot confirm a reset, the member can try the new password or ask for a replacement link.
- The admin can read recent membership, invitation, and recovery issuance events through `GET /api/v1/admin/audit`. The log records internal IDs and actions. Passwords and raw links are excluded.

If a revoked or expired invite leaves a Clerk user without membership, confirm the invite and user are related before performing any Clerk cleanup. Those accounts cannot access the guild.
