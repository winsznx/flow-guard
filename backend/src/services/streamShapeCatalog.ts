export type StreamScheduleTemplateId =
  | 'linear-open'
  | 'linear-cliff'
  | 'hybrid-upfront-linear'
  | 'hybrid-cliff-linear'
  | 'recurring-open-weekly'
  | 'recurring-open-monthly'
  | 'recurring-weekly'
  | 'recurring-monthly'
  | 'recurring-quarterly'
  | 'step-timelock'
  | 'step-double-unlock'
  | 'step-monthly'
  | 'step-quarterly-cliff'
  | 'tranche-backweighted'
  | 'tranche-frontloaded'
  | 'tranche-cliff-staged'
  | 'tranche-monthly-runway'
  | 'tranche-performance-ladder';

export interface StreamScheduleTemplateDefinition {
  id: StreamScheduleTemplateId;
  title: string;
  eyebrow: string;
  description: string;
  streamType: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
  contractFamily: 'VestingCovenant' | 'RecurringPaymentCovenant' | 'TrancheVestingCovenant' | 'HybridVestingCovenant';
  durationDays: number;
  cliffDays: number;
  recurringIntervalDays?: number;
  stepIntervalDays?: number;
  hybridUnlockDays?: number;
  hybridUnlockPercent?: number;
  trancheOffsetsDays?: number[];
  tranchePercentages?: number[];
  refillable?: boolean;
  supportsTokens: boolean;
  tags: string[];
}

