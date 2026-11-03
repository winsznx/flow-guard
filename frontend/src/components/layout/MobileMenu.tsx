import { Link, useLocation } from 'react-router-dom';
import { ButtonLink } from '../ui/ButtonLink';
import { Drawer } from '../ui/Drawer';
import { Eyebrow } from '../ui/Eyebrow';
import { ChevronDown, ChevronUp, Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { MARKETING_NAV, CHROME, type NavLink } from '../../copy/nav';
import { NavPanelLink } from './NavPanelLink';
import { MARKETING_MENU_ID, isCurrentLink } from './chromeRoutes';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTION_ROW =
  'flex min-h-control-lg cursor-pointer list-none items-center gap-3 rounded-control px-3 text-title-item text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-sunken';

type SectionProps = { label: string; defaultOpen?: boolean; children: React.ReactNode };

function MenuSection({ label, defaultOpen = false, children }: SectionProps) {
  return (
    <details open={defaultOpen} className="group">
      <summary className={SECTION_ROW}>
        <span className="min-w-0 flex-1">{label}</span>
        <span aria-hidden="true" className="inline-flex text-ink-muted group-open:hidden">
          <Icon icon={ChevronDown} size={20} />
        </span>
        <span aria-hidden="true" className="hidden text-ink-muted group-open:inline-flex">
          <Icon icon={ChevronUp} size={20} />
        </span>
      </summary>
      <div className="flex flex-col gap-1 pb-2 pl-3">{children}</div>
    </details>
  );
}

function PageRow({ link, onNavigate }: { link: NavLink; onNavigate: () => void }) {
  const { pathname } = useLocation();
  if (!('path' in link)) return null;
  const current = isCurrentLink(link, pathname);

  return (
    <Link
      to={link.path}
      onClick={onNavigate}
      aria-current={current ? 'page' : undefined}
      className={cx(SECTION_ROW, current && 'bg-surface shadow-raised')}
    >
      {link.label}
    </Link>
  );
}

/** The marketing menu under 1024px. Built from the same config as the desktop header. */
export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const { products, links, help, openApp } = MARKETING_NAV;

  return (
    <Drawer open={isOpen} onClose={onClose} side="full" label={CHROME.menu} id={MARKETING_MENU_ID}>
      <div className="mx-auto flex min-h-full w-full max-w-reading flex-col px-4 sm:px-6">
        <nav aria-label={CHROME.menu} className="flex flex-1 flex-col gap-1">
          <MenuSection label={products.label} defaultOpen>
            {products.groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1 pt-2">
                <Eyebrow className="px-3">{group.label}</Eyebrow>
                {group.items.map((link) => (
                  <NavPanelLink key={link.label} link={link} onNavigate={onClose} />
                ))}
              </div>
            ))}
            <div className="pt-2">
              <NavPanelLink link={products.footer} onNavigate={onClose} />
            </div>
          </MenuSection>
          <MenuSection label={help.label}>
            {help.items.map((link) => (
              <NavPanelLink key={link.label} link={link} onNavigate={onClose} />
            ))}
          </MenuSection>
          {links.map((link) => (
            <PageRow key={link.label} link={link} onNavigate={onClose} />
          ))}
        </nav>
        <div className="sticky bottom-0 bg-canvas py-4">
          <ButtonLink variant="primary" size="lg" fullWidth to={openApp.href}>
            {openApp.label}
          </ButtonLink>
        </div>
      </div>
    </Drawer>
  );
}
