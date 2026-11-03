import { formatCount } from './format';

export const READY_TO_SEND = {
  title: 'Some approved payments are ready to send',
  line: "Open the request's vault to send it. Two signers approve sending in their wallets.",
} as const;

export function approvalsLine(count: number, required: number): string {
  return `${count} of ${required} approvals`;
}

export const REQUESTS_PAGE = {
  title: 'Spending requests',
  description: 'Payments from your vaults that are waiting for signers to approve.',
  listLabel: 'Spending requests',
  filterLabel: 'Status',
  stats: {
    needsYou: 'Waiting for your approval',
    waiting: 'Waiting for approval',
    approved: 'Approved, not sent yet',
  },
  columns: {
    request: 'Request',
    amount: 'Amount',
    to: 'Goes to',
    approvals: 'Approvals',
    status: 'Status',
    created: 'Asked on',
  },
  noReason: 'No reason given',
  inVault: (vault: string) => `From ${vault}`,
  loadFailedTitle: "Spending requests didn't load",
  someFailed: (n: number) =>
    `Requests from ${formatCount(n, 'vault', 'vaults')} didn't load. Nothing in your wallet has changed.`,
  someFailedTitle: 'Some requests are missing',
  empty: {
    title: 'No spending requests yet',
    line: "A spending request asks a vault's signers to approve a payment. Open one of your vaults to start one.",
    noVaultsLine:
      "Spending requests come from vaults you sign for. You don't sign for a vault yet.",
    action: 'Go to vaults',
    createVault: 'Create vault',
  },
  noResultsThing: 'spending requests',
} as const;

export const VAULT_REQUESTS = {
  title: 'Spending requests',
  description: 'Payments from this vault wait here until enough signers approve.',
  newRequest: 'New spending request',
  groups: {
    needsApproval: 'Needs approval',
    readyToSend: 'Approved, not sent yet',
    sent: 'Paid',
    rejected: 'Rejected',
  },
  approve: 'Approve',
  youApproved: 'You approved this.',
  noReason: 'No reason given',
  signersOnly: "Only this vault's signers can see its spending requests.",
  empty: 'No spending requests yet. Ask the signers to approve a payment from this vault.',
  loadFailed: "This vault's spending requests didn't load. Nothing in your wallet has changed.",
  balanceLine: (amount: string) => `Held in this vault: ${amount}`,
  limitLine: (amount: string) => `Spending limit: up to ${amount} each spending period`,
  approveReview: {
    title: 'Approve this spending request?',
    consequence:
      'Your approval is recorded on Bitcoin Cash. No money moves until the payment is sent.',
    done: 'Your approval is in.',
  },
  send: 'Send payment',
  sendLine: 'Two signers approve sending in their wallets. The payment goes out after the second one.',
  sendReview: {
    title: 'Send this payment?',
    leaves: 'Leaves this vault',
    consequence:
      'Your wallet asks you to approve. If another signer still needs to approve, nothing moves until they do.',
    waiting: 'Your approval is in. The payment goes out when the other signer approves it too.',
    done: 'The payment is on its way.',
  },
} as const;

export const REQUEST_CREATE = {
  title: 'New spending request',
  description: (vault: string) => `Ask the signers of ${vault} to approve a payment.`,
  descriptionFallback: "Ask this vault's signers to approve a payment.",
  back: 'Back to vault',
  vaultSummary: 'From this vault',
  heldLabel: 'Held',
  limitLabel: 'Spending limit',
  limitValue: (amount: string) => `Up to ${amount} each spending period`,
  noLimit: 'No limit',
  approvalsLabel: 'Approvals needed',
  recipient: 'Recipient address',
  recipientHelper: 'The Bitcoin Cash address that will receive the money.',
  amount: 'Amount',
  amountHelper: 'Sent from the vault once enough signers approve.',
  amountRequired: 'Enter an amount above 0.',
  overLimit: (amount: string) => `Enter ${amount} or less. That's this vault's spending limit.`,
  overBalance: (amount: string) => `Enter ${amount} or less. That's what this vault holds.`,
  reason: 'What it is for',
  reasonHelper: 'The other signers read this before they approve.',
  reasonPlaceholder: "For example, Sam's design work for October",
  reasonRequired: 'Say what the payment is for.',
  recipientRequired: 'Enter the recipient address.',
  submit: 'Ask for approval',
  errorTitle: "Couldn't create the spending request",
  fixFields: 'Some details need a fix before you can continue.',
  signersOnly: "Only this vault's signers can ask for a payment from it.",
  cantSign: "This wallet can't create spending requests. Connect Paytaca or Cashonize.",
  review: {
    title: 'Ask for this payment?',
    consequence: (required: number) =>
      `Nothing is sent yet. The payment waits until ${required} of the vault's signers approve it.`,
    done: 'Your spending request is ready for the other signers.',
  },
  loadFailedTitle: "This vault didn't load",
} as const;