export const streamScheduleTemplates: StreamScheduleTemplateDefinition[] = [
  {
    id: 'linear-open',
    title: 'Open vesting',
    eyebrow: 'Linear',
    description: 'Continuous vesting from day one with no cliff.',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    durationDays: 180,
    cliffDays: 0,
    supportsTokens: true,
    tags: ['continuous', 'team', 'grants'],
  },
  {
    id: 'linear-cliff',
    title: 'Contributor vesting',
    eyebrow: 'Linear + Cliff',
    description: 'Continuous vesting with an initial cliff release.',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    durationDays: 365,
    cliffDays: 90,
    supportsTokens: true,
    tags: ['cliff', 'contributors', 'investors'],
  },
  {
    id: 'hybrid-upfront-linear',
    title: 'Upfront unlock + linear vesting',
    eyebrow: 'Hybrid',
    description: 'Release a fixed upfront percentage at one checkpoint, then vest the remainder linearly to the end.',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    durationDays: 365,
    cliffDays: 0,
    hybridUnlockDays: 90,
    hybridUnlockPercent: 25,
    supportsTokens: true,
    tags: ['hybrid', 'upfront', 'contributors'],
  },
  {
    id: 'hybrid-cliff-linear',
    title: 'Cliff unlock + linear tail',
    eyebrow: 'Hybrid + Cliff',
    description: 'Hold value until a cliff date, unlock a larger first tranche, then vest the balance linearly through completion.',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    durationDays: 540,
    cliffDays: 0,
    hybridUnlockDays: 180,
    hybridUnlockPercent: 40,
    supportsTokens: true,
    tags: ['hybrid', 'cliff', 'investors'],
  },
  {
    id: 'recurring-open-weekly',
    title: 'Weekly runway',
    eyebrow: 'Recurring + Refillable',
    description: 'Open-ended weekly payroll that can be refilled without redeploying the stream.',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    durationDays: 84,
    cliffDays: 0,
    recurringIntervalDays: 7,
    refillable: true,
    supportsTokens: true,
    tags: ['weekly', 'payroll', 'refillable'],
  },
  {
    id: 'recurring-open-monthly',
    title: 'Monthly runway',
    eyebrow: 'Recurring + Refillable',
    description: 'Open-ended monthly payroll or grant stream with top-up runway management.',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    durationDays: 180,
    cliffDays: 0,
    recurringIntervalDays: 30,
    refillable: true,
    supportsTokens: true,
    tags: ['monthly', 'runway', 'refillable'],
  },
  {
    id: 'recurring-weekly',
    title: 'Weekly payroll',
    eyebrow: 'Recurring',
    description: 'Fixed weekly releases for payroll, retainers, and allowances.',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    durationDays: 84,
    cliffDays: 0,
    recurringIntervalDays: 7,
    supportsTokens: true,
    tags: ['weekly', 'payroll', 'allowance'],
  },
  {
    id: 'recurring-monthly',
    title: 'Monthly payroll',
    eyebrow: 'Recurring',
    description: 'Fixed monthly releases across a six-month schedule.',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    durationDays: 180,
    cliffDays: 0,
    recurringIntervalDays: 30,
    supportsTokens: true,
    tags: ['monthly', 'salary', 'ops'],
  },
  {
    id: 'recurring-quarterly',
    title: 'Quarterly disbursements',
    eyebrow: 'Recurring',
    description: 'One fixed release every quarter for grants, board stipends, or ops budgets.',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    durationDays: 360,
    cliffDays: 0,
    recurringIntervalDays: 90,
    supportsTokens: true,
    tags: ['quarterly', 'board', 'grants'],
  },
  {
    id: 'tranche-backweighted',
    title: 'Backweighted unlocks',
    eyebrow: 'Custom Tranches',
    description: 'A staged vesting plan with increasing unlocks as the schedule matures.',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    durationDays: 360,
    cliffDays: 0,
    trancheOffsetsDays: [30, 120, 240, 360],
    tranchePercentages: [10, 20, 30, 40],
    supportsTokens: true,
    tags: ['backweighted', 'contributors', 'custom'],
  },
  {
    id: 'tranche-frontloaded',
    title: 'Frontloaded release',
    eyebrow: 'Custom Tranches',
    description: 'Unlock more value earlier, then taper the remaining allocation across later checkpoints.',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    durationDays: 240,
    cliffDays: 0,
    trancheOffsetsDays: [30, 90, 150, 240],
    tranchePercentages: [40, 30, 20, 10],
    supportsTokens: true,
    tags: ['frontloaded', 'launch', 'custom'],
  },
  {
    id: 'tranche-cliff-staged',
    title: 'Cliff then staged unlocks',
    eyebrow: 'Custom Tranches',
    description: 'Hold all value behind an initial cliff, then release staged tranches through the remainder of the term.',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    durationDays: 360,
    cliffDays: 90,
    trancheOffsetsDays: [90, 180, 270, 360],
    tranchePercentages: [25, 25, 25, 25],
    supportsTokens: true,
    tags: ['cliff', 'staged', 'custom'],
  },
  {
    id: 'tranche-monthly-runway',
    title: 'Monthly staged runway',
    eyebrow: 'Custom Tranches',
    description: 'Eight monthly unlock checkpoints for more granular treasury, contributor, or grant releases.',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    durationDays: 240,
    cliffDays: 0,
    trancheOffsetsDays: [30, 60, 90, 120, 150, 180, 210, 240],
    tranchePercentages: [10, 10, 10, 10, 12, 12, 16, 20],
    supportsTokens: true,
    tags: ['monthly', 'granular', 'custom'],
  },
  {
    id: 'tranche-performance-ladder',
    title: 'Performance ladder',
    eyebrow: 'Custom Tranches',
    description: 'A seven-stage unlock ladder for milestone-heavy contributor, grants, or incentive plans.',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    durationDays: 420,
    cliffDays: 0,
    trancheOffsetsDays: [30, 90, 150, 210, 270, 330, 420],
    tranchePercentages: [8, 10, 12, 14, 16, 18, 22],
    supportsTokens: true,
    tags: ['ladder', 'milestones', 'custom'],
  },
  {
    id: 'step-timelock',
    title: 'Timelock',
    eyebrow: 'Milestone',
    description: 'One final unlock at the end of the full duration.',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    durationDays: 180,
    cliffDays: 0,
    stepIntervalDays: 180,
    supportsTokens: true,
    tags: ['timelock', 'one-shot', 'treasury'],
  },
  {
    id: 'step-double-unlock',
    title: 'Double unlock',
    eyebrow: 'Milestone',
    description: 'Two milestone unlocks split across the schedule duration.',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    durationDays: 180,
    cliffDays: 0,
    stepIntervalDays: 90,
    supportsTokens: true,
    tags: ['double', 'milestones', 'grants'],
  },
  {
    id: 'step-monthly',
    title: 'Monthly unlocks',
    eyebrow: 'Milestone',
    description: 'Chunked monthly vesting with one milestone per month.',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    durationDays: 180,
    cliffDays: 0,
    stepIntervalDays: 30,
    supportsTokens: true,
    tags: ['monthly', 'milestones', 'contributors'],
  },
  {
    id: 'step-quarterly-cliff',
    title: 'Quarterly milestones',
    eyebrow: 'Milestone + Cliff',
    description: 'Quarterly milestone unlocks with an initial cliff release window.',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    durationDays: 360,
    cliffDays: 90,
    stepIntervalDays: 90,
    supportsTokens: true,
    tags: ['quarterly', 'cliff', 'launch'],
  },
];

const streamScheduleTemplateIds = new Set<StreamScheduleTemplateId>(
  streamScheduleTemplates.map((template) => template.id),
);

export function isValidStreamScheduleTemplate(
  value: unknown,
): value is StreamScheduleTemplateId {
  return typeof value === 'string' && streamScheduleTemplateIds.has(value as StreamScheduleTemplateId);
}
