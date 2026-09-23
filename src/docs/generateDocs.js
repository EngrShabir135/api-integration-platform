/**
 * Builds an OpenAPI 3.0 document straight from integrations.json, so
 * documentation can never drift out of sync with what the gateway
 * actually exposes: add an integration, get a documented endpoint.
 */
function buildOpenApiSpec(integrations) {
  const paths = {};

  integrations.forEach((integration) => {
    paths[integration.prefix] = paths[integration.prefix] || {};
    (integration.methods || ['GET']).forEach((method) => {
      paths[integration.prefix][method.toLowerCase()] = {
        summary: integration.name,
        description:
          integration.description ||
          `Proxies to ${integration.target}${integration.targetPath || ''}, with response fields standardized.`,
        tags: [integration.id],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: { description: 'Successful, transformed response.' },
          401: { description: 'Missing or invalid API key.' },
          429: { description: 'Rate limit exceeded for this client.' },
          502: { description: 'The upstream API failed or timed out.' }
        }
      };
    });
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'API Integration Platform',
      version: '1.0.0',
      description:
        'Auto-generated documentation for every integration currently registered in src/config/integrations.json.'
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' }
      }
    },
    paths
  };
}

module.exports = { buildOpenApiSpec };
