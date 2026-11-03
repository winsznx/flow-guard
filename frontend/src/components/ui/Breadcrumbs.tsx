import { Link } from 'react-router-dom';
import { ChevronRight, Icon } from './Icon';

export type BreadcrumbsProps = { items: { label: string; to?: string }[] };

const NAV_LABEL = 'Breadcrumb';

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  const last = items.length - 1;

  return (
    <nav aria-label={NAV_LABEL} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-small text-ink-muted">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
            {index === last ? (
              <span aria-current="page" className="truncate text-ink">
                {item.label}
              </span>
            ) : item.to ? (
              <Link
                to={item.to}
                data-control
                className="inline-flex items-center truncate transition-colors duration-(--duration-fast) ease-standard hover:text-ink pointer-coarse:min-h-touch"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate">{item.label}</span>
            )}
            {index < last ? (
              <span aria-hidden="true" className="inline-flex shrink-0">
                <Icon icon={ChevronRight} size={16} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
