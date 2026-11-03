import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ButtonLink } from '../ui/ButtonLink';
import { Eyebrow } from '../ui/Eyebrow';
import { ChevronDown, Icon, MenuIcon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { cx } from '../ui/cx';
import { ACTIONS } from '../../copy/common';
import { MARKETING_NAV, SITE_NAME, CHROME } from '../../copy/nav';
import { Logo } from './Logo';
import { SkipToMain } from './SkipToMain';
import { MobileMenu } from './MobileMenu';
import { NavPanelLink } from './NavPanelLink';
import { MARKETING_MENU_ID, isCurrentLink } from './chromeRoutes';

const HOVER_DELAY_MS = 120;

const TOP_LINK =
  'relative inline-flex h-header items-center gap-1 text-label transition-colors duration-(--duration-fast) ease-standard hover:text-ink';
const CURRENT_BAR = 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand';

type NavMenuProps = {
  label: string;
  current: boolean;
  wide?: boolean;
  children: (close: () => void) => React.ReactNode;
};

function NavMenu({ label, current, wide = false, children }: NavMenuProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<number>();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const hoverTo = (next: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(next), HOVER_DELAY_MS);
  };

  const close = () => setOpen(false);

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={hoverTo(true)}
      onPointerLeave={hoverTo(false)}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
        if (event.relatedTarget) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cx(TOP_LINK, current || open ? 'text-ink' : 'text-ink-secondary', current && CURRENT_BAR)}
      >
        {label}
        <Icon icon={ChevronDown} size={16} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={cx(
          'on-surface absolute left-0 top-full z-(--z-menu) rounded-card bg-surface p-2 shadow-overlay',
          wide ? 'w-max' : 'w-popover',
        )}
      >
        {children(close)}
      </div>
    </div>
  );
}

export function MarketingNav() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { products, links, help, openApp } = MARKETING_NAV;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const productLinks = [...products.groups.flatMap((group) => group.items), products.footer];
  const productsCurrent = productLinks.some((link) => isCurrentLink(link, pathname));
  const helpCurrent = help.items.some((link) => isCurrentLink(link, pathname));

  return (
    <header
      className={cx(
        'sticky top-0 z-(--z-header) h-header border-b bg-canvas transition-colors duration-(--duration-fast) ease-standard',
        scrolled ? 'border-line' : 'border-transparent',
      )}
    >
      <SkipToMain />
      <div className="mx-auto flex h-full max-w-page items-center gap-4 px-4 sm:gap-8 sm:px-6 lg:px-8">
        <Link to="/" aria-label={SITE_NAME} className="inline-flex min-h-touch shrink-0 items-center rounded-control">
          <Logo />
        </Link>
        <nav aria-label={CHROME.mainNav} className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-8">
            <li>
              <NavMenu label={products.label} current={productsCurrent} wide>
                {(close) => (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      {products.groups.map((group) => (
                        <div key={group.label} className="flex w-popover flex-col gap-1">
                          <Eyebrow className="px-3 pt-2">{group.label}</Eyebrow>
                          {group.items.map((link) => (
                            <NavPanelLink key={link.label} link={link} onNavigate={close} />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-line pt-2">
                      <NavPanelLink link={products.footer} onNavigate={close} />
                    </div>
                  </div>
                )}
              </NavMenu>
            </li>
            {links.map((link) => {
              const current = isCurrentLink(link, pathname);
              return (
                <li key={link.label}>
                  {'path' in link ? (
                    <Link
                      to={link.path}
                      aria-current={current ? 'page' : undefined}
                      className={cx(TOP_LINK, current ? cx('text-ink', CURRENT_BAR) : 'text-ink-secondary')}
                    >
                      {link.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
            <li>
              <NavMenu label={help.label} current={helpCurrent}>
                {(close) => (
                  <div className="flex flex-col gap-1">
                    {help.items.map((link) => (
                      <NavPanelLink key={link.label} link={link} onNavigate={close} />
                    ))}
                  </div>
                )}
              </NavMenu>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink variant="primary" size="sm" to={openApp.href}>
            {openApp.label}
          </ButtonLink>
          <IconButton
            icon={MenuIcon}
            label={ACTIONS.openMenu}
            aria-expanded={drawerOpen}
            aria-controls={MARKETING_MENU_ID}
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden"
          />
        </div>
      </div>
      <MobileMenu isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  );
}
