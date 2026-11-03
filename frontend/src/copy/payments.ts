import { formatCount } from './format';

export type PaymentInterval = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

/** Every interval is a fixed number of days on the server, so "Monthly" is 30 days and "Yearly" 365. */
export const INTERVAL_DAYS: Record<PaymentInterval, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  YEARLY: 365,
};

export const INTERVAL_WORD: Record<PaymentInterval, string> = {
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  BIWEEKLY: 'Every 2 weeks',
  MONTHLY: 'Every 30 days',
  YEARLY: 'Every 365 days',
};

export const PAYMENTS_PAGE = {
  title: 'Recurring payments',
  description:
    'The same amount on a fixed schedule, like every week or every 30 days. The person you pay claims each payment.',
  create: 'Create recurring payment',
  payMany: 'Pay many people',
  viewLabel: 'Show recurring payments',
  views: { all: 'All', receiving: 'Receiving', sending: 'Sending' },
  filterLabel: 'Filter by status',
  filterAll: 'All',
  searchLabel: 'Search recurring payments',
  searchPlaceholder: 'Search by name or address',
  listLabel: 'Recurring payments',
  noResultsThing: 'recurring payments',
  columns: {
    payment: 'Payment',
    status: 'Status',
    each: 'Each payment',
    next: 'Next payment',
  },
  stats: {
    active: 'Active',
    ready: 'Ready to claim',
    paid: 'Paid to others so far',
    received: 'Claimed by you so far',
  },
  youReceive: 'You receive',
  youSend: 'You send',
  readyNow: 'Ready to claim now',
  nextOn: 'Next',
  afterFunding: 'After funding',
  error: {
    title: "Your recurring payments didn't load.",
    reason: 'Check your connection and try again.',
  },
  empty: {
    all: {
      title: 'No recurring payments yet',
      description: 'Pay someone the same amount on a fixed schedule. They claim each payment when it is due.',
      example: 'pay a contractor 0.50 BCH every 30 days, 12 times.',
    },
    sending: {
      title: 'No recurring payments yet',
      description: "You haven't set up a recurring payment yet.",
    },
    receiving: {
      title: 'Nobody is paying you yet',
      description:
        'Nobody is paying this wallet through a recurring payment yet. When someone does, it shows up here and you claim each payment.',
    },
  },
  howItWorks: 'How recurring payments work',
} as const;

export function paymentTo(shortAddress: string): string {
  return `Payment to ${shortAddress}`;
}

export function paymentFrom(shortAddress: string): string {
  return `Payment from ${shortAddress}`;
}

export function tokenRowsLeftOut(count: number): string {
  return `${formatCount(count, 'token payment', 'token payments')} not counted`;
}

export function paymentsCount(paid: number, total: number): string {
  return `${paid} of ${formatCount(total, 'payment', 'payments')} claimed`;
}

export const CREATE_PAYMENT = {
  title: 'Create a recurring payment',
  description: 'Pay someone the same amount on a fixed schedule, like every week or every 30 days.',
  back: 'Back to recurring payments',
  steps: {
    who: 'Who and how much',
    when: "When it's paid",
    check: 'Check and approve',
  },
  recipient: {
    label: 'Recipient address',
    helper: 'The Bitcoin Cash address of the person you pay. They claim each payment into this wallet.',
    missing: "Enter the recipient's address.",
    yourself: "This is your own wallet. Enter the address of the person you're paying.",
  },
  name: {
    label: 'Recipient name',
    helper: 'Shown on the payment page. Anyone with the link can see it.',
    placeholder: 'For example, Sam',
  },
  tokenNote: {
    title: 'Fund it from the wallet that created the token',
    body: 'A recurring payment in a token has to be funded from the wallet with permission to create the token, usually the wallet that created it.',
  },
  amount: {
    label: 'Amount each time',
    helper: 'How much BCH the recipient can claim each time a payment is due.',
    helperToken: 'How many tokens the recipient can claim each time a payment is due.',
    missing: 'Enter an amount above 0 BCH.',
    missingToken: 'Enter an amount above 0.',
  },
  interval: {
    label: 'How often',
    helper: 'Payments are a fixed number of days apart, so "every 30 days" drifts from the calendar month.',
  },
  start: {
    label: 'Start date',
    helper: 'The first payment is due one interval after this date.',
    missing: 'Choose a start date.',
  },
  end: {
    label: 'End date',
    helper: 'Leave this empty for 12 payments. A recurring payment has a fixed number of payments, and you can\'t add funds later.',
    beforeStart: 'Choose an end date after the start date.',
  },
  clockTitle: 'The schedule starts on the start date',
  lastPayment: 'Last payment',
  firstPayment: 'First payment',
  clockNotice:
    'It starts even if you fund it later. Fund it right away so nothing builds up.',
  claimsLine: (who: string) => `${who} claims each payment in FlowGuard when it's due. Nothing is sent to them on its own.`,
  whoCanMove: (who: string) =>
    `Only ${who} can claim. You can pause or cancel it later, and anything not claimed comes back to you.`,
  feesLine: 'The network fee for each claim is paid from the money in the contract.',
  feesLineToken: 'The network fee for each claim is paid from a little BCH locked with the tokens.',
  next: (amount: string) => `Next, you'll approve one transaction in your wallet to lock ${amount} in a contract.`,
  nextUnknown: "Next, you'll approve one transaction in your wallet to lock the money in a contract.",
  submit: 'Continue to funding',
  busy: 'Creating recurring payment',
  errorTitle: "Couldn't create the recurring payment",
  fieldErrors: 'Some fields need fixing. Nothing was sent from your wallet.',
  continueLabel: 'Continue',
  backLabel: 'Back',
  recipientFallback: 'The recipient',
} as const;

