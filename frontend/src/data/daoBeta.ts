export interface DaoNavSection {
  path: string;
  label: string;
  description: string;
}

export interface DaoAssetRow {
  symbol: string;
  name: string;
  category: 'BCH' | 'STABLECOIN' | 'GOVERNANCE' | 'NFT';
  balance: string;
  valueUsd: string;
  valueUsdNumber: number;
  allocation: number;
  vaults: number;
  executionLane: string;
}

export interface DaoVaultRow {
  name: string;
  mandate: string;
  assets: string;
  assetsCount: number;
  signers: string;
  monthlyOutflow: string;
  policyStatus: 'Healthy' | 'Watch' | 'Needs Review';
  runway: string;
}

export interface DaoProposalRow {
  title: string;
  lane: string;
  amount: string;
  amountNumber: number;
  asset: string;
  stage: 'Draft' | 'Review' | 'Queued' | 'Ready';
  eta: string;
}

export interface DaoMemberRow {
  name: string;
  role: string;
  wallets: string;
  vaultCoverage: string;
  signingWindow: string;
  responseSla: string;
  status: 'Primary' | 'Backup' | 'Observer';
}

export interface DaoRoleRow {
  role: string;
  members: string;
  scope: string;
  approvalLane: string;
  permissions: string;
  riskTier: 'Critical' | 'Controlled' | 'Observed';
}

export interface DaoPolicyLaneRow {
  lane: string;
  txCap: string;
  dailyCap: string;
  approvers: string;
  executionWindow: string;
  assets: string;
}

export interface DaoGuardrailRow {
  assetClass: string;
  defaultLane: string;
  dailyNetCap: string;
  routingRule: string;
  notes: string;
}

export interface DaoAlert {
  title: string;
  detail: string;
  severity: 'info' | 'watch' | 'critical';
}

export interface DaoTimelineItem {
  title: string;
  detail: string;
  time: string;
}

export const daoNavSections: DaoNavSection[] = [
  {
    path: '/app/dao/overview',
    label: 'Overview',
    description: 'Cross-vault health, exposure, and proposal flow.',
  },
  {
    path: '/app/dao/streams',
    label: 'Streams',
    description: 'Treasury-backed vesting inventory and execution history.',
  },
  {
    path: '/app/dao/team',
    label: 'Team',
    description: 'Wallet owners, signers, and operating coverage.',
  },
  {
    path: '/app/dao/roles',
    label: 'Roles',
    description: 'Permission model, escalation paths, and risk tiers.',
  },
  {
    path: '/app/dao/treasury-policy',
    label: 'Policy',
    description: 'Execution lanes, asset guardrails, and recipient controls.',
  },
];

export const daoSummary = {
  treasuryValue: '$182.9K',
  treasuryValueNumber: 182900,
  activeVaults: 6,
  coveredAssets: 4,
  runway: '14.2 mo',
  runwayMonths: 14.2,
  monthlyOutflow: '$12.8K',
  monthlyOutflowNumber: 12800,
  proposalsInFlight: 7,
  policyCoverage: '93%',
  teamMembers: 18,
  signerCoverage: '24h follow-the-sun',
  whitelistedRecipients: 22,
  emergencyDelay: '12 hrs',
};

export const daoAssets: DaoAssetRow[] = [
  {
    symbol: 'BCH',
    name: 'Core operational reserve',
    category: 'BCH',
    balance: '141.8 BCH',
    valueUsd: '$69.5K',
    valueUsdNumber: 69500,
    allocation: 38,
    vaults: 5,
    executionLane: 'Instant lane',
  },
  {
    symbol: 'USDh',
    name: 'Stablecoin payroll reserve',
    category: 'STABLECOIN',
    balance: '58,400 USDh',
    valueUsd: '$58.4K',
    valueUsdNumber: 58400,
    allocation: 32,
    vaults: 3,
    executionLane: 'Finance lane',
  },
  {
    symbol: 'FGOV',
    name: 'Governance and incentive pool',
    category: 'GOVERNANCE',
    balance: '1.82M FGOV',
    valueUsd: '$41.2K',
    valueUsdNumber: 41200,
    allocation: 23,
    vaults: 2,
    executionLane: 'Timelocked lane',
  },
  {
    symbol: 'Grant NFTs',
    name: 'Milestone receipts and grant proofs',
    category: 'NFT',
    balance: '12 active NFTs',
    valueUsd: 'Non-fungible',
    valueUsdNumber: 13800,
    allocation: 7,
    vaults: 4,
    executionLane: 'Approval-only lane',
  },
];

