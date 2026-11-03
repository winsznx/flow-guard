import type { MouseEvent } from 'react';
import { CHROME } from '../../copy/nav';

const SKIP_LINK =
  'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-(--z-toast) focus:rounded-pill focus:bg-surface focus:px-4 focus:py-2 focus:text-label focus:text-ink focus:shadow-overlay';

/** Public pages each render their own <main>, so the link moves focus to whichever one is on the page. */
function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.querySelector('main');
  if (!main) return;
  event.preventDefault();
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
  main.scrollIntoView();
}

export function SkipToMain() {
  return (
    <a href="#main" onClick={skipToMain} className={SKIP_LINK}>
      {CHROME.skipToContent}
    </a>
  );
}
