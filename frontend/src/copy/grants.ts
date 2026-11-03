import type { Asset } from '../components/ui/types';
import { getCachedTokenMeta } from '../utils/tokenMeta';
import { formatAddress, formatCount, plural } from './format';
import { NETWORK_ADJECTIVE, NETWORK_NAME } from './network';

type GrantAssetSource = {
  token_type: string;
  token_category?: string | null;
  token_decimals?: number | null;
};

const SMALLEST_UNITS = 'smallest units';

/**
 * A token asset. Null decimals means unknown: amounts are then whole base units,
 * so the unit reads "smallest units" instead of pairing raw numbers with a symbol.
 */
export function tokenAsset(tokenId: string, decimals: number | null, symbol?: string): Asset {
  const name = symbol?.trim();
  if (decimals === null) {
    return { kind: 'token', tokenId, symbol: name ? `${SMALLEST_UNITS} of ${name}` : SMALLEST_UNITS, decimals: 0 };
  }
  return { kind: 'token', tokenId, symbol: name, decimals };
}

/**
 * The asset a grant pays in. Amounts are stored scaled by the row's token_decimals, and the
 * server reads 0 or a missing value as 0, so only a positive value shifts the amount.
 */
export function grantAsset(grant: GrantAssetSource): Asset {
  if (grant.token_type === 'BCH' || !grant.token_category) return { kind: 'bch' };
  const meta = getCachedTokenMeta(grant.token_category);
  const stored = Number(grant.token_decimals);
  if (Number.isFinite(stored) && stored > 0) return tokenAsset(grant.token_category, stored, meta?.symbol);
  return tokenAsset(grant.token_category, meta?.decimals === 0 ? 0 : null, meta?.symbol);
}

export type GrantSegment = 'all' | 'receiving' | 'sending';
export type GrantRole = 'sender' | 'recipient' | 'viewer';

/** A party as the copy names it: "you", a name, or a short address. */
export type GrantParty = { address: string; isYou: boolean };

function party(who: GrantParty, position: 'start' | 'middle'): string {
  if (who.isYou) return position === 'start' ? 'You' : 'you';
  if (!who.address.trim()) return position === 'start' ? 'The recipient' : 'the recipient';
  return formatAddress(who.address, 'short');
}

export const GRANTS_PAGE = {
  title: 'Grants',
  description: 'Fund a project in milestones and release each part when the work is done.',
  create: 'Create grant',
  segmentLabel: 'Show grants',
  segments: [
    { value: 'all', label: 'All' },
    { value: 'receiving', label: 'Receiving' },
    { value: 'sending', label: 'Sending' },
  ] as { value: GrantSegment; label: string }[],
  statusLabel: 'Filter by status',
  searchLabel: 'Search grants',
  searchPlaceholder: 'Search by name, address or ID',
  listLabel: 'Grants',
  things: 'grants',
  loadFailed: "Your grants didn't load.",
  loadFailedReason: 'Check your connection and try again.',
  howItWorks: { label: 'How grants work', to: '/grants-info' },
  columns: {
    name: 'Grant',
    status: 'Status',
    amount: 'Promised in all',
    progress: 'Milestones',
  },
  tiles: {
    active: 'Active',
    notFunded: 'Not funded yet',
    promised: 'Promised in all',
    promisedToYou: 'Promised to you',
    released: 'Released so far',
    paidToYou: 'Paid to you so far',
    stillToCome: 'Still to come',
    stillToPay: 'Still to release',
    stillToReceive: 'Still coming to you',
  },
  partlyLoaded: {
    title: "Some of your grants didn't load",
    sent: "The grants you send didn't load. Only grants paying you are shown.",
    received: "The grants paying you didn't load. Only grants you send are shown.",
  },
  empty: {
    all: {
      title: 'No grants yet',
      description: 'A grant pays a project in steps. You lock the full amount, then release each milestone when the work is done.',
      example: 'pay a developer 0.5 BCH for each of 4 milestones.',
    },
    sending: {
      title: 'No grants yet',
      description: "You haven't created a grant yet.",
    },
    receiving: {
      title: 'No grants yet',
      description: 'Nobody is paying this wallet through a grant yet. When someone does, it shows up here.',
    },
  },
} as const;

