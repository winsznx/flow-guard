/**
 * Rewards API Endpoints
 * Handles reward distribution campaigns (achievement, referral, loyalty, custom)
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import db from '../database/schema.js';
import { RewardDeploymentService, type RewardCategory } from '../services/RewardDeploymentService.js';
import { RewardFundingService } from '../services/RewardFundingService.js';
import { RewardDistributionService } from '../services/RewardDistributionService.js';
import { RewardControlService } from '../services/RewardControlService.js';
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

const VALID_REWARD_CATEGORIES: RewardCategory[] = ['ACHIEVEMENT', 'REFERRAL', 'LOYALTY', 'CUSTOM'];

/**
 * GET /api/rewards
 * List reward campaigns created by address
 */
router.get('/rewards', async (req: Request, res: Response) => {
  try {
    const { creator } = req.query;

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }

    const rows = await db!.prepare('SELECT * FROM rewards WHERE creator = ? ORDER BY created_at DESC').all(creator);
    const campaigns = await attachLatestRewardEvents(rows);

    res.json({
      success: true,
      campaigns,
      total: campaigns.length,
    });
  } catch (error: any) {
    console.error('GET /rewards error:', error);
    res.status(500).json({ error: 'Failed to fetch reward campaigns', message: error.message });
  }
});

/**
 * GET /api/rewards/:id
 * Get reward campaign details with distribution history
 */
