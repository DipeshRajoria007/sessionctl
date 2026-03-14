import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Security middleware for the REST API.
 * Since SessionCtl is local-only, we lock down to localhost.
 */

/**
 * Only allow connections from localhost.
 */
export function localhostOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

  if (!isLocal) {
    res.status(403).json({ error: 'Access denied: local connections only' });
    return;
  }
  next();
}

/**
 * Rate limiter to prevent abuse.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Validate Content-Type for POST/PUT requests.
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({ error: 'Content-Type must be application/json' });
      return;
    }
  }
  next();
}

/**
 * Global error handler.
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error('Unhandled error:', err.message);

  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { details: err.message }),
  });
}

/**
 * Request body size limiter (already handled by express.json, but explicit).
 */
export const JSON_BODY_LIMIT = '100kb';
