import React, { useId, useRef } from 'react';
import { Icon, Search, X } from './Icon';
import { IconButton } from './IconButton';
import { FIELD_CONTROL, FIELD_HEIGHT } from './Field';
import { cx } from './cx';
import { ACTIONS } from '../../copy/common';

export type SearchInputProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  className?: string;
};

export function SearchInput({ label, placeholder, value, onChange, onSubmit, className }: SearchInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(value);
  };

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <form role="search" onSubmit={handleSubmit} className={cx('min-w-0', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 inline-flex -translate-y-1/2 text-ink-muted">
          <Icon icon={Search} size={16} />
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cx(FIELD_CONTROL, FIELD_HEIGHT.regular, 'pl-9', value && 'pr-12')}
        />
        {value ? (
          <IconButton
            icon={X}
            label={ACTIONS.clearSearch}
            size="sm"
            onClick={clear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          />
        ) : null}
      </div>
    </form>
  );
}
