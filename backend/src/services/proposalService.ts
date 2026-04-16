import { createHash, randomUUID } from 'crypto';
import db from '../database/schema.js';
import { Proposal, CreateProposalDto, ApproveProposalDto, ProposalStatus } from '../models/Proposal.js';
import { StateService } from './state-service.js';
import { VaultService } from './vaultService.js';
import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import {
  binToHex,
  cashAddressToLockingBytecode,
  hexToBin,
} from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

export interface ExecutePayoutWcBuildResult {
  wcTransaction: WcTransactionObject;
  selectedSignerAddresses: string[];
  selectedSignerPubkeys: string[];
  payoutSatoshis: bigint;
}

export interface CreateProposalWcBuildResult {
  wcTransaction: WcTransactionObject;
  proposalContractAddress: string;
  constructorParamsSerialized: any[];
  tokenCategory: string;
  initialCommitment: string;
  fundingSatoshis: bigint;
}

export interface ApproveProposalWcBuildResult {
  wcTransaction: WcTransactionObject;
  proposalContractAddress: string;
  newApprovalCount: number;
  isApproved: boolean;
}

export class ProposalService {
  /**
   * Create proposal with on-chain state management
   * This creates the proposal in the database and prepares for on-chain creation
   */
  static async createProposal(dto: CreateProposalDto, creator: string): Promise<Proposal> {
    const id = randomUUID();

    // Get vault to check state and parameters
    const vault = await VaultService.getVaultByVaultId(dto.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Get next proposal ID for this vault (on-chain proposal ID)
    const vaultStmt = db!.prepare('SELECT COUNT(*) as count FROM proposals WHERE vault_id = ?');
    const vaultRow = await vaultStmt.get(dto.vaultId) as any;
    const proposalId = (vaultRow?.count || 0) + 1;

    // Verify proposal can be created on-chain
    const currentState = vault.state || 0;
    if (StateService.getProposalStatus(currentState, proposalId) !== 0) {
      throw new Error(`Proposal ID ${proposalId} already exists on-chain`);
    }

    // Verify amount doesn't exceed spending cap
    const amountSatoshis = displayAmountToOnChain(dto.amount, 'BCH');
    const spendingCapSatoshis = displayAmountToOnChain(vault.spendingCap || 0, 'BCH');
    if (spendingCapSatoshis > 0 && amountSatoshis > spendingCapSatoshis) {
      throw new Error(`Amount exceeds spending cap of ${vault.spendingCap} BCH`);
    }
    
    const payoutHash = createHash('sha256')
      .update(`${dto.vaultId}:${proposalId}:${dto.recipient}:${dto.amount}:${dto.reason ?? ''}`)
      .digest('hex');

    // Store proposal in database (off-chain metadata)
    const stmt = db!.prepare(`
      INSERT INTO proposals (
        id, vault_id, proposal_id, recipient, amount, reason, status, approval_count, approvals, payout_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.run(
      id,
      dto.vaultId,
      proposalId,
      dto.recipient,
      dto.amount,
      dto.reason,
      ProposalStatus.PENDING,
      0,
      JSON.stringify([]),
      payoutHash
    );

    // Mirror proposal lifecycle in vault state bitfield for compatibility with existing APIs.
    const newState = StateService.setProposalPending(currentState, proposalId);
    await VaultService.updateVaultState(dto.vaultId, newState);

    const proposal = await this.getProposalById(id);
    if (!proposal) {
      throw new Error('Failed to create proposal');
    }
    return proposal;
  }

  /**
   * Create on-chain proposal transaction
   * This prepares the transaction that will be signed and broadcast
   */
  static async createOnChainProposalTransaction(
    proposalId: string,
    signerPublicKey: string
  ): Promise<{ transaction: any; newState: number }> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    // Verify signer is authorized
    const signerIndex = vault.signerPubkeys.findIndex(
      pk => pk.toLowerCase() === signerPublicKey.toLowerCase()
    );
    if (signerIndex === -1) {
      throw new Error('Signer not authorized');
    }

    const currentState = vault.state || 0;
    const amountSatoshis = displayAmountToOnChain(proposal.amount, 'BCH');
    const vaultStartTime = vault.startTime ? Math.floor(vault.startTime.getTime() / 1000) : Math.floor(Date.now() / 1000);

    // Build proposal transaction descriptor using ProposalCovenant
    const newState = StateService.setProposalPending(currentState, proposal.proposalId);

    const transaction = {
      type: 'proposal_create',
      contractType: 'ProposalCovenant',
      proposalId: proposal.proposalId,
      vaultId: proposal.vaultId,
      contractAddress: vault.contractAddress,
      functionName: 'create',
      functionInputs: {
        proposalId: proposal.proposalId,
        recipient: proposal.recipient,
        amount: amountSatoshis,
        signerPublicKey,
      },
      signerPubkeys: vault.signerPubkeys,
      requiredApprovals: vault.approvalThreshold,
      newState,
    };

    return { transaction, newState };
  }
  
  static async getProposalById(id: string): Promise<Proposal | null> {
    const stmt = db!.prepare('SELECT * FROM proposals WHERE id = ?');
    const row = await stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      reason: row.reason,
      status: row.status as ProposalStatus,
      approvalCount: row.approval_count,
      approvals: JSON.parse(row.approvals),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      txHash: row.tx_hash,
      contractAddress: row.contract_address || undefined,
      constructorParams: row.constructor_params || undefined,
    };
  }
  
  static async getVaultProposals(vaultId: string): Promise<Proposal[]> {
    const stmt = db!.prepare('SELECT * FROM proposals WHERE vault_id = ? ORDER BY created_at DESC');
    const rows = await stmt.all(vaultId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      reason: row.reason,
      status: row.status as ProposalStatus,
      approvalCount: row.approval_count,
      approvals: JSON.parse(row.approvals),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      txHash: row.tx_hash,
      contractAddress: row.contract_address || undefined,
      constructorParams: row.constructor_params || undefined,
    }));
  }
  
  /**
   * Approve proposal with on-chain state management
   */
  static async approveProposal(dto: ApproveProposalDto): Promise<Proposal | null> {
    const proposal = await this.getProposalById(dto.proposalId);
    if (!proposal || proposal.status !== ProposalStatus.PENDING) {
      return null;
    }

    // Check if already approved by this approver
    if (proposal.approvals.includes(dto.approver)) {
      return proposal;
    }

    // Get vault to check state
    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Enforce signer authorization for approvals
    const isAuthorizedApprover = vault.signers.some(
      signer => signer.toLowerCase() === dto.approver.toLowerCase(),
    );
    if (!isAuthorizedApprover) {
      throw new Error('Only designated vault signers can approve proposals');
    }

    const currentState = vault.state || 0;

    // Verify proposal is pending on-chain
    if (!StateService.isProposalPending(currentState, proposal.proposalId)) {
      throw new Error('Proposal is not pending on-chain');
    }

    // Increment approval with state check
    const { newState, isApproved } = StateService.incrementApprovalWithCheck(
      currentState,
      proposal.proposalId,
      vault.approvalThreshold
    );

    // Update database
    const newApprovals = [...proposal.approvals, dto.approver];
    const newApprovalCount = newApprovals.length;
    
    const stmt = db!.prepare(`
      UPDATE proposals
      SET approval_count = ?, approvals = ?, updated_at = CURRENT_TIMESTAMP,
          status = ?
      WHERE id = ?
    `);
    await stmt.run(
      newApprovalCount,
      JSON.stringify(newApprovals),
      isApproved ? ProposalStatus.APPROVED : ProposalStatus.PENDING,
      dto.proposalId
    );

    // Update vault state in database
    await VaultService.updateVaultState(proposal.vaultId, newState);

    return await this.getProposalById(dto.proposalId);
  }

  /**
   * Create on-chain approval transaction
   */
  static async createOnChainApprovalTransaction(
    proposalId: string,
    signerPublicKey: string
  ): Promise<{ transaction: any; newState: number; isApproved: boolean }> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    // Verify signer is authorized
    const signerIndex = vault.signerPubkeys.findIndex(
      pk => pk.toLowerCase() === signerPublicKey.toLowerCase()
    );
    if (signerIndex === -1) {
      throw new Error('Signer not authorized');
    }

    const currentState = vault.state || 0;
    const vaultStartTime = vault.startTime ? Math.floor(vault.startTime.getTime() / 1000) : Math.floor(Date.now() / 1000);

    // Build approval transaction descriptor using ProposalCovenant
    const { newState, isApproved } = StateService.incrementApprovalWithCheck(
      currentState,
      proposal.proposalId,
      vault.approvalThreshold
    );

    const transaction = {
      type: 'proposal_approve',
      contractType: 'ProposalCovenant',
      proposalId: proposal.proposalId,
      vaultId: proposal.vaultId,
      contractAddress: vault.contractAddress,
      functionName: 'approve',
      functionInputs: {
        proposalId: proposal.proposalId,
        signerPublicKey,
      },
      signerPubkeys: vault.signerPubkeys,
      requiredApprovals: vault.approvalThreshold,
      newState,
      isApproved,
    };

    return { transaction, newState, isApproved };
  }

  /**
   * Build WalletConnect transaction to create the proposal covenant UTXO with mutable state NFT.
   */
  static async createOnChainProposalFundingTransaction(
    proposalId: string,
    funderAddress: string,
  ): Promise<CreateProposalWcBuildResult> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new Error('Only pending proposals can be created on-chain');
    }
    if (proposal.contractAddress && proposal.txHash) {
      throw new Error('Proposal already has an on-chain creation transaction');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.signerPubkeys || vault.signerPubkeys.length < 3) {
      throw new Error('Vault not found or missing signer configuration');
    }

    const normalizedFunder = funderAddress.toLowerCase();
    const isAuthorizedFunder =
      vault.creator.toLowerCase() === normalizedFunder ||
      vault.signers.some((signer) => signer.toLowerCase() === normalizedFunder);
    if (!isAuthorizedFunder) {
      throw new Error('Only vault creator/signers can create proposal covenant transactions');
    }

    const vaultParamsRow = await db!
      .prepare('SELECT constructor_params FROM vaults WHERE vault_id = ? OR id = ? LIMIT 1')
      .get(proposal.vaultId, proposal.vaultId) as { constructor_params?: string } | undefined;
    if (!vaultParamsRow?.constructor_params) {
      throw new Error('Vault constructor parameters are missing');
    }

    const vaultConstructorParams = this.parseConstructorParams(vaultParamsRow.constructor_params);
    if (!(vaultConstructorParams[0] instanceof Uint8Array)) {
      throw new Error('Vault constructor params are invalid: missing bytes32 vaultId');
    }

    const proposalConstructorParams = [
      vaultConstructorParams[0],
      vaultConstructorParams[2],
      vaultConstructorParams[3],
      vaultConstructorParams[4],
      BigInt(vault.approvalThreshold),
    ];

    const network = (process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet') || 'chipnet';
    const provider = new ElectrumNetworkProvider(network);
    const artifact = ContractFactory.getArtifact('ProposalCovenant');
    const proposalContract = new Contract(artifact, proposalConstructorParams, { provider });

    const walletUtxos = await provider.getUtxos(funderAddress);
    const nonTokenUtxos = walletUtxos.filter((utxo) => !utxo.token);
    if (!nonTokenUtxos.length) {
      throw new Error('No BCH-only UTXOs available for proposal creation');
    }

    const categoryAnchor = nonTokenUtxos.find((utxo) => utxo.vout === 0);
    if (!categoryAnchor) {
      throw new Error(
        'Cannot derive proposal token category: no spendable BCH UTXO with outpoint index 0 available',
      );
    }

    const selectedInputs: typeof walletUtxos = [];
    let totalInputSatoshis = 0n;
    const fundingSatoshis = 2000n;
    const feeReserve = 3500n;
    const candidates = [
      categoryAnchor,
      ...nonTokenUtxos.filter((utxo) => utxo.txid !== categoryAnchor.txid || utxo.vout !== categoryAnchor.vout),
    ];
    for (const utxo of candidates) {
      selectedInputs.push(utxo);
      totalInputSatoshis += utxo.satoshis;
      if (totalInputSatoshis >= fundingSatoshis + feeReserve) {
        break;
      }
    }
    if (totalInputSatoshis < fundingSatoshis + feeReserve) {
      throw new Error('Insufficient BCH balance to create proposal covenant');
    }

    const votingEndTimestamp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    const executionTimelock = Math.floor(Date.now() / 1000);
    const payoutHashHex = await this.ensurePayoutHash(proposal.id);
    const initialCommitment = this.buildInitialProposalCommitment({
      requiredApprovals: vault.approvalThreshold,
      votingEndTimestamp,
      executionTimelock,
      payoutHashHex,
    });

    const tokenCategory = categoryAnchor.txid;
    const changeSatoshis = totalInputSatoshis - fundingSatoshis - feeReserve;

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: funderAddress,
      inputs: selectedInputs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        {
          to: proposalContract.tokenAddress,
          amount: fundingSatoshis,
          token: {
            category: tokenCategory,
            amount: 0,
            nft: {
              capability: 'mutable',
              commitment: initialCommitment,
            },
          },
        },
        ...(changeSatoshis > 546n
          ? [{ to: funderAddress, amount: changeSatoshis }]
          : []),
      ],
      userPrompt: `Create proposal #${proposal.proposalId} on-chain`,
      broadcast: true,
    });

    console.log('[ProposalService] Built proposal create WC transaction', {
      proposalId: proposal.id,
      proposalNumber: proposal.proposalId,
      proposalContractAddress: proposalContract.address,
      funderAddress,
      fundingSatoshis: fundingSatoshis.toString(),
      tokenCategory,
      inputCount: selectedInputs.length,
      network,
    });

    return {
      wcTransaction,
      proposalContractAddress: proposalContract.address,
      constructorParamsSerialized: this.serializeConstructorParams(proposalConstructorParams),
      tokenCategory,
      initialCommitment,
      fundingSatoshis,
    };
  }

