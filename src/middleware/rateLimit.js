import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const isDev = config.nodeEnv !== 'production';

// Helper to allow unrestricted access for local development
const isLocalhost = (req) => {
  if (isDev) return true;
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
};

// Strict limiter for authentication endpoints (prevent brute-force in production)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 20, // 1000 in dev, 20 in prod
  skip: (req) => isLocalhost(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// WhatsApp connect limiter (prevent repeated socket thrashing)
export const waConnectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 120 : 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many connection attempts. Please wait a moment before trying again.'
  }
});

// Admin API limiter
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many admin requests. Please slow down and try again later.'
  }
});

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 300,
  skip: (req) => isLocalhost(req),
  standardHeaders: true,
  legacyHeaders: false
});
