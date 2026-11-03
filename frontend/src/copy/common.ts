export const ACTIONS = {
  connectWallet: 'Connect wallet',
  connectAgain: 'Connect again',
  disconnect: 'Disconnect',
  tryAgain: 'Try again',
  copyAddress: 'Copy address',
  copyLink: 'Copy link',
  copyId: 'Copy ID',
  copyTokenId: 'Copy token ID',
  viewTransaction: 'View transaction',
  clearFilters: 'Clear filters',
  clearSearch: 'Clear search',
  openApp: 'Open app',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  close: 'Close',
  back: 'Back',
  continue: 'Continue',
  keepEditing: 'Keep editing',
  leave: 'Leave',
  refresh: 'Refresh',
  previous: 'Previous',
  next: 'Next',
  details: 'Details',
  approveInWallet: 'Approve in your wallet',
  dismiss: 'Dismiss',
  getWallet: 'Get a wallet',
  goToMainApp: 'Go to the main app',
  seeAllActivity: 'See all activity',
} as const;

export const BUSY = {
  waitingForWallet: 'Waiting for your wallet',
  checking: 'Checking',
  tryingAgain: 'Trying again',
  disconnecting: 'Disconnecting',
} as const;

export const MOMENTS = {
  sentPending: 'Sent. Waiting for the network to confirm.',
  stepOneDone: 'Step 1 of 2 is done. Approve the next request in your wallet.',
  testNetwork: "You're on the test network. Its coins have no value.",
  slowLoad: 'Still loading. Bitcoin Cash data can take a few seconds.',
  nothingNeedsYou: 'Nothing needs you right now.',
  switchAnyTime: 'You can switch any time',
  walletUnchanged: 'Nothing in your wallet has changed.',
  walletWillOpen: 'Your wallet will open and ask you to approve this.',
  newToBch: 'New to Bitcoin Cash?',
  noActivity: 'No activity yet.',
  activityFailed: "Activity didn't load. Nothing in your wallet has changed.",
  uptimeNotRecorded: "Uptime history isn't recorded yet.",
  disconnectFailed: "Couldn't disconnect. Try again.",
  connectFailed: "Couldn't connect",
  notConnected: 'Not connected',
  transactionSent: 'Transaction sent',
} as const;

export const TOASTS = {
  addressCopied: 'Address copied',
  linkCopied: 'Link copied',
  idCopied: 'ID copied',
  copied: 'Copied',
  copyFailed: "Couldn't copy. Select the text instead.",
} as const;

export const LABELS = {
  all: 'All',
  optional: '(optional)',
  onThisPage: '(on this page)',
  notSet: 'Not set',
  balanceUnavailable: 'Balance unavailable',
  whoCanMoveTheMoney: 'Who can move the money',
  notReleasedYet: 'Not released yet',
  stillToCome: 'still to come',
  yourWallet: 'Your wallet',
  tokenId: 'Token ID',
  bitcoinCash: 'Bitcoin Cash',
  unnamedToken: 'Token',
  network: 'Network',
  networkFee: 'Network fee',
  sent: 'Sent',
  received: 'Received',
  notifications: 'Notifications',
  forExample: 'For example:',
  couldntLoad: "Couldn't load",
  today: 'Today',
  waitingPeriod: 'Waiting period',
  approved: 'Approved',
  waiting: 'Waiting',
  note: 'Note',
  walletMenu: 'Wallet menu',
  walletBalance: 'Wallet balance',
  connectedWith: 'Connected with',
} as const;

export const ROLE_LINES = {
  recipient: "You're the recipient",
  sender: "You're the sender",
  signer: "You're a signer",
  viewer: "You're viewing",
} as const;

export const REVIEW = {
  title: 'Check before you approve',
  leavesWallet: 'Leaves your wallet',
  leavesContract: 'Leaves the contract',
  youReceive: 'You receive',
  comesBack: 'Comes back to your wallet',
  feeOnly: 'Network fee only',
  plusNetworkFee: 'plus a small network fee',
  goesTo: 'Goes to',
  whoCanStop: 'Who can stop it',
  smallFee: 'A small network fee',
  beforeYouApprove: 'Before you approve',
  sent: 'Sent',
  from: 'From',
  recipientKeeps: 'Recipient keeps',
  sendToNetwork: 'Send to the network',
  confirmed: 'Confirmed',
  didNotGoThrough: "This didn't go through",
  declined: 'Declined in your wallet',
  notSent: 'Not sent',
  checkWallet: 'Check your wallet',
  firstStepDone: 'Step 1 is done',
  done: 'Done.',
} as const;

export function backTo(plural: string): string {
  return `Back to ${plural}`;
}

export function showFinished(count: number): string {
  return `Show finished (${count})`;
}

export function noneYet(plural: string): string {
  return `No ${plural} yet`;
}

export function noneMatch(plural: string): string {
  return `No ${plural} match these filters.`;
}

export function howTheyWork(plural: string): string {
  return `How ${plural} work`;
}

export function pageOf(page: number, totalPages: number): string {
  return `Page ${page} of ${totalPages}`;
}

export function rangeOf(start: number, end: number, total: number): string {
  return `${start} to ${end} of ${total}`;
}

export function showingRange(start: number, end: number, total: number | null): string {
  return total === null ? `Showing ${start} to ${end}` : `Showing ${rangeOf(start, end, total)}`;
}

export function stepOf(step: number, total: number): string {
  return `Step ${step} of ${total}`;
}

export function needsApprovals(required: number): string {
  return required === 1 ? 'Needs 1 approval.' : `Needs ${required} approvals.`;
}


export function pickWalletFor(networkName: string): string {
  return `Pick the wallet you use for ${networkName}.`;
}

export function vaultName(name: string): string {
  return `Vault: ${name}`;
}

export function copyrightLine(year: number): string {
  return `© ${year} FlowGuard`;
}
