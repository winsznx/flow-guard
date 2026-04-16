/**
 * Airdrops API Endpoints
 * Handles mass distribution campaigns
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import db from '../database/schema.js';
import { AirdropDeploymentService } from '../services/AirdropDeploymentService.js';
import { MerkleTreeService } from '../services/MerkleTreeService.js';
import { AirdropFundingService } from '../services/AirdropFundingService.js';
import { AirdropClaimService } from '../services/AirdropClaimService.js';
import { AirdropControlService } from '../services/AirdropControlService.js';
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
 * GET /api/airdrops
 * List campaigns created by address
 */
router.get('/airdrops', async (req: Request, res: Response) => {
  try {
    const { creator } = req.query;

    if (!creator) {
      return res.status(400).json({ error: 'Creator address is required' });
    }

    const rows = await db!.prepare('SELECT * FROM airdrops WHERE creator = ? ORDER BY created_at DESC').all(creator);
    const campaigns = await attachLatestAirdropEvents(
      (rows as any[]).map((row: any) => normalizeCampaignForResponse(req, row)),
    );

    res.json({
      success: true,
      campaigns,
      total: campaigns.length,
    });
  } catch (error: any) {
    console.error('GET /airdrops error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns', message: error.message });
  }
});

/**
 * GET /api/airdrops/claimable
 * List campaigns available for address to claim
 */
router.get('/airdrops/claimable', async (req: Request, res: Response) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const now = Math.floor(Date.now() / 1000);
    const rows = await db!.prepare(`
      SELECT a.* FROM airdrops a
      WHERE a.status = 'ACTIVE'
        AND (a.end_date IS NULL OR a.end_date > ?)
        AND (
          SELECT COUNT(1) FROM airdrop_claims c
          WHERE c.campaign_id = a.id AND c.claimer = ?
        ) < COALESCE(a.max_claims_per_address, 1)
    `).all(now, address);
    const campaigns = await attachLatestAirdropEvents(
      (rows as any[]).map((row: any) => normalizeCampaignForResponse(req, row)),
    );

    res.json({
      success: true,
      campaigns,
      total: campaigns.length,
    });
  } catch (error: any) {
    console.error('GET /airdrops/claimable error:', error);
    res.status(500).json({ error: 'Failed to fetch claimable campaigns', message: error.message });
  }
});

/**
 * GET /api/airdrops/claim/:token
 * Resolve claim-link token to campaign id/details
 */
router.get('/airdrops/claim/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid claim token format' });
    }

    const campaign = await db!
      .prepare('SELECT * FROM airdrops WHERE claim_link LIKE ? LIMIT 1')
      .get(`%/claim/${token}`) as any;

    if (!campaign) {
      return res.status(404).json({ error: 'Claim campaign not found' });
    }

    return res.json({
      success: true,
      campaignId: campaign.id,
      campaign: normalizeCampaignForResponse(req, campaign),
    });
  } catch (error: any) {
    console.error(`GET /airdrops/claim/${req.params.token} error:`, error);
    return res.status(500).json({ error: 'Failed to resolve claim link', message: error.message });
  }
});

/**
 * GET /api/airdrops/:id
 * Get campaign details with claim history
 */
