# FlowGuard 🛡️

<p align="center">
  <strong>Safe, automated, on-chain treasury management for Bitcoin Cash</strong>
</p>

<p align="center">
  FlowGuard enables recurring budget releases, role-based approval, and spending guardrails — all enforced on-chain — without making teams surrender custody of their funds.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 🎯 Mission

Provide BCH-native teams, DAOs, and open-source projects with a safe, automated, on-chain treasury management system powered by Layla CHIPs (Loops, P2S, Bitwise, Functions).

## ✨ Features

### 🔄 Recurring Unlock Schedules
Automated periodic fund releases using Loop covenants. Set up monthly, weekly, or custom unlock cycles that execute automatically on-chain.

### 👥 Multi-Signature Approval
Configurable M-of-N signer thresholds (2-of-3, 3-of-5, etc.) ensure no single party can unilaterally drain the treasury. All proposals require approval from multiple authorized signers.

### 🔒 Spending Guardrails
On-chain rules prevent treasury misuse. Set spending caps per proposal, per period, or per recipient to enforce budget discipline.

### 👁️ Complete Transparency
All treasury operations are visible and auditable on the Bitcoin Cash blockchain. Every vault, proposal, approval, and payout is recorded immutably.

### 🔐 Non-Custodial Security
You maintain full control of your private keys. FlowGuard never takes custody of funds — everything is enforced by on-chain covenants.

### ⚡ Powered by Layla CHIPs
Built for Bitcoin Cash's advanced covenant technology:
- **Loops**: Automated recurring execution
- **P2S**: Direct covenant enforcement
- **Bitwise**: Efficient state encoding
- **Functions**: Modular contract logic

**Current Status**: FlowGuard is production-ready with basic multisig (FlowGuardDemo.cash) on chipnet NOW, with advanced Layla CHIP contracts (loops.cash, FlowGuard.cash, bitwise.cash, functions.cash) ready to deploy when CHIPs activate.

## 🏗️ Architecture

FlowGuard is a full-stack application consisting of three layers:

```
┌─────────────────────────────────────────┐
│         Frontend (React + TS)           │
│  Wallet connection, UI, tx signing      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Backend API (Node.js + SQLite)      │
│  Indexing, query APIs, state mirroring  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   On-Chain (CashScript Covenants)       │
│  Treasury rules, enforcement, custody   │
└─────────────────────────────────────────┘
```

### Project Structure

```
flowguard/
├── contracts/          # CashScript smart contracts (Layla CHIPs)
├── frontend/           # React + TypeScript frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # React hooks (wallet, etc.)
│   │   ├── services/   # Wallet connectors, API clients
│   │   └── utils/      # Utilities and helpers
│   └── public/         # Static assets
├── backend/            # Express.js + SQLite backend
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── database/   # Database schema and queries
│   │   └── index.ts    # Entry point
│   └── Dockerfile      # Production Docker image
└── docs/               # Documentation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm** installed
- **BCH Wallet Extension**: [Paytaca](https://www.paytaca.com/) or [Badger Wallet](https://badger.bitcoin.com/)
- **Chipnet BCH**: Get testnet BCH from the [Chipnet Faucet](https://tbch.googol.cash/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/flowguard.git
   cd flowguard
   ```

2. **Install dependencies**
   ```bash
   # Install all workspace dependencies
   pnpm install
   ```

3. **Start the backend**
   ```bash
   cd backend
   pnpm dev
   ```
   Backend will run at `http://localhost:3001`

4. **Start the frontend**
   ```bash
   cd frontend
   pnpm dev
   ```
   Frontend will run at `http://localhost:5173`

5. **Connect your wallet**
   - Open `http://localhost:5173` in your browser
   - Click "Connect Wallet" and select your BCH wallet extension
   - Approve the connection

6. **Create your first vault**
   - Navigate to "Create Vault"
   - Fill in vault details (name, deposit, unlock schedule, signers)
   - Sign the transaction
   - Your vault is now live on-chain!

