/**
 * Transactions API endpoints
 * Provides endpoints for transaction history and building
 */

import { Router } from 'express';
import { TransactionService } from '../services/transactionService.js';
import { Contract, ElectrumNetworkProvider, TransactionBuilder, type Output } from 'cashscript';
import { ContractFactory } from '../services/ContractFactory.js';
import { ContractService } from '../services/contract-service.js';
import { binToHex, decodeTransaction, hash160, hexToBin } from '@bitauth/libauth';
import db from '../database/schema.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

const router = Router();

function diagnoseSignedTransaction(txHex: string): {
  inputCount: number;
  outputCount: number;
  locktime: number;
  sequences: number[];
  firstInputUnlockingBytes: number;
  firstInputHasPlaceholderPubkey: boolean;
  firstInputHasPlaceholderSignature: boolean;
  inputsWithPlaceholderPubkey: number[];
  inputsWithPlaceholderSignature: number[];
  claimLike?: {
    claimerHashHex: string;
    pubkeyHex: string;
    pubkeyHashHex: string;
    pubkeyMatchesClaimerHash: boolean;
  };
} | null {
  const readPushes = (script: Uint8Array, maxPushes = 3): Uint8Array[] => {
    const pushes: Uint8Array[] = [];
    let i = 0;
    while (i < script.length && pushes.length < maxPushes) {
      const opcode = script[i++];
      let length = 0;
      if (opcode <= 0x4b) {
        length = opcode;
      } else if (opcode === 0x4c) {
        if (i >= script.length) break;
        length = script[i++];
      } else if (opcode === 0x4d) {
        if (i + 1 >= script.length) break;
        length = script[i] | (script[i + 1] << 8);
        i += 2;
      } else if (opcode === 0x4e) {
        if (i + 3 >= script.length) break;
        length = script[i] | (script[i + 1] << 8) | (script[i + 2] << 16) | (script[i + 3] << 24);
        i += 4;
      } else {
        break;
      }
      if (length < 0 || i + length > script.length) break;
      pushes.push(script.slice(i, i + length));
      i += length;
    }
    return pushes;
  };

  try {
    const decoded = decodeTransaction(hexToBin(txHex));
    if (typeof decoded === 'string') {
      return null;
    }

    const firstUnlocking = decoded.inputs[0]?.unlockingBytecode;
    const firstUnlockingHex = firstUnlocking ? binToHex(firstUnlocking) : '';
    const placeholderPubkeyPattern = `21${'00'.repeat(33)}`;
    const placeholderSigPattern = `41${'00'.repeat(65)}`;
    const inputsWithPlaceholderPubkey: number[] = [];
    const inputsWithPlaceholderSignature: number[] = [];
    decoded.inputs.forEach((input, index) => {
      const unlockingHex = binToHex(input.unlockingBytecode);
      if (unlockingHex.includes(placeholderPubkeyPattern)) {
        inputsWithPlaceholderPubkey.push(index);
      }
      if (unlockingHex.includes(placeholderSigPattern)) {
        inputsWithPlaceholderSignature.push(index);
      }
    });

    let claimLike:
      | {
          claimerHashHex: string;
          pubkeyHex: string;
          pubkeyHashHex: string;
          pubkeyMatchesClaimerHash: boolean;
        }
      | undefined;
    if (firstUnlocking && firstUnlocking.length > 0) {
      const pushes = readPushes(firstUnlocking, 3);
      const claimerHashPush = pushes.find((push) => push.length === 20);
      const pubkeyPush = pushes.find((push) => push.length === 33);
      if (claimerHashPush && pubkeyPush) {
        const claimerHashHex = binToHex(claimerHashPush);
        const pubkeyHex = binToHex(pubkeyPush);
        const pubkeyHashHex = binToHex(hash160(pubkeyPush));
        claimLike = {
          claimerHashHex,
          pubkeyHex,
          pubkeyHashHex,
          pubkeyMatchesClaimerHash: pubkeyHashHex === claimerHashHex,
        };
      }
    }

    return {
      inputCount: decoded.inputs.length,
      outputCount: decoded.outputs.length,
      locktime: decoded.locktime,
      sequences: decoded.inputs.map((input) => input.sequenceNumber),
      firstInputUnlockingBytes: firstUnlocking?.length ?? 0,
      firstInputHasPlaceholderPubkey: firstUnlockingHex.includes(placeholderPubkeyPattern),
      firstInputHasPlaceholderSignature: firstUnlockingHex.includes(placeholderSigPattern),
      inputsWithPlaceholderPubkey,
      inputsWithPlaceholderSignature,
      ...(claimLike ? { claimLike } : {}),
    };
  } catch {
    return null;
  }
}

