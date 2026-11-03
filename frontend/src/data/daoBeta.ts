import type {
  ActivityEvent,
  MemberSignsAs,
  OrganizationAssetKind,
  RecipientStatus,
  RecipientUse,
  RoleAccess,
} from '../copy/organization';
import type { StatusKey } from '../copy/status';

export interface DaoAssetRow {
  id: string;
  symbol: string;
  name: string;
  category: OrganizationAssetKind;
  balance: string;
  valueUsdNumber: number;
  isEstimate: boolean;
  vaults: number;
  ruleId: string | null;
}

export interface DaoVaultRow {
  id: string;
  name: string;
  purpose: string;
  assets: string;
  signersRequired: number;
  signersTotal: number;
  moneyOutPerMonthUsd: number;
}

export type DaoRequestStatus = Extract<StatusKey, 'draft' | 'waitingForApproval' | 'approved'>;

export interface DaoProposalRow {
  id: string;
  title: string;
  ruleId: string | null;
  valueUsd: number;
  asset: string;
  status: DaoRequestStatus;
  note: string;
}

export interface DaoMemberRow {
  id: string;
  name: string;
  roleId: string | null;
  address: string;
  vaults: string;
  available: string;
  repliesWithin: string;
  signsAs: MemberSignsAs;
}

export interface DaoRoleRow {
  id: string;
  name: string;
  access: RoleAccess;
  ruleId: string | null;
  canDo: string;
  looksAfter: string;
}

export interface DaoSpendingRuleRow {
  id: string;
  name: string;
  limitPerPaymentUsd: number;
  dailyLimitUsd: number;
  approvalsNeeded: number;
  signerCount: number;
  waitHours: number;
  assets: string;
}

export interface DaoAssetRuleRow {
  id: string;
  asset: string;
  ruleId: string | null;
  dailyLimitUsd: number | null;
  goesTo: string;
  notes: string;
}

export interface DaoRecipientRow {
  id: string;
  name: string;
  address: string;
  usedFor: RecipientUse;
  assets: string;
  ruleId: string | null;
  status: RecipientStatus;
}

export interface DaoTimelineSeed {
  event: ActivityEvent;
  hoursAgo: number;
}

export interface DaoCashflowSeed {
  monthsAgo: number;
  inflowUsd: number;
  outflowUsd: number;
}

export const RULE_IDS = {
  quick: 'rule-quick',
  standard: 'rule-standard',
  delayed: 'rule-delayed',
  emergency: 'rule-emergency',
} as const;

const ROLE_IDS = {
  financeLead: 'role-finance-lead',
  financeReviewer: 'role-finance-reviewer',
  communityLead: 'role-community-lead',
  securityCouncil: 'role-security-council',
  observer: 'role-observer',
} as const;

export const daoSpendingRules: DaoSpendingRuleRow[] = [
  {
    id: RULE_IDS.quick,
    name: 'Quick',
    limitPerPaymentUsd: 2500,
    dailyLimitUsd: 7500,
    approvalsNeeded: 1,
    signerCount: 3,
    waitHours: 0,
    assets: 'BCH, FGOV',
  },
  {
    id: RULE_IDS.standard,
    name: 'Standard',
    limitPerPaymentUsd: 10000,
    dailyLimitUsd: 20000,
    approvalsNeeded: 2,
    signerCount: 3,
    waitHours: 4,
    assets: 'USDh, BCH',
  },
  {
    id: RULE_IDS.delayed,
    name: 'Delayed',
    limitPerPaymentUsd: 50000,
    dailyLimitUsd: 50000,
    approvalsNeeded: 2,
    signerCount: 3,
    waitHours: 24,
    assets: 'FGOV, grant receipts',
  },
  {
    id: RULE_IDS.emergency,
    name: 'Emergency',
    limitPerPaymentUsd: 15000,
    dailyLimitUsd: 15000,
    approvalsNeeded: 2,
    signerCount: 3,
    waitHours: 12,
    assets: 'BCH, USDh from the security vault only',
  },
];