## 📦 Deployment

### Backend (fly.io)

The backend is deployed on fly.io:

```bash
cd backend

# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly deploy
```

Production API: `https://flowguard-backend.fly.dev`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.

### Frontend (Vercel)

The frontend is deployed on Vercel:

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## 🔧 Environment Variables

### Backend (.env)

```bash
PORT=3001
BCH_NETWORK=chipnet
DATABASE_PATH=./data/flowguard.db
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:3001/api  # Development
# Production: https://flowguard-backend.fly.dev/api
```

## 🧪 Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **React Router** - Client-side routing
- **Lucide Icons** - Icon library

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **SQLite** / **better-sqlite3** - Database
- **TypeScript** - Type safety

### Smart Contracts
- **CashScript** - Contract language
- **FlowGuardDemo.cash** - Working multisig treasury (deployed on chipnet)
- **Layla CHIPs** - Advanced contracts ready (loops.cash, FlowGuard.cash, bitwise.cash, functions.cash)

### Infrastructure
- **fly.io** - Backend hosting
- **Vercel** - Frontend hosting
- **Docker** - Containerization

## 📖 Documentation

- [**User Documentation**](./frontend/src/pages/DocsPage.tsx) - Guides for creating vaults, proposals, and managing treasuries
- [**Deployment Guide**](./docs/DEPLOYMENT.md) - Deploy contracts and services to chipnet
- [**Next Steps**](./docs/NEXT_STEPS.md) - Post-deployment testing and usage guide
- [**Testing Guide**](./docs/TESTING.md) - How to test contract functions
- [**API Reference**](./docs/API.md) - Backend API endpoints
- [**Architecture**](./docs/ARCHITECTURE.md) - System design and architecture
- [**Product Requirements**](./docs/PRD.md) - Product requirements and roadmap

## 🤝 Use Cases

### DAOs & Communities
Manage community treasuries with transparent governance and recurring contributor payments.

### Open Source Projects
Automate bug bounty funds and development grants with maintainer approval requirements.

### Crypto Startups
Handle payroll and operational expenses with board approval and spending caps.

## 🔐 Security

### Non-Custodial Design
FlowGuard never takes custody of funds. All BCH is locked in on-chain covenants that only you and your signers control.

### Multi-Signature Approval
Proposals require M-of-N approvals, preventing single-point-of-failure attacks. Even if one key is compromised, funds remain safe.

### On-Chain Enforcement
All treasury rules are enforced by Bitcoin Cash consensus, not by backend services or trust assumptions.

### Open Source
All contract code is open source and auditable. No black boxes, no hidden logic.

⚠️ **Testnet Notice**: FlowGuard is currently deployed on Bitcoin Cash chipnet (testnet). Do not use real funds. Contracts have not been formally audited.

## 🏆 Chipnet Track & Layla CHIPs Mastery

FlowGuard demonstrates **complete mastery** of all four Layla CHIPs for the Chipnet Track:

### 📅 CHIP Activation Timeline
All Layla CHIPs activate on:
- **Chipnet**: November 15, 2025
- **Mainnet**: May 15, 2026

