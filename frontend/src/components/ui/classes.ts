/**
 * Class strings shared by the React primitives and by code that builds DOM without React (the
 * connectors' pairing dialog), so both draw from one source. Nothing here imports React.
 */

export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-sans whitespace-nowrap select-none transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-h-touch';

export const BUTTON_LINK_BASE =
  'inline font-sans underline underline-offset-4 transition-colors duration-(--duration-fast) ease-standard';

export const BUTTON_VARIANTS = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-pressed',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken hover:border-line-control active:bg-sunken',
  ghost: 'text-ink-secondary hover:bg-sunken hover:text-ink active:bg-sunken',
  danger: 'bg-danger-fill text-on-brand hover:bg-danger-fill-hover active:bg-danger-fill-hover',
  'danger-quiet': 'bg-surface text-danger-ink border border-line-strong hover:bg-danger-tint active:bg-danger-tint',
  'on-inverse': 'bg-marker text-inverse hover:bg-surface active:bg-surface',
  'on-inverse-secondary': 'text-ink-inverse border border-ink-inverse-muted hover:border-ink-inverse active:border-ink-inverse',
  link: 'text-brand hover:text-brand-hover active:text-brand-hover',
} as const;

export const BUTTON_SIZES = {
  sm: 'h-control-sm px-3 text-label',
  md: 'h-control-md px-4 text-label',
  lg: 'h-control-lg px-6 text-body font-medium',
} as const;

export const BUTTON_INACTIVE = 'bg-sunken text-ink-muted border border-line cursor-not-allowed';

export const BUTTON_LINK_INACTIVE = 'text-ink-muted cursor-not-allowed';

export const BUTTON_ICON_SIZE = { sm: 16, md: 16, lg: 20 } as const;

export const BUTTON_REASON = 'text-small text-ink-secondary';

export const DIALOG_SIZES = {
  sm: 'max-w-dialog-sm',
  md: 'max-w-dialog-md',
  lg: 'max-w-dialog-lg',
} as const;

export const DIALOG_SURFACE =
  'on-surface m-auto w-full rounded-panel bg-surface p-6 text-ink shadow-dialog flex-col gap-6 open:flex transition-opacity duration-(--duration-slow) ease-standard starting:open:opacity-0';

export const DIALOG_BOTTOM_SHEET = 'max-sm:mt-auto max-sm:mb-0 max-sm:max-w-none max-sm:max-h-sheet max-sm:rounded-b-none';

export const DIALOG_HEADER = 'flex shrink-0 items-start justify-between gap-4';

export const QR_FRAME = 'rounded-card border border-line bg-surface p-4';

export const QR_CAPTION = 'max-w-popover text-center text-small text-ink-secondary';

export const COPY_FIELD_INPUT = 'h-touch w-full truncate rounded-control border border-line bg-sunken pl-3 pr-32 font-mono text-mono text-ink-secondary';
