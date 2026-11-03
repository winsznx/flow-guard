import { formatCount } from './format';
import { NETWORK_COPY } from './network';

export const CONNECT_SCREEN = {
  explainer: NETWORK_COPY.connectExplainer,
  metaDescription: 'Connect a Bitcoin Cash wallet to pay people and share money with FlowGuard.',
  logoLink: 'FlowGuard home',
  networkFact: NETWORK_COPY.connectFact,
  workspaceLine: 'You start in your Personal workspace. Organization (beta) is in the sidebar. It shows sample data for now.',
  lookAround: 'Look around first',
  lookAroundLead: 'Want to see activity before you connect?',
  factsLabel: 'Before you connect',
  facts: [
    'You need a Bitcoin Cash wallet and a little BCH for network fees.',
    'FlowGuard adds no fee.',
  ],
} as const;

export const HOME = {
  title: 'Home',
  description: 'What needs you today, and what you can start.',
  attentionTitle: 'Needs your attention',
  attentionLabel: 'Things that need you',
  attentionEmpty: 'Claims, approvals and unfunded items show up here.',
  someFailed: "Some of your items didn't load.",
  statsLabel: 'Your money at a glance',
  readyToClaim: 'Ready to claim',
  waitingForApproval: 'Waiting for your approval',
  nextPaymentOut: 'Next payment out',
  inYourVaults: 'In your vaults',
  activityTitle: 'Recent activity',
  activityDescription: 'Your latest stream events.',
  startTitle: 'Start something',
  startDescription: 'Every product, one line each.',
  startLabel: 'Create something new',
  newToBchTitle: 'New to Bitcoin Cash?',
  newToBchDescription: 'Three places to start before you move money.',
  loadFailedTitle: "Your streams, payments and vaults didn't load.",
  loadFailedReason: 'Check your connection and try again.',
} as const;

export const START_ACTIONS: readonly { label: string; to: string }[] = [
  { label: 'Create stream', to: '/streams/create' },
  { label: 'Pay many people', to: '/streams/batch-create' },
  { label: 'Create recurring payment', to: '/payments/create' },
  { label: 'Create vault', to: '/vaults/create' },
  { label: 'Create budget plan', to: '/budgets/create' },
  { label: 'Create airdrop', to: '/airdrops/create' },
  { label: 'Create grant', to: '/grants/create' },
  { label: 'Create bounty', to: '/bounties/create' },
  { label: 'Create reward program', to: '/rewards/create' },
];

export const NEW_TO_BCH_LINKS: readonly { title: string; description: string; to: string }[] = [
  { title: 'Get a wallet', description: 'Pick a Bitcoin Cash wallet and add a little BCH for network fees.', to: '/help' },
  { title: 'How it works', description: 'See what each product does and who can move the money.', to: '/how-it-works' },
  { title: 'Try it with a small amount', description: 'Send yourself a little BCH on a short schedule and watch it release.', to: '/demo' },
];

export const ATTENTION = {
  streamReady: (amount: string, from: string) => `${amount} is ready to claim from ${from}.`,
  paymentReady: (amount: string, from: string) => `A payment of ${amount} from ${from} is ready to claim.`,
  requestWaiting: (vault: string, amount: string, to: string) =>
    `${vault} has a request to send ${amount} to ${to}. It needs your approval.`,
  streamNotFunded: (name: string, to: string) => `${name} isn't funded yet. Fund it so ${to} can start claiming.`,
  paymentNotFunded: (name: string, to: string) => `${name} isn't funded yet. Fund it so ${to} can claim each payment.`,
  claimAmount: (amount: string) => `Claim ${amount}`,
  reviewRequest: 'Review request',
  fundStream: 'Fund stream',
  fundPayment: 'Fund payment',
  streamFrom: (who: string) => `the stream from ${who}`,
  streamTo: (who: string) => `Your stream to ${who}`,
  paymentTo: (who: string) => `Your recurring payment to ${who}`,
  someAmount: 'an amount',
  more: (n: number) => `${formatCount(n, 'more item', 'more items')} in your lists.`,
} as const;

export const STAT_SUBS = {
  tokenClaims: (n: number) => formatCount(n, 'token claim', 'token claims'),
  tokensToo: (n: number) => `Plus ${formatCount(n, 'token claim', 'token claims')}`,
  requests: 'In vaults you sign for',
  nextPaymentTo: (amount: string, to: string) => `${amount} to ${to}`,
  acrossVaults: (n: number) => `Across ${formatCount(n, 'vault', 'vaults')}`,
} as const;

export const ORG_HOME = {
  description: "Your organization's vaults, people and spending rules. It shows sample data while in beta.",
  goToOverview: 'Go to overview',
  statsLabel: 'Sample figures',
  totalValue: 'Total value',
  spendingPerMonth: 'Spending a month',
  lastsAbout: 'Lasts about',
  requestsWaiting: 'Requests waiting',
  acrossVaults: (n: number) => `Across ${formatCount(n, 'vault', 'vaults')}`,
  months: (n: number) => formatCount(n, 'month', 'months'),
  atThisRate: 'At this rate of spending',
  assetsTitle: "What's in your vaults",
  shareOfTotal: (share: string) => `${share} of total`,
  rulesTitle: 'Spending rules',
  rulesDescription: "Limits you plan for vault spending. They aren't enforced yet.",
  viewAllRules: 'View all spending rules',
  perPayment: (cap: string) => `Up to ${cap} per payment`,
  perDay: (cap: string) => `Up to ${cap} a day`,
  goToTitle: 'Go to',
} as const;
