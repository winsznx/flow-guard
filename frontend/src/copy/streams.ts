import { formatCount } from './format';

/** Stored stream types, as the API sends them. */
export type StreamType = 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';

/** The six schedule choices from the create flow, in the order it shows them. */
export type ScheduleChoice =
  | 'once'
  | 'evenly'
  | 'sameAmount'
  | 'waitThenEvenly'
  | 'partNow'
  | 'custom';

export const SCHEDULE_CHOICE: Record<ScheduleChoice, { name: string; line: string }> = {
  once: {
    name: 'All at once on a date',
    line: 'Everything is released on one day. Nothing before.',
  },
  evenly: {
    name: 'Evenly over time',
    line: 'A little is released every second until the end date.',
  },
  sameAmount: {
    name: 'Same amount each time',
    line: 'An equal amount is released at a fixed interval, like every 30 days.',
  },
  waitThenEvenly: {
    name: 'Nothing until a date, then evenly',
    line: 'Nothing is released during a waiting period. Then what has built up is released at once, and the rest evenly.',
  },
  partNow: {
    name: 'Part now, the rest over time',
    line: 'Part is released on one day. The rest is released evenly after that, until the end date.',
  },
  custom: {
    name: 'Custom dates',
    line: 'You pick each day and how much is released on it.',
  },
};

export const OTHER_SCHEDULE = 'Custom schedule';

type ScheduleFields = {
  stream_type: string;
  schedule_count?: number | null;
  cliff_timestamp?: number | null;
  start_time?: number | null;
};

const CHOICE_BY_TYPE: Record<StreamType, (stream: ScheduleFields) => ScheduleChoice> = {
  LINEAR: (stream) =>
    stream.cliff_timestamp && stream.start_time && stream.cliff_timestamp > stream.start_time
      ? 'waitThenEvenly'
      : 'evenly',
  RECURRING: () => 'sameAmount',
  STEP: (stream) => (stream.schedule_count === 1 ? 'once' : 'sameAmount'),
  TRANCHE: () => 'custom',
  HYBRID: () => 'partNow',
};

function isStreamType(value: string): value is StreamType {
  return Object.prototype.hasOwnProperty.call(CHOICE_BY_TYPE, value);
}

/** Which schedule choice a stored stream matches, from its type and the fields the API returns. */
export function scheduleChoiceOf(stream: ScheduleFields): ScheduleChoice | null {
  const type = stream.stream_type.toUpperCase();
  return isStreamType(type) ? CHOICE_BY_TYPE[type](stream) : null;
}

export function scheduleName(stream: ScheduleFields): string {
  const choice = scheduleChoiceOf(stream);
  return choice ? SCHEDULE_CHOICE[choice].name : OTHER_SCHEDULE;
}

const ABOUT_WEEKLY =
  'Each bar in the timeline is about one week. Money is released every second, not once a week.';

const STREAM_HELP = { label: 'How streams work', to: '/how-it-works' } as const;

export const STREAMS_PAGE = {
  title: 'Streams',
  description:
    "Money released bit by bit over time. The person you pay claims it as it's released.",
  create: 'Create stream',
  payMany: 'Pay many people',
  tabsLabel: 'Stream views',
  tabs: { all: 'All streams', batches: 'Batches' },
  viewLabel: 'Show streams',
  views: { all: 'All', receiving: 'Receiving', sending: 'Sending' },
  filterLabel: 'Filter by status',
  filterAll: 'All',
  searchLabel: 'Search streams',
  searchPlaceholder: 'Search by address or note',
  listLabel: 'Your streams',
  stats: {
    streams: 'Streams',
    total: 'Total in streams',
    ready: 'Ready to claim',
    recipientsCanClaim: 'Recipients can claim',
    claimed: 'Already claimed',
  },
  tokenNote: (count: number) =>
    `BCH only. Doesn't include ${formatCount(count, 'token stream', 'token streams')}.`,
  readyNote: 'Only streams that pay you.',
  readyNotes: (count: number) =>
    `Only streams that pay you. BCH only, ${formatCount(count, 'token stream', 'token streams')} not included.`,
  columns: {
    stream: 'Stream',
    status: 'Status',
    total: 'Total',
    ready: 'Ready to claim',
    last: 'Last activity',
  },
  streamTo: (shortAddress: string) => `Stream to ${shortAddress}`,
  streamFrom: (shortAddress: string) => `Stream from ${shortAddress}`,
  listedUnderVault: 'Listed under a vault',
  noActivity: 'No activity yet',
  starts: (date: string) => `Starts ${date}`,
  noResultsThing: 'streams',
  empty: {
    all: {
      title: 'No streams yet',
      description: 'A stream pays someone bit by bit over time, on a schedule you choose.',
    },
    sending: {
      title: 'No streams yet',
      description: "You haven't created a stream yet. A stream pays someone bit by bit over time.",
    },
    receiving: {
      title: 'Nothing coming to you yet',
      description:
        'Nobody is paying this wallet through a stream yet. When someone does, it shows up here.',
    },
    example: 'For example: pay a contractor 0.50 BCH every 30 days, 6 times.',
    help: STREAM_HELP,
  },
  error: {
    title: "Your streams didn't load",
    reason: 'Check your connection and try again.',
  },
  links: {
    examples: 'Schedule examples',
    activity: 'Activity in Explorer',
  },
} as const;

