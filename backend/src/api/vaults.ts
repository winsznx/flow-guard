import { Router } from 'express';
import { VaultService } from '../services/vaultService';
import { CreateVaultDto } from '../models/Vault';

const router = Router();

// Create vault
router.post('/', (req, res) => {
  try {
    const dto: CreateVaultDto = req.body;
    const creator = req.headers['x-user-address'] as string || 'unknown';
    
    const vault = VaultService.createVault(dto, creator);
    res.status(201).json(vault);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List user's vaults with role information (must come before /:id route)
router.get('/', (req, res) => {
  try {
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    
    // Get vaults where user is creator or signer
    const userVaults = VaultService.getUserVaults(userAddress);
    
    // Get public vaults that user is not already part of
    const publicVaults = VaultService.getPublicVaults().filter(
      vault => !VaultService.isCreator(vault, userAddress) && !VaultService.isSigner(vault, userAddress)
    );
    
    // Categorize user vaults
    const created = userVaults.filter(v => VaultService.isCreator(v, userAddress));
    const signerIn = userVaults.filter(
      v => VaultService.isSigner(v, userAddress) && !VaultService.isCreator(v, userAddress)
    );
    
    // Add role to each vault
    const vaultsWithRole = userVaults.map(vault => ({
      ...vault,
      role: VaultService.isCreator(vault, userAddress) ? 'creator' : 'signer'
    }));
    
    const publicWithRole = publicVaults.map(vault => ({
      ...vault,
      role: 'viewer'
    }));
    
    res.json({
      created,
      signerIn,
      public: publicWithRole,
      all: [...vaultsWithRole, ...publicWithRole]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get vault by ID (with visibility check)
router.get('/:id', (req, res) => {
  try {
    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    
    // Check if user can view this vault
    if (!VaultService.canViewVault(vault, userAddress)) {
      return res.status(403).json({ error: 'Access denied: This vault is private' });
    }
    
    // Determine user role
    let role: 'creator' | 'signer' | 'viewer' = 'viewer';
    if (VaultService.isCreator(vault, userAddress)) {
      role = 'creator';
    } else if (VaultService.isSigner(vault, userAddress)) {
      role = 'signer';
    }
    
    res.json({
      ...vault,
      role
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get vault state
router.get('/:id/state', (req, res) => {
  try {
    const vault = VaultService.getVaultById(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const userAddress = req.headers['x-user-address'] as string || 'unknown';
    if (!VaultService.canViewVault(vault, userAddress)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ state: vault.state, vaultId: vault.vaultId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add signer to vault (creator-only)
router.post('/:id/signers', (req, res) => {
  try {
    const dbId = req.params.id;
    const { signerAddress } = req.body;
    const requesterAddress = req.headers['x-user-address'] as string || 'unknown';
    
    if (!signerAddress) {
      return res.status(400).json({ error: 'Signer address is required' });
    }
    
    // Get vault by database ID first to get the vaultId
    const vault = VaultService.getVaultById(dbId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    const updatedVault = VaultService.addSigner(vault.vaultId, signerAddress, requesterAddress);
    res.json(updatedVault);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Only the vault creator')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('already exists')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

