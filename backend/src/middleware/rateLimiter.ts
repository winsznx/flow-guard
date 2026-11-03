/**
 * Rate Limiting Middleware
 * Prevents DoS attacks by limiting request rates per IP address
 */

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Header pair the Cloudflare Worker uses to declare the real visitor address.
 *
 * The Worker at flowguard.cash proxies /api/* here, so from this server's point of
 * view every one of those requests originates from a Cloudflare egress address —
 * and Cloudflare rotates those per request. Keying on req.ip therefore spread a
 * single visitor across many buckets and left the limits below unenforced on the
 * only path real users take. Measured before this change: eight consecutive
 * requests through the Worker reported remaining counts of 98, 99, 97, 99, 98, 96,
 * 95, 99, while the same eight sent directly decremented cleanly.
 */
const CLIENT_IP_HEADER = 'x-flowguard-client-ip';
const EDGE_SECRET_HEADER = 'x-flowguard-edge-secret';

/**
 * api.flowguard.cash resolves straight to this host (DNS-only, so Caddy can answer
 * ACME challenges), which means anyone can reach it without passing through the
 * Worker and simply assert whatever client IP they like. The forwarded address is
 * therefore only honoured when accompanied by a shared secret that exists solely in
 * the Worker's environment and this process's. Without EDGE_PROXY_SECRET set, the
 * headers are ignored entirely and behaviour falls back to req.ip.
 */
function forwardedClientIp(req: Request): string | null {
  const secret = process.env.EDGE_PROXY_SECRET;
  if (!secret) return null;

  const presented = req.get(EDGE_SECRET_HEADER);
  if (!presented || presented !== secret) return null;

  const ip = req.get(CLIENT_IP_HEADER)?.trim();
  return ip ? ip : null;
}

/**
 * Collapse an address to the unit worth rate limiting.
 *
 * IPv4 is used whole. IPv6 is truncated to its /64 prefix: a single subscriber is
 * routinely handed an entire /64 and can source a different address per request, so
 * limiting the full address is limiting nothing.
 */
function bucketFor(ip: string): string {
  const address = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
  if (!address.includes(':')) return address;

  const groups = address.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/**
 * Bucket a request by its real origin: the Worker-declared visitor address when it
 * is authenticated, otherwise the peer Caddy reported.
 */
export function clientRateLimitKey(req: Request): string {
  return bucketFor(forwardedClientIp(req) ?? req.ip ?? 'unknown');
}

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: clientRateLimitKey,
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip successful requests from rate limit count (optional)
  skipSuccessfulRequests: false,
  // Skip failed requests from rate limit count (optional)
  skipFailedRequests: false,
  // /api/status has its own statusLimiter; it is polled by the status page and network guard.
  skip: (req) => req.path === '/status' || req.path.startsWith('/status/'),
});

/**
 * Status rate limiter
 * 600 requests per 15 minutes per IP
 * The payload is cached in-process for 10s, so volume here never reaches upstream probes.
 */
export const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  keyGenerator: clientRateLimitKey,
  max: 600,
  message: {
    error: 'Too many status requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for creation endpoints
 * 10 requests per 15 minutes per IP
 * Used for expensive operations like contract deployment
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: clientRateLimitKey,
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many creation requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Authentication rate limiter
 * 5 requests per 15 minutes per IP
 * Used for sensitive operations like wallet connection
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: clientRateLimitKey,
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Query rate limiter
 * 200 requests per 15 minutes per IP
 * Used for read-only endpoints
 */
export const queryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: clientRateLimitKey,
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    error: 'Too many query requests from this IP, please try again after 15 minutes',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful queries against the limit
});
