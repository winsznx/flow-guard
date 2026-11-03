import { decodeCashAddress } from '@bitauth/libauth';
import type { Schedule } from '../components/ui/PlanSentence';
import type { Asset } from '../components/ui/types';
import type { Network } from '../hooks/useNetwork';
import { formatAmount } from '../copy/format';
import { addressErrors } from '../copy/network';
import { FIELD_ERRORS, SCHEDULE, SCHEDULE_ERRORS } from '../copy/streamCreate';
import { SCHEDULE_CHOICE, type ScheduleChoice as StreamScheduleChoice } from '../copy/streams';

export type StreamShapeType = 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';

/** The schedule choices the create flows offer, in the words of the glossary. */
export type ScheduleChoice = 'once' | 'even' | 'same' | 'wait' | 'part' | 'custom';

export const COMMON_SCHEDULE_CHOICES: ScheduleChoice[] = ['once', 'even', 'same'];
export const MORE_SCHEDULE_CHOICES: ScheduleChoice[] = ['wait', 'part', 'custom'];

/** The create flows' keys for the schedule choices in copy/streams.ts, which holds their words. */
const CHOICE_COPY_KEY: Record<ScheduleChoice, StreamScheduleChoice> = {
  once: 'once',
  even: 'evenly',
  same: 'sameAmount',
  wait: 'waitThenEvenly',
  part: 'partNow',
  custom: 'custom',
};

function choiceWords(choice: ScheduleChoice): { title: string; description: string } {
  const words = SCHEDULE_CHOICE[CHOICE_COPY_KEY[choice]];
  return { title: words.name, description: words.line };
}

export const SCHEDULE_CHOICE_WORDS: Record<ScheduleChoice, { title: string; description: string }> = {
  once: choiceWords('once'),
  even: choiceWords('even'),
  same: choiceWords('same'),
  wait: choiceWords('wait'),
  part: choiceWords('part'),
  custom: choiceWords('custom'),
};

export interface StreamScheduleTemplate {
  id: string;
  choice: ScheduleChoice;
  /** The preset's name, shown on the create flows and on stream pages. */
  title: string;
  /** The schedule choice the preset belongs to, in plain words. */
  eyebrow: string;
  description: string;
  streamType: StreamShapeType;
  /** Internal contract family. Never shown to people. */
  contractFamily: 'VestingCovenant' | 'RecurringPaymentCovenant' | 'TrancheVestingCovenant' | 'HybridVestingCovenant';
  duration: string;
  cliffDays: string;
  recurringIntervalDays?: string;
  stepIntervalDays?: string;
  hybridUnlockDays?: string;
  hybridUnlockPercent?: string;
  trancheOffsetsDays?: string[];
  tranchePercentages?: string[];
  refillable?: boolean;
  /** Who the preset is good for, in plain words. */
  tags: string[];
}

const CHOICE_TITLE = (choice: ScheduleChoice) => SCHEDULE_CHOICE_WORDS[choice].title;