export const STREAM_BATCHES = {
  description: 'Streams you set up together, and how each one is doing.',
  documentTitle: 'Stream batches',
  scopeLabel: 'Show batches',
  scopes: { mine: 'Created by you', vaults: 'Your vaults' },
  vaultsLine: 'Batches listed under vaults you created or sign for, whoever set them up.',
  filterLabel: 'Filter by status',
  filterAll: 'All',
  listLabel: 'Batches',
  stats: {
    batches: 'Batches',
    recipients: 'Recipients',
    total: 'Total in batches',
  },
  tokenNote: (count: number) =>
    `BCH only. Doesn't include ${formatCount(count, 'token batch', 'token batches')}.`,
  columns: {
    batch: 'Batch',
    status: 'Status',
    recipients: 'Recipients',
    total: 'Total',
    created: 'Created',
  },
  batchName: (count: number) => `${formatCount(count, 'person', 'people')} paid together`,
  listedUnderVault: 'Listed under a vault',
  notListed: 'Not listed under a vault',
  progress: (
    total: number,
    counts: { active: number; waiting: number; finished: number; cancelled: number }
  ) => {
    if (total === 0) return 'No streams yet';
    const parts = [
      counts.active > 0 ? `${counts.active} active` : null,
      counts.waiting > 0 ? `${counts.waiting} not funded yet` : null,
      counts.finished > 0 ? `${counts.finished} finished` : null,
      counts.cancelled > 0 ? `${counts.cancelled} cancelled` : null,
    ].filter((part): part is string => part !== null);
    const counted = counts.active + counts.waiting + counts.finished + counts.cancelled;
    const others = total - counted;
    if (others > 0) parts.push(`${others} paused`);
    return parts.join(' · ');
  },
  noResultsThing: 'batches',
  empty: {
    mine: {
      title: 'No batches yet',
      description:
        "You haven't paid many people at once yet. A batch sets up a stream for each person in one go.",
    },
    vaults: {
      title: 'No vault batches yet',
      description:
        'When a batch is listed under one of your vaults, it shows up here. The money comes from the wallet that set it up.',
    },
    help: STREAM_HELP,
  },
  error: {
    title: "Your batches didn't load",
    reason: 'Check your connection and try again.',
  },
  createBatch: 'Pay many people',
  drawer: {
    label: 'Batch details',
    title: (count: number) => `${formatCount(count, 'person', 'people')} paid together`,
    created: (date: string) => `Created ${date}`,
    details: {
      recipients: 'Recipients',
      total: 'Total',
      status: 'Streams',
      listedUnder: 'Listed under',
      funding: 'Funding',
    },
    vault: 'A vault',
    noVault: 'Not listed under a vault',
    notFunded: 'Not funded yet',
    download: 'Download recipients (CSV)',
    downloading: 'Preparing the file',
    downloadFailed: "Couldn't download the file. Nothing has changed. Try again.",
    recipientsHeading: 'Recipients',
    recipientsLabel: 'Streams in this batch',
    activityHeading: 'Activity',
    streamTo: (shortAddress: string) => `Stream to ${shortAddress}`,
    error: {
      title: "This batch didn't load",
      reason: 'Check your connection and try again.',
    },
    noStreams: 'No streams in this batch.',
  },
} as const;

