import { Router } from 'express';
import { ProposalService } from '../services/proposalService';
import { CreateProposalDto, ApproveProposalDto } from '../models/Proposal';

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

export default router;

