import React from 'react';
import { useLocation } from 'react-router-dom';
import { Prose } from '../layout/Prose';
import { Display } from '../ui/Display';
import { Notice } from '../ui/Notice';
import { TableOfContents } from '../ui/TableOfContents';
import { PageMeta } from '../seo/PageMeta';

export type LegalPageProps = {
  title: string;
  updated: string;
  summary: [string, string, string];
  sections: { id: string; title: string; body: React.ReactNode }[];
  /** The page's one-line search description. Without it the summary points are joined. */
  description?: string;
};

const SUMMARY_TITLE = 'In short';

function sectionTitle(index: number, title: string): string {
  return `${index + 1}. ${title}`;
}

export function LegalPage({ title, updated, summary, sections, description }: LegalPageProps) {
  const { pathname } = useLocation();
  const tocItems = sections.map((section, index) => ({ id: section.id, label: sectionTitle(index, section.title) }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-page px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-16 lg:pb-24">
      <PageMeta title={title} description={description ?? summary.join(' ')} path={pathname} />
      <div className="grid gap-8 lg:grid-cols-4 lg:gap-12">
        <div className="min-w-0 lg:col-span-3 lg:col-start-2">
          <header className="flex flex-col gap-3">
            <Display size="headline" as="h1">
              {title}
            </Display>
            <p className="text-small text-ink-muted">{`Last updated ${updated}`}</p>
          </header>
        </div>
        <aside className="min-w-0 lg:col-span-1 lg:row-start-2">
          <TableOfContents items={tocItems} />
        </aside>
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-3 lg:row-start-2">
          <Notice tone="info" title={SUMMARY_TITLE}>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {summary.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Notice>
          <Prose>
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-header">
                <h2 id={`${section.id}-title`}>{sectionTitle(index, section.title)}</h2>
                {section.body}
              </section>
            ))}
          </Prose>
        </div>
      </div>
    </main>
  );
}