export const streamScheduleTemplates: StreamScheduleTemplate[] = [
  {
    id: 'step-timelock',
    choice: 'once',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('once'),
    title: 'All on day 180',
    description: 'Everything is released on day 180. Nothing before.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '180',
    tags: ['grants', 'long-term plans'],
  },
  {
    id: 'linear-open',
    choice: 'even',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('even'),
    title: 'Evenly over 180 days',
    description: 'A little is released every second from day one. Good for grants and contributor pay.',
    duration: '180',
    cliffDays: '0',
    tags: ['grants', 'team'],
  },
  {
    id: 'linear-cliff',
    choice: 'wait',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('wait'),
    title: 'Team plan, 1 year',
    description: 'Nothing for 90 days. Then everything built up so far is released at once, and the rest evenly until day 365.',
    duration: '365',
    cliffDays: '90',
    tags: ['team', 'investors'],
  },
  {
    id: 'recurring-weekly',
    choice: 'same',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Every week, 12 times',
    description: 'The recipient can claim the same amount every 7 days, 12 times.',
    duration: '84',
    cliffDays: '0',
    recurringIntervalDays: '7',
    tags: ['contractors', 'stipends'],
  },
  {
    id: 'recurring-monthly',
    choice: 'same',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Every 30 days, 6 times',
    description: 'The recipient can claim the same amount every 30 days, 6 times.',
    duration: '180',
    cliffDays: '0',
    recurringIntervalDays: '30',
    tags: ['salary', 'retainers'],
  },
  {
    id: 'recurring-quarterly',
    choice: 'same',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Every 90 days, 4 times',
    description: 'The recipient can claim the same amount every 90 days, 4 times.',
    duration: '360',
    cliffDays: '0',
    recurringIntervalDays: '90',
    tags: ['stipends', 'grants'],
  },
  {
    id: 'recurring-open-weekly',
    choice: 'same',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Every week, as long as you add funds',
    description: 'The recipient can claim the same amount every 7 days for as long as you keep adding funds.',
    duration: '84',
    cliffDays: '0',
    recurringIntervalDays: '7',
    refillable: true,
    tags: ['team pay'],
  },
  {
    id: 'recurring-open-monthly',
    choice: 'same',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Every 30 days, as long as you add funds',
    description: 'The recipient can claim the same amount every 30 days for as long as you keep adding funds.',
    duration: '180',
    cliffDays: '0',
    recurringIntervalDays: '30',
    refillable: true,
    tags: ['team pay', 'grants'],
  },
  {
    id: 'step-double-unlock',
    choice: 'same',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Two equal parts',
    description: 'Half is released on day 90, the other half on day 180.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '90',
    tags: ['grants', 'investors'],
  },
  {
    id: 'step-monthly',
    choice: 'same',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Six equal parts, 30 days apart',
    description: 'An equal part is released every 30 days for 180 days.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '30',
    tags: ['team'],
  },
  {
    id: 'step-quarterly-cliff',
    choice: 'same',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: CHOICE_TITLE('same'),
    title: 'Four equal parts over a year',
    description: 'A quarter is released every 90 days. Nothing can be claimed before day 90.',
    duration: '360',
    cliffDays: '90',
    stepIntervalDays: '90',
    tags: ['team', 'long-term plans'],
  },
  {
    id: 'hybrid-upfront-linear',
    choice: 'part',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    eyebrow: CHOICE_TITLE('part'),
    title: '25% on day 90, then evenly',
    description: 'A quarter is released on day 90. The rest is released evenly until day 365.',
    duration: '365',
    cliffDays: '0',
    hybridUnlockDays: '90',
    hybridUnlockPercent: '25',
    tags: ['team'],
  },
  {
    id: 'hybrid-cliff-linear',
    choice: 'part',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    eyebrow: CHOICE_TITLE('part'),
    title: '40% on day 180, then evenly',
    description: 'Nothing for 180 days. Then 40% is released at once, and the rest evenly until day 540.',
    duration: '540',
    cliffDays: '0',
    hybridUnlockDays: '180',
    hybridUnlockPercent: '40',
    tags: ['investors'],
  },
  {
    id: 'tranche-backweighted',
    choice: 'custom',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: CHOICE_TITLE('custom'),
    title: 'Bigger parts later',
    description: 'Four releases over 360 days: 10%, 20%, 30%, then 40%.',
    duration: '360',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '120', '240', '360'],
    tranchePercentages: ['10', '20', '30', '40'],
    tags: ['team'],
  },
  {
    id: 'tranche-frontloaded',
    choice: 'custom',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: CHOICE_TITLE('custom'),
    title: 'Bigger parts first',
    description: 'Four releases over 240 days: 40%, 30%, 20%, then 10%.',
    duration: '240',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '90', '150', '240'],
    tranchePercentages: ['40', '30', '20', '10'],
    tags: ['grants'],
  },
  {
    id: 'tranche-cliff-staged',
    choice: 'custom',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: CHOICE_TITLE('custom'),
    title: 'A quarter every 90 days',
    description: '25% is released every 90 days, starting on day 90.',
    duration: '360',
    cliffDays: '90',
    trancheOffsetsDays: ['90', '180', '270', '360'],
    tranchePercentages: ['25', '25', '25', '25'],
    tags: ['team'],
  },
  {
    id: 'tranche-monthly-runway',
    choice: 'custom',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: CHOICE_TITLE('custom'),
    title: 'Eight releases, 30 days apart',
    description: 'A release every 30 days for 240 days, growing from 10% to 20%.',
    duration: '240',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '60', '90', '120', '150', '180', '210', '240'],
    tranchePercentages: ['10', '10', '10', '10', '12', '12', '16', '20'],
    tags: ['grants', 'team'],
  },
  {
    id: 'tranche-performance-ladder',
    choice: 'custom',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: CHOICE_TITLE('custom'),
    title: 'Seven growing releases',
    description: 'Seven releases over 420 days, from 8% up to 22%.',
    duration: '420',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '90', '150', '210', '270', '330', '420'],
    tranchePercentages: ['8', '10', '12', '14', '16', '18', '22'],
    tags: ['team'],
  },
];

/**
 * The examples a create flow offers for a choice. With BCH, "Same amount each time" offers only
 * recurring examples, and with a token only equal parts, so no two examples look alike but
 * behave differently when cancelled.
 */
export function templatesForChoice(choice: ScheduleChoice, token: boolean): StreamScheduleTemplate[] {
  return streamScheduleTemplates.filter((template) => {
    if (template.choice !== choice) return false;
    if (!token) return choice !== 'same' || template.streamType === 'RECURRING';
    return isTokenScheduleAvailable(template.streamType) && (choice !== 'same' || template.streamType === 'RECURRING');
  });
}

