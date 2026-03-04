import { expect } from 'chai';
import { Contract, MockNetworkProvider } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.join(__dirname, '../../../artifacts/distribution');

const bytes = (length, fill) => new Uint8Array(length).fill(fill);
const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(artifactsDir, `${name}.json`), 'utf8'));

describe('Current distribution contract artifacts', () => {
  const provider = new MockNetworkProvider();

  it('instantiates AirdropCovenant with claim/admin controls', () => {
    const contract = new Contract(loadArtifact('AirdropCovenant'), [
      bytes(32, 1),
      bytes(20, 2),
      bytes(20, 3),
      5_000n,
      100_000n,
      1_700_000_000n,
      0n,
    ], { provider });

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('claim', 'pause', 'resume', 'cancel');
  });
});
