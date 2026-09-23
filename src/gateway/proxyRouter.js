const express = require('express');
const axios = require('axios');
const { transformResponse } = require('../transform/transformer');
const metricsStore = require('../monitoring/metricsStore');
const { buildLimiter } = require('../middleware/rateLimiter');
const { requireApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

/** Attaches upstream credentials the gateway manages on the client's behalf. */
function applyUpstreamAuth(auth, axiosConfig) {
  if (!auth || auth.type === 'none') return;
  if (auth.type === 'apiKeyQuery') {
    axiosConfig.params[auth.queryParam] = process.env[auth.envVar] || '';
  } else if (auth.type === 'apiKeyHeader') {
    axiosConfig.headers[auth.headerName] = process.env[auth.envVar] || '';
  } else if (auth.type === 'bearer') {
    axiosConfig.headers.Authorization = `Bearer ${process.env[auth.envVar] || ''}`;
  }
}

function buildGatewayRouter(integrations) {
  const router = express.Router();

  integrations.forEach((integration) => {
    const limiter = buildLimiter(integration.rateLimit);
    const methods = (integration.methods || ['GET']).map((m) => m.toLowerCase());

    methods.forEach((method) => {
      router[method](
        `${integration.prefix}*`,
        (req, res, next) => {
          req.integrationId = integration.id;
          next();
        },
        requireApiKey,
        limiter,
        async (req, res) => {
          const start = Date.now();
          try {
            const subPath = req.path.slice(integration.prefix.length) || '';
            const targetUrl = `${integration.target}${integration.targetPath || ''}${subPath}`;

            const axiosConfig = {
              method,
              url: targetUrl,
              params: { ...req.query },
              headers: {},
              data: req.body,
              timeout: integration.timeoutMs || 8000,
              validateStatus: () => true
            };
            applyUpstreamAuth(integration.auth, axiosConfig);

            const upstream = await axios(axiosConfig);
            const transformed = transformResponse(upstream.data, integration.transform && integration.transform.response);
            const durationMs = Date.now() - start;

            metricsStore.record({
              timestamp: new Date().toISOString(),
              integration: integration.id,
              method: method.toUpperCase(),
              path: req.originalUrl,
              statusCode: upstream.status,
              durationMs,
              apiKey: req.apiKeyInfo && req.apiKeyInfo.name,
              success: upstream.status < 400
            });

            res.status(upstream.status).json(transformed);
          } catch (err) {
            const durationMs = Date.now() - start;
            metricsStore.record({
              timestamp: new Date().toISOString(),
              integration: integration.id,
              method: method.toUpperCase(),
              path: req.originalUrl,
              statusCode: 502,
              durationMs,
              apiKey: req.apiKeyInfo && req.apiKeyInfo.name,
              success: false,
              error: err.message
            });
            logger.error(`Gateway error on "${integration.id}": ${err.message}`);
            res.status(502).json({
              error: 'UpstreamError',
              message: 'Failed to reach the upstream API.',
              integration: integration.id
            });
          }
        }
      );
    });
  });

  return router;
}

module.exports = { buildGatewayRouter };
