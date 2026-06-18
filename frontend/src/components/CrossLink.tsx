import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isExplorerHost, appHref } from '../utils/publicUrls';

interface CrossLinkProps {
  to: string;
  className?: string;
  children: ReactNode;
}

/**
 * Links to an in-app route. On the explorer host it crosses to the app host
 * with a full navigation (so WalletConnect's origin allowlist is satisfied on
 * the interactive page); on the app host it uses normal SPA navigation.
 */
export function CrossLink({ to, className, children }: CrossLinkProps) {
  if (isExplorerHost()) {
    return (
      <a href={appHref(to)} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
