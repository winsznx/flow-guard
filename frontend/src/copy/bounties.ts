import { formatAddress, formatCount, plural } from './format';

export const BOUNTY_NOUN = { one: 'bounty', many: 'bounties' } as const;

export const BOUNTIES_LIST = {
  title: 'Bounties',
  description: 'Lock a prize up front and pay each winner when the work is done.',
  create: 'Create bounty',
  listLabel: 'Your bounties',
  searchLabel: 'Search bounties',
  searchPlaceholder: 'Search by title',
  statusLabel: 'Status',
  thing: 'bounties',
  emptyTitle: 'No bounties yet',
  emptyLine: 'A bounty sets aside prize money for a piece of work. You pick the winners and pay each one from it.',
  example: 'pay 0.5 BCH to each of 3 people who translate your guide.',
  howTheyWork: 'How bounties work',
  howTheyWorkPath: '/use-cases#send-to-many',
  loadFailed: "Your bounties didn't load",
  fund: 'Fund',
  columns: {
    bounty: 'Bounty',
    status: 'Status',
    perWinner: 'Per winner',
    winners: 'Winners paid',
    ends: 'Ends',
  },
  stats: {
    active: 'Active',
    prizeMoney: 'Prize money (BCH)',
    winnersPaid: 'Winners paid',
    bchOnly: 'BCH bounties only',
  },
  noEndDate: 'No end date',
} as const;

export function bountyCount(n: number): string {
  return formatCount(n, BOUNTY_NOUN.one, BOUNTY_NOUN.many);
}

export function activeCount(n: number): string {
  return `${n} active`;
}

export function paidOutOf(paid: string, total: string): string {
  return `${paid} of ${total} paid out`;
}

export function winnersPaid(paid: number, max: number): string {
  return `${paid} of ${max} ${plural(max, 'winner', 'winners')} paid`;
}

export function endsOn(date: string): string {
  return `Ends ${date}`;
}

export function createdOn(date: string): string {
  return `Created ${date}`;
}

export const BOUNTY_CREATE = {
  title: 'Create a bounty',
  description: 'Describe the work, lock the prize, and pick winners when work comes in.',
  back: 'Back to bounties',
  about: {
    title: 'About the bounty',
    titleLabel: 'Title',
    titlePlaceholder: 'For example, translate our guide into Spanish',
    titleHelper: 'People see this when you share the bounty.',
    descriptionLabel: 'How to take part',
    descriptionPlaceholder: 'What should people do, how do they send you their work, and how will you pick winners?',
    descriptionHelper:
      'People send their work to you, outside FlowGuard. FlowGuard holds the prize money and pays the winners you pick.',
  },
  asset: {
    legend: 'Pay winners in',
    bchTitle: 'Bitcoin Cash',
    bchLine: 'Pay prizes in BCH.',
    tokenTitle: 'A token you created',
    tokenLine:
      'Your wallet needs permission to create more of this token. Usually only the wallet that made the token has it.',
    tokenIdLabel: 'Token ID',
    tokenIdPlaceholder: 'Paste the 64-character token ID',
    tokenIdHelper: 'You can copy the token ID from your wallet.',
  },
  prizes: {
    title: 'Prizes',
    perWinnerLabel: 'Prize per winner',
    perWinnerHelper: "Every winner gets this amount. You can't change it later.",
    winnersLabel: 'Number of winners',
    winnersHelper: 'How many prizes this bounty pays.',
    manyWinnersTitle: 'We recommend 19 winners or fewer',
    manyWinnersLine: 'For more winners, create a second bounty.',
  },
  dates: {
    title: 'Dates',
    startLabel: 'Start date',
    startHelper: 'You can pay winners from this day.',
    endLabel: 'End date',
    endHelper:
      "Optional. After this day you can't pay winners. You can still cancel and get the rest back. Leave it empty for no end date.",
  },
  planIncomplete: 'Add the prize to see the plan.',
  review: {
    title: 'Check and create',
    plan: 'The plan',
    dates: 'Dates',
    total: 'Total prize money',
    cancel: 'Cancelling',
    cancelLine: 'You can cancel this bounty before it is paid out.',
    nextStep: "Next, you'll fund the bounty from your wallet. Nothing moves until then.",
  },
  submit: 'Create bounty',
  submitBusy: 'Creating bounty',
  checkingToken: 'Checking the token',
  leave: 'Cancel',
  leaving: 'Leaving',
  leaveTitle: 'Leave without creating this bounty?',
  leaveBody: "What you've typed here will be lost.",
  errorTitle: "Couldn't create the bounty",
  fixFields: 'Fix the fields below. Nothing was sent from your wallet.',
  maybeCreated: 'Your bounty may have been created. Check your bounties before you try again.',
  errors: {
    title: 'Add a title.',
    tokenId: 'Paste the token ID.',
    tokenIdLength: 'A token ID is 64 characters long. Check that you copied all of it.',
    tokenIdChars: 'A token ID only uses the digits 0 to 9 and the letters a to f.',
    tokenNotFound: "We couldn't find a token with this ID. Check the ID and try again.",
    tokenUnavailable: "We couldn't check this token right now. Nothing was sent. Try again in a minute.",
    perWinner: 'Enter a prize above 0.',
    winners: 'Enter a whole number, 1 or more.',
    endBeforeStart: 'Pick an end date after the start date.',
  },
} as const;

