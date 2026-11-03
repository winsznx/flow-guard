import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cx } from './cx';
import { GLOSSARY, firstMention, glossaryHelp, type GlossaryKey } from '../../copy/glossary';

export type TermHintProps = { term: GlossaryKey; children?: React.ReactNode };

const GAP = 4;
const EDGE = 8;

type Position = { top: number; left: number };

function place(anchor: DOMRect, floating: DOMRect): Position {
  const below = anchor.bottom + GAP;
  const fitsBelow = below + floating.height <= window.innerHeight - EDGE;
  const top = fitsBelow ? below : Math.max(EDGE, anchor.top - GAP - floating.height);
  const maxLeft = window.innerWidth - floating.width - EDGE;
  return { top, left: Math.max(EDGE, Math.min(anchor.left, maxLeft)) };
}

const POPOVER =
  'on-surface fixed z-(--z-menu) w-max max-w-popover rounded-card bg-surface p-3 text-small text-ink shadow-overlay';

export function TermHint({ term, children }: TermHintProps) {
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const helpRef = useRef<HTMLAnchorElement>(null);
  const explanation = firstMention(term);
  const help = glossaryHelp(term);
  const label = children ?? GLOSSARY[term].use;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) {
      setPosition(null);
      return;
    }
    setPosition(place(triggerRef.current.getBoundingClientRect(), popoverRef.current.getBoundingClientRect()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (popoverRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (triggerRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (!explanation) return <>{label}</>;

  const container = open && triggerRef.current ? (triggerRef.current.closest('dialog[open]') ?? document.body) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-inline
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || event.shiftKey || !open || !helpRef.current) return;
          event.preventDefault();
          helpRef.current.focus();
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && popoverRef.current?.contains(event.relatedTarget)) return;
          setOpen(false);
        }}
        className="inline cursor-help text-inherit underline decoration-ink-muted decoration-dotted decoration-1 underline-offset-4"
      >
        {label}
      </button>
      {container
        ? createPortal(
            <span
              ref={popoverRef}
              id={popoverId}
              role={help ? undefined : 'tooltip'}
              style={position ?? { top: 0, left: 0 }}
              className={cx(POPOVER, !position && 'invisible', help && 'flex flex-col gap-2')}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && (popoverRef.current?.contains(next) || triggerRef.current?.contains(next))) return;
                setOpen(false);
              }}
            >
              <span>{explanation}</span>
              {help ? (
                <Link
                  ref={helpRef}
                  to={help.path}
                  onClick={() => setOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Tab') return;
                    event.preventDefault();
                    triggerRef.current?.focus();
                    if (!event.shiftKey) setOpen(false);
                  }}
                  className="text-label text-brand underline underline-offset-4 hover:text-brand-hover"
                >
                  {help.label}
                </Link>
              ) : null}
            </span>,
            container,
          )
        : null}
    </>
  );
}
