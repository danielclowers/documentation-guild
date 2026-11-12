# The Documentation Guild

An invitation-only multiplayer idle RPG for a small guild of technical writers. The first local milestone includes a React and Phaser welcome screen, a Cloudflare Worker health endpoint and a D1 membership schema. The launch catalog is available to server code with schema and cross-reference validation.

## Local development

Use WSL, Node 24.11.1 from `.nvmrc`, and the pnpm version pinned in `package.json`. With Corepack installed, `corepack enable` installs its pnpm shim. You can also run `corepack pnpm` in place of `pnpm`.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Open `http://localhost:5173/documentation-guild/` for the welcome screen. To verify a production build in Chromium, run `pnpm exec playwright install chromium` and `pnpm test:e2e` after `pnpm build`.

If pnpm reports `EACCES` renaming a package under the mounted workspace, put its stores on the Linux filesystem and leave the source in place.

```sh
pnpm install --frozen-lockfile --virtual-store-dir /tmp/documentation-guild-virtual-store --store-dir /tmp/documentation-guild-pnpm-store
```

If the Playwright preview stalls while checking an unused loopback port, start it with `pnpm --filter @guild/web preview --host 127.0.0.1 --port 4173 --strictPort` before running `pnpm test:e2e` in another terminal.

In another terminal, start the Worker with local D1 storage.

```sh
pnpm --filter @guild/api migrate:local
pnpm dev:api
curl --fail-with-body http://127.0.0.1:8787/health
```

The health endpoint returns HTTP 503 until the local D1 migration has been applied. The welcome screen runs independently of the API. The hall illustration is original project artwork drawn in `apps/web/src/hall.ts`.

## Source layout

- `apps/web` holds the static frontend. Vite builds it under `/documentation-guild/` for GitHub Pages.
- `apps/api` holds the Cloudflare Worker and versioned D1 migrations.
- `packages/shared` holds common game types and progression formulas.
- `packages/content` validates the server-side seed catalog. Puzzle solutions stay outside the web build.
- `docs/spec` contains the original product and engineering handoff.

See [Implementation status](IMPLEMENTATION-STATUS.md) for verified behavior and [Deployment](DEPLOYMENT.md) for provider setup.
