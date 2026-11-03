import { InsetBlock } from './InsetBlock';
import { cx } from './cx';
import type { Asset } from './types';
import { assetDecimals, formatAddress, formatAmount, formatCount, formatDate, formatIntervalDays } from '../../copy/format';

export type Schedule =
  | { kind: 'once'; amount: string; asset: Asset; on: number }
  | { kind: 'linear'; total: string; asset: Asset; start: number; end: number; waitUntil?: number }
  | { kind: 'step' | 'recurring'; perRelease: string; asset: Asset; everyDays: number; count: number; start: number }
  | { kind: 'upfront'; upfront: string; rest: string; asset: Asset; start: number; end: number }
  | { kind: 'custom'; releases: { amount: string; at: number }[]; asset: Asset }
  | { kind: 'per-claim'; perClaim: string; maxClaims: number | null; asset: Asset; closesAt?: number }
  | { kind: 'milestones'; milestones: { title: string; amount: string }[]; asset: Asset }
  | { kind: 'prize'; perWinner: string; winners: number; asset: Asset; endsAt?: number }
  | {
      kind: 'period-release';
      perPeriod: string;
      everyDays: number;
      periods: number;
      asset: Asset;
      vault: { id: string; name: string };
    };

export type PlanSentenceProps = {
  recipient?: { address: string; name?: string };
  schedule: Schedule;
  sticky?: boolean;
  /** Line shown while the schedule is missing something. Defaults to one that names what each kind needs. */
  incomplete?: string;
};

const RECIPIENT_FALLBACK = 'The recipient';
const INCOMPLETE: Record<Schedule['kind'], string> = {
  once: 'Add the amount and the date to see the plan.',
  linear: 'Add the amount and the dates to see the plan.',
  step: 'Add the amounts and dates to see the plan.',
  recurring: 'Add the amounts and dates to see the plan.',
  upfront: 'Add the amounts and dates to see the plan.',
  custom: 'Add the amounts and dates to see the plan.',
  'per-claim': 'Add the amount for each claim to see the plan.',
  milestones: 'Add the milestone amounts to see the plan.',
  prize: 'Add the prize to see the plan.',
  'period-release': 'Add the amount for each period to see the plan.',
};

/** Display amounts to smallest units, so totals are exact and never pass through floats. */
function toUnits(amount: string, asset: Asset): bigint | null {
  const decimals = assetDecimals(asset);
  const match = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim().replace(/,/g, ''));
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null;
  const fraction = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(`${match[1] || '0'}${fraction}`);
}

