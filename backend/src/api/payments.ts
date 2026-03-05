/**
 * Payments API Endpoints
 * Handles recurring payment operations
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import db from '../database/schema.js';
import { PaymentDeploymentService } from '../services/PaymentDeploymentService.js';
import { PaymentFundingService } from '../services/PaymentFundingService.js';
import { PaymentClaimService } from '../services/PaymentClaimService.js';
import { PaymentControlService } from '../services/PaymentControlService.js';
import { ContractService } from '../services/contract-service.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import {
  displayAmountToOnChain,
  isFungibleTokenType,
  onChainAmountToDisplay,
} from '../utils/amounts.js';
import {
  getLatestActivityEvents,
  listActivityEvents,
  recordActivityEvent,
} from '../utils/activityEvents.js';
import { getRequiredContractFundingSatoshis } from '../utils/fundingConfig.js';

const router = Router();

const INTERVAL_SECONDS: Record<string, number> = {
  DAILY: 86400,
  WEEKLY: 604800,
  BIWEEKLY: 1209600,
  MONTHLY: 2592000,
  YEARLY: 31536000,
};

/**
 * GET /api/payments
 * List recurring payments for sender or recipient
 */
router.get('/payments', async (req: Request, res: Response) => {
  try {
    const { sender, recipient } = req.query;

    if (!sender && !recipient) {
      return res.status(400).json({
        error: 'Must provide either sender or recipient parameter',
      });
    }

    let rows: any[];
    if (sender && recipient) {
      rows = db!.prepare('SELECT * FROM payments WHERE sender = ? AND recipient = ? ORDER BY created_at DESC').all(sender, recipient);
    } else if (sender) {
      rows = db!.prepare('SELECT * FROM payments WHERE sender = ? ORDER BY created_at DESC').all(sender);
    } else {
      rows = db!.prepare('SELECT * FROM payments WHERE recipient = ? ORDER BY created_at DESC').all(recipient);
    }

    const latestByPaymentId = getLatestActivityEvents(
      'payment',
      rows.map((row: any) => String(row.id)),
    );
    const payments = rows.map((row: any) => ({
      ...row,
      latest_event: latestByPaymentId.get(String(row.id)) || null,
    }));

    res.json({
      success: true,
      payments,
      total: payments.length,
    });
  } catch (error: any) {
    console.error('GET /payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments', message: error.message });
  }
});

/**
 * GET /api/payments/:id
 * Get single payment details with execution history
 */
