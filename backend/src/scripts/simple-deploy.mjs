/**
 * Simple Deployment Script (ESM)
 * Directly uses CashScript to deploy without service layer dependencies
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hexToBin } from '@bitauth/libauth';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load contract artifact
const artifactPath = join(__dirname, '../../../contracts/FlowGuardEnhanced.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

// Generate test public key
function generateTestPubkey() {
  const pubkey = randomBytes(33);
  pubkey[0] = 0x02; // Compressed
  return Buffer.from(pubkey).toString('hex');
}

async function deploy() {
  console.log('🚀 FlowGuard Enhanced Contract Deployment to Chipnet\n');
  console.log('='.repeat(60));
  
  // Configuration
  const signer1 = process.env.SIGNER1_PUBKEY || generateTestPubkey();
  const signer2 = process.env.SIGNER2_PUBKEY || generateTestPubkey();
  const signer3 = process.env.SIGNER3_PUBKEY || generateTestPubkey();
  const approvalThreshold = parseInt(process.env.APPROVAL_THRESHOLD || '2');
  const cycleDuration = parseInt(process.env.CYCLE_DURATION || '2592000');
  const spendingCap = parseInt(process.env.SPENDING_CAP || '100000000');
  const vaultStartTime = Math.floor(Date.now() / 1000);
  const state = 0;
  
  console.log('\n📝 Configuration:');
  console.log(`   Approval Threshold: ${approvalThreshold}-of-3`);
  console.log(`   Cycle Duration: ${cycleDuration} seconds (${Math.round(cycleDuration / 86400)} days)`);
  console.log(`   Spending Cap: ${spendingCap} satoshis (${spendingCap / 100000000} BCH)`);
  console.log(`   Start Time: ${new Date(vaultStartTime * 1000).toISOString()}`);
  console.log(`\n🔑 Signer Public Keys:`);
  console.log(`   Signer 1: ${signer1.substring(0, 20)}...`);
  console.log(`   Signer 2: ${signer2.substring(0, 20)}...`);
  console.log(`   Signer 3: ${signer3.substring(0, 20)}...`);
  
  try {
    console.log('\n📦 Step 1: Connecting to chipnet...');
    const provider = new ElectrumNetworkProvider('chipnet');
    
    console.log('✅ Connected to chipnet');
    
    console.log('\n📦 Step 2: Creating contract instance...');
    const contract = new Contract(
      artifact,
      [
        hexToBin(signer1),
        hexToBin(signer2),
        hexToBin(signer3),
        BigInt(approvalThreshold),
        BigInt(state),
        BigInt(cycleDuration),
        BigInt(vaultStartTime),
        BigInt(spendingCap),
      ],
      { provider }
    );
    
    const contractAddress = contract.address;
    console.log('✅ Contract instance created!');
    console.log(`\n📋 Contract Details:`);
    console.log(`   Address: ${contractAddress}`);
    
    console.log('\n💰 Step 3: Checking contract balance...');
    const utxos = await contract.getUtxos();
    const balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    
    console.log(`   Balance: ${balance} satoshis (${balance / 100000000} BCH)`);
    console.log(`   UTXOs: ${utxos.length}`);
    
    if (balance === 0) {
      console.log('\n⚠️  Contract is not yet funded');
      console.log('\n📤 To deploy, send chipnet BCH to this address:');
      console.log(`   ${contractAddress}`);
      console.log('\n💧 Get chipnet BCH from: https://tbch.googol.cash/');
      console.log(`\n🔍 View on explorer: https://chipnet.imaginary.cash/address/${contractAddress}`);
    } else {
      console.log('\n✅ Contract is deployed and funded!');
      console.log(`\n🔍 View on explorer: https://chipnet.imaginary.cash/address/${contractAddress}`);
      
      if (utxos.length > 0) {
        console.log('\n📦 UTXO Details:');
        utxos.forEach((utxo, i) => {
          console.log(`   ${i + 1}. ${utxo.satoshis} satoshis`);
          console.log(`      TXID: ${utxo.txid}`);
          console.log(`      VOUT: ${utxo.vout}`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Deployment process complete!');
    console.log('\n📊 Summary:');
    console.log(`   Contract Address: ${contractAddress}`);
    console.log(`   Status: ${balance > 0 ? 'Funded and Active' : 'Awaiting Funding'}`);
    console.log(`   Balance: ${balance / 100000000} BCH`);
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

deploy().catch(console.error);

