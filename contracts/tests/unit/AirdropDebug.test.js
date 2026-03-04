import { expect } from 'chai';
import { Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { compileFile } from 'cashc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AirdropCovenant Debug', () => {
  let airdrop;
  let claimer;
  let provider;

  before(async () => {
    provider = new ElectrumNetworkProvider('chipnet');
    claimer = new SignatureTemplate('b01bb24a7ffb9af7011cfaac0f41c01a984ec04188ac');

    const vaultId = new Uint8Array(32).fill(0);
    const authorityHash = new Uint8Array(20).fill(1);

    const artifact = compileFile(path.join(__dirname, '../../core/distribution/AirdropCovenant.cash'));

    airdrop = new Contract(artifact, [
      vaultId,
      authorityHash,
      5000n,
      100000n,
      1772064072n, // start time
      0n           // end time
    ], { provider });
  });

  it('should compile a valid token-bearing UTXO shape for debugging', async () => {
    const utxo = {
      txid: '00'.repeat(32),
      vout: 0,
      satoshis: 100000n,
      token: {
        category: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        amount: 0n,
        nft: { capability: 'mutable', commitment: '00040000000000000000000000000000000000000000000000000000000000000000000000000000' },
      },
    };

    expect(airdrop.address).to.be.a('string').and.not.empty;
    expect(airdrop.tokenAddress).to.be.a('string').and.not.empty;
    expect(utxo.satoshis).to.equal(100000n);
    expect(utxo.token).to.deep.equal({
      category: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: 0n,
      nft: { capability: 'mutable', commitment: '00040000000000000000000000000000000000000000000000000000000000000000000000000000' },
    });
  });
});
