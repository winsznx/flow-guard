import type { RewardCategory } from '../services/rewardApi';
import { formatAddress, formatCount } from './format';

export { tooManyDecimals } from './bounties';

export const REWARD_TYPE: Record<RewardCategory, string> = {
  ACHIEVEMENT: 'Achievement',
  REFERRAL: 'Referral',
  LOYALTY: 'Loyalty',
  CUSTOM: 'Other',
};

export const REWARD_TYPE_ORDER: readonly RewardCategory[] = ['ACHIEVEMENT', 'REFERRAL', 'LOYALTY', 'CUSTOM'];

export const REWARDS_LIST = {
  title: 'Rewards',
  description: 'Keep a fund to pay people for things they did, like referrals or contributions.',
  create: 'Create reward program',
  listLabel: 'Your reward programs',
  searchLabel: 'Search reward programs',
  searchPlaceholder: 'Search by title',
  statusLabel: 'Status',
  typeLabel: 'Type',
  allTypes: 'All types',
  thing: 'reward programs',
  emptyTitle: 'No reward programs yet',
  emptyLine:
    'A reward program is a fund you set aside once. You send rewards from it when people earn them, and they arrive with nothing to claim.',
  example: 'send 0.05 BCH to each person who refers a new customer.',
  howTheyWork: 'How rewards work',
  howTheyWorkPath: '/use-cases#send-to-many',
  loadFailed: "Your reward programs didn't load",
  fund: 'Fund',
  columns: {
    program: 'Program',
    status: 'Status',
    paidOut: 'Paid out',
    left: 'Left to send',
    ends: 'Ends',
  },
  stats: {
    active: 'Active programs',
    paidOut: 'Paid out (BCH)',
    sent: 'Rewards sent',
    left: 'Left to send (BCH)',
    bchOnly: 'BCH programs only',
  },
  noEndDate: 'No end date',
} as const;

export function programCount(n: number): string {
  return formatCount(n, 'reward program', 'reward programs');
}

export function rewardsSent(n: number): string {
  return formatCount(n, 'reward sent', 'rewards sent');
}

export function endsOn(date: string): string {
  return `Ends ${date}`;
}

export function sentAmount(amount: string): string {
  return `${amount} sent`;
}

export function leftAmount(amount: string): string {
  return `${amount} left`;
}

export function toFund(amount: string): string {
  return `${amount} to fund`;
}

export function activePrograms(n: number): string {
  return `${n} active`;
}

export const REWARD_CREATE = {
  title: 'Create a reward program',
  description: 'Fund a pool once, then send rewards from it when people earn them.',
  back: 'Back to rewards',
  about: {
    title: 'About the program',
    titleLabel: 'Title',
    titlePlaceholder: 'For example, contributor rewards, spring 2027',
    titleHelper: "Shown on the program's page and in your list.",
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Who can get a reward, and what for?',
    descriptionHelper: "Shown on the program's page.",
    typeLabel: 'Type',
    typeHelper: 'Only used to label and filter your programs.',
  },
  asset: {
    legend: 'Pay rewards in',
    bchTitle: 'Bitcoin Cash',
    bchLine: 'Pay rewards in BCH.',
    tokenTitle: 'A token you created',
    tokenLine:
      'Your wallet needs permission to create more of this token. Usually only the wallet that made the token has it.',
    tokenIdLabel: 'Token ID',
    tokenIdPlaceholder: 'Paste the 64-character token ID',
    tokenIdHelper: 'You can copy the token ID from your wallet.',
  },
  budget: {
    title: 'Budget',
    totalLabel: 'Total budget',
    totalHelper: "You'll lock this amount when you fund the program.",
    limitLabel: 'Limit per reward',
    limitHelper: 'No single reward can be larger than this.',
  },
  dates: {
    title: 'Dates',
    startLabel: 'Start date',
    startHelper: 'You can send rewards from this day.',
    endLabel: 'End date',
    endHelper:
      "Optional. After this day you can't send rewards. You can still cancel and get the rest back. Leave it empty for no end date.",
  },
  review: {
    title: 'Check and create',
    budget: 'Budget',
    limit: 'Limit per reward',
    dates: 'Dates',
    type: 'Type',
    cancel: 'Cancelling',
    cancelLine: "You can cancel this program while it's running. What hasn't been sent comes back to you.",
    nextStep: "Next, you'll fund the program from your wallet. Then you can send rewards.",
  },
  planIncomplete: 'Add the budget and the limit per reward to see the plan.',
  submit: 'Create program',
  submitBusy: 'Creating program',
  leave: 'Cancel',
  leaving: 'Leaving',
  leaveTitle: 'Leave without creating this reward program?',
  leaveBody: "What you've typed here will be lost.",
  errorTitle: "Couldn't create the reward program",
  fixFields: 'Fix the fields below. Nothing was sent from your wallet.',
  maybeCreated: 'Your program may have been created. Check your reward programs before you try again.',
  errors: {
    title: 'Add a title.',
    tokenId: 'Paste the token ID.',
    tokenIdLength: 'A token ID is 64 characters long. Check that you copied all of it.',
    tokenIdChars: 'A token ID only uses the digits 0 to 9 and the letters a to f.',
    tokenNotFound: "We couldn't find a token with this ID. Check the ID and try again.",
    tokenUnavailable: "We couldn't check this token right now. Nothing was sent. Try again in a minute.",
    budget: 'Enter a budget above 0.',
    limit: 'Enter a limit above 0.',
    limitOverBudget: "The limit per reward can't be more than the budget.",
    endBeforeStart: 'Pick an end date after the start date.',
  },
} as const;

