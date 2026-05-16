/**
 * Authentication endpoints.
 *
 * Clients call POST /api/auth/nonce to obtain a short-lived login nonce; they
 * then sign the returned `message` with the wallet key that controls the
 * declared BCH address and include the signature on subsequent authenticated
 * requests (see backend/src/middleware/auth.ts).
 */

import { Router, Request, Response } from 'express';
import { issueAuthNonce } from '../middleware/auth.js';

const router = Router();

router.post('/auth/nonce', (req: Request, res: Response) => {
  const address = String(req.body?.address || '').trim();
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }
  try {
    const nonce = issueAuthNonce(address);
    return res.json({
      success: true,
      nonceId: nonce.id,
      message: nonce.message,
      expiresAt: nonce.expiresAt,
    });
  } catch (error: any) {
    return res.status(400).json({ error: 'invalid_address', message: error?.message || 'Invalid address' });
  }
});

export default router;
