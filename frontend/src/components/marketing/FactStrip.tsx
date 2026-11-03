import { Check, Icon } from '../ui/Icon';
import { cx } from '../ui/cx';

export type FactStripProps = { facts: [string, string, string]; className?: string };

export function FactStrip({ facts, className }: FactStripProps) {
  return (
    <ul
      className={cx(
        'flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-3 sm:divide-x sm:divide-line',
        className,
      )}
    >
      {facts.map((fact) => (
        <li key={fact} className="flex items-center gap-2 text-label text-ink-secondary sm:px-6 sm:first:pl-0 sm:last:pr-0">
          <span aria-hidden="true" className="inline-flex text-brand">
            <Icon icon={Check} size={16} />
          </span>
          {fact}
        </li>
      ))}
    </ul>
  );
}
