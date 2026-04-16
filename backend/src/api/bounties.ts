/**
 * Bounties API Endpoints
 * Handles bounty campaigns with fixed per-winner prizes and proof-based claims
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import db from '../database/schema.js';
import { BountyDeploymentService } from '../services/BountyDeploymentService.js';
import { BountyFundingService } from '../services/BountyFundingService.js';
import { BountyClaimService } from '../services/BountyClaimService.js';
import { BountyControlService } from '../services/BountyControlService.js';
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
 * GET /api/bounties
 * List bounty campaigns created by address
 */
router.get('/bounties', async (req: Request, res: Response) => {
  try {
    const { creator } = req.query;

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }

    const rows = await db!.prepare('SELECT * FROM bounties WHERE creator = ? ORDER BY created_at DESC').all(creator);
    const campaigns = await attachLatestBountyEvents(rows);

    res.json({
      success: true,
      campaigns,
      total: campaigns.length,
    });
  } catch (error: any) {
    console.error('GET /bounties error:', error);
    res.status(500).json({ error: 'Failed to fetch bounty campaigns', message: error.message });
  }
});

/**
 * GET /api/bounties/:id
 * Get bounty campaign details with claim history
 */
router.get('/bounties/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }

    const claims = await db!.prepare('SELECT * FROM bounty_claims WHERE bounty_id = ? ORDER BY claimed_at DESC').all(id);
    const storedEvents = await listActivityEvents('bounty' as any, id, 200);
    const events = storedEvents.length > 0
      ? storedEvents
      : buildFallbackBountyEvents(campaign, claims);

    res.json({
      success: true,
      campaign,
      claims,
      events,
    });
  } catch (error: any) {
    console.error(`GET /bounties/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch bounty campaign', message: error.message });
  }
});

/**
 * POST /api/bounties/create
 * Create a new bounty campaign
 */
router.post('/bounties/create', async (req: Request, res: Response) => {
  try {
    const {
      creator,
      title,
      description,
      tokenType,
      tokenCategory,
      rewardPerWinner,
      maxWinners,
      startDate,
      endDate,
      vaultId,
    } = req.body;
    const normalizedTokenType = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!rewardPerWinner || rewardPerWinner <= 0) {
      return res.status(400).json({ error: 'Reward per winner must be greater than 0' });
    }
    if (!maxWinners || maxWinners <= 0 || !Number.isInteger(Number(maxWinners))) {
      return res.status(400).json({ error: 'Max winners must be a positive integer' });
    }
    const rewardPerWinnerOnChain = displayAmountToOnChain(Number(rewardPerWinner), normalizedTokenType);
    if (rewardPerWinnerOnChain <= 0) {
      return res.status(400).json({
        error: 'Reward per winner is below on-chain minimum precision',
        message: normalizedTokenType === 'BCH'
          ? 'Use at least 1 satoshi per reward'
          : 'Use at least 1 token base unit per reward',
      });
    }
    const normalizedRewardPerWinner = onChainAmountToDisplay(rewardPerWinnerOnChain, normalizedTokenType);
    const normalizedMaxWinners = Number(maxWinners);

    const id = randomUUID();
    const countRow = await db!.prepare('SELECT COUNT(*) as cnt FROM bounties').get() as any;
    const campaignId = `#FG-BOUNTY-${String((countRow?.cnt ?? 0) + 1).padStart(3, '0')}`;
    const now = Math.floor(Date.now() / 1000);

    const deploymentService = new BountyDeploymentService('chipnet');

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

    const deployment = await deploymentService.deployBounty({
      vaultId: actualVaultId,
      authorityAddress: creator,
      rewardPerWinner: normalizedRewardPerWinner,
      maxWinners: normalizedMaxWinners,
      startTime: startDate || 0,
      endTime: endDate || 0,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    await db!.prepare(`
      INSERT INTO bounties (id, campaign_id, vault_id, creator, title, description,
        token_type, token_category, reward_per_winner, max_winners,
        winners_count, total_paid, status, start_date, end_date,
        contract_address, constructor_params, nft_commitment, nft_capability,
        authority_privkey, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, campaignId, vaultId || null, creator, title, description || null,
      normalizedTokenType, tokenCategory || null,
      normalizedRewardPerWinner, normalizedMaxWinners,
      startDate || now, endDate || null,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable',
      encryptPrivateKey(deployment.authorityPrivKey),
      now, now,
    );
    await recordActivityEvent({
      entityType: 'bounty' as any,
      entityId: id,
      eventType: 'created',
      actor: creator,
      amount: normalizedRewardPerWinner * normalizedMaxWinners,
      status: 'PENDING',
      details: {
        campaignId,
        rewardPerWinner: normalizedRewardPerWinner,
        maxWinners: normalizedMaxWinners,
        startDate: startDate || now,
        endDate: endDate || null,
      },
      createdAt: now,
    });

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Bounty contract deployed - awaiting funding transaction',
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
    console.error('POST /bounties/create error:', error);
    res.status(500).json({ error: 'Failed to create bounty campaign', message: error.message });
  }
});

/**
 * GET /api/bounties/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/bounties/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }

    if (!campaign.contract_address) {
      return res.status(400).json({ error: 'Campaign contract not deployed' });
    }

    const totalPoolDisplay = campaign.reward_per_winner * campaign.max_winners;
    const totalPoolOnChain = displayAmountToOnChain(totalPoolDisplay, campaign.token_type);
    const nftCommitment = campaign.nft_commitment || '';

    const fundingService = new BountyFundingService('chipnet');

    try {
      const fundingTx = await fundingService.buildFundingTransaction({
        contractAddress: campaign.contract_address,
        creatorAddress: campaign.creator,
        totalPool: totalPoolOnChain,
        tokenType: normalizeBountyTokenType(campaign.token_type),
        tokenCategory: campaign.token_category,
        nftCommitment,
        nftCapability: 'mutable',
      });

      res.json({
        success: true,
        fundingInfo: {
          contractAddress: campaign.contract_address,
          totalPool: totalPoolDisplay,
          onChainAmount: totalPoolOnChain,
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
    console.error(`GET /bounties/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/bounties/:id/confirm-funding
 * Confirm bounty contract funding
 */
router.post('/bounties/:id/confirm-funding', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }

    const totalPoolDisplay = campaign.reward_per_winner * campaign.max_winners;
    const totalPoolOnChain = displayAmountToOnChain(totalPoolDisplay, campaign.token_type);
    const isTokenBounty = isFungibleTokenType(campaign.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'airdrop',
      isTokenBounty ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(totalPoolOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: campaign.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenBounty && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(totalPoolOnChain))),
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
      UPDATE bounties
      SET tx_hash = ?, status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);
    await recordActivityEvent({
      entityType: 'bounty' as any,
      entityId: id,
      eventType: 'funded',
      actor: campaign.creator,
      amount: totalPoolDisplay,
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
      message: 'Bounty funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /bounties/${req.params.id}/confirm-funding error:`, error);
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
 * POST /api/bounties/:id/claim
 * Build bounty claim transaction (fixed prize amount per winner)
 */
router.post('/bounties/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const winnerAddress = String(req.body?.winnerAddress || req.body?.winner || '').trim();
    const proofHash = String(req.body?.proofHash || '').trim();
    const signerAddress = String(
      req.body?.signerAddress
      || req.headers['x-user-address']
      || '',
    ).trim();

    if (!winnerAddress) {
      return res.status(400).json({ error: 'Winner address is required' });
    }
    if (!proofHash || proofHash.length !== 64) {
      return res.status(400).json({ error: 'proofHash must be a 32-byte hex string (64 characters)' });
    }

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }

    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Bounty is not active' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({
        error: 'Bounty contract is not fully configured',
        message: 'This bounty cannot process claims until a valid contract deployment is recorded.',
      });
    }

    if (signerAddress && String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the bounty creator can authorize claims' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const maxWinners = readBigIntParam(constructorParams[3], 'maxWinners');

    if (BigInt(campaign.winners_count || 0) >= maxWinners) {
      return res.status(400).json({ error: 'Bounty has reached maximum number of winners' });
    }

    const now = Math.floor(Date.now() / 1000);

    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(campaign.contract_address)
      || campaign.nft_commitment
      || '00'.repeat(40);

    const claimService = new BountyClaimService('chipnet');
    const claimTx = await claimService.buildClaimTransaction({
      bountyId: campaign.campaign_id,
      contractAddress: campaign.contract_address,
      winnerAddress,
      signer: signerAddress || campaign.creator,
      proofHash,
      tokenType: normalizeBountyTokenType(campaign.token_type),
      tokenCategory: campaign.token_category,
      constructorParams,
      currentCommitment,
      currentTime: now,
      authorityPrivKey: decryptPrivateKey(campaign.authority_privkey),
    });

    const claimDisplayAmount = onChainAmountToDisplay(claimTx.claimAmount, campaign.token_type);

    res.json({
      success: true,
      claimAmount: claimDisplayAmount,
      wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /bounties/${req.params.id}/claim error:`, error);
    res.status(500).json({ error: 'Failed to build claim transaction', message: error.message });
  }
});

/**
 * POST /api/bounties/:id/confirm-claim
 * Confirm bounty claim
 */
router.post('/bounties/:id/confirm-claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { winnerAddress, amount, proofHash, txHash } = req.body;

    if (!winnerAddress) {
      return res.status(400).json({ error: 'Winner address is required' });
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

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }

    const claimAmountNumber = Number(amount);
    const claimAmountOnChain = displayAmountToOnChain(claimAmountNumber, campaign.token_type);
    const isTokenBounty = isFungibleTokenType(campaign.token_type);

    const expectedClaimOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: winnerAddress,
        minimumSatoshis: BigInt(isTokenBounty ? 546 : Math.max(546, claimAmountOnChain)),
        ...(isTokenBounty && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(claimAmountOnChain))),
          }
          : {}),
      },
      'chipnet',
    );

    if (!expectedClaimOutput) {
      return res.status(400).json({
        error: 'Claim transaction does not include the expected winner output',
      });
    }

    const now = Math.floor(Date.now() / 1000);

    await db!.prepare(`
      INSERT INTO bounty_claims (id, bounty_id, winner, amount, proof_hash, tx_hash, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, winnerAddress, claimAmountNumber, proofHash || null, txHash, now);

    await db!.prepare(`
      UPDATE bounties
      SET winners_count = winners_count + 1,
          total_paid = total_paid + ?,
          updated_at = ?
      WHERE id = ?
    `).run(claimAmountNumber, now, id);

    const updatedCampaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (updatedCampaign && updatedCampaign.winners_count >= updatedCampaign.max_winners) {
      await db!.prepare('UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?')
        .run('COMPLETED', now, id);
    }

    await recordActivityEvent({
      entityType: 'bounty' as any,
      entityId: id,
      eventType: 'claim',
      actor: winnerAddress,
      amount: claimAmountNumber,
      txHash,
      status: String(updatedCampaign?.status || campaign.status || 'ACTIVE'),
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Claim confirmed',
      txHash,
      status: String(updatedCampaign?.status || campaign.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /bounties/${req.params.id}/confirm-claim error:`, error);
    res.status(500).json({
      error: 'Failed to confirm claim',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/bounties/:id/pause
 * Build on-chain pause transaction for a bounty campaign
 */
router.post('/bounties/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }
    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active bounties can be paused' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the bounty creator can pause this campaign' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({ error: 'Bounty contract is not fully configured' });
    }

    const controlService = new BountyControlService('chipnet');
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
      tokenType: normalizeBountyTokenType(campaign.token_type),
      feePayerAddress: signerAddress,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /bounties/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/bounties/:id/confirm-pause
 * Confirm on-chain pause transaction and update DB state
 */
router.post('/bounties/:id/confirm-pause', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the bounty creator can confirm pause' });
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
        error: 'Pause transaction does not include expected bounty covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare('UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);
    await recordActivityEvent({
      entityType: 'bounty' as any,
      entityId: id,
      eventType: 'paused',
      actor: signerAddress,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /bounties/${req.params.id}/confirm-pause error:`, error);
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
 * POST /api/bounties/:id/cancel
 * Build on-chain cancel transaction for a bounty campaign
 */
router.post('/bounties/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }
    if (campaign.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Bounty is already cancelled' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(campaign.status))) {
      return res.status(400).json({ error: 'Only active or paused bounties can be cancelled' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the bounty creator can cancel this campaign' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({ error: 'Bounty contract is not fully configured' });
    }

    const controlService = new BountyControlService('chipnet');
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
      tokenType: normalizeBountyTokenType(campaign.token_type),
      feePayerAddress: signerAddress,
    });

    const signerMatchesReturn = authorityReturnAddress.toLowerCase() === signerAddress.toLowerCase();
    const warning = signerMatchesReturn
      ? undefined
      : 'Cancel refunds are enforced to authority hash in the contract constructor. ' +
      'If this address is wrong, redeploy bounty with the correct creator authority address.';

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
    console.error(`POST /bounties/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

/**
 * POST /api/bounties/:id/confirm-cancel
 * Confirm on-chain cancel transaction and update DB state
 */
router.post('/bounties/:id/confirm-cancel', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Bounty campaign not found' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the bounty creator can confirm cancellation' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const isTokenBounty = isFungibleTokenType(campaign.token_type);
    const hasExpectedRefund = await transactionHasExpectedOutput(
      txHash,
      {
        address: authorityReturnAddress,
        minimumSatoshis: 546n,
        ...(isTokenBounty && campaign.token_category
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
    await db!.prepare('UPDATE bounties SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);
    await recordActivityEvent({
      entityType: 'bounty' as any,
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
    console.error(`POST /bounties/${req.params.id}/confirm-cancel error:`, error);
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

function normalizeBountyTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function buildFallbackBountyEvents(campaign: any, claims: any[]): Array<{
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
    id: `fallback-bounty-created-${campaign.id}`,
    entity_type: 'bounty',
    entity_id: campaign.id,
    event_type: 'created',
    actor: campaign.creator || null,
    amount: typeof campaign.reward_per_winner === 'number' && typeof campaign.max_winners === 'number'
      ? campaign.reward_per_winner * campaign.max_winners
      : null,
    status: campaign.status || null,
    tx_hash: null,
    details: null,
    created_at: Number(campaign.created_at || Math.floor(Date.now() / 1000)),
  });

  if (campaign.tx_hash) {
    events.push({
      id: `fallback-bounty-funded-${campaign.id}`,
      entity_type: 'bounty',
      entity_id: campaign.id,
      event_type: 'funded',
      actor: campaign.creator || null,
      amount: typeof campaign.reward_per_winner === 'number' && typeof campaign.max_winners === 'number'
        ? campaign.reward_per_winner * campaign.max_winners
        : null,
      status: 'ACTIVE',
      tx_hash: campaign.tx_hash,
      details: null,
      created_at: Number(campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (campaign.status === 'PAUSED') {
    events.push({
      id: `fallback-bounty-paused-${campaign.id}`,
      entity_type: 'bounty',
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
      id: `fallback-bounty-cancelled-${campaign.id}`,
      entity_type: 'bounty',
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

  claims.forEach((claim: any) => {
    events.push({
      id: `fallback-bounty-claim-${claim.id}`,
      entity_type: 'bounty',
      entity_id: campaign.id,
      event_type: 'claim',
      actor: claim.winner || null,
      amount: typeof claim.amount === 'number' ? claim.amount : null,
      status: campaign.status || null,
      tx_hash: claim.tx_hash || null,
      details: null,
      created_at: Number(claim.claimed_at || campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
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

async function attachLatestBountyEvents(campaigns: any[]): Promise<any[]> {
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return campaigns;
  }
  const latestByCampaignId = await getLatestActivityEvents(
    'bounty' as any,
    campaigns.map((campaign) => String(campaign.id)),
  );
  return campaigns.map((campaign) => ({
    ...campaign,
    latest_event: latestByCampaignId.get(String(campaign.id)) || null,
  }));
}
