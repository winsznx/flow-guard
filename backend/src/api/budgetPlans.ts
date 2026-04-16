import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  cashAddressToLockingBytecode,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import db from '../database/schema.js';
import { BudgetDeploymentService } from '../services/BudgetDeploymentService.js';
import { BudgetReleaseService } from '../services/BudgetReleaseService.js';
import { BudgetFundingService } from '../services/BudgetFundingService.js';
import { BudgetControlService } from '../services/BudgetControlService.js';
import { StreamCancelService } from '../services/StreamCancelService.js';
import { ContractService } from '../services/contract-service.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import {
  displayAmountToOnChain,
  isFungibleTokenType,
  onChainAmountToDisplay,
} from '../utils/amounts.js';
import { getRequiredContractFundingSatoshis } from '../utils/fundingConfig.js';

const router = Router();

// Create a new budget plan
router.post('/vaults/:vaultId/budget-plans', async (req, res) => {
  try {
    const { vaultId } = req.params;
    const creator = req.headers['x-user-address'] as string;

    if (!creator) {
      return res.status(401).json({ error: 'User address required' });
    }

    const {
      recipient,
      recipientName,
      recipientLabel,
      milestones,
      startDate,
      tokenType,
      tokenCategory,
      cancelable,
      totalAmount,
      amountPerInterval,
      intervalSeconds,
    } = req.body;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient address is required' });
    }
    const normalizedTokenType = normalizeBudgetTokenType(tokenType);
    const parsedStartDate = Number(startDate);
    const startTimestamp = Number.isFinite(parsedStartDate) && parsedStartDate > 0
      ? Math.floor(parsedStartDate)
      : Math.floor(Date.now() / 1000);

    // Support both new payload (milestones[]) and legacy payload
    let milestoneList = milestones as Array<{ amount: number; durationSeconds: number; description?: string }> | undefined;
    if (!Array.isArray(milestoneList) || milestoneList.length === 0) {
      const totalAmountNum = Number(totalAmount);
      const amountPerIntervalNum = Number(amountPerInterval);
      const intervalSecondsNum = Number(intervalSeconds);
      if (totalAmountNum > 0 && amountPerIntervalNum > 0 && intervalSecondsNum > 0) {
        milestoneList = [];
        let remaining = totalAmountNum;
        while (remaining > 0) {
          const chunk = Math.min(remaining, amountPerIntervalNum);
          milestoneList.push({ amount: chunk, durationSeconds: intervalSecondsNum });
          remaining = Math.max(0, remaining - chunk);
        }
      }
    }

    if (!Array.isArray(milestoneList) || milestoneList.length === 0) {
      return res.status(400).json({ error: 'At least one milestone is required' });
    }

    const deploymentMilestones = milestoneList.map((milestone) => ({
      amount: displayAmountToOnChain(milestone.amount, normalizedTokenType),
      durationSeconds: Number(milestone.durationSeconds),
      description: milestone.description,
    }));

    const totalAmountDisplay = milestoneList.reduce((sum, m) => sum + Number(m.amount || 0), 0);

    // Get vault's contract vaultId
    let actualVaultId = '0000000000000000000000000000000000000000000000000000000000000000';
    const vaultRow = await db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
    if (vaultRow?.constructor_params) {
      const vaultParams = JSON.parse(vaultRow.constructor_params);
      if (vaultParams[0]?.type === 'bytes') {
        actualVaultId = vaultParams[0].value;
      }
    }
    const senderControlAddress = isP2pkhAddress(String(vaultRow?.contract_address || ''))
      ? String(vaultRow.contract_address)
      : creator;

    // Deploy budget contract
    const deploymentService = new BudgetDeploymentService('chipnet');
    const deployment = await deploymentService.deployBudget({
      vaultId: actualVaultId,
      sender: senderControlAddress,
      recipient,
      milestones: deploymentMilestones,
      startTime: startTimestamp,
      cancelable: cancelable !== false,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    // Store with PENDING status - becomes ACTIVE after funding
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await db!.prepare(`
      INSERT INTO budget_plans (
        id, vault_id, creator, recipient, recipient_name,
        token_type, token_category, total_amount, released_amount,
        current_milestone, total_milestones, status, created_at, updated_at,
        contract_address, constructor_params, nft_commitment, nft_capability
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
    `).run(
      id, vaultId, creator, recipient, recipientName || null,
      normalizedTokenType, tokenCategory || null,
      totalAmountDisplay,
      deployment.stepCount,
      now, now,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable',
    );

    // Update recipient label if the frontend sent the legacy recipientLabel key.
    if (!recipientName && recipientLabel) {
      await db!.prepare(`
        UPDATE budget_plans
        SET recipient_name = ?
        WHERE id = ?
      `).run(recipientLabel, id);
    }

    // Store milestones
    for (let index = 0; index < milestoneList.length; index++) {
      const milestone = milestoneList[index];
      await db!.prepare(`
        INSERT INTO budget_milestones (id, budget_id, milestone_index, amount, description, duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        randomUUID(), id, index, milestone.amount,
        milestone.description || null, milestone.durationSeconds
      );
    }

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;

    res.status(201).json({
      success: true,
      message: 'Budget plan contract deployed. Fund to activate.',
      plan: mapBudgetPlanRow(plan),
      deployment: {
        contractAddress: deployment.contractAddress,
        budgetId: deployment.budgetId,
        fundingRequired: deployment.fundingTxRequired,
      },
    });
  } catch (error: any) {
    console.error('Error creating budget plan:', error);
    res.status(500).json({ error: error.message || 'Failed to create budget plan' });
  }
});

/**
 * GET /api/budget-plans/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/budget-plans/:id/funding-info', async (req, res) => {
  try {
    const { id } = req.params;
    const senderAddress = req.headers['x-user-address'] as string;

    if (!senderAddress) {
      return res.status(401).json({ error: 'User address required' });
    }

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    if (plan.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Budget plan is not pending',
        message: `Budget plan status is ${plan.status}. Only PENDING plans can be funded.`,
      });
    }

    if (!plan.contract_address) {
      return res.status(400).json({ error: 'Budget contract not deployed' });
    }

    const fundingAmountOnChain = displayAmountToOnChain(plan.total_amount, plan.token_type);
    const nftCommitment = plan.nft_commitment || '00'.repeat(40);

    // Build funding transaction using BudgetFundingService
    const fundingService = new BudgetFundingService('chipnet');
    const fundingTx = await fundingService.buildFundingTransaction({
      contractAddress: plan.contract_address,
      senderAddress,
      totalAmount: fundingAmountOnChain,
      tokenType: normalizeBudgetTokenType(plan.token_type),
      tokenCategory: plan.token_category,
      nftCommitment,
      nftCapability: 'mutable',
    });

    res.json({
      success: true,
      fundingInfo: {
        contractAddress: plan.contract_address,
        totalAmount: plan.total_amount,
        onChainAmount: fundingAmountOnChain,
        tokenType: plan.token_type,
        tokenCategory: plan.token_category,
      },
      transaction: {
        inputs: fundingTx.inputs,
        outputs: fundingTx.outputs,
        fee: fundingTx.fee,
      },
      wcTransaction: serializeWcTransaction(fundingTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`GET /budget-plans/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/budget-plans/:id/confirm-funding
 * Confirm budget contract funding
 */
router.post('/budget-plans/:id/confirm-funding', async (req, res) => {
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

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    const fundingAmountOnChain = displayAmountToOnChain(plan.total_amount, plan.token_type);
    const isTokenBudget = isFungibleTokenType(plan.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'budget',
      isTokenBudget ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(fundingAmountOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: plan.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenBudget && plan.token_category
          ? {
              tokenCategory: plan.token_category,
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

    // Update plan with tx_hash and set status to ACTIVE
    await db!.prepare(`
      UPDATE budget_plans
      SET tx_hash = ?, status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);

    res.json({
      success: true,
      message: 'Budget funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/confirm-funding error:`, error);
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
 * POST /api/budget-plans/:id/release
 * Build transaction to release milestone funds
 */
router.post('/budget-plans/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientAddress, signerAddress } = req.body;

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    if (plan.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Budget plan is not active' });
    }
    if (!plan.contract_address || !plan.constructor_params) {
      return res.status(400).json({
        error: 'Budget plan contract is not fully configured',
        message: 'This budget plan has no deployable on-chain contract state.',
      });
    }

    if (!recipientAddress || recipientAddress.toLowerCase() !== plan.recipient.toLowerCase()) {
      return res.status(403).json({ error: 'Only the recipient can release milestone funds' });
    }

    const constructorParams = JSON.parse(plan.constructor_params || '[]');
    const stepInterval = Number(constructorParams[7]?.value || 0);
    const stepAmount = Number(constructorParams[8]?.value || 0);
    const startTime = Number(constructorParams[4]?.value || 0);
    const now = Math.floor(Date.now() / 1000);
    const totalAmountOnChain = displayAmountToOnChain(plan.total_amount, plan.token_type);
    const releasedAmountOnChain = displayAmountToOnChain(plan.released_amount || 0, plan.token_type);
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(plan.contract_address)
      || plan.nft_commitment
      || '00';

    // Build release transaction
    const releaseService = new BudgetReleaseService('chipnet');
    const releaseTx = await releaseService.buildReleaseTransaction({
      budgetId: plan.id,
      contractAddress: plan.contract_address,
      recipient: plan.recipient,
      stepInterval,
      stepAmount,
      totalAmount: totalAmountOnChain,
      totalReleased: releasedAmountOnChain,
      lastReleaseTime: startTime,
      currentTime: now,
      tokenType: normalizeBudgetTokenType(plan.token_type),
      tokenCategory: plan.token_category,
      feePayerAddress: signerAddress || recipientAddress,
      constructorParams: constructorParams.map((p: any) => {
        if (p.type === 'bytes') return Buffer.from(p.value, 'hex');
        if (p.type === 'bigint') return BigInt(p.value);
        return p.value;
      }),
      currentCommitment,
    });

    const releasableAmount = onChainAmountToDisplay(releaseTx.releasableAmount, plan.token_type);

    res.json({
      success: true,
      releasableAmount,
      milestonesReleasable: releaseTx.milestonesReleasable,
      inputs: releaseTx.inputs,
      outputs: releaseTx.outputs,
      fee: releaseTx.fee,
      newCommitment: releaseTx.newCommitment,
      requiredSignature: releaseTx.requiredSignature,
      wcTransaction: serializeWcTransaction(releaseTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/release error:`, error);
    res.status(500).json({ error: 'Failed to build release transaction', message: error.message });
  }
});

/**
 * POST /api/budget-plans/:id/confirm-release
 * Confirm milestone release
 */
router.post('/budget-plans/:id/confirm-release', async (req, res) => {
  try {
    const { id } = req.params;
    const { releasedAmount, txHash } = req.body;

    if (!releasedAmount || !txHash) {
      return res.status(400).json({ error: 'Released amount and transaction hash are required' });
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

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    const releasedAmountOnChain = displayAmountToOnChain(Number(releasedAmount), plan.token_type);
    const isTokenBudget = isFungibleTokenType(plan.token_type);

    const expectedReleaseOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: plan.recipient,
        minimumSatoshis: BigInt(
          isTokenBudget
            ? 546
            : Math.max(546, releasedAmountOnChain),
        ),
        ...(isTokenBudget && plan.token_category
          ? {
              tokenCategory: plan.token_category,
              minimumTokenAmount: BigInt(Math.max(0, Math.trunc(releasedAmountOnChain))),
            }
          : {}),
      },
      'chipnet',
    );

    if (!expectedReleaseOutput) {
      return res.status(400).json({
        error: 'Release transaction does not include the expected recipient output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const newReleasedAmount = (plan.released_amount || 0) + Number(releasedAmount);
    const newMilestoneIndex = plan.current_milestone + 1;

    // Update plan statistics
    await db!.prepare(`
      UPDATE budget_plans
      SET released_amount = ?, current_milestone = ?, updated_at = ?
      WHERE id = ?
    `).run(newReleasedAmount, newMilestoneIndex, now, id);

    // Record release
    await db!.prepare(`
      INSERT INTO budget_releases (id, budget_id, milestone_index, amount, released_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, newMilestoneIndex, Number(releasedAmount), now, txHash);

    res.json({
      success: true,
      message: 'Milestone release confirmed',
      txHash,
      totalReleased: newReleasedAmount,
      currentMilestone: newMilestoneIndex,
      status: String(plan.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/confirm-release error:`, error);
    res.status(500).json({
      error: 'Failed to confirm release',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

// Get all budget plans for a vault
router.get('/vaults/:vaultId/budget-plans', async (req, res) => {
  try {
    const { vaultId } = req.params;
    const rows = await db!.prepare('SELECT * FROM budget_plans WHERE vault_id = ? ORDER BY created_at DESC').all(vaultId) as any[];
    res.json(rows.map(mapBudgetPlanRow));
  } catch (error: any) {
    console.error('Error fetching budget plans:', error);
    res.status(500).json({ error: 'Failed to fetch budget plans' });
  }
});

// Get all budget plans (across all vaults)
router.get('/budget-plans', async (req, res) => {
  try {
    const rows = await db!.prepare('SELECT * FROM budget_plans ORDER BY created_at DESC').all() as any[];
    res.json(rows.map(mapBudgetPlanRow));
  } catch (error: any) {
    console.error('Error fetching budget plans:', error);
    res.status(500).json({ error: 'Failed to fetch budget plans' });
  }
});

// Get a specific budget plan with milestones
router.get('/budget-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    const milestones = await db!.prepare('SELECT * FROM budget_milestones WHERE budget_id = ? ORDER BY milestone_index').all(id);
    const releases = await db!.prepare('SELECT * FROM budget_releases WHERE budget_id = ? ORDER BY released_at DESC').all(id);

    res.json({ plan: mapBudgetPlanRow(row), milestones, releases });
  } catch (error: any) {
    console.error('Error fetching budget plan:', error);
    res.status(500).json({ error: 'Failed to fetch budget plan' });
  }
});

// Pause budget plan
router.post('/budget-plans/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    const signerAddress = String(req.headers['x-user-address'] || req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }
    if (plan.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active budget plans can be paused' });
    }
    if (!plan.contract_address || !plan.constructor_params) {
      return res.status(400).json({ error: 'Budget plan contract is not fully configured' });
    }

    const constructorParams = deserializeConstructorParams(plan.constructor_params);
    const senderHash = readBytes20(constructorParams[1], 'senderHash');
    const controllerAddress = hashToP2pkhAddress(senderHash);
    if (controllerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Only the budget controller address can pause this plan',
        controllerAddress,
      });
    }

    const controlService = new BudgetControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(plan.contract_address)
      || plan.nft_commitment
      || '00'.repeat(40);
    const built = await controlService.buildPauseTransaction({
      contractAddress: plan.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      controllerAddress,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

// Confirm budget pause
router.post('/budget-plans/:id/confirm-pause', async (req, res) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = String(req.headers['x-user-address'] || req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
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

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    const constructorParams = deserializeConstructorParams(plan.constructor_params || '[]');
    const senderHash = readBytes20(constructorParams[1], 'senderHash');
    const controllerAddress = hashToP2pkhAddress(senderHash);
    if (controllerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Only the budget controller address can confirm pause',
        controllerAddress,
      });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: plan.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 35,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Pause transaction does not include expected budget covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE budget_plans SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/confirm-pause error:`, error);
    res.status(500).json({
      error: 'Failed to confirm pause',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

// Cancel budget plan
router.post('/budget-plans/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const signerAddress = String(req.headers['x-user-address'] || req.body?.signerAddress || '').trim();
    const allowUnsafeRecovery = req.body?.allowUnsafeRecovery === true;
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }
    if (plan.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Budget plan is already cancelled' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(plan.status))) {
      return res.status(400).json({ error: 'Only active or paused budget plans can be cancelled' });
    }
    if (!plan.contract_address || !plan.constructor_params) {
      return res.status(400).json({ error: 'Budget plan contract is not fully configured' });
    }

    const constructorParams = deserializeConstructorParams(plan.constructor_params);
    const senderHash = readBytes20(constructorParams[1], 'senderHash');
    const controllerAddress = hashToP2pkhAddress(senderHash);
    if (controllerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Only the budget controller address can cancel this plan',
        controllerAddress,
      });
    }

    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(plan.contract_address)
      || plan.nft_commitment
      || '00'.repeat(40);
    const cancelService = new StreamCancelService('chipnet');
    const cancelTx = await cancelService.buildCancelTransaction({
      streamType: 'STEP',
      contractAddress: plan.contract_address,
      sender: controllerAddress,
      recipient: plan.recipient,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeBudgetTokenType(plan.token_type),
      tokenCategory: plan.token_category || undefined,
      constructorParams,
      currentCommitment,
    });

    if (!allowUnsafeRecovery && cancelTx.cancelReturnAddress.toLowerCase() !== controllerAddress.toLowerCase()) {
      return res.status(409).json({
        error: 'Unsafe cancel destination',
        message:
          'The budget sender hash resolves to a different return address than the signer wallet. ' +
          'Cancel is blocked to avoid stranded funds.',
        signerAddress,
        cancelReturnAddress: cancelTx.cancelReturnAddress,
        controllerAddress,
      });
    }

    res.json({
      success: true,
      message: 'Cancel transaction ready',
      vestedAmount: cancelTx.vestedAmount,
      unvestedAmount: cancelTx.unvestedAmount,
      cancelReturnAddress: cancelTx.cancelReturnAddress,
      controllerAddress,
      wcTransaction: serializeWcTransaction(cancelTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

// Confirm budget cancel
router.post('/budget-plans/:id/confirm-cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = String(req.headers['x-user-address'] || req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
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

    const plan = await db!.prepare('SELECT * FROM budget_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Budget plan not found' });
    }

    const constructorParams = deserializeConstructorParams(plan.constructor_params || '[]');
    const senderHash = readBytes20(constructorParams[1], 'senderHash');
    const controllerAddress = hashToP2pkhAddress(senderHash);
    if (controllerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({
        error: 'Only the budget controller address can confirm cancellation',
        controllerAddress,
      });
    }

    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: plan.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 20,
      },
      'chipnet',
    );
    if (hasStateOutput) {
      return res.status(400).json({
        error: 'Cancel transaction still includes budget covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE budget_plans SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);

    res.json({ success: true, txHash, status: 'CANCELLED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /budget-plans/${req.params.id}/confirm-cancel error:`, error);
    res.status(500).json({
      error: 'Failed to confirm cancel',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

function normalizeBudgetTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function mapBudgetPlanRow(row: any) {
  const constructorParams = JSON.parse(row.constructor_params || '[]');
  const stepInterval = Number(constructorParams[7]?.value || 0);
  const stepAmountOnChain = Number(constructorParams[8]?.value || 0);
  const amountPerInterval = onChainAmountToDisplay(stepAmountOnChain, row.token_type);
  const controllerAddress = (() => {
    try {
      const rawHash = constructorParams[1]?.value;
      if (typeof rawHash !== 'string') return null;
      return hashToP2pkhAddress(hexToBin(rawHash));
    } catch {
      return null;
    }
  })();

  return {
    ...row,
    vaultId: row.vault_id,
    recipientLabel: row.recipient_name,
    controllerAddress,
    planType: row.total_milestones > 1 ? 'STEP_VESTING' : 'RECURRING',
    intervalSeconds: stepInterval,
    amountPerInterval,
    totalReleased: row.released_amount,
    totalAmount: row.total_amount,
  };
}

export default router;

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
