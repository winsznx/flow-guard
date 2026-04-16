/**
 * Grants API Endpoints
 * Handles grant programs with milestone-based releases and recipient transfers
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import db from '../database/schema.js';
import { GrantDeploymentService } from '../services/GrantDeploymentService.js';
import { GrantFundingService } from '../services/GrantFundingService.js';
import { GrantMilestoneService } from '../services/GrantMilestoneService.js';
import { GrantControlService } from '../services/GrantControlService.js';
import { ContractService } from '../services/contract-service.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
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
import { encryptPrivateKey, decryptPrivateKey } from '../utils/keyEncryption.js';

const router = Router();

/**
 * GET /api/grants
 * List grant programs created by address
 */
router.get('/grants', async (req: Request, res: Response) => {
  try {
    const { creator } = req.query;

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }

    const rows = await db!.prepare('SELECT * FROM grants WHERE creator = ? ORDER BY created_at DESC').all(creator);
    const grants = await attachLatestGrantEvents(rows);

    res.json({
      success: true,
      grants,
      total: grants.length,
    });
  } catch (error: any) {
    console.error('GET /grants error:', error);
    res.status(500).json({ error: 'Failed to fetch grants', message: error.message });
  }
});

/**
 * GET /api/grants/:id
 * Get grant details with milestones
 */
