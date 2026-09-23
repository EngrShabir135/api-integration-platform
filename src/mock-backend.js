const express = require('express');
const logger = require('./utils/logger');

/**
 * Simulates two internal systems (a CRM and a billing system) that, like
 * real internal APIs usually do, disagree on field naming. This is what
 * the gateway's transform config standardizes for API consumers — you can
 * point these integrations at real internal services later without
 * changing anything downstream of the gateway.
 */
function startMockBackend(port = process.env.MOCK_PORT || 4001) {
  const app = express();

  app.get('/crm/users', (req, res) => {
    res.json([
      { user_id: 1, full_name: 'Ava Thompson', email_address: 'ava@example.com', signup_ts: '2024-01-15T10:00:00Z' },
      { user_id: 2, full_name: 'Marcus Lee', email_address: 'marcus@example.com', signup_ts: '2024-03-02T14:30:00Z' },
      { user_id: 3, full_name: 'Priya Patel', email_address: 'priya@example.com', signup_ts: '2024-06-21T09:15:00Z' }
    ]);
  });

  app.get('/billing/invoices', (req, res) => {
    res.json([
      { invoiceId: 'INV-1001', cust: 'Ava Thompson', amountCents: 4599, status: 'paid', due: '2024-02-01T00:00:00Z' },
      { invoiceId: 'INV-1002', cust: 'Marcus Lee', amountCents: 12000, status: 'pending', due: '2024-04-01T00:00:00Z' }
    ]);
  });

  app.listen(port, () => logger.info(`Mock backend (simulated CRM/Billing systems) listening on port ${port}`));
}

module.exports = { startMockBackend };
