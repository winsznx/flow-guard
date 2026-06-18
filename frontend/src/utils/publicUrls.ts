export const MAIN_SITE_URL = 'https://flowguard.cash';
export const APP_SITE_URL = 'https://app.flowguard.cash';
export const EXPLORER_SITE_URL = 'https://explorer.flowguard.cash';
export const DOCS_SITE_URL = 'https://docs.flowguard.cash';

/**
 * Long-form technical posts. Lives on the docs subdomain so we can use
 * Mintlify's MDX editor + free RSS instead of hand-rolling each post in TSX.
 * The shorter, news-shaped posts continue to live at MAIN_SITE_URL/updates.
 */
export const BLOG_URL = `${DOCS_SITE_URL}/blog`;
export const UPDATES_URL = `${MAIN_SITE_URL}/updates`;

export const APP_SITE_HOST = 'app.flowguard.cash';
export const EXPLORER_SITE_HOST = 'explorer.flowguard.cash';

export function getCurrentHostname() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.hostname.toLowerCase();
}

export function isAppHost(hostname = getCurrentHostname()) {
  return hostname === APP_SITE_HOST;
}

export function isExplorerHost(hostname = getCurrentHostname()) {
  return hostname === EXPLORER_SITE_HOST;
}

export function getCurrentSiteOrigin() {
  const hostname = getCurrentHostname();

  if (hostname === APP_SITE_HOST) {
    return APP_SITE_URL;
  }

  if (hostname === EXPLORER_SITE_HOST) {
    return EXPLORER_SITE_URL;
  }

  return MAIN_SITE_URL;
}

/**
 * Resolve an in-app route for a link. On the explorer host, interactive pages
 * (vault/stream/payment detail) need to open on the app host so WalletConnect's
 * origin allowlist is satisfied, so this returns an absolute app URL. On the app
 * host (or anywhere else) it stays relative for normal SPA navigation.
 */
export function appHref(path: string) {
  if (isExplorerHost()) {
    return `${APP_SITE_URL}${path}`;
  }
  return path;
}
