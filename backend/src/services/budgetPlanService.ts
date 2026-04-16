import { randomUUID } from 'crypto';
import db from '../database/schema.js';
import { BudgetPlan, BudgetPlanType, BudgetPlanStatus, CreateBudgetPlanDto } from '../models/BudgetPlan.js';

export class BudgetPlanService {
  static async createBudgetPlan(dto: CreateBudgetPlanDto, creator: string): Promise<BudgetPlan> {
    const id = randomUUID();
    const startDate = dto.startDate || new Date();
    const cliffSeconds = dto.cliffSeconds || 0;

    // Calculate first unlock date
    let nextUnlock: Date;
    if (cliffSeconds > 0) {
      // If there's a cliff, first unlock is after cliff + one interval
      nextUnlock = new Date(startDate.getTime() + (cliffSeconds + dto.intervalSeconds) * 1000);
    } else {
      // Otherwise, first unlock is one interval from start
      nextUnlock = new Date(startDate.getTime() + dto.intervalSeconds * 1000);
    }

    const cliffDate = cliffSeconds > 0
      ? new Date(startDate.getTime() + cliffSeconds * 1000)
      : undefined;

    const stmt = db!.prepare(`
      INSERT INTO budget_plans (
        id, vault_id, plan_name, plan_type, recipient, recipient_label,
        total_amount, interval_seconds, amount_per_interval, cliff_seconds,
        total_released, next_unlock, cliff_date, start_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      id,
      dto.vaultId,
      dto.planName || null,
      dto.planType,
      dto.recipient,
      dto.recipientLabel || null,
      dto.totalAmount,
      dto.intervalSeconds,
      dto.amountPerInterval,
      cliffSeconds,
      0, // Initial total released
      nextUnlock.toISOString(),
      cliffDate ? cliffDate.toISOString() : null,
      startDate.toISOString(),
      BudgetPlanStatus.ACTIVE
    );

    const plan = await this.getBudgetPlanById(id);
    if (!plan) {
      throw new Error('Failed to create budget plan');
    }
    return plan;
  }

  static async getBudgetPlanById(id: string): Promise<BudgetPlan | null> {
    const stmt = db!.prepare('SELECT * FROM budget_plans WHERE id = ?');
    const row = await stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToBudgetPlan(row);
  }

  static async getBudgetPlansByVault(vaultId: string): Promise<BudgetPlan[]> {
    const stmt = db!.prepare('SELECT * FROM budget_plans WHERE vault_id = ? ORDER BY created_at DESC');
    const rows = await stmt.all(vaultId) as any[];
    return rows.map(row => this.mapRowToBudgetPlan(row));
  }

  static async getAllBudgetPlans(): Promise<BudgetPlan[]> {
    const stmt = db!.prepare(`
      SELECT bp.*, v.name as vault_name
      FROM budget_plans bp
      LEFT JOIN vaults v ON bp.vault_id = v.vault_id
      ORDER BY bp.created_at DESC
    `);
    const rows = await stmt.all() as any[];
    return rows.map(row => {
      const plan = this.mapRowToBudgetPlan(row);
      return {
        ...plan,
        vaultName: row.vault_name || plan.vaultId,
      };
    });
  }

  static async getActiveBudgetPlans(): Promise<BudgetPlan[]> {
    const stmt = db!.prepare('SELECT * FROM budget_plans WHERE status = ? ORDER BY next_unlock ASC');
    const rows = await stmt.all(BudgetPlanStatus.ACTIVE) as any[];
    return rows.map(row => this.mapRowToBudgetPlan(row));
  }

  static async updateBudgetPlanStatus(id: string, status: BudgetPlanStatus): Promise<void> {
    const stmt = db!.prepare("UPDATE budget_plans SET status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = ?");
    await stmt.run(status, id);
  }

  static async recordRelease(id: string, amount: number): Promise<void> {
    const plan = await this.getBudgetPlanById(id);
    if (!plan) {
      throw new Error('Budget plan not found');
    }

    const newTotalReleased = plan.totalReleased + amount;
    const nextUnlock = plan.nextUnlock
      ? new Date(plan.nextUnlock.getTime() + plan.intervalSeconds * 1000)
      : new Date(Date.now() + plan.intervalSeconds * 1000);

    // Check if plan is completed
    const status = newTotalReleased >= plan.totalAmount
      ? BudgetPlanStatus.COMPLETED
      : plan.status;

    const stmt = db!.prepare(`
      UPDATE budget_plans
      SET total_released = ?, next_unlock = ?, status = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = ?
    `);

    await stmt.run(
      newTotalReleased,
      status === BudgetPlanStatus.COMPLETED ? null : nextUnlock.toISOString(),
      status,
      id
    );
  }

  static async getEligibleReleases(): Promise<BudgetPlan[]> {
    const now = new Date().toISOString();
    const stmt = db!.prepare(`
      SELECT * FROM budget_plans
      WHERE status = ? AND next_unlock <= ?
      ORDER BY next_unlock ASC
    `);
    const rows = await stmt.all(BudgetPlanStatus.ACTIVE, now) as any[];
    return rows.map(row => this.mapRowToBudgetPlan(row));
  }

  private static mapRowToBudgetPlan(row: any): BudgetPlan {
    return {
      id: row.id,
      vaultId: row.vault_id,
      planName: row.plan_name || undefined,
      planType: row.plan_type as BudgetPlanType,
      recipient: row.recipient,
      recipientLabel: row.recipient_label || undefined,
      totalAmount: row.total_amount,
      intervalSeconds: row.interval_seconds,
      amountPerInterval: row.amount_per_interval,
      cliffSeconds: row.cliff_seconds,
      totalReleased: row.total_released,
      nextUnlock: row.next_unlock ? new Date(row.next_unlock) : undefined,
      cliffDate: row.cliff_date ? new Date(row.cliff_date) : undefined,
      startDate: new Date(row.start_date),
      status: row.status as BudgetPlanStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
