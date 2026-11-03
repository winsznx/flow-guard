import { Check, Icon, X } from '../ui/Icon';
import { Heading } from '../ui/Heading';
import { cx } from '../ui/cx';

type Mark = 'yes' | 'no' | 'partly';

export type ComparisonTableProps = {
  needs: string[];
  options: { name: string; highlight?: boolean; marks: Mark[] }[];
  className?: string;
};

const NEEDS_HEADER = 'What you need';

const MARK_WORD: Record<Mark, string> = {
  yes: 'Yes',
  no: 'No',
  partly: 'Partly',
};

function number(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function MarkCell({ mark }: { mark: Mark | undefined }) {
  if (mark === 'partly') return <span className="text-label text-ink">{MARK_WORD.partly}</span>;
  if (mark === undefined) return null;
  return (
    <span className="inline-flex text-ink">
      <span aria-hidden="true" className="inline-flex">
        <Icon icon={mark === 'yes' ? Check : X} size={20} />
      </span>
      <span className="sr-only">{MARK_WORD[mark]}</span>
    </span>
  );
}

export function ComparisonTable({ needs, options, className }: ComparisonTableProps) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-sunken">
              <th scope="col" className="px-4 py-3 text-label text-ink-secondary">
                {NEEDS_HEADER}
              </th>
              {options.map((option) => (
                <th
                  key={option.name}
                  scope="col"
                  className={cx(
                    'px-4 py-3 text-center text-label text-ink',
                    option.highlight && 'border-x border-brand bg-brand-soft',
                  )}
                >
                  {option.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {needs.map((need, row) => (
              <tr key={need} className="border-t border-line">
                <th scope="row" className="px-4 py-3 text-left text-body font-normal text-ink">
                  <span className="mr-3 text-small text-ink-muted">{number(row)}</span>
                  {need}
                </th>
                {options.map((option) => (
                  <td
                    key={option.name}
                    className={cx('px-4 py-3 text-center', option.highlight && 'border-x border-brand bg-brand-soft')}
                  >
                    <MarkCell mark={option.marks[row]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-4 md:hidden">
        {options.map((option) => (
          <li
            key={option.name}
            className={cx(
              'rounded-card border p-4',
              option.highlight ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
            )}
          >
            <Heading level="item">{option.name}</Heading>
            <dl className="mt-3 flex flex-col">
              {needs.map((need, row) => (
                <div key={need} className="flex items-center justify-between gap-4 border-t border-line py-2 first:border-t-0">
                  <dt className="text-small text-ink-secondary">{need}</dt>
                  <dd className="shrink-0">
                    <MarkCell mark={option.marks[row]} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
