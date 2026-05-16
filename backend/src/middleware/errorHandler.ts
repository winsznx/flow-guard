/**
 * Global Error Handler Middleware
 * Provides consistent error responses and logging
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: any;
  timestamp: number;
}

/**
 * Application error codes
 */
export enum ErrorCode {
  // Validation errors (400)
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',

  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  MISSING_AUTH = 'MISSING_AUTH',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  NOT_OWNER = 'NOT_OWNER',
  NOT_RECIPIENT = 'NOT_RECIPIENT',

  // Resource errors (404)
  NOT_FOUND = 'NOT_FOUND',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  VAULT_NOT_FOUND = 'VAULT_NOT_FOUND',
  STREAM_NOT_FOUND = 'STREAM_NOT_FOUND',

  // State errors (409)
  INVALID_STATE = 'INVALID_STATE',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  ALREADY_FUNDED = 'ALREADY_FUNDED',
  ALREADY_CLAIMED = 'ALREADY_CLAIMED',

  // Blockchain errors (500)
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONTRACT_DEPLOY_FAILED = 'CONTRACT_DEPLOY_FAILED',
  UTXO_NOT_FOUND = 'UTXO_NOT_FOUND',

  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_ERROR = 'SERVICE_ERROR',
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create validation error
 */
export function validationError(message: string, details?: any): AppError {
  return new AppError(ErrorCode.INVALID_INPUT, message, 400, details);
}

/**
 * Create not found error
 */
export function notFoundError(resource: string, id?: string): AppError {
  const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
  return new AppError(ErrorCode.NOT_FOUND, message, 404);
}

/**
 * Create unauthorized error
 */
export function unauthorizedError(message: string = 'Unauthorized'): AppError {
  return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
}

/**
 * Create forbidden error
 */
export function forbiddenError(message: string = 'Forbidden'): AppError {
  return new AppError(ErrorCode.FORBIDDEN, message, 403);
}

/**
 * Create invalid state error
 */
export function invalidStateError(message: string, details?: any): AppError {
  return new AppError(ErrorCode.INVALID_STATE, message, 409, details);
}

/**
 * Create blockchain error
 */
export function blockchainError(message: string, details?: any): AppError {
  return new AppError(ErrorCode.BLOCKCHAIN_ERROR, message, 500, details);
}

/**
 * When true, non-AppError messages are passed through to the client.
 * Gated to explicit non-production environments so a misconfigured `NODE_ENV`
 * (empty string, "Production", whitespace) defaults to the safer behaviour.
 */
function isVerboseErrorMode(): boolean {
  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  return env === 'development' || env === 'test' || env === 'dev';
}

/**
 * Global error handler middleware
 * Must be registered AFTER all routes
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error server-side with full detail; response to client is redacted in prod.
  console.error('[ERROR]', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  const verbose = isVerboseErrorMode();

  // Handle AppError — explicitly constructed, message is already safe to show.
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: err.code,
      message: err.message,
      code: err.code,
      details: err.details,
      timestamp: Date.now(),
    };

    return res.status(err.statusCode).json(response);
  }

  // Unknown errors leak raw driver messages, file paths, and schema detail.
  // In prod we return only a generic error; in dev we include the message.
  const rawMessage = err.message || '';

  if (rawMessage.includes('not found')) {
    return res.status(404).json({
      error: ErrorCode.NOT_FOUND,
      message: verbose ? rawMessage : 'Resource not found',
      timestamp: Date.now(),
    });
  }

  if (rawMessage.includes('insufficient') || rawMessage.includes('balance')) {
    return res.status(500).json({
      error: ErrorCode.INSUFFICIENT_FUNDS,
      message: verbose ? rawMessage : 'Insufficient funds or balance',
      timestamp: Date.now(),
    });
  }

  if (rawMessage.includes('UTXO') || rawMessage.includes('utxo')) {
    return res.status(500).json({
      error: ErrorCode.UTXO_NOT_FOUND,
      message: verbose ? rawMessage : 'UTXO unavailable',
      timestamp: Date.now(),
    });
  }

  return res.status(500).json({
    error: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
    details: verbose ? rawMessage : undefined,
    timestamp: Date.now(),
  });
}

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate required parameters
 */
export function requireParams(req: Request, params: string[]): void {
  const missing = params.filter(param => !req.body[param] && !req.params[param] && !req.query[param]);

  if (missing.length > 0) {
    throw validationError(
      `Missing required parameters: ${missing.join(', ')}`,
      { missing }
    );
  }
}

/**
 * Validate BCH address format
 */
export function validateAddress(address: string): void {
  if (!address || typeof address !== 'string') {
    throw validationError('Invalid address format');
  }

  // Basic validation - should start with bitcoincash: or bchtest:
  const isValid =
    address.startsWith('bitcoincash:') ||
    address.startsWith('bchtest:') ||
    address.startsWith('bchreg:') ||
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address); // Legacy format

  if (!isValid) {
    throw validationError('Invalid BCH address format', { address });
  }
}

/**
 * Validate amount (must be positive integer for satoshis)
 */
export function validateAmount(amount: any): void {
  if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
    throw validationError('Amount must be a positive integer (satoshis)', { amount });
  }
}

/**
 * Validate UUID format
 */
export function validateUUID(id: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw validationError('Invalid ID format', { id });
  }
}

/**
 * Express `router.param` handler — rejects requests with malformed UUIDs
 * before they touch the database. Use as `router.param('id', uuidParam)`
 * (or any other declared param name) to short-circuit dead lookups.
 *
 * Audit L-02: previously every handler that consumed `req.params.id` would
 * pass the raw value to a Postgres `WHERE id = $1` query. Postgres rejects
 * malformed UUIDs with a driver error that bubbled back as a 500. This guard
 * gives clients a deterministic 400 instead.
 */
export function uuidParam(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    res.status(400).json({
      error: ErrorCode.INVALID_INPUT,
      message: 'Path parameter must be a UUID',
      details: { value },
      timestamp: Date.now(),
    });
    return;
  }
  next();
}