router.get('/airdrops/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const claims = await db!.prepare('SELECT * FROM airdrop_claims WHERE campaign_id = ? ORDER BY claimed_at DESC').all(id);
    const storedEvents = await listActivityEvents('airdrop', id, 200);
    const events = storedEvents.length > 0
      ? storedEvents
      : buildFallbackAirdropEvents(campaign, claims);

    res.json({
      success: true,
      campaign: normalizeCampaignForResponse(req, campaign),
      claims,
      events,
    });
  } catch (error: any) {
    console.error(`GET /airdrops/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch campaign', message: error.message });
  }
});

/**
 * POST /api/airdrops/create
 * Create a new airdrop campaign
 */
router.post('/airdrops/create', async (req: Request, res: Response) => {
  try {
    const {
      creator,
      title,
      description,
      campaignType,
      tokenType,
      tokenCategory,
      totalAmount,
      amountPerClaim,
      recipients,
      startDate,
      endDate,
      requireKyc,
      maxClaimsPerAddress,
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
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }
    if (!amountPerClaim || amountPerClaim <= 0) {
      return res.status(400).json({ error: 'Amount per claim must be greater than 0' });
    }
    const totalAmountOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType);
    const amountPerClaimOnChain = displayAmountToOnChain(Number(amountPerClaim), normalizedTokenType);
    if (amountPerClaimOnChain <= 0 || totalAmountOnChain <= 0) {
      return res.status(400).json({
        error: 'Amounts are below on-chain minimum precision',
        message: normalizedTokenType === 'BCH'
          ? 'Use at least 1 satoshi per claim and total pool'
          : 'Use at least 1 token base unit per claim and total pool',
      });
    }
    if (amountPerClaimOnChain > totalAmountOnChain) {
      return res.status(400).json({ error: 'Amount per claim cannot exceed total amount' });
    }
    const normalizedTotalAmount = onChainAmountToDisplay(totalAmountOnChain, normalizedTokenType);
    const normalizedAmountPerClaim = onChainAmountToDisplay(amountPerClaimOnChain, normalizedTokenType);

    const totalRecipients = Array.isArray(recipients)
      ? recipients.length
      : Math.floor(normalizedTotalAmount / normalizedAmountPerClaim);

    const id = randomUUID();
    const countRow = await db!.prepare('SELECT COUNT(*) as cnt FROM airdrops').get() as any;
    const campaignId = `#FG-DROP-${String((countRow?.cnt ?? 0) + 1).padStart(3, '0')}`;
    const now = Math.floor(Date.now() / 1000);
    const claimToken = randomUUID();
    const publicAppBaseUrl = resolvePublicAppBaseUrl(req);
    const claimLink = `${publicAppBaseUrl}/claim/${claimToken}`;

    // Deploy airdrop contract with proper NFT state
    const deploymentService = new AirdropDeploymentService('chipnet');

    // Get vault's contract vaultId
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

    // Authority controls admin paths (pause/resume/cancel). Claims are permissionless to submit,
    // but always require claim-authority co-signing to enforce eligibility/limits.
    const deployment = await deploymentService.deployAirdrop({
      vaultId: actualVaultId,
      authorityAddress: creator,
      amountPerClaim: normalizedAmountPerClaim,
      totalAmount: normalizedTotalAmount,
      startTime: startDate || 0,
      endTime: endDate || 0,
      tokenType: normalizedTokenType,
      tokenCategory,
    });

    // Store with PENDING status - becomes ACTIVE after funding tx confirmed
    await db!.prepare(`
      INSERT INTO airdrops (id, campaign_id, vault_id, creator, title, description,
        campaign_type, token_type, token_category, total_amount, amount_per_claim,
        total_recipients, claimed_count, claim_link, start_date, end_date, status,
        require_kyc, max_claims_per_address, created_at, updated_at,
        contract_address, constructor_params, nft_commitment, nft_capability,
        claim_authority_privkey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, campaignId, vaultId || null, creator, title, description || null,
      campaignType || 'AIRDROP', normalizedTokenType, tokenCategory || null,
      normalizedTotalAmount, normalizedAmountPerClaim, totalRecipients, claimLink,
      startDate || now, endDate || null,
      requireKyc === true ? 1 : 0, maxClaimsPerAddress || 1,
      now, now,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable',
      encryptPrivateKey(deployment.claimAuthorityPrivKey),
    );
    await recordActivityEvent({
      entityType: 'airdrop',
      entityId: id,
      eventType: 'created',
      actor: creator,
      amount: normalizedTotalAmount,
      status: 'PENDING',
      details: {
        campaignId,
        campaignType: campaignType || 'AIRDROP',
        totalRecipients,
        startDate: startDate || now,
        endDate: endDate || null,
      },
      createdAt: now,
    });

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Airdrop contract deployed - awaiting funding transaction',
      campaign: normalizeCampaignForResponse(req, campaign),
      deployment: {
        contractAddress: deployment.contractAddress,
        campaignId,
        onChainCampaignId: deployment.campaignId,
        fundingRequired: deployment.fundingTxRequired,
        nftCommitment: deployment.initialCommitment,
      },
    });
  } catch (error: any) {
    console.error('POST /airdrops/create error:', error);
    res.status(500).json({ error: 'Failed to create campaign', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/generate-merkle
 * Generate merkle tree from recipients list
 */
router.post('/airdrops/:id/generate-merkle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array is required' });
    }

    // Validate each recipient has a valid BCH address and a positive amount
    const { decodeCashAddress } = await import('@bitauth/libauth');
    const invalid = recipients.find((r: any) => {
      if (!r.address || typeof r.address !== 'string') return true;
      if (!r.amount || Number(r.amount) <= 0) return true;
      const decoded = decodeCashAddress(r.address);
      return typeof decoded === 'string'; // decodeCashAddress returns error string on failure
    });
    if (invalid) {
      return res.status(400).json({
        error: 'Invalid recipient',
        message: `Each recipient must have a valid BCH address and a positive amount. Invalid: ${JSON.stringify(invalid)}`,
      });
    }

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Generate merkle tree
    const merkleService = new MerkleTreeService();
    const tree = merkleService.generateMerkleTree(recipients);

    // Store merkle root and recipients data
    const now = Math.floor(Date.now() / 1000);
    await db!.prepare(`
      UPDATE airdrops
      SET merkle_root = ?, merkle_data = ?, total_recipients = ?, updated_at = ?
      WHERE id = ?
    `).run(tree.root, JSON.stringify({ recipients, proofs: Array.from(tree.proofs.entries()) }), recipients.length, now, id);

    res.json({
      success: true,
      message: 'Merkle tree generated',
      merkleRoot: tree.root,
      totalRecipients: recipients.length,
      leaves: tree.leaves,
    });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/generate-merkle error:`, error);
    res.status(500).json({ error: 'Failed to generate merkle tree', message: error.message });
  }
});

