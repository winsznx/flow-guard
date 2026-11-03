import { asFlowError } from './errors';
import { formatCount, formatIntervalDays } from './format';
import { IS_TEST_BUILD, NETWORK_NAME } from './network';

export const SIGNERS_FIXED_LINE =
  "A vault's signers are set when you create it and can't be changed later.";

export const VAULT_SENDING_LINE =
  'Money leaves this vault only after enough signers approve a spending request and two of them approve sending it.';

/** Addresses match whether or not they carry their bitcoincash: or bchtest: prefix. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const strip = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:/, '');
  return strip(a) === strip(b);
}

/** True when a failed action still put its transaction on the network, so the money already moved. */
export function reachedNetwork(error: unknown): boolean {
  const failure = asFlowError(error);
  return failure.code === 'SENT_NOT_SYNCED' || Boolean(failure.txid);
}

export function vaultTitle(vault: { name?: string | null; id: string }): string {
  return vault.name?.trim() || `Vault ${vault.id.slice(0, 8)}`;
}

export function signersRequiredLine(required: number, total: number): string {
  return `${required} of ${formatCount(total, 'signer', 'signers')} must approve each payment.`;
}

export function signersRequiredShort(required: number, total: number): string {
  return `${required} of ${total} must approve`;
}

export function everyDays(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return formatIntervalDays(Math.round(seconds / 86400));
}

export const VAULTS_PAGE = {
  title: 'Vaults',
  description: 'Shared money behind several approvals. It moves only when enough signers approve.',
  budgetsDescription:
    'Money from your wallet, released on a schedule you set and listed under a vault.',
  budgetsDocumentTitle: 'Budget plans',
  tabsLabel: 'Vault pages',
  tabs: { vaults: 'Vaults', budgets: 'Budget plans' },
  segmentLabel: 'Whose vaults',
  segments: { yours: 'Yours', public: 'All public' },
  publicLine:
    'Vaults other people made public. You can look, but only their signers can move the money.',
  create: 'Create vault',
  stats: {
    count: 'Vaults',
    held: 'Held in these vaults',
    heldSub: 'From the last balance check',
  },
  columns: {
    name: 'Vault',
    held: 'Held',
    approvals: 'Approvals',
    visibility: 'Who can see it',
  },
  listLabel: 'Vaults',
  public: 'Public',
  private: 'Private',
  noContract: 'Not set up on Bitcoin Cash yet',
  loadFailedTitle: "Vaults didn't load",
  empty: {
    yoursTitle: 'No vaults yet',
    yoursLine: 'A vault holds shared money that moves only when enough of its signers approve.',
    yoursExample: 'For example: a team budget that needs 2 of 3 people to approve each payment.',
    publicTitle: 'No public vaults yet',
    publicLine: 'When someone makes a vault public, it shows up here.',
    learnMore: 'How vaults work',
  },
} as const;

export const VAULT_DETAIL = {
  breadcrumb: 'Vaults',
  loadFailedTitle: "This vault didn't load",
  notFoundTitle: "We couldn't find this vault",
  noAccessTitle: 'This vault is private',
  backToVaults: 'Back to vaults',
  createStream: 'Create stream',
  payManyPeople: 'Pay many people',
  listedHereLine: 'Streams you list here are paid from your wallet, not from this vault.',
  held: 'Held in this vault',
  heldUnknown: 'Balance unavailable',
  notSetUp: "This vault isn't set up on Bitcoin Cash yet, so it can't receive money.",
  updated: (when: string) => `Balance checked ${when}`,
  refresh: 'Check balance again',
  refreshing: 'Checking',
  publicVault: 'Public vault',
  privateVault: 'Private vault',
  budget: {
    title: 'Open for spending',
    explainer:
      "Money in a vault opens for spending one period at a time. When a signer opens the next spending period, signers can approve spending from that amount too. The spending limit is the most that can go out in one period.",
    line: (amount: string, interval: string) =>
      `${amount} more opens for spending ${interval}. A signer opens each new spending period.`,
    noSchedule: 'This vault has no spending schedule.',
    nothingReady: (date: string | null) =>
      date
        ? `The next spending period can be opened on ${date}.`
        : 'There is no spending period to open right now.',
    readyFrom: (date: string) => `For spending from ${date}`,
    release: 'Open next spending period',
    confirmTitle: (amount: string) => `Open ${amount} for spending?`,
    confirmBody: (amount: string, date: string) =>
      `Signers can then approve spending requests that use this ${amount}, for the spending period that started on ${date}. No money leaves the vault now.`,
    keep: 'Not now',
    busy: 'Opening the next period',
    done: 'Opened for spending',
    signersOnly: "Only this vault's signers can open a new spending period.",
  },
  details: {
    title: 'Details',
    address: 'Vault address',
    approvals: 'Approvals needed',
    budget: 'Opens for spending',
    budgetValue: (amount: string, interval: string) => `${amount} ${interval}`,
    limit: 'Spending limit',
    limitValue: (amount: string) => `Up to ${amount} each spending period`,
    noLimit: 'No limit',
    visibility: 'Who can see it',
    publicValue: 'Anyone',
    privateValue: 'Only its signers',
    created: 'Created',
  },
  signers: {
    title: 'Signers',
    setUpBy: 'Set up this vault',
    fixed: SIGNERS_FIXED_LINE,
    howToChange: 'How to change signers',
  },
  whoCanMove: {
    title: 'Who can move the money',
    line: (required: number, total: number) =>
      `Money leaves this vault only when ${required} of its ${total} signers approve a spending request and two of them approve sending it. FlowGuard can't move it.`,
  },
  history: {
    title: 'History',
    listLabel: 'Vault history',
    what: 'What happened',
    amount: 'Amount',
    when: 'When',
    link: 'Transaction',
    empty: 'Nothing has happened in this vault yet.',
    failed: "This vault's history didn't load. Nothing in your wallet has changed.",
    events: {
      deposit: 'Deposit',
      payout: 'Payment sent',
      proposal: 'Spending request made',
      approve: 'Spending request approved',
      unlock: 'Opened for spending',
      create: 'Vault set up',
      other: 'Vault activity',
    },
  },
} as const;

