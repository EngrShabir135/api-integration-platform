require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const integrations = require('./config/integrations.json');
const { buildGatewayRouter } = require('./gateway/proxyRouter');
const { buildMonitoringRouter } = require('./monitoring/dashboard');
const { buildOpenApiSpec } = require('./docs/generateDocs');
const { startMockBackend } = require('./mock-backend');
const logger = require('./utils/logger');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', integrations: integrations.length });
});

// Monitoring dashboard + metrics API
app.use('/admin', buildMonitoringRouter());
app.use('/dashboard-assets', express.static(path.join(__dirname, '../public')));

// Auto-generated API docs
const spec = buildOpenApiSpec(integrations);
app.get('/docs.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

// The gateway itself: every configured integration becomes a live route
app.use(buildGatewayRouter(integrations));

app.use((req, res) => {
  res.status(404).json({ error: 'NotFound', message: 'No route matches this path.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`API Integration Platform listening on port ${PORT}`);
  logger.info(`Dashboard:  http://localhost:${PORT}/admin`);
  logger.info(`API docs:   http://localhost:${PORT}/docs`);
  integrations.forEach((i) => logger.info(`Integration live: ${i.prefix} -> ${i.name}`));
});

if (process.env.START_MOCK_BACKEND !== 'false') {
  startMockBackend();
}
