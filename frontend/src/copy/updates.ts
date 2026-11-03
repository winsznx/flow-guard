import { DOCS_SITE_URL } from '../utils/publicUrls';
import { formatDate, formatMonth } from './format';
import { GITHUB_URL, SOCIAL_LINKS } from './nav';

const TELEGRAM_URL = SOCIAL_LINKS.find((link) => link.label === 'Telegram')?.href ?? 'https://t.me/flowguard_cash';

export type PostTag = 'How it works' | 'Streams' | 'Vaults' | 'Airdrops' | 'Grants' | 'Votes' | 'Security' | 'News';

export type PostCover = { src: string; width: number; height: number; alt: string };

export type PostMeta = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  tags: readonly PostTag[];
  readingMinutes: number;
  cover?: PostCover;
  archived?: boolean;
};

export const FEATURED_SLUG = 'what-flowguard-is';

export const POSTS: readonly PostMeta[] = [
  {
    slug: 'a-technical-breakdown-of-how-flowguard-works',
    title: "How FlowGuard's contracts enforce the rules on Bitcoin Cash",
    summary: "A look under the hood at how FlowGuard's contracts keep money locked, check every payment and keep track of progress.",
    date: '2026-02-26',
    tags: ['How it works'],
    readingMinutes: 7,
  },
  {
    slug: 'how-a-5-person-bch-team-could-use-flowguard',
    title: 'How a 5-person BCH team could use FlowGuard',
    summary: 'A worked example with one shared vault, regular pay for four people, and a grant paid in three parts.',
    date: '2026-02-26',
    tags: ['Vaults', 'How it works'],
    readingMinutes: 6,
  },
  {
    slug: 'whats-left-before-flowguard-goes-to-mainnet',
    title: 'What was left before FlowGuard went live',
    summary: 'The checklist we published in February 2026, before FlowGuard went live on Bitcoin Cash in June.',
    date: '2026-02-25',
    tags: ['News'],
    readingMinutes: 6,
    archived: true,
  },
  {
    slug: 'why-flowguard-makes-bch-more-useful',
    title: 'Why FlowGuard makes Bitcoin Cash more useful',
    summary:
      "Bitcoin Cash is good at payments. Teams also need shared budgets, payroll and approvals whose rules can't be broken. This post explains how FlowGuard adds them.",
    date: '2026-02-25',
    tags: ['How it works'],
    readingMinutes: 6,
  },
  {
    slug: 'flowguard-end-to-end-testing-on-chipnet',
    title: 'How we tested FlowGuard before going live',
    summary: "We ran every product on the test network, where coins have no value. Here's what we ran and what it showed.",
    date: '2026-02-25',
    tags: ['News'],
    readingMinutes: 7,
    archived: true,
  },
  {
    slug: 'how-flowguard-implements-on-chain-governance',
    title: 'How votes work in FlowGuard',
    summary: 'BCH you vote with is held until voting ends. This post explains how a vote is counted.',
    date: '2026-02-24',
    tags: ['Votes'],
    readingMinutes: 6,
    archived: true,
  },
  {
    slug: 'how-flowguard-enforces-milestone-based-funding-on-chain',
    title: 'How FlowGuard pays out grants in milestones',
    summary: 'Grant money sits in a contract and is released one milestone at a time, so nobody can pay out more than planned.',
    date: '2026-02-24',
    tags: ['Grants'],
    readingMinutes: 6,
  },
  {
    slug: 'how-flowguard-airdrops-use-merkle-proofs-on-chain',
    title: 'How FlowGuard airdrops check who can claim',
    summary: 'How an airdrop makes sure each wallet claims its share only once.',
    date: '2026-02-22',
    tags: ['Airdrops'],
    readingMinutes: 6,
  },
  {
    slug: 'how-flowguard-uses-cashtokens-nfts-to-track-vesting-state',
    title: "How a stream keeps track of what's been paid",
    summary:
      'Each stream carries a small record on Bitcoin Cash that stores how much has been released, so nobody can claim early or claim twice.',
    date: '2026-02-21',
    tags: ['Streams'],
    readingMinutes: 7,
  },
  {
    slug: 'how-flowguard-vaults-enforce-spending-rules',
    title: 'How vault spending limits work',
    summary: 'Signers approve each payment from a vault, and the contract can also cap how much leaves it in each period.',
    date: '2026-02-20',
    tags: ['Vaults'],
    readingMinutes: 6,
    cover: { src: '/updates/flowguard-x-post.png', width: 2400, height: 1350, alt: '' },
  },
  {
    slug: 'why-flowguard-is-non-custodial',
    title: 'Why FlowGuard never holds your money',
    summary: 'Your money sits in contracts on Bitcoin Cash, FlowGuard never holds your keys, and you approve every payment in your own wallet.',
    date: '2026-02-19',
    tags: ['Security'],
    readingMinutes: 7,
    cover: { src: '/updates/flowguard-blog-banner.png', width: 3840, height: 2160, alt: '' },
  },
  {
    slug: 'what-flowguard-is',
    title: 'What FlowGuard is',
    summary: 'Each part of FlowGuard in plain words, and who can move the money in each one.',
    date: '2026-02-18',
    tags: ['How it works'],
    readingMinutes: 3,
  },
  {
    slug: 'bch-treasury-problem',
    title: 'The problem with how BCH teams manage shared money today',
    summary:
      'Most BCH teams share one wallet and agree on spending in chat. Nothing stops someone breaking those rules. FlowGuard puts them into a contract.',
    date: '2026-02-17',
    tags: ['How it works'],
    readingMinutes: 8,
  },
  {
    slug: 'alpha-launch-chipnet',
    title: 'FlowGuard opens on the test network',
    summary: 'Our second test release, on the test network where coins have no value. FlowGuard has been live on Bitcoin Cash since June 2026.',
    date: '2026-02-15',
    tags: ['News'],
    readingMinutes: 5,
    archived: true,
  },
  {
    slug: 'treasury-automation-explained',
    title: 'Why payment rules belong in code',
    summary: 'Paying people by hand from a shared wallet is slow and easy to get wrong. With FlowGuard you set the rules once.',
    date: '2026-02-10',
    tags: ['How it works'],
    readingMinutes: 8,
  },
];

