# Codex execution prompt: Build The Documentation Guild

You are Codex. Build an actual playable web game named **The Documentation Guild**, using all files in this handoff directory as the authoritative product and engineering specification. Work autonomously, in an ordered sequence, and drive toward tested implementation and authorized deployment. **Do not treat these documents as inspiration**: they are implementation requirements. Do not begin by writing a shorter substitute plan that omits requirements. Read every file first, including the complete `CONTENT-SEED.json`.

## Project objective

A cozy SNES-style, one-guild, invitation-only shared-world idle RPG for a small group of technical writers. The frontend is served from GitHub Pages. Each player has a customizable little sprite, appears in a living guild hall whenever connected, moves and works automatically, earns modest standing-order progress, completes short individual Guild Business challenges, and participates in 2-4-player cooperative expeditions that finish even when everyone closes the game. The setting mixes gentle fantasy, occasional humor and a long-running written mystery. Moderate RPG progression, minimal art burden, no cosmetic unlocks.

## Required inputs

Read in this order:

1. `README.md`
2. `01-GAME-DESIGN.md`
3. `02-GAME-CONTENT.md`
4. `CONTENT-SEED.json` (all content; validate JSON)
5. `03-TECHNICAL-ARCHITECTURE.md`
6. `04-ART-AND-UX.md`
7. `05-BALANCING.md`
8. `06-DELIVERY-AND-TESTS.md`

Treat this handoff folder as read-only reference material. If launched from the folder containing `documentation-guild-codex-spec/`, create a sibling project directory named `documentation-guild/`; do not turn the handoff directory into the game repository or overwrite its files. Commit a copy of the final specifications under `docs/spec/` in the new repo for traceability. If a requested file is missing, report the issue immediately and use the available copies; do not hallucinate missing contents. Resolve minor unspecified details sensibly without interrupting the user. If there is an essential external credential/authorization blocker, continue building/test locally as far as possible and document the exact blocker; do not solicit passwords in chat or invent a deployed backend.

## Absolutely binding decisions

- **Do not add AI familiars, pets, collectible furniture, unlockable outfits, equipment inventory, farming, chat, paid transactions, daily streaks, manual avatar movement, or cooperative Guild Business puzzles.** Keep art small and reusable.
- Actual online coworkers must be visible; don't use mock players in production. Connection state is distinct from running a background assignment.
- Private guild and actual server-enforced invitation-only membership; admin generates **single-use Slack-shareable URLs manually**, not email invites and not email login links.
- Prefer actual username/password with no email requirement, using Clerk for secure credential handling. Our game backend must perform invite redemption and membership enforcement. Test provider capabilities before going too deep; don't fake email addresses or implement homemade password hashing.
- Automated shared hall and standing orders. Players should have optional meaningful things to do several times throughout an ordinary day, without punishment if they ignore the game.
- Cooperative expeditions require 2-4 real players, manual or scheduled departure; a scheduled party that is underfilled gets **one 15-minute grace period**, launches on reaching two during grace, or closes after deadline. Browser disconnect never equals leaving party; party finishes with all browsers closed; reward once; standing order resumes on completion.
- A standard 20-minute expedition presents 1 guaranteed and at most 1 additional optional challenge per member. Individual challenges do not block others or the party result; valid for 24h after finish. No punitive baseline mission failure.
- Story Chapters 1-2 playable at launch; 3-4 future outlines. Guild Business cases are individual. Specialization and rewards use `05-BALANCING.md`.
- Maintain high-quality cozy original pixel visuals. The hall should be a lovely place to leave open, not a boxy admin dashboard with placeholder emojis.

## Critical GitHub identity restriction

The user uses multiple GitHub accounts. For **this project only**, use account **`danielclowers`**. Relevant existing SSH configuration:

```sshconfig
# Default github account: danielclowers
Host github.com
   HostName github.com
   IdentityFile ~/.ssh/id_ed25519
   IdentitiesOnly yes
```

- Do NOT modify SSH configuration or substitute SSH keys/accounts.
- At the start of repository operations, validate `ssh -T git@github.com` (GitHub successful authentication may return exit code 1), `gh auth status --hostname github.com`, and `gh api user -q .login`. Make sure `gh api user` reports `danielclowers`. Verify remote/repo owner before any push.
- Use `git@github.com:danielclowers/documentation-guild.git` as default remote and `documentation-guild` as repo name. If this repo already exists and contains unrelated work, DO NOT overwrite it; report conflict. If no repo exists, create under `danielclowers` only when authorized and available; never create under a different account.
- Set up GitHub Pages automatic deployment via GitHub Actions. Expected path, once verified: `https://danielclowers.github.io/documentation-guild/`. Verify actual deployed Pages settings and URL; never invent an accessible site.

## Architecture and implementation quality

