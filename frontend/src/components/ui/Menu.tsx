import React, { useEffect, useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './Button';
import { ArrowUpRight, ChevronDown, Ellipsis, Icon } from './Icon';
import { IconButton } from './IconButton';
import { cx } from './cx';

type MenuItem =
  | { label: string; icon?: LucideIcon; onSelect: () => void; tone?: 'danger' }
  | { label: string; to: string }
  | { label: string; href: string; external: true };

export type MenuTriggerProps = {
  ref: React.RefObject<HTMLButtonElement>;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
};

export type MenuProps = {
  label: string;
  /** A function renders a custom trigger. Spread the props onto a <button>. */
  trigger?: 'icon' | 'button' | ((props: MenuTriggerProps) => React.ReactNode);
  /** Non-item content shown above the items, such as a balance. */
  header?: React.ReactNode;
  items: MenuItem[];
};

const ITEM =
  'flex w-full min-h-control-md items-center gap-3 rounded-control px-3 text-left text-label transition-colors duration-(--duration-fast) ease-standard';
const ITEM_TONE = {
  plain: 'text-ink hover:bg-sunken focus-visible:bg-sunken',
  danger: 'text-danger-ink hover:bg-danger-tint focus-visible:bg-danger-tint',
} as const;

export function Menu({ label, trigger = 'icon', header, items }: MenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = itemRefs.current.findIndex((node) => node === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setOpen(true);
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => setOpen((value) => !value),
  };

  const setItemRef = (index: number) => (node: HTMLElement | null) => {
    itemRefs.current[index] = node;
  };

  return (
    <div ref={rootRef} className="relative inline-flex" onKeyDown={onTriggerKeyDown}>
      {typeof trigger === 'function' ? (
        trigger(triggerProps)
      ) : trigger === 'icon' ? (
        <IconButton icon={Ellipsis} label={label} {...triggerProps} />
      ) : (
        <Button variant="secondary" size="sm" trailingIcon={ChevronDown} {...triggerProps}>
          {label}
        </Button>
      )}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="on-surface absolute right-0 top-full z-(--z-menu) mt-2 flex w-max max-w-popover flex-col rounded-card bg-surface p-1.5 shadow-overlay"
        >
          {header ? (
            <>
              <div role="presentation" className="px-3 pb-3 pt-2">
                {header}
              </div>
              <div role="separator" className="mx-1.5 mb-1.5 border-t border-line" />
            </>
          ) : null}
          {items.map((item, index) => {
            if ('onSelect' in item) {
              return (
                <button
                  key={item.label}
                  ref={setItemRef(index)}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close(true);
                    item.onSelect();
                  }}
                  className={cx(ITEM, ITEM_TONE[item.tone === 'danger' ? 'danger' : 'plain'])}
                >
                  {item.icon ? (
                    <span aria-hidden="true" className={cx('inline-flex', item.tone !== 'danger' && 'text-ink-muted')}>
                      <Icon icon={item.icon} size={16} />
                    </span>
                  ) : null}
                  {item.label}
                </button>
              );
            }
            if ('to' in item) {
              return (
                <Link
                  key={item.label}
                  ref={setItemRef(index)}
                  to={item.to}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => setOpen(false)}
                  className={cx(ITEM, ITEM_TONE.plain)}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.label}
                ref={setItemRef(index)}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={cx(ITEM, ITEM_TONE.plain, 'justify-between')}
              >
                {item.label}
                <span className="sr-only">, opens in a new tab</span>
                <span aria-hidden="true" className="inline-flex text-ink-muted">
                  <Icon icon={ArrowUpRight} size={16} />
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
