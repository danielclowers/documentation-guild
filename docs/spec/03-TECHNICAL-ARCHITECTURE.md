# 03. Technical architecture and security contract

## Stack and repository layout

**Selected stack:** TypeScript monorepo using pnpm workspaces. `apps/web`: Vite + React + Phaser 3. `apps/api`: Cloudflare Workers + Hono (or equally small typed router), Cloudflare D1, SQLite-backed Durable Object (DO) with WebSocket Hibernation API, Cron Triggers. `packages/shared`: Zod schemas, game state types, formula functions, content types. `packages/content`: JSON story/assignment/expedition/event seeds, text and validation. Test with Vitest, Miniflare/Workers integration facilities, and Playwright; CI via GitHub Actions.

- The **frontend must build to static files** and work from a GitHub Pages repository subpath (`/documentation-guild/` by default). No server-side web framework runtime required on GitHub Pages.
- The backend API is a separate `*.workers.dev`/custom Cloudflare Worker address. Configure **CORS allowlist** to the exact Pages origin and localhost development origin; CORS is not authentication.
- Put backend secrets in Cloudflare secrets; Clerk public publishable key and API public URL may be in static build config. Never commit Clerk secret key, invitation secrets, service tokens or database credentials.
- Use versioned D1 migrations and checked-in seed scripts. Never silently mutate production schema at runtime.
- Use simple one-room Phaser tile map, deterministic sprite animation, React overlay panels; no physics simulation or continuous server-side game loop necessary.

Suggested tree:

```
apps/web/src/{game,components,pages,state,styles}
apps/api/src/{routes,auth,domain,db,realtime,scheduled}
apps/api/migrations/
packages/shared/src/{schemas,types,formulas}
packages/content/{seed,validators}
tests/{unit,integration,e2e,security}
.github/workflows/{ci.yml,pages.yml,api.yml}
```

## Why Clerk + Cloudflare, not email-based Supabase Auth

Clerk's Backend API accepts username/password for administrative user creation, with email optional when instance policy allows it. Configure username/password-only authentication and **verify this works in a disposable Clerk development application at the first milestone**. The app itself issues its own one-time invite tokens; it does not use Clerk's email invitation system. Clerk stores and verifies passwords and manages signed sessions. **No invented email addresses, fake email inboxes, home-built password database, or email magic links.** If current Clerk configuration actually prohibits username-only accounts in production, STOP that integration stage, document verified blocker and evaluate another **mature provider** with equivalent username/password without email. Do not silently change the requirements.

Cloudflare Worker authenticates game actions, D1 provides persistent storage and the hall Durable Object coordinates realtime sessions. This avoids direct game writes from clients and keeps all reward math server-authoritative. DO is **ephemeral coordination**, not the source of truth for permanent progression.

## Bootstrap and membership: invitation-only single guild

1. Provision precisely one guild row with an internal fixed ID. Set first admin through a protected, one-time **CLI/server bootstrap** that checks a configured Clerk user ID and writes membership. A committed default admin password or publicly accessible bootstrap endpoint is forbidden. Re-running bootstrap is safe and cannot create a second admin unexpectedly.
2. Admin creates invitation via authenticated `POST /api/admin/invitations`; backend uses a cryptographically secure 32-byte random token, stores only SHA-256 digest, creator ID, expiry (7 days by default), used_at, revoked_at. Raw token is returned **once** and rendered as `https://danielclowers.github.io/documentation-guild/#/redeem/<token>` or a hash-fragment equivalent. Store no raw token in DB, analytics or logs. Show copy button. Slack shares are manual.
3. Recipient opens the link, browser reads fragment and clears token from visible URL after storing the pending token only in transient in-memory state. Validate one-use token on backend. Recipient selects unique auth username and password and character appearance. Submit over TLS to a server-side **redemption endpoint** with rate limiting and abuse protection. Never send the Clerk secret key to browser.
4. Redemption must be race-safe and recoverable across the external Clerk `createUser` call and D1 membership transaction: reserve hashed token with `PENDING` lease; call Clerk user creation via backend; finalize exactly one member + one character in D1; mark invite CONSUMED. On partial failures, reconcile by an invite redemption idempotency key (e.g., hashed token + Clerk external ID), prevent double accounts, release/expire stuck reservations under controlled process. Do not claim cross-service atomicity between Clerk and D1.
5. Disable unrestricted self-service signup in Clerk/application configuration. Even if a user could have a valid Clerk identity from outside this workflow, every backend route must check **active membership** and fail closed. Authoritative membership is stored server-side; never trust a client-supplied `admin` flag, username or guild ID.
6. Returning player signs in with username/password via Clerk and keeps reasonable refreshable sessions. Account is independent of local browser data. Offer logout, password change with appropriate reauthentication, and admin-assisted one-time recovery if needed. Admin reset must use separate one-use, short-lived recovery token with verification of intended recipient by trusted manual channel (e.g., Slack identity verified out of band), not just an account name. Admin cannot see existing password.
7. Admin can revoke unused invites, suspend/reinstate member, initiate recovery, inspect audit log. Removing member immediately revokes access at API and next realtime validation; disconnect realtime sessions when notified. Retain their character data unless explicit confirmed deletion.
8. Login display name is separate from unique auth username; neither email address nor work account is collected. Character display names should be filtered/length-limited and HTML-escaped.

