import { DOCS_SITE_URL } from '../utils/publicUrls';
import { SOCIAL_LINKS } from './nav';

export const SUPPORT_EMAIL = 'support@flowguard.cash';
export const SECURITY_EMAIL = 'security@flowguard.cash';

const TELEGRAM_URL = SOCIAL_LINKS.find((link) => link.label === 'Telegram')?.href ?? 'https://t.me/flowguard_cash';

export type HelpLink =
  | { label: string; to: string }
  | { label: string; href: string; external: true }
  | { label: string; mailto: string };

export type FaqItem = { id: string; question: string; answer: string; link?: HelpLink };

export type FaqGroupKey = 'getting-started' | 'safety' | 'costs' | 'paying-people' | 'shared-funds' | 'getting-paid';

export type FaqGroup = { id: FaqGroupKey; label: string; items: readonly FaqItem[] };

export const FAQ_GROUPS: readonly FaqGroup[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    items: [
      {
        id: 'what-is-flowguard',
        question: 'What is FlowGuard?',
        answer:
          'FlowGuard lets you pay people and share money on Bitcoin Cash, with rules you set once. Pay someone bit by bit over time, keep shared money behind several approvals, or send to many people at once.',
        link: { label: 'How it works', to: '/how-it-works' },
      },
      {
        id: 'what-do-i-need',
        question: 'What do I need to start?',
        answer:
          'You need a Bitcoin Cash wallet and a little BCH for network fees. You approve every payment in your own wallet.',
      },
      {
        id: 'which-wallet',
        question: 'Which wallet should I use?',
        answer:
          'Paytaca works as a browser extension or a phone app. Cashonize connects when you scan a QR code with the Cashonize app. Zapit, Selene and other WalletConnect wallets also connect with a QR code.',
      },
      {
        id: 'no-wallet-yet',
        question: "I don't have a wallet yet. Where do I start?",
        answer:
          'Install Paytaca on your phone or in your browser. Write down its recovery phrase on paper and keep it somewhere safe. Send a small amount of BCH to it, then open FlowGuard and choose Connect wallet.',
      },
      {
        id: 'try-small',
        question: 'Can I try it with a small amount first?',
        answer:
          'Yes. Send a small amount of BCH to yourself on a short schedule, watch it release, then cancel it and get the rest back.',
        link: { label: 'Try it with a small amount', to: '/demo' },
      },
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    items: [
      {
        id: 'can-flowguard-take-my-money',
        question: 'Can FlowGuard take my money?',
        answer:
          'FlowGuard never holds your keys. Your money sits in a contract on Bitcoin Cash that only lets it move by the rules you set. For airdrops, bounties, rewards and grants, each payout also needs FlowGuard\'s servers to approve it.',
        link: { label: 'Who can move the money', to: '/security' },
      },
      {
        id: 'if-flowguard-goes-away',
        question: 'What happens if FlowGuard goes away?',
        answer:
          'Your contracts stay on Bitcoin Cash, and their source code is public, so a developer can still claim or cancel without our website. Airdrop claims, bounty and reward payouts and grant releases stop until FlowGuard\'s servers are back.',
      },
      {
        id: 'outside-review',
        question: 'Has an outside firm checked the contracts?',
        answer:
          'Not yet. Our team reviewed the contracts before FlowGuard went live. The contract source is public, and anyone can check that the contracts running on Bitcoin Cash match it.',
        link: { label: 'How the contracts were checked', to: '/security#how-checked' },
      },
      {
        id: 'lost-recovery-phrase',
        question: 'What if I lose my recovery phrase?',
        answer:
          "FlowGuard can't recover it, because we never have it. Your recovery phrase is the only way back into your wallet. Restore it in a wallet on a new device and your streams and vaults show up again, because they belong to your wallet's address.",
      },
      {
        id: 'what-am-i-approving',
        question: 'How do I know what I\'m approving?',
        answer:
          'Your wallet shows every transaction before you approve it. Check the amount and the address there. Nothing moves until you approve it.',
      },
    ],
  },
  {
    id: 'costs',
    label: 'Costs',
    items: [
      {
        id: 'does-flowguard-charge',
        question: 'Does FlowGuard charge a fee?',
        answer: 'No. FlowGuard adds no fee. You pay only the Bitcoin Cash network fee for each transaction you approve.',
        link: { label: 'Pricing', to: '/pricing' },
      },
      {
        id: 'network-fee',
        question: 'How much is the network fee?',
        answer:
          'Usually less than 0.0001 BCH for each transaction. It goes to the Bitcoin Cash network, not to FlowGuard.',
      },
    ],
  },
  {
    id: 'paying-people',
    label: 'Paying people',
    items: [
      {
        id: 'how-a-stream-pays',
        question: 'How does a stream pay someone?',
        answer:
          'You choose an amount and a schedule, then fund it, which locks the money in a contract. The money is released bit by bit, and the person you pay claims each part as it\'s released.',
      },
      {
        id: 'stream-or-recurring-payment',
        question: 'What\'s the difference between a stream and a recurring payment?',
        answer:
          'A stream releases one amount bit by bit over time. A recurring payment pays the same amount on a fixed schedule, like every week or every 30 days.',
      },
      {
        id: 'cancel-a-stream',
        question: 'Can I cancel a stream?',
        answer:
          'Only if you turned on "You can pause or cancel this later" when you created it. Cancelling ends it now. The recipient keeps what\'s already released, and the rest comes back to your wallet. A stream paid in a CashToken can be cancelled about 2 hours after it starts.',
      },
      {
        id: 'pay-in-tokens',
        question: 'Can I pay in a CashToken instead of BCH?',
        answer:
          "Yes. Streams, recurring payments, budget plans, airdrops, grants, bounties and rewards all work with fungible CashTokens. Streams released evenly over time or the same amount each time work with any token in your wallet. Everything else has to be funded from the wallet with permission to create the token, usually the wallet that created it. You still need a little BCH for network fees.",
      },
      {
        id: 'add-funds-later',
        question: 'Can I add more money to a recurring payment later?',
        answer:
          'Yes, if you turned on "Keep it going as long as you add funds" when you created it. It keeps paying for as long as you add funds. Without it, the payment ends after the payments you funded.',
      },
      {
        id: 'pause-and-resume',
        question: 'Can I pause something and start it again later?',
        answer:
          "Yes, if you allowed pausing when you created it. Streams, recurring payments, budget plans, airdrops, grants, bounties and rewards can all be paused and resumed. While it's paused nothing can be claimed or paid out. For streams and budget plans, release dates move later by the time it was paused.",
      },
      {
        id: 'pay-many-people',
        question: 'Can I pay many people at once?',
        answer: 'Yes. Pay many people sets up a stream for each person in one go, from a list or a CSV file.',
      },
    ],
  },
  {
    id: 'shared-funds',
    label: 'Shared funds',
    items: [
      {
        id: 'what-is-a-vault',
        question: 'What is a vault?',
        answer:
          "Shared money behind several approvals. Signers approve spending requests in their own wallets. Once enough signers approve a payment, two of them approve sending it in their wallets.",
        link: { label: 'Vaults and budget plans', to: '/budgeting' },
      },
      {
        id: 'change-signers',
        question: "Can I change a vault's signers later?",
        answer:
          "No. A vault's signers are set when you create it and can't be changed later, so choose them carefully before you deposit.",
      },
      {
        id: 'what-is-a-budget-plan',
        question: 'What is a budget plan?',
        answer:
          "Money from your wallet, released on a schedule you set and listed under a vault. The vault's money isn't used.",
      },
    ],
  },
  {
    id: 'getting-paid',
    label: 'Getting paid',
    items: [
      {
        id: 'someone-set-up-a-payment',
        question: 'Someone set up a payment for me. How do I get it?',
        answer:
          'Open the link they sent you and connect the wallet it was sent to. When money is ready to claim, choose Claim and approve it in your wallet.',
      },
      {
        id: 'why-cant-i-claim',
        question: "Why can't I claim yet?",
        answer:
          "Money becomes ready to claim at set times, and the page shows how much is released next and when. What you can claim runs about 2 hours behind the schedule, because Bitcoin Cash checks the time against recent blocks, so the first claim opens a little over 2 hours after a stream starts. Less than 0.00000546 BCH is too small to send, so it waits until more is released.",
      },
      {
        id: 'claim-an-airdrop',
        question: 'How do I claim from an airdrop?',
        answer:
          "Anyone can claim, once per wallet. Open the airdrop, connect your wallet and claim your share. Each claim also needs FlowGuard's servers to approve it.",
      },
      {
        id: 'claim-rewards',
        question: 'Do I need to claim rewards?',
        answer: "No. Rewards arrive in your wallet. There's nothing to claim.",
      },
      {
        id: 'move-to-new-wallet',
        question: 'Can I move a stream to a new wallet?',
        answer:
          "Yes, unless the sender turned this off when they created it. Open the stream, choose Change recipient and approve it in the wallet you're paid to now. What's left of the stream goes to the new wallet, and the amounts and dates stay the same. Recurring payments can't be moved.",
      },
      {
        id: 'stream-paused',
        question: 'The sender paused my stream. What now?',
        answer:
          "While it's paused, you can't claim anything, including money already released. You can claim again when they resume it.",
      },
    ],
  },
];