export const daoAssets: DaoAssetRow[] = [
  {
    id: 'asset-bch',
    symbol: 'BCH',
    name: 'Day-to-day spending',
    category: 'BCH',
    balance: '141.8 BCH',
    valueUsdNumber: 69500,
    isEstimate: false,
    vaults: 4,
    ruleId: RULE_IDS.quick,
  },
  {
    id: 'asset-usdh',
    symbol: 'USDh',
    name: 'Stablecoin for team pay',
    category: 'STABLECOIN',
    balance: '58,400 USDh',
    valueUsdNumber: 58400,
    isEstimate: false,
    vaults: 2,
    ruleId: RULE_IDS.standard,
  },
  {
    id: 'asset-fgov',
    symbol: 'FGOV',
    name: 'Community reward tokens',
    category: 'GOVERNANCE',
    balance: '1,820,000 FGOV',
    valueUsdNumber: 41200,
    isEstimate: false,
    vaults: 1,
    ruleId: RULE_IDS.delayed,
  },
  {
    id: 'asset-receipts',
    symbol: 'Grant receipts',
    name: 'Records of grant milestones',
    category: 'NFT',
    balance: '12 receipts',
    valueUsdNumber: 13800,
    isEstimate: true,
    vaults: 1,
    ruleId: RULE_IDS.delayed,
  },
];

export const daoVaults: DaoVaultRow[] = [
  {
    id: 'vault-core',
    name: 'Core operations',
    purpose: 'Team pay, contractors and servers',
    assets: 'BCH, USDh',
    signersRequired: 2,
    signersTotal: 3,
    moneyOutPerMonthUsd: 7300,
  },
  {
    id: 'vault-incentives',
    name: 'Incentives',
    purpose: 'Contributor and community rewards',
    assets: 'FGOV, BCH',
    signersRequired: 2,
    signersTotal: 3,
    moneyOutPerMonthUsd: 2600,
  },
  {
    id: 'vault-grants',
    name: 'Grants',
    purpose: 'Grants paid by milestone',
    assets: 'BCH, grant receipts',
    signersRequired: 2,
    signersTotal: 3,
    moneyOutPerMonthUsd: 1900,
  },
  {
    id: 'vault-security',
    name: 'Security',
    purpose: 'Incidents, bug bounties and emergencies',
    assets: 'BCH, USDh',
    signersRequired: 1,
    signersTotal: 3,
    moneyOutPerMonthUsd: 1000,
  },
];

export const daoProposals: DaoProposalRow[] = [
  {
    id: 'request-tools-grant',
    title: 'June grant payment for developer tools',
    ruleId: RULE_IDS.delayed,
    valueUsd: 8000,
    asset: 'BCH',
    status: 'waitingForApproval',
    note: 'Needs 1 more approval',
  },
  {
    id: 'request-payroll',
    title: 'Add funds to stablecoin team pay for contributors',
    ruleId: RULE_IDS.standard,
    valueUsd: 5600,
    asset: 'USDh',
    status: 'approved',
    note: 'Approved. Ready to send',
  },
  {
    id: 'request-community',
    title: 'Community rewards for the second quarter',
    ruleId: RULE_IDS.quick,
    valueUsd: 3100,
    asset: 'FGOV',
    status: 'approved',
    note: 'Approved. Ready to send',
  },
  {
    id: 'request-events',
    title: 'Move money into the events fund',
    ruleId: RULE_IDS.standard,
    valueUsd: 2400,
    asset: 'BCH',
    status: 'draft',
    note: 'Being written',
  },
];

export const daoRoles: DaoRoleRow[] = [
  {
    id: ROLE_IDS.financeLead,
    name: 'Finance lead',
    access: 'send',
    ruleId: RULE_IDS.quick,
    canDo: 'Create, approve and send spending requests up to the limit',
    looksAfter: 'Day-to-day payments, adding funds and team pay',
  },
  {
    id: ROLE_IDS.financeReviewer,
    name: 'Finance reviewer',
    access: 'review',
    ruleId: RULE_IDS.standard,
    canDo: 'Review recipients, rules and reports',
    looksAfter: 'Stablecoin payments and accounting checks',
  },
  {
    id: ROLE_IDS.communityLead,
    name: 'Community lead',
    access: 'review',
    ruleId: RULE_IDS.delayed,
    canDo: "Schedule payments, approve them and watch what's locked in contracts",
    looksAfter: 'Rewards, grants and token programs',
  },
  {
    id: ROLE_IDS.securityCouncil,
    name: 'Security council',
    access: 'send',
    ruleId: RULE_IDS.emergency,
    canDo: 'Pause payments, change rules and stop payments to a recipient',
    looksAfter: 'Pausing payments and paying for incidents',
  },
  {
    id: ROLE_IDS.observer,
    name: 'Observer',
    access: 'view',
    ruleId: null,
    canDo: 'View activity',
    looksAfter: 'Activity and monthly numbers',
  },
];

