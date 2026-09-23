const MAX_ENTRIES = 500;

class MetricsStore {
  constructor() {
    this.entries = [];
  }

  record(entry) {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  recent(limit = 50) {
    return this.entries.slice(-limit).reverse();
  }

  summary() {
    const total = this.entries.length;
    const errors = this.entries.filter((e) => !e.success).length;
    const avgLatency = total
      ? Math.round(this.entries.reduce((sum, e) => sum + (e.durationMs || 0), 0) / total)
      : 0;

    const oneMinuteAgo = Date.now() - 60000;
    const requestsLastMinute = this.entries.filter(
      (e) => new Date(e.timestamp).getTime() >= oneMinuteAgo
    ).length;

    const perIntegration = {};
    for (const e of this.entries) {
      if (!perIntegration[e.integration]) {
        perIntegration[e.integration] = { requests: 0, errors: 0, totalLatency: 0 };
      }
      const bucket = perIntegration[e.integration];
      bucket.requests += 1;
      if (!e.success) bucket.errors += 1;
      bucket.totalLatency += e.durationMs || 0;
    }
    const integrationBreakdown = Object.entries(perIntegration).map(([id, b]) => ({
      integration: id,
      requests: b.requests,
      errors: b.errors,
      avgLatencyMs: Math.round(b.totalLatency / b.requests)
    }));

    return {
      totalRequests: total,
      totalErrors: errors,
      errorRate: total ? Number(((errors / total) * 100).toFixed(1)) : 0,
      avgLatencyMs: avgLatency,
      requestsLastMinute,
      integrationBreakdown
    };
  }
}

module.exports = new MetricsStore();
