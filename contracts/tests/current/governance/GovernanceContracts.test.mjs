import { expect } from 'chai';
import { Contract, MockNetworkProvider } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.join(__dirname, '../../../artifacts/governance');

const bytes = (length, fill) => new Uint8Array(length).fill(fill);
const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(artifactsDir, `${name}.json`), 'utf8'));

describe('Current governance contract artifacts', () => {
  const provider = new MockNetworkProvider();
  const instantiate = (artifactName, args) => new Contract(loadArtifact(artifactName), args, { provider });

  it('instantiates VoteLockCovenant with reclaim paths', () => {
    const contract = instantiate('VoteLockCovenant', [
      bytes(32, 1),
      1n,
      bytes(20, 2),
      1_750_000_000n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('reclaim', 'earlyReclaim');
  });

  it('instantiates TallyCommitment_FixedMax with tally entrypoint', () => {
    const contract = instantiate('TallyCommitment_FixedMax', [
      bytes(32, 3),
      100_000n,
      50n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('createTally');
  });
});