router.get('/rewards/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }

    const distributions = await db!.prepare('SELECT * FROM reward_distributions WHERE reward_id = ? ORDER BY distributed_at DESC').all(id);
    const storedEvents = await listActivityEvents('reward' as any, id, 200);
    const events = storedEvents.length > 0
      ? storedEvents
      : buildFallbackRewardEvents(campaign, distributions);

    res.json({
      success: true,
      campaign,
      distributions,
      events,
    });
  } catch (error: any) {
    console.error(`GET /rewards/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch reward campaign', message: error.message });
  }
});

/**
 * POST /api/rewards/create
 * Create a new reward campaign
 */
router.post('/rewards/create', async (req: Request, res: Response) => {
  try {
    const {
      creator,
      title,
      description,
      rewardCategory,
      tokenType,
      tokenCategory,
      totalPool,
      maxRewardAmount,
      startDate,
      endDate,
      vaultId,
    } = req.body;
    const normalizedTokenType = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';
    const normalizedCategory: RewardCategory = VALID_REWARD_CATEGORIES.includes(rewardCategory)
      ? rewardCategory
      : 'CUSTOM';

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!totalPool || totalPool <= 0) {
      return res.status(400).json({ error: 'Total pool must be greater than 0' });
    }
    if (!maxRewardAmount || maxRewardAmount <= 0) {
      return res.status(400).json({ error: 'Max reward amount must be greater than 0' });
    }
    const totalPoolOnChain = displayAmountToOnChain(Number(totalPool), normalizedTokenType);
    const maxRewardAmountOnChain = displayAmountToOnChain(Number(maxRewardAmount), normalizedTokenType);
    if (maxRewardAmountOnChain <= 0 || totalPoolOnChain <= 0) {
      return res.status(400).json({
        error: 'Amounts are below on-chain minimum precision',
        message: normalizedTokenType === 'BCH'
          ? 'Use at least 1 satoshi per reward and total pool'
          : 'Use at least 1 token base unit per reward and total pool',
      });
    }
    if (maxRewardAmountOnChain > totalPoolOnChain) {
      return res.status(400).json({ error: 'Max reward amount cannot exceed total pool' });
    }
    const normalizedTotalPool = onChainAmountToDisplay(totalPoolOnChain, normalizedTokenType);
    const normalizedMaxRewardAmount = onChainAmountToDisplay(maxRewardAmountOnChain, normalizedTokenType);

    const id = randomUUID();
    const countRow = await db!.prepare('SELECT COUNT(*) as cnt FROM rewards').get() as any;
    const campaignId = `#FG-REWARD-${String((countRow?.cnt ?? 0) + 1).padStart(3, '0')}`;
    const now = Math.floor(Date.now() / 1000);

    const deploymentService = new RewardDeploymentService('chipnet');

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

    const deployment = await deploymentService.deployReward({
      vaultId: actualVaultId,
      authorityAddress: creator,
      maxRewardAmount: normalizedMaxRewardAmount,
      totalPool: normalizedTotalPool,
      startTime: startDate || 0,
      endTime: endDate || 0,
      rewardCategory: normalizedCategory,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    await db!.prepare(`
      INSERT INTO rewards (id, campaign_id, vault_id, creator, title, description,
        reward_category, token_type, token_category, total_pool, max_reward_amount,
        distributed_count, distributed_total, status, start_date, end_date,
        contract_address, constructor_params, nft_commitment, nft_capability,
        authority_privkey, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, campaignId, vaultId || null, creator, title, description || null,
      normalizedCategory, normalizedTokenType, tokenCategory || null,
      normalizedTotalPool, normalizedMaxRewardAmount,
      startDate || now, endDate || null,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable',
      encryptPrivateKey(deployment.authorityPrivKey),
      now, now,
    );
    await recordActivityEvent({
      entityType: 'reward' as any,
      entityId: id,
      eventType: 'created',
      actor: creator,
      amount: normalizedTotalPool,
      status: 'PENDING',
      details: {
        campaignId,
        rewardCategory: normalizedCategory,
        maxRewardAmount: normalizedMaxRewardAmount,
        startDate: startDate || now,
        endDate: endDate || null,
      },
      createdAt: now,
    });

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Reward contract deployed - awaiting funding transaction',
      campaign,
      deployment: {
        contractAddress: deployment.contractAddress,
        campaignId,
        onChainCampaignId: deployment.campaignId,
        fundingRequired: deployment.fundingTxRequired,
        nftCommitment: deployment.initialCommitment,
      },
    });
  } catch (error: any) {
    console.error('POST /rewards/create error:', error);
    res.status(500).json({ error: 'Failed to create reward campaign', message: error.message });
  }
});

/**
 * GET /api/rewards/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/rewards/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }

    if (!campaign.contract_address) {
      return res.status(400).json({ error: 'Campaign contract not deployed' });
    }

    const fundingAmountOnChain = displayAmountToOnChain(campaign.total_pool, campaign.token_type);
    const nftCommitment = campaign.nft_commitment || '';

    const fundingService = new RewardFundingService('chipnet');

    try {
      const fundingTx = await fundingService.buildFundingTransaction({
        contractAddress: campaign.contract_address,
        creatorAddress: campaign.creator,
        totalPool: fundingAmountOnChain,
        tokenType: normalizeRewardTokenType(campaign.token_type),
        tokenCategory: campaign.token_category,
        nftCommitment,
        nftCapability: 'mutable',
      });

      res.json({
        success: true,
        fundingInfo: {
          contractAddress: campaign.contract_address,
          totalPool: campaign.total_pool,
          onChainAmount: fundingAmountOnChain,
          tokenType: campaign.token_type,
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
        const prepResult = await checkAndPrepareGenesisUtxo(provider, campaign.creator);
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
    console.error(`GET /rewards/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/rewards/:id/confirm-funding
 * Confirm reward contract funding
 */
router.post('/rewards/:id/confirm-funding', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }

    const fundingAmountOnChain = displayAmountToOnChain(campaign.total_pool, campaign.token_type);
    const isTokenReward = isFungibleTokenType(campaign.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'airdrop',
      isTokenReward ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(fundingAmountOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: campaign.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenReward && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
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

    await db!.prepare(`
      UPDATE rewards
      SET tx_hash = ?, status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);
    await recordActivityEvent({
      entityType: 'reward' as any,
      entityId: id,
      eventType: 'funded',
      actor: campaign.creator,
      amount: campaign.total_pool,
      status: 'ACTIVE',
      txHash,
      details: {
        contractAddress: campaign.contract_address,
        tokenType: campaign.token_type,
        tokenCategory: campaign.token_category || null,
      },
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Reward funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/confirm-funding error:`, error);
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
 * POST /api/rewards/:id/distribute
 * Build reward distribution transaction (variable amount per recipient)
 */
router.post('/rewards/:id/distribute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const recipientAddress = String(req.body?.recipientAddress || req.body?.recipient || '').trim();
    const rewardAmount = Number(req.body?.amount || req.body?.rewardAmount || 0);
    const signerAddress = String(
      req.body?.signerAddress
      || req.headers['x-user-address']
      || '',
    ).trim();

    if (!recipientAddress) {
      return res.status(400).json({ error: 'Recipient address is required' });
    }
    if (!rewardAmount || rewardAmount <= 0) {
      return res.status(400).json({ error: 'Reward amount must be greater than 0' });
    }

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }

    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Campaign is not active' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({
        error: 'Campaign contract is not fully configured',
        message: 'This campaign cannot distribute rewards until a valid contract deployment is recorded.',
      });
    }

    if (signerAddress && String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can distribute rewards' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const maxRewardAmountOnChain = readBigIntParam(constructorParams[2], 'maxRewardAmount');
    const rewardAmountOnChain = BigInt(displayAmountToOnChain(rewardAmount, campaign.token_type));

    if (rewardAmountOnChain > maxRewardAmountOnChain) {
      return res.status(400).json({
        error: 'Reward amount exceeds maximum reward amount',
        message: `Max: ${maxRewardAmountOnChain.toString()} on-chain units, requested: ${rewardAmountOnChain.toString()}`,
      });
    }

    const totalPool = readBigIntParam(constructorParams[3], 'totalPool');
    const distributedOnChain = BigInt(displayAmountToOnChain(campaign.distributed_total || 0, campaign.token_type));
    if (distributedOnChain + rewardAmountOnChain > totalPool) {
      return res.status(400).json({ error: 'Distribution would exceed remaining campaign pool' });
    }

    const now = Math.floor(Date.now() / 1000);

    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(campaign.contract_address)
      || campaign.nft_commitment
      || '00'.repeat(40);

    const distributionService = new RewardDistributionService('chipnet');
    const rewardAmountOnChainNumber = bigIntToSafeNumber(rewardAmountOnChain, 'rewardAmount');
    const distributionTx = await distributionService.buildDistributionTransaction({
      rewardId: campaign.campaign_id,
      contractAddress: campaign.contract_address,
      recipientAddress,
      signer: signerAddress || campaign.creator,
      rewardAmount: rewardAmountOnChainNumber,
      tokenType: normalizeRewardTokenType(campaign.token_type),
      tokenCategory: campaign.token_category,
      constructorParams,
      currentCommitment,
      currentTime: now,
      authorityPrivKey: decryptPrivateKey(campaign.authority_privkey),
    });

    const distributedDisplayAmount = onChainAmountToDisplay(distributionTx.rewardAmount, campaign.token_type);

    res.json({
      success: true,
      rewardAmount: distributedDisplayAmount,
      wcTransaction: serializeWcTransaction(distributionTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/distribute error:`, error);
    res.status(500).json({ error: 'Failed to build distribution transaction', message: error.message });
  }
});

/**
 * POST /api/rewards/:id/confirm-distribute
 * Confirm reward distribution
 */
router.post('/rewards/:id/confirm-distribute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientAddress, amount, txHash } = req.body;

    if (!recipientAddress) {
      return res.status(400).json({ error: 'Recipient address is required' });
    }
    if (!amount || !txHash) {
      return res.status(400).json({ error: 'Amount and transaction hash are required' });
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

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }

    const distributedAmountNumber = Number(amount);
    const distributedAmountOnChain = displayAmountToOnChain(distributedAmountNumber, campaign.token_type);
    const isTokenReward = isFungibleTokenType(campaign.token_type);

    const expectedDistributionOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: recipientAddress,
        minimumSatoshis: BigInt(isTokenReward ? 546 : Math.max(546, distributedAmountOnChain)),
        ...(isTokenReward && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(distributedAmountOnChain))),
          }
          : {}),
      },
      'chipnet',
    );

    if (!expectedDistributionOutput) {
      return res.status(400).json({
        error: 'Distribution transaction does not include the expected recipient output',
      });
    }

    const now = Math.floor(Date.now() / 1000);

    await db!.prepare(`
      INSERT INTO reward_distributions (id, reward_id, recipient, amount, reward_category, tx_hash, distributed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, recipientAddress, distributedAmountNumber, campaign.reward_category, txHash, now);

    await db!.prepare(`
      UPDATE rewards
      SET distributed_count = distributed_count + 1,
          distributed_total = distributed_total + ?,
          updated_at = ?
      WHERE id = ?
    `).run(distributedAmountNumber, now, id);
    await recordActivityEvent({
      entityType: 'reward' as any,
      entityId: id,
      eventType: 'distribution',
      actor: recipientAddress,
      amount: distributedAmountNumber,
      txHash,
      status: String(campaign.status || 'ACTIVE'),
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Distribution confirmed',
      txHash,
      status: String(campaign.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/confirm-distribute error:`, error);
    res.status(500).json({
      error: 'Failed to confirm distribution',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/rewards/:id/pause
 * Build on-chain pause transaction for a reward campaign
 */
router.post('/rewards/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }
    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active campaigns can be paused' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can pause this campaign' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({ error: 'Campaign contract is not fully configured' });
    }

    const controlService = new RewardControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(campaign.contract_address)
      || campaign.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(campaign.constructor_params);
    const built = await controlService.buildPauseTransaction({
      contractAddress: campaign.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeRewardTokenType(campaign.token_type),
      feePayerAddress: signerAddress,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/rewards/:id/confirm-pause
 * Confirm on-chain pause transaction and update DB state
 */
router.post('/rewards/:id/confirm-pause', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can confirm pause' });
    }

    const hasExpectedState = await transactionHasExpectedOutput(
      txHash,
      {
        address: campaign.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 35,
      },
      'chipnet',
    );
    if (!hasExpectedState) {
      return res.status(400).json({
        error: 'Pause transaction does not include expected campaign covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE rewards SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);
    await recordActivityEvent({
      entityType: 'reward' as any,
      entityId: id,
      eventType: 'paused',
      actor: signerAddress,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/confirm-pause error:`, error);
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
 * POST /api/rewards/:id/cancel
 * Build on-chain cancel transaction for a reward campaign
 */
router.post('/rewards/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }
    if (campaign.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Campaign is already cancelled' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(campaign.status))) {
      return res.status(400).json({ error: 'Only active or paused campaigns can be cancelled' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can cancel this campaign' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({ error: 'Campaign contract is not fully configured' });
    }

    const controlService = new RewardControlService('chipnet');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(campaign.contract_address)
      || campaign.nft_commitment
      || '';
    const constructorParams = deserializeConstructorParams(campaign.constructor_params);
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const built = await controlService.buildCancelTransaction({
      contractAddress: campaign.contract_address,
      constructorParams,
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: normalizeRewardTokenType(campaign.token_type),
      feePayerAddress: signerAddress,
    });

    const signerMatchesReturn = authorityReturnAddress.toLowerCase() === signerAddress.toLowerCase();
    const warning = signerMatchesReturn
      ? undefined
      : 'Cancel refunds are enforced to authority hash in the contract constructor. ' +
      'If this address is wrong, redeploy campaign with the correct creator authority address.';

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      cancelReturnAddress: built.cancelReturnAddress,
      authorityReturnAddress,
      signerMatchesReturn,
      remainingPool: built.remainingPool?.toString() || '0',
      ...(warning ? { warning } : {}),
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /rewards/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

/**
 * POST /api/rewards/:id/confirm-cancel
 * Confirm on-chain cancel transaction and update DB state
 */
router.post('/rewards/:id/confirm-cancel', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Reward campaign not found' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can confirm cancellation' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const isTokenReward = isFungibleTokenType(campaign.token_type);
    const hasExpectedRefund = await transactionHasExpectedOutput(
      txHash,
      {
        address: authorityReturnAddress,
        minimumSatoshis: 546n,
        ...(isTokenReward && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
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
    await db!.prepare('UPDATE rewards SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);
    await recordActivityEvent({
      entityType: 'reward' as any,
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
    console.error(`POST /rewards/${req.params.id}/confirm-cancel error:`, error);
    res.status(500).json({
      error: 'Failed to confirm cancel',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

export default router;

function normalizeRewardTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function buildFallbackRewardEvents(campaign: any, distributions: any[]): Array<{
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
    id: `fallback-reward-created-${campaign.id}`,
    entity_type: 'reward',
    entity_id: campaign.id,
    event_type: 'created',
    actor: campaign.creator || null,
    amount: typeof campaign.total_pool === 'number' ? campaign.total_pool : null,
    status: campaign.status || null,
    tx_hash: null,
    details: null,
    created_at: Number(campaign.created_at || Math.floor(Date.now() / 1000)),
  });

  if (campaign.tx_hash) {
    events.push({
      id: `fallback-reward-funded-${campaign.id}`,
      entity_type: 'reward',
      entity_id: campaign.id,
      event_type: 'funded',
      actor: campaign.creator || null,
      amount: typeof campaign.total_pool === 'number' ? campaign.total_pool : null,
      status: 'ACTIVE',
      tx_hash: campaign.tx_hash,
      details: null,
      created_at: Number(campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (campaign.status === 'PAUSED') {
    events.push({
      id: `fallback-reward-paused-${campaign.id}`,
      entity_type: 'reward',
      entity_id: campaign.id,
      event_type: 'paused',
      actor: campaign.creator || null,
      amount: null,
      status: 'PAUSED',
      tx_hash: null,
      details: null,
      created_at: Number(campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (campaign.status === 'CANCELLED') {
    events.push({
      id: `fallback-reward-cancelled-${campaign.id}`,
      entity_type: 'reward',
      entity_id: campaign.id,
      event_type: 'cancelled',
      actor: campaign.creator || null,
      amount: null,
      status: 'CANCELLED',
      tx_hash: null,
      details: null,
      created_at: Number(campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  distributions.forEach((dist: any) => {
    events.push({
      id: `fallback-reward-distribution-${dist.id}`,
      entity_type: 'reward',
      entity_id: campaign.id,
      event_type: 'distribution',
      actor: dist.recipient || null,
      amount: typeof dist.amount === 'number' ? dist.amount : null,
      status: campaign.status || null,
      tx_hash: dist.tx_hash || null,
      details: null,
      created_at: Number(dist.distributed_at || campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
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

function bigIntToSafeNumber(value: bigint, name: string): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max || value < -max) {
    throw new Error(`${name} exceeds JavaScript safe integer range`);
  }
  return Number(value);
}

function deriveStandaloneVaultId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

async function attachLatestRewardEvents(campaigns: any[]): Promise<any[]> {
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return campaigns;
  }
  const latestByCampaignId = await getLatestActivityEvents(
    'reward' as any,
    campaigns.map((campaign) => String(campaign.id)),
  );
  return campaigns.map((campaign) => ({
    ...campaign,
    latest_event: latestByCampaignId.get(String(campaign.id)) || null,
  }));
}
