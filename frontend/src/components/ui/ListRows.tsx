import { useState } from 'react';
import { Button } from './Button';
import { ListShell, RowActionSlot, RowTarget, type Column, type ListProps } from './ListTable';
import { cx } from './cx';

type Zone = 'top' | 'bottom-start' | 'bottom-end';

function MobileCell<Row>({ column, row }: { column: Column<Row>; row: Row }) {
  if (!column.mobileLabel) return <span>{column.cell(row)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="text-ink-muted">{column.mobileLabel}</span>
      {column.cell(row)}
    </span>
  );
}

function zoneOf<Row>(column: Column<Row>, primary: Column<Row> | undefined): Zone | 'primary' | 'hidden' {
  if (column === primary) return 'primary';
  return column.mobile ?? 'bottom-start';
}

export function ListRows<Row>(props: ListProps<Row>) {
  const { label, columns, rows, rowKey, rowHref, onRowOpen, rowAction, collapsed } = props;
  const [showCollapsed, setShowCollapsed] = useState(false);
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const opens = Boolean(rowHref || onRowOpen);
  const visibleRows = collapsed && showCollapsed ? [...rows, ...collapsed.rows] : rows;
  const inZone = (zone: Zone) => columns.filter((column) => zoneOf(column, primary) === zone);
  const top = inZone('top');
  const bottomStart = inZone('bottom-start');
  const bottomEnd = inZone('bottom-end');
  const hasBottom = bottomStart.length > 0 || bottomEnd.length > 0 || Boolean(rowAction);

  return (
    <ListShell {...props}>
      <div className="flex flex-col gap-3">
        <ul aria-label={label} className="flex flex-col gap-3">
          {visibleRows.map((row) => (
            <li
              key={rowKey(row)}
              className={cx(
                'relative rounded-card border border-line bg-surface text-small text-ink-secondary',
                opens && 'transition-colors duration-(--duration-fast) ease-standard hover:bg-sunken',
              )}
            >
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 text-title-item text-ink">
                  {primary ? (
                    <RowTarget row={row} rowHref={rowHref} onRowOpen={onRowOpen}>
                      {primary.cell(row)}
                    </RowTarget>
                  ) : null}
                </div>
                {top.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {top.map((column) => (
                      <MobileCell key={column.key} column={column} row={row} />
                    ))}
                  </div>
                ) : null}
              </div>
              {hasBottom ? (
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    {bottomStart.map((column) => (
                      <MobileCell key={column.key} column={column} row={row} />
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    {bottomEnd.map((column) => (
                      <MobileCell key={column.key} column={column} row={row} />
                    ))}
                    {rowAction ? <RowActionSlot>{rowAction(row)}</RowActionSlot> : null}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {collapsed && collapsed.rows.length > 0 ? (
          <div>
            <Button variant="ghost" size="sm" aria-expanded={showCollapsed} onClick={() => setShowCollapsed((v) => !v)}>
              {collapsed.label}
            </Button>
          </div>
        ) : null}
      </div>
    </ListShell>
  );
}
