import type { ApprovalMeterProps } from '../../components/ui/ApprovalMeter';
import type { MilestoneListProps } from '../../components/ui/MilestoneList';
import type { Schedule } from '../../components/ui/PlanSentence';
import type { RoleTagProps } from '../../components/ui/RoleTag';
import type { ScheduleTimelineProps } from '../../components/ui/ScheduleTimeline';
import type { UptimeStripProps } from '../../components/ui/UptimeStrip';
import type { Asset } from '../../components/ui/types';
import type { ComparisonTableProps } from '../../components/marketing/ComparisonTable';
import type { SolutionCopy } from '../../components/marketing/SolutionPage';
import type { ActivityEvent } from '../../copy/events';
import { STATUS, type StatusKey } from '../../copy/status';

const DAY_MS = 86_400_000;

function middayToday(): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today.getTime();
}

export const KIT_NOW = middayToday();

export function daysFromNow(days: number): number {
  return KIT_NOW + days * DAY_MS;
}

export const BCH: Asset = { kind: 'bch' };

export const SAMPLE_TOKEN_ID = '7b6fd0f2a0c4b7e9d1c35a8e4f2b6d09c8a1e3f5b7d9c2e4a6f8b0d1c3e5a7f9';

export const TOKEN: Asset = { kind: 'token', tokenId: SAMPLE_TOKEN_ID, symbol: 'SEED', decimals: 2 };

export const TOKEN_NO_SYMBOL: Asset = { kind: 'token', tokenId: SAMPLE_TOKEN_ID, decimals: 0 };

export type Person = { name: string; address: string };

export const SAM: Person = { name: 'Sam', address: 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a' };
export const MAYA: Person = { name: 'Maya', address: 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy' };
export const ADE: Person = { name: 'Ade', address: 'bitcoincash:qqq3728yw0y47sqn6l2na30mcw6zm78dzqre909m2r' };

export const TOKEN_READY_ADDRESS = 'bitcoincash:zpm2qsznhks23z7629mms6s4cwef74vcwvrqekrq9w';

export const SAMPLE_PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

export const SAMPLE_TXID = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';

export const SAMPLE_CLAIM_LINK = 'https://app.flowguard.cash/claim/sample-link-for-maya';

export const STATUS_KEYS = Object.keys(STATUS) as StatusKey[];

export const ROLES: RoleTagProps['role'][] = ['recipient', 'sender', 'signer', 'viewer'];

export type PaymentRow = {
  id: string;
  title: string;
  person: Person;
  amount: string;
  status: StatusKey;
  next: number | null;
};

export const PAYMENT_ROWS: PaymentRow[] = [
  { id: 'p1', title: `Payroll for ${SAM.name}`, person: SAM, amount: '4.20', status: 'active', next: daysFromNow(3) },
  { id: 'p2', title: `Design work for ${MAYA.name}`, person: MAYA, amount: '1.50', status: 'paused', next: null },
  { id: 'p3', title: `Support for ${ADE.name}`, person: ADE, amount: '0.75', status: 'readyToClaim', next: daysFromNow(0) },
];

export const FINISHED_ROWS: PaymentRow[] = [
  { id: 'p4', title: `Conference week for ${SAM.name}`, person: SAM, amount: '2.00', status: 'finished', next: null },
];

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: 'e1',
    kind: 'claimed',
    object: { kind: 'stream', name: `Payroll for ${SAM.name}` },
    at: daysFromNow(0) - 2 * 3_600_000,
    actor: { name: SAM.name, address: SAM.address },
    amount: { value: '0.70', asset: BCH },
    txid: SAMPLE_TXID,
  },
  {
    id: 'e2',
    kind: 'funded',
    object: { kind: 'vault', name: 'Ops budget' },
    at: daysFromNow(-1),
    actor: { isYou: true },
    amount: { value: '12.00', asset: BCH },
    txid: SAMPLE_TXID,
  },
  {
    id: 'e3',
    kind: 'recipientChanged',
    object: { kind: 'payment', name: `Design work for ${MAYA.name}` },
    at: daysFromNow(-4),
    actor: { isYou: true },
    counterparty: { name: MAYA.name, address: MAYA.address },
  },
  {
    id: 'e4',
    kind: 'milestoneReleased',
    object: { kind: 'grant', name: 'Wallet guide' },
    at: daysFromNow(-9),
    amount: { value: '250', asset: TOKEN },
    counterparty: { name: ADE.name, address: ADE.address },
    txid: SAMPLE_TXID,
  },
];