export function grantTo(address: string): string {
  return `Grant to ${formatAddress(address, 'short')}`;
}

export function listMeta(role: GrantRole, other: string): string {
  return role === 'recipient' ? `From ${formatAddress(other, 'short')}` : `To ${formatAddress(other, 'short')}`;
}

export function milestonesPaid(paid: number, total: number): string {
  return `${paid} of ${formatCount(total, 'milestone', 'milestones')} paid`;
}

export function listStateLine(active: number, notFunded: number): string {
  const parts = [`${active} active`];
  if (notFunded > 0) parts.push(`${notFunded} not funded yet`);
  return parts.join(' · ');
}

export function notFundedSub(amount: string | null): string | undefined {
  return amount ? `${amount} not locked yet` : undefined;
}

export function tokenGrantsLeftOut(count: number): string {
  return `BCH grants only. ${formatCount(count, "token grant isn't", "token grants aren't")} counted.`;
}

export const GRANT_DETAIL = {
  breadcrumb: 'Grants',
  loadFailed: "This grant didn't load.",
  notFound: "We couldn't find this grant.",
  notFoundReason: 'Check the link, or go back to your grants.',
  backToGrants: 'Back to grants',
  stillToCome: 'Still to come',
  receivedSoFar: 'Paid to you so far',
  milestonesPanel: 'Milestones',
  activityPanel: 'Activity',
  detailsPanel: 'Details',
  whoPanel: 'Who can move the money',
  managePanel: 'Manage',
  fund: (amount: string) => `Fund ${amount}`,
  release: (amount: string) => `Release ${amount}`,
  pause: 'Pause grant',
  resume: 'Resume grant',
  cancel: 'Cancel grant',
  keep: 'Keep grant',
  changeRecipient: 'Change recipient',
  newRecipient: 'New recipient address',
  newRecipientHelper: 'The address that will receive every milestone not released yet.',
  newRecipientNeeded: 'Enter the new address to continue.',
  sameRecipient: 'This is already the recipient. Enter a different address.',
  shareLink: 'Share link',
  allPaid: 'Every milestone is paid.',
  cancelledLine: 'This grant was cancelled. Nothing more will be paid.',
  contractName: "This grant's contract",
  contract: 'Contract',
  fundingTransaction: 'Funding transaction',
  notFundedYet: 'Not funded yet',
  contractNotReady: "This grant's contract isn't ready yet. Refresh the page in a moment.",
} as const;

export const GRANT_DETAILS_LABELS = {
  from: 'From',
  to: 'To',
  paysIn: 'Pays in',
  perMilestone: 'Each milestone',
  total: 'Promised in all',
  pauseOrCancel: 'Can be paused or cancelled',
  changeRecipient: 'Recipient can be changed',
  created: 'Created',
  reference: 'Reference',
  yesBySender: 'Yes, by the sender',
  yesByRecipient: 'Yes, by the recipient',
  no: 'No',
} as const;

export function roleDescription(role: GrantRole, sender: GrantParty, recipient: GrantParty): string {
  if (role === 'sender') return 'You set this up. The money stays in a contract until you release each milestone.';
  if (role === 'recipient') {
    return `${party(sender, 'start')} set this up to pay your project. Each milestone is paid when they release it.`;
  }
  return `${party(sender, 'start')} set this up to pay ${party(recipient, 'middle')}. Only they can act on it.`;
}

export function promisedLine(amount: string | null): string {
  return amount ? `Promised in all: ${amount}` : 'Promised in all';
}

export function detailStateLine(paid: number, total: number, stillToCome: string | null): string {
  const count = milestonesPaid(paid, total);
  return stillToCome ? `${count} · ${stillToCome} still to come` : count;
}

export function nextMilestoneLine(number: number, title: string | null): string {
  return title ? `Next: milestone ${number}, ${title}` : `Next: milestone ${number}`;
}

export function shareLine(recipient: GrantParty): string {
  return `Send this link to ${party(recipient, 'middle')}. They'll see each milestone and when it's paid.`;
}