export const daoMembers: DaoMemberRow[] = [
  {
    id: 'member-ade',
    name: 'Ade Nwosu',
    roleId: ROLE_IDS.financeLead,
    address: '',
    vaults: 'Core operations, Security',
    available: 'Weekdays, 8 AM to 6 PM (UTC+1)',
    repliesWithin: '2 hours',
    signsAs: 'main',
  },
  {
    id: 'member-maya',
    name: 'Maya Lee',
    roleId: ROLE_IDS.financeReviewer,
    address: '',
    vaults: 'Core operations, Grants',
    available: 'Weekdays, 9 AM to 5 PM (UTC-8)',
    repliesWithin: '4 hours',
    signsAs: 'main',
  },
  {
    id: 'member-sam',
    name: 'Sam Bell',
    roleId: ROLE_IDS.communityLead,
    address: '',
    vaults: 'Incentives',
    available: 'Every day, 10 AM to 8 PM (UTC)',
    repliesWithin: '6 hours',
    signsAs: 'backup',
  },
  {
    id: 'member-tomas',
    name: 'Tomas Wu',
    roleId: ROLE_IDS.securityCouncil,
    address: '',
    vaults: 'Security',
    available: 'Weekdays, 9 AM to 5 PM (UTC+8)',
    repliesWithin: '1 hour',
    signsAs: 'main',
  },
  {
    id: 'member-lena',
    name: 'Lena Torres',
    roleId: ROLE_IDS.observer,
    address: '',
    vaults: 'All vaults',
    available: 'Weekdays, 8 AM to 4 PM (UTC-5)',
    repliesWithin: 'Daily summary only',
    signsAs: 'viewOnly',
  },
];

export const daoAssetRules: DaoAssetRuleRow[] = [
  {
    id: 'asset-rule-bch',
    asset: 'BCH',
    ruleId: RULE_IDS.quick,
    dailyLimitUsd: 7500,
    goesTo: 'Approved operations and grant recipients',
    notes: 'Flag this if funds cover less than 12 months',
  },
  {
    id: 'asset-rule-usdh',
    asset: 'Stablecoins (USDh)',
    ruleId: RULE_IDS.standard,
    dailyLimitUsd: 20000,
    goesTo: 'Only people on the team pay, vendor or trading partner list',
    notes: "Every payment needs a note saying what it's for",
  },
  {
    id: 'asset-rule-fgov',
    asset: 'Community reward tokens (FGOV)',
    ruleId: RULE_IDS.delayed,
    dailyLimitUsd: 50000,
    goesTo: 'Only reward contracts, community leads or streams',
    notes: 'No payments to trading firms without a spending request',
  },
  {
    id: 'asset-rule-receipts',
    asset: 'Grant receipts',
    ruleId: RULE_IDS.delayed,
    dailyLimitUsd: null,
    goesTo: 'Moves only when a milestone is done or the grant is archived',
    notes: 'Kept as a record of finished milestones',
  },
];

export const daoRecipients: DaoRecipientRow[] = [
  {
    id: 'recipient-payroll',
    name: 'Team pay',
    address: '',
    usedFor: 'payroll',
    assets: 'USDh',
    ruleId: RULE_IDS.standard,
    status: 'approved',
  },
  {
    id: 'recipient-grants',
    name: 'Open source grants',
    address: '',
    usedFor: 'grant',
    assets: 'BCH',
    ruleId: RULE_IDS.delayed,
    status: 'approved',
  },
  {
    id: 'recipient-security',
    name: 'Security incident fund',
    address: '',
    usedFor: 'emergency',
    assets: 'BCH, USDh',
    ruleId: RULE_IDS.emergency,
    status: 'underReview',
  },
];

export const daoTimelineSeed: DaoTimelineSeed[] = [
  { event: { kind: 'payrollScheduled' }, hoursAgo: 3 },
  { event: { kind: 'milestonePaid' }, hoursAgo: 26 },
  { event: { kind: 'roleUpdated', role: 'Security council' }, hoursAgo: 50 },
  { event: { kind: 'reportShared' }, hoursAgo: 74 },
];

export const daoCashflowSeed: DaoCashflowSeed[] = [
  { monthsAgo: 5, inflowUsd: 13500, outflowUsd: 12100 },
  { monthsAgo: 4, inflowUsd: 12000, outflowUsd: 12900 },
  { monthsAgo: 3, inflowUsd: 14200, outflowUsd: 12800 },
  { monthsAgo: 2, inflowUsd: 13100, outflowUsd: 12400 },
  { monthsAgo: 1, inflowUsd: 12400, outflowUsd: 13300 },
  { monthsAgo: 0, inflowUsd: 13900, outflowUsd: 12800 },
];
