import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';

interface DaoPreviewBannerProps {
  title: string;
  description: string;
  eyebrow?: string;
}

export function DaoPreviewBanner({
  title,
  description,
  eyebrow = 'DAO Workspace',
}: DaoPreviewBannerProps) {
  return (
    <div className="mb-8 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.24em] text-primary">
            <ShieldCheck className="h-4 w-4" />
            {eyebrow}
          </div>
          <h2 className="mb-3 font-display text-2xl text-textPrimary md:text-3xl">{title}</h2>
          <p className="text-sm leading-7 text-textSecondary md:text-base">{description}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/vaults"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 font-mono text-sm text-white transition-all hover:-translate-y-0.5 hover:bg-primaryHover hover:shadow-md"
          >
            Open Vaults
          </Link>
          <Link
            to="/proposals"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 font-mono text-sm text-textPrimary transition-colors hover:bg-surfaceAlt"
          >
            Review Proposals
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
