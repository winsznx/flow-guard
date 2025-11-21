# FlowGuard Chipnet Deployment Guide

This guide walks you through deploying FlowGuard Enhanced contracts to Bitcoin Cash chipnet (testnet).

## Prerequisites

1. **Chipnet BCH**: Get testnet BCH from the [Chipnet Faucet](https://tbch.googol.cash/)
2. **Node.js 18+** and **pnpm** installed
3. **Three Signer Public Keys**: You'll need 3 public keys (hex format) from BCH wallets

## Quick Deployment

### Method 1: Using API Endpoint (Recommended)

The easiest way to deploy is through the API endpoint:

```bash
# Start the backend server
cd backend
pnpm dev

# In another terminal, deploy via API
curl -X POST http://localhost:3001/api/deployment/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "signer1": "02...",
    "signer2": "02...",
    "signer3": "02...",
    "approvalThreshold": 2,
    "cycleDuration": 2592000,
    "spendingCap": 100000000
  }'
```

### Method 2: Using Deployment Script

```bash
cd backend
pnpm install
pnpm deploy:chipnet
```

The script will:
- Generate test signer keys (or use environment variables)
- Create a contract instance
- Display the contract address
- Check if the contract is funded
- Provide funding instructions if needed

**Note**: If you encounter module issues with tsx, use the API method instead.

### Step 3: Fund the Contract

If the contract address has no balance, send chipnet BCH to the displayed address:

1. **Get chipnet BCH**: Visit https://tbch.googol.cash/
2. **Send BCH**: Send at least 0.001 BCH (100,000 satoshis) to the contract address
3. **Verify**: Run the script again to verify deployment

### Step 4: Verify Deployment

```bash
pnpm verify:deployment <contract-address>
```

Example:
```bash
pnpm verify:deployment bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a
```

## Using Real Signer Keys

To use real wallet public keys instead of test keys:

```bash
export SIGNER1_PUBKEY="02..."
export SIGNER2_PUBKEY="02..."
export SIGNER3_PUBKEY="02..."
export APPROVAL_THRESHOLD=2
export CYCLE_DURATION=2592000  # 30 days
export SPENDING_CAP=100000000  # 1 BCH

pnpm deploy:chipnet
```

## Configuration Options

Environment variables you can set:

- `SIGNER1_PUBKEY`: First signer's public key (hex, 66 chars)
- `SIGNER2_PUBKEY`: Second signer's public key (hex, 66 chars)
- `SIGNER3_PUBKEY`: Third signer's public key (hex, 66 chars)
- `APPROVAL_THRESHOLD`: Number of signatures required (default: 2)
- `CYCLE_DURATION`: Cycle duration in seconds (default: 2592000 = 30 days)
- `SPENDING_CAP`: Maximum spending per period in satoshis (default: 100000000 = 1 BCH)

## Deployment Process Explained

### What Happens During Deployment

1. **Contract Instance Creation**: The script creates a CashScript contract instance with your parameters
2. **Address Generation**: Bitcoin Cash generates a unique address for your contract based on the parameters
3. **Funding Required**: To "deploy" the contract, you must send BCH to this address (creates a UTXO)
4. **Verification**: Once funded, the contract is live and can receive transactions

### Contract Address

The contract address is deterministic - the same parameters will always generate the same address. This means:
- You can verify the address matches your parameters
- You can safely share the address for funding
- The address is permanent (as long as parameters don't change)

## Viewing Your Deployment

After deployment, you can view your contract on chipnet explorers:

- **Imaginary Cash**: https://chipnet.imaginary.cash/address/{contract-address}
- **Blockchair**: https://blockchair.com/bitcoin-cash/testnet/address/{contract-address}

## Testing the Contract

Once deployed and funded, you can:

1. **Test via API**: Use the backend API to create proposals, approvals, and payouts
2. **Monitor Balance**: Check contract balance using the verification script
3. **View UTXOs**: See all UTXOs locked in the contract

## Troubleshooting

### "Contract address has no balance"

- The contract instance was created, but no BCH has been sent to it yet
- Send chipnet BCH to the displayed address
- Wait a few seconds for confirmation
- Run the verification script again

### "Contract parameters do not match"

- The signer keys or other parameters don't match the contract address
- Ensure you're using the same parameters that created the contract
- Check that environment variables are set correctly

### "Failed to connect to network"

- Check your internet connection
- Verify chipnet network is accessible
- Try again after a few seconds

## Next Steps

After successful deployment:

1. **Save Contract Address**: Store the contract address in your vault record
2. **Test Functions**: Create test proposals and approvals
3. **Monitor Activity**: Use the blockchain monitor to track transactions
4. **Document Parameters**: Keep a record of all contract parameters for future reference

## Production Deployment

For mainnet deployment (after CHIPs activate in May 2026):

1. Change network from `chipnet` to `mainnet` in the script
2. Use real BCH (not testnet)
3. Ensure all parameters are correct (they cannot be changed after deployment)
4. Consider a security audit before deploying with real funds

