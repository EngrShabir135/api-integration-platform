const fs = require('fs');
const path = require('path');

const apiKeys = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/apiKeys.json'), 'utf-8')
);

/**
 * Requires a valid x-api-key header. Attaches req.apiKeyInfo on success.
 * This is what lets the platform meter and rate-limit usage per client,
 * regardless of which upstream integration is being called.
 */
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!key) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing x-api-key header.' });
  }
  const record = apiKeys.find((k) => k.key === key && k.active);
  if (!record) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or inactive API key.' });
  }
  req.apiKeyInfo = record;
  next();
}

/**
 * Protects the metrics/monitoring API with a separate admin key so gateway
 * clients can't see traffic data for other clients.
 */
function adminAuth(req, res, next) {
  const provided = req.header('x-admin-key');
  const expected = process.env.ADMIN_KEY || 'admin-secret-change-me';
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid x-admin-key header.' });
  }
  next();
}

module.exports = { requireApiKey, adminAuth };
