# 06. Milestones, acceptance tests and operations

**Delivery target:** a credible, secure playable V1 with actual multiplayer and server-persisted progression. Never declare done because the guild hall looks nice in screenshots. All milestones can be implemented in one Codex engagement, but must be reviewed and tested in order. If external accounts/credentials block deployment, deliver runnable code, local proof and exact manual steps instead of a misleading live link.

## Milestone 0. Verify and scaffold

- Verify selected `danielclowers` GitHub account and its configured SSH routing. Never modify SSH config or use another account.
- Inspect workspace and repo before writing. Use existing appropriate repo only if safe; otherwise create `documentation-guild` in owner `danielclowers` when authorized. Verify `git remote -v` and `gh api user -q .login` before push.
- Pin supported package versions after checking current APIs for Vite, React, Phaser, Clerk, Cloudflare Workers/D1/DO, Wrangler, CI actions. Enable lockfile and strict TypeScript.
- Create typed monorepo packages, eslint/prettier, unit test runner, playwright, CI skeleton, `README.md`, environment example and provider provisioning checklist.
- Verify Clerk can support required **username/password with no email** using admin-created users. If unable, record blocker and do not substitute email-based auth silently.

**Gate:** `pnpm install`, lint/typecheck/test/build all work locally; no credentials checked in, static build correctly uses Pages base path.

## Milestone 1. Secure invitation and accounts

- Configure/authenticate Clerk; D1 membership and one-time invite records; admin CLI bootstrap; backend-only redemption; session validation; admin screens to create/copy/revoke invite; member suspension/recovery.
- Create first-time character customization and access gating. Implement no-email registration and username/password returning sign-in. Handle invalid/expired/revoked invite and duplicate usernames.
- Document how to configure Clerk dashboard for username-only account settings and no unrestricted signup.

**Gate:** only invite holders can become active members; one-use token; 2 redemptions cannot claim one token; revoke denies APIs immediately; new account follows first-run wizard; secure password handling and redaction tests pass.

## Milestone 2. Living guild hall and realtime

- Build attractive original pixel-art hall with six zones, original character sprites, 3 hair variants, 5 hair + 5 tunic colors, walking/working/idle/emote loops, and automatic paths/stations.
- Add member presence in shared DO via secure WS tickets; stable joined/left states; one avatar/member across multiple tabs; accurate online count and activity labels.
- Implement social wave, inspect and simple invite UI. Build panel shell/navigation + mobile layout + accessibility.

**Gate:** with three browser sessions logged into distinct characters, each sees the others online, walking/working; closing one updates presence; reconnection does not duplicate avatar; background-tab CPU is sensible.

## Milestone 3. Standing orders and character progression

- Implement authoritative accrual (including offline 24h cap), settlement, suspension/resumption, 3 skill XP tracks, gold, level formulas, 4 training upgrades, specialization at level 10 and optional retraining.
- Add accessible profile and balance views, event summary and related live activity.
- Write unit/property tests for time overlaps and 7-day disconnect behavior.

**Gate:** no double accrual during expedition, no negative currency, no fake client-awarded XP; two tabs show consistent balances; a character with no active browser can accrue correct capped standing-order progress.

## Milestone 4. Guild Business

- Integrate 12 launch cases and four reusable interaction mechanisms, content validation, seeded challenge instances and server-side answer verification.
- Available while avatar is on expedition; refills to a selection of 3 varied cases; diminishing reward system after 8 normal rewards per rolling day.
- Onboarding first case is a simple page-order sequence.

**Gate:** complete/lose/retry an individual challenge, then re-run same submit without duplicate reward; meaningful activity accessible when no coworker online; screen-reader/keyboard can complete puzzle.

## Milestone 5. Cooperative expeditions

- Implement recruitment, roles, ready-on-join, manual starts, scheduled starts, 15-minute underfilled grace, late join during grace -> auto-start, 24h abandon cleanup for manual recruiting, withdrawal, leadership transfer.
- Implement deterministic expedition snapshots, server-clock completion, baseline + optional reward ledger, per-player 1-2 event queue, 24-hour post-finish window, cooperative bonus thresholds, readable reports.
- Pause and resume orders exactly; add hall departure and return animation for connected members.
- Implement guild objective and Chronicle progress.

**Gate:** 2-4 player parties work even if all participants close all tabs; scheduler retries do not double-award; last second 2nd member triggers exactly one grace departure; one-member scheduled party closes after exactly one grace extension; no busy member can block the other players.

## Milestone 6. Story/content and polish

