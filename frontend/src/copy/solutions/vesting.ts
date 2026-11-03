import {
  APP_PATHS,
  CLOSING_FACTS,
  CONTRACT_SOURCE,
  EXAMPLE_ANCHOR,
  FACT_LABELS,
  MARKETING_COPY,
  MARKETING_PATHS,
  NETWORK_WORD,
  SAMPLE_NOW,
  SAMPLE_PEOPLE,
  SAMPLE_TOKEN,
  STREAM_FACTS,
  appLink,
  daysFromNow,
  type SolutionPageCopy,
} from './shared';

const RELEASE_EVERY_DAYS = 30;
const PER_RELEASE = '2000';

function releaseDay(index: number): number {
  return daysFromNow((index - 2) * RELEASE_EVERY_DAYS - 1);
}

const TIMELINE = {
  asset: SAMPLE_TOKEN,
  now: SAMPLE_NOW,
  blocks: [0, 1, 2, 3, 4, 5].map((index) => ({
    at: releaseDay(index),
    amount: PER_RELEASE,
    state: index < 2 ? ('claimed' as const) : index === 2 ? ('ready' as const) : ('later' as const),
  })),
};

export const VESTING: SolutionPageCopy = {
  hero: {
    eyebrow: 'Vesting',
    headline: 'Pay out tokens or BCH',
    accent: 'bit by bit.',
    lead: "Set a schedule once. The person you pay claims each part as it's released, and you can see what's left at any time.",
    primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.createStream) },
    secondary: { label: MARKETING_COPY.seeExample, href: EXAMPLE_ANCHOR },
    note: MARKETING_COPY.whatYouNeed,
    visual: { kind: 'timeline', timeline: TIMELINE },
  },
  steps: [
    {
      title: 'Choose who and how much',
      body: "Add the recipient's address and the amount of BCH or tokens to pay out.",
    },
    {
      title: 'Pick a schedule',
      body: 'All at once on a date, evenly over time, or the same amount each time. You can start with a waiting period.',
    },
    {
      title: 'Fund it',
      body: "Approve one transaction in your wallet to lock the money in a contract. The recipient claims each part as it's released.",
    },
  ],
  example: {
    plan: {
      recipient: SAMPLE_PEOPLE.maya,
      schedule: {
        kind: 'step',
        perRelease: PER_RELEASE,
        asset: SAMPLE_TOKEN,
        everyDays: RELEASE_EVERY_DAYS,
        count: TIMELINE.blocks.length,
        start: releaseDay(0),
      },
    },
    timeline: TIMELINE,
  },
  decide: [
    { label: 'Recipient', value: 'One Bitcoin Cash address for each stream. To pay a whole team, use Pay many people.' },
    { label: 'Amount', value: 'Any amount of BCH or of one token.' },
    { label: 'Schedule', value: 'All at once on a date, evenly over time, or the same amount each time.' },
    { label: 'Waiting period', value: 'Optional. Nothing is released until it ends.' },
    { label: 'Who can cancel', value: 'You, if you allow it when you set it up. Otherwise nobody.' },
  ],
  facts: {
    eyebrow: 'Streams',
    network: NETWORK_WORD,
    rows: [
      { label: FACT_LABELS.whoCanMove, value: STREAM_FACTS.whoCanMove },
      { label: FACT_LABELS.ifCancelled, value: STREAM_FACTS.ifCancelled },
      { label: FACT_LABELS.ifFlowGuardGoes, value: STREAM_FACTS.ifFlowGuardGoes },
    ],
  },
  source: CONTRACT_SOURCE.streams,
  goodToKnow: [
    "The schedule starts on the start date, or when you fund it if that's later.",
    'The recipient claims each part themselves. Nothing is sent to them automatically.',
    'Once you fund the stream, nobody can change its dates or amounts.',
    'Amounts are fixed in BCH or the token, so their value in dollars can change.',
  ],
  faq: [
    {
      id: 'change-schedule',
      question: 'Can I change the schedule after I create it?',
      answer:
        "No. The dates and amounts are part of the contract. If you allowed cancelling, you can cancel and create a new stream.",
    },
    {
      id: 'leaves-early',
      question: 'What if the person leaves early?',
      answer:
        "If you allowed cancelling, cancel the stream. They keep what's already released, and the rest comes back to your wallet.",
    },
    {
      id: 'which-tokens',
      question: 'Which tokens can I use?',
      answer: 'BCH or any token on Bitcoin Cash. The recipient needs a wallet that holds tokens, like Paytaca or Cashonize.',
    },
  ],
  closing: {
    headline: 'Start with',
    accent: 'one small stream.',
    lead: 'Send a little BCH to yourself on a short schedule and watch it release. Then cancel it and get the rest back.',
    primary: { label: 'Create stream', href: appLink(APP_PATHS.createStream) },
    secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
    facts: CLOSING_FACTS,
  },
};
