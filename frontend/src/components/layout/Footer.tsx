import { Link } from 'react-router-dom';
import { Eyebrow } from '../ui/Eyebrow';
import { ArrowUpRight, Icon } from '../ui/Icon';
import { NetworkCapsule } from '../ui/NetworkCapsule';
import { Tooltip } from '../ui/Tooltip';
import { GitHubIcon, TelegramIcon, YouTubeIcon } from '../ui/XIcon';
import { copyrightLine } from '../../copy/common';
import { FOOTER_COLUMNS, SITE_NAME, SOCIAL_LINKS, TAGLINE, CHROME, type NavLink } from '../../copy/nav';
import { BUILD_NETWORK } from '../../copy/network';
import { Logo } from './Logo';

const NEW_TAB = ', opens in a new tab';
const STATUS_PATH = '/status';

const SOCIAL_ICONS: Record<(typeof SOCIAL_LINKS)[number]['label'], typeof GitHubIcon> = {
  GitHub: GitHubIcon,
  YouTube: YouTubeIcon,
  Telegram: TelegramIcon,
};

const LINK =
  'inline-flex min-h-touch items-center gap-1 text-small text-ink-secondary transition-colors duration-(--duration-fast) ease-standard hover:text-ink sm:min-h-0';

function FooterLink({ link }: { link: NavLink }) {
  if ('href' in link) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {link.label}
        <span className="sr-only">{NEW_TAB}</span>
        <span aria-hidden="true" className="inline-flex text-ink-muted">
          <Icon icon={ArrowUpRight} size={16} />
        </span>
      </a>
    );
  }

  return (
    <Link to={link.path} className={LINK}>
      {link.label}
    </Link>
  );
}

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-page flex-col gap-12 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <Link to="/" aria-label={SITE_NAME} className="inline-flex w-fit items-center rounded-control">
              <Logo />
            </Link>
            <p className="text-body text-ink-secondary">{TAGLINE}</p>
          </div>
          <div>
            <NetworkCapsule network={BUILD_NETWORK} to={STATUS_PATH} />
          </div>
        </div>

        <nav aria-label={CHROME.footer} className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.label} className="flex flex-col gap-3">
              <Eyebrow>{column.label}</Eyebrow>
              <ul className="flex flex-col sm:gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-ink-muted">{copyrightLine(year)}</p>
          <ul aria-label={CHROME.elsewhere} className="flex items-center gap-1">
            {SOCIAL_LINKS.map((social) => {
              const Glyph = SOCIAL_ICONS[social.label];
              const name = `${SITE_NAME} on ${social.label}`;
              return (
                <li key={social.label}>
                  <Tooltip content={name}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name}${NEW_TAB}`}
                      data-control
                      className="inline-flex size-control-md items-center justify-center rounded-pill text-ink-secondary transition-colors duration-(--duration-fast) ease-standard hover:bg-sunken hover:text-ink pointer-coarse:min-h-touch pointer-coarse:min-w-touch"
                    >
                      <Glyph className="size-5" />
                    </a>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </footer>
  );
}

/** Pages that haven't moved to MarketingFooter yet import it under its old name. */
export const Footer = MarketingFooter;
