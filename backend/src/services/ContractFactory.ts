import { Artifact } from 'cashscript';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve artifacts root from multiple fallbacks to survive different deploy layouts.
const candidateRoots: string[] = [
  process.env.ARTIFACTS_ROOT || '',
  // Monorepo root /contracts/artifacts (ts-node)
  resolve(__dirname, '../../../contracts/artifacts'),
  // Compiled dist path: backend/dist/services → ../../../contracts/artifacts -> /app/contracts/artifacts
  resolve(__dirname, '../../contracts/artifacts'),
  // Monorepo root relative to process.cwd()
  resolve(process.cwd(), 'contracts/artifacts'),
].filter(Boolean);

const resolvedArtifactsRoot = candidateRoots.find((p) => existsSync(p));

if (!resolvedArtifactsRoot) {
  throw new Error(
    'Contract artifacts not found. Set ARTIFACTS_ROOT or ensure contracts are built (pnpm --filter @flowguard/contracts build).'
  );
}

const ARTIFACTS_ROOT: string = resolvedArtifactsRoot;

export interface ConstructorParam {
  type: 'bigint' | 'bytes' | 'string' | 'boolean';
  value: string; // hex for bytes, string representation for others
}

export type ContractType =
  | 'VaultCovenant'
  | 'ProposalCovenant'
  | 'VestingCovenant'
  | 'HybridVestingCovenant'
  | 'TrancheVestingCovenant'
  | 'RecurringPaymentCovenant'
  | 'AirdropCovenant'
  | 'RewardCovenant'
  | 'BountyCovenant'
  | 'GrantCovenant'
  | 'VoteLockCovenant'
  | 'TallyCommitment_FixedMax'
  | 'TallyCommitment_Attested';

const CONTRACT_CATEGORY: Record<ContractType, string> = {
  VaultCovenant: 'treasury',
  ProposalCovenant: 'treasury',
  VestingCovenant: 'streaming',
  HybridVestingCovenant: 'streaming',
  TrancheVestingCovenant: 'streaming',
  RecurringPaymentCovenant: 'streaming',
  AirdropCovenant: 'distribution',
  RewardCovenant: 'distribution',
  BountyCovenant: 'distribution',
  GrantCovenant: 'distribution',
  VoteLockCovenant: 'governance',
  TallyCommitment_FixedMax: 'governance',
  TallyCommitment_Attested: 'governance',
};

export class ContractFactory {
  private static cache: Partial<Record<ContractType, Artifact>> = {};

  static getArtifact(type: ContractType): Artifact {
    if (this.cache[type]) return this.cache[type]!;

    const category = CONTRACT_CATEGORY[type];
    const path = join(ARTIFACTS_ROOT, category, `${type}.json`);

    try {
      const artifact = JSON.parse(readFileSync(path, 'utf-8')) as Artifact;
      this.cache[type] = artifact;
      return artifact;
    } catch (error) {
      throw new Error(`Failed to load artifact ${type} from ${path}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