router.get('/payments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const history = db!.prepare('SELECT * FROM payment_executions WHERE payment_id = ? ORDER BY paid_at DESC').all(id);
    const storedEvents = listActivityEvents('payment', id, 200);
    const events = storedEvents.length > 0
      ? storedEvents
      : buildFallbackPaymentEvents(payment, history);

    res.json({
      success: true,
      payment,
      history,
      events,
    });
  } catch (error: any) {
    console.error(`GET /payments/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch payment', message: error.message });
  }
});

/**
 * POST /api/payments/create
 * Create a new recurring payment
 */
router.post('/payments/create', async (req: Request, res: Response) => {
  try {
    const {
      sender,
      recipient,
      recipientName,
      tokenType,
      tokenCategory,
      amountPerPeriod,
      interval,
      startDate,
      endDate,
      cancelable,
      pausable,
      vaultId,
    } = req.body;
    const normalizedTokenType = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';

    if (!sender || !recipient) {
      return res.status(400).json({ error: 'Sender and recipient are required' });
    }
    if (!amountPerPeriod || amountPerPeriod <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    if (!['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY'].includes(interval)) {
      return res.status(400).json({ error: 'Invalid payment interval' });
    }
    if (!isP2pkhAddress(sender) || !isP2pkhAddress(recipient)) {
      return res.status(400).json({
        error: 'Invalid address type',
        message: 'Payment sender and recipient must be P2PKH cash addresses.',
      });
    }

    const id = randomUUID();
    const countRow = db!.prepare('SELECT COUNT(*) as cnt FROM payments').get() as any;
    const paymentId = `#FG-PAY-${String((countRow?.cnt ?? 0) + 1).padStart(3, '0')}`;
    const now = Math.floor(Date.now() / 1000);
    const start = startDate || now;
    const intervalSeconds = INTERVAL_SECONDS[interval];
    const cancelableEnabled = cancelable !== false;

    // Resolve vault linkage: keep UX standalone-friendly, but always use a nonzero
    // internal vaultId for covenant constructor compatibility.
    let actualVaultId = deriveStandaloneVaultId(`${id}:${sender}:${recipient}:${now}`);
    if (vaultId) {
      const vaultRow = db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
      if (vaultRow?.constructor_params) {
        const vaultParams = JSON.parse(vaultRow.constructor_params);
        if (vaultParams[0]?.type === 'bytes') {
          actualVaultId = vaultParams[0].value;
        }
      }
    }

    // Deploy payment contract
    const deploymentService = new PaymentDeploymentService('chipnet');
    const deployment = await deploymentService.deployRecurringPayment({
      vaultId: actualVaultId,
      sender,
      recipient,
      amountPerInterval: amountPerPeriod,
      interval: interval as 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY',
      intervalSeconds,
      startTime: start,
      endTime: endDate || 0,
      cancelable: cancelableEnabled,
      pausable: pausable !== false,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    // Store with PENDING status - becomes ACTIVE after funding
    db!.prepare(`
      INSERT INTO payments (id, payment_id, vault_id, sender, recipient, recipient_name,
        token_type, token_category, amount_per_period, interval, interval_seconds,
        start_date, end_date, next_payment_date, total_paid, payment_count, status,
        pausable, created_at, updated_at, contract_address, constructor_params,
        nft_commitment, nft_capability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, paymentId, vaultId || null, sender, recipient,
      recipientName || null,
      normalizedTokenType, tokenCategory || null,
      amountPerPeriod, interval, intervalSeconds,
      start, endDate || null, start + intervalSeconds,
      pausable !== false ? 1 : 0,
      now, now,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable'
    );
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'created',
      actor: sender,
      amount: amountPerPeriod,
      status: 'PENDING',
      details: {
        paymentId,
        interval,
        startDate: start,
        endDate: endDate || null,
      },
      createdAt: now,
    });

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Recurring payment contract deployed. Fund to activate.',
      payment,
      deployment: {
        contractAddress: deployment.contractAddress,
        paymentId,
        onChainPaymentId: deployment.paymentId,
        fundingRequired: deployment.fundingTxRequired,
        cancelable: cancelableEnabled,
      },
    });
  } catch (error: any) {
    console.error('POST /payments/create error:', error);
    res.status(500).json({ error: 'Failed to create payment', message: error.message });
  }
});

/**
 * POST /api/payments/:id/pause
 * Build on-chain pause transaction for recurring payment
 */
router.post('/payments/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active payments can be paused' });
    }
    if (String(payment.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the payment sender can pause this payment' });
    }
    if (!payment.contract_address || !payment.constructor_params) {
      return res.status(400).json({ error: 'Payment contract is not fully configured' });
    }

    const controlService = new PaymentControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(payment.contract_address)
      || payment.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(payment.constructor_params);
    const built = await controlService.buildPauseTransaction({
      contractAddress: payment.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizePaymentTokenType(payment.token_type),
      tokenCategory: payment.token_category || undefined,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/payments/:id/resume
 * Build on-chain resume transaction for recurring payment
 */
router.post('/payments/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Only paused payments can be resumed' });
    }
    if (String(payment.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the payment sender can resume this payment' });
    }
    if (!payment.contract_address || !payment.constructor_params) {
      return res.status(400).json({ error: 'Payment contract is not fully configured' });
    }

    const controlService = new PaymentControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(payment.contract_address)
      || payment.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(payment.constructor_params);
    const built = await controlService.buildResumeTransaction({
      contractAddress: payment.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizePaymentTokenType(payment.token_type),
      tokenCategory: payment.token_category || undefined,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/resume error:`, error);
    res.status(500).json({ error: 'Failed to build resume transaction', message: error.message });
  }
});

/**
 * POST /api/payments/:id/cancel
 * Build on-chain cancel transaction for recurring payment
 */
router.post('/payments/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Payment is already cancelled' });
    }
    if (String(payment.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the payment sender can cancel this payment' });
    }
    if (!payment.contract_address || !payment.constructor_params) {
      return res.status(400).json({ error: 'Payment contract is not fully configured' });
    }

    const controlService = new PaymentControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(payment.contract_address)
      || payment.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(payment.constructor_params);
    const built = await controlService.buildCancelTransaction({
      contractAddress: payment.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizePaymentTokenType(payment.token_type),
      tokenCategory: payment.token_category || undefined,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      senderReturnAddress: built.senderReturnAddress,
      remainingPool: built.remainingPool?.toString() || '0',
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

/**
 * POST /api/payments/:id/confirm-pause
 * Confirm on-chain pause transaction and update DB state
 */
router.post('/payments/:id/confirm-pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: payment.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 35,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Pause transaction does not include expected payment covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    db!.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'paused',
      actor: payment.sender,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/confirm-pause error:`, error);
    res.status(500).json({
      error: 'Failed to confirm pause',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/payments/:id/confirm-resume
 * Confirm on-chain resume transaction and update DB state
 */
router.post('/payments/:id/confirm-resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: payment.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 40,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Resume transaction does not include expected payment covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const nextPaymentDate = now + Number(payment.interval_seconds || 0);
    db!.prepare('UPDATE payments SET status = ?, next_payment_date = ?, updated_at = ? WHERE id = ?')
      .run('ACTIVE', nextPaymentDate, now, id);
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'resumed',
      actor: payment.sender,
      status: 'ACTIVE',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'ACTIVE', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/confirm-resume error:`, error);
    res.status(500).json({
      error: 'Failed to confirm resume',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/payments/:id/confirm-cancel
 * Confirm on-chain cancel transaction and update DB state
 */
router.post('/payments/:id/confirm-cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const constructorParams = deserializeConstructorParams(payment.constructor_params || '[]');
    const senderHash = readBytes20(constructorParams[1], 'senderHash');
    const senderReturnAddress = hashToP2pkhAddress(senderHash);
    const totalAmount = toBigIntParam(constructorParams[5], 'totalAmount');
    const totalPaid = BigInt(displayAmountToOnChain(Number(payment.total_paid || 0), payment.token_type));
    const remainingPool = totalAmount > 0n ? (totalAmount - totalPaid > 0n ? totalAmount - totalPaid : 0n) : 0n;

    if (remainingPool > 0n) {
      const isTokenPayment = isFungibleTokenType(payment.token_type);
      const hasExpectedRefund = await transactionHasExpectedOutput(
        txHash,
        {
          address: senderReturnAddress,
          minimumSatoshis: BigInt(isTokenPayment ? 546 : Number(remainingPool)),
          ...(isTokenPayment && payment.token_category
            ? {
              tokenCategory: payment.token_category,
              minimumTokenAmount: remainingPool,
            }
            : {}),
        },
        'chipnet',
      );
      if (!hasExpectedRefund) {
        return res.status(400).json({
          error: 'Cancel transaction does not include expected refund output',
        });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    db!.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'cancelled',
      actor: payment.sender,
      status: 'CANCELLED',
      txHash,
      amount: Number(onChainAmountToDisplay(Number(remainingPool), payment.token_type)),
      details: {
        senderReturnAddress,
      },
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'CANCELLED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/confirm-cancel error:`, error);
    res.status(500).json({
      error: 'Failed to confirm cancel',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * GET /api/payments/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/payments/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (!payment.contract_address) {
      return res.status(400).json({ error: 'Payment contract not deployed' });
    }

    const fundingExpectation = resolvePaymentFundingExpectation(payment);
    const fundingAmountDisplay = fundingExpectation.fundingAmountDisplay;
    const fundingAmountOnChain = fundingExpectation.fundingAmountOnChain;

    const fundingService = new PaymentFundingService('chipnet');

    try {
      const fundingTx = await fundingService.buildFundingTransaction({
        contractAddress: payment.contract_address,
        senderAddress: payment.sender,
        amount: fundingAmountOnChain,
        tokenType: normalizePaymentTokenType(payment.token_type),
        tokenCategory: payment.token_category,
        nftCommitment: payment.nft_commitment || '',
        nftCapability: 'mutable',
      });

      res.json({
        success: true,
        fundingInfo: {
          contractAddress: payment.contract_address,
          amount: fundingAmountDisplay,
          onChainAmount: fundingAmountOnChain,
          tokenType: payment.token_type,
          inputs: fundingTx.inputs,
          outputs: fundingTx.outputs,
          fee: fundingTx.fee,
        },
        wcTransaction: serializeWcTransaction(fundingTx.wcTransaction),
      });
    } catch (fundingError: any) {
      if (fundingError.message?.includes('outpoint index 0')) {
        const { checkAndPrepareGenesisUtxo } = await import('../utils/genesisPrep.js');
        const provider = new (await import('cashscript')).ElectrumNetworkProvider('chipnet');
        const prepResult = await checkAndPrepareGenesisUtxo(provider, payment.sender);
        if (prepResult.required && prepResult.wcTransaction) {
          return res.json({
            success: false,
            requiresPreparation: true,
            preparationTransaction: serializeWcTransaction(prepResult.wcTransaction),
            message: 'Your wallet needs a consolidation transaction before funding. Please sign to proceed.',
          });
        }
      }
      throw fundingError;
    }
  } catch (error: any) {
    console.error(`GET /payments/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/payments/:id/confirm-funding
 * Confirm payment contract funding
 */
router.post('/payments/:id/confirm-funding', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Payment is not pending',
        message: `Payment status is ${payment.status}. Only PENDING payments can be funded.`,
      });
    }

    const fundingExpectation = resolvePaymentFundingExpectation(payment);
    const fundedPeriods = fundingExpectation.fundedPeriods;
    const fundingAmountOnChain = fundingExpectation.fundingAmountOnChain;
    const isTokenPayment = isFungibleTokenType(payment.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'payment',
      isTokenPayment ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(fundingAmountOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: payment.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenPayment && payment.token_category
          ? {
            tokenCategory: payment.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(fundingAmountOnChain))),
          }
          : {}),
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      'chipnet',
    );

    if (!expectedContractOutput) {
      return res.status(400).json({
        error: 'Funding transaction does not include the expected contract output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const activationStart = Math.max(now, Number(payment.start_date || 0));
    const nextPaymentDate = activationStart + Number(payment.interval_seconds || 0);
    const contractService = new ContractService('chipnet');
    const confirmedCommitment = await contractService.getNFTCommitment(payment.contract_address)
      || payment.nft_commitment
      || null;

    // Activate recurring schedule only after funding confirmation.
    db!.prepare(`
      UPDATE payments
      SET tx_hash = ?, status = 'ACTIVE', nft_commitment = ?, start_date = ?, next_payment_date = ?, activated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, confirmedCommitment, activationStart, nextPaymentDate, now, now, id);
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'funded',
      actor: payment.sender,
      amount: Number(payment.amount_per_period) * fundedPeriods,
      status: 'ACTIVE',
      txHash,
      details: {
        fundedPeriods,
        intervalSeconds: payment.interval_seconds,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Payment funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/confirm-funding error:`, error);
    res.status(500).json({
      error: 'Failed to confirm funding',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/payments/:id/claim
 * Build claim transaction for payment
 */
router.post('/payments/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientAddress, signerAddress } = req.body;

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Payment is not active' });
    }
    if (!payment.contract_address || !payment.constructor_params) {
      return res.status(400).json({
        error: 'Payment contract is not fully configured',
        message: 'This payment has no deployable on-chain contract state.',
      });
    }

    if (payment.recipient.toLowerCase() !== recipientAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the payment recipient can claim' });
    }

    const amountPerIntervalOnChain = displayAmountToOnChain(payment.amount_per_period, payment.token_type);
    const totalPaidOnChain = displayAmountToOnChain(payment.total_paid || 0, payment.token_type);
    const constructorParams = JSON.parse(payment.constructor_params || '[]');
    const now = Math.floor(Date.now() / 1000);

    // Fetch current NFT commitment from blockchain
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(payment.contract_address)
      || payment.nft_commitment
      || '';

    // Build claim transaction
    const claimService = new PaymentClaimService('chipnet');
    const claimTx = await claimService.buildClaimTransaction({
      paymentId: payment.payment_id,
      contractAddress: payment.contract_address,
      recipient: payment.recipient,
      amountPerInterval: amountPerIntervalOnChain,
      intervalSeconds: payment.interval_seconds,
      totalPaid: totalPaidOnChain,
      nextPaymentTime: Number(payment.next_payment_date || (now + Number(payment.interval_seconds || 0))),
      currentTime: now,
      endTime: payment.end_date,
      tokenType: normalizePaymentTokenType(payment.token_type),
      tokenCategory: payment.token_category,
      feePayerAddress: signerAddress || recipientAddress,
      constructorParams: constructorParams.map((p: any) => {
        if (p.type === 'bytes') return Buffer.from(p.value, 'hex');
        if (p.type === 'bigint') return BigInt(p.value);
        return p.value;
      }),
      currentCommitment,
    });

    const claimedDisplayAmount = onChainAmountToDisplay(claimTx.claimableAmount, payment.token_type);

    res.json({
      success: true,
      claimableAmount: claimedDisplayAmount,
      intervalsClaimable: claimTx.intervalsClaimable,
      wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/claim error:`, error);
    const message = typeof error?.message === 'string' ? error.message : 'Unknown claim builder error';

    if (message.includes('No UTXOs found for payment contract')) {
      return res.status(409).json({
        error: 'Payment state is pending confirmation',
        message:
          'The payment contract UTXO is currently unavailable (often due to an unconfirmed claim/pause/resume/fund tx). ' +
          'Wait for confirmation, refresh, and retry claim.',
        state: 'pending',
        retryable: true,
        errorCode: 'PAYMENT_UTXO_UNAVAILABLE',
      });
    }

    if (
      message.includes('Insufficient contract balance to preserve state UTXO after payment')
      || message.includes('Insufficient contract balance to satisfy payment output')
    ) {
      return res.status(409).json({
        error: 'Insufficient fee reserve in payment contract',
        message:
          'This payment does not currently hold enough BCH to preserve covenant state after claim. ' +
          'Refill the payment with a small BCH reserve and retry.',
        state: 'failed',
        retryable: false,
        errorCode: 'PAYMENT_FEE_RESERVE_REQUIRED',
      });
    }

    res.status(500).json({ error: 'Failed to build claim transaction', message });
  }
});

/**
 * POST /api/payments/:id/confirm-claim
 * Confirm payment claim
 */
router.post('/payments/:id/confirm-claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claimedAmount, txHash, intervalsClaimed } = req.body;

    if (!claimedAmount || !txHash) {
      return res.status(400).json({ error: 'Claimed amount and transaction hash are required' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const payment = db!.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const claimedAmountNumber = Number(claimedAmount);
    const claimedAmountOnChain = displayAmountToOnChain(claimedAmountNumber, payment.token_type);
    const isTokenPayment = isFungibleTokenType(payment.token_type);

    const expectedRecipientOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: payment.recipient,
        minimumSatoshis: BigInt(isTokenPayment ? 546 : Math.max(546, claimedAmountOnChain)),
        ...(isTokenPayment && payment.token_category
          ? {
            tokenCategory: payment.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(claimedAmountOnChain))),
          }
          : {}),
      },
      'chipnet',
    );

    if (!expectedRecipientOutput) {
      return res.status(400).json({
        error: 'Claim transaction does not include the expected recipient output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const newTotalPaid = Number(payment.total_paid || 0) + claimedAmountNumber;
    const normalizedIntervals = Math.max(1, Math.trunc(Number(intervalsClaimed ?? 1)));
    const newPaymentCount = (payment.payment_count || 0) + normalizedIntervals;
    const nextPaymentDate = (payment.next_payment_date || now) + (normalizedIntervals * payment.interval_seconds);

    // Update payment statistics
    db!.prepare(`
      UPDATE payments
      SET total_paid = ?, payment_count = ?, next_payment_date = ?, updated_at = ?
      WHERE id = ?
    `).run(newTotalPaid, newPaymentCount, nextPaymentDate, now, id);

    // Record claim in payment_executions table (if it exists)
    try {
      db!.prepare(`
        INSERT INTO payment_executions (id, payment_id, amount, paid_at, tx_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), id, claimedAmountNumber, now, txHash);
    } catch (e) {
      // Table might not exist, ignore
      console.log('payment_executions table not found, skipping record');
    }
    recordActivityEvent({
      entityType: 'payment',
      entityId: id,
      eventType: 'claim',
      actor: payment.recipient,
      amount: claimedAmountNumber,
      status: String(payment.status || 'ACTIVE'),
      txHash,
      details: {
        intervalsClaimed: normalizedIntervals,
        totalPaidAfterClaim: newTotalPaid,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Payment claim confirmed',
      txHash,
      totalPaid: newTotalPaid,
      paymentCount: newPaymentCount,
      intervalsClaimed: normalizedIntervals,
      status: String(payment.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /payments/${req.params.id}/confirm-claim error:`, error);
    res.status(500).json({
      error: 'Failed to confirm claim',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

export default router;

function normalizePaymentTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function buildFallbackPaymentEvents(payment: any, history: any[]): Array<{
  id: string;
  entity_type: 'payment';
  entity_id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  details: null;
  created_at: number;
}> {
  const events: Array<{
    id: string;
    entity_type: 'payment';
    entity_id: string;
    event_type: string;
    actor: string | null;
    amount: number | null;
    status: string | null;
    tx_hash: string | null;
    details: null;
    created_at: number;
  }> = [];

  events.push({
    id: `fallback-payment-created-${payment.id}`,
    entity_type: 'payment',
    entity_id: payment.id,
    event_type: 'created',
    actor: payment.sender || null,
    amount: typeof payment.amount_per_period === 'number' ? payment.amount_per_period : null,
    status: payment.status || null,
    tx_hash: null,
    details: null,
    created_at: Number(payment.created_at || Math.floor(Date.now() / 1000)),
  });

  if (payment.tx_hash) {
    events.push({
      id: `fallback-payment-funded-${payment.id}`,
      entity_type: 'payment',
      entity_id: payment.id,
      event_type: 'funded',
      actor: payment.sender || null,
      amount: null,
      status: payment.status || null,
      tx_hash: payment.tx_hash,
      details: null,
      created_at: Number(payment.updated_at || payment.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (payment.status === 'PAUSED') {
    events.push({
      id: `fallback-payment-paused-${payment.id}`,
      entity_type: 'payment',
      entity_id: payment.id,
      event_type: 'paused',
      actor: payment.sender || null,
      amount: null,
      status: 'PAUSED',
      tx_hash: null,
      details: null,
      created_at: Number(payment.updated_at || payment.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (payment.status === 'CANCELLED') {
    events.push({
      id: `fallback-payment-cancelled-${payment.id}`,
      entity_type: 'payment',
      entity_id: payment.id,
      event_type: 'cancelled',
      actor: payment.sender || null,
      amount: null,
      status: 'CANCELLED',
      tx_hash: null,
      details: null,
      created_at: Number(payment.updated_at || payment.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  history.forEach((entry: any) => {
    events.push({
      id: `fallback-payment-claim-${entry.id}`,
      entity_type: 'payment',
      entity_id: payment.id,
      event_type: 'claim',
      actor: payment.recipient || null,
      amount: typeof entry.amount === 'number' ? entry.amount : null,
      status: payment.status || null,
      tx_hash: entry.tx_hash || null,
      details: null,
      created_at: Number(entry.paid_at || payment.updated_at || payment.created_at || Math.floor(Date.now() / 1000)),
    });
  });

  return events.sort((a, b) => b.created_at - a.created_at);
}

function deserializeConstructorParams(raw: string): any[] {
  const parsed = JSON.parse(raw || '[]');
  return parsed.map((param: any) => {
    if (param && typeof param === 'object') {
      if (param.type === 'bytes') return hexToBin(param.value);
      if (param.type === 'bigint') return BigInt(param.value);
      if (param.type === 'boolean') return param.value === true || param.value === 'true';
      return param.value;
    }
    return param;
  });
}

function readBytes20(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== 20) {
    throw new Error(`Invalid ${name} in constructor parameters`);
  }
  return value;
}

function toBigIntParam(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  throw new Error(`Invalid ${name} in constructor parameters`);
}

function toSafeNumber(value: bigint, label: string): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) {
    throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
}

function resolvePaymentFundingExpectation(payment: any): {
  fundedPeriods: number;
  fundingAmountOnChain: number;
  fundingAmountDisplay: number;
} {
  try {
    const constructorParams = deserializeConstructorParams(payment.constructor_params || '[]');
    if (Array.isArray(constructorParams) && constructorParams.length >= 6) {
      const amountPerIntervalOnChain = toBigIntParam(constructorParams[3], 'amountPerInterval');
      const totalAmountOnChain = toBigIntParam(constructorParams[5], 'totalAmount');
      if (amountPerIntervalOnChain > 0n && totalAmountOnChain > 0n) {
        const periods = (totalAmountOnChain + amountPerIntervalOnChain - 1n) / amountPerIntervalOnChain;
        const fundingAmountOnChain = toSafeNumber(totalAmountOnChain, 'totalAmount');
        return {
          fundedPeriods: Math.max(1, toSafeNumber(periods, 'fundedPeriods')),
          fundingAmountOnChain,
          fundingAmountDisplay: Number(onChainAmountToDisplay(fundingAmountOnChain, payment.token_type)),
        };
      }
    }
  } catch (error) {
    console.warn('[payments] Failed to derive funding expectation from constructor params, using legacy fallback', {
      paymentId: payment?.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Legacy fallback for rows created before constructor params were stored.
  const now = Math.floor(Date.now() / 1000);
  const startTime = Number(payment.start_date || now);
  const endTime = Number(payment.end_date || 0);
  const intervalSec = Number(payment.interval_seconds || 86400);
  let fundedPeriods = 12;
  if (endTime > 0 && intervalSec > 0) {
    const duration = Math.max(0, endTime - startTime);
    fundedPeriods = Math.max(1, Math.ceil(duration / intervalSec));
  }
  const fundingAmountDisplay = Number(payment.amount_per_period || 0) * fundedPeriods;
  const fundingAmountOnChain = displayAmountToOnChain(fundingAmountDisplay, payment.token_type);
  return { fundedPeriods, fundingAmountOnChain, fundingAmountDisplay };
}

function hashToP2pkhAddress(hash20: Uint8Array): string {
  const lockingBytecode = new Uint8Array(25);
  lockingBytecode[0] = 0x76;
  lockingBytecode[1] = 0xa9;
  lockingBytecode[2] = 0x14;
  lockingBytecode.set(hash20, 3);
  lockingBytecode[23] = 0x88;
  lockingBytecode[24] = 0xac;
  const encoded = lockingBytecodeToCashAddress({
    bytecode: lockingBytecode,
    prefix: 'bchtest',
  });
  if (typeof encoded === 'string') {
    throw new Error(`Failed to encode sender P2PKH address: ${encoded}`);
  }
  return encoded.address;
}

function isP2pkhAddress(address: string): boolean {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') return false;
  const b = decoded.bytecode;
  return (
    b.length === 25 &&
    b[0] === 0x76 &&
    b[1] === 0xa9 &&
    b[2] === 0x14 &&
    b[23] === 0x88 &&
    b[24] === 0xac
  );
}

function deriveStandaloneVaultId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}
