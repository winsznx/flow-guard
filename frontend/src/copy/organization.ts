import { formatCount, plural } from './format';
import { NETWORK_NAME } from './network';

export type MemberSignsAs = 'main' | 'backup' | 'viewOnly';
export type RoleAccess = 'send' | 'review' | 'view';
export type RecipientStatus = 'approved' | 'underReview' | 'blocked';
export type RecipientUse = 'payroll' | 'vendor' | 'grant' | 'community' | 'emergency';
export type OrganizationAssetKind = 'BCH' | 'STABLECOIN' | 'GOVERNANCE' | 'NFT';

const SAMPLE_ONLY = 'Sample only. Saved in this browser and not sent to anyone.';
const ONLY_THIS_BROWSER = 'This only changes the sample data in this browser.';

export const ORG_PAGES = {
  overview: {
    title: 'Overview',
    documentTitle: 'Organization overview',
    description:
      "A shared space for your team's vaults and people. It shows sample data while in beta.",
  },
  streams: {
    title: 'Vault streams',
    description: 'Streams listed under the vaults you created or sign for.',
  },
  team: {
    title: 'Team',
    description: 'People in your organization and what they can do. Sample data while in beta.',
  },
  roles: {
    title: 'Roles',
    description: "Named sets of permissions for your team. They don't control any vault yet.",
  },
  rules: {
    title: 'Spending rules',
    description: "Limits you plan for vault spending. They're planned, not enforced.",
  },
} as const;

export const ORG_TABS_LABEL = 'Organization pages';

/** One line per Organization page, for cards that link to them. */
export const ORG_SECTION_LINES = {
  overview: 'Money in and out, and open spending requests.',
  streams: 'Streams listed under the vaults you created or sign for.',
  team: 'Who can sign, and when.',
  roles: 'What each role can do.',
  rules: 'Limits, wait times and approved recipients.',
} as const;

export const SAMPLE = {
  tag: 'Sample',
  savedHere: SAMPLE_ONLY,
  reset: {
    action: 'Reset sample data',
    title: 'Reset the sample data?',
    body: `Your changes to the team, roles and spending rules in this browser go back to the original examples. Nothing on ${NETWORK_NAME} changes.`,
    keep: 'Keep my changes',
    busy: 'Resetting',
    done: 'Sample data reset',
  },
} as const;

export function sampleLine(detail: string): string {
  return `${SAMPLE.tag} · ${detail}`;
}

export const DIALOG = {
  save: 'Save changes',
  saving: 'Saving',
  none: 'None',
  noRole: 'No role',
  nameMissing: 'Add a name',
} as const;

