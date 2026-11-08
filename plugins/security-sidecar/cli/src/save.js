'use strict';
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate');
const { findSecrets } = require('./secrets');

const KEY_ORDER = ['version', 'mode', 'route', 'methods', 'enforcement', 'gate', 'linkable', 'reason', 'notes'];
const POLICY_ORDER = ['exposure', 'cache', 'indexing', 'rateLimit'];
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', '*'];
const SIDECAR_NAME = /^(?:[A-Za-z0-9_-]+)?\.route\.json$/;

const pick = (o, order) => Object.fromEntries(order.filter((k) => k in o).map((k) => [k, o[k]]));

// Stable key order so diffs stay small (NFR-5).
function canonical(doc) {
  const out = pick(doc, KEY_ORDER);
  out.methods = Object.fromEntries(
    Object.keys(doc.methods).sort((a, b) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b))
      .map((m) => [m, pick(doc.methods[m], POLICY_ORDER)]),
  );
  return out;
}

// Never clobber what a person decided: user-chosen methods and notes survive heuristic re-saves.
function merge(existing, incoming) {
  const doc = { ...incoming };
  doc.version = 1;
  doc.mode = existing.mode || incoming.mode || 'annotate';
  if (existing.notes) doc.notes = existing.notes;
  for (const k of ['enforcement', 'gate', 'linkable']) if (k in existing && !(k in incoming)) doc[k] = existing[k];
  const incomingIsUser = incoming.reason && incoming.reason.source === 'user';
  const existingIsUser = existing.reason && existing.reason.source === 'user';
  doc.methods = { ...incoming.methods };
  if (existingIsUser && !incomingIsUser) {
    Object.assign(doc.methods, existing.methods);
    doc.reason = existing.reason;
  }
  return doc;
}

function save(dir, policy, { file = '.route.json' } = {}) {
  if (!SIDECAR_NAME.test(file)) return { ok: false, code: 2, error: `invalid sidecar file name: ${file}` };
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, code: 2, error: `not a directory: ${dir}` };

  const incoming = { version: 1, ...policy };
  const target = path.join(dir, file);
  let existing = null;
  if (fs.existsSync(target)) {
    try { existing = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { /* corrupt: replaced below */ }
  }
  const doc = existing ? merge(existing, incoming) : { mode: 'annotate', ...incoming };

  // Making a protected route linkable removes a protection, so it needs the user's own approval.
  if (doc.linkable === true && !(existing && existing.linkable === true) && !(doc.reason && doc.reason.source === 'user')) {
    return { ok: false, code: 2, error: '"linkable": true needs the user\'s approval: ask them, then save with reason.source "user"' };
  }

  const v = validate(doc);
  if (!v.valid) return { ok: false, code: 2, error: 'schema validation failed', errors: v.errors };
  const secrets = findSecrets(doc);
  if (secrets.length) return { ok: false, code: 2, error: 'secret-like value rejected; nothing was written', secrets };

  const text = JSON.stringify(canonical(doc), null, 2) + '\n';
  const changed = !existing || fs.readFileSync(target, 'utf8') !== text;
  if (changed) fs.writeFileSync(target, text);
  return { ok: true, code: 0, path: target, written: changed, validation: { valid: true, errors: [] } };
}

module.exports = { save, canonical };
