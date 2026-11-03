import {
  APP_PATHS,
  BCH,
  CLOSING_FACTS,
  CONTRACT_SOURCE,
  EXAMPLE_ANCHOR,
  FACT_LABELS,
  MARKETING_COPY,
  MARKETING_PATHS,
  NETWORK_WORD,
  SAMPLE_NOW,
  SAMPLE_PEOPLE,
  STREAM_FACTS,
  appLink,
  daysFromNow,
  type SolutionPageCopy,
} from './shared';

const PAY_EVERY_DAYS = 30;
const PAY = '0.70';
const PAYMENTS = 6;

function payDay(index: number): number {
  return daysFromNow((index - 1) * PAY_EVERY_DAYS - 1);
}

const TIMELINE = {
  asset: BCH,
  now: SAMPLE_NOW,
  blocks: Array.from({ length: PAYMENTS }, (_, index) => ({
    at: payDay(index),
    amount: PAY,
    state: index === 0 ? ('claimed' as const) : index === 1 ? ('ready' as const) : ('later' as const),
  })),
};

export const PAYROLL: SolutionPageCopy = {
  hero: {
    eyebrow: 'Payroll',
    headline: 'Pay your team',
    accent: 'on a schedule.',
    lead: "Set up a payment for each person in one go. Each person claims their pay when it's due.",
    primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.payManyPeople) },
    secondary: { label: MARKETING_COPY.seeExample, href: EXAMPLE_ANCHOR },
    note: MARKETING_COPY.whatYouNeed,
    visual: { kind: 'timeline', timeline: TIMELINE },
  },
  steps: [
    {
      title: 'Add your team',
      body: "Enter each person's address and pay, or import them from a CSV file. Each person gets their own stream.",
    },
    {
      title: 'Pick the schedule',
      body: 'For example, the same amount every 30 days, six times. Everyone on the list follows the schedule you pick.',
    },
    {
      title: 'Fund it',
      body: "Approve in your wallet to lock the full pay in contracts. Each person claims their part when it's due.",
    },
  ],
  example: {
    plan: {
      recipient: SAMPLE_PEOPLE.sam,
      schedule: {
        kind: 'step',
        perRelease: PAY,
        asset: BCH,
        everyDays: PAY_EVERY_DAYS,
        count: PAYMENTS,
        start: payDay(0),
      },
    },
    timeline: TIMELINE,
  },
  decide: [
    { label: 'People', value: 'Everyone you add, each with their own address and amount.' },
    { label: 'Amount', value: 'BCH. To pay one person in a token, create a single stream. Amounts are fixed, so their value in dollars can change.' },
    { label: 'How often', value: 'A set number of days between payments, like every 7 or every 30 days.' },
    { label: 'How many payments', value: 'How many times each person is paid.' },
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
    "Each person claims their own pay. Nothing is sent to them automatically, so tell them when it's ready.",
    "Funding locks the pay for the whole schedule, so a payday can't be missed for lack of money.",
    'Schedules count in days. Every 30 days drifts from the same date each month.',
    'The schedule starts when you create the streams. Fund them right away so nothing builds up.',
    'Pay many people lists the streams under one of your vaults, so you need a vault first. The money still comes from your wallet.',
  ],
  faq: [
    {
      id: 'pay-in-dollars',
      question: 'Can I pay a fixed amount in dollars?',
      answer:
        'No. You pay a fixed amount of BCH. To pay one person in a token, create a single stream. If the price changes, what each payment is worth in dollars changes too.',
    },
    {
      id: 'someone-leaves',
      question: 'What if someone leaves?',
      answer:
        "If you allowed cancelling, cancel their stream. They keep what's already released, and the rest comes back to your wallet.",
    },
    {
      id: 'recurring-payments',
      question: 'How is this different from a recurring payment?',
      answer:
        'Payroll here sets up a stream for each person and locks the full amount when you fund it. A recurring payment pays the same amount on a fixed schedule, and you add funds as you go.',
    },
  ],
  closing: {
    headline: 'Pay your team',
    accent: 'in one go.',
    lead: "Add each person once. They claim their pay in their own wallet when it's due.",
    primary: { label: 'Pay many people', href: appLink(APP_PATHS.payManyPeople) },
    secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
    facts: CLOSING_FACTS,
  },
};