export const HOME_FAQ_IDS = [
  'what-is-flowguard',
  'what-do-i-need',
  'can-flowguard-take-my-money',
  'does-flowguard-charge',
  'someone-set-up-a-payment',
  'which-wallet',
] as const;

export function faqItems(ids: readonly string[]): FaqItem[] {
  const all = FAQ_GROUPS.flatMap((group) => group.items);
  return ids.flatMap((id) => all.filter((item) => item.id === id));
}

export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export const FAQ_PAGE = {
  title: 'Questions and answers',
  description: 'Short answers about safety, costs, wallets and getting paid.',
  searchLabel: 'Search questions',
  searchPlaceholder: 'For example, network fee',
  noMatchThing: 'questions',
  stillStuck: 'Still stuck?',
  getHelp: 'Get help',
  topicsLabel: 'Topics',
} as const;

export function faqResultCount(results: number, topics: number): string {
  const resultWord = results === 1 ? 'result' : 'results';
  const topicWord = topics === 1 ? 'topic' : 'topics';
  return `${results} ${resultWord} in ${topics} ${topicWord}`;
}

export type HelpTopic = { title: string; description: string; to: string };

export const HELP_PAGE = {
  title: 'Help',
  description: 'Guides for getting started, fixes for common problems, and how to reach us.',
  searchLabel: 'Search help',
  searchPlaceholder: 'For example, wallet won\'t connect',
  noMatchThing: 'help articles',
  resultsTitle: 'Results',
  topicsTitle: 'Start here',
  problemsTitle: 'Common problems',
  problemsLine: 'Pick a problem to see the likely cause and how to fix it.',
  causesLabel: 'Likely causes',
  fixesLabel: 'How to fix it',
  contactTitle: 'Contact us',
  contactLine: 'A small team answers every message. Pick the channel that fits what you need.',
  statusTitle: 'FlowGuard status',
  statusUnavailable: 'Status unavailable',
  statusLink: 'See the Status page',
  questionLabel: 'Question',
  problemLabel: 'Problem',
} as const;