export const SIGNERS: ApprovalMeterProps['signers'] = [
  { name: SAM.name, address: SAM.address, approved: true },
  { name: MAYA.name, address: MAYA.address, approved: true },
  { name: ADE.name, publicKey: SAMPLE_PUBLIC_KEY, approved: false },
];

export const MILESTONES: MilestoneListProps['milestones'] = [
  { id: 'm1', title: 'Write the first draft', amount: '2.00', status: 'released' },
  { id: 'm2', title: `Review with ${MAYA.name}`, amount: '3.00', status: 'pending' },
  { id: 'm3', title: 'Publish the guide', amount: '5.00', status: 'pending' },
  { id: 'm4', title: 'Translate the guide', amount: '1.00', status: 'cancelled' },
];

export const TIMELINE: ScheduleTimelineProps = {
  asset: BCH,
  now: KIT_NOW,
  blocks: [
    { at: daysFromNow(-60), amount: '2.00', state: 'claimed' },
    { at: daysFromNow(-30), amount: '2.00', state: 'claimed' },
    { at: daysFromNow(-1), amount: '2.00', state: 'ready' },
    { at: daysFromNow(29), amount: '2.00', state: 'later' },
    { at: daysFromNow(59), amount: '2.00', state: 'later' },
    { at: daysFromNow(89), amount: '2.00', state: 'later' },
  ],
};

export const WAITING_TIMELINE: ScheduleTimelineProps = {
  asset: BCH,
  now: KIT_NOW,
  blocks: [
    { at: daysFromNow(20), amount: '3.00', state: 'waiting' },
    { at: daysFromNow(50), amount: '3.00', state: 'later' },
    { at: daysFromNow(80), amount: '3.00', state: 'later' },
  ],
};

export const SCHEDULES: { label: string; schedule: Schedule }[] = [
  { label: 'Once', schedule: { kind: 'once', amount: '1.50', asset: BCH, on: daysFromNow(14) } },
  {
    label: 'Bit by bit',
    schedule: { kind: 'linear', total: '12.00', asset: BCH, start: daysFromNow(0), end: daysFromNow(365), waitUntil: daysFromNow(90) },
  },
  {
    label: 'Same amount each time',
    schedule: { kind: 'step', perRelease: '0.70', asset: BCH, everyDays: 30, count: 6, start: daysFromNow(1) },
  },
  {
    label: 'Recurring payment',
    schedule: { kind: 'recurring', perRelease: '1.00', asset: BCH, everyDays: 7, count: 12, start: daysFromNow(2) },
  },
  {
    label: 'Part now, the rest over time',
    schedule: { kind: 'upfront', upfront: '2.00', rest: '8.00', asset: BCH, start: daysFromNow(0), end: daysFromNow(180) },
  },
  {
    label: 'Custom dates',
    schedule: {
      kind: 'custom',
      asset: BCH,
      releases: [
        { amount: '1.00', at: daysFromNow(10) },
        { amount: '2.50', at: daysFromNow(40) },
        { amount: '0.50', at: daysFromNow(75) },
      ],
    },
  },
  { label: 'Airdrop', schedule: { kind: 'per-claim', perClaim: '100', maxClaims: 500, asset: TOKEN, closesAt: daysFromNow(30) } },
  { label: 'Airdrop with no claim limit', schedule: { kind: 'per-claim', perClaim: '0.01', maxClaims: null, asset: BCH } },
  {
    label: 'Grant',
    schedule: {
      kind: 'milestones',
      asset: BCH,
      milestones: [
        { title: 'Write the first draft', amount: '2.00' },
        { title: 'Publish the guide', amount: '5.00' },
      ],
    },
  },
  { label: 'Bounty', schedule: { kind: 'prize', perWinner: '2.00', winners: 3, asset: BCH, endsAt: daysFromNow(21) } },
  {
    label: 'Budget plan',
    schedule: {
      kind: 'period-release',
      perPeriod: '3.00',
      everyDays: 30,
      periods: 4,
      asset: BCH,
      vault: { id: 'v1', name: 'Ops budget' },
    },
  },
];

