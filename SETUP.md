# FlowGuard Setup Guide

## Prerequisites

- Node.js 18+ 
- pnpm 8+
- BCH testnet access
- Selene or mainnet.cash wallet

## Installation

```bash
# Install dependencies for all packages
pnpm install

# Or install individually
cd contracts && pnpm install
cd ../backend && pnpm install
cd ../frontend && pnpm install
```

## Development

### Backend

```bash
cd backend
pnpm dev
```

Backend runs on http://localhost:3001

### Frontend

```bash
cd frontend
pnpm dev
```

Frontend runs on http://localhost:3000 (Vite dev server)

### Contracts

```bash
cd contracts
pnpm build  # Compile contracts (requires CashScript setup)
pnpm test   # Run tests
```

## Environment Variables

### Backend (.env)

```env
PORT=3001
NODE_ENV=development
DATABASE_PATH=./flowguard.db
BCH_NETWORK=testnet
CHAINGRAPH_URL=http://localhost:3000
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3001/api
```

## Project Structure

```
flowguard/
├── contracts/      # Layla CHIPs smart contracts
├── frontend/       # React + Vite frontend
├── backend/        # Express.js API
└── docs/           # Documentation
```

## Key Features Implemented

- ✅ Vault creation wizard
- ✅ Proposal creation and approval
- ✅ Dashboard with vault management
- ✅ API endpoints for all operations
- ✅ Design system (inspired by Loop Crypto)
- ✅ Footer design (inspired by Safe.global)

## Next Steps

1. Set up CashScript for contract compilation
2. Integrate Selene/mainnet.cash wallets
3. Add transaction monitoring
4. Connect frontend to real API
5. Deploy to testnet

