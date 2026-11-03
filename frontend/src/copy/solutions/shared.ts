import type { SolutionCopy } from '../../components/marketing/SolutionPage';
import type { Asset } from '../../components/ui/types';
import { APP_SITE_URL, DOCS_SITE_URL } from '../../utils/publicUrls';
import { GITHUB_URL } from '../nav';

/** Shared copy and sample data for the marketing pages: the five solution pages, use cases, how it works, pricing and demo. */

/** A solution page's copy, plus the link to the contract source shown under its facts. */
export type SolutionPageCopy = SolutionCopy & { source: string };

const DAY_MS = 86_400_000;

export const SAMPLE_NOW = Date.now();

export function daysFromNow(days: number): number {
  return SAMPLE_NOW + days * DAY_MS;
}

export const BCH: Asset = { kind: 'bch' };

export const SAMPLE_TOKEN: Asset = {
  kind: 'token',
  tokenId: '7b6fd0f2a0c4b7e9d1c35a8e4f2b6d09c8a1e3f5b7d9c2e4a6f8b0d1c3e5a7f9',
  symbol: 'SEED',
  decimals: 2,
};

export const SAMPLE_PEOPLE = {
  sam: { name: 'Sam', address: 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a' },
  maya: { name: 'Maya', address: 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy' },
  ade: { name: 'Ade', address: 'bitcoincash:qqq3728yw0y47sqn6l2na30mcw6zm78dzqre909m2r' },
} as const;

/** Every app destination on a marketing page goes to the app host, so visitors land on one domain. */
export function appLink(path = ''): string {
  return `${APP_SITE_URL}${path}`;
}

export const APP_PATHS = {
  home: '',
  createStream: '/streams/create',
  payManyPeople: '/streams/batch-create',
  createPayment: '/payments/create',
  createVault: '/vaults/create',
  votes: '/governance',
  createGrant: '/grants/create',
  airdrops: '/airdrops',
} as const;

export const MARKETING_PATHS = {
  demo: '/demo',
  howItWorks: '/how-it-works',
  security: '/security',
  help: '/help',
  pricing: '/pricing',
  vesting: '/vesting',
  payroll: '/payroll',
  budgeting: '/budgeting',
  grants: '/grants-info',
  governance: '/governance-info',
} as const;

export const PROJECT_SOURCE = GITHUB_URL;

export const CONTRACT_SOURCE = {
  streams: 'https://github.com/winsznx/flow-guard/tree/main/contracts/core/streaming',
  vaults: 'https://github.com/winsznx/flow-guard/tree/main/contracts/core/treasury',
  distribution: 'https://github.com/winsznx/flow-guard/tree/main/contracts/core/distribution',
  votes: 'https://github.com/winsznx/flow-guard/tree/main/contracts/core/governance',
  all: 'https://github.com/winsznx/flow-guard/tree/main/contracts/core',
} as const;

export const DOCS_URL = DOCS_SITE_URL;

export const NETWORK_WORD = 'Bitcoin Cash';

export const EXAMPLE_ANCHOR = '#example';

export const MARKETING_COPY = {
  openApp: 'Open app',
  seeExample: 'See an example',
  tryIt: 'Try it with a small amount',
  whatYouNeed: 'You need a Bitcoin Cash wallet and a little BCH for network fees.',
  contractSource: 'Read the contract source',
  security: 'Read about security',
  docs: 'Read the docs',
  getHelp: 'Get help',
} as const;

export const CLOSING_FACTS: [string, string, string] = [
  'You approve every payment in your own wallet',
  'The rules are stored on Bitcoin Cash',
  'Open source',
];

export const STREAM_FACTS = {
  whoCanMove:
    "Only the recipient can claim what's released. If you allowed it when you set it up, you can pause or cancel. FlowGuard can't move it.",
  ifCancelled: "The recipient keeps what's already released. The rest comes back to your wallet.",
  ifFlowGuardGoes:
    'The money stays in the contract and the rules still apply. Claiming then needs another tool that can build the transaction.',
} as const;

export const VAULT_SENDING =
  "Once enough signers approve a spending request, two of them approve sending it in their wallets and the payment goes out.";

export const FACT_LABELS = {
  whoCanMove: 'Who can move the money',
  ifCancelled: 'If you cancel',
  ifFlowGuardGoes: 'What happens if FlowGuard goes away',
  pausing: 'Pausing',
  budgetPlans: 'Budget plans',
  votes: 'Votes',
  sending: 'Sending payments',
} as const;
