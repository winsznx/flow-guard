/**
 * Vote Unlock Service
 * Builds a WcTransactionObject for reclaiming governance tokens from VoteLockCovenant.
 *
 * Uses CashScript TransactionBuilder with placeholderSignature/placeholderPublicKey
 * so the voter's wallet can sign via wallet.signCashScriptTransaction().
 *
 * Contract function: reclaim(sig voterSig, pubkey voterPubkey)
 *   - Requires tx.locktime >= unlockTimestamp
 *   - Returns full token amount to voter's P2PKH address
 */

import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface UnlockTransactionParams {
  voteId: string;
  contractAddress: string;
  voter: string;
  stakeAmount: number;
  votingPeriodEnd: number;
  currentTime: number;
  tokenCategory: string;
  constructorParams: Array<{ type: string; value: string }>;
  currentCommitment: string;
}

export interface UnlockTransaction {
  unlockedAmount: number;
  wcTransaction: WcTransactionObject;
}

export class VoteUnlockService {
  private provider: ElectrumNetworkProvider;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildUnlockTransaction(params: UnlockTransactionParams): Promise<UnlockTransaction> {
    const { contractAddress, voter, votingPeriodEnd, currentTime, tokenCategory, constructorParams } = params;

    if (currentTime < votingPeriodEnd) {
      throw new Error(
        `Voting period has not ended yet. Ends at ${new Date(votingPeriodEnd * 1000).toISOString()}`
      );
    }

    const artifact = ContractFactory.getArtifact('VoteLockCovenant');
    const contractArgs = constructorParams.map(p => {
      if (p.type === 'bytes') return hexToBin(p.value);
      if (p.type === 'bigint') return BigInt(p.value);
      return p.value;
    });
    const contract = new Contract(artifact, contractArgs, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos?.length) {
      throw new Error(`No UTXOs found for vote lock contract ${contractAddress}`);
    }

    // Prefer UTXO with NFT (the vote commitment UTXO from the lock tx)
    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const lockedTokens = contractUtxo.token?.amount ?? 0n;
    const category = contractUtxo.token?.category || tokenCategory;

    const fee = 4000n; // ~3KB reclaim tx; must clear min relay (~3500)
    const voterAmount = contractUtxo.satoshis - fee;
    if (voterAmount < 546n) {
      throw new Error('Insufficient contract balance to cover transaction fee');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });

    // The covenant enforces the lock via tx.locktime >= unlockTimestamp. For that
    // to be REAL the input must be non-final, so the network requires nLockTime <=
    // median-time-past — otherwise a final input lets the voter set any future
    // nLockTime and reclaim before the unlock. Set nLockTime ~2h back so it is
    // already <= MTP (which lags ~1h) and the tx is immediately mineable.
    const reclaimLocktime = Math.max(0, currentTime - 7200);
    txBuilder.setLocktime(reclaimLocktime);

    txBuilder.addInput(
      contractUtxo,
      contract.unlock.reclaim(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
      { sequence: 0xfffffffe },
    );

    // Return BCH + FTs to voter; NFT is consumed (burned) — vote is finalized.
    // Token outputs require a token-aware (p2pkhWithTokens) address even though the
    // locking bytecode is identical to the plain P2PKH; the authenticated voter
    // address is plain, so re-encode it when returning the governance tokens.
    const hasTokens = lockedTokens > 0n && Boolean(category);
    const recipientAddress = hasTokens ? this.toTokenAwareAddress(voter) : voter;
    txBuilder.addOutput({
      to: recipientAddress,
      amount: voterAmount,
      ...(hasTokens ? { token: { category, amount: lockedTokens } } : {}),
    });

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Reclaim locked governance tokens',
    });

    return { unlockedAmount: Number(lockedTokens), wcTransaction };
  }

  private toTokenAwareAddress(address: string): string {
    const decoded = decodeCashAddress(address);
    if (typeof decoded === 'string') {
      throw new Error(`Invalid voter address for token return: ${decoded}`);
    }
    if (decoded.type === 'p2pkhWithTokens' || decoded.type === 'p2shWithTokens') {
      return address;
    }
    const tokenType = decoded.type === 'p2sh' ? 'p2shWithTokens' : 'p2pkhWithTokens';
    return encodeCashAddress({ prefix: decoded.prefix, type: tokenType, payload: decoded.payload }).address;
  }
}