  /**
   * Build WalletConnect transaction for ProposalCovenant.approve.
   */
  static async createApproveProposalWcTransaction(
    proposalId: string,
    signerAddress: string,
  ): Promise<ApproveProposalWcBuildResult> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    if (proposal.status === ProposalStatus.EXECUTED) {
      throw new Error('Cannot approve an already executed proposal');
    }
    if (!proposal.contractAddress || !proposal.constructorParams) {
      throw new Error('Proposal covenant has not been created on-chain yet');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.signerPubkeys) {
      throw new Error('Vault signer configuration is missing');
    }

    const signerIndex = vault.signers.findIndex(
      (address) => address.toLowerCase() === signerAddress.toLowerCase(),
    );
    if (signerIndex < 0) {
      throw new Error('Only vault signers can approve proposals');
    }
    if (proposal.approvals.some((a) => a.toLowerCase() === signerAddress.toLowerCase())) {
      throw new Error('This signer already approved the proposal');
    }

    const signerPubkey = vault.signerPubkeys[signerIndex];
    if (!signerPubkey) {
      throw new Error('Approver pubkey is missing from vault signer configuration');
    }
    if (signerIndex > 2) {
      throw new Error('ProposalCovenant currently supports only the first 3 configured signers');
    }
    const signerBit = 1 << signerIndex;