**Threat model:** leaked invite links, replay/race redemption, credential stuffing, XSS token theft, manipulated game requests, bypassed membership check, stale authorized sockets, duplicated rewards, two devices editing same profile, and D1/Cron retry races. Use security headers including CSP appropriate to Clerk, sanitized UI, request validation, CORS, rate limiting by IP/member, and auditable admin routes. Avoid storing passwords, invite tokens or long-lived bearer tokens in localStorage; prefer Clerk SDK session handling. Verify auth JWT signature, issuer, expiry and audience via provider JWKS using supported server library.

## Game database (D1)

Model SQL with foreign keys, uniqueness, indexes and migrations. Suggested schema (add columns as required by implementation):

| Table | Key columns and constraints |
|---|---|
| `guilds` | `id`, `name`, `renown`, `renown_level`, `campaign_chapter`, `version` (exactly one active guild) |
| `members` | `id`, `clerk_user_id UNIQUE`, `auth_username UNIQUE`, `role` (`admin` or `member`), `status`, `joined_at` |
| `invitations` | `id`, `token_hash UNIQUE`, `issued_by`, `expires_at`, `status`, `redemption_idempotency_key`, `claimed_clerk_user_id`, `used_at` |
| `characters` | `id`, `member_id UNIQUE`, `display_name`, palette/style IDs, `level`, `total_xp`, `gold`, `primary_spec`, `last_settled_at`, `version` |
| `character_skills` | `(character_id, skill) UNIQUE`, `xp`, `level` |
| `standing_orders` | `character_id UNIQUE`, `skill`, `started_at`, `last_settled_at`, `suspended_at`, `version` |
| `training_purchases` | `(character_id, upgrade_key) UNIQUE`, `rank` |
| `guild_projects` | `id`, `project_key`, `progress`, `target`, `status`, `version` |
| `party_expeditions` | `id`, `definition_key`, `leader_member_id`, `mode`, `status`, `scheduled_at`, `grace_ends_at`, `started_at`, `ends_at`, `seed`, `version` |
| `party_members` | `(party_id, member_id) UNIQUE`, `role`, `approach`, `joined_at`, `locked_snapshot JSON` |
| `expedition_events` | `id`, `party_id`, `member_id`, `event_key`, `event_index`, `available_at`, `expires_at`, `status`, `resolution`, `bonus_awarded_at`, unique per member/index |
| `expedition_results` | `party_id UNIQUE`, `result_json`, `completed_at`, `award_version` |
| `reward_ledger` | `id`, `member_id`, `source_type`, `source_id`, `reward_kind`, `amount`, `created_at`, `unique(source_type, source_id, member_id, reward_kind, award_version)` |
| `business_instances` | `id`, `member_id`, `template_key`, `seed`, `status`, `attempt_count`, `solved_at`, `expires_at` |
| `personal_discoveries` | `(member_id, discovery_key) UNIQUE`, `first_found_at`, `source_id` |
| `guild_chronicle` | `(chapter_key, objective_key) UNIQUE`, `progress`, `completed_at` |
| `feed_events` | `id`, `category`, `text_key`, `data_json`, `created_at`, `visibility`, bounded retention |
| `member_notifications` | `id`, `member_id`, `kind`, `source_id`, `read_at`, `created_at`, dedupe index |
| `audit_log` | `id`, `actor_member_id`, `action`, `object_type`, `object_id`, timestamp, limited safe metadata |
| `idempotency_keys` | `(member_id, scope, key) UNIQUE`, `response_json`, `created_at`, expiry |

