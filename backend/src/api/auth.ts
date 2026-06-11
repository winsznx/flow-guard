/**
 * Authentication endpoints.
 *
 * Clients call POST /api/auth/nonce with their BCH address (and optionally
 * the CAIP-122 context: domain, uri, chain-id) to obtain a short-lived,
 * single-use login nonce + the multi-line CAIP-122 message to sign. They
 * then sign that message with the wallet key that controls the declared
 * BCH address (via wc2-bch-bcr `bch_signMessage`) and attach the resulting
 * signature on subsequent authenticated requests via the SIWX headers
 * documented in `backend/src/middleware/auth.ts`.
 */

import { Router, Request, Response } from 'express';
import {
  issueAuthNonce,
  issueBearer,
  verifyWalletOwnership,
  type NonceContext,
} from '../middleware/auth.js';

const router = Router();

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

router.post('/auth/nonce', (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }
  const context: NonceContext = {
    domain: trimOrUndefined(req.body?.domain),
    uri: trimOrUndefined(req.body?.uri),
    chainId: trimOrUndefined(req.body?.chainId),
  };
  try {
    const nonce = issueAuthNonce(address, context);
    return res.json({
      success: true,
      nonceId: nonce.id,
      message: nonce.message,
      expiresAt: nonce.expiresAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid address';
    return res.status(400).json({ error: 'invalid_address', message });
  }
});

/**
 * POST /api/auth/verify
 *
 * Exchange a one-shot SIWX proof (nonce id + signature, optionally an explicit
 * signer pubkey for the legacy hex path) for a 30-minute bearer token. The
 * frontend caches the bearer in sessionStorage and attaches it as
 * `Authorization: Bearer <token>` on subsequent guarded calls so the wallet
 * only prompts once per session.
 *
 * On signature failure this returns 401 — same shape as `requireWalletAuth`
 * — so the client can present a unified "auth failed" path.
 */
router.post('/auth/verify', (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  const signature = String(req.body?.signature || '').trim();
  const nonceId = String(req.body?.nonceId || '').trim();
  const signerPubkeyHex = trimOrUndefined(req.body?.signerPubkeyHex);

  if (!address || !signature || !nonceId) {
    return res.status(400).json({ error: 'address, signature, and nonceId are required' });
  }

  try {
    const user = verifyWalletOwnership({ address, signature, nonceId, signerPubkeyHex });
    const bearer = issueBearer(user);
    return res.json({
      success: true,
      bearer: bearer.token,
      expiresAt: bearer.expiresAt,
      verifiedUser: {
        address: user.address,
        pubkeyHex: user.pubkeyHex,
        legacySiwxFormat: user.legacySiwxFormat,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return res.status(401).json({ error: 'Unauthorized', message });
  }
});

export default router;
