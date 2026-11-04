'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./routes');
const { validate } = require('./validate');

function check(root = process.cwd(), { strict = false } = {}) {
  const config = R.loadConfig(root);
  const findings = [];
  const expected = new Set();   // sidecars that should exist
  const existing = [];          // sidecars on disk

  R.walk(root, (rel) => {
    if (R.isRouteFile(rel, config)) expected.add(R.sidecarPathFor(rel));
    if (/(^|\/)(?:[A-Za-z0-9_-]+)?\.route\.json$/.test(rel)) existing.push(rel);
  });

  const docs = new Map();
  for (const rel of existing) {
    if (R.inStaticDir(rel)) {
      findings.push({ type: 'static-served', file: rel, message: 'sidecar sits in a statically served directory and may be public' });
    }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
    catch (e) { findings.push({ type: 'schema', file: rel, message: `invalid JSON: ${e.message}` }); continue; }
    const v = validate(doc);
    if (!v.valid) { findings.push({ type: 'schema', file: rel, message: v.errors.join('; ') }); continue; }
    docs.set(rel, doc);
    const open = Object.entries(doc.methods).filter(([, p]) => p.exposure === 'unclassified').map(([m]) => m);
    if (open.length) findings.push({ type: 'unclassified', file: rel, message: `unclassified exposure for ${open.join(', ')}` });
    if (!expected.has(rel)) findings.push({ type: 'orphan', file: rel, message: 'no matching route source (deleted or renamed?)' });
  }
  for (const rel of [...expected].sort()) {
    if (!existing.includes(rel)) findings.push({ type: 'missing', file: rel, message: 'route has no sidecar' });
  }

  const enforcing = (f) => docs.get(f.file)?.mode === 'enforce';
  const failing = findings.filter((f) => strict || enforcing(f));
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.type < b.type ? -1 : 1));
  return {
    ok: failing.length === 0, exitCode: failing.length ? 1 : 0, strict,
    routes: expected.size, sidecars: existing.length, findings,
    summary: findings.length ? `${findings.length} finding(s)` : 'all routes have valid sidecars',
  };
}

function format(r) {
  const lines = r.findings.map((f) => `  [${f.type}] ${f.file}: ${f.message}`);
  const head = `security-sidecar check: ${r.routes} route(s), ${r.sidecars} sidecar(s) - ${r.summary}`;
  const tail = r.findings.length && !r.strict && r.exitCode === 0
    ? '\n(annotate mode: warnings only, exit 0. Use --strict to fail on findings.)' : '';
  return [head, ...lines].join('\n') + tail;
}

module.exports = { check, format };