export const STREAM_DETAIL = {
  breadcrumb: 'Streams',
  titleTo: (shortAddress: string) => `Stream to ${shortAddress}`,
  roleLine: {
    sender: (recipient: string) => `You pay ${recipient} bit by bit over time.`,
    recipient: (sender: string) =>
      `${sender} set this up to pay you. You claim each part when it's released.`,
    viewer: (sender: string, recipient: string) =>
      `${sender} pays ${recipient} bit by bit over time.`,
  },
  stateLine: {
    created: (date: string) => `Created ${date}`,
  },
  notice: {
    notFundedTitle: 'Not funded yet',
    notFundedSender: (total: string, recipient: string) =>
      `Nothing is locked yet. Fund it to lock ${total} for ${recipient}.`,
    notFundedSingle:
      'If the start date has passed by the time you fund it, the schedule starts when you fund it.',
    notFundedBatch: (date: string) =>
      `The schedule started when the stream was created, on ${date}. Fund it right away so nothing builds up.`,
    notFundedRecipient:
      "The sender hasn't funded this stream yet. Nothing is locked for you until they do.",
    pausedTitle: 'Paused',
    pausedRecipient: 'The sender paused this stream. You can claim again when they resume it.',
    pausedSender: (recipient: string) =>
      `While it's paused, ${recipient} can't claim anything, including money already released. Time paused doesn't count toward the schedule.`,
    deferredTitle: (date: string) => `Claim opens on ${date}`,
    deferred: (date: string) =>
      `This stream can pay for one more claim, so you claim everything left at once from ${date}.`,
    vaultTitle: 'Listed under a vault',
    vaultSender: 'This stream shows on a vault page. The money came from your wallet.',
    vaultOther: "This stream shows on a vault page. The money came from the sender's wallet.",
    openVault: 'Open vault',
  },
  action: {
    readyLabel: 'Ready to claim',
    releasedLabel: 'Released so far',
    ofTotal: (total: string) => `of ${total}`,
    claim: (amount: string) => `Claim ${amount}`,
    next: (amount: string, date: string) => `Next ${amount} on ${date}.`,
    continuous: (end: string) => `Released bit by bit until ${end}.`,
    waitUntil: (date: string) => `Nothing can be claimed before ${date}.`,
    claimLag:
      'Money becomes ready to claim about 2 hours after the schedule reaches it. The network needs that time before it accepts the claim.',
    allClaimed: 'Everything is claimed.',
    nothingYet: 'Nothing has been released yet.',
    paused: 'Claims are off while the stream is paused.',
    cancelled: 'This stream was cancelled. Nothing more is released.',
    finished: 'This stream is finished.',
    notFunded: 'Nothing is released until the stream is funded.',
    deferred: (date: string) => `You can claim it all from ${date}.`,
    fund: 'Fund stream',
    addFunds: 'Add funds',
    copyShareLink: 'Copy share link',
  },
  schedule: {
    heading: 'Schedule',
    linear: (end: string) => `A little is released every second until ${end}.`,
    linearWait: (wait: string, end: string) =>
      `Nothing is released before ${wait}. Then what has built up is released at once, and the rest evenly until ${end}.`,
    upfront: (amount: string, date: string, end: string) =>
      `${amount} is released on ${date}. The rest is released evenly until ${end}.`,
    noEnd:
      'No end date. Payments continue while there is money in the stream, and the sender can add more.',
    empty: "The schedule for this stream isn't available.",
    paused:
      'Release dates wait while the stream is paused. When it resumes, each one moves later by the time it was paused.',
    pausedSince: (date: string) =>
      `Paused since ${date}. When it resumes, each release date moves later by the time it was paused.`,
    aboutWeekly: ABOUT_WEEKLY,
  },
  activityHeading: 'Activity',
  detailsHeading: 'Details',
  details: {
    from: 'From',
    to: 'To',
    paidIn: 'Paid in',
    token: 'Token',
    copyTokenId: 'Copy token ID',
    schedule: 'Schedule',
    howOften: 'How often',
    eachRelease: 'Each release',
    starts: 'Starts',
    waitUntil: 'Waiting period ends',
    upfront: 'First part',
    ends: 'Ends',
    noEnd: 'No end date',
    canPause: 'Sender can pause or cancel',
    canChangeRecipient: 'Recipient can be changed',
    canAddFunds: 'Sender can add funds',
    listedUnder: 'Listed under',
    vault: 'A vault',
    notListed: 'Not listed under a vault',
    reference: 'Reference',
    copyReference: 'Copy reference',
    yes: 'Yes',
    no: 'No',
  },
  whoHeading: 'Who can move the money',
  who: {
    cancelable: (recipient: string) =>
      `Only ${recipient} can claim. The sender can pause or cancel. If they cancel, ${recipient} keeps what's already released and the rest goes back to the sender.`,
    recurringCancelable: (recipient: string) =>
      `Only ${recipient} can claim. The sender can pause or cancel. If they cancel, everything not claimed yet goes back to the sender, including payments that are due.`,
    fixed: (recipient: string) =>
      `Only ${recipient} can claim. Nobody can pause or cancel this stream.`,
    youCancelable:
      "Only you can claim. The sender can pause or cancel. If they cancel, you keep what's already released and the rest goes back to the sender.",
    youRecurring:
      "Only you can claim. The sender can pause or cancel. If they cancel, everything you haven't claimed goes back to the sender, including payments that are due.",
    youFixed: 'Only you can claim. Nobody can pause or cancel this stream.',
  },
  manageHeading: 'Manage',
  manage: {
    pause: 'Pause stream',
    resume: 'Resume stream',
    cancel: 'Cancel stream',
    changeRecipient: 'Change recipient',
  },
  loadError: {
    title: "This stream didn't load",
    reason: 'Check your connection and try again.',
  },
  notFound: {
    title: "We can't find this stream",
    reason: 'Check the link, or go back to your streams.',
    back: 'Back to streams',
  },
  review: {
    fund: {
      title: 'Fund this stream?',
      next: (recipient: string) =>
        `${recipient} can claim each part as it's released. Send them a link to this page.`,
      twoSteps: 'Token streams can ask for two approvals in your wallet. Approve both.',
    },
    claim: {
      next: 'The money is on its way to your wallet.',
      who: 'Nobody. It goes straight to your wallet.',
    },
    cancel: {
      title: 'Cancel this stream?',
      vesting: (recipient: string, keeps: string, back: string) =>
        `${recipient} keeps the ${keeps} released but not claimed yet. The other ${back} comes back to your wallet. This can't be undone.`,
      vestingAllBack: (back: string) =>
        `The ${back} not released yet comes back to your wallet. This can't be undone.`,
      recurring:
        "Everything not claimed yet comes back to your wallet, including payments that are due but not claimed. This can't be undone.",
      confirm: 'Cancel stream',
      keep: 'Keep stream',
      next: 'The stream is cancelled. Its page stays here so you can see what happened.',
    },
    pause: {
      title: 'Pause this stream?',
      body: (recipient: string) =>
        `While it's paused, ${recipient} can't claim anything, including money already released. Time paused doesn't count toward the schedule.`,
      confirm: 'Pause stream',
      keep: 'Keep it running',
      next: 'Resume it from this page when you want claims to start again.',
    },
    resume: {
      confirm: 'Resume stream',
      next: "Claims are on again. The time it was paused doesn't count toward the schedule.",
    },
    recipient: {
      title: 'Change who receives this stream?',
      body: 'Everything not claimed yet will go to the new address. Check it carefully.',
      amounts: (ready: string, later: string) =>
        `That's ${ready} ready to claim now and ${later} still to come.`,
      claimFirst: (ready: string) =>
        `To keep the ${ready} ready now, claim it before you change the recipient.`,
      newAddress: 'New recipient',
      confirm: 'Change recipient',
      keep: 'Keep recipient',
      next: 'Only the new address can claim from now on.',
    },
    addFunds: {
      next: 'Payments keep going on the same schedule.',
    },
  },
  recipientDialog: {
    title: 'Change recipient',
    address: 'New recipient address',
    helper: 'The Bitcoin Cash address that will receive everything not claimed yet.',
    sameAddress: 'This is the current recipient. Enter a different address.',
    check: 'I checked this address',
    checkLine: "Once this goes through, only the new address can claim. You can't undo it.",
    continue: 'Continue',
    cancel: 'Back',
    needsAddress: 'Enter a valid address to continue',
    needsCheck: 'Tick the box to confirm you checked the address',
  },
  addFundsDialog: {
    title: 'Add funds',
    amount: 'Amount to add',
    helper: (perPayment: string) => `Each ${perPayment} pays for one more payment.`,
    helperPlain: 'Payments stay the same size and on the same schedule.',
    preview: (count: number) =>
      `That pays for ${formatCount(count, 'more payment', 'more payments')}.`,
    tooSmall: (perPayment: string) => `Add at least ${perPayment}, the size of one payment.`,
    invalid: 'Enter an amount above 0.',
    continue: 'Continue',
    cancel: 'Back',
    needsAmount: 'Enter an amount to continue',
  },
} as const;

