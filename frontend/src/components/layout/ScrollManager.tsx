import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const HASH_WAIT_MS = 5000;
const KEEP_SCROLL_ON_SEARCH = new Set(['/explorer']);

function findHashTarget(hash: string): HTMLElement | null {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return document.getElementById(hash.slice(1));
  }
}

/** Waits for a lazy route to render the target, since a deep link can arrive before the page chunk loads. */
function scrollToHashWhenReady(hash: string): () => void {
  const found = findHashTarget(hash);
  if (found) {
    found.scrollIntoView();
    return () => undefined;
  }
  const observer = new MutationObserver(() => {
    const target = findHashTarget(hash);
    if (!target) return;
    stop();
    target.scrollIntoView();
  });
  const timer = window.setTimeout(() => stop(), HASH_WAIT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}

/**
 * Router links change the URL without scrolling. A new page starts at the top, and a link to `#id`
 * (or a deep link on first load) scrolls to that section once it renders.
 */
export function ScrollManager(): null {
  const { pathname, search, hash, key } = useLocation();
  const previous = useRef<{ pathname: string; search: string } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { pathname, search };
    if (hash) return scrollToHashWhenReady(hash);
    if (before === null) return undefined;
    const pathChanged = before.pathname !== pathname;
    const searchChanged = before.search !== search && !KEEP_SCROLL_ON_SEARCH.has(pathname);
    if (pathChanged || searchChanged) window.scrollTo({ top: 0, behavior: 'auto' });
    return undefined;
  }, [pathname, search, hash, key]);

  return null;
}