export function waitingLine(role: GrantRole, status: 'notFunded' | 'active' | 'paused', sender: GrantParty, amount: string | null): string {
  if (status === 'notFunded') return `Waiting for ${party(sender, 'middle')} to fund this grant.`;
  if (status === 'paused') {
    return role === 'recipient'
      ? 'The sender paused this grant. Milestones can be released again when they resume it.'
      : 'This grant is paused. Nothing can be released until it resumes.';
  }
  if (role === 'recipient') {
    return amount
      ? `The next ${amount} goes straight to your wallet when ${party(sender, 'middle')} releases it.`
      : `The next milestone goes straight to your wallet when ${party(sender, 'middle')} releases it.`;
  }
  return `${party(sender, 'start')} releases each milestone when the work is done.`;
}

export const PAUSED_NOTICE = {
  title: 'This grant is paused',
  sender: 'Nothing can be released until you resume it.',
  recipient: 'The sender paused this grant. Milestones can be released again when they resume it.',
} as const;

export function whoCanMoveTheMoney(role: GrantRole, sender: GrantParty, recipient: GrantParty, cancelable: boolean): string[] {
  const lines = [
    role === 'recipient'
      ? `Only you receive these milestones. ${party(sender, 'start')} releases each one from their wallet.`
      : role === 'sender'
        ? `Only ${party(recipient, 'middle')} receives these milestones. You release each one from your wallet.`
        : `Only ${party(recipient, 'middle')} receives these milestones. ${party(sender, 'start')} releases each one.`,
    "Each milestone release also needs FlowGuard's server to approve it.",
  ];
  if (cancelable) {
    lines.push(
      role === 'sender'
        ? 'You can pause or cancel. If you cancel, the milestones already released stay paid and the rest comes back to you.'
        : 'The sender can pause or cancel. Milestones already released stay paid.',
    );
  }
  return lines;
}

export const GRANT_REVIEW = {
  fundNext: 'Your grant is funded. Release the first milestone when the work is done.',
  releaseNext: 'The milestone went to the recipient.',
  pauseTitle: 'Pause this grant?',
  pauseNext: 'Your grant is paused.',
  resumeTitle: 'Resume this grant?',
  resumeNext: 'Your grant is running again.',
  cancelTitle: 'Cancel this grant?',
  cancelNext: 'Your grant is cancelled.',
  changeRecipientTitle: 'Change who receives this grant?',
  changeRecipientNext: 'Milestones not released yet now go to the new address.',
  changeRecipientBody: 'Every milestone not released yet will go to the new address, and you stop receiving them. Check it carefully.',
  whoCanStopSender: 'You, the sender',
  whoCanStopNobody: 'Nobody. It runs until every milestone is released.',
} as const;

export function releaseConsequence(amount: string, recipient: GrantParty): string {
  return `${amount} goes from the grant's contract to ${party(recipient, 'middle')}. You can't take it back.`;
}

export function pauseConsequence(recipient: GrantParty): string {
  return `While it's paused, no milestone can be released to ${party(recipient, 'middle')}. You can resume it later, or cancel it to get the rest back.`;
}

export function resumeConsequence(recipient: GrantParty): string {
  return `Milestones can be released to ${party(recipient, 'middle')} again. Nothing is paid until you release it.`;
}

export function cancelConsequence(recipient: GrantParty, kept: string | null, back: string | null): string {
  const keeps = kept ? `${party(recipient, 'start')} keeps the ${kept} already released.` : `${party(recipient, 'start')} hasn't been paid anything yet.`;
  const returns = back ? ` The other ${back} comes back to your wallet.` : ' The rest comes back to your wallet.';
  return `${keeps}${returns} This can't be undone.`;
}

export function releasePlan(number: number, title: string | null, amount: string, recipient: GrantParty): string {
  const named = title ? `milestone ${number}, ${title}` : `milestone ${number}`;
  return `Release ${named}: ${amount} to ${party(recipient, 'middle')}.`;
}

