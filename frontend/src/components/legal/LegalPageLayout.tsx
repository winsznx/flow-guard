import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Footer } from '../layout/Footer';

interface LegalPageLayoutProps {
  eyebrow: string;
  title: string;
  summary: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPageLayout({
  eyebrow,
  title,
  summary,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  return (
    <main className="min-h-screen bg-background text-textPrimary">
      <div className="border-b border-border/60 bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6 lg:px-12">
          <Link
            to="/"
            className="inline-flex items-center gap-3 rounded-full border border-border bg-surfaceAlt px-4 py-2 text-sm font-medium text-textPrimary transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to FlowGuard
          </Link>
          <Link
            to="/"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
          </Link>
        </div>
      </div>

      <section className="border-b border-border/60 bg-gradient-to-br from-surface via-surface to-surfaceAlt/60">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20 lg:px-12">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] text-primary">
              <FileText className="h-4 w-4" />
              {eyebrow}
            </div>
            <div className="space-y-4">
              <h1 className="font-display text-4xl leading-tight text-textPrimary md:text-5xl">
                {title}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-textSecondary md:text-lg">
                {summary}
              </p>
            </div>
            <p className="text-sm font-mono text-textSecondary">Last updated: {lastUpdated}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
          <aside className="h-fit rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-textSecondary">
              Legal Navigation
            </h2>
            <div className="mt-5 flex flex-col gap-3 text-sm">
              <Link
                to="/terms"
                className="rounded-xl px-3 py-2 text-textSecondary transition-colors hover:bg-surfaceAlt hover:text-textPrimary"
              >
                Terms of Use
              </Link>
              <Link
                to="/privacy"
                className="rounded-xl px-3 py-2 text-textSecondary transition-colors hover:bg-surfaceAlt hover:text-textPrimary"
              >
                Privacy Notice
              </Link>
              <Link
                to="/disclaimer"
                className="rounded-xl px-3 py-2 text-textSecondary transition-colors hover:bg-surfaceAlt hover:text-textPrimary"
              >
                Risk Disclaimer
              </Link>
            </div>
          </aside>

          <article className="space-y-8 rounded-[2rem] border border-border bg-surface p-6 md:p-8 lg:p-10">
            {children}
          </article>
        </div>
      </section>

      <Footer />
    </main>
  );
}