export const PAYMENT_DETAIL = {
  back: 'Recurring payments',
  loading: 'Loading this recurring payment',
  notFound: {
    title: "We couldn't find this recurring payment.",
    reason: 'Check that you copied the whole link.',
  },
  loadFailed: {
    title: "This recurring payment didn't load.",
    reason: 'Check your connection and try again.',
  },
  backToList: 'Back to recurring payments',
  description: {
    sender: (who: string) => `You pay ${who} the same amount on a schedule. They claim each payment when it's due.`,
    recipient: (sender: string) => `${sender} set this up to pay you. Claim each payment when it's due.`,
    viewer: (sender: string, who: string) => `${sender} pays ${who} the same amount on a schedule.`,
  },
  readyToClaim: 'Ready to claim',
  eachPayment: 'Each payment',
  nextState: (amount: string, date: string) => `next ${amount} on ${date}`,
  nextLine: (amount: string, date: string) => `Next ${amount} on ${date}.`,
  noNext: 'No payments left to claim.',
  manyDue: (count: number) =>
    `${formatCount(count, 'payment is', 'payments are')} due. You claim them one at a time.`,
  fund: (amount: string) => `Fund ${amount}`,
  fundGeneric: 'Fund payment',
  claim: (amount: string) => `Claim ${amount}`,
  notFundedNotice: {
    title: 'Not funded yet',
    sender: (who: string, start: string, started: boolean) =>
      `Nothing has left your wallet yet. Fund it so ${who} can start claiming. ${
        started ? `The schedule already started on ${start}.` : `The schedule starts on ${start} even if you fund it later.`
      }`,
    others: 'The sender has not funded this yet. Nothing can be claimed until they do.',
  },
  pausedNotice: {
    title: 'Paused',
    recipient: 'The sender paused this recurring payment. You can claim again when they resume it.',
    sender: (who: string) => `${who} can't claim anything while it's paused. Resume it to let them claim again.`,
    viewer: 'The sender paused this recurring payment.',
  },
  finishedNotice: 'Every payment has been claimed.',
  cancelledNotice: 'This recurring payment was cancelled. Anything not claimed went back to the sender.',
  share: {
    title: 'Send this link to the recipient',
    body: (who: string) => `${who} opens this page to see what they can claim and when.`,
    field: 'Payment link',
  },
  schedule: 'Schedule',
  scheduleTooLong: (count: number, interval: string) =>
    `${formatCount(count, 'payment', 'payments')}, ${interval.toLowerCase()}.`,
  activity: 'Activity',
  details: 'Details',
  detailLabels: {
    from: 'From',
    to: 'To',
    token: 'Token',
    each: 'Each payment',
    howOften: 'How often',
    starts: 'Starts',
    firstPayment: 'First payment',
    lastPayment: 'Last payment',
    payments: 'Payments',
    canStop: 'Can be paused or cancelled',
    contract: 'Contract address',
    funding: 'Funding transaction',
  },
  whoCanMoveYou:
    "Only you can claim. The sender can pause or cancel it, and you keep what you've already claimed.",
  canStopValue: 'Yes, by the sender',
  whoCanMove: (who: string) =>
    `Only ${who} can claim. The sender can pause or cancel it, and ${who} keeps what's already claimed.`,
  whoCanMoveSender: (who: string) =>
    `Only ${who} can claim. You can pause or cancel it, and ${who} keeps what's already claimed.`,
  manage: 'Manage',
  pause: 'Pause payment',
  resume: 'Resume payment',
  cancel: 'Cancel payment',
  keep: 'Keep payment',
  review: {
    pauseTitle: 'Pause this recurring payment?',
    pauseBody: (who: string) =>
      `While it's paused, ${who} can't claim anything, including payments that are already due. You can resume it later.`,
    resumeTitle: 'Resume this recurring payment?',
    cancelTitle: 'Cancel this recurring payment?',
    cancelBody: (who: string, kept: string | null, back: string | null) =>
      kept && back
        ? `${who} keeps the ${kept} already claimed. The other ${back} comes back to your wallet, including payments that are due but not claimed. This can't be undone.`
        : "Everything not claimed yet comes back to your wallet, including payments that are due but not claimed. This can't be undone.",
    whoCanStop: 'Only you, the sender',
    contractName: "This payment's contract",
    claimFee: "Paid from the payment's contract",
    reserveFee: (amount: string) => `A small network fee, plus about ${amount} set aside in the contract for claim fees`,
    fundedNext: (who: string) => `Send the payment link to ${who} so they know what they can claim.`,
    claimedNext: 'It shows in your wallet in a moment.',
    pausedNext: 'Resume it any time from this page.',
    resumedNext: (who: string) => `${who} can claim again.`,
    cancelledNext: 'Anything not claimed is on its way back to your wallet.',
  },
} as const;

