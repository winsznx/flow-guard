import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BUTTON_LINK_BASE, BUTTON_VARIANTS, Button } from './Button';
import { IconButton } from './IconButton';
import { ArrowUpRight, CircleAlert, CircleCheck, Icon, Info, X } from './Icon';
import { cx } from './cx';
import { ACTIONS, LABELS } from '../../copy/common';

export type ToastInput = {
  tone: 'success' | 'info' | 'danger';
  title: string;
  line?: string;
  link?: { label: string; href: string };
  action?: { label: string; onClick: () => void };
};

type ToastApi = { toast: (t: ToastInput) => void };

type ToastItem = ToastInput & { id: number };

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;
const HELD_CHECK_MS = 250;
/** Clearing the live regions first, then writing after a pause, makes a repeated message read out again. */
const ANNOUNCE_DELAY_MS = 100;

const TONE: Record<ToastInput['tone'], { icon: string; glyph: LucideIcon }> = {
  success: { icon: 'text-success-dot', glyph: CircleCheck },
  info: { icon: 'text-info-dot', glyph: Info },
  danger: { icon: 'text-danger-dot', glyph: CircleAlert },
};

const ToastContext = createContext<ToastApi | null>(null);

function modalDialogIsOpen(): boolean {
  return document.querySelector('dialog:modal') !== null;
}

function spokenText(inputs: ToastInput[]): string {
  return inputs.map((input) => (input.line ? `${input.title}. ${input.line}` : input.title)).join(' ');
}

function mustReachPerson(input: ToastInput): boolean {
  return input.tone === 'danger' || Boolean(input.link) || Boolean(input.action);
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const persistent = item.tone === 'danger';
  const [paused, setPaused] = useState(false);
  const remaining = useRef(AUTO_DISMISS_MS);
  const look = TONE[item.tone];

  useEffect(() => {
    if (persistent || paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [item.id, onDismiss, paused, persistent]);

  return (
    <li
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className="pointer-events-auto flex w-full max-w-toast gap-3 rounded-card border border-line bg-surface p-4 shadow-overlay transition-opacity duration-(--duration-base) ease-standard starting:opacity-0"
    >
      <span className={cx('mt-0.5 inline-flex shrink-0', look.icon)}>
        <Icon icon={look.glyph} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-title-item text-ink">{item.title}</p>
        {item.line ? <p className="text-small text-ink-secondary">{item.line}</p> : null}
        {item.link || item.action ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
            {item.link ? (
              <a
                href={item.link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-inline
                className={cx(BUTTON_LINK_BASE, BUTTON_VARIANTS.link, 'inline-flex items-center gap-1')}
              >
                {item.link.label}
                <span className="sr-only">, opens in a new tab</span>
                <Icon icon={ArrowUpRight} size={16} />
              </a>
            ) : null}
            {item.action ? (
              <Button variant="link" onClick={item.action.onClick}>
                {item.action.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <IconButton icon={X} label={ACTIONS.close} size="sm" onClick={() => onDismiss(item.id)} className="-mr-1 -mt-1" />
    </li>
  );
}

/**
 * Toasts confirm small things. A plain confirmation is dropped while a modal dialog is open,
 * because the outcome of anything done in a dialog shows inside that dialog. Errors and
 * toasts that carry a link or an action wait until the dialog closes, so nothing the
 * person needs is lost.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [held, setHeld] = useState<ToastInput[]>([]);
  const nextId = useRef(0);
  const [spoken, setSpoken] = useState({ polite: '', assertive: '' });
  const speakTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(speakTimer.current), []);

  const announce = useCallback((inputs: ToastInput[]) => {
    const next = {
      polite: spokenText(inputs.filter((input) => input.tone !== 'danger')),
      assertive: spokenText(inputs.filter((input) => input.tone === 'danger')),
    };
    setSpoken({ polite: '', assertive: '' });
    window.clearTimeout(speakTimer.current);
    speakTimer.current = window.setTimeout(() => setSpoken(next), ANNOUNCE_DELAY_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((inputs: ToastInput[]) => {
    const added = inputs.map((input) => {
      nextId.current += 1;
      return { ...input, id: nextId.current };
    });
    setItems((current) => [...current, ...added].slice(-MAX_TOASTS));
    announce(inputs);
  }, [announce]);

  const toast = useCallback(
    (input: ToastInput) => {
      if (!modalDialogIsOpen()) {
        show([input]);
        return;
      }
      if (mustReachPerson(input)) setHeld((current) => [...current, input]);
    },
    [show],
  );

  useEffect(() => {
    if (held.length === 0) return;
    const timer = window.setInterval(() => {
      if (modalDialogIsOpen()) return;
      show(held);
      setHeld([]);
    }, HELD_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [held, show]);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <p aria-live="polite" className="sr-only">
        {spoken.polite}
      </p>
      <p role="alert" className="sr-only">
        {spoken.assertive}
      </p>
      <section
        aria-label={LABELS.notifications}
        className="pointer-events-none fixed inset-x-4 bottom-4 z-(--z-toast) pb-(--safe-bottom) sm:inset-x-auto sm:bottom-6 sm:right-6"
      >
        <ol className="flex flex-col items-center gap-3 sm:items-end">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- PLAN 2.7 keeps the hook beside its provider
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('Toasts need a toast provider higher in the tree.');
  return api;
}
