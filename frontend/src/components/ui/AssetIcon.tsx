import { useState } from 'react';
import { cx } from './cx';
import type { Asset } from './types';
import { useTokenMeta } from '../../hooks/useTokenMeta';

export type AssetIconProps = {
  asset: Asset;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const SIZE = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-7',
  xl: 'size-9',
} as const;

const LETTER = { sm: 'text-caption', md: 'text-caption', lg: 'text-label', xl: 'text-title-item' } as const;

/** Tokens without a registry icon get a steady color picked from their ID, so the same token always looks the same. */
const FALLBACK_TONES = [
  'bg-brand-soft text-brand',
  'bg-info-tint text-info-ink',
  'bg-success-tint text-success-ink',
  'bg-warning-tint text-warning-ink',
  'bg-danger-tint text-danger-ink',
  'bg-neutral-tint text-neutral-ink',
] as const;

function toneFor(tokenId: string): string {
  let hash = 0;
  for (const char of tokenId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

/** Registry icons are https or IPFS links. Anything else is not loaded. */
function iconSource(uri: string | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`;
  return uri.startsWith('https://') ? uri : null;
}

function BchMark({ size }: { size: NonNullable<AssetIconProps['size']> }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cx('shrink-0', SIZE[size])}>
      <circle cx="16" cy="16" r="16" className="fill-bch" />
      <path
        className="fill-on-brand"
        d="M21.207 10.534c-.776-1.972-2.722-2.15-4.988-1.71l-.807-2.813-1.712.491.786 2.74c-.45.128-.908.27-1.363.41l-.79-2.758-1.711.49.805 2.813c-.368.114-.73.226-1.085.328l-.003-.01-2.362.677.525 1.83s1.258-.388 1.243-.358c.694-.199 1.035.139 1.2.468l.92 3.204c.047-.013.11-.029.184-.04l-.181.052 1.287 4.49c.032.227.004.612-.48.752.027.013-1.246.356-1.246.356l.247 2.143 2.228-.64c.415-.117.825-.227 1.226-.34l.817 2.845 1.71-.49-.807-2.815a65.74 65.74 0 001.372-.38l.802 2.803 1.713-.491-.814-2.84c2.831-.991 4.638-2.294 4.113-5.07-.422-2.234-1.724-2.912-3.471-2.836.848-.79 1.213-1.858.642-3.3zm-.65 6.77c.61 2.127-3.1 2.929-4.26 3.263l-1.081-3.77c1.16-.333 4.704-1.71 5.34.508zm-2.322-5.09c.554 1.935-2.547 2.58-3.514 2.857l-.98-3.419c.966-.277 3.915-1.455 4.494.563z"
      />
    </svg>
  );
}

/** Two rings, read as a coin at any size. Drawn in the tone's text color. */
function CoinGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="size-3/5">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5z"
      />
    </svg>
  );
}

function TokenMark({ tokenId, symbol, size }: { tokenId: string; symbol?: string; size: NonNullable<AssetIconProps['size']> }) {
  const meta = useTokenMeta(tokenId);
  const initial = (meta?.symbol ?? symbol ?? '').trim().charAt(0).toUpperCase();
  const source = iconSource(meta?.iconUri);
  const [failed, setFailed] = useState<string | null>(null);

  if (source && failed !== source) {
    return (
      <img
        src={source}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(source)}
        className={cx('shrink-0 rounded-pill bg-surface object-cover', SIZE[size])}
      />
    );
  }

  return (
    <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center rounded-pill', SIZE[size], toneFor(tokenId))}>
      {initial ? <span className={cx('font-semibold', LETTER[size])}>{initial}</span> : <CoinGlyph />}
    </span>
  );
}

/** The coin's logo: the BCH mark, a token's registry icon, or a colored coin for tokens without one. */
export function AssetIcon({ asset, size = 'md' }: AssetIconProps) {
  if (asset.kind === 'bch') return <BchMark size={size} />;
  return <TokenMark tokenId={asset.tokenId} symbol={asset.symbol} size={size} />;
}
