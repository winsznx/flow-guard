import { useId, useState, type ReactNode } from 'react';
import { PageHeader, type PageHeaderProps } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Heading } from '../ui/Heading';
import { useToast } from '../ui/Toast';
import { ORGANIZATION_GROUP } from '../../copy/nav';
import { ORG_PAGES, ORG_TABS_LABEL, SAMPLE } from '../../copy/organization';
import { useDaoWorkspace } from '../../stores/useDaoWorkspace';

export type OrganizationPageKey = keyof typeof ORG_PAGES;

const NAV_KEY: Record<OrganizationPageKey, string> = {
  overview: 'orgOverview',
  streams: 'orgStreams',
  team: 'orgTeam',
  roles: 'orgRoles',
  rules: 'orgRules',
};

const TABS = ORGANIZATION_GROUP.items.map((item) => ({
  key: item.key,
  label: item.label,
  to: item.path,
}));

export function SampleResetButton() {
  const resetSample = useDaoWorkspace((state) => state.resetSample);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const reset = async () => {
    resetSample();
    setOpen(false);
    toast({ tone: 'success', title: SAMPLE.reset.done });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {SAMPLE.reset.action}
      </Button>
      <ConfirmDialog
        open={open}
        title={SAMPLE.reset.title}
        body={SAMPLE.reset.body}
        confirmLabel={SAMPLE.reset.action}
        keepLabel={SAMPLE.reset.keep}
        tone="danger"
        busyLabel={SAMPLE.reset.busy}
        onConfirm={reset}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function secondaryActionsFor(sample: boolean, own: ReactNode): PageHeaderProps['secondaryActions'] {
  const reset = sample ? <SampleResetButton key="reset" /> : null;
  if (own && reset) return [own, reset];
  if (own) return [own];
  if (reset) return [reset];
  return [];
}

type OrganizationHeaderProps = Pick<PageHeaderProps, 'stateLine' | 'primaryAction'> & {
  secondaryAction?: ReactNode;
  page: OrganizationPageKey;
  /** Sample pages get the "Reset sample data" action next to their own. */
  sample: boolean;
};

/** The page header every Organization page shares: title, beta tag and the section tabs. */
export function OrganizationHeader({
  page,
  sample,
  stateLine,
  primaryAction,
  secondaryAction,
}: OrganizationHeaderProps) {
  const copy = ORG_PAGES[page];
  const documentTitle = 'documentTitle' in copy ? copy.documentTitle : copy.title;

  return (
    <PageHeader
      title={copy.title}
      documentTitle={documentTitle}
      description={copy.description}
      badge="beta"
      stateLine={stateLine}
      primaryAction={primaryAction}
      secondaryActions={secondaryActionsFor(sample, secondaryAction)}
      tabs={{ label: ORG_TABS_LABEL, items: TABS, activeKey: NAV_KEY[page] }}
    />
  );
}

type OrganizationSectionProps = {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
};

/** A titled block holding one list, so the list's own card isn't nested inside a panel. */
export function OrganizationSection({
  title,
  description,
  action,
  children,
}: OrganizationSectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level="section" id={headingId}>
            {title}
          </Heading>
          <p className="text-small text-ink-secondary">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

type CardLabelledProps = {
  before?: string;
  after?: string;
  children: ReactNode;
};

/**
 * A list value with words around it that show only on the phone card layout, where the column
 * header isn't shown. The breakpoint matches the one `List` switches at.
 */
export function CardLabelled({ before, after, children }: CardLabelledProps) {
  return (
    <>
      {before ? <span className="text-ink-muted md:hidden">{before} </span> : null}
      {children}
      {after ? <span className="text-ink-muted md:hidden"> {after}</span> : null}
    </>
  );
}
