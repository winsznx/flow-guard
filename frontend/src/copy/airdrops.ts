import { formatCount } from './format';
import { airdropStatus, type StatusKey } from './status';

type AirdropCounts = {
  status: string;
  amount_per_claim: number;
  total_amount: number;
  total_recipients: number;
  claimed_count: number;
  start_date: number;
  end_date?: number | null;
};

/** The server's share count (the recipient list, or pool / share at create), or pool / share when it has none. */
export function airdropShareCount(airdrop: AirdropCounts): number {
  const recipients = Number(airdrop.total_recipients);
  if (recipients > 0) return recipients;
  const share = Number(airdrop.amount_per_claim);
  return share > 0 ? Math.floor(Number(airdrop.total_amount) / share + 1e-9) : 0;
}

/** No share left once one more claim would take more than the pool holds. */
export function airdropPoolEmpty(airdrop: AirdropCounts): boolean {
  const share = Number(airdrop.amount_per_claim);
  return share > 0 && (Number(airdrop.claimed_count) + 1) * share > Number(airdrop.total_amount) + 1e-9;
}

/** The pill for an airdrop, from the stored status plus the dates and what's left in the pool. */
export function airdropPill(airdrop: AirdropCounts, nowSeconds: number): StatusKey {
  const base = airdropStatus(airdrop.status) ?? 'openForClaims';
  if (base !== 'openForClaims') return base;
  if (airdrop.end_date && airdrop.end_date <= nowSeconds) return 'expired';
  if (airdropPoolEmpty(airdrop)) return 'closed';
  if (airdrop.start_date > nowSeconds) return 'scheduled';
  return base;
}

/** VOICE section 4. Never "anyone with the link": open airdrops are listed on FlowGuard. */
export const AIRDROP_ACCESS =
  'Anyone can claim, once per wallet, including people who find it on FlowGuard. Share the link to tell people about it.';
export const AIRDROP_COSIGN = "Each claim also needs FlowGuard's server to approve it.";
export const AIRDROP_FEE_FROM_POOL = 'The network fee for each claim is paid from the airdrop, not the wallet that claims.';

export const AIRDROPS_PAGE = {
  title: 'Airdrops',
  description: 'Send BCH or tokens that many people can claim with one link.',
  create: 'Create airdrop',
  viewLabel: 'Show airdrops',
  views: { sent: 'Sent by you', toClaim: 'To claim' },
  toClaimLine: 'Open airdrops from everyone on FlowGuard. Some may have nothing left for you to claim.',
  filterLabel: 'Filter by status',
  filterAll: 'All',
  searchLabel: 'Search airdrops',
  searchPlaceholder: 'Search by name',
  listLabel: 'Airdrops',
  noResultsThing: 'airdrops',
  columns: {
    airdrop: 'Airdrop',
    status: 'Status',
    claimed: 'Shares claimed',
    share: 'Each share',
    closes: 'Closes',
  },
  stats: {
    open: 'Open for claims',
    shares: 'Shares claimed',
    claimedBch: 'Claimed so far',
  },
  copyLink: 'Copy link',
  copyLinkFor: (title: string) => `Copy link for ${title}`,
  closesOn: 'Closes',
  noClose: 'No closing date',
  error: {
    title: "Your airdrops didn't load.",
    reason: 'Check your connection and try again.',
  },
  empty: {
    sent: {
      title: 'No airdrops yet',
      description: 'Send BCH or tokens to many people with one link.',
      example: 'give 0.01 BCH to each of the first 100 people at your meetup.',
    },
    toClaim: {
      title: 'Nothing to claim right now',
      description: 'When an open airdrop has a share you can claim, it shows up here.',
    },
  },
  howItWorks: 'How airdrops work',
} as const;

export function sharesClaimed(claimed: number, total: number): string {
  return `${claimed} of ${formatCount(total, 'share', 'shares')} claimed`;
}

export function fromSender(shortAddress: string): string {
  return `From ${shortAddress}`;
}

export function tokenAirdropsLeftOut(count: number): string {
  return `${formatCount(count, 'token airdrop', 'token airdrops')} not counted`;
}

