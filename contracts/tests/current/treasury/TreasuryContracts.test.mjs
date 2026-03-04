import { expect } from 'chai';
import { Contract, MockNetworkProvider } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.join(__dirname, '../../../artifacts/treasury');

const bytes = (length, fill) => new Uint8Array(length).fill(fill);
const loadArtifact = (name) => JSON.parse(fs.readFileSync(path.join(artifactsDir, `${name}.json`), 'utf8'));

describe('Current treasury contract artifacts', () => {
  const provider = new MockNetworkProvider();
  const instantiate = (artifactName, args) => new Contract(loadArtifact(artifactName), args, { provider });

  it('instantiates VaultCovenant with current treasury controls', () => {
    const contract = instantiate('VaultCovenant', [
      bytes(32, 1),
      2n,
      bytes(20, 2),
      bytes(20, 3),
      bytes(20, 4),
      2_592_000n,
      100_000_000n,
      50_000_000n,
      1n,
      bytes(20, 5),
      bytes(20, 6),
      bytes(20, 7),
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('unlockPeriod', 'spend', 'pause', 'resume', 'emergencyLock');
  });

  it('instantiates ProposalCovenant with current proposal lifecycle controls', () => {
    const contract = instantiate('ProposalCovenant', [
      bytes(32, 8),
      bytes(20, 9),
      bytes(20, 10),
      bytes(20, 11),
      2n,
    ]);

    expect(contract.address).to.be.a('string').and.not.empty;
    expect(contract.unlock).to.include.all.keys('approve', 'execute', 'cancel', 'expire');
  });
});
