# FlowGuard

FlowGuard is a BCH-native operating layer for contract-backed treasuries, streams, payments, distributions, and governance workflows on Bitcoin Cash.

It combines CashScript covenants, wallet-driven signing, backend transaction builders, and indexer activity views so teams can run treasury logic on-chain without giving custody to an application server.

## What FlowGuard includes

- Multi-member treasury vaults with policy controls, proposal workflows, and activity tracking
- Contract-backed stream families for linear, cliffed linear, hybrid, recurring, refillable recurring, milestone, and tranche schedules
- One-time payments and recurring payout flows
- Airdrops, rewards, bounties, and grants backed by on-chain contract logic
- Governance proposal and vote-lock infrastructure for treasury-linked decision making
- Personal and organization workspace surfaces in the frontend

## Stream families supported today

FlowGuard does not treat every schedule as the same thing under the hood. The app currently ships with contract-backed support for:

- Linear vesting
- Linear vesting with a cliff
- Hybrid schedules with an upfront unlock and linear tail
- Fixed-cadence recurring schedules
- Refillable recurring schedules
- Milestone-based step schedules
- Bounded custom tranche schedules

The frontend includes a shape gallery, schedule previews, row-level batch charts, batch history, treasury-linked activity feeds, and personal or organization launch flows for the same shared stream builders.

## Repository layout

- `frontend/`
  React + Vite application for the public site, personal workspace, and organization workspace
- `backend/`
  Express + TypeScript API for transaction building, app state, indexing hooks, and execution services
- `contracts/`
  CashScript covenant source and compiled artifacts for treasury, streaming, distribution, and governance modules
- `docs/`
  Product, guide, API, and reference documentation

## Core architecture

FlowGuard keeps users in control of signing:

1. The frontend collects configuration and requests a transaction build.
2. The backend assembles a contract-aware unsigned transaction descriptor.
3. The user signs in a BCH wallet.
4. The signed transaction is broadcast to the Bitcoin Cash network.
5. The app observes the resulting contract state and updates activity/history views.

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

Key environment values in `backend/.env`:

- `PORT`
- `BCH_NETWORK=chipnet|mainnet`
- `DATABASE_PATH`
- `CHAINGRAPH_URL` for richer chain indexing when configured
- backend authority or fee-payer values used by specific product flows, when enabled

### Frontend

- `VITE_API_BASE_URL` pointing at the backend host

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

## Contract verification commands

Current local verification paths:

```bash
cd contracts && pnpm run check
cd contracts && pnpm run test:unit
cd contracts && pnpm run test:streaming
```

## Deployment notes

- Frontend: static deployment for `frontend/dist`
- Backend API: Node deployment with persistent storage for SQLite when used
- Contracts: compiled locally and consumed by the backend and tests
- Docs: Mint-based documentation under `docs/`

Production use should follow contract review, operational testing, and wallet compatibility checks before mainnet rollout.

## Documentation

- Product docs: `docs/`
- Public docs site: `https://docs.flowguard.cash`

## Status

FlowGuard is actively evolving. Some surfaces are still marked alpha, beta, or preview while the contract-backed flows continue to expand across treasury, stream, distribution, and governance modules.

## License

MIT. See [LICENSE](./LICENSE).