function toUserFacingBroadcastMessage(rawMessage: string): string {
  const normalized = (rawMessage || '').toLowerCase();
  if (normalized.includes('bad-txns-nonfinal') || normalized.includes('non-final transaction')) {
    return 'Transaction is not final yet. Wait a few seconds and retry.';
  }
  if (normalized.includes('missing inputs') || normalized.includes('already spent')) {
    return 'Transaction inputs are no longer spendable. Refresh and rebuild the transaction.';
  }
  if (normalized.includes('insufficient fee')) {
    return 'Transaction fee is too low. Rebuild with updated fee inputs and retry.';
  }
  return 'Transaction broadcast failed. Please retry.';
}

/**
 * GET /api/vaults/:id/transactions
 * Get all transactions for a vault
 */
router.get('/vaults/:id/transactions', (req, res) => {
  try {
    const { id } = req.params;
    const transactions = TransactionService.getVaultTransactions(id);
    res.json({ transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/:txHash
 * Get transaction by hash
 */
router.get('/transactions/:txHash', (req, res) => {
  try {
    const { txHash } = req.params;
    const transaction = TransactionService.getTransactionByHash(txHash);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/pending
 * Get all pending transactions
 */
router.get('/transactions/pending', (req, res) => {
  try {
    const transactions = TransactionService.getPendingTransactions();
    res.json({ transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/transactions/broadcast
 * Broadcast a signed transaction hex and optionally persist metadata
 */
router.post('/transactions/broadcast', async (req, res) => {
  try {
    const { txHex, txType, vaultId, proposalId, amount, fromAddress, toAddress } = req.body;

    if (!txHex || typeof txHex !== 'string') {
      return res.status(400).json({ error: 'txHex is required' });
    }

    const contractService = new ContractService('chipnet');
    const txid = await contractService.broadcastTransaction(txHex);

    const recordableTypes = new Set(['create', 'unlock', 'proposal', 'approve', 'payout']);
    if (txType && recordableTypes.has(txType)) {
      await TransactionService.recordTransaction(txid, txType as any, {
        vaultId,
        proposalId,
        amount,
        fromAddress,
        toAddress,
      });
    }

    res.json({ txid, success: true });
  } catch (error: any) {
    console.error('POST /transactions/broadcast error:', error);
    const diagnostics = typeof req.body?.txHex === 'string'
      ? diagnoseSignedTransaction(req.body.txHex)
      : null;
    const errorMessage = error.message || 'Failed to broadcast transaction';
    res.status(500).json({
      error: errorMessage,
      userMessage: toUserFacingBroadcastMessage(errorMessage),
      debug: diagnostics ? { diagnostics } : undefined,
      diagnostics,
    });
  }
});

/**
 * POST /api/transactions/build
 * Build a complete transaction from a descriptor for wallet signing
 */
router.post('/transactions/build', async (req, res) => {
  try {
    const { descriptor } = req.body;

    if (!descriptor || !descriptor.contractType) {
      return res.status(400).json({ error: 'Invalid transaction descriptor' });
    }

    const network = (req.query.network as string) || 'chipnet';
    const provider = new ElectrumNetworkProvider(network as any);

    let result: { transaction: string; sourceOutputs: any[] };

    switch (descriptor.type) {
      case 'stream_claim':
        result = await buildStreamClaimTransaction(descriptor, provider);
        break;

      case 'stream_cancel':
        result = await buildStreamCancelTransaction(descriptor, provider);
        break;

      case 'proposal_create':
      case 'proposal_approve':
      case 'proposal_execute':
      case 'cycle_unlock':
        return res.status(400).json({
          error: `Unsupported transaction descriptor type: ${descriptor.type}`,
          message:
            'Use dedicated v2 endpoints instead: ' +
            '/api/proposals/:id/create-onchain, /api/proposals/:id/approve-onchain, /api/proposals/:id/execute, ' +
            'and /api/vaults/:vaultId/unlock for cycle policy updates.',
        });

      default:
        return res.status(400).json({ error: `Unsupported transaction type: ${descriptor.type}` });
    }

    res.json({
      ...result,
      success: true,
    });
  } catch (error: any) {
    console.error('Transaction build error:', error);
    res.status(500).json({ error: error.message || 'Failed to build transaction' });
  }
});

/**
 * Build stream claim transaction
 */
async function buildStreamClaimTransaction(
  descriptor: any,
  provider: ElectrumNetworkProvider
): Promise<{ transaction: string; sourceOutputs: any[] }> {
  const artifact = ContractFactory.getArtifact(descriptor.contractType);

  const streamRow = db!.prepare('SELECT * FROM streams WHERE stream_id = ?').get(descriptor.streamId) as any;
  if (!streamRow) {
    throw new Error(`Stream ${descriptor.streamId} not found`);
  }

  // Parse constructor params
  const constructorParams = streamRow.constructor_params
    ? JSON.parse(streamRow.constructor_params)
    : [];

  if (constructorParams.length === 0) {
    throw new Error('Constructor parameters not stored for this stream. Please redeploy the stream contract.');
  }

  // Convert constructor params to proper CashScript types
  const parsedParams = constructorParams.map((param: any) => {
    if (typeof param === 'object') {
      if (param.type === 'bigint') {
        return BigInt(param.value);
      } else if (param.type === 'bytes') {
        return hexToBin(param.value);
      } else if (param.type === 'boolean') {
        return param.value === 'true' || param.value === true;
      }
      return param.value;
    }
    return param;
  });

  // Instantiate contract
  const contract = new Contract(artifact, parsedParams, { provider });

  // Fetch contract UTXOs
  const utxos = await contract.getUtxos();
  if (utxos.length === 0) {
    throw new Error('No UTXOs available in contract');
  }

  // Select UTXO with sufficient balance
  const claimAmountSat = BigInt(displayAmountToOnChain(descriptor.claimAmount, 'BCH'));
  const utxo = utxos.find(u => u.satoshis >= claimAmountSat + 1000n);
  if (!utxo) {
    throw new Error('Insufficient contract balance');
  }

  // Build transaction using TransactionBuilder
  const txBuilder = new TransactionBuilder({ provider });

  // Add contract input with unlock function
  const recipient = descriptor.functionInputs.recipient || streamRow.recipient;
  txBuilder.addInput(utxo, contract.unlock.claim(claimAmountSat));

  // Add output to recipient
  const output: Output = { to: recipient, amount: claimAmountSat };
  txBuilder.addOutput(output);

  // Add change output back to contract if needed
  const changeAmount = utxo.satoshis - claimAmountSat - 1000n;
  if (changeAmount > 1000n) {
    const changeOutput: Output = { to: contract.address, amount: changeAmount };
    txBuilder.addOutput(changeOutput);
  }

  // Build transaction hex
  const txHex = txBuilder.build();

  // Prepare source outputs for Paytaca
  const sourceOutputs = [{
    valueSatoshis: utxo.satoshis,
    lockingBytecode: new Uint8Array(Buffer.from(contract.bytecode, 'hex')),
    contract: {
      abiFunction: artifact.abi.find((f: any) => f.name === 'claim'),
      redeemScript: new Uint8Array(Buffer.from(contract.bytecode, 'hex')),
      artifact: artifact,
    },
  }];

  return {
    transaction: txHex,
    sourceOutputs,
  };
}

/**
 * Build stream cancel transaction
 */
async function buildStreamCancelTransaction(
  descriptor: any,
  provider: ElectrumNetworkProvider
): Promise<{ transaction: string; sourceOutputs: any[] }> {
  const artifact = ContractFactory.getArtifact(descriptor.contractType);

  const streamRow = db!.prepare('SELECT * FROM streams WHERE stream_id = ?').get(descriptor.streamId) as any;
  if (!streamRow) {
    throw new Error(`Stream ${descriptor.streamId} not found`);
  }

  const constructorParams = streamRow.constructor_params
    ? JSON.parse(streamRow.constructor_params)
    : [];

  if (constructorParams.length === 0) {
    throw new Error('Constructor parameters not stored for this stream');
  }

  const parsedParams = constructorParams.map((param: any) => {
    if (typeof param === 'object') {
      if (param.type === 'bigint') return BigInt(param.value);
      if (param.type === 'bytes') return hexToBin(param.value);
      if (param.type === 'boolean') return param.value === 'true' || param.value === true;
      return param.value;
    }
    return param;
  });

  const contract = new Contract(artifact, parsedParams, { provider });
  const utxos = await contract.getUtxos();

  if (utxos.length === 0) {
    throw new Error('No UTXOs available in contract');
  }

  const vestedAmountSat = BigInt(displayAmountToOnChain(descriptor.vestedAmount, 'BCH'));
  const unvestedAmountSat = BigInt(displayAmountToOnChain(descriptor.unvestedAmount, 'BCH'));

  const txBuilder = new TransactionBuilder({ provider });
  txBuilder.addInput(utxos[0], contract.unlock.cancel());

  // Split funds between recipient (vested) and sender (unvested)
  if (vestedAmountSat > 1000n) {
    txBuilder.addOutput({ to: streamRow.recipient, amount: vestedAmountSat });
  }
  if (unvestedAmountSat > 1000n) {
    txBuilder.addOutput({ to: streamRow.sender, amount: unvestedAmountSat });
  }

  const txHex = txBuilder.build();

  const sourceOutputs = [{
    valueSatoshis: utxos[0].satoshis,
    lockingBytecode: new Uint8Array(Buffer.from(contract.bytecode, 'hex')),
    contract: {
      abiFunction: artifact.abi.find((f: any) => f.name === 'cancel'),
      redeemScript: new Uint8Array(Buffer.from(contract.bytecode, 'hex')),
      artifact: artifact,
    },
  }];

  return {
    transaction: txHex,
    sourceOutputs,
  };
}

export default router;