function sum(amounts: string[], asset: Asset, times = 1): string | null {
  let total = 0n;
  for (const amount of amounts) {
    const units = toUnits(amount, asset);
    if (units === null) return null;
    total += units;
  }
  return formatAmount(total * BigInt(Math.max(0, Math.trunc(times))), asset);
}

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`;
}

function who(recipient: PlanSentenceProps['recipient']): string {
  if (!recipient) return RECIPIENT_FALLBACK;
  return recipient.name?.trim() || formatAddress(recipient.address, 'short');
}

function clauses(...parts: (string | null | false | undefined)[]): string | null {
  return parts.every((part) => typeof part === 'string' && part.length > 0) ? parts.join('') : null;
}

function planSentenceText(schedule: Schedule, recipient?: PlanSentenceProps['recipient']): string | null {
  const name = who(recipient);
  const { asset } = schedule;
  const money = (value: string) => formatAmount(value, asset);
  const date = (value: number) => formatDate(value);
  let sentence: string | null;

  switch (schedule.kind) {
    case 'once':
      sentence = clauses(`${name} can claim `, money(schedule.amount), ' on ', date(schedule.on), '.');
      break;
    case 'linear': {
      const base = clauses(
        `${name} can claim `,
        money(schedule.total),
        ' bit by bit from ',
        date(schedule.start),
        ' to ',
        date(schedule.end),
        '.',
      );
      const wait = schedule.waitUntil ? clauses(' Nothing can be claimed before ', date(schedule.waitUntil), '.') : '';
      sentence = base && wait !== null ? `${base}${wait}` : null;
      break;
    }
    case 'step':
    case 'recurring':
      sentence = clauses(
        `${name} can claim `,
        money(schedule.perRelease),
        ' ',
        formatIntervalDays(schedule.everyDays),
        `, ${times(schedule.count)}, starting `,
        date(schedule.start),
        '. Total: ',
        sum([schedule.perRelease], asset, schedule.count),
        '.',
      );
      break;
    case 'upfront':
      sentence = clauses(
        `${name} can claim `,
        money(schedule.upfront),
        ' on ',
        date(schedule.start),
        ', then ',
        money(schedule.rest),
        ' bit by bit until ',
        date(schedule.end),
        '. Total: ',
        sum([schedule.upfront, schedule.rest], asset),
        '.',
      );
      break;
    case 'custom': {
      const releases = [...schedule.releases].sort((a, b) => a.at - b.at);
      if (releases.length === 0) {
        sentence = null;
      } else if (releases.length === 1) {
        sentence = clauses(`${name} can claim `, money(releases[0].amount), ' on ', date(releases[0].at), '.');
      } else {
        sentence = clauses(
          `${name} can claim ${releases.length} payments from `,
          date(releases[0].at),
          ' to ',
          date(releases[releases.length - 1].at),
          '. Total: ',
          sum(
            releases.map((release) => release.amount),
            asset,
          ),
          '.',
        );
      }
      break;
    }
    case 'per-claim': {
      const share = clauses('Each wallet can claim ', money(schedule.perClaim), ', once.');
      const limit =
        schedule.maxClaims === null
          ? ''
          : clauses(
              ` Up to ${formatCount(schedule.maxClaims, 'wallet', 'wallets')}. Total: `,
              sum([schedule.perClaim], asset, schedule.maxClaims),
              '.',
            );
      const closes = schedule.closesAt ? clauses(' Open until ', date(schedule.closesAt), '.') : '';
      sentence = share && limit !== null && closes !== null ? `${share}${limit}${closes}` : null;
      break;
    }
    case 'milestones': {
      const count = schedule.milestones.length;
      const total = sum(
        schedule.milestones.map((milestone) => milestone.amount),
        asset,
      );
      sentence =
        count === 0
          ? null
          : count === 1
            ? clauses(`1 milestone for ${name}, `, total, '. You release it when the work is done.')
            : clauses(`${count} milestones for ${name}, `, total, ' in all. You release each one when the work is done.');
      break;
    }
    case 'prize': {
      const base =
        schedule.winners === 1
          ? clauses(money(schedule.perWinner), ' for the winner.')
          : clauses(
              money(schedule.perWinner),
              ` for each winner, up to ${schedule.winners} winners. Total: `,
              sum([schedule.perWinner], asset, schedule.winners),
              '.',
            );
      const ends = schedule.endsAt ? clauses(' Open until ', date(schedule.endsAt), '.') : '';
      sentence = base && ends !== null ? `${base}${ends}` : null;
      break;
    }
    case 'period-release':
      sentence = clauses(
        money(schedule.perPeriod),
        ' ',
        formatIntervalDays(schedule.everyDays),
        ` from your wallet, listed under ${schedule.vault.name}. ${formatCount(schedule.periods, 'payment', 'payments')}, `,
        sum([schedule.perPeriod], asset, schedule.periods),
        ' in all.',
      );
      break;
  }

  return sentence;
}

export function PlanSentence({ recipient, schedule, sticky = false, incomplete }: PlanSentenceProps) {
  const shown = planSentenceText(schedule, recipient) ?? incomplete ?? INCOMPLETE[schedule.kind];
  return (
    <InsetBlock className={cx(sticky && 'lg:sticky lg:top-20')}>
      <p className="text-body text-ink">{shown}</p>
    </InsetBlock>
  );
}
