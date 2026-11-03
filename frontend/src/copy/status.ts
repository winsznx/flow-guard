import type { Tone } from '../components/ui/types';

export type StatusKey =
  | 'notFunded'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'finished'
  | 'cancelled'
  | 'failed'
  | 'readyToClaim'
  | 'outOfFunds'
  | 'openForClaims'
  | 'closed'
  | 'expired'
  | 'claimed'
  | 'notReleased'
  | 'paid'
  | 'draft'
  | 'waitingForApproval'
  | 'approved'
  | 'underReview'
  | 'blocked'
  | 'rejected'
  | 'running'
  | 'slow'
  | 'partlyDown'
  | 'down'
  | 'maintenance'
  | 'notChecked'
  | 'txWaitingForWallet'
  | 'txSent'
  | 'txConfirmed'
  | 'txDeclined'
  | 'networkMain'
  | 'networkTest'
  | 'beta'
  | 'sample';

export type StatusWord = { word: string; tone: Tone; icon?: 'check' | 'x' };

export const STATUS: Record<StatusKey, StatusWord> = {
  notFunded: { word: 'Not funded yet', tone: 'warning' },
  scheduled: { word: 'Scheduled', tone: 'info' },
  active: { word: 'Active', tone: 'success' },
  paused: { word: 'Paused', tone: 'warning' },
  finished: { word: 'Finished', tone: 'neutral' },
  cancelled: { word: 'Cancelled', tone: 'neutral' },
  failed: { word: 'Failed', tone: 'danger', icon: 'x' },
  readyToClaim: { word: 'Ready to claim', tone: 'success' },
  outOfFunds: { word: 'Out of funds', tone: 'warning' },
  openForClaims: { word: 'Open for claims', tone: 'success' },
  closed: { word: 'Closed', tone: 'neutral' },
  expired: { word: 'Expired', tone: 'neutral' },
  claimed: { word: 'Claimed', tone: 'neutral', icon: 'check' },
  notReleased: { word: 'Not released yet', tone: 'info' },
  paid: { word: 'Paid', tone: 'success', icon: 'check' },
  draft: { word: 'Draft', tone: 'neutral' },
  waitingForApproval: { word: 'Waiting for approval', tone: 'warning' },
  approved: { word: 'Approved', tone: 'success' },
  underReview: { word: 'Under review', tone: 'warning' },
  blocked: { word: 'Blocked', tone: 'danger', icon: 'x' },
  rejected: { word: 'Rejected', tone: 'danger', icon: 'x' },
  running: { word: 'Running', tone: 'success' },
  slow: { word: 'Slow', tone: 'warning' },
  partlyDown: { word: 'Partly down', tone: 'danger' },
  down: { word: 'Down', tone: 'danger' },
  maintenance: { word: 'Maintenance', tone: 'info' },
  notChecked: { word: 'Not checked', tone: 'neutral' },
  txWaitingForWallet: { word: 'Waiting for your wallet', tone: 'info' },
  txSent: { word: 'Sent, waiting for the network', tone: 'info' },
  txConfirmed: { word: 'Confirmed', tone: 'success' },
  txDeclined: { word: 'Declined', tone: 'neutral' },
  networkMain: { word: 'Bitcoin Cash', tone: 'neutral' },
  networkTest: { word: 'Test network', tone: 'warning' },
  beta: { word: 'Beta', tone: 'info' },
  sample: { word: 'Sample', tone: 'neutral' },
};

function lookup(map: Record<string, StatusKey>, raw: string | null | undefined): StatusKey | null {
  const key = (raw ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

const LIFECYCLE: Record<string, StatusKey> = {
  pending: 'notFunded',
  active: 'active',
  paused: 'paused',
  completed: 'finished',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  failed: 'failed',
};

/**
 * Streams, recurring payments, budget plans, bounties, reward programs, grants and batches.
 * A funded item whose start is still ahead reads "Scheduled".
 */
export function lifecycleStatus(
  raw: string | null | undefined,
  timing: { startsAt?: number | null; now?: number } = {},
): StatusKey | null {
  const key = lookup(LIFECYCLE, raw);
  const now = timing.now ?? Date.now();
  if (key === 'active' && timing.startsAt && timing.startsAt > now) return 'scheduled';
  return key;
}

const AIRDROP: Record<string, StatusKey> = {
  pending: 'notFunded',
  active: 'openForClaims',
  paused: 'paused',
  completed: 'closed',
  expired: 'expired',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function airdropStatus(raw: string | null | undefined): StatusKey | null {
  return lookup(AIRDROP, raw);
}

const MILESTONE: Record<string, StatusKey> = {
  pending: 'notReleased',
  released: 'paid',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function milestoneStatus(raw: string | null | undefined): StatusKey | null {
  return lookup(MILESTONE, raw);
}

const SPENDING_REQUEST: Record<string, StatusKey> = {
  pending: 'waitingForApproval',
  approved: 'approved',
  executed: 'paid',
  rejected: 'rejected',
  draft: 'draft',
  submitted: 'waitingForApproval',
  queued: 'approved',
  executable: 'approved',
};

export function spendingRequestStatus(raw: string | null | undefined): StatusKey | null {
  return lookup(SPENDING_REQUEST, raw);
}

const SERVICE: Record<string, StatusKey> = {
  operational: 'running',
  degraded: 'slow',
  partial_outage: 'partlyDown',
  major_outage: 'down',
  maintenance: 'maintenance',
  unknown: 'notChecked',
};

export function serviceStatus(raw: string | null | undefined): StatusKey {
  return lookup(SERVICE, raw) ?? 'notChecked';
}