export const SIGNERS_DIALOG = {
  title: "Signers can't be changed",
  body: SIGNERS_FIXED_LINE,
  next: 'To work with a different group of signers, create a new vault with them.',
  createVault: 'Create a new vault',
} as const;

const MAX_DEPOSIT = IS_TEST_BUILD ? 100 : 1000;

export const VAULT_CREATE = {
  title: 'Create a vault',
  description: 'Choose the signers and how many of them must approve each payment.',
  back: 'Back to vaults',
  steps: {
    name: 'Name',
    signers: 'Signers',
    money: 'Money and spending',
    check: 'Check and create',
  },
  name: {
    label: 'Vault name',
    helper: 'Signers see this name.',
    placeholder: 'For example, Team budget',
    required: 'Enter a name for the vault.',
    description: 'What it is for',
    descriptionHelper: 'Signers see this when they open the vault.',
    descriptionPlaceholder: 'For example, Shared costs for the design team',
    public: 'Make this vault public',
    publicLine:
      'Anyone can see a public vault and its balance. Only its signers can move the money.',
  },
  signers: {
    legend: 'Signers',
    intro: 'A vault has 3 signers. Each one adds their address and public key.',
    fixed: SIGNERS_FIXED_LINE,
    signer: (n: number) => `Signer ${n}`,
    address: 'Address',
    addressHelper: "The Bitcoin Cash address of this signer's wallet.",
    publicKey: 'Public key',
    publicKeyHelper:
      "Each signer can find their public key in FlowGuard. They connect their own wallet, open Settings and copy it, then send it to you. If you're a signer, use Use my wallet.",
    useMine: 'Use my wallet',
    noPublicKey:
      "Your wallet didn't share its public key. Some wallets don't. Try connecting with another wallet, or paste the key if your wallet shows it.",
    addressRequired: "Enter this signer's address.",
    keyRequired: "Enter this signer's public key.",
    keyInvalid: 'Enter the full public key. It has 66 characters and starts with 02 or 03.',
    duplicate: 'Each signer needs a different address.',
    approvals: 'How many signers must approve each payment',
    approvalsOption: (n: number) => `${n} of 3 signers`,
    approvalsLine: 'Vaults can need 1 or 2 approvals out of 3 signers.',
  },
  money: {
    deposit: 'Deposit',
    depositHelper: `The BCH you put in when the vault is created. ${
      IS_TEST_BUILD
        ? `On ${NETWORK_NAME} you can deposit up to ${MAX_DEPOSIT} BCH.`
        : `You can deposit up to ${MAX_DEPOSIT} BCH.`
    }`,
    depositRequired: 'Enter an amount above 0.',
    depositTooLarge: `Enter ${MAX_DEPOSIT} BCH or less.`,
    looksLikeSats:
      'This is a large amount. Amounts here are in BCH, so check you meant this many BCH.',
    howOften: 'How often spending opens up',
    howOftenHelper: 'Each time this passes, a signer can open a new spending period.',
    releaseAmount: 'Opens for spending each period',
    releaseHelper: 'How much more signers can approve spending from, each period.',
    releaseRequired: 'Enter an amount above 0.',
    limit: 'Spending limit',
    limitHelper: 'The most that can be spent in one spending period. Leave it empty for no limit.',
  },
  intervals: [
    { value: '604800', label: 'Every 7 days' },
    { value: '2592000', label: 'Every 30 days' },
    { value: '7776000', label: 'Every 90 days' },
  ],
  check: {
    title: 'Check your vault',
    signersLabel: 'Signers',
    fixedNote: `${SIGNERS_FIXED_LINE} The approval count can't change either.`,
    createNote:
      "Creating the vault moves no money. Your wallet may ask you to sign in first, which is free. Then you'll deposit in a second step.",
    sendingNote: VAULT_SENDING_LINE,
    create: 'Create vault',
    creating: 'Creating vault',
    errorTitle: "Couldn't create the vault",
    fixFields: 'Some details need a fix before you can continue.',
  },
  created: {
    title: 'Your vault is ready',
    depositLine: (amount: string) =>
      `Next, deposit ${amount}. You'll approve one transaction in your wallet. ${VAULT_SENDING_LINE}`,
    deposit: (amount: string) => `Deposit ${amount}`,
    goToVault: 'Go to vault',
    done: 'Your deposit went through. The vault is ready to use.',
    notSetUpTitle: "Your vault was saved but isn't set up on Bitcoin Cash yet",
    notSetUpLine: "It can't take a deposit yet. Nothing left your wallet.",
    depositReviewTitle: (amount: string) => `Deposit ${amount} into the vault?`,
  },
  insufficient: (amount: string) =>
    `Not enough BCH in your wallet. You need ${amount} plus a small network fee.`,
  maxDeposit: MAX_DEPOSIT,
} as const;