Use integers for XP/gold/renown and UTC ISO/RFC3339 or integer epoch timestamps consistently. Never trust client-supplied reward amounts, timestamps, probabilities, cooldowns or character skill levels.

### D1 transaction integrity

D1 supports `batch` transactional statements; complex domain mutations need carefully constructed conditional updates and compare-and-swap/version checks. Write explicit tests for concurrent join/departure, overlapping settlement and duplicate reward distribution. Cron may trigger same operation more than once. Idempotency is enforced in database uniqueness + conditional state transitions, **not** only frontend controls. D1 is authoritative; DO publish after successful commit. An outbox/feed event or resync path handles missed WebSocket broadcasts. Keep all progress recoverable from DB without running DO.

## Real-time hall

- One `GuildRoom` SQLite-backed Durable Object keyed by fixed guild ID. WebSocket clients authenticate with an **ephemeral one-use socket ticket** issued by `POST /api/realtime/ticket` after Clerk bearer authentication and membership check. Ticket expires within 60 sec, can only be consumed once, and contains no reusable auth JWT in URL. Alternatively use a verified authentication handshake mechanism supported by browsers; no raw Clerk session token in query strings.
- DO uses Hibernation WebSocket API, tracks sessions and one character ID per member, broadcasts joined/left/presence/activity/emote and authoritative destination updates; rechecks membership/session expiry periodically or on privileged action, and supports revocation events. Multi-device dedup creates one avatar with most-recent-active session as control source, but allows both devices to view consistent state.
- Heartbeat about 20 sec while connection active; online timeout 45-60 sec (document choices), consider browser background throttling and reconnection. Provide exponential backoff; 'Reconnecting...' indicator; snapshot resync on reconnect.
- Server controls `activity`, `station`, `destination`, `activity_started_at`, `animation_seed`, timestamp. Clients animate walk paths and idle variants deterministically; no server tick per animation frame. Emote events are rate-limited and ignored by game economy. Avoid logging personal activity or precise time spent working.
- Avatar motion may be approximate between browsers; never present an offline player as online. Reconnect should not spawn two avatars.

## Backend API outline (versioned `/api/v1`)

All handlers return typed JSON, validate Zod input, use structured error codes (`UNAUTHORIZED`, `NOT_MEMBER`, `CONFLICT`, `INVALID_STATE`, `EXPIRED`, `RATE_LIMITED`). Mutations take a client-generated idempotency key where relevant.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Unauthenticated non-sensitive health/status |
| `POST` | `/auth/redeem` | One-use invitation redemption and Clerk user creation; no prior session |
| `POST` | `/admin/invitations` | Admin create + return one-time link |
| `GET/DELETE` | `/admin/invitations` | Admin list metadata/revoke |
| `POST` | `/admin/members/:id/suspend` | Admin suspend and revoke active world access |
| `POST` | `/admin/members/:id/recovery` | Admin recovery flow, no email |
| `GET` | `/me` | Profile, balances, character, notifications |
| `PATCH` | `/me/character` | Name/style/palette validation |
| `PUT` | `/me/standing-order` | Set default skill and settle prior period |
| `POST` | `/me/training/:key` | Buy upgrade in atomic domain operation |
| `POST` | `/me/specialization` | Select or paid respec |
| `GET` | `/guild` | Guild renown, campaign, activity/online summary |
| `GET` | `/guild/feed` | Paginated safe activity feed |
| `GET` | `/business` | Personal instances and available challenges |
| `POST` | `/business/:id/submit` | Verify puzzle answer/choice and award once |
| `GET` | `/expeditions/definitions` | Public-to-member content catalog |
| `GET` | `/parties` | Recruiting/in progress/recent completed |
| `POST` | `/parties` | Create manual or scheduled party |
| `POST` | `/parties/:id/join` | Choose role and approach, ready immediately |
| `POST` | `/parties/:id/leave` | Leave only before departure |
| `POST` | `/parties/:id/start` | Manual start by authorized leader |
| `POST` | `/parties/:id/reschedule` | Safeguarded scheduled changes + notices |
| `POST` | `/parties/:id/transfer-leadership` | Claim after verified absent-leader grace |
| `POST` | `/parties/:id/invite` | Invite member, no Slack API |
| `GET` | `/parties/:id/report` | Member-safe result, event queue |
| `POST` | `/events/:id/resolve` | Resolve optional challenge and idempotent bonuses |
| `GET` | `/me/journal` | Personal discoveries and story status |
| `POST` | `/realtime/ticket` | Brief, single-use WebSocket ticket |
| `POST` | `/internal/reconcile` | Cron/authorized reconciliation only; secret binding, not public bearer |