/** Matches the server's MAX_RECURRING_STREAM_PAYMENTS: each payment pays its own network fee from the stream. */
export const MAX_RECURRING_STREAM_PAYMENTS = 120;
export const RECURRING_PAYMENT_LIMIT_MESSAGE = `A stream can make at most ${MAX_RECURRING_STREAM_PAYMENTS} payments. Pay less often, or for a shorter time.`;

/**
 * Token streams the server refuses at create. Every schedule takes tokens now; the sets stay
 * so a schedule can be held back again without touching the create flow.
 */
export const TOKEN_REFUSED_STREAM_TYPES: ReadonlySet<StreamShapeType> = new Set();
export const TOKEN_REFUSED_CHOICES: ReadonlySet<ScheduleChoice> = new Set();
export const BATCH_TOKENS_AVAILABLE = false;

export const TOKEN_SCHEDULE_UNAVAILABLE = `${CHOICE_TITLE('part')} and ${CHOICE_TITLE('custom')} aren't available for tokens yet. Pay with BCH to use them.`;
export const TOKEN_CHOICE_UNAVAILABLE = "Not available for tokens yet. Pay with BCH to use it.";
export const BATCH_TOKENS_UNAVAILABLE = "Token streams can't be set up for many people at once yet. Create them one at a time.";

export function isTokenScheduleAvailable(streamType: StreamShapeType): boolean {
  return !TOKEN_REFUSED_STREAM_TYPES.has(streamType);
}

export const DAY_SECONDS = 24 * 60 * 60;

/** Display amount ("0.5") to smallest units. Null when it isn't a plain number or has too many decimals. */
export function parseUnits(value: string, decimals: number): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(`${match[1] || '0'}${fraction.padEnd(decimals, '0')}`);
}