export const daoVaults: DaoVaultRow[] = [
  {
    name: 'Core Operations Vault',
    mandate: 'Payroll, contractors, infrastructure',
    assets: 'BCH, USDh',
    assetsCount: 2,
    signers: '3 / 5 active',
    monthlyOutflow: '$7.3K',
    policyStatus: 'Healthy',
    runway: '18.1 mo',
  },
  {
    name: 'Protocol Incentives Vault',
    mandate: 'Liquidity mining and contributor rewards',
    assets: 'FGOV, BCH',
    assetsCount: 2,
    signers: '2 / 4 active',
    monthlyOutflow: '$2.6K',
    policyStatus: 'Watch',
    runway: '9.4 mo',
  },
  {
    name: 'Grants Program Vault',
    mandate: 'Milestone-based public goods funding',
    assets: 'BCH, Grant NFTs',
    assetsCount: 2,
    signers: '4 / 6 active',
    monthlyOutflow: '$1.9K',
    policyStatus: 'Healthy',
    runway: '11.8 mo',
  },
  {
    name: 'Security Response Vault',
    mandate: 'Incidents, bug bounties, emergency response',
    assets: 'BCH, USDh',
    assetsCount: 2,
    signers: '2 / 3 active',
    monthlyOutflow: '$1.0K',
    policyStatus: 'Needs Review',
    runway: '22.5 mo',
  },
];

export const daoProposals: DaoProposalRow[] = [
  {
    title: 'June grants tranche for indexer tooling',
    lane: 'Timelocked lane',
    amount: '$8.0K',
    amountNumber: 8000,
    asset: 'BCH',
    stage: 'Review',
    eta: 'Needs 1 signer',
  },
  {
    title: 'Stablecoin payroll refill for contributor ops',
    lane: 'Finance lane',
    amount: '$5.6K',
    amountNumber: 5600,
    asset: 'USDh',
    stage: 'Queued',
    eta: 'Executes in 4 hrs',
  },
  {
    title: 'Delegate incentive batch for Q2',
    lane: 'Instant lane',
    amount: '$3.1K',
    amountNumber: 3100,
    asset: 'FGOV',
    stage: 'Ready',
    eta: 'Ready to broadcast',
  },
  {
    title: 'Bug bounty reserve rotation',
    lane: 'Finance lane',
    amount: '$2.4K',
    amountNumber: 2400,
    asset: 'BCH',
    stage: 'Draft',
    eta: 'Awaiting author',
  },
];

export const daoMembers: DaoMemberRow[] = [
  {
    name: 'Ada Nwosu',
    role: 'Treasury Steward',
    wallets: '2 wallets',
    vaultCoverage: 'Ops, Security',
    signingWindow: 'UTC+1 / 08:00-18:00',
    responseSla: '< 2 hrs',
    status: 'Primary',
  },
  {
    name: 'Marcus Lee',
    role: 'Finance Reviewer',
    wallets: '1 wallet',
    vaultCoverage: 'Ops, Grants',
    signingWindow: 'UTC-8 / 09:00-17:00',
    responseSla: '< 4 hrs',
    status: 'Primary',
  },
  {
    name: 'Chioma Bell',
    role: 'Protocol Delegate',
    wallets: '3 wallets',
    vaultCoverage: 'Incentives',
    signingWindow: 'UTC+0 / 10:00-20:00',
    responseSla: '< 6 hrs',
    status: 'Backup',
  },
  {
    name: 'Jonas Wu',
    role: 'Security Council',
    wallets: '2 wallets',
    vaultCoverage: 'Security',
    signingWindow: 'UTC+8 / 09:00-17:00',
    responseSla: '< 1 hr',
    status: 'Primary',
  },
  {
    name: 'Mina Torres',
    role: 'Ops Observer',
    wallets: '1 wallet',
    vaultCoverage: 'All vaults',
    signingWindow: 'UTC-5 / 08:00-16:00',
    responseSla: 'Digest only',
    status: 'Observer',
  },
];

