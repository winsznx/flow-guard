import { Router } from 'express';
import db from '../database/schema';

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

// Trigger unlock (if needed - usually handled by Loop)
router.post('/vaults/:vaultId/unlock', (req, res) => {
  try {
    // TODO: Implement unlock logic
    // This would typically be triggered by the Loop mechanism
    res.json({ message: 'Unlock triggered', vaultId: req.params.vaultId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