function uptimeState(day: number): UptimeStripProps['days'][number]['state'] {
  if (day < 4) return 'none';
  if (day === 17) return 'slow';
  if (day === 23) return 'down';
  return 'good';
}

export const UPTIME_DAYS: UptimeStripProps['days'] = Array.from({ length: 30 }, (_, index) => {
  const at = new Date(daysFromNow(index - 29));
  const state = uptimeState(index);
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const note = state === 'down' ? 'Claims were paused for 40 minutes.' : state === 'slow' ? 'Lists loaded slowly for an hour.' : undefined;
  return { date, state, note };
});

export const ACCORDION_ITEMS = [
  {
    id: 'who',
    title: 'Who can move the money?',
    content: "Only the people the rules name. FlowGuard can't move it for anyone.",
  },
  {
    id: 'stop',
    title: 'Can I stop a stream?',
    content: 'Yes, if you set it up so it can be cancelled. What has been released stays with the recipient.',
  },
  { id: 'fees', title: 'What does it cost?', content: 'A small network fee each time you approve something in your wallet.' },
];

export const NUMBERED_ACCORDION_ITEMS = ACCORDION_ITEMS.map((item, index) => ({ ...item, number: String(index + 1).padStart(2, '0') }));

export const FAQ_ITEMS = ACCORDION_ITEMS.map((item) => ({ id: item.id, question: item.title, answer: item.content }));

export const TOC_ITEMS = [
  { id: 'kit-actions', label: 'Actions' },
  { id: 'kit-containers', label: 'Containers' },
  { id: 'kit-fields', label: 'Form fields' },
  { id: 'kit-status', label: 'Status and values' },
  { id: 'kit-data', label: 'Data display' },
  { id: 'kit-navigation', label: 'Navigation inside pages' },
  { id: 'kit-feedback', label: 'Overlays and feedback' },
  { id: 'kit-money', label: 'Money and schedules' },
  { id: 'kit-structure', label: 'Page structure and type' },
  { id: 'kit-marketing', label: 'Marketing' },
];

export const CREATE_STEPS = [
  { key: 'who', label: 'Who and how much' },
  { key: 'when', label: "When it's paid" },
  { key: 'check', label: 'Check and approve' },
];

export const SCHEDULE_CHOICE_OPTIONS = [
  { value: 'linear', title: 'Bit by bit', description: 'The amount releases a little every second until the end date.' },
  { value: 'step', title: 'Same amount each time', description: 'An equal part releases on a schedule, for example every 30 days.' },
  { value: 'once', title: 'All at once', description: 'The whole amount releases on one date.' },
] as const;

export type ScheduleChoice = (typeof SCHEDULE_CHOICE_OPTIONS)[number]['value'];

export const RADIO_OPTIONS = [
  { value: 'sender', label: 'Only you', description: 'You can pause or cancel it.' },
  { value: 'nobody', label: 'Nobody', description: 'Once funded it runs to the end.' },
] as const;

export type CancelChoice = (typeof RADIO_OPTIONS)[number]['value'];

export const SELECT_OPTIONS = [
  { value: '7', label: 'Every 7 days' },
  { value: '30', label: 'Every 30 days' },
  { value: '365', label: 'Every 365 days' },
] as const;

export type IntervalChoice = (typeof SELECT_OPTIONS)[number]['value'];

export const PEOPLE_OPTIONS = [
  { value: 'sam', label: SAM.name, description: 'Payroll' },
  { value: 'maya', label: MAYA.name, description: 'Design' },
  { value: 'ade', label: ADE.name, description: 'Support' },
] as const;