export function unitsToDisplay(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Percent to basis points, so shares stay exact. */
function basisPoints(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

/** Splits a total by percentage shares. Each part is rounded down and the last part takes what's left. */
export function splitByShares(total: bigint, shares: number[]): bigint[] {
  let allocated = 0n;
  return shares.map((share, index) => {
    const part = index === shares.length - 1 ? total - allocated : (total * basisPoints(share)) / 10000n;
    allocated += part;
    return part < 0n ? 0n : part;
  });
}

/** Equal parts rounded up, with the last part a little smaller when the total doesn't split evenly. */
export function splitIntoSteps(total: bigint, count: number): bigint[] {
  if (count < 1) return [];
  const n = BigInt(count);
  const step = (total + n - 1n) / n;
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? (total - step * (n - 1n) > 0n ? total - step * (n - 1n) : 0n) : step,
  );
}

export function upfrontUnits(total: bigint, percent: number): bigint {
  return (total * basisPoints(percent)) / 10000n;
}

export type ScheduleShape = {
  streamType: StreamShapeType;
  durationDays: number;
  waitDays: number;
  intervalDays: number;
  upfrontDays: number;
  upfrontPercent: number;
  custom: { day: number; share: number }[];
};

export type PlannedRelease = { at: number; units: bigint; waiting?: boolean };

const MAX_EVEN_BLOCKS = 26;

/**
 * The releases a schedule makes from `start` (unix seconds), in smallest units, so pages can
 * draw a ScheduleTimeline and list dates. A stream released every second is drawn as equal
 * slices, one per week or longer. Days in the waiting period come back as `waiting` blocks.
 */
export function planReleases(shape: ScheduleShape, total: bigint, start: number): PlannedRelease[] {
  const day = (n: number) => start + Math.round(n * DAY_SECONDS);
  const { durationDays, waitDays } = shape;
  if (!(durationDays > 0)) return [];

  const evenly = (fromDay: number, toDay: number, amount: bigint): PlannedRelease[] => {
    const span = toDay - fromDay;
    if (!(span > 0)) return [];
    const slice = Math.max(7, Math.ceil(span / MAX_EVEN_BLOCKS));
    const count = Math.max(1, Math.ceil(span / slice));
    const out: PlannedRelease[] = [];
    let released = 0n;
    for (let index = 1; index <= count; index += 1) {
      const at = index === count ? toDay : fromDay + index * slice;
      const cumulative = (amount * BigInt(Math.round(((at - fromDay) / span) * 1_000_000))) / 1_000_000n;
      const units = index === count ? amount - released : cumulative - released;
      released += units;
      out.push({ at: day(at), units });
    }
    return out;
  };

  const waitingBlocks = (untilDay: number): PlannedRelease[] => {
    if (!(untilDay > 0)) return [];
    const slice = Math.max(7, Math.ceil(untilDay / 8));
    const count = Math.max(1, Math.floor(untilDay / slice));
    return Array.from({ length: count }, (_, index) => ({ at: day(index * slice), units: 0n, waiting: true }));
  };

  switch (shape.streamType) {
    case 'LINEAR': {
      if (waitDays > 0 && waitDays < durationDays) {
        const builtUp = (total * BigInt(Math.round((waitDays / durationDays) * 1_000_000))) / 1_000_000n;
        return [
          ...waitingBlocks(waitDays),
          { at: day(waitDays), units: builtUp },
          ...evenly(waitDays, durationDays, total - builtUp),
        ];
      }
      return evenly(0, durationDays, total);
    }
    case 'STEP': {
      const interval = shape.intervalDays > 0 ? shape.intervalDays : durationDays;
      const count = Math.floor(durationDays / interval);
      const parts = splitIntoSteps(total, count);
      const releases: PlannedRelease[] = [];
      let held = 0n;
      parts.forEach((units, index) => {
        const at = (index + 1) * interval;
        if (waitDays > 0 && at < waitDays) {
          held += units;
          return;
        }
        if (held > 0n) {
          releases.push({ at: day(waitDays), units: held });
          held = 0n;
        }
        releases.push({ at: day(at), units });
      });
      if (held > 0n) releases.push({ at: day(waitDays), units: held });
      return [...waitingBlocks(waitDays), ...releases];
    }
    case 'RECURRING': {
      const interval = shape.intervalDays;
      if (!(interval > 0)) return [];
      const count = Math.floor(durationDays / interval);
      if (count < 1 || total % BigInt(count) !== 0n) return [];
      const each = total / BigInt(count);
      return [
        ...waitingBlocks(waitDays),
        ...Array.from({ length: count }, (_, index) => ({ at: day(waitDays + (index + 1) * interval), units: each })),
      ];
    }
    case 'HYBRID': {
      const unlockDay = shape.upfrontDays;
      if (!(unlockDay > 0) || unlockDay >= durationDays) return [];
      const first = upfrontUnits(total, shape.upfrontPercent);
      return [
        ...waitingBlocks(unlockDay),
        { at: day(unlockDay), units: first },
        ...evenly(unlockDay, durationDays, total - first),
      ];
    }
    case 'TRANCHE': {
      const rows = shape.custom.filter((row) => row.day > 0 && row.share > 0);
      if (rows.length === 0) return [];
      const parts = splitByShares(
        total,
        rows.map((row) => row.share),
      );
      return rows.map((row, index) => ({ at: day(row.day), units: parts[index] }));
    }
  }
}

/* Shared schedule draft for the create flows. */

export type CustomRow = { id: string; day: string; share: string };

export type ScheduleDraft = {
  choice: ScheduleChoice;
  /** Which contract "Same amount each time" uses with BCH. Tokens always use equal steps. */
  sameKind: 'RECURRING' | 'STEP';
  moreOpen: boolean;
  onceDays: string;
  lengthDays: string;
  waitDays: string;
  delayDays: string;
  intervalDays: string;
  intervalOther: boolean;
  paymentCount: string;
  upfrontDays: string;
  upfrontPercent: string;
  customRows: CustomRow[];
  refillable: boolean;
  cancelable: boolean;
  transferable: boolean;
  templateId: string | null;
};

export type ScheduleField =
  | 'choice'
  | 'onceDays'
  | 'lengthDays'
  | 'waitDays'
  | 'delayDays'
  | 'intervalDays'
  | 'paymentCount'
  | 'upfrontDays'
  | 'upfrontPercent'
  | 'customRows';

export type ScheduleErrors = Partial<Record<ScheduleField, string>>;

export const INTERVAL_CHOICES = ['7', '14', '30', '90', '180', '365'];

let rowCounter = 0;
export function nextRowId(prefix: string): string {
  rowCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${rowCounter}`;
}

export const DEFAULT_SCHEDULE: ScheduleDraft = {
  choice: 'even',
  sameKind: 'RECURRING',
  moreOpen: false,
  onceDays: '180',
  lengthDays: '180',
  waitDays: '90',
  delayDays: '',
  intervalDays: '30',
  intervalOther: false,
  paymentCount: '6',
  upfrontDays: '90',
  upfrontPercent: '25',
  customRows: [
    { id: 'release-1', day: '90', share: '50' },
    { id: 'release-2', day: '180', share: '50' },
  ],
  refillable: false,
  cancelable: true,
  transferable: true,
  templateId: null,
};

export function wholeNumber(value: string): number {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
}

export function positiveWhole(value: string): number {
  const n = wholeNumber(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function scheduleFromTemplate(
  template: StreamScheduleTemplate,
  base: ScheduleDraft,
  overrides?: { duration?: number; offsets?: number[]; shares?: number[] },
): ScheduleDraft {
  const next: ScheduleDraft = {
    ...base,
    choice: template.choice,
    templateId: template.id,
    moreOpen: base.moreOpen || MORE_SCHEDULE_CHOICES.includes(template.choice),
    refillable: Boolean(template.refillable),
  };
  switch (template.choice) {
    case 'once':
      next.onceDays = template.duration;
      break;
    case 'even':
      next.lengthDays = template.duration;
      break;
    case 'wait':
      next.lengthDays = template.duration;
      next.waitDays = template.cliffDays;
      break;
    case 'same': {
      const interval = template.recurringIntervalDays ?? template.stepIntervalDays ?? '30';
      next.intervalDays = interval;
      next.intervalOther = !INTERVAL_CHOICES.includes(interval);
      next.paymentCount = String(Math.max(1, Math.floor(Number(template.duration) / Number(interval))));
      next.sameKind = template.streamType === 'STEP' ? 'STEP' : 'RECURRING';
      next.delayDays = template.cliffDays === '0' ? '' : template.cliffDays;
      break;
    }
    case 'part':
      next.lengthDays = template.duration;
      next.upfrontDays = template.hybridUnlockDays ?? base.upfrontDays;
      next.upfrontPercent = template.hybridUnlockPercent ?? base.upfrontPercent;
      break;
    case 'custom': {
      const offsets = overrides?.offsets?.length ? overrides.offsets.map(String) : template.trancheOffsetsDays ?? [];
      const shares = overrides?.shares?.length ? overrides.shares.map(String) : template.tranchePercentages ?? [];
      next.customRows = offsets.map((day, index) => ({ id: nextRowId('release'), day, share: shares[index] ?? '0' }));
      break;
    }
  }
  if (overrides?.duration && template.choice !== 'custom' && template.choice !== 'same') {
    if (template.choice === 'once') next.onceDays = String(overrides.duration);
    else next.lengthDays = String(overrides.duration);
  }
  return next;
}

export function scheduleStreamType(draft: ScheduleDraft): StreamShapeType {
  switch (draft.choice) {
    case 'once':
      return 'STEP';
    case 'even':
    case 'wait':
      return 'LINEAR';
    case 'same':
      return draft.refillable ? 'RECURRING' : draft.sameKind;
    case 'part':
      return 'HYBRID';
    case 'custom':
      return 'TRANCHE';
  }
}

export function scheduleShape(draft: ScheduleDraft, token: boolean, allowDelay: boolean): ScheduleShape {
  const streamType = scheduleStreamType(draft);
  const shape: ScheduleShape = {
    streamType,
    durationDays: 0,
    waitDays: 0,
    intervalDays: 0,
    upfrontDays: 0,
    upfrontPercent: 0,
    custom: [],
  };
  switch (draft.choice) {
    case 'once':
      shape.durationDays = positiveWhole(draft.onceDays);
      shape.intervalDays = shape.durationDays;
      break;
    case 'even':
      shape.durationDays = positiveWhole(draft.lengthDays);
      break;
    case 'wait':
      shape.durationDays = positiveWhole(draft.lengthDays);
      shape.waitDays = positiveWhole(draft.waitDays);
      break;
    case 'same':
      shape.intervalDays = positiveWhole(draft.intervalDays);
      shape.durationDays = shape.intervalDays * positiveWhole(draft.paymentCount);
      shape.waitDays = allowDelay ? positiveWhole(draft.delayDays) : 0;
      break;
    case 'part':
      shape.durationDays = positiveWhole(draft.lengthDays);
      shape.upfrontDays = positiveWhole(draft.upfrontDays);
      shape.upfrontPercent = Number(draft.upfrontPercent) || 0;
      break;
    case 'custom':
      shape.custom = draft.customRows.map((row) => ({ day: positiveWhole(row.day), share: Number(row.share) || 0 }));
      shape.durationDays = shape.custom.length > 0 ? shape.custom[shape.custom.length - 1].day : 0;
      break;
  }
  return shape;
}

export function validateSchedule(draft: ScheduleDraft, token: boolean, allowDelay: boolean): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const days = (field: 'onceDays' | 'lengthDays' | 'waitDays' | 'upfrontDays' | 'intervalDays', value: string) => {
    if (!(wholeNumber(value) > 0)) errors[field] = SCHEDULE_ERRORS.wholeDays;
  };
  if (token && TOKEN_REFUSED_CHOICES.has(draft.choice)) errors.choice = TOKEN_SCHEDULE_UNAVAILABLE;

  switch (draft.choice) {
    case 'once':
      days('onceDays', draft.onceDays);
      break;
    case 'even':
      days('lengthDays', draft.lengthDays);
      break;
    case 'wait': {
      days('waitDays', draft.waitDays);
      days('lengthDays', draft.lengthDays);
      const wait = wholeNumber(draft.waitDays);
      const length = wholeNumber(draft.lengthDays);
      if (!errors.waitDays && !errors.lengthDays && wait >= length) errors.waitDays = SCHEDULE_ERRORS.waitBeforeEnd(length);
      break;
    }
    case 'same': {
      days('intervalDays', draft.intervalDays);
      if (!(wholeNumber(draft.paymentCount) > 0)) errors.paymentCount = SCHEDULE_ERRORS.wholeCount;
      else if (scheduleStreamType(draft) === 'RECURRING' && wholeNumber(draft.paymentCount) > MAX_RECURRING_STREAM_PAYMENTS) {
        errors.paymentCount = RECURRING_PAYMENT_LIMIT_MESSAGE;
      }
      if (allowDelay && draft.delayDays.trim()) {
        const delay = wholeNumber(draft.delayDays);
        const length = wholeNumber(draft.intervalDays) * wholeNumber(draft.paymentCount);
        if (!(delay >= 0)) errors.delayDays = SCHEDULE_ERRORS.wholeDays;
        else if (scheduleStreamType(draft) === 'STEP' && length > 0 && delay >= length) {
          errors.delayDays = SCHEDULE_ERRORS.waitBeforeEnd(length);
        }
      }
      break;
    }
    case 'part': {
      days('upfrontDays', draft.upfrontDays);
      days('lengthDays', draft.lengthDays);
      const upfront = wholeNumber(draft.upfrontDays);
      const length = wholeNumber(draft.lengthDays);
      if (!errors.upfrontDays && !errors.lengthDays && upfront >= length) errors.upfrontDays = SCHEDULE_ERRORS.upfrontBeforeEnd(length);
      const percent = Number(draft.upfrontPercent);
      if (!draft.upfrontPercent.trim() || !(percent > 0 && percent < 100)) errors.upfrontPercent = SCHEDULE_ERRORS.upfrontPercent;
      break;
    }
    case 'custom': {
      const rows = draft.customRows;
      if (rows.length < 1 || rows.length > 8) {
        errors.customRows = SCHEDULE_ERRORS.customCount;
        break;
      }
      let total = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const day = wholeNumber(rows[index].day);
        const share = Number(rows[index].share);
        if (!(day > 0)) {
          errors.customRows = SCHEDULE_ERRORS.customDay(index + 1);
          break;
        }
        if (!rows[index].share.trim() || !(share > 0)) {
          errors.customRows = SCHEDULE_ERRORS.customShare(index + 1);
          break;
        }
        if (index > 0 && day <= wholeNumber(rows[index - 1].day)) {
          errors.customRows = SCHEDULE_ERRORS.customOrder;
          break;
        }
        total += share;
      }
      if (!errors.customRows && Math.abs(total - 100) > 0.0001) {
        errors.customRows = SCHEDULE_ERRORS.customTotal(String(Math.round(total * 100) / 100));
      }
      break;
    }
  }
  return errors;
}

export type SplitProblem = { message: string; amounts: string[] };

/** Recurring payments must split into equal smallest units. Returns the fix when they don't. */
export function evenSplitProblem(total: bigint | null, count: number, asset: Asset, decimals: number): SplitProblem | null {
  if (total === null || total <= 0n || !(count > 0)) return null;
  const n = BigInt(count);
  const remainder = total % n;
  if (remainder === 0n) return null;
  const lower = total - remainder;
  const higher = lower + n;
  const show = (units: bigint) => formatAmount(units, asset) ?? unitsToDisplay(units, decimals);
  const amounts = [lower > 0n ? unitsToDisplay(lower, decimals) : null, unitsToDisplay(higher, decimals)].filter(
    (value): value is string => value !== null,
  );
  return {
    message: SCHEDULE_ERRORS.evenSplit(show(total), count, lower > 0n ? show(lower) : null, show(higher)),
    amounts,
  };
}

/** The template id to store with a stream, when the schedule still matches the example it came from. */
export function matchedTemplateId(draft: ScheduleDraft, shape: ScheduleShape): string | null {
  const template = getStreamScheduleTemplateById(draft.templateId);
  if (!template) return null;
  const matches = matchesStreamScheduleTemplate(
    {
      streamType: shape.streamType,
      duration: String(shape.durationDays),
      cliffDays: shape.streamType === 'TRANCHE' || shape.streamType === 'HYBRID' ? template.cliffDays : String(shape.waitDays),
      recurringIntervalDays: String(shape.intervalDays),
      stepIntervalDays: String(shape.intervalDays),
      hybridUnlockDays: String(shape.upfrontDays),
      hybridUnlockPercent: draft.upfrontPercent,
      trancheOffsetsDays: draft.customRows.map((row) => row.day),
      tranchePercentages: draft.customRows.map((row) => row.share),
      refillable: draft.refillable,
    },
    template,
  );
  return matches ? template.id : null;
}

/** The plan sentence for a schedule, from typed data. */
export function planSchedule(shape: ScheduleShape, choice: ScheduleChoice, total: bigint | null, asset: Asset, decimals: number, start: number): Schedule {
  const display = (units: bigint | null) => (units === null ? '' : unitsToDisplay(units, decimals));
  const at = (days: number) => start + days * DAY_SECONDS;
  switch (shape.streamType) {
    case 'LINEAR':
      return {
        kind: 'linear',
        total: display(total),
        asset,
        start,
        end: at(shape.durationDays),
        waitUntil: shape.waitDays > 0 ? at(shape.waitDays) : undefined,
      };
    case 'STEP': {
      if (choice === 'once') return { kind: 'once', amount: display(total), asset, on: at(shape.durationDays) };
      const count = shape.intervalDays > 0 ? Math.floor(shape.durationDays / shape.intervalDays) : 0;
      const parts = total === null ? [] : splitIntoSteps(total, count);
      const equal = parts.length > 0 && parts.every((part) => part === parts[0]);
      if (total === null || (equal && shape.waitDays === 0)) {
        return {
          kind: 'step',
          perRelease: total === null || count < 1 ? '' : display(parts[0] ?? null),
          asset,
          everyDays: shape.intervalDays,
          count,
          start: at(shape.intervalDays),
        };
      }
      return {
        kind: 'custom',
        asset,
        releases: planReleases(shape, total, start)
          .filter((release) => !release.waiting)
          .map((release) => ({ amount: display(release.units), at: release.at })),
      };
    }
    case 'RECURRING': {
      const count = shape.intervalDays > 0 ? Math.floor(shape.durationDays / shape.intervalDays) : 0;
      return {
        kind: 'recurring',
        perRelease: total === null || count < 1 || total % BigInt(count) !== 0n ? '' : display(total / BigInt(count)),
        asset,
        everyDays: shape.intervalDays,
        count,
        start: at(shape.waitDays + shape.intervalDays),
      };
    }
    case 'HYBRID': {
      const first = total === null ? null : upfrontUnits(total, shape.upfrontPercent);
      return {
        kind: 'upfront',
        upfront: display(first),
        rest: total === null || first === null ? '' : display(total - first),
        asset,
        start: at(shape.upfrontDays),
        end: at(shape.durationDays),
      };
    }
    case 'TRANCHE': {
      const parts = total === null ? [] : splitByShares(total, shape.custom.map((row) => row.share));
      return {
        kind: 'custom',
        asset,
        releases: shape.custom.map((row, index) => ({ amount: total === null ? '' : display(parts[index] ?? 0n), at: at(row.day) })),
      };
    }
  }
}

/** A regular wallet address on this network, or the reason it isn't. */
export function regularAddressProblem(value: string, network: Network): string | null {
  const address = value.trim();
  if (!address) return FIELD_ERRORS.recipientMissing;
  const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  const other = network === 'mainnet' ? 'bchtest' : 'bitcoincash';
  const lower = address.toLowerCase();
  if (lower.startsWith(`${other}:`)) return addressErrors(network).otherNetwork;
  const decoded = decodeCashAddress(lower.includes(':') ? lower : `${prefix}:${lower}`);
  if (typeof decoded === 'string' || decoded.prefix !== prefix) return addressErrors(network).notAnAddress;
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') return FIELD_ERRORS.recipientRegular;
  return null;
}

export const SCHEDULE_FIELD_ID: Record<ScheduleField, string> = {
  choice: 'schedule-choice',
  onceDays: 'schedule-once-days',
  lengthDays: 'schedule-length',
  waitDays: 'schedule-wait',
  delayDays: 'schedule-delay',
  intervalDays: 'schedule-interval',
  paymentCount: 'schedule-count',
  upfrontDays: 'schedule-upfront-day',
  upfrontPercent: 'schedule-upfront-percent',
  customRows: 'schedule-custom',
};

export const SCHEDULE_FIELD_LABEL: Record<ScheduleField, string> = {
  choice: SCHEDULE.legend,
  onceDays: SCHEDULE.onceDaysLabel,
  lengthDays: SCHEDULE.lengthLabel,
  waitDays: SCHEDULE.waitLabel,
  delayDays: SCHEDULE.waitOptionalLabel,
  intervalDays: SCHEDULE.intervalLabel,
  paymentCount: SCHEDULE.countLabel,
  upfrontDays: SCHEDULE.upfrontDaysLabel,
  upfrontPercent: SCHEDULE.upfrontPercentLabel,
  customRows: SCHEDULE.customLegend,
};


function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeChartPoints(points: Array<{ x: number; y: number }>) {
  const normalized: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    const x = clamp01(point.x);
    const y = clamp01(point.y);
    const previous = normalized[normalized.length - 1];

    if (previous && Math.abs(previous.x - x) < 0.0001 && Math.abs(previous.y - y) < 0.0001) {
      continue;
    }

    normalized.push({ x, y });
  }

  return normalized.length > 0 ? normalized : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
}

export function buildScheduleChartPoints(params: {
  streamType: StreamShapeType;
  durationDays: number;
  cliffDays: number;
  intervalDays: number;
  totalOnChain: number;
  hybridUnlockDays?: number;
  hybridUnlockPercent?: number;
  trancheSchedule?: Array<{
    offsetDays: number;
    cumulativeAmountOnChain: number;
  }>;
}) {
  const {
    streamType,
    durationDays,
    cliffDays,
    intervalDays,
    totalOnChain,
    hybridUnlockDays,
    hybridUnlockPercent,
    trancheSchedule,
  } = params;

  if (!durationDays || durationDays <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  if (streamType === 'LINEAR') {
    if (cliffDays > 0 && cliffDays < durationDays) {
      const cliffX = cliffDays / durationDays;
      const cliffY = totalOnChain > 0
        ? Math.floor((totalOnChain * cliffDays) / durationDays) / totalOnChain
        : cliffX;
      return normalizeChartPoints([
        { x: 0, y: 0 },
        { x: cliffX, y: 0 },
        { x: cliffX, y: cliffY },
        { x: 1, y: 1 },
      ]);
    }

    return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  }

  if (streamType === 'HYBRID') {
    if (!hybridUnlockDays || hybridUnlockDays <= 0 || hybridUnlockDays >= durationDays) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }
    const unlockX = hybridUnlockDays / durationDays;
    const unlockY = Math.max(0, Math.min(1, (hybridUnlockPercent || 0) / 100));
    return normalizeChartPoints([
      { x: 0, y: 0 },
      { x: unlockX, y: 0 },
      { x: unlockX, y: unlockY },
      { x: 1, y: 1 },
    ]);
  }

  if (!intervalDays || intervalDays <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  const releaseCount = Math.floor(durationDays / intervalDays);
  if (releaseCount < 1) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  if (streamType === 'RECURRING') {
    const fullHorizon = cliffDays + durationDays;
    const points = [{ x: 0, y: 0 }];

    if (cliffDays > 0) {
      points.push({ x: cliffDays / fullHorizon, y: 0 });
    }

    for (let index = 1; index <= releaseCount; index += 1) {
      points.push({
        x: (cliffDays + index * intervalDays) / fullHorizon,
        y: index / releaseCount,
      });
    }

    return normalizeChartPoints(points);
  }

  if (streamType === 'TRANCHE') {
    if (!trancheSchedule || trancheSchedule.length === 0) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }

    const points = [{ x: 0, y: 0 }];
    for (const tranche of trancheSchedule) {
      const x = tranche.offsetDays / durationDays;
      const y = totalOnChain > 0
        ? tranche.cumulativeAmountOnChain / totalOnChain
        : 0;
      points.push({ x, y: points[points.length - 1].y });
      points.push({ x, y });
    }
    return normalizeChartPoints(points);
  }

  const stepAmountOnChain = totalOnChain > 0
    ? Math.floor((totalOnChain + releaseCount - 1) / releaseCount)
    : 1;
  const cliffCompletedSteps = cliffDays > 0
    ? Math.min(releaseCount, Math.floor(cliffDays / intervalDays))
    : 0;
  const points = [{ x: 0, y: 0 }];

  if (cliffDays > 0) {
    const cliffY = totalOnChain > 0
      ? Math.min(cliffCompletedSteps * stepAmountOnChain, totalOnChain) / totalOnChain
      : cliffCompletedSteps / releaseCount;
    points.push({ x: cliffDays / durationDays, y: 0 });
    if (cliffY > 0) {
      points.push({ x: cliffDays / durationDays, y: cliffY });
    }
  }

  for (let index = Math.max(1, cliffCompletedSteps + 1); index <= releaseCount; index += 1) {
    const y = totalOnChain > 0
      ? Math.min(index * stepAmountOnChain, totalOnChain) / totalOnChain
      : index / releaseCount;
    points.push({
      x: (index * intervalDays) / durationDays,
      y,
    });
  }

  return normalizeChartPoints(points);
}

export function getStreamScheduleTemplateById(templateId?: string | null): StreamScheduleTemplate | null {
  return streamScheduleTemplates.find((template) => template.id === templateId) ?? null;
}

export function getStreamScheduleTemplateLabel(templateId?: string | null): string | null {
  return getStreamScheduleTemplateById(templateId)?.title ?? null;
}

export function matchesStreamScheduleTemplate(
  params: {
    streamType: StreamShapeType;
    duration: string;
    cliffDays: string;
    recurringIntervalDays?: string;
    stepIntervalDays?: string;
    hybridUnlockDays?: string;
    hybridUnlockPercent?: string;
    trancheOffsetsDays?: string[];
    tranchePercentages?: string[];
    refillable?: boolean;
  },
  template: StreamScheduleTemplate,
) {
  if (
    params.streamType !== template.streamType ||
    params.duration !== template.duration ||
    params.cliffDays !== template.cliffDays
  ) {
    return false;
  }

  if (template.streamType === 'RECURRING') {
    return (
      params.recurringIntervalDays === template.recurringIntervalDays &&
      Boolean(params.refillable) === Boolean(template.refillable)
    );
  }

  if (template.streamType === 'STEP') {
    return params.stepIntervalDays === template.stepIntervalDays;
  }

  if (template.streamType === 'HYBRID') {
    return (
      params.hybridUnlockDays === template.hybridUnlockDays
      && params.hybridUnlockPercent === template.hybridUnlockPercent
    );
  }

  if (template.streamType === 'TRANCHE') {
    return (
      JSON.stringify(params.trancheOffsetsDays || []) === JSON.stringify(template.trancheOffsetsDays || [])
      && JSON.stringify(params.tranchePercentages || []) === JSON.stringify(template.tranchePercentages || [])
    );
  }

  return true;
}