export const HELP_TOPICS: readonly HelpTopic[] = [
  { title: 'Getting started', description: 'Pick a wallet, add a little BCH and connect.', to: '/faq#getting-started' },
  { title: 'Paying people', description: 'Streams, recurring payments and paying many people.', to: '/faq#paying-people' },
  { title: 'Shared funds', description: 'Vaults, spending requests and budget plans.', to: '/faq#shared-funds' },
  { title: 'Getting paid', description: 'Claiming a stream, a payment or an airdrop.', to: '/faq#getting-paid' },
];

export type HelpProblem = {
  id: string;
  title: string;
  causes: readonly string[];
  fixes: readonly string[];
  link?: HelpLink;
};

export const HELP_PROBLEMS: readonly HelpProblem[] = [
  {
    id: 'wallet-wont-connect',
    title: "My wallet won't connect",
    causes: [
      'The QR code expired before you scanned it.',
      'A VPN or ad blocker stopped the service that links your wallet to FlowGuard.',
      "Your wallet app isn't open, or a different wallet is picked in it.",
    ],
    fixes: [
      'Close the connect window and start again to get a fresh QR code.',
      'Pause any VPN or ad blocker for this site, then try again.',
      'Open your wallet app, then scan a fresh QR code from FlowGuard.',
    ],
  },
  {
    id: 'wrong-network',
    title: 'My wallet is on the wrong network',
    causes: ['Your wallet is set to the test network, and FlowGuard uses real BCH on the main Bitcoin Cash network.'],
    fixes: ['Switch your wallet to the main Bitcoin Cash network in its settings, then connect again.'],
  },
  {
    id: 'no-approval-request',
    title: "My wallet doesn't ask me to approve",
    causes: ['Your wallet app is closed or locked.', "Your wallet didn't respond in time."],
    fixes: [
      "Open your wallet app and enter your passcode. The request is usually waiting there.",
      'If nothing shows up, try again from FlowGuard. Nothing was sent.',
    ],
  },
  {
    id: 'transaction-didnt-go-through',
    title: "My transaction didn't go through",
    causes: [
      "There isn't enough BCH in your wallet for the network fee.",
      'Something in your wallet changed while the transaction was being prepared.',
      "It's a few minutes too early for the network to accept it.",
    ],
    fixes: [
      'Add a little BCH to your wallet. Less than 0.0001 BCH usually covers the fee.',
      'Refresh the page and try again.',
      'Wait about 10 minutes, then try again.',
    ],
  },
  {
    id: 'cant-see-my-money',
    title: "I can't see my money",
    causes: [
      "FlowGuard's servers can be a few seconds behind Bitcoin Cash.",
      'You connected a different wallet from the one the money was sent to.',
    ],
    fixes: [
      'Refresh the page after a minute.',
      'Connect the wallet the money was sent to.',
      'Check the Status page, or look up your address in Explorer.',
    ],
    link: { label: 'Open Explorer', to: '/explorer' },
  },
  {
    id: 'signed-out',
    title: 'I was signed out',
    causes: ['Your sign-in lasts a set time, and it expired.', 'You switched to another address in your wallet.'],
    fixes: [
      "Connect again and approve the sign-in. It's free and moves no money.",
      'Switch back to the address you used before.',
    ],
  },
  {
    id: 'sent-to-wrong-address',
    title: 'I sent money to the wrong address',
    causes: ["Once you approve a transaction in your wallet, it's sent and can't be undone."],
    fixes: ['Tell us what happened and include a link to the transaction.'],
    link: { label: 'Report a problem', mailto: SUPPORT_EMAIL },
  },
];

