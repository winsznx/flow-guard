/**
 * Stream Service
 * Handles streaming payment logic and vesting calculations
 */

export interface Stream {
  id: string;
  stream_id: string;
  vault_id: string;
  batch_id?: string;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  withdrawn_amount: number;
  stream_type: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
  start_time: number;
  end_time?: number;
  interval_seconds?: number;
  amount_per_interval?: number;
  step_amount?: number;
  hybrid_unlock_time?: number;
  hybrid_upfront_amount?: number;
  schedule_count?: number;
  tranche_schedule?: Array<{
    unlock_time: number;
    amount: number;
    cumulative_amount: number;
  }>;
  cliff_timestamp?: number;
  effective_start_time?: number;
  pause_started_at?: number;
  next_payment_time?: number;
  schedule_template?: string;
  launch_source?: string;
  launch_title?: string;
  launch_description?: string;
  preferred_lane?: string;
  launch_context?: {
    source: string;
    title?: string;
    description?: string;
    preferredLane?: string;
  };
  cancelable: boolean;
  transferable: boolean;
  refillable: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  created_at: number;
  updated_at: number;
}

export interface StreamClaim {
  id: string;
  stream_id: string;
  recipient: string;
  amount: number;
  claimed_at: number;
  tx_hash?: string;
}

export interface StreamWithVested extends Stream {
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
}

export class StreamService {
  /**
   * Compute vested amount for a stream based on current time
   * Uses linear vesting formula: vested = total * (elapsed / duration)
   */
  computeVestedAmount(stream: Stream): number {
    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const effectiveStart = stream.effective_start_time ?? stream.start_time;
    const vestingNow = stream.status === 'PAUSED'
      ? Math.max(effectiveStart, stream.pause_started_at ?? now)
      : now;

    // Stream not started yet
    if (vestingNow < effectiveStart) {
      return 0;
    }

    // Before cliff period
    if (stream.cliff_timestamp && vestingNow < stream.cliff_timestamp) {
      return 0;
    }

    if (stream.status === 'CANCELLED' || stream.status === 'COMPLETED') {
      return stream.withdrawn_amount;
    }

    // Recurring streams vest one fixed tranche per completed interval.
    if (
      stream.stream_type === 'RECURRING' &&
      stream.interval_seconds &&
      stream.amount_per_interval !== undefined
    ) {
      const intervalsPassed = Math.max(0, Math.floor((vestingNow - effectiveStart) / stream.interval_seconds));
      return Math.min(intervalsPassed * stream.amount_per_interval, stream.total_amount);
    }

    // Step vesting unlocks at milestone boundaries rather than continuously.
    if (
      stream.stream_type === 'STEP' &&
      stream.interval_seconds &&
      stream.step_amount !== undefined
    ) {
      const completedSteps = Math.max(0, Math.floor((vestingNow - effectiveStart) / stream.interval_seconds));
      return Math.min(completedSteps * stream.step_amount, stream.total_amount);
    }

    if (stream.stream_type === 'TRANCHE' && stream.tranche_schedule?.length) {
      const cursor = stream.effective_start_time ?? stream.start_time;
      const timeShift = Math.max(0, cursor - stream.start_time);
      const effectiveNow = vestingNow - timeShift;
      let vestedTotal = 0;

      for (const tranche of stream.tranche_schedule) {
        if (effectiveNow >= tranche.unlock_time) {
          vestedTotal = tranche.cumulative_amount;
        }
      }

      return Math.min(vestedTotal, stream.total_amount);
    }

    if (
      stream.stream_type === 'HYBRID' &&
      stream.hybrid_unlock_time !== undefined &&
      stream.hybrid_upfront_amount !== undefined
    ) {
      if (!stream.end_time) {
        return stream.total_amount;
      }

      const cursor = stream.effective_start_time ?? stream.start_time;
      const timeShift = Math.max(0, cursor - stream.start_time);
      const effectiveNow = vestingNow - timeShift;
      const unlockTime = stream.hybrid_unlock_time;
      const upfrontAmount = Math.max(0, Math.min(stream.hybrid_upfront_amount, stream.total_amount));

      if (effectiveNow < unlockTime) {
        return 0;
      }
      if (effectiveNow >= stream.end_time) {
        return stream.total_amount;
      }

      const remainingAmount = Math.max(0, stream.total_amount - upfrontAmount);
      const linearDuration = Math.max(0, stream.end_time - unlockTime);
      if (linearDuration <= 0) {
        return stream.total_amount;
      }

      const linearElapsed = Math.max(0, effectiveNow - unlockTime);
      const vested = upfrontAmount + ((remainingAmount * linearElapsed) / linearDuration);
      return Math.min(stream.total_amount, vested);
    }

    // No end time = perpetual unlock for non-recurring stream shapes.
    if (!stream.end_time) {
      return stream.total_amount;
    }

    // Stream completed
    if (vestingNow >= stream.end_time) {
      return stream.total_amount;
    }

    // Linear vesting calculation
    const elapsed = vestingNow - effectiveStart;
    const duration = stream.end_time - effectiveStart;

    if (duration <= 0) {
      return stream.total_amount;
    }

    const vested = (stream.total_amount * elapsed) / duration;
    return Math.min(vested, stream.total_amount);
  }

