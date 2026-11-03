import React from 'react';

export type ListToolbarProps = {
  segments?: React.ReactNode;
  search?: React.ReactNode;
  chips?: React.ReactNode;
  stats?: React.ReactNode;
};

/** The list page toolbar: segmented control left, search right, filter chips under them, then the stat row. */
export function ListToolbar({ segments, search, chips, stats }: ListToolbarProps) {
  const hasTop = Boolean(segments || search);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasTop ? (
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {segments ? <div className="min-w-0">{segments}</div> : null}
          {search ? <div className="w-full lg:ml-auto lg:w-popover">{search}</div> : null}
        </div>
      ) : null}
      {chips ? <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">{chips}</div> : null}
      {stats}
    </div>
  );
}
