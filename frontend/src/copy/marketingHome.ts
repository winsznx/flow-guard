import { ACTIONS } from './common';
import { GITHUB_URL } from './nav';
import { APP_SITE_URL } from '../utils/publicUrls';
import { VAULT_SENDING } from './solutions/shared';

type HomeLink = { label: string; href: string };
type Fact = { title: string; body: string };

const CONTRACTS_URL = `${GITHUB_URL}/tree/main/contracts/core`;

export const HOME_HERO = {
  headline: 'Pay people and share money on Bitcoin Cash,',
  accent: 'with rules you can check.',
  lead: 'Set up salaries, vesting, shared team funds and airdrops. You approve every payment in your own wallet.',
  primary: { label: ACTIONS.openApp, href: APP_SITE_URL },
  secondary: { label: 'See how it works', href: '/how-it-works' },
  need: 'You need a Bitcoin Cash wallet and a little BCH for network fees.',
  getWallet: { label: ACTIONS.getWallet, href: '/faq#getting-started' },
} as const;

export const HOME_FACTS: [string, string, string] = [
  'You approve every payment in your own wallet',
  'The rules are stored on Bitcoin Cash',
  'Open source',
];

export const SAMPLE_CAPTION = 'Sample people and amounts';

export type FeatureGroup = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  action: HomeLink;
  facts: Fact[];
  visualLabel: string;
};

export const WHAT_YOU_CAN_DO = {
  number: '01',
  eyebrow: 'What you can do',
  groups: [
    {
      id: 'pay-people',
      eyebrow: 'Pay people',
      title: 'Pay someone bit by bit, or the same amount each time.',
      body: "Use it for a salary, a vesting plan or a retainer paid every 30 days. The person you pay claims each part from their own wallet when it's released.",
      action: { label: 'How vesting works', href: '/vesting' },
      facts: [
        { title: 'Streams', body: 'Money released bit by bit over time, with an optional waiting period at the start.' },
        { title: 'Recurring payments', body: 'The same amount on a fixed schedule, like every week or every 30 days.' },
        { title: 'Pay many people', body: 'Set up a stream for each person on your team in one go.' },
        { title: 'Payroll', body: "Pay your team on a schedule. Each person claims their pay when it's due." },
      ],
      visualLabel: 'A stream to Sam, 2.00 BCH every 30 days',
    },
    {
      id: 'shared-funds',
      eyebrow: 'Shared funds',
      title: 'Keep shared money behind several approvals.',
      body: `A vault holds money that moves only when enough of its signers approve. You pick the signers and how many must approve when you create it. ${VAULT_SENDING}`,
      action: { label: 'How vaults work', href: '/budgeting' },
      facts: [
        { title: 'Vaults', body: 'Shared money that needs enough signers to approve, like 2 of 3.' },
        { title: 'Spending requests', body: 'A payment from a vault that waits until enough signers approve it.' },
        { title: 'Budget plans', body: 'Money from your wallet, released on a schedule and listed under a vault.' },
      ],
      visualLabel: 'A spending request from the team vault',
    },
    {
      id: 'send-to-many',
      eyebrow: 'Send to many',
      title: 'Send to many people, or fund a project in steps.',
      body: 'Put the money in once and pay it out as people claim, finish work or win a prize.',
      action: { label: 'How grants work', href: '/grants-info' },
      facts: [
        { title: 'Airdrops', body: 'BCH or tokens many people can claim from one pool, once per wallet.' },
        { title: 'Grants', body: 'Lock the full grant up front and release each milestone when the work is done.' },
        { title: 'Bounties', body: 'A prize locked up front and paid to each winner you pick.' },
        { title: 'Reward programs', body: "You send each reward from the pool. There's nothing to claim." },
      ],
      visualLabel: 'A grant to Ade, paid in three milestones',
    },
  ] satisfies FeatureGroup[],
} as const;

export const HOW_IT_WORKS = {
  id: 'how-it-works',
  number: '02',
  eyebrow: 'How it works',
  title: 'You set the rules. Bitcoin Cash keeps them.',
  steps: [
    { title: 'You set the rules', body: 'Choose who gets paid, how much and when, or how many signers must approve.' },
    {
      title: 'FlowGuard prepares the transaction',
      body: 'It builds the transaction that puts your rules into a contract. FlowGuard never holds your keys.',
    },
    { title: 'You approve it in your wallet', body: "Your wallet shows what you're sending. Nothing moves until you approve." },
    {
      title: 'Bitcoin Cash enforces the rules from then on',
      body: 'The contract lets the money move only by the rules you set. Anyone can check them.',
    },
  ] satisfies Fact[],
} as const;

