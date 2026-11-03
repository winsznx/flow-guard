import { Button } from './Button';
import { ArrowLeft, ArrowRight } from './Icon';
import { ACTIONS, showingRange } from '../../copy/common';

export type PaginationProps = { page: number; pageSize: number; total: number | null; onPage: (page: number) => void };

const NAV_LABEL = 'Pages';

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  if (total === 0 || pageSize <= 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = total === null ? page * pageSize : Math.min(page * pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = total === null || end < total;
  const summary = showingRange(start, end, total);

  return (
    <nav aria-label={NAV_LABEL} className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-small text-ink-secondary">
        {summary}
      </p>
      {hasPrevious || hasNext ? (
        <div className="flex items-center gap-2">
          {hasPrevious ? (
            <Button variant="ghost" size="sm" leadingIcon={ArrowLeft} onClick={() => onPage(page - 1)}>
              {ACTIONS.previous}
            </Button>
          ) : null}
          {hasNext ? (
            <Button variant="ghost" size="sm" trailingIcon={ArrowRight} onClick={() => onPage(page + 1)}>
              {ACTIONS.next}
            </Button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
