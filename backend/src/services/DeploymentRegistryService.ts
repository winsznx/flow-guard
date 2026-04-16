import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hexToBin } from '@bitauth/libauth';
import db from '../database/schema.js';
import { ContractFactory, type ContractType } from './ContractFactory.js';
import { transactionExists } from '../utils/txVerification.js';

type Network = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';
type DeploymentModule = 'vault' | 'proposal' | 'stream' | 'payment' | 'airdrop' | 'budget' | 'governance';

interface RegistryRow {
  module: DeploymentModule;
  id: string;
  logicalId: string | null;
  contractType: ContractType;
  contractAddress: string | null;
  constructorParams: string | null;
  status: string | null;
  txHash: string | null;
  createdAt: string | number | null;
}

interface BuildOptions {
  verifyOnChain?: boolean;
}

export interface DeploymentRegistryEntry {
  module: DeploymentModule;
  contractType: ContractType;
  id: string;
  logicalId: string | null;
  status: string | null;
  contractAddress: string | null;
  expectedAddress: string | null;
  addressMatchesCurrentArtifact: boolean | null;
  suspectedLegacyBytecode: boolean;
  constructorParamsPresent: boolean;
  constructorParamsError?: string;
  derivationError?: string;
  utxoCount: number | null;
  balanceSatoshis: string | null;
  txHash: string | null;
  txHashFound: boolean | null;
  hasOnChainEvidence: boolean | null;
  explorerAddressUrl: string | null;
  explorerTxUrl: string | null;
  createdAt: string | number | null;
}

export interface DeploymentRegistrySummary {
  total: number;
  withAddress: number;
  withConstructorParams: number;
  addressMismatches: number;
  suspectedLegacyBytecode: number;
  onChainVerified: number;
  noOnChainEvidence: number;
}

export interface DeploymentRegistryReport {
  network: Network;
  verifyOnChain: boolean;
  generatedAt: string;
  summary: DeploymentRegistrySummary;
  entries: DeploymentRegistryEntry[];
}

const ADDRESS_EXPLORER_BY_NETWORK: Record<Network, string> = {
  mainnet: 'https://explorer.bitcoin.com/bch/address',
  testnet3: 'https://chipnet.imaginary.cash/address',
  testnet4: 'https://chipnet.imaginary.cash/address',
  chipnet: 'https://chipnet.imaginary.cash/address',
};

const TX_EXPLORER_BY_NETWORK: Record<Network, string> = {
  mainnet: 'https://explorer.bitcoin.com/bch/tx',
  testnet3: 'https://chipnet.imaginary.cash/tx',
  testnet4: 'https://chipnet.imaginary.cash/tx',
  chipnet: 'https://chipnet.imaginary.cash/tx',
};

function parseConstructorParams(raw: string): { args?: any[]; error?: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { error: 'constructor_params is not an array' };
    }

    const args = parsed.map((param: any) => {
      if (param && typeof param === 'object' && 'type' in param && 'value' in param) {
        if (param.type === 'bigint') return BigInt(param.value);
        if (param.type === 'bytes') return hexToBin(param.value);
        if (param.type === 'boolean') return param.value === true || param.value === 'true';
        return param.value;
      }
      return param;
    });

    return { args };
  } catch (error: any) {
    return { error: error?.message || 'Failed to parse constructor_params JSON' };
  }
}