/**
 * GET /api/airdrops/:id/funding-info
 * Get funding transaction parameters
 */
router.get('/airdrops/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!campaign.contract_address) {
      return res.status(400).json({ error: 'Campaign contract not deployed' });
    }

    const requiresMerkle = Boolean(campaign.require_kyc);
    if (requiresMerkle && !campaign.merkle_root) {
      return res.status(400).json({
        error: 'Merkle tree not generated yet',
        message: 'KYC-restricted campaigns require a merkle tree before funding.',
      });
    }

    const fundingAmountOnChain = displayAmountToOnChain(campaign.total_amount, campaign.token_type);
    const nftCommitment = campaign.nft_commitment || '';

    const fundingService = new AirdropFundingService('chipnet');

    try {
      const fundingTx = await fundingService.buildFundingTransaction({
        contractAddress: campaign.contract_address,
        creatorAddress: campaign.creator,
        totalAmount: fundingAmountOnChain,
        merkleRoot: campaign.merkle_root,
        tokenType: normalizeAirdropTokenType(campaign.token_type),
        tokenCategory: campaign.token_category,
        nftCommitment,
        nftCapability: 'mutable',
      });

      res.json({
        success: true,
        fundingInfo: {
          contractAddress: campaign.contract_address,
          totalAmount: campaign.total_amount,
          onChainAmount: fundingAmountOnChain,
          tokenType: campaign.token_type,
          merkleRoot: campaign.merkle_root || null,
          requiresMerkle,
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
    console.error(`GET /airdrops/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/confirm-funding
 * Confirm airdrop contract funding
 */
router.post('/airdrops/:id/confirm-funding', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const fundingAmountOnChain = displayAmountToOnChain(campaign.total_amount, campaign.token_type);
    const isTokenAirdrop = isFungibleTokenType(campaign.token_type);
    const minimumContractSatoshis = getRequiredContractFundingSatoshis(
      'airdrop',
      isTokenAirdrop ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(fundingAmountOnChain),
    );

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: campaign.contract_address,
        minimumSatoshis: minimumContractSatoshis,
        ...(isTokenAirdrop && campaign.token_category
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

    // Update campaign with tx_hash and set status to ACTIVE
    await db!.prepare(`
      UPDATE airdrops
      SET tx_hash = ?, status = 'ACTIVE', updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);
    await recordActivityEvent({
      entityType: 'airdrop',
      entityId: id,
      eventType: 'funded',
      actor: campaign.creator,
      amount: campaign.total_amount,
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
      message: 'Airdrop funding confirmed',
      txHash,
      status: 'ACTIVE',
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/confirm-funding error:`, error);
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
 * GET /api/airdrops/:id/proof/:address
 * Get merkle proof for specific address
 */
router.get('/airdrops/:id/proof/:address', async (req: Request, res: Response) => {
  try {
    const { id, address } = req.params;

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!campaign.merkle_data) {
      if (campaign.require_kyc) {
        return res.status(400).json({ error: 'Merkle tree not generated for this campaign' });
      }
      return res.json({
        success: true,
        proof: [],
        amount: campaign.amount_per_claim,
        merkleRoot: campaign.merkle_root || null,
        publicCampaign: true,
      });
    }

    const merkleData = JSON.parse(campaign.merkle_data);
    const proofsMap = new Map(merkleData.proofs);
    const proof = proofsMap.get(address);

    if (!proof) {
      return res.status(404).json({ error: 'Address not found in merkle tree' });
    }

    // Find recipient amount
    const recipient = merkleData.recipients.find((r: any) => r.address === address);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    res.json({
      success: true,
      proof,
      amount: recipient.amount,
      merkleRoot: campaign.merkle_root,
    });
  } catch (error: any) {
    console.error(`GET /airdrops/${req.params.id}/proof/${req.params.address} error:`, error);
    res.status(500).json({ error: 'Failed to get proof', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/claim
 * Build claim transaction with merkle proof
 */
router.post('/airdrops/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const claimerAddress = String(req.body?.claimerAddress || req.body?.claimer || '').trim();
    const signerAddress = String(
      req.body?.signerAddress
      || req.headers['x-user-address']
      || claimerAddress,
    ).trim();

    if (!claimerAddress) {
      return res.status(400).json({ error: 'Claimer address is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Campaign is not active' });
    }
    if (!campaign.contract_address || !campaign.constructor_params) {
      return res.status(400).json({
        error: 'Campaign contract is not fully configured',
        message: 'This campaign cannot be claimed until a valid contract deployment is recorded.',
      });
    }

    const claimCountRow = db!
      .prepare('SELECT COUNT(1) as cnt FROM airdrop_claims WHERE campaign_id = ? AND claimer = ?')
      .get(id, claimerAddress) as any;
    const claimCount = Number(claimCountRow?.cnt || 0);
    const maxClaimsPerAddress = Math.max(1, Number(campaign.max_claims_per_address || 1));
    if (claimCount >= maxClaimsPerAddress) {
      return res.status(409).json({ error: 'Claim limit reached for this address' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const constructorAmountPerClaim = readBigIntParam(
      constructorParams[3],
      'amountPerClaim',
    );
    if (constructorAmountPerClaim <= 0n) {
      return res.status(500).json({
        error: 'Invalid campaign constructor parameters',
        message: 'amountPerClaim must be greater than zero',
      });
    }

    if (campaign.merkle_data) {
      const merkleData = JSON.parse(campaign.merkle_data);
      const proofsMap = new Map(merkleData.proofs);
      const proof = proofsMap.get(claimerAddress);
      if (!proof) {
        return res.status(403).json({ error: 'Address not eligible for this airdrop' });
      }
      const recipient = merkleData.recipients.find((r: any) => r.address === claimerAddress);
      if (!recipient) {
        return res.status(403).json({ error: 'Address not eligible for this airdrop' });
      }
      if (recipient.amount !== undefined && Number(recipient.amount) > 0) {
        const recipientAmountOnChain = BigInt(
          displayAmountToOnChain(Number(recipient.amount), campaign.token_type),
        );
        if (recipientAmountOnChain !== constructorAmountPerClaim) {
          return res.status(422).json({
            error: 'Recipient amount does not match fixed covenant amount',
            message:
              `Campaign covenant enforces a fixed amount per claim (${constructorAmountPerClaim.toString()} on-chain units), `
              + `but recipient entry resolves to ${recipientAmountOnChain.toString()}.`,
          });
        }
      }
    } else if (campaign.require_kyc) {
      return res.status(400).json({
        error: 'KYC-restricted campaign requires merkle recipient data before claims can be built',
      });
    }

    const now = Math.floor(Date.now() / 1000);

    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(campaign.contract_address)
      || campaign.nft_commitment
      || '00'.repeat(40);

    const claimService = new AirdropClaimService('chipnet');
    const claimAmountOnChain = bigIntToSafeNumber(
      constructorAmountPerClaim,
      'amountPerClaim',
    );
    const claimTx = await claimService.buildClaimTransaction({
      airdropId: campaign.campaign_id,
      contractAddress: campaign.contract_address,
      claimer: claimerAddress,
      signer: signerAddress,
      claimAmount: claimAmountOnChain,
      tokenType: normalizeAirdropTokenType(campaign.token_type),
      tokenCategory: campaign.token_category,
      constructorParams,
      currentCommitment,
      currentTime: now,
      claimAuthorityPrivKey: decryptPrivateKey(campaign.claim_authority_privkey),
    });

    const claimedDisplayAmount = onChainAmountToDisplay(claimTx.claimAmount, campaign.token_type);

    res.json({
      success: true,
      claimAmount: claimedDisplayAmount,
      wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/claim error:`, error);
    res.status(500).json({ error: 'Failed to build claim transaction', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/confirm-claim
 * Confirm airdrop claim
 */
router.post('/airdrops/:id/confirm-claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claimerAddress, claimedAmount, txHash } = req.body;

    if (!claimerAddress) {
      return res.status(400).json({ error: 'Claimer address is required' });
    }
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

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const claimedAmountNumber = Number(claimedAmount);
    const claimedAmountOnChain = displayAmountToOnChain(claimedAmountNumber, campaign.token_type);
    const isTokenAirdrop = isFungibleTokenType(campaign.token_type);

    const expectedClaimOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: claimerAddress,
        minimumSatoshis: BigInt(isTokenAirdrop ? 546 : Math.max(546, claimedAmountOnChain)),
        ...(isTokenAirdrop && campaign.token_category
          ? {
            tokenCategory: campaign.token_category,
            minimumTokenAmount: BigInt(Math.max(0, Math.trunc(claimedAmountOnChain))),
          }
          : {}),
      },
      'chipnet',
    );

    if (!expectedClaimOutput) {
      return res.status(400).json({
        error: 'Claim transaction does not include the expected claimer output',
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // Record claim
    await db!.prepare(`
      INSERT INTO airdrop_claims (id, campaign_id, claimer, amount, claimed_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, claimerAddress, claimedAmountNumber, now, txHash);

    // Update campaign statistics
    await db!.prepare(`
      UPDATE airdrops
      SET claimed_count = claimed_count + 1, updated_at = ?
      WHERE id = ?
    `).run(now, id);
    await recordActivityEvent({
      entityType: 'airdrop',
      entityId: id,
      eventType: 'claim',
      actor: claimerAddress,
      amount: claimedAmountNumber,
      txHash,
      status: String(campaign.status || 'ACTIVE'),
      createdAt: now,
    });

    res.json({
      success: true,
      message: 'Claim confirmed',
      txHash,
      status: String(campaign.status || 'ACTIVE'),
      state: 'confirmed',
      retryable: false,
    });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/confirm-claim error:`, error);
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
 * POST /api/airdrops/:id/pause
 * Build on-chain pause transaction for a campaign
 */
router.post('/airdrops/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
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

    const controlService = new AirdropControlService('chipnet');
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
      tokenType: normalizeAirdropTokenType(campaign.token_type),
      feePayerAddress: signerAddress,
    });

    res.json({
      success: true,
      nextStatus: built.nextStatus,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/pause error:`, error);
    res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/confirm-pause
 * Confirm on-chain pause transaction and update DB state
 */
router.post('/airdrops/:id/confirm-pause', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
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
    await db!.prepare('UPDATE airdrops SET status = ?, updated_at = ? WHERE id = ?')
      .run('PAUSED', now, id);
    await recordActivityEvent({
      entityType: 'airdrop',
      entityId: id,
      eventType: 'paused',
      actor: signerAddress,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    res.json({ success: true, txHash, status: 'PAUSED', state: 'confirmed', retryable: false });
  } catch (error: any) {
    console.error(`POST /airdrops/${req.params.id}/confirm-pause error:`, error);
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
 * POST /api/airdrops/:id/cancel
 * Build on-chain cancel transaction for a campaign
 */
router.post('/airdrops/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = (req.headers['x-user-address'] as string | undefined)?.trim()
      || String(req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
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

    const controlService = new AirdropControlService('chipnet');
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
      tokenType: normalizeAirdropTokenType(campaign.token_type),
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
    console.error(`POST /airdrops/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to build cancel transaction', message: error.message });
  }
});

/**
 * POST /api/airdrops/:id/confirm-cancel
 * Confirm on-chain cancel transaction and update DB state
 */
router.post('/airdrops/:id/confirm-cancel', async (req: Request, res: Response) => {
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

    const campaign = await db!.prepare('SELECT * FROM airdrops WHERE id = ?').get(id) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (String(campaign.creator).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the campaign creator can confirm cancellation' });
    }

    const constructorParams = deserializeConstructorParams(campaign.constructor_params || '[]');
    const authorityHash = readBytes20(constructorParams[1], 'authorityHash');
    const authorityReturnAddress = hashToP2pkhAddress(authorityHash);
    const isTokenAirdrop = isFungibleTokenType(campaign.token_type);
    const hasExpectedRefund = await transactionHasExpectedOutput(
      txHash,
      {
        address: authorityReturnAddress,
        minimumSatoshis: 546n,
        ...(isTokenAirdrop && campaign.token_category
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
    await db!.prepare('UPDATE airdrops SET status = ?, updated_at = ? WHERE id = ?')
      .run('CANCELLED', now, id);
    await recordActivityEvent({
      entityType: 'airdrop',
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
    console.error(`POST /airdrops/${req.params.id}/confirm-cancel error:`, error);
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

function normalizeAirdropTokenType(tokenType: unknown): 'BCH' | 'FUNGIBLE_TOKEN' {
  return tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
    ? 'FUNGIBLE_TOKEN'
    : 'BCH';
}

function buildFallbackAirdropEvents(campaign: any, claims: any[]): Array<{
  id: string;
  entity_type: 'airdrop';
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
    entity_type: 'airdrop';
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
    id: `fallback-airdrop-created-${campaign.id}`,
    entity_type: 'airdrop',
    entity_id: campaign.id,
    event_type: 'created',
    actor: campaign.creator || null,
    amount: typeof campaign.total_amount === 'number' ? campaign.total_amount : null,
    status: campaign.status || null,
    tx_hash: null,
    details: null,
    created_at: Number(campaign.created_at || Math.floor(Date.now() / 1000)),
  });

  if (campaign.tx_hash) {
    events.push({
      id: `fallback-airdrop-funded-${campaign.id}`,
      entity_type: 'airdrop',
      entity_id: campaign.id,
      event_type: 'funded',
      actor: campaign.creator || null,
      amount: typeof campaign.total_amount === 'number' ? campaign.total_amount : null,
      status: 'ACTIVE',
      tx_hash: campaign.tx_hash,
      details: null,
      created_at: Number(campaign.updated_at || campaign.created_at || Math.floor(Date.now() / 1000)),
    });
  }

  if (campaign.status === 'PAUSED') {
    events.push({
      id: `fallback-airdrop-paused-${campaign.id}`,
      entity_type: 'airdrop',
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
      id: `fallback-airdrop-cancelled-${campaign.id}`,
      entity_type: 'airdrop',
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
      id: `fallback-airdrop-claim-${claim.id}`,
      entity_type: 'airdrop',
      entity_id: campaign.id,
      event_type: 'claim',
      actor: claim.claimer || null,
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

function resolvePublicAppBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').trim();
  if (configured) {
    return configured
      .replace('://api.', '://')
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '');
  }

  const origin = (req.get('origin') || '').trim();
  if (origin) {
    return origin.replace('://api.', '://').replace(/\/+$/, '');
  }

  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0]?.trim();
  const forwardedHost = (req.get('x-forwarded-host') || '').split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    const normalizedForwardedHost = forwardedHost.replace(/^api\./i, '');
    return `${forwardedProto}://${normalizedForwardedHost}`.replace(/\/+$/, '');
  }

  const host = (req.get('host') || '').trim();
  if (host) {
    const protocol = forwardedProto || req.protocol || 'https';
    const normalizedHost = host.replace(/^api\./i, '');
    return `${protocol}://${normalizedHost}`.replace(/\/+$/, '');
  }

  return 'http://localhost:5173';
}

function normalizeCampaignForResponse(req: Request, campaign: any): any {
  if (!campaign || typeof campaign !== 'object') {
    return campaign;
  }
  return {
    ...campaign,
    claim_link: normalizeClaimLinkForResponse(req, campaign.claim_link),
  };
}

async function attachLatestAirdropEvents(campaigns: any[]): Promise<any[]> {
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return campaigns;
  }
  const latestByCampaignId = await getLatestActivityEvents(
    'airdrop',
    campaigns.map((campaign) => String(campaign.id)),
  );
  return campaigns.map((campaign) => ({
    ...campaign,
    latest_event: latestByCampaignId.get(String(campaign.id)) || null,
  }));
}

function normalizeClaimLinkForResponse(req: Request, claimLink: unknown): string {
  if (typeof claimLink !== 'string') {
    return '';
  }
  const trimmed = claimLink.trim();
  const match = trimmed.match(/\/claim\/([a-zA-Z0-9-]{8,128})$/);
  if (!match) {
    return trimmed;
  }
  return `${resolvePublicAppBaseUrl(req)}/claim/${match[1]}`;
}
