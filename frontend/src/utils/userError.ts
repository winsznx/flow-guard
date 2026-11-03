import { ERROR_CATALOG, asFlowError, rawErrorText, type ErrorCode, type ErrorEntry } from '../copy/errors';

export interface UserFacingError {
  code: ErrorCode;
  /** One sentence from the catalog in copy/errors.ts. */
  message: string;
  /** The raw text, in full, for the Details disclosure. */
  details?: string;
  /** null for a closed pairing dialog, which shows nothing. Declines are neutral. */
  tone: ErrorEntry['tone'];
  /** Set when a transaction went out, so the page can link to it. */
  txid?: string;
}

/**
 * Maps any thrown value to what a page shows: the catalog message for its code, with
 * the raw text kept whole in `details`. `fallback` is used only when nothing at all
 * was thrown (an empty error), so the page can still say what it was doing.
 */
export function toUserFacingError(error: unknown, fallback?: string): UserFacingError {
  const flow = asFlowError(error);
  const entry = ERROR_CATALOG[flow.code];
  const nothingThrown = flow.code === 'UNKNOWN' && !rawErrorText(error);
  return {
    code: flow.code,
    message: nothingThrown && fallback ? fallback : flow.message,
    details: flow.details,
    tone: entry.tone,
    txid: flow.txid,
  };
}
