# FlowGuard Contract Testing Guide

After funding your contract, here's how to test all the features:

## Step 1: Verify Your Contract

First, verify that your contract is funded:

```bash
cd backend
node src/scripts/verify-contract.mjs <your-contract-address>
```

Or if you know the signer keys:
```bash
node src/scripts/verify-contract.mjs <contract-address> <signer1> <signer2> <signer3>
```

## Step 2: Test Contract Functions

### Option A: Using the API (Recommended)

1. **Start the backend server:**
   ```bash
   cd backend
   pnpm dev
   ```

2. **Create a vault record** (required for API):
   ```bash
   curl -X POST http://localhost:3001/api/vaults \
     -H "Content-Type: application/json" \
     -H "x-user-address: <your-address>" \
     -d '{
       "signers": ["signer1-address", "signer2-address", "signer3-address"],
       "signerPubkeys": ["<signer1-pubkey>", "<signer2-pubkey>", "<signer3-pubkey>"],
       "approvalThreshold": 2,
       "spendingCap": 1,
       "cycleDuration": 2592000,
       "contractAddress": "<your-contract-address>"
     }'
   ```

3. **Create a proposal:**
   ```bash
   curl -X POST http://localhost:3001/api/proposals \
     -H "Content-Type: application/json" \
     -H "x-user-address: <your-address>" \
     -d '{
       "vaultId": "<vault-id>",
       "recipient": "<recipient-address>",
       "amount": 0.001,
       "reason": "Test proposal"
     }'
   ```

4. **Approve the proposal:**
   ```bash
   curl -X POST http://localhost:3001/api/proposals/<proposal-id>/approve \
     -H "Content-Type: application/json" \
     -H "x-user-address: <signer-address>"
   ```

5. **Execute the payout:**
   ```bash
   curl -X POST http://localhost:3001/api/proposals/<proposal-id>/execute \
     -H "Content-Type: application/json" \
     -H "x-user-address: <signer-address>"
   ```

### Option B: Direct Contract Testing

For direct contract interaction, you'll need to:

1. **Get signer private keys** (for signing transactions)
2. **Use CashScript SDK** to build and sign transactions
3. **Broadcast transactions** to chipnet

## Step 3: Test Cycle Unlocks

To test cycle unlocks:

1. **Wait for a cycle period** (or adjust `vaultStartTime` in testing)
2. **Call unlock function** via API or directly:
   ```bash
   curl -X POST http://localhost:3001/api/cycles/unlock \
     -H "Content-Type: application/json" \
     -d '{
       "vaultId": "<vault-id>",
       "cycleNumber": 0
     }'
   ```

## Step 4: Monitor Transactions

View your contract on chipnet explorers:
- **Imaginary Cash**: https://chipnet.imaginary.cash/address/<contract-address>
- **Blockchair**: https://blockchair.com/bitcoin-cash/testnet/address/<contract-address>

## Important Notes

1. **Signatures Required**: All contract functions require valid signatures from the signers
2. **State Management**: The contract uses on-chain state tracking - each transaction updates the state
3. **Spending Cap**: Proposals cannot exceed the spending cap
4. **Approval Threshold**: Execute payout requires the threshold number of signatures (e.g., 2-of-3)

## Troubleshooting

### "Contract parameters do not match"
- Make sure you're using the correct signer public keys
- Verify the contract was deployed with the same parameters

### "Insufficient balance"
- Ensure the contract has enough BCH for the transaction + fees
- Check UTXOs are confirmed

### "Proposal not approved"
- Ensure enough signers have approved the proposal
- Check the approval threshold is met

## Next Steps

Once testing is complete:
1. Document any issues found
2. Test edge cases (max amounts, multiple proposals, etc.)
3. Prepare for mainnet deployment (after CHIPs activate in May 2026)

