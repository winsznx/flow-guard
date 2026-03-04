import { expect } from 'chai';
import { Contract, MockNetworkProvider } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.join(__dirname, '../../../artifacts/streaming');

const bytes = (length, fill) => new Uint8Array(length).fill(fill);

const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(artifactsDir, `${name}.json`), 'utf8'));

describe('Current streaming contract artifacts', () => {
  const provider = new MockNetworkProvider();

  const instantiate = (artifactName, args) => new Contract(loadArtifact(artifactName), args, { provider });

  it('instantiates VestingCovenant with current schedule controls', () => {
    const contract = instantiate('VestingCovenant', [
      bytes(32, 1),
      bytes(20, 2),
      1n,
      1_000_000n,
      1_700_000_000n,
      1_730_000_000n,
      0n,
      0n,
      0n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('claim', 'complete', 'pause', 'resume', 'cancel', 'transfer');
  });

  it('instantiates HybridVestingCovenant with upfront unlock state', () => {
    const contract = instantiate('HybridVestingCovenant', [
      bytes(32, 3),
      bytes(20, 4),
      2_000_000n,
      1_700_000_000n,
      1_705_000_000n,
      1_730_000_000n,
      250_000n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('claim', 'complete', 'pause', 'resume', 'cancel', 'transfer');
  });

  it('instantiates RecurringPaymentCovenant with refill support', () => {
    const contract = instantiate('RecurringPaymentCovenant', [
      bytes(32, 5),
      bytes(20, 6),
      bytes(20, 7),
      50_000n,
      86_400n,
      0n,
      1_700_000_000n,
      0n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('pay', 'pause', 'resume', 'refill', 'cancel');
  });

  it('instantiates TrancheVestingCovenant with bounded custom schedule checkpoints', () => {
    const contract = instantiate('TrancheVestingCovenant', [
      bytes(32, 8),
      bytes(20, 9),
      3_000_000n,
      1_700_000_000n,
      3n,
      1_705_000_000n,
      600_000n,
      1_710_000_000n,
      1_800_000n,
      1_720_000_000n,
      3_000_000n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
      0n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('claim', 'complete', 'pause', 'resume', 'cancel', 'transfer');
  });
});
