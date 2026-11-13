# Implementation status

| Milestone | Status |
| --- | --- |
| 0. Verify and scaffold | Local workspace, welcome screen, initial D1 migration, content validation, test runners and CI/Pages workflows |
| 1. Secure invitations and accounts | Invites, Clerk sign-in UI, profile setup, suspension and recovery implemented. D1 and token validation passed locally. The preview admin confirmed hosted sign-in and character creation. |
| 2. Shared guild hall | Authenticated WebSocket roster, one avatar per member, station walks, waves and accessible roster available in the hosted preview. Expedition activity and standing-order production are later milestones. |
| 3. Standing orders and progression | Server-authoritative standing orders, character XP, three skill tracks and gold. Four gold-funded training upgrades, six specializations, and the Chronicler standing-order perk. Guild Business and expedition perks will take effect when those activities are added. |
| 4. Guild Business | Three-slot solo case board, all twelve launch cases, four puzzle types, server-side grading, optional discoveries, and rolling reward limits. |
| 5. Cooperative expeditions | Pending. |
| 6. Story, content and polish | Story seed validated. Campaign play and journal pending. |
| 7. Deployment and operations | GitHub Pages is connected to a Cloudflare preview Worker and D1 database. |

The attached workspace serves as the project directory. `docs/spec` contains the unchanged handoff and a single copy of the JSON catalog. The checked-in catalog names use `advanced` for harder content and `normal` for standard expeditions.

The GitHub CLI and SSH both verified `danielclowers`. The project repository is `danielclowers/documentation-guild`. The hosted preview uses the Clerk development instance. Production identity and deployment configuration are still pending.

## Local verification

- `pnpm check` passed lint, strict type checking, six unit tests, fourteen integration tests and the production build. The tests use signed local identities with the real Clerk token verifier and simulate provider account mutations. Vite reported that the lazy-loaded Phaser chunk exceeds its default size warning threshold.
- Wrangler applied the hall migration to the hosted preview. The local integration tests also exercise the migrations in isolated D1. The running Worker returned HTTP 200 from `/health`. Smoke checks also covered CORS, anonymous denial and fail-closed behavior without provider configuration.
- Four Playwright checks passed in desktop and mobile Chromium at `/documentation-guild/`. They verified that Phaser rendered the hall and that invitation and recovery links were cleared from the address bar. The tests used the installed Chromium and a prestarted loopback preview.
- All nine archived files matched the copies in `docs/spec` byte for byte. A search of the built frontend found no catalog markers or sample puzzle data.

The public GitHub repository uses GitHub Actions to publish the frontend from `main`. The Cloudflare preview handles accounts, membership and realtime hall connections. [Live welcome screen](https://danielclowers.github.io/documentation-guild/)