export type MoneyCard = { eyebrow: string; who: string; away: string; href: string; sourceFor: string };

export const WHO_CAN_MOVE = {
  id: 'who-can-move-the-money',
  number: '03',
  eyebrow: 'Who can move the money',
  title: 'Who can move the money, product by product.',
  lead: "Every answer is checked against the contracts, and says when FlowGuard's server is involved.",
  rowLabels: { who: 'Who can move the money', away: 'If FlowGuard goes away', source: 'Contract source' },
  sourceLink: 'Read the code',
  cards: [
    {
      eyebrow: 'Streams, recurring payments and budget plans',
      who: "Only the recipient can claim. If the sender allowed it when creating it, they can pause or cancel. The recipient keeps what's already released, and the rest goes back to the sender.",
      away: "The money stays in the contract on Bitcoin Cash, and its rules don't change.",
      href: `${CONTRACTS_URL}/streaming`,
      sourceFor: 'for streams, recurring payments and budget plans',
    },
    {
      eyebrow: 'Vaults',
      who: "Enough of the vault's signers, each approving in their own wallet. A vault's signers are set when you create it and can't be changed later.",
      away: 'The money stays in the vault. It still needs enough signers to approve.',
      href: `${CONTRACTS_URL}/treasury`,
      sourceFor: 'for vaults',
    },
    {
      eyebrow: 'Airdrops, grants, bounties and rewards',
      who: "Each claim, milestone release, winner payment or reward also needs FlowGuard's server to approve it. Only the sender can pause or cancel, and cancelling sends what's left back to the sender's wallet.",
      away: "Claims and payouts wait until FlowGuard's server is back. The money stays in the contract.",
      href: `${CONTRACTS_URL}/distribution`,
      sourceFor: 'for airdrops, grants, bounties and rewards',
    },
  ] satisfies MoneyCard[],
  more: { label: 'Read about security', href: '/security' },
} as const;

export const WHAT_IT_COSTS = {
  id: 'what-it-costs',
  number: '04',
  eyebrow: 'What it costs',
  title: 'FlowGuard adds no fee.',
  body: 'You pay the Bitcoin Cash network fee for each transaction you approve, usually less than 0.0001 BCH.',
  more: { label: 'See pricing', href: '/pricing' },
} as const;

export const HOME_QUESTIONS = {
  id: 'questions',
  number: '05',
  eyebrow: 'Questions',
  title: 'Questions people ask first.',
  items: [
    {
      id: 'who-controls-the-money',
      question: 'Who controls the money?',
      answer:
        "You do, through your own wallet. FlowGuard never holds your keys. For airdrops, grants, bounties and rewards, FlowGuard's server also approves each claim, release or payout.",
    },
    {
      id: 'do-payments-happen-by-themselves',
      question: 'Do payments happen by themselves?',
      answer:
        'Almost. Money is released on schedule, but someone still has to send the transaction. Usually the person you pay claims it from their own wallet.',
    },
    {
      id: 'can-i-change-the-rules',
      question: 'Can I change the rules later?',
      answer:
        "No. Once a stream or vault is set up, its rules are fixed. To change a stream, cancel it if you allowed that and create a new one. The person you pay can move a stream to a new wallet, unless you turned that off. A vault's signers can't be changed.",
    },
    {
      id: 'signer-loses-access',
      question: 'What if a vault signer loses their wallet?',
      answer:
        `If enough other signers are left, they can still approve spending requests. ${VAULT_SENDING} If too few are left, the money is stuck. Pick a vault that needs 2 of 3 so one lost wallet doesn't stop it.`,
    },
    {
      id: 'is-it-safe-with-real-money',
      question: 'Is it safe to use with real money?',
      answer:
        "The contracts were reviewed internally and the source is public, so anyone can check that the contracts running on Bitcoin Cash match it. There's no outside audit yet. You keep your keys, so start with a small amount.",
    },
    {
      id: 'how-do-i-start',
      question: 'How do I start?',
      answer:
        "Open the app and connect a Bitcoin Cash wallet, such as Paytaca or Cashonize. Then create a stream, a recurring payment, a vault or an airdrop. You don't need a vault to start.",
    },
  ],
  more: { label: 'See all questions', href: '/faq' },
} as const;

export const HOME_CLOSING = {
  eyebrow: 'Ready when you are',
  headline: 'Start with',
  accent: 'one small payment.',
  lead: 'Connect your wallet and send a small amount to yourself. You see every step before you pay anyone else.',
  primary: { label: ACTIONS.openApp, href: APP_SITE_URL },
  secondary: { label: 'Try it with a small amount', href: '/demo' },
  facts: ['FlowGuard adds no fee', 'Open source', 'You keep your keys'] as [string, string, string],
} as const;
