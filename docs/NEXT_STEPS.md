# Next Steps - FlowGuard Contract Testing

## ✅ Current Status

**Contract Address:** `bchtest:pvwj657cm4wmjruparrs7c899370ldx6t3u0cyfj574rjh5mrjqajtue6w8dm`  
**Balance:** 0.01015 BCH (1,015,000 satoshis)  
**Status:** ✅ Funded and ready to use!

## 🎯 Immediate Next Steps

### 1. Fix Database Module Issue

The backend server requires `better-sqlite3` to be properly built for Node.js v24.7.0:

```bash
cd backend
# Option 1: Rebuild the module
pnpm rebuild better-sqlite3

# Option 2: Use Node.js 18 or 20 (better compatibility)
# Install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# nvm install 20
# nvm use 20
# pnpm install
```

### 2. Start Backend Server

```bash
cd backend
pnpm dev
```

The server will start on `http://localhost:3001`

### 3. Register Vault in Database

The contract is already deployed. Register it via API:

```bash
curl -X POST http://localhost:3001/api/vaults \
  -H "Content-Type: application/json" \
  -H "x-user-address: <your-bch-address>" \
  -d '{
    "signers": ["signer1-address", "signer2-address", "signer3-address"],
    "signerPubkeys": ["<signer1-pubkey-hex>", "<signer2-pubkey-hex>", "<signer3-pubkey-hex>"],
    "approvalThreshold": 2,
    "spendingCap": 1,
    "cycleDuration": 2592000,
    "unlockAmount": 0,
    "totalDeposit": 1,
    "contractAddress": "bchtest:pvwj657cm4wmjruparrs7c899370ldx6t3u0cyfj574rjh5mrjqajtue6w8dm"
  }'
```

**Note:** If you don't have the exact signer keys, use placeholder keys. The contract address is what matters.

### 4. Test Contract Functions

#### Create a Proposal

```bash
curl -X POST http://localhost:3001/api/proposals \
  -H "Content-Type: application/json" \
  -H "x-user-address: <your-address>" \
  -d '{
    "vaultId": "<vault-id-from-step-3>",
    "recipient": "bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    "amount": 0.001,
    "reason": "Test proposal"
  }'
```

#### Approve Proposal

```bash
curl -X POST http://localhost:3001/api/proposals/<proposal-id>/approve \
  -H "Content-Type: application/json" \
  -H "x-user-address: <signer-address>"
```

#### Execute Payout

```bash
curl -X POST http://localhost:3001/api/proposals/<proposal-id>/execute \
  -H "Content-Type: application/json" \
  -H "x-user-address: <signer-address>"
```

## 🔧 Available Scripts

```bash
cd backend

# Deploy contract to chipnet
pnpm deploy:chipnet

# Check contract funding status
pnpm check:funding <contract-address>

# Verify contract deployment
pnpm verify:contract <contract-address>
```

## 📊 Monitor Your Contract

- **Imaginary Cash:** https://chipnet.imaginary.cash/address/bchtest:pvwj657cm4wmjruparrs7c899370ldx6t3u0cyfj574rjh5mrjqajtue6w8dm
- **Blockchair:** https://blockchair.com/bitcoin-cash/testnet/address/bchtest:pvwj657cm4wmjruparrs7c899370ldx6t3u0cyfj574rjh5mrjqajtue6w8dm

## ⚠️ Important Notes

1. **Signer Keys**: For on-chain transactions, you need the actual signer private keys used during deployment
2. **Transaction Fees**: Each transaction requires network fees (~1000-5000 satoshis)
3. **Balance**: Current balance is 0.01015 BCH, enough for several small test transactions
4. **Database**: The database module issue must be resolved before the server can start

## 🎯 Testing Checklist

- [ ] Fix database module issue
- [ ] Start backend server
- [ ] Register vault via API
- [ ] Create test proposal
- [ ] Approve proposal (2 signers)
- [ ] Execute payout
- [ ] Verify on-chain transaction
- [ ] Test cycle unlocks (if applicable)

## 📚 Full Documentation

- [Testing Guide](./TESTING.md) - Detailed testing guide
- [Deployment Guide](./DEPLOYMENT.md) - Deployment information
- [API Reference](./API.md) - Backend API endpoints
- [Architecture](./ARCHITECTURE.md) - System design
