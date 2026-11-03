import React from 'react';
import { ChevronDown, ChevronUp, Icon } from './Icon';

export type AccordionProps = {
  items: { id: string; title: string; content: React.ReactNode; number?: string }[];
  variant?: 'plain' | 'numbered';
};

export function Accordion({ items, variant = 'plain' }: AccordionProps) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <details key={item.id} id={item.id} className="group border-t border-line first:border-t-0">
          <summary className="flex min-h-touch cursor-pointer list-none items-center gap-4 py-3 text-title-item text-ink">
            {variant === 'numbered' && item.number ? (
              <span className="shrink-0 text-label text-ink-muted">{item.number}</span>
            ) : null}
            <span className="min-w-0 flex-1">{item.title}</span>
            <span aria-hidden="true" className="inline-flex shrink-0 text-ink-muted group-open:hidden">
              <Icon icon={ChevronDown} size={20} />
            </span>
            <span aria-hidden="true" className="hidden shrink-0 text-ink-muted group-open:inline-flex">
              <Icon icon={ChevronUp} size={20} />
            </span>
          </summary>
          <div className="pb-4 text-body text-ink-secondary">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