- Import CONTENT-SEED catalog: 7 expeditions, 12 Guild Business cases, 24 events, 15 discoveries, 5 modifiers and Chapters 1-2 playable. Ensure future Chapters 3-4 do not appear as unlocked content.
- Implement chapter objectives, guaranteed progression clues, journal, guild feed, summaries, offline/resume messaging, sound mute/reduced motion, responsive layouts.
- Tune common paths for 2 members; validate active-engagement cadence without daily coercion.

**Gate:** playable 2-chapter campaign, no broken prerequisites, all choices reflect different effects, no hidden required RNG item, no missing assets, public source attribution, no cosmetic inventory.

## Milestone 7. Deployment and runbook

- CI for typecheck/lint/tests/static build/Playwright smoke where practical; Pages deploy from `main` with correct base path; API deploy when Cloudflare auth configured and authorization available. Document D1 migrations, Clerk setup, Worker secrets, binding names, Cron, custom domain/origins, invite bootstrap.
- Production smoke test with two real test accounts and a deliberately shortened test expedition on **test environment**, not manipulated production clock. Test on fresh browser, mobile, private browsing, reconnect.
- Provide `DEPLOYMENT.md`, `OPERATIONS.md`, architecture notes, `CHANGELOG.md`, simple admin instructions and smoke-test commands.

**Gate:** link to actual live Pages URL and backend health **only after verified**. If production infrastructure isn't provisioned, report exactly what was built and what manual authorization/configuration remains. Never claim tests executed if they weren't.

## Test matrix (minimum)

| Area | Required test cases |
|---|---|
| Account | valid invite, invalid token, consumed token, expiration, revoke, duplicate claim, duplicate username, nonmember identity, suspended member, wrong password |
| Authoritative economy | client reward forgery denied, negative gold rejected, XP threshold boundary, training rank overflow, specialization rule/cooldown, offline 24h cap, zero elapsed interval |
| Time/reconciliation | stand-order switch midpoint, suspend at party start, resume at actual end, Cron late, repeated Cron, DST and timezone display |
| Presence | join/leave, open two tabs, disconnect all tabs, reconnect, stale WS ticket, revoke live member, background throttling |
| Parties | 1 member cannot start, 2-4 join, 5th denied, concurrent fourth-slot race, leave before start, blocked leave after start, scheduled timer, +15m grace, late second member, grace expiry, absent leader/manual takeover, manual cleanup |
| Expeditions | role effects, deterministic challenge outcomes, 1-2 events/member, no waiting, baseline once, optional once, 24-hour completion window, newcomer participation, all offline completion |
| Content | unique keys, reachable chapter goals, seeded case solvability, no missing journal refs, all event choices produce distinct effect descriptors |
| UX | first-time completion without other players, mobile tap control, accessible keyboard puzzles, 1280x720, base path, disconnected/recovering visual state, no fake presence |
| Deployment | Pages source configured, CI status, api health, D1 migration version, invite bootstrap protected, no secrets in dist/logs, auth separation |

## Playtest script (two to four human testers)

1. Admin generates two links, each tester redeems in a separate browser and creates visually distinct characters.
2. Both enter hall and see real online presence. One changes standing order; other sees changed station and motion.
3. Tester A waves and invites B; B accepts, chooses role; A schedules +5m. Both continue standing orders until departure.
4. Both close tabs. At due time simulated via test clock/accelerated worker in staging, party launches and finishes without browser.
5. Reopen both, confirm baseline rewards granted once, one optional challenge per member available, 24h deadline shown and no duplicates after refresh.
6. Create underfilled scheduled party; verify exactly one 15-minute extension, then closing. Repeat with join during grace and auto-start.
7. Open with a new third player after campaign Chapter 1 is complete; confirm they receive tutorial case and can view a recap without losing access to campaign context.
8. Ask participants whether they found worthwhile activities on three separate check-ins during a workday and whether anything felt obligatory. Rebalance if not.

## Operational guardrails and exit criteria

- No automatic destructive migration or production data reset; versioned and reversible upgrades where practical. Offer JSON export/backups of guild/member/character/event tables to admin-only backup process, with sensitive auth separated.
- Read Cloudflare quotas before launch; WebSocket presence/case refill must not create excessive D1 writes. On hitting rate limits, display clear errors without corrupting progress.
- Configure CSP, secure headers, observability with redaction, never log invite token, password, auth header or session token.
- Produce `IMPLEMENTATION-STATUS.md` at end with completed features, tested commands/results, live URLs (if verified), unmet external prerequisites and known bugs. No 'done' if core party behavior is mocked.
- A successful V1 consists of a cozy **real** shared hall, persistent real characters, functioning idle + active progression and real cooperative expeditions. Content breadth may be trimmed only if necessary after all critical systems work, and any trim must be clearly reported.