  /**
   * Get claimable amount (vested - already withdrawn)
   */
  getClaimableAmount(stream: Stream): number {
    if (stream.status !== 'ACTIVE') {
      return 0;
    }

    if (
      stream.stream_type === 'RECURRING' &&
      stream.interval_seconds &&
      stream.amount_per_interval !== undefined
    ) {
      const now = Math.floor(Date.now() / 1000);
      const nextPaymentTime = stream.next_payment_time
        ?? (stream.start_time + stream.interval_seconds);
      const remainingFundedPool = Math.max(0, stream.total_amount - stream.withdrawn_amount);

      if (now < nextPaymentTime) {
        return 0;
      }
      if (stream.end_time && stream.end_time > 0 && nextPaymentTime > stream.end_time) {
        return 0;
      }

      return remainingFundedPool >= stream.amount_per_interval
        ? stream.amount_per_interval
        : 0;
    }

    const vested = this.computeVestedAmount(stream);
    const claimable = vested - stream.withdrawn_amount;
    return Math.max(0, claimable); // Never negative
  }

  /**
   * Get progress percentage (0-100)
   */
  getProgressPercentage(stream: Stream): number {
    if (stream.total_amount === 0) return 0;

    const vested = this.computeVestedAmount(stream);
    const percentage = (vested / stream.total_amount) * 100;
    return Math.min(100, Math.max(0, percentage));
  }

  /**
   * Enrich stream with computed vested amounts
   */
  enrichStream(stream: Stream): StreamWithVested {
    const vested_amount = this.computeVestedAmount(stream);
    const claimable_amount = this.getClaimableAmount(stream);
    const progress_percentage = this.getProgressPercentage(stream);

    return {
      ...stream,
      vested_amount,
      claimable_amount,
      progress_percentage,
    };
  }

  /**
   * Enrich multiple streams
   */
  enrichStreams(streams: Stream[]): StreamWithVested[] {
    return streams.map(stream => this.enrichStream(stream));
  }

  /**
   * Generate human-readable stream ID
   * Format: #FG-BCH-001, #FG-TOK-042
   */
  generateStreamId(tokenType: 'BCH' | 'CASHTOKENS', sequence: number): string {
    const prefix = tokenType === 'BCH' ? 'BCH' : 'TOK';
    const paddedSequence = sequence.toString().padStart(3, '0');
    return `#FG-${prefix}-${paddedSequence}`;
  }

  /**
   * Check if stream can be claimed
   */
  canClaim(stream: Stream): boolean {
    if (stream.status !== 'ACTIVE') return false;
    const claimable = this.getClaimableAmount(stream);
    return claimable > 0;
  }

  /**
   * Check if stream can be cancelled
   */
  canCancel(stream: Stream, sender: string): boolean {
    if (!sender) return false;
    if (stream.status !== 'ACTIVE' && stream.status !== 'PAUSED') return false;
    if (!stream.cancelable) return false;
    if (stream.sender.toLowerCase() !== sender.toLowerCase()) return false;
    return true;
  }

  /**
   * Calculate total claimable across multiple streams
   */
  getTotalClaimable(streams: Stream[]): number {
    return streams.reduce((total, stream) => {
      return total + this.getClaimableAmount(stream);
    }, 0);
  }

  /**
   * Get stream status with additional context
   */
  getStreamStatus(stream: Stream): {
    status: string;
    label: string;
    color: string;
  } {
    const now = Math.floor(Date.now() / 1000);

    if (stream.status === 'CANCELLED') {
      return { status: 'CANCELLED', label: 'Cancelled', color: 'red' };
    }

    if (stream.status === 'PAUSED') {
      return { status: 'PAUSED', label: 'Paused', color: 'yellow' };
    }

    if (stream.status === 'COMPLETED') {
      return { status: 'COMPLETED', label: 'Completed', color: 'green' };
    }

    // Active stream
    if (now < stream.start_time) {
      return { status: 'PENDING', label: 'Scheduled', color: 'blue' };
    }

    if (stream.cliff_timestamp && now < stream.cliff_timestamp) {
      return { status: 'CLIFF', label: 'Cliff Period', color: 'purple' };
    }

    if (stream.end_time && now >= stream.end_time) {
      return { status: 'ENDED', label: 'Ended', color: 'gray' };
    }

    return { status: 'STREAMING', label: 'Streaming', color: 'green' };
  }
}

// Export singleton instance
export const streamService = new StreamService();
