import React from 'react';

interface SkeletonProps {
  className?: string;
}

/**
 * Shimmer block primitive. Use Tailwind sizing classes to control width/height.
 * Default rounded-md + animate-pulse + bg-surfaceAlt for consistency with the
 * Sage palette.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-md bg-surfaceAlt border border-border/40 ${className}`}
    />
  );
};

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading text">
      {Array.from({ length: lines }).map((_, idx) => {
        const isLast = idx === lines - 1 && lines > 1;
        return (
          <div
            key={idx}
            className={`h-3 animate-pulse rounded bg-surfaceAlt border border-border/40 ${
              isLast ? 'w-3/4' : 'w-full'
            }`}
          />
        );
      })}
    </div>
  );
};

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className = '',
  lines = 3,
}) => {
  return (
    <div
      role="status"
      aria-label="Loading card"
      className={`rounded-lg border border-border/40 bg-surface p-5 md:p-6 ${className}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-surfaceAlt border border-border/40" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surfaceAlt border border-border/40" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
};

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-label="Loading table"
      className={`rounded-lg border border-border/40 bg-surface overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 border-b border-border/40 bg-surfaceAlt/40">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, idx) => (
            <div
              key={idx}
              className="h-3 animate-pulse rounded bg-surfaceAlt border border-border/40"
            />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-4 py-4">
            <div
              className="grid gap-4 items-center"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((_, colIdx) => (
                <div
                  key={colIdx}
                  className="h-4 animate-pulse rounded bg-surfaceAlt border border-border/40"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface SkeletonStatsProps {
  count?: number;
  className?: string;
}

export const SkeletonStats: React.FC<SkeletonStatsProps> = ({
  count = 4,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-label="Loading stats"
      className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${className}`}
      style={count !== 4 ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : undefined}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border/40 bg-surface p-4 md:p-5 space-y-3"
        >
          <div className="h-3 w-1/2 animate-pulse rounded bg-surfaceAlt border border-border/40" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-surfaceAlt border border-border/40" />
          <div className="h-2 w-1/3 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        </div>
      ))}
    </div>
  );
};
