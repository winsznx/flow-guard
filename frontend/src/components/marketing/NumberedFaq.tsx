import React, { useId, useState } from 'react';
import { Icon, Minus, Plus } from '../ui/Icon';
import { cx } from '../ui/cx';

export type NumberedFaqProps = {
  items: { id: string; question: string; answer: React.ReactNode }[];
  className?: string;
};

function number(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function linkedItemId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  return hash ? decodeURIComponent(hash) : null;
}

export function NumberedFaq({ items, className }: NumberedFaqProps) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => {
    const linked = linkedItemId();
    return new Set(linked && items.some((item) => item.id === linked) ? [linked] : []);
  });

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className={cx('flex flex-col gap-3', className)}>
      {items.map((item, index) => {
        const open = openIds.has(item.id);
        const answerId = `${baseId}-${item.id}-answer`;
        return (
          <li key={item.id} id={item.id} className="scroll-mt-header rounded-card bg-surface shadow-raised">
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => toggle(item.id)}
                className="flex min-h-touch w-full items-center gap-4 rounded-card px-4 py-4 text-left sm:px-5"
              >
                <span className="shrink-0 font-mono text-label text-ink-muted">{number(index)}</span>
                <span className="min-w-0 flex-1 text-title-item text-ink">{item.question}</span>
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-secondary"
                >
                  <Icon icon={open ? Minus : Plus} size={16} />
                </span>
              </button>
            </h3>
            <div id={answerId} hidden={!open} className="px-4 pb-5 text-body text-ink-secondary sm:px-5 sm:pl-14">
              {item.answer}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
