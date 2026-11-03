# FlowGuard

A BCH-native covenant operating layer for treasuries, streams, payments, and distributions.

FlowGuard combines CashScript covenants, wallet-driven signing, backend transaction builders, and indexed activity views. Teams can run treasury logic on chain without giving custody to an application server.

## What ships today

- Multi-member treasury vaults with spending requests: signers approve each payment, then two signers send it.
- Contract-backed stream families: linear, cliffed linear, hybrid, recurring, refillable recurring, milestone, and tranche schedules.
- One-time payments and recurring payout flows.
- Airdrops, rewards, bounties, and grants backed by on-chain contract logic.
- BCH or fungible CashTokens in every product, including batches and recurring payments.
- Pause and resume for streams, recurring payments, budget plans, airdrops, grants, bounties and rewards.
- Recipients can move a stream to a new wallet unless the sender turns that off.
- Personal and organization workspace surfaces in the frontend.

## Stream families

FlowGuard does not treat every schedule as the same thing under the hood. The current covenant set covers:

- Linear vesting
- Linear vesting with a cliff
- Hybrid schedules with an upfront unlock and linear tail
- Fixed-cadence recurring schedules
- Refillable recurring schedules
- Milestone-based step schedules
- Bounded custom tranche schedules

The frontend includes a shape gallery, schedule previews, row-level batch charts, batch history, treasury-linked activity feeds, and personal or organization launch flows for the same shared stream builders.

## Repository layout

- `frontend/`: React + Vite application for the public site, personal workspace, and organization workspace.
- `backend/`: Express + TypeScript API for transaction building, app state, indexing hooks, and execution services.
- `contracts/`: CashScript covenant source and compiled artifacts for treasury, streaming, and distribution modules. A V2 of eight covenants fixes token payouts and fee handling, and new contracts use it.
- `sdk/`: `@flowguardlabs/sdk`, the TypeScript client for building on FlowGuard from your own frontend or backend.
- `docs/`: Mintlify documentation (concepts, guides, API reference, app guide).
- `deploy/`: production topology for the VPS — Docker Compose, Caddy, and what `backend/.env` must contain.

## Core architecture

Users keep control of signing throughout:

1. The frontend collects configuration and requests a transaction build.
2. The backend assembles a contract-aware unsigned transaction descriptor.
3. The user signs in a BCH wallet.
4. The signed transaction broadcasts to the Bitcoin Cash network.
5. The app observes the resulting contract state and updates activity views.

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build the contracts

```bash
cd contracts
pnpm run build
```

### 3. Start the backend

```bash
cd backend
cp .env.example .env
pnpm dev
```

### 4. Start the frontend

```bash
cd frontend
pnpm dev
```

Open `http://localhost:5173`.

## Environment overview

### Backend

Key values in `backend/.env`:

- `PORT`
- `BCH_NETWORK=chipnet|mainnet`
- `DATABASE_URL`: Postgres connection string (Supabase or self-hosted).
- `CHAINGRAPH_URL`: optional, enables richer chain indexing.
- `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed frontend origins.
- `REDIS_URL`: optional, enables Redis-backed nonce store for multi-replica auth. Falls back to in-memory if unset.
- `ADMIN_EXPORT_TOKEN`: optional, enables `/api/admin/export` (redacts private-key columns).
- Authority and fee-payer values used by specific product flows when enabled.

### Frontend

- `VITE_BCH_NETWORK=chipnet|mainnet`: baked in at build time. Must match the backend's
  `BCH_NETWORK` — neither side reads the network at runtime, so a mismatch is silent and
  the first symptom is a wallet prompt for a transaction that cannot confirm. Check with
  `node scripts/check-network-agreement.mjs`.
- `VITE_WALLETCONNECT_PROJECT_ID`: required for the WalletConnect and Cashonize
  connectors. Without it those wallets fail at connect time.
- `VITE_ENABLE_WIZARDCONNECT`, `VITE_ENABLE_OPTN`: opt-in wallet connectors, default off.

There is no API base URL variable. The frontend calls the relative path `/api`, proxied
by Vite in development and by a Cloudflare Worker in production, which keeps browser
requests same-origin and avoids CORS.

### Optional services

The repo also includes an indexer service under `backend/indexer/` that reconstructs covenant state from the BCH chain into queryable views.

## Build commands

```bash
pnpm build
```

Or per workspace:

```bash
cd contracts && pnpm run build
cd backend && pnpm build
cd frontend && pnpm build
```

## Contract verification

Local verification paths:

```bash
cd contracts && pnpm run check
cd contracts && pnpm run test:unit
cd contracts && pnpm run test:streaming
```

## Deployment notes

- Frontend: `frontend/dist` served by a Cloudflare Worker, which also proxies `/api` to
  the backend. `cd frontend && pnpm deploy`.
- Backend API and indexer: Docker Compose on a VPS behind Caddy, with Postgres on
  Supabase. Topology and the full `backend/.env` key list are in [`deploy/`](./deploy).
- Contracts: compiled locally, artifacts committed, consumed by the backend and tests.
- Docs: Mintlify under `docs/`.

FlowGuard is live on BCH Mainnet. Contracts were reviewed internally before launch. A third-party audit is on the roadmap.

## Documentation

- Product docs: `docs/`
- Public docs site: [docs.flowguard.cash](https://docs.flowguard.cash)

## Status

FlowGuard is on BCH Mainnet. Treasury, streaming and distribution flows are live in BCH and CashTokens. Every product was run end to end on chipnet in both in November 2026, including pause, resume, cancel, transfers and batches. Votes are no longer offered in the app.

## License

MIT. See [LICENSE](./LICENSE).
