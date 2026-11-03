import {
  APP_PATHS,
  BCH,
  CLOSING_FACTS,
  MARKETING_COPY,
  MARKETING_PATHS,
  SAMPLE_NOW,
  SAMPLE_PEOPLE,
  SAMPLE_TOKEN,
  appLink,
  daysFromNow,
} from './solutions/shared';
import type { ApprovalMeterProps } from '../components/ui/ApprovalMeter';
import type { FeatureModuleProps } from '../components/marketing/FeatureModule';
import type { PlanSentenceProps } from '../components/ui/PlanSentence';
import type { ScheduleTimelineProps } from '../components/ui/ScheduleTimeline';

export type UseCaseVisual =
  | { kind: 'plan'; plan: PlanSentenceProps; timeline?: ScheduleTimelineProps }
  | { kind: 'timeline'; timeline: ScheduleTimelineProps }
  | { kind: 'approvals'; meter: ApprovalMeterProps };

export type UseCase = Omit<FeatureModuleProps, 'visual' | 'className'> & { id: string; visual: UseCaseVisual };

const PAY_EVERY_DAYS = 14;

export const USE_CASES_HERO = {
  headline: 'Use cases',
  lead: 'Common setups, from team vesting to community airdrops, and how each one works.',
  primary: { label: MARKETING_COPY.openApp, href: appLink() },
  secondary: { label: 'How it works', href: MARKETING_PATHS.howItWorks },
  note: MARKETING_COPY.whatYouNeed,
};

export const USE_CASES_JUMP_LABEL = 'Jump to a use case';

export const USE_CASES: UseCase[] = [
  {
    id: 'vesting',
    eyebrow: { number: '01', label: 'Vesting' },
    title: 'Pay a team or investors bit by bit',
    body: 'A project pays 8 investors and 4 team members in its own token. Each person gets a stream that starts with a waiting period, then releases evenly. Everyone claims in their own wallet.',
    action: { label: 'Read about vesting', href: MARKETING_PATHS.vesting },
    facts: [
      { title: 'A waiting period first', body: 'Nothing is released for the first 6 months.' },
      { title: 'Then evenly', body: 'The rest is released bit by bit over the next 18 months.' },
      { title: 'One list', body: 'All 12 streams show in one list, with what each person has claimed.' },
      { title: 'If someone leaves', body: "If cancelling was allowed, cancel their stream. They keep what's already released." },
    ],
    visual: {
      kind: 'plan',
      plan: {
        recipient: SAMPLE_PEOPLE.maya,
        schedule: {
          kind: 'linear',
          total: '24000',
          asset: SAMPLE_TOKEN,
          start: daysFromNow(182),
          end: daysFromNow(730),
        },
      },
    },
  },
  {
    id: 'payroll',
    eyebrow: { number: '02', label: 'Payroll' },
    title: 'Pay a remote team on a schedule',
    body: 'A 12-person team is paid in BCH every 14 days. Each person has their own stream and claims their pay when it is due.',
    action: { label: 'Read about payroll', href: MARKETING_PATHS.payroll },
    facts: [
      { title: 'Set up in one go', body: 'Add everyone with Pay many people, from a list or a CSV file.' },
      { title: 'Locked up front', body: "Funding locks the pay for the whole schedule, so a payday can't be missed for lack of money." },
      { title: 'Fixed in BCH', body: 'Amounts are in BCH or a token, so their value in dollars can change.' },
      {
        title: 'No set end',
        body: 'For the same amount with no set end, use a recurring payment and add funds as you go.',
      },
    ],
    visual: {
      kind: 'timeline',
      timeline: {
        asset: BCH,
        now: SAMPLE_NOW,
        blocks: Array.from({ length: 6 }, (_, index) => ({
          at: daysFromNow((index - 2) * PAY_EVERY_DAYS - 1),
          amount: '1.20',
          state: index < 2 ? ('claimed' as const) : index === 2 ? ('ready' as const) : ('later' as const),
        })),
      },
    },
  },
  {
    id: 'shared-funds',
    eyebrow: { number: '03', label: 'Shared funds' },
    title: "Keep a team's money behind two approvals",
    body: "A community keeps its BCH in a vault with three signers. Every payment needs 2 of 3 to approve, and any one signer can pause the vault. Once enough signers approve a payment, two of them approve sending it in their wallets.",
    action: { label: 'Read about vaults', href: MARKETING_PATHS.budgeting },
    facts: [
      { title: 'Spending requests', body: 'A signer asks for a payment with the recipient, the amount and a reason.' },
      { title: 'Two approvals', body: 'This vault needs 2 of 3 signers to approve each request. Two of them then approve sending it.' },
      { title: 'Budget plans', body: 'Money from your wallet, released on a schedule and listed under the vault.' },
    ],
    visual: {
      kind: 'approvals',
      meter: {
        required: 2,
        signers: [
          { ...SAMPLE_PEOPLE.sam, approved: true },
          { ...SAMPLE_PEOPLE.maya, approved: false },
          { ...SAMPLE_PEOPLE.ade, approved: false },
        ],
      },
    },
  },
  {
    id: 'send-to-many',
    eyebrow: { number: '04', label: 'Send to many' },
    title: 'Airdrops, bounties and rewards',
    body: 'Fund one pool that many people can claim from, pay a prize to the people who do the work, or send rewards from a fund.',
    action: { label: 'Open airdrops', href: appLink(APP_PATHS.airdrops) },
    facts: [
      {
        title: 'Airdrops',
        body: "Anyone can claim, once per wallet. Each claim also needs FlowGuard's server to approve it.",
      },
      { title: 'Bounties', body: 'Lock a prize up front and pay each winner when the work is done.' },
      { title: 'Rewards', body: "Send rewards from a fund when people earn them. There's nothing to claim." },
      { title: 'A public record', body: 'Every claim and payout is a public transaction on Bitcoin Cash.' },
    ],
    visual: {
      kind: 'plan',
      plan: {
        schedule: { kind: 'per-claim', perClaim: '100', maxClaims: 500, asset: SAMPLE_TOKEN, closesAt: daysFromNow(30) },
      },
    },
  },
];

export const USE_CASES_CLOSING = {
  headline: "Don't see",
  accent: 'your setup?',
  lead: "Tell us what you're trying to do and we'll tell you which parts fit.",
  primary: { label: MARKETING_COPY.openApp, href: appLink() },
  secondary: { label: MARKETING_COPY.getHelp, href: MARKETING_PATHS.help },
  facts: CLOSING_FACTS,
};