export function usd(value: number): string {
  return Math.round(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function memberCount(n: number): string {
  return formatCount(n, 'member', 'members');
}

export const ASSET_KIND_WORD: Record<OrganizationAssetKind, string> = {
  BCH: 'BCH',
  STABLECOIN: 'Stablecoin',
  GOVERNANCE: 'Voting token',
  NFT: 'Grant receipt',
};

export const OVERVIEW = {
  stats: {
    label: 'Organization at a glance',
    totalValue: 'Total value',
    moneyOut: 'Money out per month',
    lasts: 'If nothing more came in',
    openRequests: 'Open spending requests',
  },
  inVaults: (n: number) => sampleLine(`in ${formatCount(n, 'vault', 'vaults')}`),
  atMonthlyOut: (amount: string) => sampleLine(`at ${amount} a month out`),
  months: (n: number) => formatCount(n, 'month', 'months'),
  waiting: (n: number) => sampleLine(`${n} waiting for approval`),
  holdings: {
    title: 'What the organization has',
    description: 'Each asset and its share of the total value.',
    listLabel: 'Assets the organization has',
    asset: 'Asset',
    amount: 'Amount',
    value: 'Value (USD)',
    share: 'Share',
    estimate: 'Estimate',
    inVaults: (n: number) => `In ${formatCount(n, 'vault', 'vaults')}`,
    empty: 'No assets yet',
    emptyLine: 'Assets in this sample show here.',
  },
  moneyInOut: {
    title: 'Money in and out',
    description: 'The last 6 months. Net change is money in minus money out.',
    listLabel: 'Money in and out by month',
    month: 'Month',
    inAndOut: (moneyIn: string, moneyOut: string) => `In ${moneyIn} · Out ${moneyOut}`,
    net: 'Net change',
    moreIn: (amount: string) => `${amount} more in`,
    moreOut: (amount: string) => `${amount} more out`,
    even: 'Even',
  },
  vaults: {
    title: 'Vaults',
    description: 'The vaults in this sample, what each one pays for and who must approve.',
    listLabel: 'Sample vaults',
    vault: 'Vault',
    assets: 'Assets',
    approvals: 'Approvals',
    moneyOut: 'Money out per month',
    outAMonth: 'out a month',
    mustApprove: (required: number, total: number) =>
      `${required} of ${total} signers must approve`,
    empty: 'No vaults yet',
    emptyLine: 'Vaults in this sample show here.',
  },
  requests: {
    title: 'Spending requests',
    description:
      'Payments from vaults that wait until enough signers approve. These are examples, so nothing here can be sent.',
    listLabel: 'Sample spending requests',
    request: 'Request',
    status: 'Status',
    value: 'Value (USD)',
    note: 'Note',
    empty: 'No spending requests yet',
    emptyLine: 'Spending requests in this sample show here.',
  },
  activity: {
    title: 'Recent activity',
    description: 'Changes to this sample, newest first.',
    empty: 'No activity yet.',
  },
} as const;

export const SIGNS_AS_WORD: Record<MemberSignsAs, string> = {
  main: 'Main signer',
  backup: 'Backup signer',
  viewOnly: 'View only',
};

export const TEAM = {
  add: 'Add member',
  stats: {
    members: 'Members',
    main: 'Main signers',
    backup: 'Backup signers',
    viewOnly: 'View only',
  },
  listLabel: 'Team members',
  columns: {
    member: 'Member',
    signsAs: 'Signs as',
    vaults: 'Vaults they look after',
    available: 'Available to sign',
    replies: 'Replies within',
    address: 'Address',
  },
  noAddress: 'No address yet',
  empty: {
    title: 'No members yet',
    description: 'Add the people who can sign or view.',
  },
  dialog: {
    addTitle: 'Add a member',
    editTitle: 'Edit member',
    line: SAMPLE_ONLY,
    create: 'Add member',
    adding: 'Adding',
  },
  fields: {
    name: 'Name',
    namePlaceholder: 'For example: Sam Bell',
    role: 'Role',
    address: 'Wallet address',
    addressHelper: 'The address this person signs with. Only this sample uses it.',
    vaults: 'Vaults they look after',
    vaultsPlaceholder: 'For example: Core operations, Grants',
    available: 'Available to sign',
    availablePlaceholder: 'For example: weekdays, 8 AM to 6 PM',
    replies: 'Usually replies within',
    repliesPlaceholder: 'For example: 4 hours',
    signsAs: 'Signs as',
  },
  remove: {
    action: 'Remove member',
    title: (name: string) => `Remove ${name}?`,
    body: (name: string) => `${name} comes off this sample team. ${ONLY_THIS_BROWSER}`,
    keep: 'Keep member',
    busy: 'Removing',
    done: 'Member removed',
  },
  help: {
    title: 'Before someone can sign',
    lines: [
      "A vault's signers are set when it's created and can't be changed later.",
      'Plan which vaults each person signs for before you create them.',
      "View-only members can see the activity but can't sign.",
      'Every signer should know which assets they can send and the limits.',
    ],
  },
} as const;

export const ACCESS_WORD: Record<RoleAccess, string> = {
  send: 'Can send funds',
  review: 'Can review',
  view: 'View only',
};

export const ROLES = {
  add: 'Add role',
  stats: {
    roles: 'Roles',
    send: 'Can send funds',
    review: 'Can review',
    view: 'View only',
  },
  listLabel: 'Roles',
  columns: {
    role: 'Role',
    access: 'Access level',
    canDo: 'Can do',
    rule: 'Spending rule',
    members: 'Members',
  },
  empty: {
    title: 'No roles yet',
    description: 'Add a role to say what someone can do.',
  },
  dialog: {
    addTitle: 'Add a role',
    editTitle: 'Edit role',
    line: "Sample only. Roles here don't change who can sign a vault.",
    create: 'Add role',
    adding: 'Adding',
  },
  fields: {
    name: 'Role name',
    namePlaceholder: 'For example: Finance lead',
    access: 'Access level',
    rule: 'Spending rule',
    canDo: 'What this role can do',
    canDoPlaceholder: 'For example: approve, send, export reports',
    looksAfter: 'What this role looks after',
    looksAfterPlaceholder: 'For example: monthly team pay and adding funds',
  },
  remove: {
    action: 'Remove role',
    title: (name: string) => `Remove the ${name} role?`,
    body: (holders: number) =>
      holders > 0
        ? `${formatCount(holders, 'member has', 'members have')} this role. They'll show "No role" until you pick a new one. ${ONLY_THIS_BROWSER}`
        : ONLY_THIS_BROWSER,
    keep: 'Keep role',
    busy: 'Removing',
    done: 'Role removed',
  },
  help: {
    title: 'Good practice',
    lines: [
      "Don't let one role create, approve and send large payments alone.",
      'Plan which assets each role may send and up to what amount.',
      'Plan stablecoin and BCH payments under separate rules.',
      'Keep emergency powers small, and write down who used them.',
      'View-only members should never be able to send funds.',
    ],
  },
} as const;

export const RECIPIENT_STATUS_WORD: Record<RecipientStatus, string> = {
  approved: 'Approved',
  underReview: 'Under review',
  blocked: 'Blocked',
};

export const RECIPIENT_USE_WORD: Record<RecipientUse, string> = {
  payroll: 'Team pay',
  vendor: 'Vendor',
  grant: 'Grant',
  community: 'Community',
  emergency: 'Emergency',
};

export function waitWords(hours: number): string {
  return hours === 0 ? 'No wait' : `Waits ${formatCount(hours, 'hour', 'hours')}`;
}

export function hoursWords(hours: number): string {
  return hours === 0 ? 'No wait' : formatCount(hours, 'hour', 'hours');
}

export function approvalsWords(required: number, total: number): string {
  return `${required} of ${total} ${plural(total, 'signer', 'signers')}`;
}

export const RULES = {
  add: 'Add rule',
  stats: {
    rules: 'Spending rules',
    recipients: 'Approved recipients',
    emergencyWait: 'Emergency wait',
    assetRules: 'Asset rules',
  },
  notice: {
    title: "These rules don't protect any vault yet",
    body: "A vault's real rule is how many of its signers must approve each payment. You choose it when you create the vault.",
    action: 'Go to vaults',
  },
  noLimit: 'No limit set',
  noDailyLimit: 'No daily limit',
  upTo: 'Up to',
  each: 'each',
  list: {
    title: 'Spending rules',
    description: 'Limits, approvals and wait times for payments under each rule.',
    listLabel: 'Spending rules',
    rule: 'Spending rule',
    approvals: 'Approvals needed',
    perPayment: 'Limit per payment',
    daily: 'Daily limit',
    wait: 'Wait before sending',
  },
  empty: {
    title: 'No spending rules yet',
    description: 'Add a rule to plan limits and wait times for vault payments.',
  },
  dialog: {
    addTitle: 'Add a spending rule',
    editTitle: 'Edit spending rule',
    line: 'Set the limits, approvals and wait time for payments under this rule. Sample only.',
    create: 'Add rule',
    adding: 'Adding',
  },
  fields: {
    name: 'Rule name',
    namePlaceholder: 'For example: Standard',
    approvals: 'Approvals needed',
    signers: 'Out of how many signers',
    perPayment: 'Limit per payment (USD)',
    daily: 'Daily limit (USD)',
    limitPlaceholder: 'For example: 2500',
    wait: 'Wait before sending (hours)',
    waitHelper: 'Use 0 for no wait.',
    assets: 'Assets',
    assetsPlaceholder: 'For example: BCH, USDh',
  },
  errors: {
    approvals: 'Enter a whole number of approvals, 1 or more',
    signers: (required: number) => `Enter ${required} or more, at least the approvals needed`,
    limit: 'Enter an amount of 0 or more in USD',
    wait: 'Enter a whole number of hours, 0 or more',
  },
  remove: {
    action: 'Remove rule',
    title: (name: string) => `Remove the ${name} rule?`,
    body: `Roles, asset rules and recipients that use it will show None. ${ONLY_THIS_BROWSER}`,
    keep: 'Keep rule',
    busy: 'Removing',
    done: 'Spending rule removed',
  },
  assets: {
    title: 'Asset rules',
    description: 'Where each asset can go and how much can leave each day.',
    listLabel: 'Asset rules',
    asset: 'Asset',
    defaultRule: 'Default spending rule',
    daily: 'Daily limit',
    goesTo: 'Who it can go to',
    editTitle: 'Edit asset rule',
    line: 'Where this asset can go and how much can leave each day. Sample only.',
    goesToPlaceholder: 'For example: approved team members only',
    notes: 'Notes',
    dailyHelper: 'Leave empty for no limit.',
  },
  recipients: {
    title: 'Recipients',
    description:
      'Addresses the organization pays often, the assets they can receive and the rule that applies.',
    listLabel: 'Recipients',
    add: 'Add recipient',
    recipient: 'Recipient',
    address: 'Address',
    assets: 'Assets',
    rule: 'Spending rule',
    status: 'Status',
    noAddress: 'No address yet',
    empty: 'No recipients yet',
    emptyLine: 'Add the addresses the organization pays often, like team members or vendors.',
    addTitle: 'Add a recipient',
    editTitle: 'Edit recipient',
    line: 'Sample only. Saved in this browser and never used to send money.',
    create: 'Add recipient',
    adding: 'Adding',
    name: 'Recipient name',
    namePlaceholder: 'For example: Team pay',
    addressLabel: 'Address',
    addressHelper: 'Where payments to this recipient would go. You can add it later.',
    addressMissing: 'Add an address',
    usedFor: 'Used for',
    statusHelper: 'New recipients start under review.',
    newAddressHelper: 'Where payments to this recipient would go.',
  },
  removeRecipient: {
    action: 'Remove recipient',
    title: (name: string) => `Remove ${name}?`,
    body: (name: string) => `${name} comes off the recipients. ${ONLY_THIS_BROWSER}`,
    keep: 'Keep recipient',
    busy: 'Removing',
    done: 'Recipient removed',
  },
  help: {
    title: 'Good practice',
    lines: [
      'Plan which assets each rule covers and up to what amount.',
      'Ask for a note saying what each stablecoin payment is for.',
      'Plan a wait for voting token payments so members can review them first.',
      'Keep grant receipts as records. Move them only when a milestone is done.',
    ],
  },
} as const;

export const STREAM_SCHEDULE_WORD: Record<string, string> = {
  LINEAR: 'Evenly over time',
  RECURRING: 'Same amount each time',
  STEP: 'Same amount each time',
  TRANCHE: 'Custom dates',
  HYBRID: 'Part now, the rest over time',
};

export const VAULT_STREAMS = {
  create: 'Create stream',
  payMany: 'Pay many people',
  filterLabel: 'Filter by status',
  filterAll: 'All',
  noResultsThing: 'vault streams',
  listLabel: 'Vault streams',
  stats: {
    total: 'Vault streams',
    active: 'Active',
    ready: 'Ready to claim',
  },
  tokenNote: (n: number) =>
    `BCH only. Doesn't include ${formatCount(n, 'token stream', 'token streams')}.`,
  columns: {
    stream: 'Stream',
    status: 'Status',
    total: 'Total',
    ready: 'Ready to claim',
    last: 'Last activity',
  },
  streamTo: (shortAddress: string) => `Stream to ${shortAddress}`,
  noActivity: 'No activity yet',
  starts: (date: string) => `Starts ${date}`,
  otherSchedule: 'Custom schedule',
  batches: 'Past batches',
  empty: {
    title: 'No vault streams yet',
    description:
      "A vault stream pays someone bit by bit and shows on the vault's page. The money comes from your wallet.",
  },
  error: {
    title: "Vault streams didn't load",
    reason: 'Check your connection and try again.',
  },
} as const;

/** Context the stream builders show and save when someone starts from the Organization workspace. */
export const ORG_LAUNCH = {
  title: 'Started from the Organization workspace',
  stream: 'This stream will be listed under the vault you pick. The money comes from your wallet.',
  batch: 'These streams will be listed under the vault you pick. The money comes from your wallet.',
  existing: 'This stream was started from the Organization workspace.',
} as const;

export type ActivityEvent =
  | { kind: 'payrollScheduled' }
  | { kind: 'milestonePaid' }
  | { kind: 'reportShared' }
  | { kind: 'memberAdded'; name: string; role: string | null }
  | { kind: 'memberUpdated'; name: string }
  | { kind: 'memberRemoved'; name: string }
  | { kind: 'roleAdded'; role: string }
  | { kind: 'roleUpdated'; role: string }
  | { kind: 'roleRemoved'; role: string }
  | { kind: 'ruleAdded'; rule: string; waitHours: number }
  | { kind: 'ruleUpdated'; rule: string }
  | { kind: 'ruleRemoved'; rule: string }
  | { kind: 'assetRuleUpdated'; asset: string }
  | { kind: 'recipientAdded'; name: string }
  | { kind: 'recipientUpdated'; name: string }
  | { kind: 'recipientRemoved'; name: string };

export const ACTIVITY = {
  memberAdded: 'Member added',
  memberUpdated: 'Member updated',
  memberRemoved: 'Member removed',
  roleAdded: 'Role added',
  roleUpdated: 'Role updated',
  roleRemoved: 'Role removed',
  ruleAdded: 'Spending rule added',
  ruleUpdated: 'Spending rule updated',
  ruleRemoved: 'Spending rule removed',
  assetRuleUpdated: 'Asset rule updated',
  recipientAdded: 'Recipient added',
  recipientUpdated: 'Recipient updated',
  recipientRemoved: 'Recipient removed',
} as const;

export function activityText(event: ActivityEvent): { title: string; detail: string } {
  switch (event.kind) {
    case 'payrollScheduled':
      return {
        title: 'Pay many people set up',
        detail: 'Streams for six contributors were listed under the Core operations vault. The money came from a wallet.',
      };
    case 'milestonePaid':
      return {
        title: 'Grant milestone paid',
        detail: 'The second payment for the BCH developer tools grant was approved and sent.',
      };
    case 'reportShared':
      return {
        title: 'Monthly report shared',
        detail: 'The money in and out report went to contributors.',
      };
    case 'memberAdded':
      return {
        title: ACTIVITY.memberAdded,
        detail: `${event.name} added as ${event.role ?? DIALOG.noRole}.`,
      };
    case 'memberUpdated':
      return { title: ACTIVITY.memberUpdated, detail: `${event.name}'s details updated.` };
    case 'memberRemoved':
      return { title: ACTIVITY.memberRemoved, detail: `${event.name} removed from the team.` };
    case 'roleAdded':
      return { title: ACTIVITY.roleAdded, detail: `${event.role} role added.` };
    case 'roleUpdated':
      return { title: ACTIVITY.roleUpdated, detail: `${event.role} permissions updated.` };
    case 'roleRemoved':
      return { title: ACTIVITY.roleRemoved, detail: `${event.role} role removed.` };
    case 'ruleAdded':
      return {
        title: ACTIVITY.ruleAdded,
        detail: `${event.rule} added. ${waitWords(event.waitHours)}.`,
      };
    case 'ruleUpdated':
      return { title: ACTIVITY.ruleUpdated, detail: `${event.rule} limits updated.` };
    case 'ruleRemoved':
      return { title: ACTIVITY.ruleRemoved, detail: `${event.rule} removed.` };
    case 'assetRuleUpdated':
      return { title: ACTIVITY.assetRuleUpdated, detail: `Rule for ${event.asset} updated.` };
    case 'recipientAdded':
      return { title: ACTIVITY.recipientAdded, detail: `${event.name} added to recipients.` };
    case 'recipientUpdated':
      return { title: ACTIVITY.recipientUpdated, detail: `${event.name}'s details updated.` };
    case 'recipientRemoved':
      return { title: ACTIVITY.recipientRemoved, detail: `${event.name} removed from recipients.` };
  }
}