export const daoRoles: DaoRoleRow[] = [
  {
    role: 'Treasury Steward',
    members: '4 members',
    scope: 'Daily ops, refills, recurring payouts',
    approvalLane: 'Instant / Finance',
    permissions: 'Create, approve, broadcast within cap',
    riskTier: 'Critical',
  },
  {
    role: 'Finance Reviewer',
    members: '3 members',
    scope: 'Stablecoin movements, accounting checks',
    approvalLane: 'Finance lane',
    permissions: 'Review routing, recipient policy, reports',
    riskTier: 'Controlled',
  },
  {
    role: 'Protocol Delegate',
    members: '6 members',
    scope: 'Incentives, grants, token programs',
    approvalLane: 'Timelocked lane',
    permissions: 'Queue, co-sign, monitor lockups',
    riskTier: 'Controlled',
  },
  {
    role: 'Security Council',
    members: '2 members',
    scope: 'Emergency pause, incident spend',
    approvalLane: 'Emergency lane',
    permissions: 'Pause, rotate lanes, freeze recipients',
    riskTier: 'Critical',
  },
  {
    role: 'Observer',
    members: '3 members',
    scope: 'Audit trail and reporting',
    approvalLane: 'No execution rights',
    permissions: 'Read-only dashboards and exports',
    riskTier: 'Observed',
  },
];

export const daoPolicyLanes: DaoPolicyLaneRow[] = [
  {
    lane: 'Instant lane',
    txCap: '$2.5K',
    dailyCap: '$7.5K',
    approvers: '2 of 4 stewards',
    executionWindow: 'Immediate',
    assets: 'BCH, FGOV',
  },
  {
    lane: 'Finance lane',
    txCap: '$10K',
    dailyCap: '$20K',
    approvers: '3 of 5 reviewers',
    executionWindow: '4-hour cooling-off',
    assets: 'USDh, BCH',
  },
  {
    lane: 'Timelocked lane',
    txCap: '$50K',
    dailyCap: '$50K',
    approvers: '4 of 7 delegates',
    executionWindow: '24-hour delay',
    assets: 'FGOV, grant allocations',
  },
  {
    lane: 'Emergency lane',
    txCap: '$15K',
    dailyCap: '$15K',
    approvers: '2 of 2 security council',
    executionWindow: '12-hour delay',
    assets: 'Security reserve only',
  },
];

export const daoGuardrails: DaoGuardrailRow[] = [
  {
    assetClass: 'BCH reserves',
    defaultLane: 'Instant lane',
    dailyNetCap: '$7.5K',
    routingRule: 'Can flow directly to whitelisted ops and grants recipients',
    notes: 'Auto-flags if runway drops below 12 months',
  },
  {
    assetClass: 'CashToken stablecoins',
    defaultLane: 'Finance lane',
    dailyNetCap: '$20K',
    routingRule: 'Recipient must be on payroll, vendor, or OTC list',
    notes: 'Requires memo and settlement tag on every outbound',
  },
  {
    assetClass: 'Governance tokens',
    defaultLane: 'Timelocked lane',
    dailyNetCap: '$50K',
    routingRule: 'Only incentive contracts, delegates, or vesting vaults',
    notes: 'No direct market-maker transfers without proposal review',
  },
  {
    assetClass: 'NFT receipts and grants',
    defaultLane: 'Approval-only lane',
    dailyNetCap: 'N/A',
    routingRule: 'Movement tied to milestone or archive action only',
    notes: 'Preserved for audit history and completion proofs',
  },
];

export const daoAlerts: DaoAlert[] = [
  {
    title: 'Security vault policy drift',
    detail: 'Emergency lane still references an outdated recipient whitelist from last quarter.',
    severity: 'critical',
  },
  {
    title: 'Incentive vault runway compressed',
    detail: 'Governance token emissions will fall below the target runway in 46 days.',
    severity: 'watch',
  },
  {
    title: 'Stablecoin payroll reserve healthy',
    detail: 'Current USDh balance covers the next 4 payroll cycles without rotation.',
    severity: 'info',
  },
];

export const daoTimeline: DaoTimelineItem[] = [
  {
    title: 'Finance lane refill queued',
    detail: 'USDh moved from Treasury Hub into Ops vault with 4-hour cooling-off.',
    time: 'Today, 09:20 UTC',
  },
  {
    title: 'Grant milestone released',
    detail: 'Second tranche for BCH indexer modernization passed review and executed.',
    time: 'Yesterday, 17:40 UTC',
  },
  {
    title: 'Security council rotated signer',
    detail: 'Backup signer promoted after incident-response drill.',
    time: '2 days ago',
  },
  {
    title: 'Treasury export generated',
    detail: 'Monthly cash flow package shared with contributors and delegates.',
    time: '3 days ago',
  },
];
