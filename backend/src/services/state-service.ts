/**
 * State Service - Manages on-chain bitwise state encoding
 * Implements the same bitwise operations as the contract
 */

export class StateService {
  // State bit layout:
  // Bits 0-15: Cycle unlock flags (16 cycles max)
  // Bits 16-31: Reserved for future use
  // Bits 32-47: Proposal status (16 proposals, 2 bits each: 00=none, 01=pending, 10=approved, 11=executed)
  // Bits 48-63: Approval counts (4 bits per proposal, max 4 proposals)

  /**
   * Check if a cycle is unlocked
   */
  static isCycleUnlocked(state: number, cycleNumber: number): boolean {
    if (cycleNumber < 0 || cycleNumber >= 16) return false;
    const mask = 1 << cycleNumber;
    return (state & mask) !== 0;
  }

  /**
   * Set cycle as unlocked
   */
  static setCycleUnlocked(state: number, cycleNumber: number): number {
    if (cycleNumber < 0 || cycleNumber >= 16) return state;
    const mask = 1 << cycleNumber;
    return state | mask;
  }

  /**
   * Get proposal status (2 bits: 00=none, 01=pending, 10=approved, 11=executed)
   */
  static getProposalStatus(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 16) return 0;
    const shift = 32 + proposalId * 2;
    return (state >> shift) & 3;
  }

  /**
   * Check if proposal is pending
   */
  static isProposalPending(state: number, proposalId: number): boolean {
    return this.getProposalStatus(state, proposalId) === 1;
  }

  /**
   * Check if proposal is approved
   */
  static isProposalApproved(state: number, proposalId: number): boolean {
    return this.getProposalStatus(state, proposalId) === 2;
  }

  /**
   * Check if proposal is executed
   */
  static isProposalExecuted(state: number, proposalId: number): boolean {
    return this.getProposalStatus(state, proposalId) === 3;
  }

  /**
   * Set proposal as pending
   */
  static setProposalPending(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 16) return state;
    const shift = 32 + proposalId * 2;
    const mask = 1 << shift; // Set bit 0 of the 2-bit status (01 = pending)
    return state | mask;
  }

  /**
   * Set proposal as approved
   */
  static setProposalApproved(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 16) return state;
    const shift = 32 + proposalId * 2;
    const mask = 3 << shift; // Clear both bits
    return (state & ~mask) | (2 << shift); // Set to 10 = approved
  }

  /**
   * Set proposal as executed
   */
  static setProposalExecuted(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 16) return state;
    const shift = 32 + proposalId * 2;
    const mask = 3 << shift; // Clear both bits
    return (state & ~mask) | (3 << shift); // Set to 11 = executed
  }

  /**
   * Get approval count for a proposal (4 bits, max 15)
   */
  static getApprovalCount(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 4) return 0;
    const shift = 48 + proposalId * 4;
    return (state >> shift) & 15;
  }

  /**
   * Increment approval count for a proposal
   */
  static incrementApproval(state: number, proposalId: number): number {
    if (proposalId < 0 || proposalId >= 4) return state;
    const shift = 48 + proposalId * 4;
    const currentCount = this.getApprovalCount(state, proposalId);
    const newCount = currentCount + 1;
    if (newCount > 15) return state; // Max 15 approvals
    
    const mask = 15 << shift; // 4 bits mask
    const newState = (state & ~mask) | (newCount << shift);
    
    // If threshold is met, automatically mark as approved
    // Note: We need the threshold to determine this, so this is handled separately
    return newState;
  }

  /**
   * Increment approval and check if threshold is met
   * Returns: { newState, isApproved }
   */
  static incrementApprovalWithCheck(
    state: number,
    proposalId: number,
    threshold: number
  ): { newState: number; isApproved: boolean } {
    const newState = this.incrementApproval(state, proposalId);
    const newCount = this.getApprovalCount(newState, proposalId);
    const isApproved = newCount >= threshold;
    
    // If threshold met, mark as approved
    if (isApproved && !this.isProposalApproved(newState, proposalId)) {
      return {
        newState: this.setProposalApproved(newState, proposalId),
        isApproved: true,
      };
    }
    
    return { newState, isApproved };
  }

  /**
   * Calculate current cycle number based on time
   */
  static getCurrentCycle(vaultStartTime: number, cycleDuration: number): number {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - vaultStartTime;
    if (elapsed < 0) return 0;
    return Math.floor(elapsed / cycleDuration);
  }

  /**
   * Check if it's time to unlock a cycle
   */
  static canUnlockCycle(
    state: number,
    cycleNumber: number,
    vaultStartTime: number,
    cycleDuration: number
  ): boolean {
    // Check if already unlocked
    if (this.isCycleUnlocked(state, cycleNumber)) return false;
    
    // Check if it's time
    const currentCycle = this.getCurrentCycle(vaultStartTime, cycleDuration);
    return currentCycle >= cycleNumber;
  }

  /**
   * Get all unlocked cycles
   */
  static getUnlockedCycles(state: number): number[] {
    const unlocked: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (this.isCycleUnlocked(state, i)) {
        unlocked.push(i);
      }
    }
    return unlocked;
  }

  /**
   * Get all pending proposals
   */
  static getPendingProposals(state: number): number[] {
    const pending: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (this.isProposalPending(state, i)) {
        pending.push(i);
      }
    }
    return pending;
  }

  /**
   * Get all approved proposals
   */
  static getApprovedProposals(state: number): number[] {
    const approved: number[] = [];
    for (let i = 0; i < 16; i++) {
      if (this.isProposalApproved(state, i)) {
        approved.push(i);
      }
    }
    return approved;
  }
}