export const CREATE_AIRDROP = {
  title: 'Create an airdrop',
  description: 'Fund one pool and share a link. Each wallet claims its share.',
  back: 'Back to airdrops',
  steps: {
    what: 'What you send',
    when: 'When people can claim',
    check: 'Check and approve',
  },
  name: {
    label: 'Name',
    helper: 'People see this when they open the claim link.',
    placeholder: 'For example, Meetup thank-you',
    missing: 'Give the airdrop a name.',
  },
  message: {
    label: 'Message',
    helper: 'Shown to everyone who opens the claim link.',
    placeholder: 'For example, Thanks for coming to the meetup.',
  },
  asset: {
    legend: 'What to send',
    bch: { title: 'BCH', description: 'Send Bitcoin Cash from your wallet.' },
    token: { title: 'A token', description: 'Send a token from this wallet.' },
  },
  tokenId: {
    label: 'Token ID',
    helper: 'The long code that identifies the token. You can copy it from your wallet.',
    missing: 'Enter the token ID.',
    format: 'A token ID is 64 letters and numbers. Check that you copied all of it.',
    found: (name: string) => `Found ${name}.`,
    noDetails: 'This token has no published details, so amounts are in whole token units.',
  },
  share: {
    label: 'Each share',
    helper: 'How much one wallet can claim.',
    missing: 'Enter an amount above 0.',
  },
  pool: {
    label: 'Pool',
    helper: 'The total you lock in the contract. Each claim is paid from it.',
    missing: 'Enter an amount above 0.',
    tooSmall: 'The pool has to cover at least one share.',
  },
  capacity: (count: number) =>
    `Up to ${formatCount(count, 'wallet', 'wallets')}. The network fee for each claim also comes out of the pool, so fewer wallets may be able to claim.`,
  start: {
    label: 'Opens',
    helper: 'People can claim from the start of this day.',
    missing: 'Choose the day claims open.',
  },
  end: {
    label: 'Closes',
    helper: 'Leave this empty to keep it open until every share is claimed or you cancel it.',
    beforeStart: 'Choose a closing day after the opening day.',
  },
  whoCanMove: `Anyone can claim one share per wallet. ${AIRDROP_COSIGN} You can cancel it to get the rest back.`,
  next: (amount: string) => `Next, you'll approve one transaction in your wallet to lock ${amount} in a contract.`,
  nextUnknown: "Next, you'll approve one transaction in your wallet to lock the pool in a contract.",
  submit: 'Continue to funding',
  busy: 'Creating airdrop',
  errorTitle: "Couldn't create the airdrop",
  fieldErrors: 'Some fields need fixing. Nothing was sent from your wallet.',
  continueLabel: 'Continue',
  backLabel: 'Back',
} as const;

export const AIRDROP_DETAIL = {
  back: 'Airdrops',
  loading: 'Loading this airdrop',
  notFound: {
    title: "We couldn't find this airdrop.",
    reason: 'It may have been removed, or the link is wrong.',
  },
  loadFailed: {
    title: "This airdrop didn't load.",
    reason: 'Check your connection and try again.',
  },
  backToList: 'Back to airdrops',
  description: {
    sender: 'Share the link so people find it. Each wallet claims its share from the pool.',
    viewer: (sender: string, share: string) => `${sender} set up this airdrop. Each wallet can claim ${share} once.`,
    viewerNoShare: (sender: string) => `${sender} set up this airdrop. Each wallet can claim one share.`,
  },
  stateLine: (claimed: number, total: number, until: string | null) =>
    `${claimed} of ${formatCount(total, 'share', 'shares')} claimed · ${
      until ? `open until ${until}` : "open until it's closed or the pool runs out"
    }`,
  yourShare: 'Your share',
  pool: 'Pool',
  fund: (amount: string) => `Fund ${amount}`,
  fundGeneric: 'Fund airdrop',
  claim: (amount: string) => `Claim ${amount}`,
  claimGeneric: 'Claim your share',
  signInFirst: 'Your wallet may ask you to sign in first. It is free and moves no money.',
  notFundedNotice: {
    title: 'Not funded yet',
    sender: 'Nothing has left your wallet yet. Fund it so people can start claiming.',
    others: "This airdrop isn't funded yet. Nothing can be claimed until the sender funds it.",
  },
  notStarted: (date: string) => `Claims open on ${date}.`,
  paused: "The sender paused this airdrop. Nothing can be claimed while it's paused.",
  pausedSender: 'You paused this airdrop. Nothing can be claimed until you resume it.',
  notOnList: "This wallet isn't on the list of wallets that can claim this airdrop.",
  checkFailed: "We couldn't check whether this wallet can claim. Refresh the page to try again.",
  checking: 'Checking whether this wallet can claim',
  activity: 'Activity',
  details: 'Details',
  detailLabels: {
    from: 'From',
    token: 'Token',
    share: 'Each share',
    pool: 'Pool',
    claimed: 'Shares claimed',
    opens: 'Opens',
    closes: 'Closes',
    contract: 'Contract address',
    funding: 'Funding transaction',
  },
  whoCanMove: (isSender: boolean) =>
    isSender
      ? `Anyone can claim one share per wallet. ${AIRDROP_COSIGN} You can cancel it to get the rest back.`
      : `Anyone can claim one share per wallet. ${AIRDROP_COSIGN} The sender can cancel it and get the rest back.`,
  shareField: 'Claim link',
  manage: 'Manage',
  pause: 'Pause airdrop',
  resume: 'Resume airdrop',
  cancel: 'Cancel airdrop',
  keep: 'Keep airdrop',
  review: {
    pauseTitle: 'Pause this airdrop?',
    pauseBody: "While it's paused, nobody can claim. You can resume it later, or cancel it to get the rest back.",
    pausedNext: 'Your airdrop is paused.',
    resumeTitle: 'Resume this airdrop?',
    resumeBody: 'People can claim their shares again.',
    resumedNext: 'Your airdrop is open for claims again.',
    cancelTitle: 'Cancel this airdrop?',
    cancelBody: (back: string | null) =>
      back
        ? `People who already claimed keep their shares. The other ${back} comes back to your wallet. This can't be undone.`
        : "People who already claimed keep their shares. The rest comes back to your wallet. This can't be undone.",
    whoCanStop: 'Only you, the sender',
    contractName: "This airdrop's contract",
    claimFee: 'Paid from the airdrop',
    reserveFee: (amount: string) => `A small network fee, plus about ${amount} set aside in the contract for claim fees`,
    fundedNext: 'Copy the claim link and send it to the people you want to reach.',
    claimedNext: 'It shows in your wallet in a moment.',
    cancelledNext: 'The rest of the pool is on its way back to your wallet.',
  },
} as const;
