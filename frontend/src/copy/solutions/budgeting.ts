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
  VAULT_SENDING,
  SAMPLE_PEOPLE,
  appLink,
  daysFromNow,
  type SolutionPageCopy,
} from './shared';

const PLAN_EVERY_DAYS = 30;
const PER_PERIOD = '3.00';
const PERIODS = 4;
const SAMPLE_VAULT = { id: 'ops-budget', name: 'Ops budget' };

export const SIGNERS = [
  { ...SAMPLE_PEOPLE.sam, approved: true },
  { ...SAMPLE_PEOPLE.maya, approved: true },
  { ...SAMPLE_PEOPLE.ade, approved: false },
];

export const VAULT_FACTS = {
  whoCanMove: "The signers you chose, 1 or 2 of 3 of them, must approve each payment. FlowGuard can't move the money.",
  pausing: 'Any one signer can pause the vault. Starting it again needs the approvals you chose.',
  ifFlowGuardGoes:
    'The money stays in the vault and the same approvals still apply. Sending a payment then needs another tool that can build the transaction.',
} as const;

export const BUDGETING: SolutionPageCopy = {
  hero: {
    eyebrow: 'Vaults and budget plans',
    headline: 'Keep shared money',
    accent: 'behind several approvals.',
    lead: 'A vault moves money only when enough signers approve. A budget plan releases money from your wallet on a schedule.',
    primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.createVault) },
    secondary: { label: MARKETING_COPY.seeExample, href: EXAMPLE_ANCHOR },
    note: 'You need three signer wallets and a little BCH for network fees.',
    visual: { kind: 'approvals', meter: { required: 2, signers: SIGNERS } },
  },
  steps: [
    {
      title: 'Choose three signers',
      body: "Add the public key of each signer's wallet. A vault's signers are set when you create it and can't be changed later.",
    },
    {
      title: 'Deposit money',
      body: 'Deposit BCH into the vault from your wallet. Anyone can see what it holds.',
    },
    {
      title: 'Approve each payment',
      body: `A signer asks for a payment with a spending request, and the other signers approve it. ${VAULT_SENDING}`,
    },
  ],
  example: {
    plan: {
      schedule: {
        kind: 'period-release',
        perPeriod: PER_PERIOD,
        everyDays: PLAN_EVERY_DAYS,
        periods: PERIODS,
        asset: BCH,
        vault: SAMPLE_VAULT,
      },
    },
    timeline: {
      asset: BCH,
      now: SAMPLE_NOW,
      blocks: Array.from({ length: PERIODS }, (_, index) => ({
        at: daysFromNow(index * PLAN_EVERY_DAYS - 1),
        amount: PER_PERIOD,
        state: index === 0 ? ('claimed' as const) : ('later' as const),
      })),
    },
  },
  decide: [
    { label: 'Signers', value: 'Three wallets, set once when you create the vault.' },
    { label: 'Approvals', value: '1 or 2 of 3 signers, chosen when you create the vault.' },
    { label: 'Spending limit', value: 'Optional. The most the vault can send in each period.' },
    { label: 'Budget plan', value: 'Money from your wallet, released on a schedule you set and listed under a vault.' },
  ],
  facts: {
    eyebrow: 'Vaults',
    network: NETWORK_WORD,
    rows: [
      { label: FACT_LABELS.whoCanMove, value: VAULT_FACTS.whoCanMove },
      { label: FACT_LABELS.sending, value: VAULT_SENDING },
      { label: FACT_LABELS.pausing, value: VAULT_FACTS.pausing },
      { label: FACT_LABELS.ifFlowGuardGoes, value: VAULT_FACTS.ifFlowGuardGoes },
      {
        label: FACT_LABELS.budgetPlans,
        value: "A budget plan's money comes from your wallet. Listing it under a vault doesn't move vault money.",
      },
    ],
  },
  source: CONTRACT_SOURCE.vaults,
  goodToKnow: [
    "A vault's signers are set when you create it and can't be changed later.",
    VAULT_SENDING,
    'Every payment needs the approvals you chose, small ones too.',
    "Spending rules in the Organization workspace are a plan only. They aren't enforced yet.",
    "A budget plan doesn't spend vault money. The money comes from your wallet.",
  ],
  faq: [
    {
      id: 'lost-wallet',
      question: 'What if a signer loses their wallet?',
      answer:
        `If the vault needs 2 of 3 approvals, the other two can still approve spending requests. ${VAULT_SENDING}`,
    },
    {
      id: 'stop-a-payment',
      question: 'Can one signer stop a bad payment?',
      answer: "One signer can pause the vault. Nothing leaves until enough signers start it again.",
    },
    {
      id: 'who-approved',
      question: 'Can I see who approved a payment?',
      answer: "Yes. Each approval is a transaction on Bitcoin Cash, and the vault's page shows who approved each spending request.",
    },
  ],
  closing: {
    headline: 'Keep shared money',
    accent: 'behind several approvals.',
    lead: 'Pick three signers you trust. From then on, no payment leaves without the approvals you chose.',
    primary: { label: 'Create vault', href: appLink(APP_PATHS.createVault) },
    secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
    facts: CLOSING_FACTS,
  },
};