export const POST_TAGS: readonly PostTag[] = ['How it works', 'Streams', 'Vaults', 'Airdrops', 'Grants', 'Security', 'News'];

export function findPost(slug: string | undefined): PostMeta | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export const UPDATES_PAGE = {
  title: 'Updates',
  description: 'News from the FlowGuard team.',
  newHere: 'New here? Start with',
  releaseNotes: 'For release notes, see the',
  changelogLink: 'changelog',
  searchLabel: 'Search posts',
  searchPlaceholder: 'Search by title or topic',
  topicsLabel: 'Filter by topic',
  featured: 'Featured',
  archived: 'Archived',
  noMatchThing: 'posts',
} as const;

export function readingTime(minutes: number): string {
  return `${minutes} min read`;
}

export function postCount(n: number): string {
  return n === 1 ? '1 post' : `${n} posts`;
}

export const ARTICLE = {
  back: 'Back to updates',
  byline: 'By the FlowGuard team',
  notFoundTitle: "We couldn't find that post",
  notFoundLine: 'It may have moved or been renamed.',
  seeAllPosts: 'See all posts',
  archivedTitle: 'Archived post',
  seeChangelog: "See the changelog for what's current.",
  tryTitle: 'Try it yourself',
  tryLine: 'Connect a Bitcoin Cash wallet and start with one small payment.',
  openApp: 'Open app',
  readDocs: 'Read the docs',
  feedbackTitle: 'Questions or feedback?',
} as const;

