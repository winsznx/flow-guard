import React from 'react';
import { useLocation } from 'react-router-dom';
import { ButtonLink } from '../ui/ButtonLink';
import { Display } from '../ui/Display';
import { Eyebrow } from '../ui/Eyebrow';
import { cx } from '../ui/cx';
import { PageMeta } from '../seo/PageMeta';
import { MARKETING_HOME_TITLE, routeTitle } from '../../copy/nav';

type HeroLink = { label: string; href: string };

export type MarketingHeroProps = {
  eyebrow?: string;
  livePill?: boolean;
  headline: string;
  accent?: string;
  lead: string;
  primary: HeroLink;
  secondary?: HeroLink;
  note?: React.ReactNode;
  visual?: React.ReactNode;
  size?: 'display' | 'headline';
  className?: string;
  /** Link preview image for this page, passed to PageMeta. */
  image?: string;
  imageAlt?: string;
};

const LIVE_LABEL = 'Live on Bitcoin Cash';
const MARKETING_ROOT = '/';

function documentTitle(pathname: string, headline: string): string {
  if (pathname === MARKETING_ROOT) return MARKETING_HOME_TITLE;
  return routeTitle(pathname) ?? headline;
}

export function MarketingHero({
  eyebrow,
  livePill = false,
  headline,
  accent,
  lead,
  primary,
  secondary,
  note,
  visual,
  size = 'display',
  className,
  image,
  imageAlt,
}: MarketingHeroProps) {
  const { pathname } = useLocation();

  return (
    <section className={cx('pattern-dots', className)}>
      <PageMeta title={documentTitle(pathname, headline)} description={lead} path={pathname} image={image} imageAlt={imageAlt} />
      <div
        className={cx(
          'mx-auto grid w-full min-w-0 max-w-page gap-12 px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-24 lg:pb-24',
          Boolean(visual) && 'lg:grid-cols-2 lg:items-center',
        )}
      >
        <div className="flex min-w-0 flex-col items-start gap-6">
          {livePill ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-success-tint px-3 text-caption text-success-ink">
              <span aria-hidden="true" className="size-1.5 rounded-pill bg-success-dot" />
              {LIVE_LABEL}
            </span>
          ) : null}
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Display size={size} as="h1" accent={accent}>
            {headline}
          </Display>
          <p className="max-w-reading text-body-lg text-ink-secondary">{lead}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <ButtonLink to={primary.href} variant="primary" size="lg">
              {primary.label}
            </ButtonLink>
            {secondary ? (
              <ButtonLink to={secondary.href} variant="secondary" size="lg">
                {secondary.label}
              </ButtonLink>
            ) : null}
          </div>
          {note ? <div className="text-small text-ink-muted">{note}</div> : null}
        </div>
        {visual ? <div className="min-w-0">{visual}</div> : null}
      </div>
    </section>
  );
}
