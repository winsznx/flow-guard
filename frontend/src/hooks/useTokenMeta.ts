import { useEffect, useState } from 'react';
import { getCachedTokenMeta, resolveTokenMeta, type BchNetwork, type TokenMeta } from '../utils/tokenMeta';

/** A token's registry details (name, symbol, decimals, icon), or null while loading or when it has none. */
export function useTokenMeta(category: string | null | undefined, network?: BchNetwork): TokenMeta | null {
  const [resolved, setResolved] = useState<{ key: string; meta: TokenMeta | null } | null>(null);
  const key = category ? `${network ?? ''}:${category}` : null;

  useEffect(() => {
    if (!category || !key) return undefined;
    let ignore = false;
    resolveTokenMeta(category, network)
      .then((meta) => {
        if (!ignore) setResolved({ key, meta });
      })
      .catch((error: unknown) => console.warn('Token details did not load', error));
    return () => {
      ignore = true;
    };
  }, [category, key, network]);

  if (!category) return null;
  return resolved?.key === key ? resolved.meta : getCachedTokenMeta(category, network);
}
