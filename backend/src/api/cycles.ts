import { Router } from 'express';
import db from '../database/schema.js';
import { getCycleUnlockScheduler } from '../services/cycle-unlock-scheduler.js';
import { StateService } from '../services/state-service.js';
import { VaultService } from '../services/vaultService.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { transactionExists } from '../utils/txVerification.js';

const router = Router();

async function unlockCyclePolicyState(
  vaultId: string,
  cycleNumber: number,
  userAddress: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const vault = await VaultService.getVaultByVaultId(vaultId);
  if (!vault) {
    return { ok: false, status: 404, error: 'Vault not found' };
  }

  if (!VaultService.isSigner(vault, userAddress)) {
    return { ok: false, status: 403, error: 'Only signers can unlock cycles' };
  }

  const scheduler = getCycleUnlockScheduler();
  const result = await scheduler.unlockCycle(vaultId, cycleNumber);
  if (!result.unlocked) {
    return { ok: false, status: 400, error: result.error || 'Failed to unlock cycle' };
  }

  return { ok: true };
}

// Get cycle history for a vault
router.get('/vaults/:vaultId/cycles', async (req, res) => {
  try {
    const stmt = db!.prepare('SELECT * FROM cycles WHERE vault_id = ? ORDER BY cycle_number DESC');
    const rows = await stmt.all(req.params.vaultId) as any[];
    
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
router.get('/vaults/:vaultId/cycles/current', async (req, res) => {
  try {
    const stmt = db!.prepare(`
      SELECT * FROM cycles
      WHERE vault_id = ?
      ORDER BY cycle_number DESC
      LIMIT 1
    `);
    const row = await stmt.get(req.params.vaultId) as any;
    
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

// Trigger unlock for a specific cycle (database only)
router.post('/vaults/:vaultId/unlock', async (req, res) => {
  try {
    const { cycleNumber } = req.body;
    const vaultId = req.params.vaultId;
    const userAddress = req.headers['x-user-address'] as string || 'unknown';

    if (cycleNumber === undefined) {
      return res.status(400).json({ error: 'cycleNumber is required' });
    }

    const unlockResult = await unlockCyclePolicyState(vaultId, cycleNumber, userAddress);
    if (!unlockResult.ok) {
      return res.status(unlockResult.status).json({ error: unlockResult.error });
    }

    res.json({
      message: 'Cycle unlocked successfully',
      vaultId,
      cycleNumber,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create on-chain unlock transaction
router.post('/vaults/:vaultId/unlock-onchain', async (req, res) => {
  try {
    const { cycleNumber } = req.body;
    const vaultId = req.params.vaultId;
    const userAddress = req.headers['x-user-address'] as string || 'unknown';

    if (cycleNumber === undefined) {
      return res.status(400).json({ error: 'cycleNumber is required' });
    }

    const vault = await VaultService.getVaultByVaultId(vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    if (!VaultService.isSigner(vault, userAddress)) {
      return res.status(403).json({ error: 'Only signers can unlock cycles' });
    }

    const scheduler = getCycleUnlockScheduler();
    const built = await scheduler.createUnlockTransaction(vaultId, cycleNumber, undefined);

    return res.json({
      success: true,
      onChain: true,
      executionMode: 'covenant',
      vaultId,
      cycleNumber,
      newPeriodId: built.newPeriodId,
      wcTransaction: serializeWcTransaction(built.wcTransaction),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to process cycle unlock' });
  }
});

// Confirm on-chain unlock and persist state transition only after tx is indexed
router.post('/vaults/:vaultId/confirm-unlock-onchain', async (req, res) => {
  try {
    const vaultId = req.params.vaultId;
    const { cycleNumber, txHash } = req.body;
    const userAddress = req.headers['x-user-address'] as string || 'unknown';

    if (cycleNumber === undefined) {
      return res.status(400).json({ error: 'cycleNumber is required' });
    }
    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({ error: 'txHash is required' });
    }

    const vault = await VaultService.getVaultByVaultId(vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    if (!VaultService.isSigner(vault, userAddress)) {
      return res.status(403).json({ error: 'Only signers can confirm cycle unlocks' });
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

    const currentState = vault.state || 0;
    const alreadyUnlocked = StateService.isCycleUnlocked(currentState, Number(cycleNumber));

    if (!alreadyUnlocked) {
      const newState = StateService.setCycleUnlocked(currentState, Number(cycleNumber));
      await VaultService.updateVaultState(vaultId, newState);
    }

    return res.json({
      success: true,
      status: 'UNLOCKED',
      state: 'confirmed',
      retryable: false,
      txHash,
      vaultId,
      cycleNumber: Number(cycleNumber),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Failed to confirm cycle unlock',
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

// Get eligible cycles for unlock
router.get('/vaults/:vaultId/cycles/eligible', async (req, res) => {
  try {
    const vault = await VaultService.getVaultByVaultId(req.params.vaultId);
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
