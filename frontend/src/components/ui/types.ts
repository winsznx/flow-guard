export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type Size = 'sm' | 'md' | 'lg';

export type Asset =
  | { kind: 'bch' }
  | { kind: 'token'; tokenId: string; symbol?: string; decimals: number };

export type Disableable =
  | { disabled?: false; disabledReason?: never }
  | { disabled: boolean; disabledReason: string };

export type Busyable =
  | { busy?: false; busyLabel?: never }
  | { busy: boolean; busyLabel: string };

export type ActionState = Disableable & Busyable;
