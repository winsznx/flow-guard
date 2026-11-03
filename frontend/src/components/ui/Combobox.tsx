import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Icon } from './Icon';
import { FIELD_CHOICE_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';

export type ComboboxOption<V extends string> = {
  value: V;
  label: string;
  description?: string;
  icon?: React.ReactNode;
};

export type ComboboxProps<V extends string> = FieldBase & {
  label: string;
  options: ComboboxOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  id?: string;
  className?: string;
};

const TYPEAHEAD_RESET_MS = 600;

export function Combobox<V extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  helper,
  error,
  name,
  disabled = false,
  required,
  onBlur,
  id,
  className,
}: ComboboxProps<V>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, listId]);

  const openAt = (index: number) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(Math.min(Math.max(index, 0), options.length - 1));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  const findByText = (key: string): number => {
    const now = Date.now();
    const text = now - typeahead.current.at > TYPEAHEAD_RESET_MS ? key : typeahead.current.text + key;
    typeahead.current = { text, at: now };
    const start = open ? activeIndex + (text.length === 1 ? 1 : 0) : selectedIndex + 1;
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find((option) => option.label.toLowerCase().startsWith(text.toLowerCase()));
    return match ? options.indexOf(match) : -1;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) setActiveIndex((index) => Math.min(index + 1, last));
        else openAt(selectedIndex >= 0 ? selectedIndex : 0);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (open) setActiveIndex((index) => Math.max(index - 1, 0));
        else openAt(selectedIndex >= 0 ? selectedIndex : last);
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open && activeIndex >= 0) choose(activeIndex);
        else openAt(selectedIndex >= 0 ? selectedIndex : 0);
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        close();
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const match = findByText(event.key);
          if (match >= 0) openAt(match);
        }
    }
  };

  return (
    <Field label={label} helper={helper} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <div ref={rootRef} className="relative">
          <button
            ref={triggerRef}
            id={fieldId}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-disabled={disabled || undefined}
            onClick={() => (open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            className={cx(
              FIELD_CHOICE_CONTROL,
              FIELD_HEIGHT.regular,
              'flex items-center gap-3 pr-9 text-left',
              disabled && 'cursor-not-allowed bg-sunken text-ink-secondary border-line',
            )}
          >
            {selected?.icon ? <span className="inline-flex shrink-0">{selected.icon}</span> : null}
            <span className={cx('min-w-0 flex-1 truncate', !selected && 'text-ink-muted')}>{selected?.label ?? placeholder}</span>
            <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 text-ink-muted">
              <Icon icon={ChevronDown} size={16} />
            </span>
          </button>
          {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={fieldId}
            hidden={!open}
            className="on-surface absolute inset-x-0 top-full z-(--z-menu) mt-1 max-h-sheet overflow-y-auto rounded-card bg-surface p-1.5 shadow-overlay"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                data-active={index === activeIndex || undefined}
                onPointerMove={() => setActiveIndex(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className="flex min-h-control-md cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 text-body text-ink data-active:bg-sunken aria-selected:bg-brand-soft aria-selected:text-brand-hover"
              >
                {option.icon ? <span className="inline-flex shrink-0">{option.icon}</span> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.description ? <span className="text-small text-ink-secondary">{option.description}</span> : null}
                </span>
                {option.value === value ? (
                  <span className="inline-flex shrink-0">
                    <Icon icon={Check} size={16} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Field>
  );
}
