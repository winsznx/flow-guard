/**
 * The pairing QR code dialog the connectors show. It's a native modal <dialog> built
 * without React, because connectors run outside the page's React tree, and it uses the
 * class strings as the Dialog, QrCode and Button primitives, from the React-free components/ui/classes.ts.
 *
 * Text is set with textContent only, never innerHTML.
 */

import QRCode from 'qrcode';
import { QR_COLORS } from '../styles/tokens';
import {
  BUTTON_BASE,
  BUTTON_LINK_BASE,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  DIALOG_BOTTOM_SHEET,
  DIALOG_HEADER,
  DIALOG_SIZES,
  DIALOG_SURFACE,
  QR_CAPTION,
  QR_FRAME,
} from '../components/ui/classes';
import { ACTIONS, TOASTS } from '../copy/common';
import { PAIRING } from '../copy/wallets';

export type PairingDialogOptions = {
  title: string;
  line: string;
  qrValue: string;
  qrCaption: string;
  /** The link the wallet accepts in place of the QR code, offered with a copy button. */
  link: string;
  steps?: readonly string[];
  open?: { label: string; href: string };
  get?: { prompt: string; label: string; href: string };
  beta?: string;
  /** Runs when the person closes the dialog (button, Escape). The connector cancels the pairing. */
  onClose: () => void;
};

const QR_SIZE = 200;
const COPY_RESET_MS = 2000;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CLASSES = {
  dialog: `${DIALOG_SURFACE} ${DIALOG_SIZES.sm} ${DIALOG_BOTTOM_SHEET}`,
  header: DIALOG_HEADER,
  title: 'min-w-0 text-title-section text-ink',
  close:
    '-mr-2 -mt-1 inline-flex shrink-0 items-center justify-center rounded-pill size-control-sm text-ink-secondary hover:bg-sunken hover:text-ink active:bg-sunken pointer-coarse:min-w-touch pointer-coarse:min-h-touch',
  body: 'flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto',
  line: 'w-full text-body text-ink-secondary',
  figure: 'inline-flex flex-col items-center gap-3',
  qrFrame: QR_FRAME,
  qrPending: 'block animate-pulse rounded-inline bg-sunken',
  caption: QR_CAPTION,
  steps: 'flex w-full list-decimal flex-col gap-1 pl-5 text-body text-ink-secondary',
  field: 'flex w-full flex-col',
  label: 'mb-1.5 text-label text-ink',
  inputWrap: 'flex items-center gap-2',
  input:
    'h-touch min-w-0 flex-1 truncate rounded-control border border-line bg-sunken px-3 font-mono text-mono text-ink-secondary',
  copyButton: `shrink-0 ${BUTTON_BASE} ${BUTTON_SIZES.sm} ${BUTTON_VARIANTS.secondary}`,
  copyProblem: 'mt-1.5 text-small text-ink-secondary',
  openLink: `w-full ${BUTTON_BASE} ${BUTTON_SIZES.md} ${BUTTON_VARIANTS.secondary}`,
  beta: 'w-full rounded-card bg-warning-tint p-4 text-title-item text-ink',
  getLine: 'text-small text-ink-secondary',
  inlineLink: `${BUTTON_LINK_BASE} ${BUTTON_VARIANTS.link}`,
  srOnly: 'sr-only',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function closeIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M18 6 6 18', 'm6 6 12 12']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function qrFigure(value: string, caption: string): HTMLElement {
  const figure = el('figure', CLASSES.figure);
  const frame = el('div', CLASSES.qrFrame);
  const placeholder = el('span', CLASSES.qrPending);
  placeholder.setAttribute('role', 'status');
  placeholder.style.width = `${QR_SIZE}px`;
  placeholder.style.height = `${QR_SIZE}px`;
  placeholder.appendChild(el('span', CLASSES.srOnly, PAIRING.qrLoading));
  frame.appendChild(placeholder);
  figure.append(frame, el('figcaption', CLASSES.caption, caption));

  QRCode.toDataURL(value, {
    width: QR_SIZE * 2,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: QR_COLORS.dark, light: QR_COLORS.light },
  })
    .then((url) => {
      const img = document.createElement('img');
      img.src = url;
      img.width = QR_SIZE;
      img.height = QR_SIZE;
      img.alt = caption;
      img.className = 'block';
      frame.replaceChildren(img);
    })
    .catch((error: unknown) => {
      console.warn('Pairing QR code could not be drawn', error);
      frame.replaceChildren(el('p', CLASSES.line, PAIRING.qrFailed));
    });

  return figure;
}

