const get = require('lodash/get');
const set = require('lodash/set');

/**
 * Named conversion functions a field mapping can reference. Add more here
 * as new integrations need them (e.g. currency conversion, unit conversion).
 */
const namedFns = {
  identity: (v) => v,
  centsToDollars: (v) => (typeof v === 'number' ? Number((v / 100).toFixed(2)) : v),
  toISODate: (v) => {
    if (!v) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  },
  lowercase: (v) => (typeof v === 'string' ? v.toLowerCase() : v)
};

/**
 * Applies a field map to a single object.
 * `fields` is { "sourcePath": "destPath" | { to, fn } }
 */
function applyFieldMap(obj, fields) {
  const out = {};
  for (const [fromPath, spec] of Object.entries(fields)) {
    const toPath = typeof spec === 'string' ? spec : spec.to;
    const fnName = typeof spec === 'string' ? 'identity' : spec.fn || 'identity';
    const fn = namedFns[fnName] || namedFns.identity;
    const val = get(obj, fromPath);
    if (val !== undefined) set(out, toPath, fn(val));
  }
  return out;
}

/**
 * Transforms an upstream response body according to an integration's
 * transform config. Works on a single object or an array of objects, and
 * can optionally dig into a nested array first via `arrayPath`
 * (e.g. a response shaped like { data: { items: [...] } }).
 */
function transformResponse(data, transformConfig) {
  if (!transformConfig || !transformConfig.fields) return data;
  const { fields, arrayPath } = transformConfig;

  const target = arrayPath ? get(data, arrayPath) : data;
  if (target === undefined) return data;

  if (Array.isArray(target)) {
    return target.map((item) => applyFieldMap(item, fields));
  }
  return applyFieldMap(target, fields);
}

module.exports = { transformResponse, applyFieldMap, namedFns };
