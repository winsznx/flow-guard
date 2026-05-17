# FlowGuard

A BCH-native covenant operating layer for treasuries, streams, payments, distributions, and governance.

FlowGuard combines CashScript covenants, wallet-driven signing, backend transaction builders, and indexed activity views. Teams can run treasury logic on chain without giving custody to an application server.

## What ships today

- Multi-member treasury vaults with policy controls, proposal workflows, and activity tracking.
- Contract-backed stream families: linear, cliffed linear, hybrid, recurring, refillable recurring, milestone, and tranche schedules.
- One-time payments and recurring payout flows.
- Airdrops, rewards, bounties, and grants backed by on-chain contract logic.
- Governance proposals and vote-lock infrastructure tied to treasury operations.
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
- `contracts/`: CashScript covenant source and compiled artifacts for treasury, streaming, distribution, and governance modules.
- `docs/`: Mintlify documentation (concepts, guides, API reference, app guide).

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
- `ADMIN_EXPORT_TOKEN`: optional, enables `/api/admin/export` (redacts private-key columns).
- Authority and fee-payer values used by specific product flows when enabled.

### Frontend

- `VITE_API_BASE_URL`: backend host the app proxies API calls to.

### Optional services

The repo also includes optional indexer and executor services under `backend/indexer/` and `backend/executor/` for richer activity and automation workflows.

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

- Frontend: static deploy of `frontend/dist`.
- Backend API: Node deployment with a Postgres database (Supabase or self-hosted).
- Contracts: compiled locally and consumed by the backend and tests.
- Docs: Mintlify documentation under `docs/`.

Mainnet rollout should follow contract review, operational testing, and wallet compatibility checks.

## Documentation

- Product docs: `docs/`
- Public docs site: [docs.flowguard.cash](https://docs.flowguard.cash)

## Status

FlowGuard is actively evolving. Some surfaces are still marked alpha, beta, or preview while the contract-backed flows continue to expand across treasury, stream, distribution, and governance modules.

## License

MIT. See [LICENSE](./LICENSE).