function copyField(link: string): HTMLElement {
  const field = el('div', CLASSES.field);
  const id = `pairing-link-${Math.random().toString(36).slice(2, 10)}`;
  const label = el('label', CLASSES.label, PAIRING.linkLabel);
  label.htmlFor = id;
  const wrap = el('div', CLASSES.inputWrap);
  const input = el('input', CLASSES.input);
  input.id = id;
  input.type = 'text';
  input.readOnly = true;
  input.value = link;
  input.addEventListener('focus', () => input.select());
  const button = el('button', CLASSES.copyButton, ACTIONS.copyLink);
  button.type = 'button';
  const live = el('span', CLASSES.srOnly);
  live.setAttribute('aria-live', 'polite');
  const problem = el('p', CLASSES.copyProblem, PAIRING.copyFailed);
  problem.setAttribute('role', 'alert');
  problem.hidden = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', () => {
    Promise.resolve()
      .then(() => {
        if (!navigator.clipboard) throw new Error('The Clipboard API is unavailable in this context');
        return navigator.clipboard.writeText(link);
      })
      .then(() => {
        problem.hidden = true;
        button.textContent = TOASTS.copied;
        live.textContent = TOASTS.linkCopied;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          button.textContent = ACTIONS.copyLink;
          live.textContent = '';
        }, COPY_RESET_MS);
      })
      .catch((error: unknown) => {
        console.warn('Clipboard write was refused', error);
        input.select();
        problem.hidden = false;
      });
  });

  wrap.append(input, button);
  field.append(label, wrap, live, problem);
  return field;
}

/** A link a wallet app handles (wc:, bch:), as opposed to a web page. It opens in place. */
function isAppLink(href: string): boolean {
  return !/^https?:/i.test(href);
}

/**
 * The picker row that opened pairing has usually unmounted by now, so focus falls back
 * to the page's Connect wallet button, then to main.
 */
function restoreFocus(opener: HTMLElement | null): void {
  const target =
    (opener?.isConnected ? opener : null) ??
    document.querySelector<HTMLElement>('[data-wallet-trigger]') ??
    document.querySelector<HTMLElement>('main');
  if (!target) return;
  if (target.tagName === 'MAIN' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}

/** Shows the dialog and returns a function that removes it without calling `onClose`. */
export function showPairingDialog(options: PairingDialogOptions): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = el('dialog', CLASSES.dialog);
  const titleId = `pairing-title-${Math.random().toString(36).slice(2, 10)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const header = el('div', CLASSES.header);
  const title = el('h2', CLASSES.title, options.title);
  title.id = titleId;
  const close = el('button', CLASSES.close);
  close.type = 'button';
  close.setAttribute('aria-label', PAIRING.closeLabel);
  close.appendChild(closeIcon());
  header.append(title, close);

  const body = el('div', CLASSES.body);
  const line = el('p', CLASSES.line, options.line);
  line.id = `${titleId}-line`;
  dialog.setAttribute('aria-describedby', line.id);
  body.append(line, qrFigure(options.qrValue, options.qrCaption));
  if (options.steps) {
    const list = el('ol', CLASSES.steps);
    for (const step of options.steps) list.appendChild(el('li', '', step));
    body.appendChild(list);
  }
  body.appendChild(copyField(options.link));
  if (options.open) {
    const open = el('a', CLASSES.openLink, options.open.label);
    open.href = options.open.href;
    if (!isAppLink(options.open.href)) {
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
    }
    body.appendChild(open);
  }
  if (options.beta) body.appendChild(el('p', CLASSES.beta, options.beta));
  if (options.get) {
    const line = el('p', CLASSES.getLine, `${options.get.prompt} `);
    const link = el('a', CLASSES.inlineLink, options.get.label);
    link.href = options.get.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    line.appendChild(link);
    body.appendChild(line);
  }

  dialog.append(header, body);
  document.body.appendChild(dialog);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    restoreFocus(opener);
  };
  const dismiss = () => {
    remove();
    options.onClose();
  };

  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });

  dialog.showModal();
  close.focus();
  return remove;
}
