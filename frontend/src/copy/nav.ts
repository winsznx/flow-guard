import {
  Activity,
  Award,
  BookOpen,
  Building2,
  FileCheck,
  FlaskConical,
  Gift,
  House,
  KeyRound,
  LifeBuoy,
  MessageCircleQuestion,
  Milestone,
  Repeat,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Target,
  Users,
  Vault,
  Vote,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { AppMode } from '../hooks/useAppMode';
import {
  APP_SITE_URL,
  BLOG_URL,
  DOCS_SITE_URL,
  getCurrentHostname,
  isAppHost,
} from '../utils/publicUrls';

export const SITE_NAME = 'FlowGuard';
export const MARKETING_HOME_TITLE = 'FlowGuard: pay people and share money on Bitcoin Cash';
export const TAGLINE = 'Pay people and share money on Bitcoin Cash.';

export function documentTitle(pageTitle: string): string {
  return `${pageTitle} | ${SITE_NAME}`;
}

export function getHomePath(hostname: string = getCurrentHostname()): string {
  return isAppHost(hostname) ? '/' : '/app';
}

export const HOME_PATH = getHomePath();

export type NavLink =
  | { label: string; path: string; description?: string; icon?: LucideIcon }
  | { label: string; href: string; external: true; description?: string; icon?: LucideIcon };

export type AppNavKey =
  | 'home'
  | 'streams'
  | 'payments'
  | 'vaults'
  | 'proposals'
  | 'airdrops'
  | 'grants'
  | 'bounties'
  | 'rewards'
  | 'orgOverview'
  | 'orgStreams'
  | 'orgTeam'
  | 'orgRoles'
  | 'orgRules'
  | 'explorer'
  | 'help'
  | 'settings';

export type AppNavItem = {
  key: AppNavKey;
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
  /** Other path prefixes that highlight this item, such as /budgets for Vaults. */
  alsoMatches?: readonly string[];
};

export type AppNavGroupKey = 'payPeople' | 'sharedFunds' | 'sendToMany' | 'organization';

export type AppNavGroup = {
  key: AppNavGroupKey;
  label: string;
  beta?: boolean;
  items: readonly AppNavItem[];
};

export const APP_HOME: AppNavItem = {
  key: 'home',
  label: 'Home',
  path: HOME_PATH,
  icon: House,
  description: 'What needs you today, and what you can start.',
};

export const APP_GROUPS: readonly AppNavGroup[] = [
  {
    key: 'payPeople',
    label: 'Pay people',
    items: [
      {
        key: 'streams',
        label: 'Streams',
        path: '/streams',
        icon: Waves,
        description: 'Pay someone bit by bit over time',
        alsoMatches: ['/app/dao/stream-batches'],
      },
      {
        key: 'payments',
        label: 'Recurring payments',
        path: '/payments',
        icon: Repeat,
        description: 'The same amount on a schedule',
      },
    ],
  },
  {
    key: 'sharedFunds',
    label: 'Shared funds',
    items: [
      {
        key: 'vaults',
        label: 'Vaults',
        path: '/vaults',
        icon: Vault,
        description: 'Shared money behind several approvals',
        alsoMatches: ['/budgets'],
      },
      {
        key: 'proposals',
        label: 'Spending requests',
        path: '/proposals',
        icon: FileCheck,
        description: 'Payments waiting for signers',
      },
    ],
  },
  {
    key: 'sendToMany',
    label: 'Pay out from a pool',
    items: [
      {
        key: 'airdrops',
        label: 'Airdrops',
        path: '/airdrops',
        icon: Gift,
        description: 'Many people claim from one funded pool',
      },
      {
        key: 'grants',
        label: 'Grants',
        path: '/grants',
        icon: Milestone,
        description: 'Fund a project in milestones',
      },
      {
        key: 'bounties',
        label: 'Bounties',
        path: '/bounties',
        icon: Target,
        description: 'A prize for finished work',
      },
      {
        key: 'rewards',
        label: 'Rewards',
        path: '/rewards',
        icon: Award,
        description: 'Pay people for things they did',
      },
    ],
  },
];

export const ORGANIZATION_GROUP: AppNavGroup = {
  key: 'organization',
  label: 'Organization',
  beta: true,
  items: [
    { key: 'orgOverview', label: 'Overview', path: '/app/dao/overview', icon: Building2 },
    { key: 'orgStreams', label: 'Vault streams', path: '/app/dao/streams', icon: Waves },
    { key: 'orgTeam', label: 'Team', path: '/app/dao/team', icon: Users },
    { key: 'orgRoles', label: 'Roles', path: '/app/dao/roles', icon: KeyRound },
    { key: 'orgRules', label: 'Spending rules', path: '/app/dao/treasury-policy', icon: ShieldCheck },
  ],
};

export const APP_UTILITY: readonly AppNavItem[] = [
  { key: 'explorer', label: 'Explorer', path: '/explorer', icon: Search },
  { key: 'help', label: 'Help', path: '/help', icon: LifeBuoy },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

export function appNavItems(includeOrganization: boolean): AppNavItem[] {
  const groups = includeOrganization ? [...APP_GROUPS, ORGANIZATION_GROUP] : APP_GROUPS;
  return [APP_HOME, ...groups.flatMap((group) => group.items), ...APP_UTILITY];
}

function matchLength(pathname: string, prefix: string): number {
  if (pathname === prefix) return prefix.length;
  if (prefix !== '/' && pathname.startsWith(`${prefix}/`)) return prefix.length;
  return -1;
}

/** Longest matching path wins, so /streams/abc picks Streams. Home matches only its exact path. */
export function findActiveNavKey(pathname: string, items: readonly AppNavItem[]): AppNavKey | null {
  let best: { key: AppNavKey; length: number } | null = null;
  for (const item of items) {
    const prefixes = item.key === 'home' ? [] : [item.path, ...(item.alsoMatches ?? [])];
    const length = item.key === 'home'
      ? (pathname === item.path ? item.path.length : -1)
      : Math.max(...prefixes.map((prefix) => matchLength(pathname, prefix)));
    if (length >= 0 && (!best || length > best.length)) best = { key: item.key, length };
  }
  return best?.key ?? null;
}

export const ORGANIZATION_BREADCRUMB = 'Organization';

export const WORKSPACE_LABEL = 'Workspace';

export const WORKSPACE_NAMES: Record<AppMode, string> = {
  user: 'Personal',
  dao: 'Organization (beta)',
};

export type MarketingMenuGroup = { label: string; items: readonly NavLink[] };

const PRODUCT_LINKS = {
  vesting: { label: 'Vesting', path: '/vesting', icon: Waves, description: 'Pay out tokens or BCH bit by bit' },
  payroll: { label: 'Payroll', path: '/payroll', icon: Repeat, description: 'Pay your team on a schedule' },
  budgeting: {
    label: 'Vaults and budget plans',
    path: '/budgeting',
    icon: Vault,
    description: 'Shared money behind several approvals',
  },
  governance: { label: 'Group approvals', path: '/governance-info', icon: Vote, description: 'Approve payments together' },
  grants: { label: 'Grants', path: '/grants-info', icon: Milestone, description: 'Fund a project in milestones' },
  sendToMany: {
    label: 'Airdrops, bounties and rewards',
    path: '/use-cases#send-to-many',
    icon: Gift,
    description: 'Examples on the use cases page',
  },
} satisfies Record<string, NavLink>;

const LEARN_LINKS = {
  howItWorks: { label: 'How it works', path: '/how-it-works' },
  useCases: { label: 'Use cases', path: '/use-cases' },
  pricing: { label: 'Pricing', path: '/pricing' },
  demo: { label: 'Try it', path: '/demo', icon: FlaskConical, description: 'Send yourself a small amount' },
  faq: { label: 'Questions and answers', path: '/faq', icon: MessageCircleQuestion },
  help: { label: 'Help', path: '/help', icon: LifeBuoy, description: 'Guides and fixes' },
} satisfies Record<string, NavLink>;

const TRUST_LINKS = {
  security: { label: 'Security', path: '/security', icon: Shield, description: 'Who can move the money' },
  explorer: { label: 'Explorer', path: '/explorer' },
  status: { label: 'Status', path: '/status', icon: Activity },
  changelog: { label: 'Changelog', path: '/changelog' },
  roadmap: { label: 'Roadmap', path: '/roadmap' },
} satisfies Record<string, NavLink>;

const DOCS_LINK: NavLink = { label: 'Docs', href: DOCS_SITE_URL, external: true, icon: BookOpen };

export const GITHUB_URL = 'https://github.com/winsznx/flow-guard';

export const MARKETING_NAV = {
  products: {
    label: 'Products',
    groups: [
      { label: 'Pay people', items: [PRODUCT_LINKS.vesting, PRODUCT_LINKS.payroll] },
      { label: 'Shared funds', items: [PRODUCT_LINKS.budgeting, PRODUCT_LINKS.governance] },
      { label: 'Pay out from a pool', items: [PRODUCT_LINKS.grants, PRODUCT_LINKS.sendToMany] },
    ] satisfies MarketingMenuGroup[],
    footer: LEARN_LINKS.useCases,
  },
  links: [LEARN_LINKS.howItWorks, LEARN_LINKS.pricing] satisfies NavLink[],
  help: {
    label: 'Help',
    items: [
      LEARN_LINKS.help,
      LEARN_LINKS.demo,
      LEARN_LINKS.faq,
      TRUST_LINKS.security,
      TRUST_LINKS.status,
      DOCS_LINK,
    ] satisfies NavLink[],
  },
  openApp: { label: 'Open app', href: APP_SITE_URL },
} as const;

export type FooterColumn = { label: string; links: readonly NavLink[] };

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  { label: 'Products', links: Object.values(PRODUCT_LINKS) },
  {
    label: 'Learn',
    links: [
      LEARN_LINKS.howItWorks,
      LEARN_LINKS.useCases,
      LEARN_LINKS.pricing,
      LEARN_LINKS.demo,
      LEARN_LINKS.faq,
      LEARN_LINKS.help,
    ],
  },
  {
    label: 'Developers',
    links: [
      DOCS_LINK,
      { label: 'SDK', href: `${DOCS_SITE_URL}/sdk/overview`, external: true },
      { label: 'API reference', href: `${DOCS_SITE_URL}/api/overview`, external: true },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
  {
    label: 'Trust',
    links: [TRUST_LINKS.security, TRUST_LINKS.explorer, TRUST_LINKS.status, TRUST_LINKS.changelog, TRUST_LINKS.roadmap],
  },
  {
    label: 'News',
    links: [
      { label: 'Updates', path: '/updates', description: 'News from the FlowGuard team' },
      { label: 'Blog', href: BLOG_URL, external: true },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Terms of use', path: '/terms' },
      { label: 'Privacy', path: '/privacy' },
      { label: 'Risk disclaimer', path: '/disclaimer' },
    ],
  },
];

export const SOCIAL_LINKS = [
  { label: 'GitHub', href: GITHUB_URL },
  { label: 'YouTube', href: 'https://www.youtube.com/@flowguard_cash' },
  { label: 'Telegram', href: 'https://t.me/flowguard_cash' },
] as const;

/** Document titles without the "| FlowGuard" suffix, for routes whose title doesn't come from loaded data. */
export const ROUTE_TITLES: readonly { path: string; title: string }[] = [
  { path: '/vesting', title: 'Vesting' },
  { path: '/payroll', title: 'Payroll' },
  { path: '/budgeting', title: 'Vaults and budget plans' },
  { path: '/grants-info', title: 'Grants' },
  { path: '/governance-info', title: 'Group approvals' },
  { path: '/use-cases', title: 'Use cases' },
  { path: '/how-it-works', title: 'How it works' },
  { path: '/pricing', title: 'Pricing' },
  { path: '/demo', title: 'Try it' },
  { path: '/help', title: 'Help' },
  { path: '/faq', title: 'Questions and answers' },
  { path: '/security', title: 'Security' },
  { path: '/status', title: 'Status' },
  { path: '/updates', title: 'Updates' },
  { path: '/changelog', title: 'Changelog' },
  { path: '/roadmap', title: 'Roadmap' },
  { path: '/terms', title: 'Terms of use' },
  { path: '/privacy', title: 'Privacy' },
  { path: '/disclaimer', title: 'Risk disclaimer' },
  { path: '/explorer', title: 'Explorer' },
  { path: '/claim/:token', title: 'Claim' },
  { path: '*', title: 'Page not found' },
  { path: '/app', title: 'Home' },
  { path: '/streams', title: 'Streams' },
  { path: '/streams/create', title: 'Create a stream' },
  { path: '/vaults/:id/create-stream', title: 'Create a stream' },
  { path: '/streams/batch-create', title: 'Pay many people' },
  { path: '/vaults/:id/batch-create', title: 'Pay many people' },
  { path: '/streams/batches', title: 'Stream batches' },
  { path: '/streams/shapes', title: 'Schedule examples' },
  { path: '/payments', title: 'Recurring payments' },
  { path: '/payments/create', title: 'Create a recurring payment' },
  { path: '/airdrops', title: 'Airdrops' },
  { path: '/airdrops/create', title: 'Create an airdrop' },
  { path: '/bounties', title: 'Bounties' },
  { path: '/bounties/create', title: 'Create a bounty' },
  { path: '/rewards', title: 'Rewards' },
  { path: '/rewards/create', title: 'Create a reward program' },
  { path: '/grants', title: 'Grants' },
  { path: '/grants/create', title: 'Create a grant' },
  { path: '/vaults', title: 'Vaults' },
  { path: '/vaults/create', title: 'Create a vault' },
  { path: '/vaults/:id/proposals/create', title: 'New spending request' },
  { path: '/proposals', title: 'Spending requests' },
  { path: '/proposals/:id', title: 'Spending request' },
  { path: '/budgets', title: 'Budget plans' },
  { path: '/budgets/create', title: 'Create a budget plan' },
  { path: '/settings', title: 'Settings' },
  { path: '/app/dao/overview', title: 'Organization overview' },
  { path: '/app/dao/streams', title: 'Vault streams' },
  { path: '/app/dao/stream-batches', title: 'Stream batches' },
  { path: '/app/dao/team', title: 'Team' },
  { path: '/app/dao/roles', title: 'Roles' },
  { path: '/app/dao/treasury-policy', title: 'Spending rules' },
  { path: '/dev/kit', title: 'Component kit' },
];

export function routeTitle(path: string): string | null {
  return ROUTE_TITLES.find((route) => route.path === path)?.title ?? null;
}

export const CONNECT_TITLE = 'Connect your wallet';

export const CHROME = {
  collapseSidebar: 'Collapse sidebar',
  expandSidebar: 'Expand sidebar',
  skipToContent: 'Skip to content',
  menu: 'Menu',
  mainNav: 'Main',
  footer: 'Footer',
  elsewhere: 'FlowGuard elsewhere',
  checkingForWallet: 'Checking for your wallet',
  loading: 'Loading',
} as const;

export const CONNECT_PURPOSES = {
  home: 'what needs you',
  organization: 'the Organization workspace',
} as const;

/** Shared detail links reach a recipient before they connect, so the gate says why they're here. */
export const SHARED_LINK_PURPOSE = 'Someone set this up to pay you. Connect your wallet to see it and claim.';