export type PersonChoice = (typeof PEOPLE_OPTIONS)[number]['value'];

export const FILTER_OPTIONS = [
  { value: 'active', label: 'Active', count: 4 },
  { value: 'paused', label: 'Paused', count: 1 },
  { value: 'finished', label: 'Finished', count: 7 },
] as const;

export type FilterChoice = (typeof FILTER_OPTIONS)[number]['value'];

export const SEGMENT_OPTIONS = [
  { value: 'yours', label: 'Yours' },
  { value: 'public', label: 'All public' },
] as const;

export type SegmentChoice = (typeof SEGMENT_OPTIONS)[number]['value'];

export type BatchRow = { key: string; address: string; amount: string };

export const BATCH_ROWS: BatchRow[] = [
  { key: 'r1', address: SAM.address, amount: '1.00' },
  { key: 'r2', address: MAYA.address, amount: '0.50' },
];

export const COMPARISON: Omit<ComparisonTableProps, 'className'> = {
  needs: ['Several people approve a payment', 'Pay someone bit by bit', 'Anyone can check the rules'],
  options: [
    { name: 'FlowGuard', highlight: true, marks: ['yes', 'yes', 'yes'] },
    { name: 'A shared spreadsheet', marks: ['partly', 'no', 'no'] },
    { name: 'One person holds the keys', marks: ['no', 'partly', 'no'] },
  ],
};

export const FACTS: [string, string, string] = [
  'Money sits in a contract on Bitcoin Cash',
  'Every rule is public',
  'FlowGuard never holds your keys',
];

export const FACTS_CARD = {
  eyebrow: `Payroll for ${SAM.name}`,
  network: 'Bitcoin Cash',
  rows: [
    { label: 'Total', value: '12.00 BCH' },
    { label: 'Released so far', value: '4.00 BCH' },
    { label: 'Next release', value: 'In 29 days' },
  ],
};

export const LEGAL_FIXTURE = {
  title: 'Terms of use',
  updated: 'November 1, 2026',
  summary: [
    'You keep your own keys.',
    'Payments you approve are final.',
    'The test network has no real money.',
  ] as [string, string, string],
  sections: [
    { id: 'kit-legal-keys', title: 'Your keys', body: 'FlowGuard never sees or stores your keys.' },
    { id: 'kit-legal-final', title: 'Final payments', body: 'Once the network confirms a payment, nobody can undo it.' },
  ],
};

export const SOLUTION_FIXTURE: SolutionCopy = {
  hero: {
    eyebrow: 'Payroll',
    headline: 'Pay your team',
    accent: 'on a schedule',
    lead: 'Set the amount and the dates once. Sam, Maya and Ade claim their pay as it releases.',
    primary: { label: 'Create a stream', href: '/streams/create' },
    secondary: { label: 'See an example', href: '#example' },
    visual: { kind: 'timeline', timeline: TIMELINE },
  },
  steps: [
    { title: 'Choose who and how much', body: 'Add each person and what they get.' },
    { title: 'Pick a schedule', body: 'For example, the same amount every 30 days.' },
    { title: 'Fund it', body: 'Approve in your wallet so the schedule can begin.' },
  ],
  example: {
    plan: { recipient: { address: SAM.address, name: SAM.name }, schedule: SCHEDULES[2].schedule },
    timeline: TIMELINE,
  },
  decide: [
    { label: 'Amount', value: 'Any amount of BCH or a CashTokens token' },
    { label: 'Who can cancel', value: 'You, or nobody' },
  ],
  facts: FACTS_CARD,
  goodToKnow: ['Each release needs a small network fee to claim.', 'What has been released stays with the recipient.'],
  faq: FAQ_ITEMS,
  closing: {
    headline: 'Pay your team',
    accent: 'on Bitcoin Cash',
    lead: 'Start with a small amount and see how it works.',
    primary: { label: 'Open app', href: 'https://app.flowguard.cash' },
    facts: FACTS,
    showChainData: false,
  },
};
