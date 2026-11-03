import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

export type TooltipProps = { content: string; children: React.ReactElement };

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 100;
const GAP = 8;
const EDGE = 8;

const BUBBLE =
  'fixed z-(--z-menu) w-max max-w-popover wrap-anywhere rounded-control bg-inverse px-2.5 py-1.5 text-small text-ink-inverse shadow-overlay';

type Position = { top: number; left: number };

function place(anchor: DOMRect, floating: DOMRect): Position {
  const above = anchor.top - GAP - floating.height;
  const top = above >= EDGE ? above : anchor.bottom + GAP;
  const centered = anchor.left + anchor.width / 2 - floating.width / 2;
  const maxLeft = window.innerWidth - floating.width - EDGE;
  return { top, left: Math.max(EDGE, Math.min(centered, maxLeft)) };
}

/**
 * Visual only. Every caller also carries the same text for screen readers (an aria-label or
 * visually hidden text), so the bubble is aria-hidden and never the only copy of anything.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number>();
  const hideTimer = useRef<number>();

  const clearTimers = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  };

  const show = (target: HTMLElement, delay: number) => {
    clearTimers();
    if (delay === 0) {
      setAnchor(target);
      return;
    }
    showTimer.current = window.setTimeout(() => setAnchor(target), delay);
  };

  const hide = (delay: number) => {
    clearTimers();
    if (delay === 0) {
      setAnchor(null);
      return;
    }
    hideTimer.current = window.setTimeout(() => setAnchor(null), delay);
  };

  useEffect(() => clearTimers, []);

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) {
      setPosition(null);
      return;
    }
    setPosition(place(anchor.getBoundingClientRect(), bubbleRef.current.getBoundingClientRect()));
  }, [anchor, content]);

  useEffect(() => {
    if (!anchor) return;
    const dismiss = () => setAnchor(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor]);

  const own = children.props as React.HTMLAttributes<HTMLElement>;

  const trigger = React.cloneElement(children, {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      own.onPointerEnter?.(event);
      if (event.pointerType === 'mouse') show(event.currentTarget, SHOW_DELAY_MS);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      own.onPointerLeave?.(event);
      hide(HIDE_DELAY_MS);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      own.onFocus?.(event);
      if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget, 0);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      own.onBlur?.(event);
      hide(0);
    },
  });

  const container = anchor ? (anchor.closest('dialog[open]') ?? document.body) : null;

  return (
    <>
      {trigger}
      {anchor && container && content
        ? createPortal(
            <span
              ref={bubbleRef}
              aria-hidden="true"
              onPointerEnter={() => window.clearTimeout(hideTimer.current)}
              onPointerLeave={() => hide(HIDE_DELAY_MS)}
              style={{ ...(position ?? { top: 0, left: 0 }), maxWidth: `min(var(--container-popover), ${window.innerWidth - EDGE * 2}px)` }}
              className={cx(BUBBLE, !position && 'invisible')}
            >
              {content}
            </span>,
            container,
          )
        : null}
    </>
  );
}
