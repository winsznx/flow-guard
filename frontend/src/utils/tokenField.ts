/**
 * The "pay with a token" field the create forms share: the ID format check shown as you
 * type, the token's name and decimals once it's looked up, and the check before submit.
 */

import { useEffect, useState } from 'react';
import type { CodeCheck } from '../components/ui/AddressInput';
import type { Asset } from '../components/ui/types';
import { FIELD_ERRORS, WHO } from '../copy/streamCreate';
import type { Network } from '../hooks/useNetwork';
import { parseUnits } from './streamShapes';
import { resolveTokenMeta, type TokenMeta } from './tokenMeta';
import { checkTokenCategory } from './tokenValidation';

export const TOKEN_ID = /^[0-9a-fA-F]{64}$/;

export function tokenIdCheck(value: string): CodeCheck {
  const id = value.trim();
  if (id.length !== 64) return { ok: false, message: FIELD_ERRORS.tokenLength(id.length) };
  if (!TOKEN_ID.test(id)) return { ok: false, message: FIELD_ERRORS.tokenCharacters };
  return { ok: true, display: `${id.slice(0, 6)}…${id.slice(-6)}` };
}

export type TokenChoice = {
  asset: Asset;
  /** The asset to type amounts in while the token's decimals are still being looked up. */
  inputAsset: Asset;
  decimals: number;
  meta: TokenMeta | null;
  pending: boolean;
  helper: string;
};

const BCH_ASSET: Asset = { kind: 'bch' };

/** What the form knows about the chosen token. With BCH it is plain BCH with 8 decimals. */
export function useTokenChoice(token: boolean, rawTokenId: string, network: Network): TokenChoice {
  const tokenId = token ? rawTokenId.trim() : '';
  const [resolved, setResolved] = useState<{ category: string; meta: TokenMeta | null } | null>(null);

  useEffect(() => {
    if (!TOKEN_ID.test(tokenId)) return;
    let ignore = false;
    resolveTokenMeta(tokenId, network).then((meta) => {
      if (!ignore) setResolved({ category: tokenId, meta });
    });
    return () => {
      ignore = true;
    };
  }, [network, tokenId]);

  if (!token) return { asset: BCH_ASSET, inputAsset: BCH_ASSET, decimals: 8, meta: null, pending: false, helper: '' };
  const meta = resolved && resolved.category === tokenId ? resolved.meta : null;
  const pending = TOKEN_ID.test(tokenId) && resolved?.category !== tokenId;
  const decimals = meta?.decimals ?? 0;
  const asset: Asset = { kind: 'token', tokenId, symbol: meta?.symbol, decimals };
  const name = meta ? meta.name || meta.symbol || WHO.tokenUnnamed : null;
  return {
    asset,
    inputAsset: pending ? { kind: 'token', tokenId, decimals: 18 } : asset,
    decimals,
    meta,
    pending,
    helper: name === null ? WHO.tokenIdHelper : decimals > 0 ? WHO.tokenFound(name, decimals) : WHO.tokenFoundWhole(name),
  };
}

export type TokenConfirmation =
  | { ok: true; decimals: number }
  | { ok: false; field: 'tokenId' | 'amount'; message: string };

/** Checks the token exists on `network` and that `amount` fits its decimals, right before a step that relies on it. */
export async function confirmToken(tokenId: string, amount: string, network: Network): Promise<TokenConfirmation> {
  const check = await checkTokenCategory(tokenId, network);
  if (!check.ok) {
    return {
      ok: false,
      field: 'tokenId',
      message: check.reason === 'unavailable' ? FIELD_ERRORS.tokenUnavailable : FIELD_ERRORS.tokenNotFound,
    };
  }
  const decimals = (await resolveTokenMeta(tokenId, network))?.decimals ?? 0;
  if (amount.trim() && parseUnits(amount, decimals) === null) {
    return { ok: false, field: 'amount', message: FIELD_ERRORS.amountTokenDecimals(decimals) };
  }
  return { ok: true, decimals };
}
