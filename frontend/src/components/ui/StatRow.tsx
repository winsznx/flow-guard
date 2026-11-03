import React from 'react';

/** `label` names the group for screen readers, for example "Vaults at a glance". */
export type StatRowProps = { children: React.ReactNode; label?: string };

export function StatRow({ children, label }: StatRowProps) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {children}
    </div>
  );
}
