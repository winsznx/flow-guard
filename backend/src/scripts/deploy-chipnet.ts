/**
 * Chipnet Deployment Script
 * 
 * This script deploys FlowGuardEnhanced contract to chipnet (Bitcoin Cash testnet).
 * 
 * Usage:
 *   pnpm tsx src/scripts/deploy-chipnet.ts
 * 
 * Prerequisites:
 *   1. Get chipnet BCH from faucet: https://tbch.googol.cash/
 *   2. Have 3 signer public keys ready (or use the generated test keys)
 */

import { ContractService } from '../services/contract-service';
import { binToHex } from '@bitauth/libauth';
import { randomBytes } from 'crypto';

// Generate a random public key for testing (in production, use real keys from wallets)
function generateTestPubkey(): string {
  // Generate a random 33-byte public key (compressed format)
  const pubkey = randomBytes(33);
  // Set the first byte to indicate compressed public key (0x02 or 0x03)
  pubkey[0] = 0x02;
  return binToHex(pubkey);
}

interface DeploymentConfig {
  signer1: string;
  signer2: string;
  signer3: string;
  approvalThreshold: number;
  cycleDuration: number; // in seconds
  vaultStartTime: number; // Unix timestamp
  spendingCap: number; // in satoshis
}

async function deployContract(config: DeploymentConfig) {
  console.log('🚀 Starting FlowGuard Enhanced Contract Deployment to Chipnet\n');
  console.log('=' .repeat(60));
  
  const contractService = new ContractService('chipnet');
  
  try {
    // Step 1: Deploy contract (create instance and get address)
    console.log('\n📝 Step 1: Creating contract instance...');
    console.log('Configuration:');
    console.log(`  - Approval Threshold: ${config.approvalThreshold}-of-3`);
    console.log(`  - Cycle Duration: ${config.cycleDuration} seconds (${config.cycleDuration / 86400} days)`);
    console.log(`  - Spending Cap: ${config.spendingCap} satoshis (${config.spendingCap / 100000000} BCH)`);
    console.log(`  - Start Time: ${new Date(config.vaultStartTime * 1000).toISOString()}`);
    
    const deployment = await contractService.deployVault(
      config.signer1,
      config.signer2,
      config.signer3,
      config.approvalThreshold,
      0, // Initial state
      config.cycleDuration,
      config.vaultStartTime,
      config.spendingCap
    );
    
    console.log('\n✅ Contract instance created successfully!');
    console.log('=' .repeat(60));
    console.log('\n📋 Contract Details:');
    console.log(`   Address: ${deployment.contractAddress}`);
    console.log(`   Network: chipnet`);
    console.log(`   Contract ID: ${deployment.contractId.substring(0, 20)}...`);
    
    // Step 2: Check if contract is already funded
    console.log('\n💰 Step 2: Checking contract balance...');
    const balance = await contractService.getBalance(deployment.contractAddress);
    console.log(`   Current Balance: ${balance} satoshis (${balance / 100000000} BCH)`);
    
    if (balance > 0) {
      console.log('   ✅ Contract is already funded!');
    } else {
      console.log('   ⚠️  Contract address needs to be funded.');
      console.log('\n📤 Step 3: Fund the contract address');
      console.log('=' .repeat(60));
      console.log('\nTo deploy the contract, send chipnet BCH to this address:');
      console.log(`\n   ${deployment.contractAddress}\n`);
      console.log('Options:');
      console.log('   1. Use chipnet faucet: https://tbch.googol.cash/');
      console.log('   2. Send from your chipnet wallet');
      console.log('   3. Minimum recommended: 0.001 BCH (100,000 satoshis)');
      console.log('\nAfter funding, run this script again to verify deployment.');
      console.log('\n💡 Tip: You can check the balance at:');
      console.log(`   https://chipnet.imaginary.cash/address/${deployment.contractAddress}`);
      return;
    }
    
    // Step 3: Verify contract UTXOs
    console.log('\n🔍 Step 3: Verifying contract UTXOs...');
    const utxos = await contractService.getUTXOs(deployment.contractAddress);
    console.log(`   Found ${utxos.length} UTXO(s):`);
    utxos.forEach((utxo, index) => {
      console.log(`   UTXO ${index + 1}: ${utxo.satoshis} satoshis (txid: ${utxo.txid.substring(0, 16)}...)`);
    });
    
    // Step 4: Test contract functions (read-only)
    console.log('\n🧪 Step 4: Testing contract functions...');
    try {
      // Try to get contract instance (this validates the contract parameters)
      const contract = await contractService.getContract(
        deployment.contractAddress,
        config.signer1,
        config.signer2,
        config.signer3,
        config.approvalThreshold,
        0, // state
        config.cycleDuration,
        config.vaultStartTime,
        config.spendingCap
      );
      console.log('   ✅ Contract instance validated successfully');
      console.log(`   ✅ Contract address matches: ${contract.address === deployment.contractAddress}`);
    } catch (error) {
      console.error('   ❌ Contract validation failed:', error);
      throw error;
    }
    
    // Step 5: Deployment summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DEPLOYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log('\nContract is live on chipnet:');
    console.log(`   Address: ${deployment.contractAddress}`);
    console.log(`   Balance: ${balance} satoshis`);
    console.log(`   UTXOs: ${utxos.length}`);
    console.log('\nNext steps:');
    console.log('   1. Save the contract address to your vault record');
    console.log('   2. Test contract functions via the API');
    console.log('   3. Create proposals and test the full flow');
    console.log('\n📚 View on explorer:');
    console.log(`   https://chipnet.imaginary.cash/address/${deployment.contractAddress}`);
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Main execution
async function main() {
  // Configuration - you can modify these values
  const config: DeploymentConfig = {
    // Generate test keys (in production, use real wallet public keys)
    signer1: process.env.SIGNER1_PUBKEY || generateTestPubkey(),
    signer2: process.env.SIGNER2_PUBKEY || generateTestPubkey(),
    signer3: process.env.SIGNER3_PUBKEY || generateTestPubkey(),
    approvalThreshold: parseInt(process.env.APPROVAL_THRESHOLD || '2'), // 2-of-3
    cycleDuration: parseInt(process.env.CYCLE_DURATION || '2592000'), // 30 days in seconds
    vaultStartTime: Math.floor(Date.now() / 1000), // Current time
    spendingCap: parseInt(process.env.SPENDING_CAP || '100000000'), // 1 BCH in satoshis
  };
  
  console.log('🔑 Using signer public keys:');
  console.log(`   Signer 1: ${config.signer1.substring(0, 20)}...`);
  console.log(`   Signer 2: ${config.signer2.substring(0, 20)}...`);
  console.log(`   Signer 3: ${config.signer3.substring(0, 20)}...`);
  console.log('\n💡 Tip: Set SIGNER1_PUBKEY, SIGNER2_PUBKEY, SIGNER3_PUBKEY env vars to use real keys\n');
  
  await deployContract(config);
}

// Run the script
main().catch(console.error);

