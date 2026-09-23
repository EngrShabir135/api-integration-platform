# API Integration Platform

A self-hosted API integration platform in ~500 lines of Node.js. It implements the four
components a DIY integration platform needs: a **gateway** (auth, routing, rate limiting),
**data transformation** (standardizing inconsistent field names), **monitoring**
(a live dashboard), and **auto-generated documentation** (OpenAPI/Swagger).

Everything is config-driven: adding a new integration means adding one entry to
`src/config/integrations.json` — no new routes to write by hand.

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

The server starts on `http://localhost:4000` and also boots a small bundled mock backend
on port 4001 that simulates two internal systems (a CRM and a billing system) with
deliberately inconsistent field names, so you have something to call immediately without
needing any real credentials.

- **Dashboard:** http://localhost:4000/admin
- **API docs:** http://localhost:4000/docs
- **Health check:** http://localhost:4000/health

## Try it

```bash
# Standardized user records, proxied from the mock CRM (user_id -> id, full_name -> name...)
curl -H "x-api-key: demo-key-123" http://localhost:4000/api/users

# Standardized invoices, with amountCents automatically converted to dollars
curl -H "x-api-key: demo-key-123" http://localhost:4000/api/invoices
```

Open the dashboard at `/admin` and enter the admin key from your `.env` file
(`admin-secret-change-me` by default) to watch requests land in real time.

## How it's organized

```
src/
  config/
    integrations.json   # the integration registry — the heart of the platform
    apiKeys.json         # client API keys the gateway accepts
  gateway/
    proxyRouter.js       # builds live routes from the registry: auth -> rate limit -> proxy -> transform -> log
  middleware/
    auth.js               # client API key auth + admin key auth for the dashboard
    rateLimiter.js         # per-client, per-integration rate limiting
  transform/
    transformer.js       # the data transformation engine (field mapping + conversion functions)
  monitoring/
    metricsStore.js      # in-memory request log + aggregated stats
    dashboard.js          # /admin routes (dashboard page + /admin/metrics API)
  docs/
    generateDocs.js      # builds an OpenAPI spec from integrations.json
  mock-backend.js        # simulated internal APIs, for a runnable offline demo
  server.js              # wires everything together
public/
  dashboard.html          # the monitoring console
```

## Adding a real integration

Add an entry to `src/config/integrations.json`:

```jsonc
{
  "id": "shopify-orders",
  "name": "Shopify Orders",
  "prefix": "/api/orders",          // the route your clients will call
  "target": "https://your-store.myshopify.com",
  "targetPath": "/admin/api/2024-01/orders.json",
  "methods": ["GET"],
  "auth": { "type": "apiKeyHeader", "headerName": "X-Shopify-Access-Token", "envVar": "SHOPIFY_TOKEN" },
  "rateLimit": { "windowMs": 60000, "max": 40 },
  "transform": {
    "response": {
      "arrayPath": "orders",         // dig into a nested array before mapping, if needed
      "fields": {
        "id": "id",
        "total_price": { "to": "totalAmount", "fn": "identity" },
        "created_at": { "to": "createdAt", "fn": "toISODate" }
      }
    }
  }
}
```

Then set `SHOPIFY_TOKEN` in `.env`. The gateway attaches it to every upstream request —
your clients never see the real credential, only your platform's own API key.
No route code, no docs update, no dashboard wiring required; all three pick it up
automatically from the registry.

**Supported upstream auth types:** `none`, `apiKeyHeader`, `apiKeyQuery`, `bearer`.

**Supported transform functions:** `identity`, `centsToDollars`, `toISODate`, `lowercase`
(add more in `src/transform/transformer.js`'s `namedFns`).

## Notes on scope

This is a working starter, not a production platform — good next steps if you take it
further: persist metrics and API keys to a real database instead of memory/JSON files,
add request-body transformation (only responses are transformed here), add per-key
scoped permissions per integration, and add retries/circuit-breaking around upstream
calls. The architecture (config-driven registry -> gateway -> transform -> monitor ->
docs) is built to support all of that without a rewrite.
