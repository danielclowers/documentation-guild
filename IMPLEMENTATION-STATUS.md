# Implementation status

| Milestone | Status |
| --- | --- |
| 0. Verify and scaffold | Local workspace, welcome screen, initial D1 migration, content validation, test runners and CI/Pages workflows |
| 1. Secure invitations and accounts | Invites, Clerk sign-in UI, profile setup, suspension and recovery implemented. D1 and token validation passed locally. Live Clerk sign-in and provisioning are pending. |
| 2. Shared guild hall | Original hall illustration added. Authenticated realtime presence and character routines pending. |
| 3. Standing orders and progression | Level formulas added. Server accrual, training and specializations pending. |
| 4. Guild Business | Seed catalog validated. Challenge play and reward persistence pending. |
| 5. Cooperative expeditions | Pending. |
| 6. Story, content and polish | Story seed validated. Campaign play and journal pending. |
| 7. Deployment and operations | Static welcome screen is live on GitHub Pages. Cloudflare deployment is pending. |

The attached workspace serves as the project directory. `docs/spec` contains the unchanged handoff and a single copy of the JSON catalog. The checked-in catalog names use `advanced` for harder content and `normal` for standard expeditions.

The GitHub CLI and SSH both verified `danielclowers`. The project repository is `danielclowers/documentation-guild`. Clerk and Cloudflare credentials were unavailable in this session. Verifying username-only account creation and sign-in with the provider requires a configured Clerk development instance. The hosted welcome screen remains available while the API is unconfigured.

## Local verification

- `pnpm check` passed lint, strict type checking, six unit tests, seven D1 account integration tests and the production build. The tests use signed local identities with the real Clerk token verifier and simulate provider account mutations. Vite reported that the lazy-loaded Phaser chunk exceeds its default size warning threshold.
- Wrangler applied all three migrations to fresh local D1. The running Worker returned HTTP 200 from `/health`. Smoke checks also covered CORS, anonymous denial and fail-closed behavior without provider configuration.
- Four Playwright checks passed in desktop and mobile Chromium at `/documentation-guild/`. They verified that Phaser rendered the hall and that invitation and recovery links were cleared from the address bar. The tests used the installed Chromium and a prestarted loopback preview.
- All nine archived files matched the copies in `docs/spec` byte for byte. A search of the built frontend found no catalog markers or sample puzzle data.

The public GitHub repository uses GitHub Actions as its Pages source. The workflow publishes the static welcome screen from `main`. The deployed HTML, JavaScript entry point, and stylesheet returned HTTP 200. [Live welcome screen](https://danielclowers.github.io/documentation-guild/)
