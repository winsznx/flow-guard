import React, { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Plus, X } from './Icon';
import { IconButton } from './IconButton';
import { InsetBlock } from './InsetBlock';

export type RepeatableRowsProps<Row> = {
  legend: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  makeRow: () => Row;
  min?: number;
  max?: number;
  addLabel: string;
  renderRow: (row: Row, i: number, update: (r: Row) => void) => React.ReactNode;
  rowKey: (row: Row) => string;
};

const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

export function RepeatableRows<Row>({
  legend,
  rows,
  onChange,
  makeRow,
  min = 1,
  max,
  addLabel,
  renderRow,
  rowKey,
}: RepeatableRowsProps<Row>) {
  const rowElements = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    rowElements.current.get(key)?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [rows]);

  const canRemove = rows.length > min;
  const atMax = max !== undefined && rows.length >= max;

  const add = () => {
    const row = makeRow();
    pendingFocus.current = rowKey(row);
    onChange([...rows, row]);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    const neighbour = next[Math.max(0, index - 1)];
    pendingFocus.current = neighbour ? rowKey(neighbour) : null;
    onChange(next);
  };

  const update = (index: number) => (row: Row) => {
    onChange(rows.map((current, i) => (i === index ? row : current)));
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-label text-ink">{legend}</legend>
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const key = rowKey(row);
          return (
            <li
              key={key}
              ref={(element) => {
                if (element) rowElements.current.set(key, element);
                else rowElements.current.delete(key);
              }}
            >
              <InsetBlock className="flex items-start gap-3">
                <div className="grid min-w-0 flex-1 gap-3 sm:auto-cols-fr sm:grid-flow-col">{renderRow(row, index, update(index))}</div>
                {canRemove ? (
                  <IconButton icon={X} label={`Remove row ${index + 1}`} size="sm" onClick={() => remove(index)} className="mt-7" />
                ) : null}
              </InsetBlock>
            </li>
          );
        })}
      </ul>
      {atMax ? null : (
        <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={add} className="mt-3">
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}
