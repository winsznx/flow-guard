import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { ACTIONS, TOASTS } from '../../copy/common';
import { COPY_FIELD_INPUT } from './classes';

export type CopyFieldProps = { label: string; value: string };

const RESET_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyField({ label, value }: CopyFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') return undefined;
    const timer = window.setTimeout(() => setState('idle'), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch (error) {
      console.warn('Clipboard write was refused', error);
      inputRef.current?.select();
      setState('failed');
    }
  };

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-1.5 text-label text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          readOnly
          value={value}
          aria-describedby={state === 'failed' ? `${id}-problem` : undefined}
          onFocus={(e) => e.currentTarget.select()}
          className={COPY_FIELD_INPUT}
        />
        <Button size="sm" variant="secondary" onClick={() => void copy()} className="absolute right-1.5 top-1/2 -translate-y-1/2">
          {state === 'copied' ? TOASTS.copied : ACTIONS.copyLink}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? TOASTS.linkCopied : ''}
      </span>
      {state === 'failed' ? (
        <p id={`${id}-problem`} role="alert" className="mt-1.5 text-small text-ink-secondary">
          {TOASTS.copyFailed}
        </p>
      ) : null}
    </div>
  );
}