export const SCHEDULE_EXAMPLES = {
  title: 'Schedule examples',
  description: 'See how each schedule releases money before you pick one.',
  backToStreams: 'Back to streams',
  createCustom: 'Create stream',
  common: 'Most people pick one of these',
  more: 'More schedules',
  example: (total: string, count: number) =>
    `Example, if it started today: ${total} over ${formatCount(count, 'release', 'releases')}.`,
  exampleEven: (total: string, days: number) =>
    `Example, if it started today: ${total} over ${formatCount(days, 'day', 'days')}.`,
  use: 'Use this schedule',
  sampleName: 'Sam',
  aboutWeekly: ABOUT_WEEKLY,
  custom: {
    legend: 'Release dates',
    add: 'Add a date',
    day: 'Days after the start',
    percent: 'Percent of the total',
    total: (sum: number) => `The percents add up to ${sum}%.`,
    needsHundred: (sum: number) => `The percents add up to ${sum}%. They need to add up to 100%.`,
    needsOrder: (index: number) => `Release ${index} has to come after release ${index - 1}.`,
    needsDay: (index: number) => `Release ${index}: enter a day after the start.`,
    needsPercent: (index: number) => `Release ${index}: enter a percent above 0.`,
    fixFirst: 'Fix the dates above to use them',
  },
} as const;