Slash paths may be organized differently in code; preserve capabilities, auth and contracts. Document exact request/response examples in generated API reference and OpenAPI/typed schemas.

## Scheduled reconciliation and timers

- Cron Trigger every minute (or closest reliable supported frequency) finds due scheduled parties, grace deadlines, expedition finishes and stale reward jobs. Also settle standing orders lazily on player login/actions and in batched scheduled tasks if needed.
- When scheduled party is underfilled: set `GRACE` with `grace_ends_at=scheduled_at+15m` exactly once. If it reaches 2 ready during grace, launch immediately (server transaction on join). Otherwise expire at grace end; never repeatedly extend.
- At launch capture immutable snapshot; `ends_at=started_at+duration`. At `now>=ends_at`, finalize result with deterministic seeded rolls, award baseline once, and release standing-order suspension as of `ends_at`.
- An overdue reconciliation uses originally recorded timestamps, not scheduler execution time, so delays don't penalize members or inflate rewards.
- Recurring standing orders pay for eligible intervals capped at 24 **total hours** since last settled activity, not for weeks of offline time. Define overlap rule precisely; no double count while on expedition. Track piecewise intervals across order change, suspension and resumption.
- Guild Business generation: keep a small queue (target 3, refill after completion, with cooldown/variety). Limit high-value rewards per day by diminishing returns or separate daily bonus pool, without blocking play or penalizing missed days. Use rolling 24-hour reward caps if needed; do not create an obligatory daily reset task.

## Tests and security validation obligations

- Valid invite only -> unique username/password character; replay/races/expired/revoked tokens denied; password never logged; unauthorized signup cannot become guild member; outside Clerk identities cannot see guild data.
- JWT missing/expired/bad signature/wrong issuer/missing member/suspended member -> deny every protected HTTP and websocket path.
- Player cannot award currency by HTTP tampering; different user IDs cannot change another user's character, puzzle or party; only admin can invite/revoke.
- Concurrent join to final slot -> exactly one winner; schedule due -> only one launch; Cron duplicated -> one ledger award; reconnect -> one avatar and no duplicate rewards.
- All party members offline -> expedition still completes; standing order suspended at exact start and resumed at exact finish; last-minute joins during grace auto-start; one-member party after grace expires with no charges.
- Optional challenges remain individually resolvable for 24 hours after completion; no replays, partial bonuses once and no baseline reward reversals.
- CI static build with production base path, browser reload/deep-link behavior under `/documentation-guild/`, background-tab throttling, keyboard accessibility, mobile fallback and API-outage states.

## Deployment

- GitHub repo under **`danielclowers`** using configured SSH host `github.com` and key `~/.ssh/id_ed25519`, `IdentitiesOnly yes`. Do not edit `~/.ssh/config`; do not use another GitHub account. Verify `ssh -T git@github.com` (GitHub's successful greeting may exit with nonzero status), `gh auth status`, `gh api user -q .login` and repo remote before creation/push. Stop on mismatch; never push to wrong owner.
- Repo name default `documentation-guild`, URL `https://danielclowers.github.io/documentation-guild/` subject to actual Pages configuration. If a repo exists with unrelated content, stop rather than overwriting.
- GitHub Actions builds static web on pushes to `main`, publishes with official Pages actions and correct Vite `base`. Deploy Worker separately through CI using Cloudflare tokens **only if configured and authorized**. Migrations applied with explicit production safety check; never auto-reset production DB.
- Provide `.env.example` listing public values and an operator-only backend secrets checklist. Secrets never committed, output or printed in CI logs. Distinguish user-required external provisioning from code tasks.
- Add health checks, structured error logging without sensitive data, backup/export and documented rollback strategy. Free plans may sleep/limit/charge; do not claim always-on SLA or permanently free hosting.