export const CREATE_GRANT = {
  title: 'Create a grant',
  description: "Lock the full amount, split it into milestones, and release each one when it's done.",
  backToGrants: 'Back to grants',
  steps: [
    { key: 'who', label: 'Who and how much' },
    { key: 'milestones', label: 'Milestones' },
    { key: 'review', label: 'Check and approve' },
  ],
  name: 'Grant name',
  namePlaceholder: 'For example, Wallet connector work',
  nameHelper: "Shown on the grant's page, to you and the recipient.",
  nameMissing: 'Add a name for this grant.',
  about: 'What it pays for',
  aboutPlaceholder: "For example, the work, how you'll judge each milestone, and the timeline",
  recipient: 'Recipient address',
  recipientHelper: `The ${NETWORK_ADJECTIVE} address that will receive each milestone.`,
  recipientMissing: 'Add the address that will receive the money.',
  paysIn: 'Pays in',
  paysInOptions: {
    bch: { title: 'BCH', description: 'Each milestone pays BCH.' },
    token: { title: 'A token', description: 'Each milestone pays a token from your wallet.' },
  },
  tokenId: 'Token ID',
  tokenIdHelper: 'The long code that identifies a token. You can copy it from your wallet.',
  tokenIdMissing: 'Enter the token ID.',
  tokenFormat: 'Token IDs are 64 characters, using 0 to 9 and a to f. Check that you copied all of it.',
  tokenNotFound: `We couldn't find a token with this ID on ${NETWORK_NAME}. Check the ID.`,
  tokenUnavailable: "We couldn't check this token right now. Try again in a moment.",
  tokenChecking: 'Checking this token',
  tokenFound: (symbol: string | null) =>
    `Found ${symbol ?? 'this token'}. Your wallet needs the full amount of it when you fund the grant.`,
  amount: 'Each milestone pays',
  amountHelper: "Every milestone pays this amount. It can't change after you create the grant.",
  amountHelperBase:
    "We couldn't read this token's decimals, so enter the amount in its smallest unit. For a token with 2 decimals, 100 means 1.00.",
  amountNeedsToken: 'Enter the token ID first. The amount is in that token.',
  amountMissing: 'Enter an amount above 0.',
  milestones: 'Milestones',
  milestoneTitle: (n: number) => `Milestone ${n}`,
  milestonePlaceholder: 'For example, First working version',
  milestoneAbout: 'What has to be done',
  milestoneAboutPlaceholder: 'For example, Passing tests and a short demo',
  addMilestone: 'Add milestone',
  milestonesHelper: 'The contract only counts how many milestones are released. FlowGuard keeps these names and notes.',
  maxMilestones: 'You can have up to 255 milestones.',
  rules: 'Rules',
  cancelable: 'You can pause or cancel this later',
  cancelableOn: 'If you cancel, the recipient keeps the milestones already released and the rest comes back to you.',
  cancelableOff: "Once funded, you can't pause or cancel. The money stays in the contract until you release every milestone.",
  transferable: 'The recipient can change their address',
  transferableOn: 'The recipient can send milestones not released yet to a different address.',
  transferableOff: 'Every milestone goes to the address above.',
  reviewPanel: 'Check your grant',
  review: {
    name: 'Name',
    recipient: 'Recipient',
    paysIn: 'Pays in',
    perMilestone: 'Each milestone',
    milestones: 'Milestones',
    total: 'Promised in all',
    pauseOrCancel: 'You can pause or cancel',
    changeRecipient: 'Recipient can change their address',
    yes: 'Yes',
    no: 'No',
  },
  continue: 'Continue',
  back: 'Back',
  submit: 'Continue to funding',
  submitting: 'Creating grant',
  submitFailed: "Couldn't create the grant",
  fieldsNeedFixing: 'Some fields need fixing. Nothing was sent.',
  clearForm: 'Clear form',
  clearTitle: 'Clear this form?',
  clearBody: 'Everything you entered for this grant will be removed. Nothing was sent.',
  clearing: 'Clearing',
  keepEditing: 'Keep editing',
} as const;

export function nextFundingLine(total: string | null): string {
  return total
    ? `Next, you'll approve one transaction in your wallet to lock ${total} in a contract.`
    : "Next, you'll approve one transaction in your wallet to lock the money in a contract.";
}

export function milestoneTotalLine(count: number, each: string | null, total: string | null): string {
  if (!each || !total) return formatCount(count, 'milestone', 'milestones');
  return `${formatCount(count, 'milestone', 'milestones')} of ${each}. Total: ${total}`;
}

export function milestoneCount(count: number): string {
  return `${count} ${plural(count, 'milestone', 'milestones')}`;
}
