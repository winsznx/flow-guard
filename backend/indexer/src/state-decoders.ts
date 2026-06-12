import {
  AirdropState,
  AirdropStatus,
  ProposalState,
  ProposalStatus,
  ScheduleState,
  ScheduleStatus,
  TallyState,
  TallyStatus,
  VaultState,
  VaultStatus,
  VoteChoice,
  VoteState,
} from '@flowguard/shared/types';

export const STATE_SIZE_VAULT = 32;
export const STATE_SIZE_PROPOSAL = 40;
export const STATE_SIZE_SCHEDULE = 40;
export const STATE_SIZE_VOTE = 32;
export const STATE_SIZE_TALLY = 40;
export const STATE_SIZE_AIRDROP = 32;

export class StateDecodeError extends Error {
  constructor(family: string, reason: string) {
    super(`StateDecode[${family}]: ${reason}`);
    this.name = 'StateDecodeError';
  }
}

function requireLength(family: string, buf: Buffer, expected: number): void {
  if (buf.length !== expected) {
    throw new StateDecodeError(
      family,
      `expected ${expected} bytes, got ${buf.length}`,
    );
  }
}

// Buffer.readUIntLE caps at 6 bytes and returns a JS number that can lose
// precision above 2^48. Compose the 5-byte value from a 4-byte low half and
// a 1-byte high half so the result is always exact, then return as bigint.
export function readUInt40LE(buf: Buffer, offset: number): bigint {
  if (offset < 0 || offset + 5 > buf.length) {
    throw new RangeError(
      `readUInt40LE out of range: offset=${offset} length=${buf.length}`,
    );
  }
  const lo = BigInt(buf.readUInt32LE(offset));
  const hi = BigInt(buf.readUInt8(offset + 4));
  return (hi << 32n) | lo;
}

function assertEnum<T extends Record<string, string | number>>(
  family: string,
  enumObj: T,
  value: number,
  field: string,
): void {
  if (!(value in enumObj)) {
    throw new StateDecodeError(family, `unknown ${field}: ${value}`);
  }
}

export function decodeVaultState(commitment: Buffer): VaultState {
  requireLength('vault', commitment, STATE_SIZE_VAULT);
  const version = commitment.readUInt8(0);
  const status = commitment.readUInt8(1);
  assertEnum('vault', VaultStatus, status, 'status');
  return {
    version,
    status: status as VaultStatus,
    rolesMask: Buffer.from(commitment.subarray(2, 5)),
    currentPeriodId: BigInt(commitment.readUInt32LE(5)),
    spentThisPeriod: commitment.readBigUInt64LE(9),
    lastUpdateTimestamp: commitment.readBigUInt64LE(17),
  };
}

export function decodeProposalState(commitment: Buffer): ProposalState {
  requireLength('proposal', commitment, STATE_SIZE_PROPOSAL);
  const status = commitment.readUInt8(1);
  assertEnum('proposal', ProposalStatus, status, 'status');
  return {
    version: commitment.readUInt8(0),
    status: status as ProposalStatus,
    approvalCount: commitment.readUInt8(2),
    requiredApprovals: commitment.readUInt8(3),
    votingEndTimestamp: Number(readUInt40LE(commitment, 4)),
    executionTimelock: Number(readUInt40LE(commitment, 9)),
    payoutHash: Buffer.from(commitment.subarray(14, 34)),
  };
}

export function decodeScheduleState(commitment: Buffer): ScheduleState {
  requireLength('schedule', commitment, STATE_SIZE_SCHEDULE);
  const status = commitment.readUInt8(0);
  assertEnum('schedule', ScheduleStatus, status, 'status');
  const flags = commitment.readUInt8(1);
  return {
    status: status as ScheduleStatus,
    flags,
    cancelable: (flags & 0b001) !== 0,
    transferable: (flags & 0b010) !== 0,
    usesTokens: (flags & 0b100) !== 0,
    totalReleased: commitment.readBigUInt64LE(2),
    scheduleCursor: Number(readUInt40LE(commitment, 10)),
    pauseStart: Number(readUInt40LE(commitment, 15)),
    recipientHash: Buffer.from(commitment.subarray(20, 40)),
  };
}

export function decodeVoteState(commitment: Buffer): VoteState {
  requireLength('vote', commitment, STATE_SIZE_VOTE);
  const voteChoice = commitment.readUInt8(5);
  assertEnum('vote', VoteChoice, voteChoice, 'voteChoice');
  return {
    version: commitment.readUInt8(0),
    proposalIdPrefix: Buffer.from(commitment.subarray(1, 5)),
    voteChoice: voteChoice as VoteChoice,
    lockTimestamp: Number(readUInt40LE(commitment, 8)),
    unlockTimestamp: Number(readUInt40LE(commitment, 13)),
  };
}

export function decodeTallyState(commitment: Buffer): TallyState {
  requireLength('tally', commitment, STATE_SIZE_TALLY);
  const status = commitment.readUInt8(1);
  assertEnum('tally', TallyStatus, status, 'status');
  return {
    version: commitment.readUInt8(0),
    status: status as TallyStatus,
    proposalIdPrefix: Buffer.from(commitment.subarray(2, 6)),
    votesFor: commitment.readUInt32LE(6),
    votesAgainst: commitment.readUInt32LE(10),
    votesAbstain: commitment.readUInt32LE(14),
    quorumThreshold: commitment.readUInt32LE(18),
    tallyTimestamp: Number(readUInt40LE(commitment, 22)),
  };
}

export function decodeAirdropState(commitment: Buffer): AirdropState {
  requireLength('airdrop', commitment, STATE_SIZE_AIRDROP);
  const status = commitment.readUInt8(1);
  assertEnum('airdrop', AirdropStatus, status, 'status');
  return {
    version: commitment.readUInt8(0),
    status: status as AirdropStatus,
    totalClaimed: commitment.readBigUInt64LE(2),
    claimsCount: commitment.readBigUInt64LE(10),
  };
}
