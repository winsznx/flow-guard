# FlowGuard Architecture

## Overview

FlowGuard is built on three main layers:

1. **On-Chain Layer**: Layla CHIPs covenants (P2S, Loops, Bitwise, Functions)
2. **Backend Layer**: Express.js API with transaction monitoring
3. **Frontend Layer**: Next.js/React dashboard with wallet integration

## On-Chain Architecture

### Covenant Structure

- **FlowGuard.cash**: Main covenant enforcing spending rules
- **loops.cash**: Loop module for recurring unlocks
- **bitwise.cash**: Bitwise state encoding module
- **functions.cash**: Reusable function modules

### State Management

State is encoded compactly using bitwise operations:
- Cycle unlock status
- Cycle spend status
- Proposal status (pending/approved/executed)

## Backend Architecture

- Express.js REST API
- PostgreSQL/SQLite database
- BCH transaction monitoring
- Optional notification service

## Frontend Architecture

- Next.js with React
- Wallet integration (Selene, mainnet.cash)
- State management (Zustand/Redux)
- Tailwind CSS for styling

