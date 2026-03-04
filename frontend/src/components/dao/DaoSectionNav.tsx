import { Link, useLocation } from 'react-router-dom';
import { daoNavSections } from '../../data/daoBeta';

export function DaoSectionNav() {
  const location = useLocation();

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-accent">
          DAO Beta
        </span>
        <p className="text-sm font-mono text-textMuted">
          Preview the organization layer before live role mapping and policy execution ship.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:flex md:overflow-x-auto md:pb-2">
        {daoNavSections.map((section) => {
          const active = location.pathname === section.path;

          return (
            <Link
              key={section.path}
              to={section.path}
              className={`min-w-0 rounded-2xl border p-3.5 transition-all md:min-w-[220px] md:p-4 ${
                active
                  ? 'border-accent bg-accent/5 shadow-sm'
                  : 'border-border/40 bg-surface hover:border-borderHover hover:bg-surfaceAlt'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-display text-base text-textPrimary md:text-lg">{section.label}</h2>
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    active ? 'bg-accent ring-4 ring-accent/15' : 'bg-border'
                  }`}
                />
              </div>
              <p className="text-xs leading-5 text-textMuted md:text-sm md:leading-6">{section.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
