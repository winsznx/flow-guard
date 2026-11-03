import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx';

type TabItem = { key: string; label: string; count?: number } & ({ to: string } | { onSelect: () => void });

export type TabsProps = { label: string; items: TabItem[]; activeKey: string };

const ITEM =
  'inline-flex h-touch shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 -mb-px text-label transition-colors duration-(--duration-fast) ease-standard';
const ACTIVE = 'border-brand text-ink';
const IDLE = 'border-transparent text-ink-secondary hover:text-ink';
const ROW = 'relative flex gap-6 overflow-x-auto border-b border-line';
const FADE: Record<OverflowSide, string> = {
  none: '',
  start: 'mask-l-from-85%',
  end: 'mask-r-from-85%',
  both: 'mask-l-from-85% mask-r-from-85%',
};
const ACTIVE_SELECTOR = '[aria-current="page"], [aria-selected="true"]';
const EDGE_GAP = 24;

type OverflowSide = 'none' | 'start' | 'end' | 'both';

function overflowSide(row: HTMLElement): OverflowSide {
  const start = row.scrollLeft > 1;
  const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
  if (start && end) return 'both';
  if (start) return 'start';
  return end ? 'end' : 'none';
}

/** Keeps the active tab in view on narrow screens and fades the side that has more tabs past the edge. */
function useTabRow(activeKey: string) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<OverflowSide>('none');

  useLayoutEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>(ACTIVE_SELECTOR);
    if (!row || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - EDGE_GAP);
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + EDGE_GAP;
    setSide(overflowSide(row));
  }, [activeKey]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const update = () => setSide(overflowSide(row));
    update();
    row.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return { rowRef, fade: FADE[side] };
}

function Count({ count }: { count?: number }) {
  if (count === undefined) return null;
  return <span className="text-ink-muted">{count}</span>;
}

function isRouteItem(item: TabItem): item is TabItem & { to: string } {
  return 'to' in item;
}

export function Tabs({ label, items, activeKey }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { rowRef, fade } = useTabRow(activeKey);

  if (items.every(isRouteItem)) {
    return (
      <nav ref={rowRef} aria-label={label} className={cx(ROW, fade)}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              to={item.to}
              data-control
              aria-current={active ? 'page' : undefined}
              className={cx(ITEM, active ? ACTIVE : IDLE)}
            >
              {item.label}
              <Count count={item.count} />
            </Link>
          );
        })}
      </nav>
    );
  }

  const select = (index: number) => {
    const item = items[index];
    refs.current[index]?.focus();
    if ('onSelect' in item) item.onSelect();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    select(next[event.key]);
  };

  return (
    <div ref={rowRef} role="tablist" aria-label={label} className={cx(ROW, fade)}>
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(ITEM, IDLE, 'aria-selected:border-brand aria-selected:text-ink')}
          >
            {item.label}
            <Count count={item.count} />
          </button>
        );
      })}
    </div>
  );
}
