# The Documentation Guild: Codex build handoff

**Status:** Implementation-ready specification, not an implemented game.  
**Prepared:** 2026-11-12  
**Audience:** Codex working in a new or existing repository, using the `danielclowers` GitHub account.

## What to give Codex

Provide the entire directory (or the ZIP that contains it), then start with `CODEX_PROMPT.md`. The prompt instructs Codex to read **all** the files before making changes. Do not expect Codex to recall the conversation that produced this package.

## Reading order and authority

1. `CODEX_PROMPT.md`: autonomy, implementation, account and deployment instructions.
2. `01-GAME-DESIGN.md`: definitive game vision, scope, user journeys and state rules.
3. `02-GAME-CONTENT.md`: launch-ready narrative, activities, encounters and puzzles.
4. `03-TECHNICAL-ARCHITECTURE.md`: backend, authentication, invite-only access, presence, schema and APIs.
5. `04-ART-AND-UX.md`: game screens, art budget, character behavior, accessibility and responsive layout.
6. `05-BALANCING.md`: numeric progression, economy, skills, timers and formulas.
7. `06-DELIVERY-AND-TESTS.md`: build order, test matrix, acceptance criteria, operations and launch checklist.

**Priority for conflicts:** explicit prohibitions and constraints in `CODEX_PROMPT.md` > product rules in `01-GAME-DESIGN.md` > architecture safety rules in `03-TECHNICAL-ARCHITECTURE.md` > numerical defaults in `05-BALANCING.md` > examples elsewhere. Fix genuine contradictions visibly in the implementation notes instead of silently changing decisions.

## Product in one paragraph

The Documentation Guild is a cozy, retro top-down, pixel-art, invitation-only multiplayer idle RPG for a small group of technical-writer coworkers. Every online player appears in one living guild hall; characters walk and work automatically. Standing orders generate modest capped passive progress, while individual Guild Business challenges and 2-4-player cooperative expeditions provide frequent, optional interactions. Expeditions run even if everyone disconnects, support manual or scheduled departure, and offer 1-2 optional short challenges per member during a 20-minute run. Character skills, specialization, gold training, discoveries and a light shared mystery provide long-term progression without unlockable outfits, furniture collections, AI familiars or an expanding art asset burden.

## Implementation boundary

This package does **not** grant access to a GitHub account, Clerk application, Cloudflare account, deployment credentials or production database. Codex should implement and test as much as possible locally, deploy only where already authorized and technically possible, and clearly identify any manual infrastructure setup rather than invent success.

## Technology decision

- **Frontend:** TypeScript, Vite, Phaser 3 (small 2D canvas hall), React for menus and overlays, accessible HTML controls; GitHub Pages hosts built static files.
- **Identity:** Clerk for username/password authentication, **without email requirement or email login links**. Server-side account creation is gated by our own one-use Slack-shareable invitation tokens. Validate this configuration early against current Clerk documentation and an integration test; do not substitute email sign-in if configuration differs.
- **Backend:** Cloudflare Workers with D1 (persistent SQLite database), one SQLite-backed Durable Object for authoritative shared-hall realtime WebSocket coordination and presence, plus Cron Triggers for scheduled reconciliation.
- **No Slack integration:** admins copy invite URLs and paste them into Slack manually.

This splits responsibilities cleanly: Clerk handles credentials and sessions; Cloudflare owns game state, business rules, invite tokens and real-time coordination; GitHub Pages owns static presentation. It avoids custom password-hashing code, and does not require us to bend email-based Supabase Auth into a username-only system.

## Source references checked while planning

- Clerk user creation supports `username` and `password` through its Backend API: https://clerk.com/docs/reference/backend/user/create-user
- Clerk authentication configuration: https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options
- Cloudflare Durable Objects support realtime coordination and WebSocket hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Workers and Durable Objects pricing/limits: https://developers.cloudflare.com/workers/platform/pricing/
- GitHub Pages GitHub Actions deployment: https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically

Review provider limits, free-plan behavior and SDK documentation at implementation time. These references establish feasibility, not permission to access external accounts or a guarantee of zero cost.
