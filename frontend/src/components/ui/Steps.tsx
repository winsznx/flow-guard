import { useEffect, useRef } from 'react';
import { Check, Icon } from './Icon';
import { cx } from './cx';
import { stepOf } from '../../copy/common';

export type StepsProps = { steps: { key: string; label: string }[]; current: string; onBack?: (key: string) => void };

const DONE_WORD = '(done)';
const NAV_LABEL = 'Steps';

type Phase = 'done' | 'current' | 'upcoming';

const CIRCLE: Record<Phase, string> = {
  done: 'bg-brand text-on-brand',
  current: 'border-2 border-brand bg-surface text-brand',
  upcoming: 'border border-line-control bg-surface text-ink-muted',
};

function StepMark({ phase, number }: { phase: Phase; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={cx('relative inline-flex size-6 items-center justify-center rounded-pill text-caption', CIRCLE[phase])}
    >
      {phase === 'done' ? <Icon icon={Check} size={16} /> : number}
    </span>
  );
}

export function Steps({ steps, current, onBack }: StepsProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === current),
  );
  const currentStep = steps[currentIndex];
  const percent = steps.length > 0 ? ((currentIndex + 1) / steps.length) * 100 : 0;
  const announceRef = useRef<HTMLParagraphElement>(null);
  const shownStep = useRef(current);

  // The step's own Continue or Back button unmounts on a step change, so focus moves here
  // and the next Tab lands in the new step instead of starting from the top of the page.
  useEffect(() => {
    if (shownStep.current === current) return;
    shownStep.current = current;
    announceRef.current?.focus({ preventScroll: true });
  }, [current]);

  return (
    <nav aria-label={NAV_LABEL}>
      {currentStep ? (
        <p ref={announceRef} tabIndex={-1} className="sr-only">
          {`${stepOf(currentIndex + 1, steps.length)}: ${currentStep.label}`}
        </p>
      ) : null}
      <ol className="hidden items-start sm:flex">
        {steps.map((step, index) => {
          const phase: Phase = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          const body = (
            <>
              <StepMark phase={phase} number={index + 1} />
              <span className={cx('text-label', phase === 'upcoming' ? 'text-ink-muted' : 'text-ink')}>
                {step.label}
                {phase === 'done' ? <span className="sr-only"> {DONE_WORD}</span> : null}
              </span>
            </>
          );
          return (
            <li
              key={step.key}
              aria-current={phase === 'current' ? 'step' : undefined}
              className="relative flex flex-1 flex-col items-center"
            >
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="absolute left-1/2 top-3 h-px w-full bg-line" />
              ) : null}
              {phase === 'done' && onBack ? (
                <button
                  type="button"
                  onClick={() => onBack(step.key)}
                  className="relative flex flex-col items-center gap-2 rounded-control px-2 text-center hover:underline hover:underline-offset-4"
                >
                  {body}
                </button>
              ) : (
                <span className="relative flex flex-col items-center gap-2 px-2 text-center">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      {currentStep ? (
        <div className="flex flex-col gap-2 sm:hidden">
          <p aria-current="step" className="text-label text-ink">
            {`${stepOf(currentIndex + 1, steps.length)} · ${currentStep.label}`}
          </p>
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-pill bg-sunken">
            <span className="block h-full bg-brand" style={{ width: `${percent}%` }} />
          </span>
        </div>
      ) : null}
    </nav>
  );
}
