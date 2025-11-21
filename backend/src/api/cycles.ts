import { Router } from 'express';
import db from '../database/schema';
import { getCycleUnlockScheduler } from '../services/cycle-unlock-scheduler';
import { StateService } from '../services/state-service';
import { VaultService } from '../services/vaultService';

const router = Router();

// Get cycle history for a vault
router.get('/vaults/:vaultId/cycles', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM cycles WHERE vault_id = ? ORDER BY cycle_number DESC');
    const rows = stmt.all(req.params.vaultId) as any[];
    
    const cycles = rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
      cycleNumber: row.cycle_number,
      unlockTime: new Date(row.unlock_time),
      unlockAmount: row.unlock_amount,
      unlockedAt: row.unlocked_at ? new Date(row.unlocked_at) : undefined,
      spentAmount: row.spent_amount,
      status: row.status,
      createdAt: new Date(row.created_at),
    }));
    
    res.json(cycles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current cycle for a vault
router.get('/vaults/:vaultId/cycles/current', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM cycles 
      WHERE vault_id = ? 
      ORDER BY cycle_number DESC 
      LIMIT 1
    `);
    const row = stmt.get(req.params.vaultId) as any;
    
    if (!row) {
      return res.status(404).json({ error: 'No cycles found' });
    }
    
    res.json({
      id: row.id,
      vaultId: row.vault_id,
      cycleNumber: row.cycle_number,
      unlockTime: new Date(row.unlock_time),
      unlockAmount: row.unlock_amount,
      unlockedAt: row.unlocked_at ? new Date(row.unlocked_at) : undefined,
      spentAmount: row.spent_amount,
      status: row.status,
      createdAt: new Date(row.created_at),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger unlock for a specific cycle
router.post('/vaults/:vaultId/unlock', async (req, res) => {
  try {
    const { cycleNumber } = req.body;
    const vaultId = req.params.vaultId;
    const userAddress = req.headers['x-user-address'] as string || 'unknown';

    if (cycleNumber === undefined) {
      return res.status(400).json({ error: 'cycleNumber is required' });
    }

    const vault = VaultService.getVaultByVaultId(vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Verify user is a signer
    if (!VaultService.isSigner(vault, userAddress)) {
      return res.status(403).json({ error: 'Only signers can unlock cycles' });
    }

    const scheduler = getCycleUnlockScheduler();
    const result = await scheduler.unlockCycle(vaultId, cycleNumber);

    if (!result.unlocked) {
      return res.status(400).json({ error: result.error || 'Failed to unlock cycle' });
    }

    res.json({
      message: 'Cycle unlocked successfully',
      vaultId: result.vaultId,
      cycleNumber: result.cycleNumber,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get eligible cycles for unlock
router.get('/vaults/:vaultId/cycles/eligible', (req, res) => {
  try {
    const vault = VaultService.getVaultByVaultId(req.params.vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const vaultStartTime = Math.floor((vault.startTime || vault.createdAt).getTime() / 1000);
    const currentState = vault.state || 0;
    const currentCycle = StateService.getCurrentCycle(vaultStartTime, vault.cycleDuration);

    const eligibleCycles: number[] = [];
    for (let i = 0; i <= currentCycle && i < 16; i++) {
      if (StateService.canUnlockCycle(currentState, i, vaultStartTime, vault.cycleDuration)) {
        eligibleCycles.push(i);
      }
    }

    res.json({
      currentCycle,
      eligibleCycles,
      unlockedCycles: StateService.getUnlockedCycles(currentState),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

