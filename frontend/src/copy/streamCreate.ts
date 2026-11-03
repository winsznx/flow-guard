import { formatCount, plural } from './format';
import { NETWORK_NAME } from './network';

/** Copy for the two stream create pages: /streams/create and /streams/batch-create (and their vault routes). */

export const STEP_LABELS = {
  who: 'Who and how much',
  when: "When it's paid",
  checkCreate: 'Check and create',
  checkApprove: 'Check and approve',
} as const;

export const CREATE_HEADER = {
  title: 'Create a stream',
  description: 'Pay someone over time, like a salary or a vesting plan.',
  vaultDescription: (vault: string) => `This stream will be listed under ${vault}. The money comes from your wallet.`,
  vaultFallback: 'this vault',
} as const;

export const BATCH_HEADER = {
  title: 'Pay many people',
  description: 'Set up a stream for each person in one go, from a list or a CSV file.',
  vaultDescription: (vault: string) => `These streams will be listed under ${vault}. The money comes from your wallet.`,
} as const;

export const BACK = {
  streams: 'streams',
  vault: 'vault',
  vaultStreams: 'vault streams',
} as const;

export const WHO = {
  recipientLabel: 'Recipient address',
  recipientHelper: "The wallet that can claim the money. The recipient connects it to FlowGuard and claims each part as it's released.",
  payWith: 'Pay with',
  payBch: 'BCH',
  payToken: 'A token',
  tokenIdLabel: 'Token ID',
  tokenIdHelper: "The long code that identifies the token. Copy it from your wallet's token details.",
  tokenIdValid: 'Token ID',
  tokenIdPaste: 'Paste token ID',
  tokenFound: (name: string, decimals: number) =>
    `${name}. Amounts use up to ${formatCount(decimals, 'decimal place', 'decimal places')}.`,
  tokenFoundWhole: (name: string) => `${name}. This token only comes in whole amounts.`,
  tokenUnnamed: 'This token has no name on record',
  amountLabel: 'Amount',
  firstDepositLabel: 'First deposit',
  amountHelperBch: 'You need this amount plus a small network fee when you fund the stream.',
  amountHelperToken: 'You need these tokens plus a little BCH for network fees when you fund the stream.',
  firstDepositHelper: 'Covers the first payments. You can add funds any time to keep it going.',
  vaultLabel: 'List under a vault (optional)',
  vaultNone: 'No vault',
  vaultHelper: "The stream shows on the vault's page. The money still comes from your wallet.",
  vaultFixed: (vault: string) => `Listed under ${vault}. The money comes from your wallet.`,
  noteLabel: 'Note',
  notePlaceholder: "For example, Sam's design work",
  noteHelper: "Saved with the stream for your records. It isn't shown on the stream page yet.",
} as const;

