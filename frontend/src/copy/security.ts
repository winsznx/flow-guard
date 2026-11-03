import { SECURITY_EMAIL, SUPPORT_EMAIL } from './help';
import { GITHUB_URL } from './nav';

const SOURCE_ROOT = `${GITHUB_URL}/blob/main/contracts/core`;

export const SECURITY_PAGE = {
  title: 'Security',
  description: 'Who can move the money in each product, how the contracts were checked, and how to report a problem.',
  plainTitle: 'The short answer',
  whoTitle: 'Who can move the money',
  whoLine: 'The rules for each product are set when you create it and stored on Bitcoin Cash.',
  rowWho: 'Who can move the money',
  rowGoesAway: 'If FlowGuard goes away',
  rowSource: 'Contract source',
  checkedTitle: 'How the contracts were checked',
  checkedLine: 'No outside firm has checked the contracts yet. Here is what has been done.',
  curiousTitle: 'For the curious',
  curiousLine: 'The details behind the answers above, for developers and security researchers.',
  contractsTitle: 'The contracts',
  contractsLine:
    'Each item you create gets its own contract address, shown on its page. These are the source files every contract is built from.',
  coveredTitle: 'What our review covered',
  notCoveredTitle: 'Not covered',
  timelineTitle: 'Security timeline',
  timelineLine: 'Key security milestones, newest first.',
  disclosureTitle: 'How we handle a report',
  disclosureLine: 'Tell us privately first, so we can fix the problem before anyone loses money.',
  safeHarborTitle: 'Safe harbor',
  reportTitle: 'Report a problem',
  reportLine: 'We read every report and reply within 24 hours.',
  viewSource: 'View source on GitHub',
} as const;

export const PLAIN_ANSWERS: readonly string[] = [
  'FlowGuard never holds your keys or your recovery phrase.',
  'You approve every payment in your own wallet.',
  'Money sits in a contract on Bitcoin Cash that only lets it move by the rules you set.',
  "For airdrops, bounties, rewards and grants, each payout also needs FlowGuard's servers to approve it.",
];

export type ProductFacts = {
  id: string;
  label: string;
  who: string;
  goesAway: string;
  source: { label: string; href: string };
};

export const PRODUCT_FACTS: readonly ProductFacts[] = [
  {
    id: 'streams',
    label: 'Streams, recurring payments and budget plans',
    who: "Only the recipient can claim. If you allowed it when you created it, you can pause or cancel. The recipient keeps what's already released, and the rest comes back to your wallet.",
    goesAway:
      'The contracts keep running on Bitcoin Cash. Their source is public, so a developer can still claim or cancel without our website.',
    source: { label: 'Stream contract', href: `${SOURCE_ROOT}/streaming/VestingCovenant.cash` },
  },
  {
    id: 'vaults',
    label: 'Vaults',
    who: "Signers approve spending requests, and a payment can leave only with enough approvals. Once enough signers approve a payment, two of them approve sending it in their wallets. Any one signer can pause the vault. A vault's signers are set when you create it and can't be changed later.",
    goesAway: 'The vault stays on Bitcoin Cash, and its signers can still approve payments with any tool that builds the transaction.',
    source: { label: 'Vault contract', href: `${SOURCE_ROOT}/treasury/VaultCovenant.cash` },
  },
  {
    id: 'send-to-many',
    label: 'Airdrops, bounties and rewards',
    who: "Each claim, winner payment or reward also needs FlowGuard's servers to approve it. Only the sender can pause or cancel, and cancelling sends what's left back to the sender's wallet.",
    goesAway: "Claims and payouts stop until FlowGuard's servers are back. The money stays in the contract.",
    source: { label: 'Airdrop contract', href: `${SOURCE_ROOT}/distribution/AirdropCovenant.cash` },
  },
  {
    id: 'grants',
    label: 'Grants',
    who: "Each milestone release also needs FlowGuard's servers to approve it, and each release goes only to the project's address. Only the sender can pause or cancel, and cancelling sends what's left back to the sender's wallet.",
    goesAway: "Milestone releases stop until FlowGuard's servers are back. The money stays in the contract.",
    source: { label: 'Grant contract', href: `${SOURCE_ROOT}/distribution/GrantCovenant.cash` },
  },
];

export const CHECKED_FACTS: readonly { title: string; body: string }[] = [
  {
    title: 'Reviewed by our team',
    body: 'Before FlowGuard went live, our team reviewed the contracts, the app and FlowGuard\'s servers. The review listed 43 issues, and each one was fixed before going live.',
  },
  {
    title: 'No outside review yet',
    body: "No outside firm has checked the contracts yet. We'll publish the report here when one does.",
  },
  {
    title: 'Open source',
    body: 'The contract source is public, and anyone can check that the contracts running on Bitcoin Cash match it.',
  },
];

