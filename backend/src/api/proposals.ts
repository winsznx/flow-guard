import { Router } from 'express';
import { ProposalService } from '../services/proposalService.js';
import { CreateProposalDto, ApproveProposalDto } from '../models/Proposal.js';

const router = Router();

// Create proposal
router.post('/vaults/:vaultId/proposals', (req, res) => {
  try {
    const dto: CreateProposalDto = {
      vaultId: req.params.vaultId,
      ...req.body,
    };
    const creator = req.headers['x-user-address'] as string || 'unknown';
    
    const proposal = ProposalService.createProposal(dto, creator);
    res.status(201).json(proposal);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List proposals for a vault
router.get('/vaults/:vaultId/proposals', (req, res) => {
  try {
    const proposals = ProposalService.getVaultProposals(req.params.vaultId);
    res.json(proposals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get proposal by ID
router.get('/:id', (req, res) => {
  try {
    const proposal = ProposalService.getProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(proposal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve proposal
router.post('/:id/approve', (req, res) => {
  try {
    const dto: ApproveProposalDto = {
      proposalId: req.params.id,
      approver: req.headers['x-user-address'] as string || 'unknown',
    };
    
    const proposal = ProposalService.approveProposal(dto);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found or not approvable' });
    }
    res.json(proposal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create on-chain proposal transaction
router.post('/:id/create-onchain', async (req, res) => {
  try {
    const proposalId = req.params.id;
    const signerPublicKey = req.headers['x-signer-public-key'] as string;

    if (!signerPublicKey) {
      return res.status(400).json({ error: 'Signer public key is required' });
    }

    const result = await ProposalService.createOnChainProposalTransaction(proposalId, signerPublicKey);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create on-chain approval transaction
router.post('/:id/approve-onchain', async (req, res) => {
  try {
    const proposalId = req.params.id;
    const signerPublicKey = req.headers['x-signer-public-key'] as string;

    if (!signerPublicKey) {
      return res.status(400).json({ error: 'Signer public key is required' });
    }

    const result = await ProposalService.createOnChainApprovalTransaction(proposalId, signerPublicKey);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create execute payout transaction
router.post('/:id/execute-onchain', async (req, res) => {
  try {
    const proposalId = req.params.id;

    const result = await ProposalService.createExecutePayoutTransaction(proposalId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Broadcast signed transaction
router.post('/broadcast', async (req, res) => {
  try {
    const { txHex, txType, vaultId, proposalId, amount, fromAddress, toAddress } = req.body;

    if (!txHex) {
      return res.status(400).json({ error: 'txHex is required' });
    }

    // Import ContractService
    const { ContractService } = await import('../services/contract-service.js');
    const contractService = new ContractService('chipnet');

    // Broadcast the signed transaction
    const txid = await contractService.broadcastTransaction(txHex);

    // Record transaction in database
    if (txType) {
      const { TransactionService } = await import('../services/transactionService.js');
      await TransactionService.recordTransaction(txid, txType, {
        vaultId,
        proposalId,
        amount,
        fromAddress,
        toAddress,
      });
    }

    res.json({ txid, success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

