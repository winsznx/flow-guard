#!/bin/bash
# FlowGuard Contract Testing Script
# Tests the complete contract workflow using curl

set -e

CONTRACT_ADDRESS="bchtest:pvwj657cm4wmjruparrs7c899370ldx6t3u0cyfj574rjh5mrjqajtue6w8dm"
API_BASE="http://localhost:3001"
TEST_RECIPIENT="bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a"

echo "🧪 FlowGuard Contract Testing"
echo "============================================================"
echo "Contract: $CONTRACT_ADDRESS"
echo "API: $API_BASE"
echo ""

# Step 1: Check API health
echo "📡 Step 1: Checking API health..."
if curl -s "$API_BASE/health" > /dev/null; then
    echo "✅ API is running"
else
    echo "❌ API is not running"
    echo ""
    echo "💡 Start the backend server:"
    echo "   cd backend && pnpm dev"
    exit 1
fi

# Step 2: Register vault
echo ""
echo "📝 Step 2: Registering vault..."
VAULT_RESPONSE=$(curl -s -X POST "$API_BASE/api/vaults" \
  -H "Content-Type: application/json" \
  -H "x-user-address: bchtest:test-creator" \
  -d '{
    "signers": [
      "bchtest:signer1-address",
      "bchtest:signer2-address",
      "bchtest:signer3-address"
    ],
    "signerPubkeys": [
      "020000000000000000000000000000000000000000000000000000000000000000",
      "020000000000000000000000000000000000000000000000000000000000000001",
      "020000000000000000000000000000000000000000000000000000000000000002"
    ],
    "approvalThreshold": 2,
    "spendingCap": 1,
    "cycleDuration": 2592000,
    "unlockAmount": 0,
    "totalDeposit": 1,
    "contractAddress": "'"$CONTRACT_ADDRESS"'"
  }')

if echo "$VAULT_RESPONSE" | grep -q "vaultId"; then
    VAULT_ID=$(echo "$VAULT_RESPONSE" | grep -o '"vaultId":"[^"]*' | cut -d'"' -f4)
    echo "✅ Vault registered: $VAULT_ID"
else
    echo "⚠️  Vault registration response: $VAULT_RESPONSE"
    echo "💡 Vault might already exist. Trying to get existing vaults..."
    VAULTS=$(curl -s -X GET "$API_BASE/api/vaults" \
      -H "x-user-address: bchtest:test-creator")
    
    if echo "$VAULTS" | grep -q "vaultId"; then
        VAULT_ID=$(echo "$VAULTS" | grep -o '"vaultId":"[^"]*' | head -1 | cut -d'"' -f4)
        echo "✅ Using existing vault: $VAULT_ID"
    else
        echo "❌ Cannot proceed without vault"
        exit 1
    fi
fi

# Step 3: Create proposal
echo ""
echo "💡 Step 3: Creating proposal..."
PROPOSAL_RESPONSE=$(curl -s -X POST "$API_BASE/api/proposals" \
  -H "Content-Type: application/json" \
  -H "x-user-address: bchtest:test-creator" \
  -d '{
    "vaultId": "'"$VAULT_ID"'",
    "recipient": "'"$TEST_RECIPIENT"'",
    "amount": 0.001,
    "reason": "Test proposal from automated script"
  }')

if echo "$PROPOSAL_RESPONSE" | grep -q '"id"'; then
    PROPOSAL_ID=$(echo "$PROPOSAL_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "✅ Proposal created: $PROPOSAL_ID"
    echo "$PROPOSAL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PROPOSAL_RESPONSE"
else
    echo "❌ Failed to create proposal: $PROPOSAL_RESPONSE"
    exit 1
fi

# Step 4: Approve proposal (first signer)
echo ""
echo "✅ Step 4: Approving proposal (signer 1)..."
APPROVAL1_RESPONSE=$(curl -s -X POST "$API_BASE/api/proposals/$PROPOSAL_ID/approve" \
  -H "Content-Type: application/json" \
  -H "x-user-address: bchtest:signer1-address")

if echo "$APPROVAL1_RESPONSE" | grep -q "approvalCount"; then
    echo "✅ Proposal approved by signer 1"
    echo "$APPROVAL1_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$APPROVAL1_RESPONSE"
else
    echo "⚠️  Approval response: $APPROVAL1_RESPONSE"
fi

# Step 5: Approve proposal (second signer)
echo ""
echo "✅ Step 5: Approving proposal (signer 2)..."
APPROVAL2_RESPONSE=$(curl -s -X POST "$API_BASE/api/proposals/$PROPOSAL_ID/approve" \
  -H "Content-Type: application/json" \
  -H "x-user-address: bchtest:signer2-address")

if echo "$APPROVAL2_RESPONSE" | grep -q "approvalCount"; then
    echo "✅ Proposal approved by signer 2"
    echo "$APPROVAL2_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$APPROVAL2_RESPONSE"
else
    echo "⚠️  Approval response: $APPROVAL2_RESPONSE"
fi

# Step 6: Get proposal status
echo ""
echo "📊 Step 6: Checking proposal status..."
PROPOSAL_STATUS=$(curl -s -X GET "$API_BASE/api/proposals/$PROPOSAL_ID")
echo "$PROPOSAL_STATUS" | python3 -m json.tool 2>/dev/null || echo "$PROPOSAL_STATUS"

# Step 7: Execute payout
echo ""
echo "💰 Step 7: Attempting to execute payout..."
EXECUTE_RESPONSE=$(curl -s -X POST "$API_BASE/api/proposals/$PROPOSAL_ID/execute" \
  -H "Content-Type: application/json" \
  -H "x-user-address: bchtest:signer1-address")

if echo "$EXECUTE_RESPONSE" | grep -q "txHash\|transaction"; then
    echo "✅ Payout execution initiated"
    echo "$EXECUTE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$EXECUTE_RESPONSE"
else
    echo "⚠️  Execute response: $EXECUTE_RESPONSE"
    echo "   (On-chain execution requires valid signatures)"
fi

# Summary
echo ""
echo "============================================================"
echo "✅ Testing Complete!"
echo ""
echo "📋 Summary:"
echo "   Vault ID: $VAULT_ID"
echo "   Proposal ID: $PROPOSAL_ID"
echo "   Contract: $CONTRACT_ADDRESS"
echo ""
echo "💡 Next Steps:"
echo "   1. Check proposal: curl $API_BASE/api/proposals/$PROPOSAL_ID"
echo "   2. View contract: https://chipnet.imaginary.cash/address/$CONTRACT_ADDRESS"