router.get('/grants/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    const milestones = await db!.prepare('SELECT * FROM grant_milestones WHERE grant_id = ? ORDER BY milestone_index ASC').all(id);
    const storedEvents = await listActivityEvents('grant' as any, id, 200);
    const events = storedEvents.length > 0
      ? storedEvents
      : buildFallbackGrantEvents(grant, milestones);

    res.json({
      success: true,
      grant,
      milestones,
      events,
    });
  } catch (error: any) {
    console.error(`GET /grants/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch grant', message: error.message });
  }
});

/**
 * POST /api/grants/create
 * Create a new grant program with milestones
 */
router.post('/grants/create', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      vaultId,
      creator,
      recipient,
      milestonesTotal,
      amountPerMilestone,
      totalAmount,
      tokenType,
      tokenCategory,
      cancelable,
      transferable,
      milestones,
    } = req.body;
    const normalizedTokenType = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient address is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!milestonesTotal || milestonesTotal < 1 || milestonesTotal > 255) {
      return res.status(400).json({ error: 'milestonesTotal must be between 1 and 255' });
    }
    if (!amountPerMilestone || amountPerMilestone <= 0) {
      return res.status(400).json({ error: 'Amount per milestone must be greater than 0' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }
    if (!Array.isArray(milestones) || milestones.length === 0) {
      return res.status(400).json({ error: 'Milestones array is required and must not be empty' });
    }

    const amountPerMilestoneOnChain = displayAmountToOnChain(Number(amountPerMilestone), normalizedTokenType);
    if (amountPerMilestoneOnChain <= 0) {
      return res.status(400).json({
        error: 'Amount per milestone is below on-chain minimum precision',
        message: normalizedTokenType === 'BCH'
          ? 'Use at least 1 satoshi per milestone'
          : 'Use at least 1 token base unit per milestone',
      });
    }
    const normalizedAmountPerMilestone = onChainAmountToDisplay(amountPerMilestoneOnChain, normalizedTokenType);

    const totalAmountOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType);
    const normalizedTotalAmount = onChainAmountToDisplay(totalAmountOnChain, normalizedTokenType);
    const normalizedMilestonesTotal = Number(milestonesTotal);

    const id = randomUUID();
    const countRow = await db!.prepare('SELECT COUNT(*) as cnt FROM grants').get() as any;
    const grantNumber = `#FG-GRANT-${String((countRow?.cnt ?? 0) + 1).padStart(3, '0')}`;
    const now = Math.floor(Date.now() / 1000);

    const deploymentService = new GrantDeploymentService('chipnet');

    let actualVaultId = deriveStandaloneVaultId(`${id}:${creator}:${now}`);
    if (vaultId) {
      const vaultRow = await db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
      if (vaultRow?.constructor_params) {
        const vaultParams = JSON.parse(vaultRow.constructor_params);
        if (vaultParams[0]?.type === 'bytes') {
          actualVaultId = vaultParams[0].value;
        }
      }
    }

    const deployment = await deploymentService.deployGrant({
      vaultId: actualVaultId,
      authorityAddress: creator,
      recipientAddress: recipient,
      milestonesTotal: normalizedMilestonesTotal,
      amountPerMilestone: normalizedAmountPerMilestone,
      totalAmount: normalizedTotalAmount,
      cancelable: cancelable !== false,
      transferable: transferable === true,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    await db!.prepare(`
      INSERT INTO grants (id, grant_number, vault_id, creator, recipient, title, description,
        token_type, token_category, milestones_total, amount_per_milestone, total_amount,
        milestones_completed, total_released, cancelable, transferable,
        status, contract_address, constructor_params, nft_commitment, nft_capability,
        authority_privkey, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, grantNumber, vaultId || null, creator, recipient, title, description || null,
      normalizedTokenType, tokenCategory || null,
      normalizedMilestonesTotal, normalizedAmountPerMilestone, normalizedTotalAmount,
      cancelable !== false ? 1 : 0, transferable === true ? 1 : 0,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable',
      encryptPrivateKey(deployment.authorityPrivKey),
      now, now,
    );

    const insertMilestone = db!.prepare(`
      INSERT INTO grant_milestones (id, grant_id, milestone_index, title, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
    `);
    for (let i = 0; i < milestones.length; i++) {
      const ms = milestones[i];
      await insertMilestone.run(randomUUID(), id, i + 1, ms.title || `Milestone ${i + 1}`, ms.description || null, now);
    }

    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'created',
      actor: creator,
      amount: normalizedTotalAmount,
      status: 'PENDING',
      details: {
        grantNumber,
        recipient,
        milestonesTotal: normalizedMilestonesTotal,
        amountPerMilestone: normalizedAmountPerMilestone,
      },
      createdAt: now,
    });

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id);
    const createdMilestones = await db!.prepare('SELECT * FROM grant_milestones WHERE grant_id = ? ORDER BY milestone_index ASC').all(id);

    res.json({
      success: true,
      message: 'Grant contract deployed - awaiting funding transaction',
      grant,
      milestones: createdMilestones,
      deployment: {
        contractAddress: deployment.contractAddress,
        grantNumber,
        onChainCampaignId: deployment.campaignId,
        fundingRequired: deployment.fundingTxRequired,
        nftCommitment: deployment.initialCommitment,
      },
    });
  } catch (error: any) {
    console.error('POST /grants/create error:', error);
    res.status(500).json({ error: 'Failed to create grant', message: error.message });
  }
});

/**
 * GET /api/grants/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/grants/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    if (!grant.contract_address) {
      return res.status(400).json({ error: 'Grant contract not deployed' });
    }

    const totalAmountOnChain = displayAmountToOnChain(grant.total_amount, grant.token_type);
    const nftCommitment = grant.nft_commitment || '';

    const fundingService = new GrantFundingService('chipnet');

    try {
      const fundingTx = await fundingService.buildFundingTransaction({
        contractAddress: grant.contract_address,
        creatorAddress: grant.creator,
        totalAmount: totalAmountOnChain,
        tokenType: normalizeGrantTokenType(grant.token_type),
        tokenCategory: grant.token_category,
        nftCommitment,
        nftCapability: 'mutable',
      });

      res.json({
        success: true,
        fundingInfo: {
          contractAddress: grant.contract_address,
          totalAmount: grant.total_amount,
          onChainAmount: totalAmountOnChain,
          tokenType: grant.token_type,
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
        const prepResult = await checkAndPrepareGenesisUtxo(provider, grant.creator);
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
    console.error(`GET /grants/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/grants/:id/confirm-funding
 * Confirm grant contract funding
 */
router.post('/grants/:id/confirm-funding', async (req: Request, res: Response) => {
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

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    const totalAmountOnChain = displayAmountToOnChain(grant.total_amount, grant.token_type);
    const isTokenGrant = isFungibleTokenType(grant.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'airdrop',
      isTokenGrant ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(totalAmountOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: grant.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenGrant && grant.token_category
          ? {
            tokenCategory: grant.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(totalAmountOnChain))),
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

    await db!.prepare(`
      UPDATE grants
      SET tx_hash = ?, status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);
    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'funded',
      actor: grant.creator,
      amount: grant.total_amount,
      status: 'ACTIVE',
      txHash,
      details: {
        contractAddress: grant.contract_address,
        tokenType: grant.token_type,
        tokenCategory: grant.token_category || null,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Grant funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/confirm-funding error:`, error);
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
 * POST /api/grants/:id/release
 * Build milestone release transaction (authority releases payment to recipient)
 */
router.post('/grants/:id/release', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    if (grant.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Grant is not active' });
    }
    if (!grant.contract_address || !grant.constructor_params) {
      return res.status(400).json({
        error: 'Grant contract is not fully configured',
        message: 'This grant cannot process releases until a valid contract deployment is recorded.',
      });
    }

    if (signerAddress && String(grant.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the grant creator can authorize milestone releases' });
    }

    const constructorParams = deserializeConstructorParams(grant.constructor_params || '[]');
    const milestonesTotal = readBigIntParam(constructorParams[2], 'milestonesTotal');

    if (BigInt(grant.milestones_completed || 0) >= milestonesTotal) {
      return res.status(400).json({ error: 'All milestones have already been released' });
    }

    const now = Math.floor(Date.now() / 1000);

    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(grant.contract_address)
      || grant.nft_commitment
      || '00'.repeat(40);

    const milestoneService = new GrantMilestoneService('chipnet');
    const releaseTx = await milestoneService.buildReleaseTransaction({
      grantId: grant.grant_number,
      contractAddress: grant.contract_address,
      recipientAddress: grant.recipient,
      signer: signerAddress || grant.creator,
      tokenType: normalizeGrantTokenType(grant.token_type),
      tokenCategory: grant.token_category,
      constructorParams,
      currentCommitment,
      currentTime: now,
      authorityPrivKey: decryptPrivateKey(grant.authority_privkey),
    });

    const releaseDisplayAmount = onChainAmountToDisplay(releaseTx.releaseAmount, grant.token_type);

    res.json({
      success: true,
      releaseAmount: releaseDisplayAmount,
      milestoneNumber: releaseTx.milestoneNumber,
      wcTransaction: serializeWcTransaction(releaseTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/release error:`, error);
    res.status(500).json({ error: 'Failed to build release transaction', message: error.message });
  }
});

/**
 * POST /api/grants/:id/confirm-release
 * Confirm milestone release and update grant + milestone status
 */
router.post('/grants/:id/confirm-release', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, milestoneNumber, txHash } = req.body;

    if (!amount || !txHash) {
      return res.status(400).json({ error: 'Amount and transaction hash are required' });
    }
    if (!milestoneNumber) {
      return res.status(400).json({ error: 'Milestone number is required' });
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

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    const releaseAmountNumber = Number(amount);
    const releaseAmountOnChain = displayAmountToOnChain(releaseAmountNumber, grant.token_type);
    const isTokenGrant = isFungibleTokenType(grant.token_type);

    const expectedReleaseOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: grant.recipient,
        minimumSatoshis: BigInt(isTokenGrant ? 546 : Math.max(546, releaseAmountOnChain)),
        ...(isTokenGrant && grant.token_category
          ? {
            tokenCategory: grant.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(releaseAmountOnChain))),
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
    const milestoneIndex = Number(milestoneNumber);

    await db!.prepare(`
      UPDATE grants
      SET milestones_completed = milestones_completed + 1,
          total_released = total_released + ?,
          updated_at = ?
      WHERE id = ?
    `).run(releaseAmountNumber, now, id);

    await db!.prepare(`
      UPDATE grant_milestones
      SET status = 'RELEASED', tx_hash = ?, released_at = ?
      WHERE grant_id = ? AND milestone_index = ?
    `).run(txHash, now, id, milestoneIndex);

    const updatedGrant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (updatedGrant && updatedGrant.milestones_completed >= updatedGrant.milestones_total) {
      await db!.prepare('UPDATE grants SET status = ?, updated_at = ? WHERE id = ?')
        .run('COMPLETED', now, id);
    }

    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'milestone_released',
      actor: grant.creator,
      amount: releaseAmountNumber,
      txHash,
      status: String(updatedGrant?.status || grant.status || 'ACTIVE'),
      details: {
        milestoneNumber: milestoneIndex,
        milestonesCompleted: updatedGrant?.milestones_completed ?? milestoneIndex,
        milestonesTotal: grant.milestones_total,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Milestone release confirmed',
      txHash,
      milestoneNumber: milestoneIndex,
      status: String(updatedGrant?.status || grant.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/confirm-release error:`, error);
    res.status(500).json({
      error: 'Failed to confirm release',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/grants/:id/pause
 * Build on-chain pause transaction for a grant
 */
router.post('/grants/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (grant.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active grants can be paused' });
    }
    if (String(grant.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the grant creator can pause this grant' });
    }
    if (!grant.contract_address || !grant.constructor_params) {
      return res.status(400).json({ error: 'Grant contract is not fully configured' });
    }

    const controlService = new GrantControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(grant.contract_address)
      || grant.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(grant.constructor_params);
    const built = await controlService.buildPauseTransaction({
      contractAddress: grant.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeGrantTokenType(grant.token_type),
      feePayerAddress: signerAddress,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/grants/:id/confirm-pause
 * Confirm on-chain pause transaction and update DB state
 */
router.post('/grants/:id/confirm-pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
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

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (String(grant.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the grant creator can confirm pause' });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: grant.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 35,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Pause transaction does not include expected grant covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE grants SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);
    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'paused',
      actor: signerAddress,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/confirm-pause error:`, error);
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
 * POST /api/grants/:id/cancel
 * Build on-chain cancel transaction for a grant
 */
router.post('/grants/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (grant.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Grant is already cancelled' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(grant.status))) {
      return res.status(400).json({ error: 'Only active or paused grants can be cancelled' });
    }
    if (String(grant.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the grant creator can cancel this grant' });
    }
    if (!grant.contract_address || !grant.constructor_params) {
      return res.status(400).json({ error: 'Grant contract is not fully configured' });
    }

    const controlService = new GrantControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(grant.contract_address)
      || grant.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(grant.constructor_params);
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const built = await controlService.buildCancelTransaction({
      contractAddress: grant.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeGrantTokenType(grant.token_type),
      feePayerAddress: signerAddress,
    });

    const signerMatchesReturn = authorityReturnAddress.toLowerCase() === signerAddress.toLowerCase();
    const warning = signerMatchesReturn
      ? undefined
      : 'Cancel refunds are enforced to authority hash in the contract constructor. ' +
      'If this address is wrong, redeploy grant with the correct creator authority address.';

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      cancelReturnAddress: built.cancelReturnAddress,
      authorityReturnAddress,
      signerMatchesReturn,
      remainingAmount: built.remainingAmount?.toString() || '0',
      ...(warning ? { warning } : {}),
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

/**
 * POST /api/grants/:id/confirm-cancel
 * Confirm on-chain cancel transaction and update DB state
 */
router.post('/grants/:id/confirm-cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
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

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (String(grant.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the grant creator can confirm cancellation' });
    }

    const constructorParams = deserializeConstructorParams(grant.constructor_params || '[]');
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const isTokenGrant = isFungibleTokenType(grant.token_type);
    const hasExpectedRefund = await transactionHasExpectedOutput(
      txHash,
      {
        address: authorityReturnAddress,
        minimumSatoshis: 546n,
        ...(isTokenGrant && grant.token_category
          ? {
            tokenCategory: grant.token_category,
            minimumTokenAmount: 1n,
          }
          : {}),
      },
      'chipnet',
    );
    if (!hasExpectedRefund) {
      return res.status(400).json({
        error: 'Cancel transaction does not include expected authority refund output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE grants SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);
    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'cancelled',
      actor: signerAddress,
      status: 'CANCELLED',
      txHash,
      details: {
        authorityReturnAddress,
      },
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'CANCELLED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/confirm-cancel error:`, error);
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
 * POST /api/grants/:id/transfer
 * Build transfer transaction (recipient transfers grant to new recipient)
 */
router.post('/grants/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newRecipientAddress } = req.body;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!newRecipientAddress) {
      return res.status(400).json({ error: 'New recipient address is required' });
    }

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (grant.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active grants can be transferred' });
    }
    if (!grant.transferable) {
      return res.status(400).json({ error: 'Grant is not configured as transferable' });
    }
    if (String(grant.recipient).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the current recipient can transfer the grant' });
    }
    if (!grant.contract_address || !grant.constructor_params) {
      return res.status(400).json({ error: 'Grant contract is not fully configured' });
    }

    const controlService = new GrantControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(grant.contract_address)
      || grant.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(grant.constructor_params);
    const built = await controlService.buildTransferTransaction({
      contractAddress: grant.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeGrantTokenType(grant.token_type),
      feePayerAddress: signerAddress,
      newRecipientAddress,
    });

    res.json({
      success: true,
      newRecipientAddress,
      newRecipientHash: built.newRecipientHash,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/transfer error:`, error);
    res.status(500).json({ error: 'Failed to build transfer transaction', message: error.message });
  }
});

/**
 * POST /api/grants/:id/confirm-transfer
 * Confirm on-chain transfer and update recipient in DB
 */
router.post('/grants/:id/confirm-transfer', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash, newRecipientAddress } = req.body;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!newRecipientAddress) {
      return res.status(400).json({ error: 'New recipient address is required' });
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

    const grant = await db!.prepare('SELECT * FROM grants WHERE id = ?').get(id) as any;
    if (!grant) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    if (String(grant.recipient).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the current recipient can confirm transfer' });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: grant.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 35,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Transfer transaction does not include expected grant covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const previousRecipient = grant.recipient;
    await db!.prepare('UPDATE grants SET recipient = ?, updated_at = ? WHERE id = ?')
      .run(newRecipientAddress, now, id);
    await recordActivityEvent({
      entityType: 'grant' as any,
      entityId: id,
      eventType: 'transferred',
      actor: signerAddress,
      status: grant.status,
      txHash,
      details: {
        previousRecipient,
        newRecipient: newRecipientAddress,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      txHash,
      previousRecipient,
      newRecipient: newRecipientAddress,
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /grants/${req.params.id}/confirm-transfer error:`, error);
    res.status(500).json({
      error: 'Failed to confirm transfer',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

export default router;

function normalizeGrantTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function buildFallbackGrantEvents(grant: any, milestones: any[]): Array<{
  id: string;
  entity_type: string;
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
    entity_type: string;
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
    id: `fallback-grant-created-${grant.id}`,
    entity_type: 'grant',
    entity_id: grant.id,
    event_type: 'created',
    actor: grant.creator || null,
    amount: typeof grant.total_amount === 'number' ? grant.total_amount : null,
    status: grant.status || null,
    tx_hash: null,
    details: null,
    created_at: Number(grant.created_at || Math.floor(Date.now() / 1000)),
  });

  if (grant.tx_hash) {
    events.push({
      id: `fallback-grant-funded-${grant.id}`,
      entity_type: 'grant',
      entity_id: grant.id,
      event_type: 'funded',
      actor: grant.creator || null,
      amount: typeof grant.total_amount === 'number' ? grant.total_amount : null,
      status: 'ACTIVE',
      tx_hash: grant.tx_hash,
      details: null,
      created_at: Number(grant.updated_at || grant.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (grant.status === 'PAUSED') {
    events.push({
      id: `fallback-grant-paused-${grant.id}`,
      entity_type: 'grant',
      entity_id: grant.id,
      event_type: 'paused',
      actor: grant.creator || null,
      amount: null,
      status: 'PAUSED',
      tx_hash: null,
      details: null,
      created_at: Number(grant.updated_at || grant.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (grant.status === 'CANCELLED') {
    events.push({
      id: `fallback-grant-cancelled-${grant.id}`,
      entity_type: 'grant',
      entity_id: grant.id,
      event_type: 'cancelled',
      actor: grant.creator || null,
      amount: null,
      status: 'CANCELLED',
      tx_hash: null,
      details: null,
      created_at: Number(grant.updated_at || grant.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  milestones
    .filter((ms: any) => ms.status === 'RELEASED')
    .forEach((ms: any) => {
      events.push({
        id: `fallback-grant-release-${ms.id}`,
        entity_type: 'grant',
        entity_id: grant.id,
        event_type: 'milestone_released',
        actor: grant.creator || null,
        amount: typeof grant.amount_per_milestone === 'number' ? grant.amount_per_milestone : null,
        status: grant.status || null,
        tx_hash: ms.tx_hash || null,
        details: null,
        created_at: Number(ms.released_at || grant.updated_at || Math.floor(Date.now() / 1000)),
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
    throw new Error(`Failed to encode authority P2PKH address: ${encoded}`);
  }
  return encoded.address;
}

function readBigIntParam(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  if (value instanceof Uint8Array) {
    if (value.length > 8) {
      throw new Error(`Invalid ${name}: byte length exceeds 8`);
    }
    let result = 0n;
    for (let i = value.length - 1; i >= 0; i--) {
      result = (result << 8n) + BigInt(value[i]);
    }
    return result;
  }
  throw new Error(`Invalid constructor parameter for ${name}`);
}

function deriveStandaloneVaultId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

async function attachLatestGrantEvents(grants: any[]): Promise<any[]> {
  if (!Array.isArray(grants) || grants.length === 0) {
    return grants;
  }
  const latestByGrantId = await getLatestActivityEvents(
    'grant' as any,
    grants.map((grant) => String(grant.id)),
  );
  return grants.map((grant) => ({
    ...grant,
    latest_event: latestByGrantId.get(String(grant.id)) || null,
  }));
}
