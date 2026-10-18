# BenchBet

A betting game for a group of friends: who best predicts the next AI benchmark score, the API price, or the model hiding behind a codename? Place your guess, then see what everyone else thinks. Closest wins.

Live: <https://bet.logge.top> · Build spec: [`docs/SPEC.md`](docs/SPEC.md) (branding and language: [`docs/BRANDING.md`](docs/BRANDING.md), which takes precedence)

- **No login:** your name is your identity. Safety nets instead: undo, trash, result corrections and a public activity log.
- **PWA** with offline start, web push (new bet, reminder, result) and app badge.
- **Live** updates via server-sent events, no reloading.
- **Stack:** Node 24 (TypeScript without a build step, `node:sqlite`), Fastify 5, the React 19 API shipped as Preact (`preact/compat`, keeps the JS under 80 KB gzip), Vite 7. No router, state or CSS libraries.

## Development

Requires Node ≥ 24.

```sh
npm ci
cp .env.example .env      # optional, the defaults are fine locally
npm run dev               # server :3000 + Vite :5173 (proxies /api → :3000)
```

| Command | What it does |
|---|---|
| `npm test` | Leak check (`scripts/check-public.mjs`) + unit and API tests (`node:test`) |
| `npm run typecheck` | `tsc` for server, client and service worker |
| `npm run build` | Typecheck, client and SW build into `dist/client`, size budget |
| `npm start` | Production server (`node server/index.ts`) |
| `npm run e2e` | Playwright smoke test (iPhone/Pixel), run `npm run build` first |
| `npm run icons` | Render PNG icons from `client/public/icons/*.svg` (output is committed) |
| `npm run vapid` | Print a VAPID key pair for `.env` (optional) |

Layout: `shared/` (scoring, phases, parsing, formatting – used by server and client), `server/` (Fastify, SQLite, push, scheduler), `client/` (React-API app on Preact, service worker), `test/`, `e2e/`, `scripts/`.

Routes: `/` (open bets), `/bet/:id`, `/bet/:id/resolve`, `/bet/:id/edit`, `/new`, `/results`, `/leaderboard`, `/leaderboard/:name`, `/me`, `/how-it-works`. Old German paths (`/spiel/:id`, `/rangliste`, …) and `/#spiel-<id>` links redirect to the new ones.

**Before every push:** run `npm test`. `scripts/check-public.mjs` fails as soon as Git tracks anything from `legacy/`, `data/`, `docs/internal/`, `docs/audit/` or a `*snapshot*.json`. Those files contain hidden guesses on open bets and must never end up in the public repo.

## Deploy (Dokploy)

- App from `LoggeL/benchbet`, build type **Dockerfile**, build arg `GIT_SHA` = commit. Update it on every deploy (or let your CI pass `$(git rev-parse HEAD)`): it is part of the app version (`/healthz`) and triggers the instant "Fresh version’s here" check. Without it the version stays `+dev`; service-worker caches are still rotated by content hash.
- Exactly one reverse proxy (Traefik) in front: `TRUST_PROXY=1` (default). Adjust it if you add Cloudflare or another hop, otherwise rate limits key on the wrong IP.
- Domain `bet.logge.top` → container port 3000, HTTPS (Let's Encrypt – required for the service worker and push).
- Volume `benchbet-data` → `/app/data` (DB, `vapid.json`, daily backups). The container runs as `node` (uid 1000).
- Environment variables: see [`.env.example`](.env.example). The import needs `ADMIN_TOKEN` (≥ 32 characters).
- Don't enable compression for `/api/events` (keep the Traefik default).

The image is based on `node:24-alpine`, runs `npm run build && npm test` during the build and checks itself via `HEALTHCHECK /healthz`.

## Importing the old app

All 14 bets and 46 guesses are carried over 1:1 (IDs, spellings, results); scores are recomputed and checked against the old values. Imported prompts and descriptions stay in German, as they were entered.

```sh
# 1. Dry run against the freshly deployed, empty instance
ADMIN_TOKEN=… node scripts/import-legacy.mjs --post https://bet.logge.top --dry-run
#    → check the report: 0 scoring mismatches, leaderboard
#      14 bets · 7 resolved · 5 players · 46 guesses
# 2. Import for real
ADMIN_TOKEN=… node scripts/import-legacy.mjs --post https://bet.logge.top
```

The script pulls the old API anonymously and once per player name, checks completeness and writes the snapshot to `data/legacy-snapshot.json` (gitignored paths only, mode 0600). `--from-file <file>` posts an existing file, `--mode replace` overwrites an earlier import (only while nobody has placed a guess on the new instance yet). Hidden values never hit the console.

## License

[MIT](LICENSE) © LoggeL