/** The create page's plan: what gets locked, the most one reward can be, and when rewards can go out. */
export function rewardPlan(budget: string, limit: string, start: string | null, end: string | null): string {
  const from = start ?? 'today';
  const window = end ? `from ${from} to ${end}` : `from ${from}, with no end date`;
  return `Fund ${budget} once, then send rewards of up to ${limit} each, ${window}.`;
}

export function enoughFor(n: number): string {
  return `Enough for ${formatCount(n, 'reward', 'rewards')} at the limit.`;
}

export const REWARD_DETAIL = {
  breadcrumb: 'Rewards',
  untitled: 'Untitled reward program',
  thisProgram: 'This program',
  leavesProgram: 'Leaves this program',
  loadFailed: "This reward program didn't load",
  back: 'Back to rewards',
  senderLine: 'Send rewards from this fund when people earn them.',
  about: 'About this program',
  fund: {
    title: 'Fund this program',
    twoSteps: "Your wallet may need one setup step first. If it does, you'll approve two requests.",
    noAddress: "This program's address isn't ready yet. Refresh the page in a minute.",
    next: 'You can send rewards now.',
  },
  send: {
    title: 'Send a reward',
    recipientLabel: "Recipient's address",
    recipientHelper: 'The Bitcoin Cash address of the person you want to reward. Use a regular wallet address.',
    amountLabel: 'Amount',
    submit: 'Send reward',
    recipientMissing: "Paste the recipient's address.",
    amountMissing: 'Enter an amount above 0.',
    errorTitle: "Couldn't send the reward",
    fixFields: 'Fix the fields below. Nothing was sent.',
    next: "It's listed under Rewards sent.",
    usedUp: 'The budget is used up.',
    pausedTitle: 'This program is paused',
    pausedLine: "You can't send rewards while it's paused. Resume it to send again, or cancel it to get the rest back.",
  },
  sent: {
    title: 'Rewards sent',
    label: 'Rewards sent from this program',
    recipient: 'Recipient',
    amount: 'Amount',
    sentOn: 'Sent',
    transaction: 'Transaction',
    empty: 'No rewards sent yet.',
  },
  activity: 'Activity',
  details: {
    title: 'Details',
    sentBy: 'Set up by',
    type: 'Type',
    paidIn: 'Paid in',
    budget: 'Budget',
    limit: 'Limit per reward',
    starts: 'Starts',
    ends: 'Ends',
    noEnd: 'No end date',
    programId: 'Program ID',
    address: 'Program address',
    funding: 'Funding transaction',
  },
  who: {
    title: 'Who can move the money',
    sender:
      "Only you can send rewards, and each one also needs FlowGuard's server to approve it. If you cancel, what hasn't been sent comes back to your wallet.",
  },
  manage: {
    title: 'Manage',
    pause: 'Pause program',
    resume: 'Resume program',
    pauseTitle: 'Pause this program?',
    pauseBody: "While it's paused, no rewards can be sent from it. You can resume it later, or cancel it to get the rest back.",
    paused: 'Your program is paused.',
    resumeTitle: 'Resume this program?',
    resumeBody: 'You can send rewards from it again.',
    resumed: 'Your program is running again.',
    cancel: 'Cancel program',
    keep: 'Keep program',
    cancelTitle: 'Cancel this program?',
    cancelled: "What hasn't been sent is on its way back to your wallet.",
  },
} as const;

export function viewerLine(sender: string): string {
  return `${formatAddress(sender)} pays rewards from this fund. Rewards arrive in your wallet. There's nothing to claim.`;
}

export function viewerWho(sender: string): string {
  return `Only ${formatAddress(sender)} can send rewards from this program, and each one also needs FlowGuard's server to approve it. Rewards arrive in people's wallets, with nothing to claim.`;
}

export function stateLine(left: string, sent: number): string {
  return `${left} left to send · ${rewardsSent(sent)}`;
}

export function fundLine(total: string): string {
  return `Nothing is locked yet. Fund the program to move ${total} from your wallet into it. Then you can send rewards.`;
}

export function fundButton(total: string): string {
  return `Fund ${total}`;
}

export function sendLine(limit: string, left: string): string {
  return `Send up to ${limit} per reward. ${left} is left in the budget.`;
}

export function upTo(amount: string): string {
  return `Up to ${amount} for this reward.`;
}

export function sendButton(amount: string): string {
  return `Send ${amount}`;
}

export function overLimit(limit: string): string {
  return `One reward can be at most ${limit}.`;
}

export function overBudget(left: string): string {
  return `Only ${left} is left in the budget.`;
}

export function sendPlan(amount: string, recipient: string): string {
  return `Send ${amount} from this program to ${formatAddress(recipient)}.`;
}

export function sendsFrom(date: string): string {
  return `You can send rewards from ${date}.`;
}

export function endedLine(left: string): string {
  return `The end date has passed. Cancel the program to get ${left} back.`;
}

export function budgetUsed(sent: string, budget: string): string {
  return `${sent} of ${budget} sent`;
}

export function cancelConsequence(remaining: string, sender: string): string {
  return `${remaining} goes back to ${formatAddress(sender)}, the wallet that set up this program. You can't send any more rewards. This can't be undone.`;
}
