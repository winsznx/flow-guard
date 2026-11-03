import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from './Icon';
import { IconButton } from './IconButton';
import { TOASTS } from '../../copy/common';

export type CopyButtonProps = { value: string; label: string; size?: 'sm' | 'md' };

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_AFTER_MS = 2000;

export function CopyButton({ value, label, size = 'sm' }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const showFor = (next: CopyState) => {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), RESET_AFTER_MS);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showFor('copied');
    } catch (error) {
      console.warn('Clipboard write failed', error);
      showFor('failed');
    }
  };

  const message = state === 'copied' ? TOASTS.copied : state === 'failed' ? TOASTS.copyFailed : '';

  return (
    <span className="inline-flex">
      <IconButton icon={state === 'copied' ? Check : Copy} label={label} size={size} onClick={() => void copy()} />
      <span role="status" className="sr-only">
        {message}
      </span>
    </span>
  );
}
