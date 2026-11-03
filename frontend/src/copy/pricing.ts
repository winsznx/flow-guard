import { APP_PATHS, CLOSING_FACTS, MARKETING_COPY, MARKETING_PATHS, PROJECT_SOURCE, appLink } from './solutions/shared';

/** Checked against the contracts: every contract path caps its fee at 5,000 satoshis, and funding is paid from the wallet. */
export const NETWORK_FEE_CEILING_BCH = 0.0001;

const WALLET_PAID_FEE = 'Usually less than 0.0001 BCH';
const CONTRACT_PAID_FEE = 'Less than 0.0001 BCH';
const CONTRACT_PAYS = 'The contract pays the fee.';

export const PRICING_HERO = {
  headline: 'Pricing',
  lead: 'FlowGuard adds no fee. The only cost is the Bitcoin Cash network fee on each transaction.',
  primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
  secondary: { label: 'See the fee for each action', href: '#fees' },
  note: MARKETING_COPY.whatYouNeed,
};

export const PRICE_SUMMARY = {
  eyebrow: 'What it costs',
  network: 'Bitcoin Cash',
  rows: {
    flowGuardFee: 'FlowGuard fee',
    networkFee: 'Network fee',
    inDollars: 'In dollars',
  },
  none: 'None',
  networkFee: 'Usually less than 0.0001 BCH for each transaction',
  loadingPrice: 'Loading price',
  priceUnavailable: "Today's BCH price isn't available right now.",
};

export function feeInDollars(usd: string): string {
  return `${usd === 'less than $0.01' ? 'Less than $0.01' : `Less than ${usd}`} at today's BCH price`;
}

export type FeeRow = { id: string; action: string; approves: string; transactions: string; fee: string };

export const FEES = {
  id: 'fees',
  eyebrow: 'Network fees',
  title: 'The fee for each action',
  lead: 'Each action is one or more Bitcoin Cash transactions, and each transaction pays its own network fee.',
  listLabel: 'Network fee for each action',
  columns: { action: 'Action', approves: 'Who approves it', transactions: 'Transactions', fee: 'Network fee' },
  rows: [
    {
      id: 'create',
      action: 'Create and fund a stream, payment, airdrop, bounty, reward fund or grant',
      approves: 'Approved by you',
      transactions: '1 transaction, sometimes 2 when your wallet first needs to get ready. It also puts extra BCH in the contract for later fees.',
      fee: WALLET_PAID_FEE,
    },
    { id: 'add-funds', action: 'Add funds', approves: 'Approved by you', transactions: '1 transaction each time', fee: WALLET_PAID_FEE },
    {
      id: 'claim',
      action: 'Claim from a stream or recurring payment',
      approves: 'Approved by the person claiming',
      transactions: `1 transaction per claim. ${CONTRACT_PAYS}`,
      fee: CONTRACT_PAID_FEE,
    },
    {
      id: 'airdrop-claim',
      action: 'Claim from an airdrop',
      approves: "Approved by FlowGuard's server when someone claims",
      transactions: `1 transaction per claim. ${CONTRACT_PAYS}`,
      fee: CONTRACT_PAID_FEE,
    },
    {
      id: 'pause-cancel',
      action: 'Pause, resume or cancel',
      approves: 'Approved by you',
      transactions: `1 transaction each. ${CONTRACT_PAYS}`,
      fee: CONTRACT_PAID_FEE,
    },
    {
      id: 'pay-out',
      action: 'Pay a bounty winner, send a reward or release a milestone',
      approves: "You pick it, FlowGuard's server approves it",
      transactions: `1 transaction per payout. ${CONTRACT_PAYS}`,
      fee: CONTRACT_PAID_FEE,
    },
    {
      id: 'vault-payment',
      action: 'Approve a payment from a vault',
      approves: 'Approved by each signer',
      transactions: '1 transaction per approval',
      fee: 'Less than 0.0001 BCH',
    },
    {
      id: 'vault-send',
      action: 'Send an approved payment from a vault',
      approves: 'Approved by two signers',
      transactions: '1 transaction. The vault pays the fee.',
      fee: CONTRACT_PAID_FEE,
    },
  ] satisfies FeeRow[],
  laterFees: {
    title: 'Extra BCH for later fees',
    body: "Funding also puts a little extra BCH in the contract, so it can pay the network fee for every later claim, pause, resume and payout. For a stream that releases evenly it's about 0.001 BCH, and less for most other contracts. If you cancel a stream or recurring payment, what's left of that extra BCH comes back to your wallet. Airdrops, grants, bounties and rewards created from November 2026 return it too.",
  },
  footnote:
    'Contracts limit the fee they can pay to 0.00005 BCH per transaction. When you fund something or add funds, your wallet pays the fee, and the exact amount depends on the size of the transaction.',
};

export const WAYS_TO_USE = {
  eyebrow: 'Ways to use it',
  title: 'Both are free',
  options: [
    {
      id: 'app',
      title: 'Use the app',
      price: 'Free',
      body: 'Connect a Bitcoin Cash wallet and start. FlowGuard adds no fee, whatever you send.',
      action: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home), external: false },
    },
    {
      id: 'self-run',
      title: 'Run it yourself',
      price: 'Free',
      body: 'FlowGuard is open source. You can run the app and its server from the source code.',
      action: { label: 'Read the source', href: PROJECT_SOURCE, external: true },
    },
  ],
};

export const PRICING_FAQ = {
  title: 'Questions',
  items: [
    {
      id: 'token-fee',
      question: 'Do you charge a fee on token payments?',
      answer: 'No. FlowGuard adds no fee for BCH or tokens. You still pay the small network fee in BCH.',
    },
    {
      id: 'who-pays',
      question: 'Who pays the network fee?',
      answer:
        'You pay the fee from your wallet when you fund something or add funds. Claims, pauses, resumes, cancels and payouts take their fee from the extra BCH you put in the contract when you funded it. Each signer pays when they approve a vault payment, and sending the approved payment takes its fee from the vault.',
    },
    {
      id: 'add-fees-later',
      question: 'Could you add a fee later?',
      answer:
        "We could change the app, but not contracts you've already created. Their rules are fixed, and they don't include a FlowGuard fee.",
    },
    {
      id: 'why-so-small',
      question: 'Why is the network fee so small?',
      answer:
        'Bitcoin Cash charges by the size of the transaction, and FlowGuard transactions are small. The fee is usually less than 0.0001 BCH.',
    },
  ],
};

export const PRICING_CLOSING = {
  headline: 'Start with',
  accent: 'one small payment.',
  lead: 'Send a little BCH to yourself on a short schedule and see every fee before you approve it.',
  primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
  secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
  facts: CLOSING_FACTS,
};
