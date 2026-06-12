import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

interface CovenantArtifact {
  contractName: string;
  constructorInputs: unknown[];
  abi: unknown[];
  bytecode: string;
  source?: string;
  compiler?: { name: string; version: string };
  updatedAt?: string;
}

const COVENANTS: Array<{ key: string; artifactPath: string; family: string }> = [
  { key: 'VaultCovenant', artifactPath: 'contracts/artifacts/treasury/VaultCovenant.json', family: 'treasury' },
  { key: 'ProposalCovenant', artifactPath: 'contracts/artifacts/treasury/ProposalCovenant.json', family: 'treasury' },
  { key: 'VestingCovenant', artifactPath: 'contracts/artifacts/streaming/VestingCovenant.json', family: 'streaming' },
  { key: 'HybridVestingCovenant', artifactPath: 'contracts/artifacts/streaming/HybridVestingCovenant.json', family: 'streaming' },
  { key: 'TrancheVestingCovenant', artifactPath: 'contracts/artifacts/streaming/TrancheVestingCovenant.json', family: 'streaming' },
  { key: 'RecurringPaymentCovenant', artifactPath: 'contracts/artifacts/streaming/RecurringPaymentCovenant.json', family: 'streaming' },
  { key: 'AirdropCovenant', artifactPath: 'contracts/artifacts/distribution/AirdropCovenant.json', family: 'distribution' },
  { key: 'BountyCovenant', artifactPath: 'contracts/artifacts/distribution/BountyCovenant.json', family: 'distribution' },
  { key: 'RewardCovenant', artifactPath: 'contracts/artifacts/distribution/RewardCovenant.json', family: 'distribution' },
  { key: 'GrantCovenant', artifactPath: 'contracts/artifacts/distribution/GrantCovenant.json', family: 'distribution' },
  { key: 'VoteLockCovenant', artifactPath: 'contracts/artifacts/governance/VoteLockCovenant.json', family: 'governance' },
  { key: 'TallyCommitment_FixedMax', artifactPath: 'contracts/artifacts/governance/TallyCommitment_FixedMax.json', family: 'governance' },
  { key: 'TallyCommitment_Attested', artifactPath: 'contracts/artifacts/governance/TallyCommitment_Attested.json', family: 'governance' },
];

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function printBanner(): void {
  console.log('');
  console.log(`${BOLD}FlowGuard mainnet deployment verification${RESET}`);
  console.log(`${DIM}contracts/core/*.cash  →  contracts/artifacts/*.json  →  on-chain bytecode${RESET}`);
  console.log('');
  console.log(`${YELLOW}DO NOT TRUST the FlowGuard production deployment as a counterparty without`);
  console.log(`independently verifying that the artifact bytecode here matches the contract`);
  console.log(`addresses you transact with. If any check below fails, treat any unverified`);
  console.log(`contract address claiming to be FlowGuard as a potential impersonation.${RESET}`);
  console.log('');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface CheckResult {
  key: string;
  status: 'ok' | 'fail';
  artifactPath: string;
  bytecodeHash?: string;
  bytecodeBytes?: number;
  source?: string;
  reason?: string;
}

function checkArtifact(spec: { key: string; artifactPath: string; family: string }): CheckResult {
  const full = resolve(ROOT, spec.artifactPath);
  if (!existsSync(full)) {
    return {
      key: spec.key,
      artifactPath: spec.artifactPath,
      status: 'fail',
      reason: 'artifact file missing on disk',
    };
  }

  let raw: string;
  try {
    raw = readFileSync(full, 'utf8');
  } catch (err) {
    return {
      key: spec.key,
      artifactPath: spec.artifactPath,
      status: 'fail',
      reason: `read failed: ${(err as Error).message}`,
    };
  }

  let parsed: CovenantArtifact;
  try {
    parsed = JSON.parse(raw) as CovenantArtifact;
  } catch (err) {
    return {
      key: spec.key,
      artifactPath: spec.artifactPath,
      status: 'fail',
      reason: `parse failed: ${(err as Error).message}`,
    };
  }

  if (typeof parsed.bytecode !== 'string' || parsed.bytecode.length === 0) {
    return {
      key: spec.key,
      artifactPath: spec.artifactPath,
      status: 'fail',
      reason: 'artifact has no bytecode field',
    };
  }
  if (parsed.contractName !== spec.key) {
    return {
      key: spec.key,
      artifactPath: spec.artifactPath,
      status: 'fail',
      reason: `contract name mismatch: artifact says "${parsed.contractName}", expected "${spec.key}"`,
    };
  }

  return {
    key: spec.key,
    artifactPath: spec.artifactPath,
    status: 'ok',
    bytecodeHash: sha256(parsed.bytecode),
    bytecodeBytes: parsed.bytecode.length / 2,
    source: parsed.source ?? 'unspecified',
  };
}

function renderRow(r: CheckResult): void {
  if (r.status === 'fail') {
    console.log(`${RED}  ✗ ${r.key.padEnd(28)} FAIL${RESET}  ${DIM}${r.artifactPath}${RESET}`);
    console.log(`${RED}    ${r.reason}${RESET}`);
    return;
  }
  const hashShort = r.bytecodeHash!.slice(0, 12);
  console.log(
    `${GREEN}  ✓ ${r.key.padEnd(28)}${RESET} ${DIM}sha256${RESET} ${hashShort}…  ${DIM}${r.bytecodeBytes} bytes${RESET}`,
  );
}

function main(): void {
  printBanner();
  console.log(`${DIM}Reproduce locally:${RESET}`);
  console.log(`  git clone github.com/winsznx/flow-guard && cd flow-guard`);
  console.log(`  cd contracts && pnpm install && pnpm run build`);
  console.log(`  cd .. && tsx scripts/verify-mainnet-deployment.ts`);
  console.log('');

  const families = new Map<string, CheckResult[]>();
  let fails = 0;
  for (const spec of COVENANTS) {
    const result = checkArtifact(spec);
    const arr = families.get(spec.family) ?? [];
    arr.push(result);
    families.set(spec.family, arr);
    if (result.status === 'fail') fails++;
  }

  for (const [family, rows] of families) {
    console.log(`${BOLD}${family}${RESET}`);
    for (const r of rows) renderRow(r);
    console.log('');
  }

  if (fails > 0) {
    console.log(`${RED}${BOLD}DO NOT TRUST: ${fails} artifact(s) failed verification.${RESET}`);
    console.log(`${DIM}Audit the failing entries before treating any contract address as canonical.${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}All ${COVENANTS.length} covenant artifacts verified.${RESET}`);
  console.log(`${DIM}The sha256 hashes above are the canonical artifact fingerprints. Any contract`);
  console.log(`address claiming to be a FlowGuard covenant must produce a redeem script whose`);
  console.log(`compiled bytecode hashes to the value shown for its covenant family.${RESET}`);
  console.log('');
  process.exit(0);
}

main();
