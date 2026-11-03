import React, { useEffect, useRef } from 'react';
import { BUTTON_LINK_BASE, BUTTON_VARIANTS } from './Button';
import { Notice } from './Notice';
import { cx } from './cx';

export type ErrorSummaryProps = {
  title: string;
  message: string;
  fields?: { label: string; id: string }[];
  /** Off for a summary that sits in a static page, where taking focus on load would move the reader. */
  autoFocus?: boolean;
};

function focusField(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.focus();
  target.scrollIntoView({ block: 'center' });
}

export function ErrorSummary({ title, message, fields = [], autoFocus = true }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, title, message]);

  return (
    <div ref={ref} tabIndex={-1}>
      <Notice tone="danger" title={title} live="assertive">
        <p>{message}</p>
        {fields.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {fields.map((field) => (
              <li key={field.id}>
                <a
                  href={`#${field.id}`}
                  data-inline
                  onClick={(event) => focusField(event, field.id)}
                  className={cx(BUTTON_LINK_BASE, BUTTON_VARIANTS.link)}
                >
                  {field.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Notice>
    </div>
  );
}
