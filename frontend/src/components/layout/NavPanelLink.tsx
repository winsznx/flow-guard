import { Link } from 'react-router-dom';
import { ArrowUpRight, Icon } from '../ui/Icon';
import type { NavLink } from '../../copy/nav';

export type NavPanelLinkProps = { link: NavLink; onNavigate: () => void };

const NEW_TAB = ', opens in a new tab';

const ROW =
  'flex min-h-control-lg items-start gap-3 rounded-control px-3 py-2.5 transition-colors duration-(--duration-fast) ease-standard hover:bg-sunken focus-visible:bg-sunken';

export function NavPanelLink({ link, onNavigate }: NavPanelLinkProps) {
  const body = (
    <>
      {link.icon ? (
        <span aria-hidden="true" className="mt-0.5 inline-flex text-ink-muted">
          <Icon icon={link.icon} size={20} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label text-ink">{link.label}</span>
        {link.description ? <span className="text-small text-ink-muted">{link.description}</span> : null}
      </span>
    </>
  );

  if ('href' in link) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={ROW}>
        {body}
        <span className="sr-only">{NEW_TAB}</span>
        <span aria-hidden="true" className="mt-0.5 inline-flex text-ink-muted">
          <Icon icon={ArrowUpRight} size={16} />
        </span>
      </a>
    );
  }

  return (
    <Link to={link.path} onClick={onNavigate} className={ROW}>
      {body}
    </Link>
  );
}
