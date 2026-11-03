import React from 'react';
import { useLocation } from 'react-router-dom';
import { BackLink, type BackLinkProps } from '../ui/BackLink';
import { BetaTag } from '../ui/BetaTag';
import { Breadcrumbs, type BreadcrumbsProps } from '../ui/Breadcrumbs';
import { Heading } from '../ui/Heading';
import { RoleTag, type RoleTagProps } from '../ui/RoleTag';
import { StatusPill } from '../ui/StatusPill';
import { Tabs, type TabsProps } from '../ui/Tabs';
import { PageMeta } from '../seo/PageMeta';
import type { StatusKey } from '../../copy/status';

export type PageHeaderProps = {
  title: string;
  description: React.ReactNode;
  stateLine?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: [] | [React.ReactNode] | [React.ReactNode, React.ReactNode];
  plan?: React.ReactNode;
  status?: StatusKey;
  role?: RoleTagProps['role'];
  badge?: 'beta';
  breadcrumbs?: BreadcrumbsProps['items'];
  back?: BackLinkProps;
  tabs?: TabsProps;
  documentTitle?: string;
  metaDescription?: string;
};

export function PageHeader({
  title,
  description,
  stateLine,
  primaryAction,
  secondaryActions = [],
  plan,
  status,
  role,
  badge,
  breadcrumbs,
  back,
  tabs,
  documentTitle,
  metaDescription,
}: PageHeaderProps) {
  const { pathname } = useLocation();
  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0;
  const hasTags = Boolean(status || role || badge);
  const descriptionText = metaDescription ?? (typeof description === 'string' ? description : undefined);

  return (
    <header className="mb-8 flex min-w-0 flex-col gap-4">
      <PageMeta title={documentTitle ?? title} description={descriptionText ?? title} path={pathname} />
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="min-w-0 self-start">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      ) : back ? (
        <div className="self-start">
          <BackLink {...back} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Heading level="page" className="min-w-0 break-words">
              {title}
            </Heading>
            {hasTags ? (
              <div className="flex flex-wrap items-center gap-2">
                {status ? <StatusPill status={status} /> : null}
                {role ? <RoleTag role={role} /> : null}
                {badge === 'beta' ? <BetaTag /> : null}
              </div>
            ) : null}
          </div>
          <div className="max-w-reading text-body text-ink-secondary">{description}</div>
        </div>
        {hasActions ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center lg:shrink-0 lg:justify-end">
            {secondaryActions.map((action, index) => (
              <div key={index} className="flex *:w-full sm:*:w-auto">
                {action}
              </div>
            ))}
            {primaryAction ? <div className="flex *:w-full sm:*:w-auto">{primaryAction}</div> : null}
          </div>
        ) : null}
      </div>
      {plan ? <div className="min-w-0 max-w-reading">{plan}</div> : null}
      {stateLine ? <div className="text-small text-ink-muted">{stateLine}</div> : null}
      {tabs ? <Tabs {...tabs} /> : null}
    </header>
  );
}
