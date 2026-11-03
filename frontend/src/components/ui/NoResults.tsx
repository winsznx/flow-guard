import { Button } from './Button';
import { Heading } from './Heading';
import { ACTIONS, noneMatch } from '../../copy/common';

export type NoResultsProps = { thing: string; onClear: () => void };

export function NoResults({ thing, onClear }: NoResultsProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="flex w-full max-w-narrow flex-col items-center gap-3">
        <Heading level="item" as="h2">
          {noneMatch(thing)}
        </Heading>
        <Button variant="ghost" onClick={onClear}>
          {ACTIONS.clearFilters}
        </Button>
      </div>
    </div>
  );
}