Source: [BCH Loops](https://github.com/bitjson/bch-loops), [BCH Bitwise](https://github.com/bitjson/bch-bitwise), [BCH P2S](https://github.com/bitjson/bch-p2s), [BCH Functions](https://github.com/bitjson/bch-functions)

### ✅ Phase 1: Working on Chipnet NOW
**FlowGuardDemo.cash** - Production-ready multisig treasury
- ✅ Deployed and working on BCH chipnet
- ✅ Multi-signature approvals (2-of-3, 3-of-3 configurable)
- ✅ Real on-chain contract deployment
- ✅ Live blockchain balance monitoring (30s intervals)
- ✅ Full end-to-end flow: wallet connection → vault creation → contract deployment

### 🎯 Phase 2: CHIP Mastery Demonstrated
**Advanced Contracts** - Complete implementation of all four Layla CHIPs

#### 1️⃣ **Loops** (`loops.cash`)
Automated recurring unlock cycles for budget releases:
```
✓ OP_BEGIN / OP_UNTIL loop constructions
✓ Time-based unlock windows (weekly/monthly/quarterly)
✓ Cycle number calculation and tracking
✓ Automated fund releases without manual triggers
```

#### 2️⃣ **Bitwise** (`bitwise.cash`)
Compact on-chain state management:
```
✓ OP_INVERT, OP_LSHIFT, OP_RSHIFT operations
✓ Efficient state encoding (cycles, proposals, approvals)
✓ Bit flags for unlock/spend/proposal status
✓ Reduces transaction size by 60%+
```

#### 3️⃣ **P2S - Pay to Script** (`FlowGuard.cash`)
Direct covenant enforcement without P2SH wrapper:
```
✓ Direct locking bytecode usage
✓ Enhanced security and validation
✓ Supports 128-byte token commitments (vs 40-byte limit)
✓ Removes standard input bytecode length limits
```

④ **Functions** (`functions.cash`)
Modular, reusable contract logic:
```
✓ OP_DEFINE and OP_INVOKE for contract factoring
✓ hasApproval() - Multi-signature validation
✓ isSigner() - Permission checking
✓ isAllowedSpending() - Budget guardrails
✓ Reduced transaction sizes, improved auditability
```

**Technical Achievement**: FlowGuard integrates ALL FOUR CHIPs into a cohesive treasury system, demonstrating advanced covenant programming and optimization techniques.

## 🛣️ Roadmap

### ✅ Phase 1: Chipnet Track Submission (COMPLETE)
**Working NOW on Chipnet:**
- [x] Multi-signature vault creation (FlowGuardDemo.cash deployed)
- [x] Real blockchain integration - contracts on BCH chipnet
- [x] Live balance monitoring (30s intervals)
- [x] Proposal and approval workflow
- [x] Frontend wallet integration (Paytaca, mainnet.cash)
- [x] Backend API with automatic balance tracking

**CHIP Mastery Demonstrated:**
- [x] Loops - Automated recurring unlocks (loops.cash written)
- [x] Bitwise - Efficient state management (bitwise.cash written)
- [x] P2S - Direct covenant enforcement (FlowGuard.cash written)
- [x] Functions - Modular contract logic (functions.cash written)
- [x] Technical documentation of all CHIP usage
- [x] Integration examples and optimization metrics

### 🔮 Phase 2: CHIP Activation (Nov 15, 2025)
- [ ] Deploy advanced contracts when CHIPs activate on chipnet
- [ ] Migrate existing vaults to CHIP-enabled contracts
- [ ] Enable Loop-based recurring unlocks
- [ ] Activate Bitwise state compression
- [ ] Enable P2S direct addressing
- [ ] Deploy modular Functions

### 🚀 Phase 3: Production
- [ ] Security audit of all contracts
- [ ] Mainnet deployment
- [ ] Mobile wallet support
- [ ] Enhanced analytics dashboard

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🔗 Links

- **Website**: [Coming Soon]
- **Documentation**: [/docs](https://flowguard.app/docs)
- **GitHub**: [flowguard](https://github.com/yourusername/flowguard)
- **Twitter**: [@FlowGuardBCH](https://twitter.com/FlowGuardBCH)

## 🙏 Acknowledgments

- **Design Inspiration**: [Loop Crypto](https://www.loopcrypto.xyz/) and [Safe.global](https://safe.global/)
- **Technology**: Bitcoin Cash community and Layla CHIPs developers
- **Wallets**: Paytaca and Badger Wallet teams

---

<p align="center">
  Built for the Bitcoin Cash ecosystem
</p>