- Follow `03-TECHNICAL-ARCHITECTURE.md`: TypeScript monorepo, static React/Vite + Phaser hall, Clerk username/password auth, Cloudflare Worker + D1 + SQLite-backed Durable Object for realtime presence and Cron reconciliation. Prefer a mature library for JWT validation and typed REST endpoints. A React/Phaser split should keep the canvas performant and HTML UI accessible.
- Hosted services require provisioning. If external setup is missing, implement a **local full-stack development mode with a deliberately isolated test identity provider / deterministic fake auth only for tests**, visibly marked as development-only. Production must not silently fall back to insecure local auth, seed mock members or insecure storage.
- Make all game mutations, rewards and progression server-authoritative with ledger/idempotent transactions, not client-side localStorage. Offline progress is server calculated. Validate all user input and protect public endpoints.
- Implement the real content in `CONTENT-SEED.json`; generate varied seeded puzzles and choices, not empty placeholders. Honor all time and economy rules in `05-BALANCING.md`.
- Sync canonical activity/destination/events to the hall, not every animation frame. Show genuine connected coworkers. Efficient handling for background tabs and reconnect.
- Maintain quality: clear separation of UI/domain/data layers, robust error and loading states, tested game logic, secure admin provisioning, accessibility, responsive layout, no unused systems.
- Create original coherent pixel-art assets or programmatic pixel atlases and commit them. Keep art count constrained by `04-ART-AND-UX.md`.

## Execution order and instructions

1. Check environment, repo/account, current provider documentation and available credentials. Read all spec files and inspect any existing repository. Write a brief milestone checklist in `IMPLEMENTATION-STATUS.md`.
2. Scaffold/verify stack and test runner. Confirm auth strategy works without email in the intended provider, or document a concrete blocker and pick a verified secure alternative only if compatible with every product requirement.
3. Implement secure membership/invites and character creation, then the hall with real presence. Establish a real local multi-user test environment.
4. Implement standing orders, profile/skills/gold, Guild Business and personal rewards. Validate time formulas/abuse cases.
5. Implement cooperative party state machine, scheduler, live presence, disconnect-safe completion, event queue, guild renown, reports and optional bonuses. Execute concurrency/idempotency tests.
6. Populate the complete content catalog and first two story chapters. Integrate journal, campaign, activity feed and accessibility settings.
7. Run lint/typecheck/unit/integration/e2e tests; fix failures; manually or automatically inspect the rendered hall and common screen sizes. Run simulated clock/multisession tests for real multiplayer. Keep a record of commands and results.
8. Prepare GitHub Actions Pages deploy and Cloudflare API deployment path with safe migrations and documented environment variables. Deploy to authorized services when credentials/provisioning are available. Re-check GitHub identity **before** push. Provide only verified deployed URLs.
9. Produce operational and developer documentation plus a concise final status report distinguishing working/live functionality, local-tested functionality, and external setup still needed.

## Focused acceptance gates

- Brand-new invited coworker can create username/password account and a customizable avatar in roughly five minutes without another user online. Uninvited or revoked identities cannot access guild data.
- Three genuine browser sessions see three distinct online avatars automatically moving and working in the same hall; only connected players appear online, and two tabs of one user show one avatar.
- Standing orders pay correctly with 24h offline cap and pause/resume exactly for expeditions.
- A solo connected player always has worthwhile Guild Business to do, even when all party invitations are empty.
- Two players can form a party, schedule an expedition, close their browsers, and return to correct single-credited result/rewards; no player blocks completion. A scheduled underfilled party extends only 15 minutes once; second join during grace triggers departure.
- Events resolve per member without shared blocking, remain open 24 hours afterward, and feed optional bonuses to the party once.
- Player levels/skills/specializations/training, first two story chapters, 12 Business cases, 7 expeditions, 24 events and 15 discoveries are implemented without cosmetic farming or extra art maps.
- A site that only shows a simulated hall and mock rewards is **NOT** successful. Missing credentials are a clearly reported blocker, not a reason to misrepresent mock multiplayer as complete.

## Deliverables

- Versioned source repository and understandable architecture; Docker/dev instructions only if necessary.
- Original art assets, seeded content, verified database migrations, Cloudflare Worker bindings, scheduled jobs and Clerk configuration instructions.
- `.env.example`, `DEPLOYMENT.md`, `OPERATIONS.md`, `IMPLEMENTATION-STATUS.md`, full test scripts, CI and Pages deployment workflow.
- Clear instructions for obtaining/providing any external Cloudflare or Clerk authorizations, including expected pricing/free tier risks.
- Successful authorized push and verified Pages/backend URLs where feasible, or exact remaining user actions without fake completion claims.

Work with initiative and finish as much of the real game as possible within this run. Do not solicit new design preferences or start inventing unrelated features. Do not ask for approval to proceed through normal coding milestones. Only stop for a genuinely unsafe/destructive operation, insufficient rights, identity mismatch, or essential production secret/credential access. Keep real test results and unresolved caveats visible.