export const CONTRACTS: readonly { name: string; description: string; href: string }[] = [
  { name: 'Stream', description: 'Releases BCH bit by bit to one recipient.', href: `${SOURCE_ROOT}/streaming/VestingCovenant.cash` },
  { name: 'Token stream', description: 'Releases tokens bit by bit to one recipient.', href: `${SOURCE_ROOT}/streaming/FtVestingCovenant.cash` },
  { name: 'Recurring payment', description: 'Pays the same amount on a fixed schedule.', href: `${SOURCE_ROOT}/streaming/RecurringPaymentCovenant.cash` },
  { name: 'Vault', description: 'Holds shared money and pays out when enough signers approve.', href: `${SOURCE_ROOT}/treasury/VaultCovenant.cash` },
  { name: 'Airdrop', description: 'Pays one share to each wallet that claims.', href: `${SOURCE_ROOT}/distribution/AirdropCovenant.cash` },
  { name: 'Bounty', description: 'Pays the prize to each winner the sender picks.', href: `${SOURCE_ROOT}/distribution/BountyCovenant.cash` },
  { name: 'Reward program', description: 'Pays rewards from one funded pool.', href: `${SOURCE_ROOT}/distribution/RewardCovenant.cash` },
  { name: 'Grant', description: 'Releases a grant one milestone at a time.', href: `${SOURCE_ROOT}/distribution/GrantCovenant.cash` },
];

export const REVIEW_COVERED =
  "The contracts for every product, FlowGuard's servers that prepare transactions and read Bitcoin Cash data, the app, and how we put new versions live.";

export const NOT_COVERED: readonly string[] = [
  'Wallets such as Paytaca and Cashonize. Report wallet bugs to those teams.',
  'Bugs in Bitcoin Cash itself. Report these to the Bitcoin Cash developer community.',
  'Attacks on FlowGuard team members, in person or by tricking them.',
];

export const SECURITY_TIMELINE: readonly { date: string; title: string; body: string }[] = [
  {
    date: '2026-11',
    title: 'Updated contracts',
    body: "New streams, payments, airdrops, grants, bounties and rewards use updated contracts that fix token payouts and return unused fee money. Contracts already on Bitcoin Cash keep their rules.",
  },
  {
    date: '2026-06-01',
    title: 'FlowGuard went live on Bitcoin Cash',
    body: 'Every product moved to the main Bitcoin Cash network with real BCH.',
  },
  {
    date: '2026-03',
    title: 'Internal review finished',
    body: 'All 43 issues from our review were fixed, including a fix that ties each sign-in to one wallet.',
  },
  {
    date: '2026-02',
    title: 'Contract code locked',
    body: 'The contract code was locked. Any change now needs a new contract and a move to it.',
  },
  {
    date: '2026-01',
    title: 'Source published for review',
    body: 'The contracts and FlowGuard\'s servers were published so anyone could review them.',
  },
  {
    date: '2025-11',
    title: 'First full test',
    body: 'We ran the first products end to end on the test network, where coins have no value.',
  },
];

export const DISCLOSURE_STEPS: readonly { title: string; body: string }[] = [
  {
    title: 'You report it',
    body: `Email ${SECURITY_EMAIL} with what happened, the steps to reproduce it, and any transaction links. Don't post it on GitHub, Telegram or X first.`,
  },
  {
    title: 'We reply',
    body: "We reply within 24 hours. Within 72 hours we confirm the problem, ask for more detail, or tell you why we couldn't reproduce it.",
  },
  {
    title: 'We fix it',
    body: 'Serious problems are fixed in private, checked by at least two people, and put live before anything is published. Smaller fixes go out in our regular updates.',
  },
  {
    title: 'We publish',
    body: "Once the fix is live, we publish a write-up and credit you, unless you'd rather stay anonymous. We aim to publish within 90 days of your report.",
  },
];

export const SAFE_HARBOR = {
  intro:
    'Security research done in good faith against FlowGuard is allowed. This includes finding and reporting problems in our contracts, our servers and the app. We will not take legal action against researchers who:',
  rules: [
    'Make a good-faith effort to avoid privacy violations and disruption to other people.',
    'Only use wallets and data they own or have permission to use.',
    'Report problems to us before telling anyone else.',
    "Don't copy anyone's data beyond what is needed to show the problem.",
  ],
} as const;

export const REPORT_OPTIONS: readonly { title: string; line: string; email: string; action: string }[] = [
  {
    title: 'Security problems',
    line: 'Found a bug that could put money or data at risk.',
    email: SECURITY_EMAIL,
    action: `Email ${SECURITY_EMAIL}`,
  },
  {
    title: 'Something wrong with your money',
    line: 'Your money looks wrong, or a payment seems stuck.',
    email: SUPPORT_EMAIL,
    action: `Email ${SUPPORT_EMAIL}`,
  },
];
