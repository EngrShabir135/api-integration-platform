const express = require('express');
const path = require('path');
const metricsStore = require('./metricsStore');
const { adminAuth } = require('../middleware/auth');
const integrations = require('../config/integrations.json');

function buildMonitoringRouter() {
  const router = express.Router();

  // Dashboard shell loads freely; it asks for the admin key itself before
  // it can fetch any actual metrics.
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
  });

  router.get('/metrics', adminAuth, (req, res) => {
    res.json({
      summary: metricsStore.summary(),
      recent: metricsStore.recent(50),
      integrations: integrations.map((i) => ({ id: i.id, name: i.name, prefix: i.prefix }))
    });
  });

  return router;
}

module.exports = { buildMonitoringRouter };