    const constructorParams = this.parseConstructorParams(proposal.constructorParams);
    const network = (process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet') || 'chipnet';
    const provider = new ElectrumNetworkProvider(network);
    const artifact = ContractFactory.getArtifact('ProposalCovenant');
    const contract = new Contract(artifact, constructorParams, { provider });

    const contractUtxos = await provider.getUtxos(proposal.contractAddress);
    if (!contractUtxos.length) {
      throw new Error('No UTXOs found for proposal covenant');
    }
    const contractUtxo = contractUtxos.find((utxo) => utxo.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Proposal covenant UTXO is missing state NFT');
    }

    const commitment = this.normalizeCommitment(contractUtxo.token.nft.commitment);
    if (commitment.length < 40) {
      throw new Error(`Invalid proposal commitment length: expected >=40, got ${commitment.length}`);
    }
    if (commitment[1] !== 0) {
      throw new Error('Proposal is not in pending state');
    }

    const requiredApprovals = Math.max(1, commitment[3] || vault.approvalThreshold || 1);
    const currentApprovalMask = commitment[2] ?? 0;
    if ((currentApprovalMask & signerBit) === signerBit) {
      throw new Error('This signer already approved the proposal on-chain');
    }
    const newApprovalMask = currentApprovalMask | signerBit;
    const newApprovalCount = this.countSetBits(newApprovalMask);
    const isApproved = newApprovalCount >= requiredApprovals;
    const nextCommitment = new Uint8Array(40);
    nextCommitment.set(commitment.slice(0, 40));
    nextCommitment[1] = isApproved ? 1 : 0;
    nextCommitment[2] = newApprovalMask;
    nextCommitment.fill(0, 34, 40);

    const feeReserve = 700n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Proposal covenant UTXO is too small to cover approval transaction fee');
    }

