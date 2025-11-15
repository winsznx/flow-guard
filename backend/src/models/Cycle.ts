export interface Cycle {
  id: string;
  vaultId: string;
  cycleNumber: number;
  unlockTime: Date;
  unlockAmount: number;
  unlockedAt?: Date;
  spentAmount: number;
  status: 'pending' | 'unlocked' | 'spent';
  createdAt: Date;
}

