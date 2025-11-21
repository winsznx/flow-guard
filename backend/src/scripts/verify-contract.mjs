/**
 * Verify Contract Script
 * Checks the status of a deployed FlowGuard contract
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hexToBin } from '@bitauth/libauth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load contract artifact
const artifactPath = join(__dirname, '../../../contracts/FlowGuardEnhanced.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

async function verifyContract(contractAddress, signer1, signer2, signer3, approvalThreshold, cycleDuration, vaultStartTime, spendingCap) {
  console.log('🔍 Verifying FlowGuard Enhanced Contract\n');
  console.log('='.repeat(60));
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Network: chipnet\n`);
  
  try {
    const provider = new ElectrumNetworkProvider('chipnet');
    
    // Create contract instance
    const contract = new Contract(
      artifact,
      [
        hexToBin(signer1),
        hexToBin(signer2),
        hexToBin(signer3),
        BigInt(approvalThreshold),
        BigInt(0), // state
        BigInt(cycleDuration),
        BigInt(vaultStartTime),
        BigInt(spendingCap),
      ],
      { provider }
    );
    
    // Verify address matches
    if (contract.address !== contractAddress) {
      console.log('⚠️  Warning: Contract parameters do not match the address!');
      console.log(`   Expected: ${contractAddress}`);
      console.log(`   Got:      ${contract.address}`);
    } else {
      console.log('✅ Contract parameters match address');
    }
    
    // Check balance and UTXOs
    console.log('\n💰 Checking balance...');
    const utxos = await contract.getUtxos();
    const balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    
    console.log(`   Balance: ${balance} satoshis (${balance / 100000000} BCH)`);
    console.log(`   UTXOs: ${utxos.length}`);
    
    if (balance === 0) {
      console.log('\n⚠️  Contract has no balance - not yet funded');
    } else {
      console.log('\n✅ Contract is funded and active!');
      
      if (utxos.length > 0) {
        console.log('\n📦 UTXO Details:');
        utxos.forEach((utxo, i) => {
          console.log(`   ${i + 1}. ${utxo.satoshis} satoshis`);
          console.log(`      TXID: ${utxo.txid}`);
          console.log(`      VOUT: ${utxo.vout}`);
          if (utxo.height) {
            console.log(`      Height: ${utxo.height} (confirmed)`);
          } else {
            console.log(`      Height: unconfirmed`);
          }
        });
      }
    }
    
    // Get network info
    console.log('\n📊 Network Status:');
    try {
      const blockHeight = await provider.getBlockHeight();
      console.log(`   Current Block Height: ${blockHeight}`);
    } catch (e) {
      console.log('   Block height: unavailable');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Verification complete!');
    console.log(`\n🔍 View on explorer: https://chipnet.imaginary.cash/address/${contractAddress}`);
    
    return {
      address: contractAddress,
      balance,
      utxos: utxos.length,
      funded: balance > 0
    };
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Get contract address from command line or use the last deployed one
const contractAddress = process.argv[2];
const signer1 = process.argv[3];
const signer2 = process.argv[4];
const signer3 = process.argv[5];

if (!contractAddress) {
  console.error('❌ Error: Contract address required');
  console.log('\nUsage:');
  console.log('  node src/scripts/verify-contract.mjs <contract-address> [signer1] [signer2] [signer3]');
  console.log('\nExample:');
  console.log('  node src/scripts/verify-contract.mjs bchtest:... 02... 02... 02...');
  process.exit(1);
}

// Use provided keys or defaults (will show warning if address doesn't match)
const defaultSigner1 = signer1 || '026b0301e4cd6bde3c198f006ebe529f21abb1d0d95ff4fdb5003e2266af445499';
const defaultSigner2 = signer2 || '0234e8e82444cf252bd8d479f018d89cff3227bf97ab91609801ef87b92d8c2abe';
const defaultSigner3 = signer3 || '02fdab235332ddba764b99c7f4f800ee3a90f33ba3a9403f831c9e1ed1c0536fdf';

verifyContract(
  contractAddress,
  defaultSigner1,
  defaultSigner2,
  defaultSigner3,
  2, // approvalThreshold
  2592000, // cycleDuration
  Math.floor(Date.now() / 1000), // vaultStartTime
  100000000 // spendingCap
).catch(console.error);

