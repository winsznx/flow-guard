/**
 * Contract Service - Handles blockchain interactions
 * Deploys contracts, creates transactions, monitors blockchain
 */

import { Contract, ElectrumNetworkProvider, SignatureTemplate } from 'cashscript';
import { binToHex, hexToBin } from '@bitauth/libauth';
import artifact from '../contracts/FlowGuardEnhanced.json';
import { StateService } from './state-service';

export interface VaultDeployment {
  contractAddress: string;
  contractId: string;
  bytecode: string;
}

export interface ProposalTransaction {
  txHex: string;
  txId: string;
  requiresSignatures: string[]; // Pubkeys that need to sign
}

export interface UTXO {
  txid: string;
  vout: number;
  satoshis: number;
  height?: number;
}

/**
 * Service for interacting with BCH blockchain and FlowGuard contracts
 */
export class ContractService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Deploy a new vault contract to the blockchain
   * @param signer1 First signer's public key (hex)
   * @param signer2 Second signer's public key (hex)
   * @param signer3 Third signer's public key (hex)
   * @param approvalThreshold Number of signatures required (e.g., 2 for 2-of-3)
   * @param state Initial state (0 for new vault)
   * @param cycleDuration Cycle duration in seconds
   * @param vaultStartTime Unix timestamp when vault starts
   * @param spendingCap Maximum spending per period in satoshis
   */
  async deployVault(
    signer1: string,
    signer2: string,
    signer3: string,
    approvalThreshold: number,
    state: number = 0,
    cycleDuration: number,
    vaultStartTime: number,
    spendingCap: number
  ): Promise<VaultDeployment> {
    try {
      // Convert hex pubkeys to Uint8Array
      const pk1 = hexToBin(signer1);
      const pk2 = hexToBin(signer2);
      const pk3 = hexToBin(signer3);

      // Create contract instance with all parameters
      const contract = new Contract(
        artifact as any,
        [
          pk1,
          pk2,
          pk3,
          BigInt(approvalThreshold),
          BigInt(state),
          BigInt(cycleDuration),
          BigInt(vaultStartTime),
          BigInt(spendingCap),
        ],
        { provider: this.provider }
      );

      console.log('Contract deployed:', {
        address: contract.address,
        network: this.network,
      });

      // Get bytecode from artifact (already compiled)
      const bytecode = artifact.bytecode || '';

      return {
        contractAddress: contract.address,
        contractId: contract.toString(),
        bytecode: bytecode,
      };
    } catch (error) {
      console.error('Failed to deploy vault:', error);
      throw new Error(`Contract deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get contract instance from address
   * @param contractAddress The contract's cashaddr
   */
  async getContract(
    contractAddress: string,
    signer1: string,
    signer2: string,
    signer3: string,
    approvalThreshold: number,
    state: number,
    cycleDuration: number,
    vaultStartTime: number,
    spendingCap: number
  ): Promise<Contract> {
    const pk1 = hexToBin(signer1);
    const pk2 = hexToBin(signer2);
    const pk3 = hexToBin(signer3);

    const contract = new Contract(
      artifact as any,
      [
        pk1,
        pk2,
        pk3,
        BigInt(approvalThreshold),
        BigInt(state),
        BigInt(cycleDuration),
        BigInt(vaultStartTime),
        BigInt(spendingCap),
      ],
      { provider: this.provider }
    );

    // Verify the contract address matches
    if (contract.address !== contractAddress) {
      throw new Error('Contract parameters do not match the given address');
    }

    return contract;
  }

  /**
   * Get balance of a contract address
   * @param contractAddress The contract's cashaddr
   */
  async getBalance(contractAddress: string): Promise<number> {
    try {
      const utxos = await this.provider.getUtxos(contractAddress);
      const balance = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis), 0);
      return balance;
    } catch (error) {
      console.error('Failed to get balance:', error);
      return 0;
    }
  }

  /**
   * Get all UTXOs for a contract address
   * @param contractAddress The contract's cashaddr
   */
  async getUTXOs(contractAddress: string): Promise<UTXO[]> {
    try {
      const utxos = await this.provider.getUtxos(contractAddress);
      return utxos.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: Number(utxo.satoshis),
        height: utxo.height || undefined,
      }));
    } catch (error) {
      console.error('Failed to get UTXOs:', error);
      return [];
    }
  }

  /**
   * Create a proposal transaction (unsigned)
   * This creates the transaction hex that signers will sign
   *
   * @param contractAddress The vault contract address
   * @param recipientAddress Where to send the funds
   * @param amount Amount to send in satoshis
   * @param signerPublicKeys Array of signer public keys
   * @param approvalThreshold Number of signatures required
   */
  async createProposal(
    contractAddress: string,
    recipientAddress: string,
    amount: number,
    signerPublicKeys: string[],
    approvalThreshold: number
  ): Promise<ProposalTransaction> {
    try {
      if (signerPublicKeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys required');
      }

      const [signer1, signer2, signer3] = signerPublicKeys;

      // Get contract instance - we need vault parameters from database
      // For now, using defaults - in production, fetch from vault record
      const contract = await this.getContract(
        contractAddress,
        signer1,
        signer2,
        signer3,
        approvalThreshold,
        0, // state - should be fetched from vault
        2592000, // cycleDuration - should be fetched from vault
        Math.floor(Date.now() / 1000), // vaultStartTime - should be fetched from vault
        1000000000 // spendingCap - should be fetched from vault
      );

      // For now, we'll use placeholder signatures
      // In production, this would be signed by the actual signers
      const pk1 = hexToBin(signer1);
      const pk2 = hexToBin(signer2);
      const pk3 = hexToBin(signer3);

      // Create placeholder signatures (empty)
      const emptySignature = new Uint8Array(65);

      // Build the transaction
      const transaction = await contract.functions
        .payout(pk1, emptySignature, pk2, emptySignature, pk3, emptySignature)
        .to(recipientAddress, BigInt(amount))
        .withHardcodedFee(BigInt(1000)) // 1000 sats fee
        .build();

      return {
        txHex: transaction.toString(),
        txId: '', // Will be set after signing
        requiresSignatures: signerPublicKeys,
      };
    } catch (error) {
      console.error('Failed to create proposal:', error);
      throw new Error(`Proposal creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast a signed transaction to the network
   * @param txHex The signed transaction hex
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      const txid = await this.provider.sendRawTransaction(txHex);
      console.log('Transaction broadcast:', txid);
      return txid;
    } catch (error) {
      console.error('Failed to broadcast transaction:', error);
      throw new Error(`Transaction broadcast failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Monitor a transaction until it's confirmed
   * @param txid Transaction ID to monitor
   * @param maxAttempts Maximum number of attempts (default: 60)
   * @param delayMs Delay between attempts in ms (default: 10000 = 10s)
   */
  async waitForConfirmation(
    txid: string,
    maxAttempts: number = 60,
    delayMs: number = 10000
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const txInfo = await this.provider.getRawTransaction(txid) as any;
        if (txInfo && txInfo.confirmations && txInfo.confirmations > 0) {
          console.log(`Transaction ${txid} confirmed with ${txInfo.confirmations} confirmations`);
          return true;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.warn(`Transaction ${txid} not confirmed after ${maxAttempts} attempts`);
    return false;
  }

  /**
   * Get transaction details
   * @param txid Transaction ID
   */
  async getTransaction(txid: string): Promise<any> {
    try {
      return await this.provider.getRawTransaction(txid);
    } catch (error) {
      console.error('Failed to get transaction:', error);
      return null;
    }
  }

  /**
   * Get block height
   */
  async getBlockHeight(): Promise<number> {
    try {
      return await this.provider.getBlockHeight();
    } catch (error) {
      console.error('Failed to get block height:', error);
      return 0;
    }
  }

  /**
   * Create on-chain proposal transaction with state management
   * This prepares a transaction that calls createProposal on the enhanced contract
   * 
   * @param contractAddress The vault contract address
   * @param recipientAddress Where to send the funds
   * @param amount Amount to send in satoshis
   * @param proposalId On-chain proposal ID
   * @param currentState Current vault state (bitwise encoded)
   * @param signerPublicKeys Array of signer public keys
   * @param approvalThreshold Number of signatures required
   * @param spendingCap Maximum spending per period
   */
  async createOnChainProposal(
    contractAddress: string,
    recipientAddress: string,
    amount: number,
    proposalId: number,
    currentState: number,
    signerPublicKeys: string[],
    approvalThreshold: number,
    spendingCap: number
  ): Promise<ProposalTransaction> {
    try {
      if (signerPublicKeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys required');
      }

      // Verify proposal doesn't already exist
      if (StateService.isProposalPending(currentState, proposalId) ||
          StateService.getProposalStatus(currentState, proposalId) !== 0) {
        throw new Error(`Proposal ${proposalId} already exists`);
      }

      // Verify amount doesn't exceed spending cap
      if (amount > spendingCap) {
        throw new Error(`Amount ${amount} exceeds spending cap ${spendingCap}`);
      }

      // Calculate new state with proposal marked as pending
      const newState = StateService.setProposalPending(currentState, proposalId);

      // Note: This would call the enhanced contract's createProposal function
      // For now, we return a transaction structure that can be used when the enhanced contract is deployed
      // The actual transaction building would be:
      // contract.functions.createProposal(recipient, amount, proposalId, newState, pk1, sig1)
      
      return {
        txHex: '', // Will be built when enhanced contract is deployed
        txId: '',
        requiresSignatures: [signerPublicKeys[0]], // Only needs one signature for proposal creation
      };
    } catch (error) {
      console.error('Failed to create on-chain proposal:', error);
      throw new Error(`On-chain proposal creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create on-chain approval transaction with state management
   * 
   * @param contractAddress The vault contract address
   * @param proposalId On-chain proposal ID
   * @param currentState Current vault state (bitwise encoded)
   * @param signerPublicKeys Array of signer public keys
   * @param approvalThreshold Number of signatures required
   */
  async createOnChainApproval(
    contractAddress: string,
    proposalId: number,
    currentState: number,
    signerPublicKeys: string[],
    approvalThreshold: number
  ): Promise<{ newState: number; isApproved: boolean; transaction: ProposalTransaction }> {
    try {
      if (signerPublicKeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys required');
      }

      // Verify proposal is pending
      if (!StateService.isProposalPending(currentState, proposalId)) {
        throw new Error(`Proposal ${proposalId} is not pending`);
      }

      // Increment approval and check if threshold is met
      const { newState, isApproved } = StateService.incrementApprovalWithCheck(
        currentState,
        proposalId,
        approvalThreshold
      );

      // Note: This would call the enhanced contract's approveProposal function
      // The actual transaction building would be:
      // contract.functions.approveProposal(proposalId, newState, pk1, sig1)

      return {
        newState,
        isApproved,
        transaction: {
          txHex: '', // Will be built when enhanced contract is deployed
          txId: '',
          requiresSignatures: [signerPublicKeys[0]], // Only needs one signature for approval
        },
      };
    } catch (error) {
      console.error('Failed to create on-chain approval:', error);
      throw new Error(`On-chain approval creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create cycle unlock transaction with state management
   * 
   * @param contractAddress The vault contract address
   * @param cycleNumber Cycle number to unlock
   * @param currentState Current vault state (bitwise encoded)
   * @param vaultStartTime Unix timestamp when vault was created
   * @param cycleDuration Cycle duration in seconds
   * @param signerPublicKeys Array of signer public keys
   */
  async createCycleUnlock(
    contractAddress: string,
    cycleNumber: number,
    currentState: number,
    vaultStartTime: number,
    cycleDuration: number,
    signerPublicKeys: string[]
  ): Promise<{ newState: number; transaction: ProposalTransaction }> {
    try {
      if (signerPublicKeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys required');
      }

      // Check if cycle can be unlocked
      if (!StateService.canUnlockCycle(currentState, cycleNumber, vaultStartTime, cycleDuration)) {
        throw new Error(`Cycle ${cycleNumber} cannot be unlocked yet`);
      }

      // Calculate new state with cycle marked as unlocked
      const newState = StateService.setCycleUnlocked(currentState, cycleNumber);

      // Note: This would call the enhanced contract's unlock function
      // The actual transaction building would be:
      // contract.functions.unlock(cycleNumber, newState, pk1, sig1)

      return {
        newState,
        transaction: {
          txHex: '', // Will be built when enhanced contract is deployed
          txId: '',
          requiresSignatures: [signerPublicKeys[0]], // Only needs one signature for unlock
        },
      };
    } catch (error) {
      console.error('Failed to create cycle unlock:', error);
      throw new Error(`Cycle unlock creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create execute payout transaction with state management
   * 
   * @param contractAddress The vault contract address
   * @param recipientAddress Where to send the funds
   * @param amount Amount to send in satoshis
   * @param proposalId On-chain proposal ID
   * @param currentState Current vault state (bitwise encoded)
   * @param signerPublicKeys Array of signer public keys
   * @param approvalThreshold Number of signatures required
   * @param spendingCap Maximum spending per period
   */
  async createExecutePayout(
    contractAddress: string,
    recipientAddress: string,
    amount: number,
    proposalId: number,
    currentState: number,
    signerPublicKeys: string[],
    approvalThreshold: number,
    spendingCap: number
  ): Promise<{ newState: number; transaction: ProposalTransaction }> {
    try {
      if (signerPublicKeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys required');
      }

      // Verify proposal is approved
      if (!StateService.isProposalApproved(currentState, proposalId)) {
        throw new Error(`Proposal ${proposalId} is not approved`);
      }

      // Verify amount doesn't exceed spending cap
      if (amount > spendingCap) {
        throw new Error(`Amount ${amount} exceeds spending cap ${spendingCap}`);
      }

      // Calculate new state with proposal marked as executed
      const newState = StateService.setProposalExecuted(currentState, proposalId);

      // Note: This would call the enhanced contract's executePayout function
      // The actual transaction building would be:
      // contract.functions.executePayout(recipient, amount, proposalId, newState, pk1, sig1, pk2, sig2, pk3, sig3)

      return {
        newState,
        transaction: {
          txHex: '', // Will be built when enhanced contract is deployed
          txId: '',
          requiresSignatures: signerPublicKeys.slice(0, approvalThreshold), // Needs threshold signatures
        },
      };
    } catch (error) {
      console.error('Failed to create execute payout:', error);
      throw new Error(`Execute payout creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
