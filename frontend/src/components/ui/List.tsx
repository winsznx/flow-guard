import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { ListRows } from './ListRows';
import { ListTable, type ListProps } from './ListTable';

export type { Column, ColumnWidth, ListProps, ListState } from './ListTable';

const TABLE_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(TABLE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readWide(): boolean {
  return window.matchMedia(TABLE_QUERY).matches;
}

function readWideOnServer(): boolean {
  return true;
}

export type ResponsiveListProps<Row> = ListProps<Row> & {
  /** Switch to rows whenever the list's own box is narrower than this, for lists placed in a side column. */
  minTableWidth?: number;
};

function useContainerWidth(enabled: boolean): [RefObject<HTMLDivElement>, number | null] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return [ref, width];
}

export function List<Row>({ minTableWidth, ...props }: ResponsiveListProps<Row>): JSX.Element {
  const viewportWide = useSyncExternalStore(subscribe, readWide, readWideOnServer);
  const [ref, width] = useContainerWidth(minTableWidth !== undefined);
  const roomy = minTableWidth === undefined || width === null || width >= minTableWidth;
  const list = viewportWide && roomy ? <ListTable {...props} /> : <ListRows {...props} />;

  if (minTableWidth === undefined) return list;
  return (
    <div ref={ref} className="min-w-0">
      {list}
    </div>
  );
}
