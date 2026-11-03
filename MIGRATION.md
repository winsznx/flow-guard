# Migration: frontend Vercel → Cloudflare Workers (2026-08-02)

> The backend has since moved from Railway to the VPS. See [deploy/README.md](./deploy/README.md).

The **`frontend/`** app (Vite SPA) was moved off Vercel (Hobby account soft-blocked for exceeding
function-invocation fair-use limits) onto **Cloudflare Workers Static Assets** — free, since a Vite
SPA is pure static output (no server/SSR).

Scope: **only `frontend/` migrated.** The `backend/` (api + indexer) and `contracts/` are unaffected
and remain where they were (backend on Railway).

## Changes made
| File | Change | Why |
|------|--------|-----|
| `frontend/wrangler.jsonc` | New — assets `./dist`, `not_found_handling: single-page-application` | Serves the built SPA from a Cloudflare Worker; SPA fallback routes unknown paths to `index.html`. |
| `frontend/package.json` | Added `deploy` script (`pnpm build && npx wrangler deploy`) | Reproducible deploys. |

No app code changed — the SPA builds and runs unchanged.

## Env
All build-time `VITE_*` vars (`VITE_API_URL`, `VITE_BCH_NETWORK`, `VITE_ENABLE_WIZARDCONNECT`,
`VITE_WALLETCONNECT_PROJECT_ID`) are pulled from Vercel into `frontend/.env.production.local`
(gitignored) for the build. `VITE_API_URL` still points at the backend origin.

## Deploy
```bash
cd frontend && npm run deploy      # = pnpm build && npx wrangler deploy
```
Needs `CLOUDFLARE_API_TOKEN` in env.

- **Live (Workers subdomain):** https://flowguard.timjosh507.workers.dev
- **Cloudflare Worker name:** `flowguard`

## Custom domains (flowguard.cash) — PENDING
Zone is active on Cloudflare, but DNS still points to the old (blocked) Vercel origin. To finish,
attach these to the `flowguard` Worker (delete stale Vercel records first):
`flowguard.cash`, `www.flowguard.cash`, `app.flowguard.cash`, `explorer.flowguard.cash`.

## ⚠️ Build note — NODE_ENV
`.env` / `.env.local` set `NODE_ENV=development`. Vercel overrode it to `production`, but a plain
`vite build` here inherits `development` → Vite emits the **dev JSX runtime (`jsxDEV`)**, which
crashes against production React (blank page). The `deploy` script forces `NODE_ENV=production`
to prevent this. If building manually, use `NODE_ENV=production pnpm build`.

## API proxy (worker.js)
Vercel rewrote `/api/*` → `https://api.flowguard.cash/api/*`. Cloudflare Static Assets can't
rewrite, so `frontend/worker.js` proxies `/api/*` to the backend and serves the SPA otherwise
(`run_worker_first: ["/api/*"]` in wrangler.jsonc routes only /api to the Worker). `api`→Railway
and `docs`→Mintlify DNS records are unchanged.

---

# Migration: backend + indexer Railway → GreenCloud VPS (2026-08-16)

Railway's trial expired and stopped the whole project (backend + indexer + Redis). `api.flowguard.cash`
started returning Railway's `"Application not found"`, and the explorer went empty (indexer down).
Restarting needs a paid Railway plan, so the **`backend/` + `backend/indexer/`** moved to a plain
always-on box. They are NOT Workers-shaped (Express, `pg` over TCP, `ElectrumNetworkProvider`, three
`setInterval` monitors), so a VPS is the right host; only the frontend stays on Cloudflare.

**Host:** GreenCloud KVM VPS, Frankfurt DE, Ubuntu 24.04, 4GB/2-core, `172.93.185.150`, ~$25/yr flat.
Chosen in Frankfurt because Supabase is in `eu-west-1` (backend↔DB is the hot path).

## What runs where
- **backend + indexer** → Docker Compose on the VPS at `/root/flowguard` (`docker-compose.yml`,
  builds `Dockerfile.backend` / `Dockerfile.indexer`, `env_file: backend/.env`, `NODE_ENV=production`,
  `mem_limit` 1200m/700m, `restart: unless-stopped`). Docker enabled at boot → survives reboots.
- **DB** → Supabase Postgres `eu-west-1` (already migrated: 30 tables, data intact). `railway-backup/`
  holds a `dump.sql` fallback but no restore was needed.
- **Redis** → dropped. It only backed the SIWX nonce store, which falls back to in-memory cleanly.
- **TLS + routing** → Caddy on the VPS reverse-proxies `api.flowguard.cash` (443) → `127.0.0.1:3001`,
  auto Let's Encrypt cert. Backend bound to `127.0.0.1:3001` only; ufw allows 22/80/443. 3.5GB swap.

## Env fix
Pointing `pg` at Supabase surfaced `SELF_SIGNED_CERT_IN_CHAIN` (Supabase's pooler CA isn't in Node's
default trust). Added **`PG_SSL_INSECURE=true`** to `backend/.env` on the VPS (connection stays TLS,
skips CA verification). Pin `PG_SSL_CA_PEM` later for strict verification.

## DNS
`api.flowguard.cash` A record repointed in Cloudflare from the dead Railway CNAME →
`172.93.185.150`, **DNS-only (grey cloud)** so Caddy can complete the ACME challenge. The frontend
needed no change: its `/api` proxy already targets `api.flowguard.cash`, which now resolves to the VPS.

## Verified
`https://api.flowguard.cash/health` → 200 `blockchain: connected`; explorer activity returns real
data again; frontend `flowguard.cash` still 200; indexer following the chain.
