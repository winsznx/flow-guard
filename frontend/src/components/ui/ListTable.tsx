import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Button';
import { Card } from './Card';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Icon } from './Icon';
import { Skeleton } from './Skeleton';
import { cx } from './cx';

export type ColumnWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  align?: 'start' | 'end';
  sortable?: boolean;
  primary?: boolean;
  mobile?: 'top' | 'bottom-start' | 'bottom-end' | 'hidden';
  /** Fixed column width on wide screens. Give stacked tables the same widths so their columns line up. */
  width?: ColumnWidth;
  /** Extra classes for this column's header and cells in the table layout. */
  className?: string;
  /** Words shown muted before the value in the phone card, where the column header isn't visible. */
  mobileLabel?: string;
};

const COLUMN_WIDTHS: Record<ColumnWidth, string> = {
  xs: 'w-20',
  sm: 'w-28',
  md: 'w-32',
  lg: 'w-popover',
  xl: 'w-sidebar',
};

export type ListState = 'loading' | 'error' | 'empty' | 'no-results' | 'ready';

export type ListProps<Row> = {
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  onRowOpen?: (row: Row) => void;
  rowAction?: (row: Row) => React.ReactNode;
  state: ListState;
  empty: React.ReactNode;
  noResults: React.ReactNode;
  error: React.ReactNode;
  collapsed?: { label: string; rows: Row[] };
  sort?: { key: string; direction: 'asc' | 'desc'; onChange: (key: string) => void };
  /** `fixed` sizes columns from their `width` alone, so two tables with the same columns line up. */
  tableLayout?: 'auto' | 'fixed';
};

const LOADING_ROWS = 5;

export const STRETCHED_TARGET =
  'text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus focus-visible:after:outline-solid';

function primaryColumn<Row>(columns: Column<Row>[]): Column<Row> | undefined {
  return columns.find((column) => column.primary) ?? columns[0];
}

export function RowTarget<Row>({
  row,
  rowHref,
  onRowOpen,
  children,
}: Pick<ListProps<Row>, 'rowHref' | 'onRowOpen'> & { row: Row; children: React.ReactNode }) {
  if (rowHref) {
    return (
      <Link to={rowHref(row)} className={cx('block', STRETCHED_TARGET)}>
        {children}
      </Link>
    );
  }
  if (onRowOpen) {
    return (
      <button type="button" onClick={() => onRowOpen(row)} className={cx('block w-full', STRETCHED_TARGET)}>
        {children}
      </button>
    );
  }
  return <>{children}</>;
}

export function RowActionSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-(--z-sticky) inline-flex" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

export function ListShell<Row>({
  state,
  empty,
  noResults,
  error,
  children,
}: Pick<ListProps<Row>, 'state' | 'empty' | 'noResults' | 'error'> & { children: React.ReactNode }) {
  if (state === 'ready') return <>{children}</>;
  if (state === 'loading') {
    return (
      <Card padding="none">
        <Skeleton kind="row" lines={LOADING_ROWS} />
      </Card>
    );
  }
  const content = state === 'error' ? error : state === 'empty' ? empty : noResults;
  return <Card padding="none">{content}</Card>;
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (direction === 'asc') return <Icon icon={ArrowUp} size={16} />;
  if (direction === 'desc') return <Icon icon={ArrowDown} size={16} />;
  return <Icon icon={ArrowUpDown} size={16} />;
}

export function ListTable<Row>(props: ListProps<Row>) {
  const { label, columns, rows, rowKey, rowHref, onRowOpen, rowAction, collapsed, sort, tableLayout = 'auto' } = props;
  const [showCollapsed, setShowCollapsed] = useState(false);
  const primary = primaryColumn(columns);
  const opens = Boolean(rowHref || onRowOpen);
  const visibleRows = collapsed && showCollapsed ? [...rows, ...collapsed.rows] : rows;
  const span = columns.length + (rowAction ? 1 : 0) + (opens ? 1 : 0);

  const head = 'sticky top-0 z-(--z-sticky) h-control-md bg-sunken px-4 text-label text-ink-secondary';

  return (
    <ListShell {...props}>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className={cx('w-full border-collapse text-left', tableLayout === 'fixed' && 'table-fixed')}>
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const active = sort && sort.key === column.key ? sort.direction : null;
                  const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={column.sortable && sort ? (ariaSort ?? 'none') : undefined}
                      className={cx(
                        head,
                        column.align === 'end' ? 'text-right' : 'text-left',
                        column.width && COLUMN_WIDTHS[column.width],
                        column.className,
                      )}
                    >
                      {column.sortable && sort ? (
                        <button
                          type="button"
                          onClick={() => sort.onChange(column.key)}
                          className={cx(
                            'inline-flex items-center gap-1 rounded-inline transition-colors duration-(--duration-fast) ease-standard hover:text-ink',
                            active && 'text-ink',
                          )}
                        >
                          {column.header}
                          <SortIcon direction={active} />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
                {rowAction ? (
                  <th scope="col" className={cx(head, tableLayout === 'fixed' && 'w-32')}>
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
                {opens ? <th aria-hidden="true" className={cx(head, 'w-10')} /> : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cx(
                    'relative h-row border-t border-line text-small text-ink-secondary',
                    opens && 'transition-colors duration-(--duration-fast) ease-standard hover:bg-sunken',
                  )}
                >
                  {columns.map((column) => {
                    const isPrimary = column === primary;
                    return (
                      <td
                        key={column.key}
                        className={cx(
                          'px-4 py-3 align-middle',
                          column.align === 'end' ? 'text-right' : 'text-left',
                          isPrimary && 'text-title-item text-ink',
                          column.width && COLUMN_WIDTHS[column.width],
                          column.className,
                        )}
                      >
                        {isPrimary ? (
                          <RowTarget row={row} rowHref={rowHref} onRowOpen={onRowOpen}>
                            {column.cell(row)}
                          </RowTarget>
                        ) : (
                          column.cell(row)
                        )}
                      </td>
                    );
                  })}
                  {rowAction ? (
                    <td className="px-4 py-3 text-right align-middle">
                      <RowActionSlot>{rowAction(row)}</RowActionSlot>
                    </td>
                  ) : null}
                  {opens ? (
                    <td aria-hidden="true" className="w-10 pr-4 text-right align-middle text-ink-muted">
                      <Icon icon={ChevronRight} size={16} />
                    </td>
                  ) : null}
                </tr>
              ))}
              {collapsed && collapsed.rows.length > 0 ? (
                <tr className="border-t border-line">
                  <td colSpan={span} className="px-2 py-2">
                    <Button variant="ghost" size="sm" aria-expanded={showCollapsed} onClick={() => setShowCollapsed((v) => !v)}>
                      {collapsed.label}
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </ListShell>
  );
}
