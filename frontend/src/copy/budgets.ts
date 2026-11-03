export const BUDGETS_TAB = {
  create: 'Create budget plan',
  segmentLabel: 'Whose budget plans',
  segments: { yours: 'Yours', public: 'Public and yours' },
  publicLine:
    'Budget plans listed under public vaults and your own vaults. Only the person who set one up can change it.',
  filterLabel: 'Status',
  listLabel: 'Budget plans',
  stats: {
    active: 'Active',
    released: 'Released so far',
    toCome: 'Still to come',
    toComeSub: 'Active and paused plans',
    notFunded: 'Not funded yet',
    bchOnly: 'BCH plans only',
  },
  columns: {
    recipient: 'Paid to',
    vault: 'Listed under',
    schedule: 'Schedule',
    released: 'Released so far',
    status: 'Status',
  },
  scheduleValue: (amount: string, interval: string) => `${amount} ${interval}`,
  ofTotal: (amount: string) => `of ${amount}`,
  noVault: 'Not set',
  loadFailedTitle: "Budget plans didn't load",
  empty: {
    yoursTitle: 'No budget plans yet',
    yoursLine:
      'A budget plan releases money from your wallet on a schedule you set, listed under one of your vaults.',
    yoursExample: 'For example: pay a contractor 1.20 BCH every 30 days, 4 times.',
    publicTitle: 'No budget plans yet',
    publicLine: 'When someone lists a budget plan under a public vault, it shows up here.',
  },
  noResultsThing: 'budget plans',
} as const;

export const PLAN_DIALOG = {
  title: (name: string) => `Plan for ${name}`,
  details: {
    recipient: 'Paid to',
    vault: 'Listed under',
    eachTime: 'Each payment',
    howOften: 'How often',
    total: 'In all',
    released: 'Released so far',
    toCome: 'Still to come',
    next: 'Next payment',
    status: 'Status',
  },
  fundingLine: (vault: string) =>
    `The money for this plan comes from your wallet. The plan is listed under ${vault}.`,
  notFundedLine: "This plan isn't funded yet. Nothing is paid until it's funded.",
  pausedRecipient:
    "The sender paused this plan. You can't claim from it while it's paused. You can claim again when they resume it.",
  notSetUp:
    "This plan isn't set up on Bitcoin Cash yet, so it can't be funded. Nothing has left your wallet.",
  nextOn: (amount: string, date: string) => `Next ${amount} on ${date}.`,
  manage: 'Manage',
  fund: (amount: string) => `Fund ${amount}`,
  claim: (amount: string) => `Claim ${amount}`,
  pause: 'Pause plan',
  resume: 'Resume plan',
  cancel: 'Cancel plan',
  noActions: 'There is nothing for you to do on this plan.',
} as const;

export const PLAN_REVIEWS = {
  fund: { done: 'The plan is funded. Payments start on its schedule.' },
  claim: { done: 'The payment is on its way to your wallet.' },
  pause: {
    title: 'Pause this plan?',
    consequence: (name: string) =>
      `While it's paused, ${name} can't claim anything, including money already released. You can resume it later. Release dates move later by the time it was paused.`,
    confirm: 'Pause plan',
    keep: 'Keep plan running',
    done: 'The plan is paused.',
  },
  resume: {
    title: 'Resume this plan?',
    consequence: (name: string) => `${name} can claim again. Release dates move later by the time it was paused.`,
    confirm: 'Resume plan',
    done: 'The plan is running again.',
  },
  cancel: {
    title: 'Cancel this plan?',
    consequence: (name: string, ready: string, back: string) =>
      `${name} gets the ${ready} that's ready to claim now. ${back} comes back to your wallet. This can't be undone.`,
    consequenceNothingReady: (name: string, back: string) =>
      `Nothing is ready for ${name} to claim yet, so ${back} comes back to your wallet. This can't be undone.`,
    alreadyClaimed: (name: string, claimed: string) =>
      `The ${claimed} ${name} already claimed stays theirs.`,
    confirm: 'Cancel plan',
    keep: 'Keep plan',
    done: 'The plan is cancelled.',
  },
} as const;

export const BUDGET_CREATE = {
  title: 'Create a budget plan',
  description: 'Set aside money from your wallet and release it on a schedule.',
  back: 'Back to budget plans',
  steps: { who: 'Who and how much', when: "When it's paid", check: 'Check and create' },
  vault: 'List under a vault',
  vaultHelper: 'The plan shows on this vault. The money comes from your wallet.',
  vaultPlaceholder: 'Choose a vault',
  vaultRequired: 'Choose a vault to list the plan under.',
  noVaults: "You don't have a vault yet. A budget plan is listed under one of your vaults.",
  noVaultsTitle: 'Create a vault first',
  createVault: 'Create vault',
  vaultsFailed:
    "Your vaults didn't load. Check your connection and try again. Nothing in your wallet has changed.",
  recipient: 'Recipient address',
  recipientHelper: 'The Bitcoin Cash address that will receive the money.',
  recipientRequired: 'Enter the recipient address.',
  name: 'Name',
  nameHelper: 'Shown on the plan instead of the address.',
  namePlaceholder: 'For example, Sam',
  amount: 'Amount each time',
  amountHelper: 'In BCH. The recipient claims each payment when it is released.',
  amountRequired: 'Enter an amount above 0.',
  count: 'How many payments',
  countHelper: 'The plan ends after the last payment.',
  countRequired: 'Enter a whole number from 1 to 120.',
  howOften: 'How often',
  intervals: [
    { value: '604800', label: 'Every 7 days' },
    { value: '2592000', label: 'Every 30 days' },
    { value: '7776000', label: 'Every 90 days' },
    { value: '31536000', label: 'Every 365 days' },
  ],
  start: 'Start date',
  startHelper:
    'The first payment is released one interval after this date. Leave it empty to start today.',
  check: {
    title: 'Check your plan',
    total: 'In all',
    recipient: 'Paid to',
    vault: 'Listed under',
    starts: 'Starts',
    today: 'Today',
    cantChange: "The schedule can't be changed after you create the plan.",
    createNote:
      "Creating the plan moves no money. Your wallet may ask you to sign in first, which is free. Then you'll fund it.",
    create: 'Create budget plan',
    creating: 'Creating budget plan',
    errorTitle: "Couldn't create the budget plan",
    fixFields: 'Some details need a fix before you can continue.',
  },
  created: {
    title: 'Your budget plan is ready to fund',
    line: (amount: string) =>
      `Next, fund it with ${amount}. You'll approve one transaction in your wallet.`,
    fund: (amount: string) => `Fund ${amount}`,
    goToPlans: 'Go to budget plans',
    contractName: 'This budget plan',
    done: 'The plan is funded. Payments start on its schedule.',
  },
} as const;