export const SCHEDULE = {
  legend: "How it's paid",
  more: 'More schedules',
  fewer: 'Fewer schedules',
  examplesLabel: 'Start from an example',
  examplesGroup: 'Examples',
  seeExamples: 'See schedule examples',
  usingExample: (title: string) => `Using the "${title}" example. Change any value below.`,
  onceDaysLabel: 'Days until it is released',
  lengthLabel: 'Length (days)',
  waitLabel: 'Waiting period (days)',
  waitOptionalLabel: 'Waiting period (days, optional)',
  intervalLabel: 'How often',
  intervalOtherLabel: 'Days between payments',
  intervalOther: 'Another number of days',
  countLabel: 'How many payments',
  depositCoversLabel: 'Payments this deposit covers',
  upfrontDaysLabel: 'Day the first part is released',
  upfrontPercentLabel: 'First part (%)',
  customLegend: 'Release days',
  customDayLabel: 'Day',
  customShareLabel: 'Share (%)',
  customAdd: 'Add a release day',
  customHelper: 'Add up to 8 days. The last day is when the stream ends.',
  releasedOn: (date: string) => `Released on ${date}.`,
  endsOn: (date: string) => `Ends ${date}.`,
  waitHelper: (date: string) =>
    `Nothing can be claimed before ${date}. On that day, everything built up so far becomes ready to claim at once.`,
  recurringWaitHelper: 'Wait this many days before the payment schedule starts.',
  upfrontDayHelper: (date: string) => `Released on ${date}. Must come before the end.`,
  upfrontPercentHelper: 'The rest is released evenly after that day, until the end date.',
  countHelper: (date: string) => `The last payment is on ${date}.`,
  depositCoversHelper: 'We use this to work out the amount of each payment.',
  stepRoundingLine: 'The last part is a little smaller, so the total comes out exact.',
  customRowHelper: (date: string, amount: string | null) => (amount ? `${date} · ${amount}` : date),
  topUpsLabel: 'Keep it going as long as you add funds',
  topUpsOn: (count: number) =>
    `Your deposit covers the first ${formatCount(count, 'payment', 'payments')}. Add funds any time to keep it going. The amount, schedule and recipient stay the same.`,
  topUpsOff: (count: number) => `The stream ends after ${formatCount(count, 'payment', 'payments')}.`,
  cancelableLabel: 'You can pause or cancel this later',
  cancelableManyLabel: 'You can pause or cancel these streams later',
  cancelableOn: (name: string) =>
    `If you cancel, ${name} keeps what's already released and the rest comes back to you. While it's paused, nothing can be claimed. You can't change this after funding.`,
  cancelableOnRecurring: (name: string) =>
    `If you cancel, everything ${name} hasn't claimed comes back to you, including payments that are due but not claimed yet. While it's paused, nothing can be claimed. You can't change this after funding.`,
  cancelableOff:
    "No one can pause or cancel it after it's funded. The recipient can claim everything as it's released. You can't change this after funding.",
  cancelableRecipientFallback: 'the recipient',
  transferableLabel: 'The recipient can move this to another wallet',
  transferableManyLabel: 'Recipients can move these to another wallet',
  transferableOn: (name: string) =>
    `If ${name} loses a wallet or switches to a new one, they can move what's left of the stream there. The amounts and dates stay the same. You can't change this after funding.`,
  transferableOff: "The stream always pays the address you entered. You can't change this after funding.",
  recurringPaymentLine: 'Only need the same amount on a schedule?',
  recurringPaymentLink: 'Create a recurring payment',
  intervalChoice: (days: number) => (days === 7 ? 'Every week' : days === 14 ? 'Every 2 weeks' : `Every ${days} days`),
} as const;

export const SCHEDULE_ERRORS = {
  wholeDays: 'Enter a whole number of days, 1 or more.',
  wholeCount: 'Enter a whole number of payments, 1 or more.',
  waitBeforeEnd: (length: number) => `The waiting period has to end before the stream ends. Use fewer than ${length} days.`,
  upfrontBeforeEnd: (length: number) => `The first part has to be released before the end, day ${length}.`,
  upfrontPercent: 'The first part must be more than 0% and less than 100%.',
  customCount: 'Use 1 to 8 release days.',
  customDay: (n: number) => `Release ${n} needs a day, like 90.`,
  customShare: (n: number) => `Release ${n} needs a share above 0%.`,
  customOrder: 'Each release day must be later than the one before it.',
  customTotal: (sum: string) => `Shares add up to ${sum}%. They need to total 100%.`,
  evenSplit: (amount: string, count: number, lower: string | null, higher: string) =>
    lower
      ? `${amount} can't be split into ${count} equal payments. Use ${lower} or ${higher}.`
      : `${amount} can't be split into ${count} equal payments. Use ${higher}.`,
  pickAmount: (amount: string) => `Use ${amount}`,
} as const;

export const FIELD_ERRORS = {
  recipientMissing: 'Enter the address of the person you want to pay.',
  recipientRegular: "Use a regular wallet address. Contract addresses can't receive streams.",
  tokenMissing: 'Enter the token ID.',
  tokenLength: (n: number) => `Token IDs are 64 characters. This one has ${n}.`,
  tokenCharacters: 'Token IDs use only the numbers 0 to 9 and the letters a to f.',
  tokenNotFound: `We couldn't find this token on ${NETWORK_NAME}. Check the ID.`,
  tokenUnavailable: "We couldn't check this token right now. Try again in a minute.",
  amountMissing: 'Enter an amount above 0.',
  amountBchDecimals: 'BCH amounts can have up to 8 decimal places.',
  amountTokenDecimals: (decimals: number) =>
    decimals > 0
      ? `This token allows up to ${formatCount(decimals, 'decimal place', 'decimal places')}.`
      : 'This token only comes in whole amounts.',
  vaultMissing: 'Pick the vault to list these streams under.',
  startDate: 'Pick a start date from today on.',
} as const;