export function archivedNotice(date: string): string {
  return `This post is from ${date}. Some details have changed since.`;
}

const MONTH_ONLY = /^(\d{4})-(\d{2})$/;

/** Some milestones are only known to the month, so "YYYY-MM" prints as "March 2026" instead of a made-up day. */
export function formatMilestoneDate(value: string): string | null {
  return MONTH_ONLY.test(value) ? formatMonth(value) : formatDate(value);
}

export const ARTICLE_LINKS: readonly { title: string; description: string; href: string }[] = [
  { title: 'Ask in Telegram', description: 'Chat with the team and other people who use FlowGuard.', href: TELEGRAM_URL },
  {
    title: 'Report a problem',
    description: 'Opens a new issue on GitHub. You need to be signed in to GitHub.',
    href: `${GITHUB_URL}/issues/new`,
  },
];

export type ChangeKind = 'added' | 'changed' | 'fixed';

export type Release = {
  version: string;
  date: string;
  network: 'main' | 'test';
  title: string;
  changes: Partial<Record<ChangeKind, readonly string[]>>;
  note?: string;
};

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
};

export const RELEASES: readonly Release[] = [
  {
    version: '1.1.0',
    date: '2026-11-03',
    network: 'main',
    title: 'Vault payments, CashTokens and a simpler app',
    changes: {
      added: [
        'Send approved payments from a vault. Two signers approve sending in their wallets',
        'Pay streams, recurring payments, budget plans, airdrops, grants, bounties and rewards in fungible CashTokens',
        'Recipients can move a stream to a new wallet, unless the sender turns this off',
        'Recurring payments that keep going as long as you add funds',
      ],
      changed: [
        'Simpler wording and one look across every screen',
        'New streams, payments, airdrops, grants, bounties and rewards use updated contracts. Cancelling an airdrop, grant, bounty or reward now returns the unused fee money too. What you created before keeps working as it did',
        'Votes are no longer offered. A vault already needs several signers to approve each payment',
      ],
      fixed: [
        'Claims, pauses and cancels the network refused because their time was ahead of recent blocks',
        'Vault payments that failed because each signer sent their own copy',
        'Finished streams that still showed as running',
        'Grants that failed to create',
        'Claim history that came back empty',
        'Claims too small to send that showed an error instead of waiting',
        'Cancelling a BCH stream right after the recipient claimed, which the network refused',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-06-01',
    network: 'main',
    title: 'FlowGuard is live on Bitcoin Cash',
    changes: {
      added: [
        'Every product runs on the main Bitcoin Cash network with real BCH',
        'Grants, bounties and reward programs',
        'Contracts for vaults, streams, recurring payments, airdrops, bounties, grants, rewards and votes, reviewed by our team',
      ],
      changed: ['The app uses the main Bitcoin Cash network by default'],
    },
    note: "Anything you created on the test network doesn't carry over. Create your vaults, streams and payments again on Bitcoin Cash.",
  },
  {
    version: '0.2.0',
    date: '2026-02-15',
    network: 'test',
    title: 'Second test release',
    changes: {
      added: [
        'Vaults with signer approvals and spending limits',
        'Streams with several schedule choices',
        'Recurring payments',
        'Budget plans',
        'Votes',
        'Airdrops',
        'Public activity in Explorer',
      ],
      changed: ['A new look across the app', 'Works better on phones', 'Easier wallet connection'],
      fixed: ["Stream pages that didn't display properly", 'Wallets disconnecting unexpectedly', 'Wrong times on scheduled payments'],
    },
  },
  {
    version: '0.1.0',
    date: '2026-02-01',
    network: 'test',
    title: 'First test release',
    changes: {
      added: ['Vaults', 'Simple streams', 'Connecting with Paytaca', 'Public activity in Explorer'],
    },
  },
];

export const CHANGELOG_PAGE = {
  title: 'Changelog',
  description: 'What changed in each release.',
  searchLabel: 'Search changes',
  searchPlaceholder: 'For example, wallet',
  filterLabel: 'Show',
  all: 'All changes',
  noteTitle: 'What you need to do',
  noMatchThing: 'changes',
  githubLabel: 'View code on GitHub',
  docsLabel: 'Read the docs',
  githubHref: GITHUB_URL,
  docsHref: DOCS_SITE_URL,
} as const;

export type RoadmapGroupKey = 'shipped' | 'working' | 'planned';

export type RoadmapItem = { title: string; description: string; date?: string };

export const ROADMAP_GROUPS: readonly { key: RoadmapGroupKey; label: string; line: string; items: readonly RoadmapItem[] }[] = [
  {
    key: 'shipped',
    label: 'Shipped',
    line: 'Live in FlowGuard today.',
    items: [
      {
        title: 'Send payments from vaults',
        description: 'Once enough signers approve a spending request, two of them send it from their wallets.',
        date: '2026-11-03',
      },
      {
        title: 'Pay in CashTokens',
        description: 'Streams, recurring payments, budget plans, airdrops, grants, bounties and rewards work with fungible CashTokens.',
        date: '2026-11-03',
      },
      {
        title: 'Move a stream to a new wallet',
        description: 'The person you pay can move a stream to a new wallet, unless you turn that off when you create it.',
        date: '2026-11-03',
      },
      {
        title: 'Live on Bitcoin Cash',
        description: 'Every product runs with real BCH. Paytaca, Cashonize and other WalletConnect wallets connect.',
        date: '2026-06-01',
      },
      { title: 'Grants, bounties and rewards', description: 'Fund projects in milestones, pay winners and send rewards.', date: '2026-06-01' },
      {
        title: 'Security review',
        description: 'Our team reviewed the contracts and the app, and fixed every issue it found.',
        date: '2026-03',
      },
      {
        title: 'Test release',
        description: 'Vaults, streams, recurring payments, budget plans, votes and airdrops on the test network.',
        date: '2026-02-15',
      },
      { title: 'Status, Explorer and docs', description: 'Check whether services are running, see public activity and read the guides.' },
      { title: 'Organization workspace (beta)', description: "A shared space for a team's vaults and people. It shows sample data while in beta." },
    ],
  },
  {
    key: 'working',
    label: 'Working on',
    line: 'What we are building now.',
    items: [
      { title: 'Pay many wallets in one transaction', description: 'Airdrop and reward payouts to many wallets at once, for lower fees.' },
      { title: 'Vaults with more signers', description: 'Choose how many signers a vault has, instead of three.' },
      { title: 'More wallets', description: 'OPTN and WizardConnect, being tested now.' },
    ],
  },
  {
    key: 'planned',
    label: 'Planned',
    line: 'Next on the list. Plans can change.',
    items: [
      { title: 'Payouts on outside events', description: 'Release money when something outside FlowGuard happens.' },
      { title: 'Vaults with several tokens', description: 'Keep and pay out more than one token from one vault.' },
      { title: 'Move money between vaults', description: 'Send money from one vault to another with the signers\' approval.' },
      { title: 'Tools for larger teams', description: 'Roles, reports for accounting and managing several vaults.' },
      { title: 'For developers', description: 'Plugins, a GraphQL API and webhooks.' },
    ],
  },
];

export const ROADMAP_PAGE = {
  title: 'Roadmap',
  description: "What's shipped, what we're working on, and what's planned.",
  now: 'FlowGuard is live on Bitcoin Cash.',
  changelogLink: "See what's changed",
  ideaTitle: 'Have an idea?',
  ideaLine: 'Tell us what to build next.',
  telegram: 'Join Telegram',
  telegramHref: TELEGRAM_URL,
  github: 'Discuss on GitHub',
  githubHref: `${GITHUB_URL}/discussions`,
  updates: 'Read updates',
} as const;
