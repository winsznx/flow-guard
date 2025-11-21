/**
 * Check Funding Status
 * Checks if a contract address has received any funds
 */

import { ElectrumNetworkProvider } from 'cashscript';

async function checkFunding(contractAddress) {
  console.log('💰 Checking Funding Status\n');
  console.log('='.repeat(60));
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Network: chipnet\n`);
  
  try {
    const provider = new ElectrumNetworkProvider('chipnet');
    
    // Get UTXOs directly from the address
    const utxos = await provider.getUtxos(contractAddress);
    const balance = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis || 0), 0);
    
    console.log(`📊 Balance: ${balance} satoshis (${balance / 100000000} BCH)`);
    console.log(`📦 UTXOs: ${utxos.length}\n`);
    
    if (balance === 0 && utxos.length === 0) {
      console.log('⚠️  No funds received yet');
      console.log('\n💡 Possible reasons:');
      console.log('   1. Transaction is still pending');
      console.log('   2. Transaction was sent to a different address');
      console.log('   3. Transaction failed');
      console.log('\n🔍 Check the explorer:');
      console.log(`   https://chipnet.imaginary.cash/address/${contractAddress}`);
    } else if (utxos.length > 0) {
      console.log('✅ Contract has received funds!\n');
      console.log('📦 UTXO Details:');
      utxos.forEach((utxo, i) => {
        console.log(`\n   ${i + 1}. ${utxo.satoshis} satoshis`);
        console.log(`      TXID: ${utxo.txid}`);
        console.log(`      VOUT: ${utxo.vout}`);
        if (utxo.height) {
          console.log(`      Height: ${utxo.height} (confirmed)`);
        } else {
          console.log(`      Height: unconfirmed (pending)`);
        }
      });
      
      console.log('\n✅ Contract is funded and ready to use!');
    }
    
    // Get block height
    try {
      const blockHeight = await provider.getBlockHeight();
      console.log(`\n📊 Current Block Height: ${blockHeight}`);
    } catch (e) {
      // Ignore
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error checking funding:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

const contractAddress = process.argv[2];

if (!contractAddress) {
  console.error('❌ Error: Contract address required');
  console.log('\nUsage:');
  console.log('  node src/scripts/check-funding.mjs <contract-address>');
  process.exit(1);
}

checkFunding(contractAddress).catch(console.error);