export type ContactChannel = {
  need: string;
  title: string;
  description: string;
  reply: string;
  link: HelpLink;
};

export const CONTACT_CHANNELS: readonly ContactChannel[] = [
  {
    need: 'Something looks wrong with your money',
    title: 'Email support',
    description: 'Include your wallet address and a link to the transaction if you have one.',
    reply: 'Reply within 1 business day',
    link: { label: `Email ${SUPPORT_EMAIL}`, mailto: SUPPORT_EMAIL },
  },
  {
    need: 'A quick question',
    title: 'Telegram',
    description: 'Chat with the team and other people who use FlowGuard.',
    reply: 'Usually the fastest answer',
    link: { label: 'Open Telegram', href: TELEGRAM_URL, external: true },
  },
  {
    need: 'A bug that could put money at risk',
    title: 'Report a security problem',
    description: "Tell us privately first, before you post about it anywhere.",
    reply: 'Reply within 24 hours',
    link: { label: 'Read about security', to: '/security#report' },
  },
  {
    need: 'A technical question',
    title: 'Docs',
    description: 'Guides and technical reference for developers.',
    reply: 'Read any time',
    link: { label: 'Open the docs', href: DOCS_SITE_URL, external: true },
  },
];

export const NOT_FOUND = {
  title: 'Page not found',
  description: "This link doesn't go anywhere. Try one of these pages instead.",
  triedLabel: 'You tried',
  searchTitle: 'Look up an address',
  searchLabel: 'Search Explorer',
  searchPlaceholder: 'Search by address',
  searchButton: 'Search Explorer',
  pagesLabel: 'Popular pages',
} as const;

export const NOT_FOUND_LINKS: readonly HelpTopic[] = [
  { title: 'Home', description: 'Start from the beginning.', to: '/' },
  { title: 'Help', description: 'Guides, fixes and how to reach us.', to: '/help' },
  { title: 'Explorer', description: 'See FlowGuard activity on Bitcoin Cash.', to: '/explorer' },
  { title: 'Status', description: "Whether FlowGuard's services are running.", to: '/status' },
];