    const txBuilder = new TransactionBuilder({ provider });
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.approve(
        placeholderSignature(),
        hexToBin(signerPubkey),
      ),
    );
    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(nextCommitment),
        },
      },
    });

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: `Approve proposal #${proposal.proposalId}`,
    });

    console.log('[ProposalService] Built proposal approve WC transaction', {
      proposalId: proposal.id,
      proposalContractAddress: proposal.contractAddress,
      signerAddress,
      signerPubkey,
      newApprovalCount,
      isApproved,
      network,
    });

    return {
      wcTransaction,
      proposalContractAddress: proposal.contractAddress,
      newApprovalCount,
      isApproved,
    };
  }
  
  static async markProposalExecuted(proposalId: string, txHash: string): Promise<void> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Get vault to update state
    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    const currentState = vault.state || 0;

    // Update state to mark proposal as executed
    const newState = StateService.setProposalExecuted(currentState, proposal.proposalId);

    // Update database
    const stmt = db!.prepare(`
      UPDATE proposals
      SET status = ?, executed_at = CURRENT_TIMESTAMP, tx_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    await stmt.run(ProposalStatus.EXECUTED, txHash, proposalId);

    // Update vault state
    await VaultService.updateVaultState(proposal.vaultId, newState);
  }

  /**
   * Choose signer pairs for VaultCovenant.spend.
   * The covenant currently requires exactly two distinct signer pubkeys.
   */
  static async getPreferredExecuteSigners(
    proposalId: string,
  ): Promise<{ signerAddresses: string[]; signerPubkeys: string[] }> {
    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    const signerEntries = vault.signers
      .map((address, i) => ({ address, pubkey: vault.signerPubkeys?.[i] }))
      .filter((entry): entry is { address: string; pubkey: string } => Boolean(entry.pubkey));

    if (signerEntries.length < 2) {
      throw new Error('Vault does not have two signer pubkeys wired for payout execution');
    }

    const approvedSignerSet = new Set((proposal.approvals || []).map(a => a.toLowerCase()));
    const approvedSignerEntries = signerEntries.filter((entry) =>
      approvedSignerSet.has(entry.address.toLowerCase()),
    );

    const selected = (approvedSignerEntries.length >= 2 ? approvedSignerEntries : signerEntries).slice(0, 2);
    if (selected.length < 2) {
      throw new Error('At least two signers are required to execute this payout');
    }

    return {
      signerAddresses: selected.map((entry) => entry.address),
      signerPubkeys: selected.map((entry) => entry.pubkey),
    };
  }

  /**
   * Build a WalletConnect-compatible execution transaction for VaultCovenant.spend.
   * Uses placeholder signatures so each signer wallet can partially sign in sequence.
   */
  static async createExecutePayoutTransaction(
    proposalId: string,
    signerPubkeys: string[],
  ): Promise<ExecutePayoutWcBuildResult> {
    if (signerPubkeys.length !== 2) {
      throw new Error('Vault payout execution requires exactly two signer pubkeys');
    }
    if (signerPubkeys[0].toLowerCase() === signerPubkeys[1].toLowerCase()) {
      throw new Error('Signer pubkeys for payout execution must be distinct');
    }

    const proposal = await this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new Error('Proposal is not approved');
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    const normalizedVaultSignerPubkeys = new Set(vault.signerPubkeys.map((pk) => pk.toLowerCase()));
    for (const pk of signerPubkeys) {
      if (!normalizedVaultSignerPubkeys.has(pk.toLowerCase())) {
        throw new Error(`Signer pubkey is not authorized for this vault: ${pk}`);
      }
    }

    const vaultRow = await db!
      .prepare('SELECT constructor_params FROM vaults WHERE vault_id = ? OR id = ? LIMIT 1')
      .get(proposal.vaultId, proposal.vaultId) as { constructor_params?: string } | undefined;
    if (!vaultRow?.constructor_params) {
      throw new Error('Vault constructor parameters are missing; cannot build covenant transaction');
    }

    const constructorParams = this.parseConstructorParams(vaultRow.constructor_params);
    const artifact = ContractFactory.getArtifact('VaultCovenant');
    const network = (process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet') || 'chipnet';
    const provider = new ElectrumNetworkProvider(network);
    const contract = new Contract(artifact, constructorParams, { provider });

    const contractUtxos = await provider.getUtxos(vault.contractAddress);
    if (!contractUtxos?.length) {
      throw new Error(`No UTXOs found for vault contract ${vault.contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error(
        'Vault contract UTXO is missing the mutable state NFT required by VaultCovenant.spend. ' +
        'Fund the vault with the state NFT first.',
      );
    }

    const payoutSatoshis = BigInt(displayAmountToOnChain(proposal.amount, 'BCH'));
    if (payoutSatoshis <= 0n) {
      throw new Error('Proposal payout amount must be greater than zero');
    }

    const commitment = this.normalizeCommitment(contractUtxo.token.nft.commitment);
    if (commitment.length < 25) {
      throw new Error(`Invalid vault NFT commitment length: expected >=25, got ${commitment.length}`);
    }

    const status = commitment[1];
    if (status !== 0) {
      throw new Error(`Vault is not active (status=${status}); cannot execute payout`);
    }

    const currentPeriodId = this.readUint32BE(commitment, 5);
    const spentThisPeriod = this.readUint64BE(commitment, 9);
    const lastUpdate = this.readUint64BE(commitment, 17);

    const periodDuration = this.toBigIntParam(constructorParams[5], 'periodDuration');
    const periodCap = this.toBigIntParam(constructorParams[6], 'periodCap');
    const recipientCap = this.toBigIntParam(constructorParams[7], 'recipientCap');

    const locktime = Math.floor(Date.now() / 1000);
    let newPeriodId = currentPeriodId;
    if (periodDuration > 0n && BigInt(locktime) >= (lastUpdate + periodDuration)) {
      const elapsed = BigInt(locktime) - lastUpdate;
      const rolloverCount = elapsed / periodDuration;
      const safeRollover = rolloverCount > 0n ? rolloverCount : 1n;
      newPeriodId = currentPeriodId + Number(safeRollover);
    }

    const newSpent = newPeriodId > currentPeriodId ? payoutSatoshis : spentThisPeriod + payoutSatoshis;
    if (periodCap > 0n && newSpent > periodCap) {
      throw new Error('Payout exceeds the vault period cap for this cycle');
    }
    if (recipientCap > 0n && payoutSatoshis > recipientCap) {
      throw new Error('Payout exceeds the vault recipient cap');
    }

    const feeReserve = 1500n;
    const stateOutputSatoshis = contractUtxo.satoshis - payoutSatoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient vault balance to pay recipient and preserve state UTXO');
    }

    const payoutHashHex = await this.ensurePayoutHash(proposal.id);
    const payoutHash = hexToBin(payoutHashHex);
    if (payoutHash.length !== 32) {
      throw new Error('Payout hash must be exactly 32 bytes');
    }

    const recipientHash = this.extractP2pkhHash(proposal.recipient);
    const newCommitment = this.buildNextVaultCommitment({
      currentCommitment: commitment,
      newPeriodId,
      newSpent,
      locktime: BigInt(locktime),
    });

    const txBuilder = new TransactionBuilder({ provider });
    txBuilder.setLocktime(locktime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.spend(
        placeholderSignature(),
        hexToBin(signerPubkeys[0]),
        placeholderSignature(),
        hexToBin(signerPubkeys[1]),
        payoutHash,
        recipientHash,
        payoutSatoshis,
        BigInt(newPeriodId),
        newSpent,
      ),
    );

    txBuilder.addOutput({
      to: proposal.recipient,
      amount: payoutSatoshis,
    });

    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: false,
      userPrompt: `Sign treasury payout for proposal #${proposal.proposalId}`,
    });

    const selectedSignerAddresses = signerPubkeys.map((pubkey) => {
      const idx = vault.signerPubkeys!.findIndex((candidate) => candidate.toLowerCase() === pubkey.toLowerCase());
      return idx >= 0 ? vault.signers[idx] : '';
    });

    console.log('[ProposalService] Built execute payout WC transaction', {
      proposalId: proposal.id,
      vaultId: proposal.vaultId,
      payoutSatoshis: payoutSatoshis.toString(),
      signerPubkeys,
      selectedSignerAddresses,
      inputSatoshis: contractUtxo.satoshis.toString(),
      network,
    });

    return {
      wcTransaction,
      selectedSignerAddresses,
      selectedSignerPubkeys: signerPubkeys,
      payoutSatoshis,
    };
  }

  private static parseConstructorParams(rawJson: string): any[] {
    const params = JSON.parse(rawJson || '[]');
    return params.map((param: any) => {
      if (param && typeof param === 'object') {
        if (param.type === 'bigint') return BigInt(param.value);
        if (param.type === 'bytes') return hexToBin(param.value);
        if (param.type === 'boolean') return param.value === 'true' || param.value === true;
        return param.value;
      }
      return param;
    });
  }

  private static serializeConstructorParams(params: any[]): any[] {
    return params.map((param) => {
      if (typeof param === 'bigint') {
        return { type: 'bigint', value: param.toString() };
      }
      if (param instanceof Uint8Array) {
        return { type: 'bytes', value: binToHex(param) };
      }
      if (typeof param === 'boolean') {
        return { type: 'boolean', value: param ? 'true' : 'false' };
      }
      return { type: 'string', value: String(param) };
    });
  }

  private static toBigIntParam(value: unknown, name: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    throw new Error(`Invalid constructor parameter for ${name}`);
  }

  private static normalizeCommitment(commitment: string | Uint8Array): Uint8Array {
    return typeof commitment === 'string' ? hexToBin(commitment) : commitment;
  }

  private static buildInitialProposalCommitment(args: {
    requiredApprovals: number;
    votingEndTimestamp: number;
    executionTimelock: number;
    payoutHashHex: string;
  }): string {
    const commitment = new Uint8Array(40);
    // [0] version
    commitment[0] = 1;
    // [1] status (0 = pending)
    commitment[1] = 0;
    // [2] approval_bitmask
    commitment[2] = 0;
    // [3] required_approvals
    commitment[3] = Math.max(1, Math.min(255, Math.trunc(args.requiredApprovals)));
    // [4..8] voting_end_timestamp (uint40 BE)
    this.writeUint40BE(commitment, 4, args.votingEndTimestamp);
    // [9..13] execution_timelock (uint40 BE)
    this.writeUint40BE(commitment, 9, args.executionTimelock);
    // [14..33] payout hash (bytes20)
    const payoutHashBytes = hexToBin(args.payoutHashHex);
    commitment.set(payoutHashBytes.slice(0, 20), 14);
    // [34..39] reserved = 0
    commitment.fill(0, 34, 40);
    return binToHex(commitment);
  }

  private static countSetBits(mask: number): number {
    let value = mask & 0xff;
    let count = 0;
    while (value > 0) {
      count += value & 1;
      value >>= 1;
    }
    return count;
  }

  private static async ensurePayoutHash(proposalDbId: string): Promise<string> {
    const row = await db!
      .prepare('SELECT payout_hash, vault_id, proposal_id, recipient, amount, reason FROM proposals WHERE id = ?')
      .get(proposalDbId) as any;
    if (!row) {
      throw new Error('Proposal not found while resolving payout hash');
    }

    if (typeof row.payout_hash === 'string' && /^[0-9a-f]{64}$/i.test(row.payout_hash)) {
      return row.payout_hash.toLowerCase();
    }

    const generated = createHash('sha256')
      .update(`${row.vault_id}:${row.proposal_id}:${row.recipient}:${row.amount}:${row.reason ?? ''}`)
      .digest('hex');

    await db!.prepare('UPDATE proposals SET payout_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(generated, proposalDbId);
    return generated;
  }

  private static extractP2pkhHash(address: string): Uint8Array {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') {
      throw new Error(`Invalid BCH recipient address: ${decoded}`);
    }
    const lockingBytecode = decoded.bytecode;
    const isP2pkh = lockingBytecode.length === 25
      && lockingBytecode[0] === 0x76
      && lockingBytecode[1] === 0xa9
      && lockingBytecode[2] === 0x14
      && lockingBytecode[23] === 0x88
      && lockingBytecode[24] === 0xac;

    if (!isP2pkh) {
      throw new Error('Vault payouts currently require a P2PKH recipient address');
    }
    return lockingBytecode.slice(3, 23);
  }

  private static readUint32BE(source: Uint8Array, offset: number): number {
    const view = new DataView(source.buffer, source.byteOffset + offset, 4);
    return view.getUint32(0, false);
  }

  private static readUint64BE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, false);
  }

  private static writeUint32BE(target: Uint8Array, offset: number, value: number): void {
    const view = new DataView(target.buffer, target.byteOffset + offset, 4);
    view.setUint32(0, value, false);
  }

  private static writeUint64BE(target: Uint8Array, offset: number, value: bigint): void {
    const view = new DataView(target.buffer, target.byteOffset + offset, 8);
    view.setBigUint64(0, value, false);
  }

  private static writeUint40BE(target: Uint8Array, offset: number, value: number): void {
    let remainder = BigInt(Math.max(0, Math.trunc(value)));
    for (let i = 4; i >= 0; i--) {
      target[offset + i] = Number(remainder & 0xffn);
      remainder >>= 8n;
    }
  }

  private static buildNextVaultCommitment(args: {
    currentCommitment: Uint8Array;
    newPeriodId: number;
    newSpent: bigint;
    locktime: bigint;
  }): Uint8Array {
    const length = Math.max(32, args.currentCommitment.length);
    const next = new Uint8Array(length);
    next.set(args.currentCommitment.slice(0, length));

    // [1] status
    next[1] = 0;
    // [5..8] current_period_id
    this.writeUint32BE(next, 5, args.newPeriodId);
    // [9..16] spent_this_period
    this.writeUint64BE(next, 9, args.newSpent);
    // [17..24] last_update_timestamp
    this.writeUint64BE(next, 17, args.locktime);
    // [25..] reserved
    next.fill(0, 25);

    return next;
  }
}