export const SUMMARY = {
  stepTitle: "Couldn't continue",
  stepMessage: 'Some details need fixing. Nothing has been sent.',
  createTitle: "Couldn't create the stream",
  fundTitle: "Couldn't fund the streams",
  nothingSent: 'Nothing was sent from your wallet.',
  recipientRefused: "The recipient address has to be a regular wallet address. Contract addresses can't receive streams. Nothing was sent.",
  splitRefused: "The amount doesn't split evenly into the payments. Change the amount or the number of payments. Nothing was sent.",
  savedNoLinkTitle: 'Your stream was saved',
  savedNoLink: "We couldn't open it from here. Find it in Streams and fund it there. Nothing was sent from your wallet.",
  goToStreams: 'Go to streams',
} as const;

export const REVIEW_ROWS = {
  recipient: 'Recipient',
  amount: 'Amount',
  firstDeposit: 'First deposit',
  schedule: 'Schedule',
  example: 'Example',
  firstRelease: 'First release',
  ends: 'Ends',
  noEnd: (count: number) => `No end date. Your deposit covers ${formatCount(count, 'payment', 'payments')}.`,
  pauseCancel: 'Pause and cancel',
  canPause: 'You can pause or cancel',
  cantPause: "Can't be paused or cancelled",
  recipientMove: 'Recipient can move it',
  canMove: 'Yes, to another wallet',
  cantMove: 'No',
  listedUnder: 'Listed under',
  noVault: 'No vault',
  paidFrom: 'Paid from',
  token: 'Token',
  note: 'Note',
  people: 'People',
  total: 'Total',
  starts: 'Starts',
} as const;

export const REVIEW_NOTES = {
  clockTitle: 'The schedule starts when you fund the stream',
  clockBody:
    "If you fund it later, the dates move to match. After you fund it, the amount and schedule can't be changed.",
  balance: (balance: string) => `Your wallet has ${balance}.`,
  balanceLowTitle: 'Not enough BCH in your wallet yet',
  balanceLow: (need: string, balance: string) =>
    `You need ${need} plus a small network fee to fund it. Your wallet has ${balance}. You can still create the stream and fund it later.`,
  twoApprovals:
    'When you fund it, your wallet may ask you to approve twice: first it sends a little BCH back to your own wallet, then it funds the stream.',
  next: (amount: string) => `Next, you'll fund the stream to lock ${amount} in a contract.`,
  nextFallback: "Next, you'll fund the stream. It locks the money in a contract.",
  continue: 'Continue to funding',
  busy: 'Creating stream',
  completeFirst: 'Fix the details above to continue',
} as const;

export const LEAVE = {
  title: 'Leave without creating this stream?',
  titleBatch: 'Leave without setting up these streams?',
  body: 'What you entered will be cleared. Nothing has been sent.',
  keep: 'Keep editing',
  leave: 'Leave',
  busy: 'Leaving',
} as const;

export const SIDE = {
  scheduleTitle: 'Schedule',
  noAmount: 'Add an amount to see the dates.',
  noDates: 'Finish the schedule to see the dates.',
  unevenSplit: 'Pick an amount that splits evenly to see the dates.',
  unevenSplitMany: 'Pick amounts that split evenly for everyone to see the dates.',
  firstRelease: 'First release',
  ends: 'Ends',
  noEnd: 'No end date',
  createdNow: 'When you create it',
} as const;

