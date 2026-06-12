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
} from '../types/covenant-types';

export const STATE_SIZE_VAULT = 32;
export const STATE_SIZE_PROPOSAL = 40;
export const STATE_SIZE_SCHEDULE = 40;
export const STATE_SIZE_VOTE = 32;
export const STATE_SIZE_TALLY = 40;
export const STATE_SIZE_AIRDROP = 32;

export class StateEncodeError extends Error {
  constructor(family: string, reason: string) {
    super(`StateEncode[${family}]: ${reason}`);
    this.name = 'StateEncodeError';
  }
}

export class StateDecodeError extends Error {
  constructor(family: string, reason: string) {
    super(`StateDecode[${family}]: ${reason}`);
    this.name = 'StateDecodeError';
  }
}

function requireLength(family: string, buf: Buffer, expected: number): void {
  if (buf.length !== expected) {
    throw new StateDecodeError(family, `expected ${expected} bytes, got ${buf.length}`);
  }
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

function writeUInt40LE(buf: Buffer, value: bigint | number, offset: number): void {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  if (v < 0n || v > 0xffffffffffn) {
    throw new RangeError(`writeUInt40LE out of range: ${v}`);
  }
  buf.writeUInt32LE(Number(v & 0xffffffffn), offset);
  buf.writeUInt8(Number((v >> 32n) & 0xffn), offset + 4);
}

export function readUInt40LE(buf: Buffer, offset: number): bigint {
  if (offset < 0 || offset + 5 > buf.length) {
    throw new RangeError(`readUInt40LE out of range: offset=${offset} length=${buf.length}`);
  }
  const lo = BigInt(buf.readUInt32LE(offset));
  const hi = BigInt(buf.readUInt8(offset + 4));
  return (hi << 32n) | lo;
}

function requireBuffer(family: string, value: Buffer, expected: number, field: string): void {
  if (!Buffer.isBuffer(value)) {
    throw new StateEncodeError(family, `${field} must be a Buffer`);
  }
  if (value.length !== expected) {
    throw new StateEncodeError(family, `${field} must be ${expected} bytes, got ${value.length}`);
  }
}

export function encodeVaultState(state: VaultState): Buffer {
  requireBuffer('vault', state.rolesMask, 3, 'rolesMask');
  const buf = Buffer.alloc(STATE_SIZE_VAULT);
  buf.writeUInt8(state.version & 0xff, 0);
  buf.writeUInt8(state.status & 0xff, 1);
  state.rolesMask.copy(buf, 2);
  buf.writeUInt32LE(Number(state.currentPeriodId & 0xffffffffn), 5);
  buf.writeBigUInt64LE(state.spentThisPeriod, 9);
  buf.writeBigUInt64LE(state.lastUpdateTimestamp, 17);
  return buf;
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

export function encodeProposalState(state: ProposalState): Buffer {
  requireBuffer('proposal', state.payoutHash, 20, 'payoutHash');
  const buf = Buffer.alloc(STATE_SIZE_PROPOSAL);
  buf.writeUInt8(state.version & 0xff, 0);
  buf.writeUInt8(state.status & 0xff, 1);
  buf.writeUInt8(state.approvalCount & 0xff, 2);
  buf.writeUInt8(state.requiredApprovals & 0xff, 3);
  writeUInt40LE(buf, state.votingEndTimestamp, 4);
  writeUInt40LE(buf, state.executionTimelock, 9);
  state.payoutHash.copy(buf, 14);
  return buf;
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

export function encodeScheduleState(state: ScheduleState): Buffer {
  requireBuffer('schedule', state.recipientHash, 20, 'recipientHash');
  const buf = Buffer.alloc(STATE_SIZE_SCHEDULE);
  buf.writeUInt8(state.status & 0xff, 0);
  buf.writeUInt8(state.flags & 0xff, 1);
  buf.writeBigUInt64LE(state.totalReleased, 2);
  writeUInt40LE(buf, state.scheduleCursor, 10);
  writeUInt40LE(buf, state.pauseStart, 15);
  state.recipientHash.copy(buf, 20);
  return buf;
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

export function encodeVoteState(state: VoteState): Buffer {
  requireBuffer('vote', state.proposalIdPrefix, 4, 'proposalIdPrefix');
  const buf = Buffer.alloc(STATE_SIZE_VOTE);
  buf.writeUInt8(state.version & 0xff, 0);
  state.proposalIdPrefix.copy(buf, 1);
  buf.writeUInt8(state.voteChoice & 0xff, 5);
  writeUInt40LE(buf, state.lockTimestamp, 8);
  writeUInt40LE(buf, state.unlockTimestamp, 13);
  return buf;
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

export function encodeTallyState(state: TallyState): Buffer {
  requireBuffer('tally', state.proposalIdPrefix, 4, 'proposalIdPrefix');
  const buf = Buffer.alloc(STATE_SIZE_TALLY);
  buf.writeUInt8(state.version & 0xff, 0);
  buf.writeUInt8(state.status & 0xff, 1);
  state.proposalIdPrefix.copy(buf, 2);
  buf.writeUInt32LE(state.votesFor >>> 0, 6);
  buf.writeUInt32LE(state.votesAgainst >>> 0, 10);
  buf.writeUInt32LE(state.votesAbstain >>> 0, 14);
  buf.writeUInt32LE(state.quorumThreshold >>> 0, 18);
  writeUInt40LE(buf, state.tallyTimestamp, 22);
  return buf;
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

export function encodeAirdropState(state: AirdropState): Buffer {
  const buf = Buffer.alloc(STATE_SIZE_AIRDROP);
  buf.writeUInt8(state.version & 0xff, 0);
  buf.writeUInt8(state.status & 0xff, 1);
  buf.writeBigUInt64LE(state.totalClaimed, 2);
  buf.writeBigUInt64LE(state.claimsCount, 10);
  return buf;
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
