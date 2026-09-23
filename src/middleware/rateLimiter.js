const rateLimit = require('express-rate-limit');
const metricsStore = require('../monitoring/metricsStore');

/**
 * Builds a rate limiter from an integration's config. Each client (by API
 * key) gets their own quota per integration, so one noisy client can't
 * starve another's requests to the same upstream API.
 */
function buildLimiter(config = {}) {
  return rateLimit({
    windowMs: config.windowMs || 60000,
    max: config.max || 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.apiKeyInfo ? req.apiKeyInfo.key : req.ip),
    handler: (req, res) => {
      metricsStore.record({
        timestamp: new Date().toISOString(),
        integration: req.integrationId || 'unknown',
        method: req.method,
        path: req.originalUrl,
        statusCode: 429,
        durationMs: 0,
        apiKey: req.apiKeyInfo && req.apiKeyInfo.name,
        success: false,
        error: 'Rate limit exceeded'
      });
      res.status(429).json({ error: 'RateLimitExceeded', message: 'Too many requests, slow down.' });
    }
  });
}

module.exports = { buildLimiter };