export const BATCH = {
  tokenNoteTitle: 'Fund it from the wallet that created the token',
  tokenNoteBody:
    'Streams in a token for many people at once have to be funded from the wallet with permission to create the token, usually the wallet that created it.',
  noVaultTitle: "You don't have a vault yet",
  noVaultBody:
    'A batch is listed under a vault, so create one first. To pay one person, create a single stream. It works without a vault.',
  createVault: 'Create a vault',
  createStream: 'Create a stream',
  vaultLabel: 'List under a vault',
  vaultPick: 'Pick a vault',
  vaultHelper: 'The money comes from your wallet. The streams are listed under this vault.',
  entryLabel: 'How to add people',
  typeList: 'Type the list',
  importCsv: 'Import a CSV file',
  limits: 'Up to 100 people. Regular wallet addresses only.',
  peopleLegend: 'People',
  addPerson: 'Add person',
  addressLabel: 'Address',
  amountLabel: 'Amount',
  noteLabel: 'Note',
  noteHelper: 'Notes are included when you export the batch as a CSV file.',
  count: (n: number) => `${n} of 100 people`,
  full: "That's 100 people, the most one batch takes. Put the rest in another batch.",
  importLabel: 'Choose a CSV file with one person per line',
  importLimits: 'Up to 100 people. Regular wallet addresses only. Columns: address, amount and an optional note.',
  imported: (n: number) => `${formatCount(n, 'person', 'people')} added. Switch to "Type the list" to check or change them.`,
  scheduleColumnsTitle: 'This file has schedule columns',
  scheduleColumnsBody: 'A batch uses one schedule for everyone, so those columns are ignored. Pick the schedule in the next step.',
  replaceTitle: (n: number) => `Replace the ${formatCount(n, 'person', 'people')} in your list?`,
  replaceBody: (n: number) => `The ${formatCount(n, 'person', 'people')} from the file will take their place.`,
  replaceKeep: 'Keep my list',
  replaceConfirm: 'Replace',
  replaceBusy: 'Replacing',
  overLimit: 'Only the first 100 people were added. Put the rest in another batch.',
  problemAddress: "This isn't a regular wallet address.",
  problemAmount: 'This needs an amount above 0.',
  problemTooPrecise: 'BCH amounts can have up to 8 decimal places.',
  startLabel: 'Start date',
  startHelper: (date: string) => `Starts at midnight your time on ${date}.`,
  sampleNote: 'Designer',
  sampleNoteTwo: 'Support',
  sampleFile: 'flowguard-batch-example.csv',
  peopleCount: (n: number) => formatCount(n, 'person', 'people'),
  summaryLine: (n: number, total: string) => `${formatCount(n, 'person', 'people')} · ${total} in all`,
  eachGets: 'Each person gets',
  eachGetsValue: 'Their own stream and contract',
  listLabel: 'People in this batch',
  lineHeader: 'Line',
  addressHeader: 'Address',
  amountHeader: 'Amount',
  checkHeader: 'Check',
  rowOk: 'Ready',
  noPeople: 'Add at least one person with an address and an amount.',
  fund: (n: number) => `Review and fund ${formatCount(n, 'stream', 'streams')}`,
  fundReason: 'Add at least one person to continue',
  fixReason: 'Fix the people marked above to continue',
  reviewPlan: (n: number, total: string, vault: string) =>
    `Fund ${formatCount(n, 'stream', 'streams')}, ${total} in all, listed under ${vault}.`,
  goesTo: (n: number) => `${n} new ${plural(n, 'contract', 'contracts')}, one for each person`,
  whoCanStopYes: 'You can pause or cancel each stream',
  whoCanStopNo: 'No one',
  balanceCheck: 'Your wallet balance covers the total',
  balanceFix: (balance: string, total: string) => `Your wallet has ${balance}. You need ${total} plus a small network fee.`,
  done: (n: number) => `Your ${formatCount(n, 'stream is', 'streams are')} set up. Each person claims from their own stream.`,
  goToBatch: 'See your batches',
  viewStreams: 'Go to streams',
  backToVault: (vault: string) => `Back to ${vault}`,
  lockedTitle: 'Your streams are funded',
  lockedNotSyncedTitle: 'Your funding went through',
  lockedNotSyncedBody: "We're still updating your streams. They'll show in Streams soon. Don't fund this batch again.",
  lockedBody: 'To pay more people, start a new batch from Streams.',
  eachPerson: 'each person',
  rowField: (line: number, field: string) => `Person ${line}: ${field}`,
  rowLabel: (line: number) => `Person ${line}`,
  sampleAddress: (name: string) => `replace with ${name}'s address`,
  sampleNames: ['Sam', 'Maya'] as const,
  releasesTitle: 'Releases across everyone',
  summaryTitle: 'Summary',
  scheduleLine: 'Schedule',
  networkLine: 'Network',
  noneYet: 'No one yet',
  lineRefused: (line: number, address: string) =>
    `Person ${line}, ${address}, wasn't accepted. Check that person's address and amount. Nothing was sent.`,
} as const;

export const EVEN_SPLIT_ROW = (amount: string, count: number, higher: string) =>
  `${amount} can't be split into ${count} equal payments. Use ${higher}.`;
