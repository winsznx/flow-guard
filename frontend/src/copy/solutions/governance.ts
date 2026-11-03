import { SIGNERS, VAULT_FACTS } from './budgeting';
import {
  APP_PATHS,
  CLOSING_FACTS,
  CONTRACT_SOURCE,
  FACT_LABELS,
  MARKETING_COPY,
  MARKETING_PATHS,
  NETWORK_WORD,
  VAULT_SENDING,
  appLink,
  type SolutionPageCopy,
} from './shared';

const APPROVALS_ANCHOR = 'one-signer';

export const GOVERNANCE: SolutionPageCopy = {
  hero: {
    eyebrow: 'Group approvals',
    headline: 'Decide together',
    accent: 'how shared money is spent.',
    lead: "A vault's signers approve every payment from it in their own wallets. Nothing leaves until enough of them do.",
    primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.createVault) },
    secondary: { label: 'How approvals work', href: `#${APPROVALS_ANCHOR}` },
    note: MARKETING_COPY.whatYouNeed,
    visual: { kind: 'approvals', meter: { required: 2, signers: SIGNERS } },
  },
  steps: [
    {
      title: 'A signer asks for a payment',
      body: 'They make a spending request with the recipient, the amount and a reason.',
    },
    {
      title: 'Other signers approve',
      body: "Each signer approves in their own wallet. The vault's page shows who approved and when.",
    },
    {
      title: 'Two signers send it',
      body: VAULT_SENDING,
    },
  ],
  decide: [
    { label: 'Signers', value: 'Three wallets, chosen when you create the vault.' },
    { label: 'Approvals', value: '1 or 2 of 3 signers, chosen when you create the vault.' },
    { label: 'Spending limit', value: 'Optional cap on what can leave the vault each period.' },
  ],
  facts: {
    eyebrow: 'Vault approvals',
    network: NETWORK_WORD,
    rows: [
      { label: FACT_LABELS.whoCanMove, value: VAULT_FACTS.whoCanMove },
      { label: FACT_LABELS.sending, value: VAULT_SENDING },
      { label: FACT_LABELS.pausing, value: VAULT_FACTS.pausing },
    ],
  },
  source: CONTRACT_SOURCE.vaults,
  goodToKnow: [
    "A vault's signers are set when you create it and can't be changed later.",
    VAULT_SENDING,
    'Any one signer can pause the vault if something looks wrong. Starting it again needs the approvals you chose.',
  ],
  faq: [
    {
      id: APPROVALS_ANCHOR,
      question: 'Can one signer send money alone?',
      answer: 'Not if the vault needs 2 of 3 approvals, which you choose when you create it. One signer can always pause the vault.',
    },
    {
      id: 'signers-disagree',
      question: 'What if the signers disagree?',
      answer: "A spending request that doesn't get the approvals the vault needs is never sent. Nothing moves.",
    },
  ],
  closing: {
    headline: 'Share money',
    accent: 'with people you trust.',
    lead: 'Each signer keeps their own wallet. No payment leaves without the approvals you chose.',
    primary: { label: 'Create vault', href: appLink(APP_PATHS.createVault) },
    secondary: { label: 'Read about vaults', href: MARKETING_PATHS.budgeting },
    facts: CLOSING_FACTS,
  },
};
