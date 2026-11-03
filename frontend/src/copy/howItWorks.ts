import { HOW_IT_WORKS } from './marketingHome';
import { PRODUCT_FACTS } from './security';
import {
  APP_PATHS,
  CLOSING_FACTS,
  CONTRACT_SOURCE,
  DOCS_URL,
  MARKETING_COPY,
  MARKETING_PATHS,
  PROJECT_SOURCE,
  appLink,
} from './solutions/shared';

type Fact = { title: string; body: string };

export const HOW_IT_WORKS_HERO = {
  headline: 'How it works',
  lead: 'You set the rules, approve them in your wallet, and Bitcoin Cash enforces them from then on.',
  primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
  secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
  note: MARKETING_COPY.whatYouNeed,
};

export const HOW_IT_WORKS_STEPS = {
  eyebrow: 'Four steps',
  title: 'From your rules to Bitcoin Cash',
  steps: HOW_IT_WORKS.steps,
};

export const CAN_AND_CANT = {
  eyebrow: 'What FlowGuard does',
  title: "What FlowGuard can and can't do",
  canTitle: 'FlowGuard can',
  cantTitle: "FlowGuard can't",
  can: [
    'Prepare each transaction for you to check and approve in your wallet.',
    'Read Bitcoin Cash and show your schedules, balances and history.',
    'Remember the names and addresses you save.',
    'Approve each airdrop claim, bounty or reward payout and grant milestone release, as part of those contracts.',
  ],
  cant: [
    'Use your keys or ask for your recovery phrase.',
    'Move money from a stream, recurring payment or vault without approval from the wallets the rules name.',
    "Change a contract's rules after you create it.",
    'Take a fee. FlowGuard adds no fee to any transaction.',
  ],
};

export const RULES_YOU_CAN_CHECK = {
  eyebrow: 'The rules',
  title: 'Rules you can check',
  lead: 'Your money sits in a contract on Bitcoin Cash. The contract says who can take money out, when and how much.',
  facts: [
    {
      title: 'The rules are part of the address',
      body: "Change a rule and you get a different address. That's why nobody, including FlowGuard, can edit a contract's rules later.",
    },
    {
      title: 'The network checks every transaction',
      body: 'If a transaction breaks a rule, like taking more than has been released, Bitcoin Cash refuses it.',
    },
    {
      title: 'Progress travels with the money',
      body: 'Each contract keeps a small record of how much has been paid, and every payment updates it. Two conflicting payments can never both go through.',
    },
    {
      title: 'Open source',
      body: 'The contract source is public, and anyone can check that the contracts running on Bitcoin Cash match it.',
    },
  ] satisfies Fact[],
};

export const WHO_CAN_MOVE_SECTION = {
  eyebrow: 'Product by product',
  title: 'Who can move the money',
  lead: 'The rules for each product are set when you create it and stored on Bitcoin Cash.',
  rowWho: 'Who can move the money',
  rowGoesAway: 'If FlowGuard goes away',
  products: PRODUCT_FACTS,
  more: { label: MARKETING_COPY.security, href: MARKETING_PATHS.security },
};

export const FOR_DEVELOPERS = {
  eyebrow: 'For developers',
  title: 'Read the code',
  lead: 'The docs explain each contract, the transactions it accepts and how FlowGuard builds them.',
  links: [
    { label: MARKETING_COPY.docs, href: DOCS_URL },
    { label: 'Read the contract source', href: CONTRACT_SOURCE.all },
    { label: 'See the whole project', href: PROJECT_SOURCE },
  ],
};

export const HOW_IT_WORKS_CLOSING = {
  headline: 'Try it with',
  accent: 'your own wallet.',
  lead: 'Open the app, connect your wallet and create your first stream or vault. You keep your keys the whole time.',
  primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
  secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
  facts: CLOSING_FACTS,
};