function lowerEq(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function explorerAddressUrl(network: Network, address: string | null): string | null {
  if (!address) return null;
  return `${ADDRESS_EXPLORER_BY_NETWORK[network]}/${address}`;
}

function explorerTxUrl(network: Network, txHash: string | null): string | null {
  if (!txHash) return null;
  return `${TX_EXPLORER_BY_NETWORK[network]}/${txHash}`;
}

async function readRows(): Promise<RegistryRow[]> {
  const rows: RegistryRow[] = [];

  const vaultRows = await db.prepare(`
    SELECT
      'vault' AS module,
      id,
      vault_id AS logical_id,
      contract_address,
      constructor_params,
      status,
      COALESCE(tx_hash, deployment_tx_hash) AS tx_hash,
      created_at
    FROM vaults
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of vaultRows) {
    rows.push({
      module: 'vault',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'VaultCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const proposalRows = await db.prepare(`
    SELECT
      'proposal' AS module,
      id,
      proposal_id AS logical_id,
      contract_address,
      constructor_params,
      status,
      tx_hash,
      created_at
    FROM proposals
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of proposalRows) {
    rows.push({
      module: 'proposal',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'ProposalCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const streamRows = await db.prepare(`
    SELECT
      'stream' AS module,
      id,
      stream_id AS logical_id,
      stream_type,
      contract_address,
      constructor_params,
      status,
      tx_hash,
      created_at
    FROM streams
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of streamRows) {
    const streamType = String(row.stream_type || '').toUpperCase();
    const contractType: ContractType = streamType === 'RECURRING'
      ? 'RecurringPaymentCovenant'
      : 'VestingCovenant';
    rows.push({
      module: 'stream',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType,
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const paymentRows = await db.prepare(`
    SELECT
      'payment' AS module,
      id,
      payment_id AS logical_id,
      contract_address,
      constructor_params,
      status,
      tx_hash,
      created_at
    FROM payments
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of paymentRows) {
    rows.push({
      module: 'payment',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'RecurringPaymentCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const airdropRows = await db.prepare(`
    SELECT
      'airdrop' AS module,
      id,
      campaign_id AS logical_id,
      contract_address,
      constructor_params,
      status,
      tx_hash,
      created_at
    FROM airdrops
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of airdropRows) {
    rows.push({
      module: 'airdrop',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'AirdropCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const budgetRows = await db.prepare(`
    SELECT
      'budget' AS module,
      id,
      id AS logical_id,
      contract_address,
      constructor_params,
      status,
      tx_hash,
      created_at
    FROM budget_plans
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of budgetRows) {
    rows.push({
      module: 'budget',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'VestingCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  const governanceRows = await db.prepare(`
    SELECT
      'governance' AS module,
      id,
      vote_id AS logical_id,
      contract_address,
      constructor_params,
      vote AS status,
      lock_tx_hash AS tx_hash,
      created_at
    FROM governance_votes
    WHERE contract_address IS NOT NULL AND contract_address != ''
  `).all() as Array<Record<string, unknown>>;
  for (const row of governanceRows) {
    rows.push({
      module: 'governance',
      id: String(row.id),
      logicalId: row.logical_id ? String(row.logical_id) : null,
      contractType: 'VoteLockCovenant',
      contractAddress: row.contract_address ? String(row.contract_address) : null,
      constructorParams: row.constructor_params ? String(row.constructor_params) : null,
      status: row.status ? String(row.status) : null,
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      createdAt: (row.created_at as string | number | null) ?? null,
    });
  }

  return rows;
}

export class DeploymentRegistryService {
  private readonly provider: ElectrumNetworkProvider;
  private readonly network: Network;

  constructor(network: Network = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildReport(options?: BuildOptions): Promise<DeploymentRegistryReport> {
    const verifyOnChain = options?.verifyOnChain ?? true;
    const rows = await readRows();
    const entries: DeploymentRegistryEntry[] = [];

    for (const row of rows) {
      entries.push(await this.verifyRow(row, verifyOnChain));
    }

    const summary: DeploymentRegistrySummary = {
      total: entries.length,
      withAddress: entries.filter((entry) => Boolean(entry.contractAddress)).length,
      withConstructorParams: entries.filter((entry) => entry.constructorParamsPresent).length,
      addressMismatches: entries.filter((entry) => entry.addressMatchesCurrentArtifact === false).length,
      suspectedLegacyBytecode: entries.filter((entry) => entry.suspectedLegacyBytecode).length,
      onChainVerified: entries.filter((entry) => entry.hasOnChainEvidence === true).length,
      noOnChainEvidence: entries.filter((entry) => entry.hasOnChainEvidence === false).length,
    };

    return {
      network: this.network,
      verifyOnChain,
      generatedAt: new Date().toISOString(),
      summary,
      entries,
    };
  }

  private async verifyRow(row: RegistryRow, verifyOnChain: boolean): Promise<DeploymentRegistryEntry> {
    let constructorParamsPresent = false;
    let constructorParamsError: string | undefined;
    let expectedAddress: string | null = null;
    let addressMatchesCurrentArtifact: boolean | null = null;
    let derivationError: string | undefined;

    if (row.constructorParams && row.constructorParams.trim().length > 0) {
      constructorParamsPresent = true;
      const parsed = parseConstructorParams(row.constructorParams);
      if (parsed.error) {
        constructorParamsError = parsed.error;
      } else {
        try {
          const artifact = ContractFactory.getArtifact(row.contractType);
          const contract = new Contract(artifact, parsed.args ?? [], { provider: this.provider });
          expectedAddress = contract.address;
          if (row.contractAddress) {
            addressMatchesCurrentArtifact = lowerEq(expectedAddress, row.contractAddress);
          }
        } catch (error: any) {
          derivationError = error?.message || 'Failed to derive contract from constructor params';
        }
      }
    }

    let utxoCount: number | null = null;
    let balanceSatoshis: string | null = null;
    let txHashFound: boolean | null = null;
    let hasOnChainEvidence: boolean | null = null;

    if (verifyOnChain) {
      if (row.contractAddress) {
        try {
          const utxos = await this.provider.getUtxos(row.contractAddress);
          utxoCount = utxos.length;
          const balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
          balanceSatoshis = balance.toString();
        } catch {
          utxoCount = null;
          balanceSatoshis = null;
        }
      }

      if (row.txHash) {
        txHashFound = await transactionExists(row.txHash, this.network);
      }

      hasOnChainEvidence = (utxoCount !== null && utxoCount > 0) || txHashFound === true;
    }

    return {
      module: row.module,
      contractType: row.contractType,
      id: row.id,
      logicalId: row.logicalId,
      status: row.status,
      contractAddress: row.contractAddress,
      expectedAddress,
      addressMatchesCurrentArtifact,
      suspectedLegacyBytecode: addressMatchesCurrentArtifact === false,
      constructorParamsPresent,
      ...(constructorParamsError ? { constructorParamsError } : {}),
      ...(derivationError ? { derivationError } : {}),
      utxoCount,
      balanceSatoshis,
      txHash: row.txHash,
      txHashFound,
      hasOnChainEvidence,
      explorerAddressUrl: explorerAddressUrl(this.network, row.contractAddress),
      explorerTxUrl: explorerTxUrl(this.network, row.txHash),
      createdAt: row.createdAt,
    };
  }
}
