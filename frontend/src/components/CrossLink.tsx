import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isExplorerHost, appHref } from '../utils/publicUrls';

type CrossLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  children: ReactNode;
};

/**
 * Links to an in-app route. On the explorer host it crosses to the app host
 * with a full navigation (so WalletConnect's origin allowlist is satisfied on
 * the interactive page); on the app host it uses normal SPA navigation.
 */
export function CrossLink({ to, children, ...rest }: CrossLinkProps) {
  if (isExplorerHost()) {
    return (
      <a {...rest} href={appHref(to)}>
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} to={to}>
      {children}
    </Link>
  );
}