export function tooManyDecimals(decimals: number): string {
  if (decimals === 0) return 'This token has no decimals. Enter a whole number.';
  return `Use at most ${decimals} ${plural(decimals, 'decimal', 'decimals')}.`;
}

export function datesLine(start: string | null, end: string | null): string {
  const from = start ?? 'today';
  return end ? `${from} to ${end}` : `${from}, with no end date`;
}

export const BOUNTY_DETAIL = {
  breadcrumb: 'Bounties',
  untitled: 'Untitled bounty',
  senderLine: 'You pick the winners and pay each one from this bounty.',
  thisBounty: 'This bounty',
  leavesBounty: 'Leaves this bounty',
  loadFailed: "This bounty didn't load",
  back: 'Back to bounties',
  about: 'How to take part',
  fund: {
    title: 'Fund this bounty',
    twoSteps: "Your wallet may need one setup step first. If it does, you'll approve two requests.",
    noAddress: "This bounty's address isn't ready yet. Refresh the page in a minute.",
    next: 'You can pay winners now.',
  },
  pay: {
    title: 'Pay a winner',
    winnerLabel: "Winner's address",
    winnerHelper: 'The Bitcoin Cash address of the person you picked. Use a regular wallet address.',
    submissionLabel: 'Winning submission',
    submissionPlaceholder: 'For example, a link to the translated guide',
    submissionHelper:
      'Paste a link to the work or a short note about it. FlowGuard makes a proof code from it and records the code with the payment. The link itself is never sent.',
    proofDetails: 'Already have a proof code?',
    proofDetailsLine: 'Paste the 64-character code instead. FlowGuard records it as it is.',
    submit: 'Pay winner',
    submissionMissing: 'Add a link or a note about the winning submission.',
    winnerMissing: "Paste the winner's address.",
    errorTitle: "Couldn't pay the winner",
    fixFields: 'Fix the fields below. Nothing was sent.',
    next: "It's listed under Winners.",
    allPaid: 'Every prize has been paid.',
    ended: 'This bounty has ended. Cancel it to get the rest back.',
    pausedTitle: 'Payouts are paused',
    pausedLine: "Winners can't be paid while it's paused. Resume it to pay winners again, or cancel it to get the rest back.",
  },
  winners: {
    title: 'Winners',
    label: 'Winners of this bounty',
    winner: 'Winner',
    amount: 'Prize',
    paidOn: 'Paid',
    transaction: 'Transaction',
    empty: 'No winners paid yet.',
  },
  activity: 'Activity',
  details: {
    title: 'Details',
    sentBy: 'Set up by',
    paidIn: 'Paid in',
    perWinner: 'Prize per winner',
    winners: 'Number of winners',
    starts: 'Starts',
    ends: 'Ends',
    noEnd: 'No end date',
    canCancel: 'Can be cancelled',
    yes: 'Yes',
    no: 'No',
    bountyId: 'Bounty ID',
    address: 'Bounty address',
    funding: 'Funding transaction',
    tokenId: 'Token ID',
  },
  who: {
    title: 'Who can move the money',
    sender:
      "Only you can pay winners, and each payment also needs FlowGuard's server to approve it. If you cancel, what hasn't been paid comes back to your wallet.",
    senderNoCancel:
      "Only you can pay winners, and each payment also needs FlowGuard's server to approve it. This bounty can't be cancelled.",
  },
  manage: {
    title: 'Manage',
    pause: 'Pause bounty',
    resume: 'Resume bounty',
    pauseTitle: 'Pause this bounty?',
    pauseBody: "While it's paused, no winner can be paid. You can resume it later, or cancel it to get the rest back.",
    paused: 'Your bounty is paused.',
    resumeTitle: 'Resume this bounty?',
    resumeBody: 'You can pay winners from it again.',
    resumed: 'Your bounty is running again.',
    cancel: 'Cancel bounty',
    keep: 'Keep bounty',
    cancelTitle: 'Cancel this bounty?',
    cancelled: 'The rest of the prize money is on its way back to your wallet.',
  },
} as const;

export function viewerLine(sender: string, prize: string): string {
  return `${formatAddress(sender)} pays ${prize} to each winner they pick. Send in your work to take part.`;
}

export function viewerWho(sender: string): string {
  return `Only ${formatAddress(sender)} can pay winners, and each payment also needs FlowGuard's server to approve it. Winners are paid straight to their wallets.`;
}

export function fundLine(total: string): string {
  return `Nothing is locked yet. Fund the bounty to move ${total} from your wallet into it. Then you can pay winners.`;
}

export function fundButton(total: string): string {
  return `Fund ${total}`;
}

export function payLine(prize: string): string {
  return `Each winner gets ${prize}. You approve each payment in your wallet.`;
}

export function prizeForWinner(prize: string): string {
  return `${prize} for this winner`;
}

export function payPlan(prize: string, winner: string): string {
  return `Pay ${prize} from this bounty to ${formatAddress(winner)}.`;
}

export function paysFrom(date: string): string {
  return `You can pay winners from ${date}.`;
}

export function cancelConsequence(remaining: string, sender: string): string {
  return `${remaining} goes back to ${formatAddress(sender)}, the wallet that set up this bounty. You can't pay any more winners. This can't be undone.`;
}

export function cancelPlan(remaining: string): string {
  return `Cancel this bounty and get ${remaining} back.`;
}
