import { Artifact, Contract, MockNetworkProvider, type ConstructorArgument } from 'cashscript';
import { binToHex, decodeCashAddress } from '@bitauth/libauth';
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
  | 'FtVestingCovenant'
  | 'HybridVestingCovenant'
  | 'TrancheVestingCovenant'
  | 'RecurringPaymentCovenant'
  | 'AirdropCovenant'
  | 'RewardCovenant'
  | 'BountyCovenant'
  | 'GrantCovenant'
  | 'VoteLockCovenant'
  | 'TallyCommitment_FixedMax'
  | 'TallyCommitment_Attested'
  | 'VestingCovenantV2'
  | 'HybridVestingCovenantV2'
  | 'TrancheVestingCovenantV2'
  | 'RecurringPaymentCovenantV2'
  | 'AirdropCovenantV2'
  | 'RewardCovenantV2'
  | 'BountyCovenantV2'
  | 'GrantCovenantV2';

const CONTRACT_CATEGORY: Record<ContractType, string> = {
  VaultCovenant: 'treasury',
  ProposalCovenant: 'treasury',
  VestingCovenant: 'streaming',
  FtVestingCovenant: 'streaming',
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
  VestingCovenantV2: 'streaming',
  HybridVestingCovenantV2: 'streaming',
  TrancheVestingCovenantV2: 'streaming',
  RecurringPaymentCovenantV2: 'streaming',
  AirdropCovenantV2: 'distribution',
  RewardCovenantV2: 'distribution',
  BountyCovenantV2: 'distribution',
  GrantCovenantV2: 'distribution',
};

/**
 * Covenants with a V2: same parameters and state, fixed token checks, room for a
 * wallet-paid fee. New contracts deploy V2. Contracts already on chain keep the
 * version their address was derived from.
 */
const V2_OF: Partial<Record<ContractType, ContractType>> = {
  VestingCovenant: 'VestingCovenantV2',
  HybridVestingCovenant: 'HybridVestingCovenantV2',
  TrancheVestingCovenant: 'TrancheVestingCovenantV2',
  RecurringPaymentCovenant: 'RecurringPaymentCovenantV2',
  AirdropCovenant: 'AirdropCovenantV2',
  RewardCovenant: 'RewardCovenantV2',
  BountyCovenant: 'BountyCovenantV2',
  GrantCovenant: 'GrantCovenantV2',
};

/** Script hash of a cash address, so the plain and token-aware forms on any network compare equal. */
function addressPayload(address: string): string {
  const decoded = decodeCashAddress(address);
  return typeof decoded === 'string' ? address : binToHex(decoded.payload);
}

export class ContractFactory {
  private static cache: Partial<Record<ContractType, Artifact>> = {};
  private static versionByAddress = new Map<string, ContractType>();

  /** The version new contracts of this kind deploy with. */
  static latest(type: ContractType): ContractType {
    return V2_OF[type] ?? type;
  }

  /** Whether the type is a V2 covenant (fees may come from the signer's wallet). */
  static isV2(type: ContractType): boolean {
    return Object.values(V2_OF).includes(type);
  }

  /**
   * The artifact a deployed contract was built from: the version whose address, for
   * these constructor arguments, matches the stored one. Falls back to the base type.
   */
  static artifactForAddress(type: ContractType, constructorArgs: ConstructorArgument[], contractAddress: string): Artifact {
    return this.getArtifact(this.typeForAddress(type, constructorArgs, contractAddress));
  }

  static typeForAddress(type: ContractType, constructorArgs: ConstructorArgument[], contractAddress: string): ContractType {
    const v2 = V2_OF[type];
    if (!v2 || !contractAddress) return type;
    const target = addressPayload(contractAddress);
    const key = `${type}:${target}`;
    const cached = this.versionByAddress.get(key);
    if (cached) return cached;

    const provider = new MockNetworkProvider();
    const match = [v2, type].find((candidate) =>
      addressPayload(new Contract(this.getArtifact(candidate), constructorArgs, { provider }).address) === target);
    const resolved = match ?? type;
    this.versionByAddress.set(key, resolved);
    return resolved;
  }

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
