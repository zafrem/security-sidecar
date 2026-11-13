'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('./routes');
const { protectedRoutes, scanFile } = require('./links');
const { lintFile } = require('./lint');
const { validate } = require('./validate');

const NETWORK_RESTRICTIONS = ['ip-allowlist', 'mtls'];
const EXPOSURE_RANK = { unclassified: 0, public: 1, authenticated: 2, internal: 3 };

function checkIntentCodeDrift(root, sidecarRel, doc, routeFiles = []) {
  const out = [];
  const methods = Object.values(doc.methods || {});
  const wantsNoStore = methods.some((m) => m.cache && m.cache.policy === 'no-store');
  const wantsNoIndex = methods.some((m) => m.indexing === 'noindex');
  const wantsIndex = methods.length > 0 && methods.every((m) => m.indexing === 'index');

  for (const rf of routeFiles) {
    let src = '';
    try { src = fs.readFileSync(path.join(root, rf), 'utf8'); } catch { continue; }
    if (wantsNoStore) {
      if (/\bexport\s+const\s+dynamic\s*=\s*['"]force-static['"]/.test(src)
          || /\bexport\s+const\s+revalidate\s*=\s*[1-9]\d*/.test(src)) {
        out.push({
          type: 'intent-code-mismatch',
          file: sidecarRel,
          message: `${rf} enables static caching (force-static / revalidate > 0) while sidecar requires cache.policy "no-store"`,
        });
      }
    }
    if (wantsNoIndex && /\brobots\s*:\s*(?:\{[^}]*\bindex\s*:\s*true\b|['"]index['"])/.test(src)) {
      out.push({
        type: 'intent-code-mismatch',
        file: sidecarRel,
        message: `${rf} sets robots index:true while sidecar requires indexing "noindex"`,
      });
    }
    if (wantsIndex && /\brobots\s*:\s*(?:\{[^}]*\bindex\s*:\s*false\b|['"]noindex['"])/.test(src)) {
      out.push({
        type: 'intent-code-mismatch',
        file: sidecarRel,
        message: `${rf} sets robots noindex while sidecar requires indexing "index"`,
      });
    }
  }
  return out;
}

function diffSidecar(oldDoc, newDoc, rel) {
  const out = [];
  if (!oldDoc || !newDoc || !oldDoc.methods || !newDoc.methods) return out;
  if (oldDoc.mode === 'enforce' && (newDoc.mode || 'annotate') !== 'enforce') {
    out.push({ type: 'policy-downgrade', file: rel, message: 'mode downgraded from "enforce" to "annotate"' });
  }
  if (oldDoc.gate && !newDoc.gate) {
    out.push({ type: 'policy-downgrade', file: rel, message: `gate (${oldDoc.gate.type}) was removed` });
  }
  const oldVia = (oldDoc.enforcement && oldDoc.enforcement.via) || [];
  const newVia = (newDoc.enforcement && newDoc.enforcement.via) || [];
  for (const nr of NETWORK_RESTRICTIONS) {
    if (oldVia.includes(nr) && !newVia.includes(nr)) {
      out.push({ type: 'policy-downgrade', file: rel, message: `network restriction "${nr}" was removed from enforcement.via` });
    }
  }
  for (const [m, oldP] of Object.entries(oldDoc.methods)) {
    const newP = newDoc.methods[m] || newDoc.methods['*'];
    if (!newP) continue;
    if (EXPOSURE_RANK[newP.exposure] < EXPOSURE_RANK[oldP.exposure]) {
      out.push({ type: 'policy-downgrade', file: rel, message: `${m} exposure downgraded from "${oldP.exposure}" to "${newP.exposure}"` });
    }
    if (oldP.rateLimit && !newP.rateLimit) {
      out.push({ type: 'policy-downgrade', file: rel, message: `${m} rateLimit was removed` });
    }
  }
  return out;
}

function check(root = process.cwd(), { strict = false, base } = {}) {
  const config = R.loadConfig(root);
  const findings = [];
  const allFiles = [];
  const expected = new Set();   // sidecars that should exist
  const routeFilesBySidecar = new Map();
  const existing = [];          // sidecars on disk

  R.walk(root, (rel) => {
    allFiles.push(rel);
    if (R.isRouteFile(rel, config)) {
      const sc = R.sidecarPathFor(rel);
      expected.add(sc);
      if (!routeFilesBySidecar.has(sc)) routeFilesBySidecar.set(sc, []);
      routeFilesBySidecar.get(sc).push(rel);
    }
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
    const via = (doc.enforcement && doc.enforcement.via) || [];
    if ((R.isAdminRoute(doc.route, config.adminPaths) || Object.values(doc.methods).some((p) => p.exposure === 'internal'))
        && !via.some((v) => NETWORK_RESTRICTIONS.includes(v))) {
      findings.push({ type: 'admin-no-network-restriction', file: rel, message: `${doc.route} is admin/internal but enforcement.via lacks ${NETWORK_RESTRICTIONS.join(' or ')}; a hidden path or login alone is not a network restriction` });
    }
    if (doc.linkable === true && !(doc.reason && doc.reason.source === 'user')) {
      findings.push({ type: 'linkable-not-approved', file: rel, message: '"linkable": true is set but reason.source is not "user"; confirm with the user that this route may be linked' });
    }
    if (R.isAdminRoute(doc.route, config.adminPaths) && !doc.gate) {
      findings.push({ type: 'admin-no-gate', file: rel, message: `${doc.route} is an admin route with no extra gate recorded (passphrase of 8+ characters, SSO or MFA); a login alone is one factor` });
    }
    if (!expected.has(rel)) findings.push({ type: 'orphan', file: rel, message: 'no matching route source (deleted or renamed?)' });
    else findings.push(...checkIntentCodeDrift(root, rel, doc, routeFilesBySidecar.get(rel)));
    if (base && /^[A-Za-z0-9_./~^-]+$/.test(base)) {
      const g = spawnSync('git', ['show', `${base}:${rel}`], { cwd: root, encoding: 'utf8' });
      if (g.status === 0 && g.stdout) {
        try { findings.push(...diffSidecar(JSON.parse(g.stdout), doc, rel)); } catch { /* ignore invalid base json */ }
      }
    }
  }
  for (const rel of [...expected].sort()) {
    if (!existing.includes(rel)) findings.push({ type: 'missing', file: rel, message: 'route has no sidecar' });
  }

  const prot = protectedRoutes(docs, config.adminPaths);
  if (prot.length) for (const rel of allFiles) findings.push(...scanFile(root, rel, prot));

  const suppressed = [];
  for (const rel of allFiles) {
    for (const h of lintFile(root, rel, { includeSuppressed: true })) (h.suppressed ? suppressed : findings).push(h);
  }
  if (base && /^[A-Za-z0-9_./~^-]+$/.test(base) && suppressed.length) {
    const byFile = new Map();
    for (const s of suppressed) {
      if (!byFile.has(s.file)) byFile.set(s.file, []);
      byFile.get(s.file).push(s);
    }
    const { lintSource } = require('./lint');
    for (const [rel, curList] of byFile.entries()) {
      const g = spawnSync('git', ['show', `${base}:${rel}`], { cwd: root, encoding: 'utf8' });
      const oldSup = g.status === 0 && g.stdout
        ? lintSource(rel, g.stdout, { includeSuppressed: true }).filter((x) => x.suppressed)
        : [];
      if (curList.length > oldSup.length) {
        findings.push({
          type: 'new-suppression',
          file: rel,
          message: `${curList.length - oldSup.length} new security-sidecar-ignore suppression(s) added since ${base}; review each one`,
        });
      }
    }
  }

  const enforcing = (f) => docs.get(f.file)?.mode === 'enforce';
  const failing = findings.filter((f) => strict || enforcing(f));
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.type < b.type ? -1 : 1));
  return {
    ok: failing.length === 0, exitCode: failing.length ? 1 : 0, strict,
    routes: expected.size, sidecars: existing.length, findings,
    suppressed: suppressed.map(({ file, line, rule }) => ({ file, line, rule })),
    summary: findings.length ? `${findings.length} finding(s)` : 'all routes have valid sidecars',
  };
}

function format(r) {
  const lines = r.findings.map((f) => `  [${f.type}] ${f.file}: ${f.message}`);
  const head = `security-sidecar check: ${r.routes} route(s), ${r.sidecars} sidecar(s) - ${r.summary}`;
  const sup = r.suppressed.length
    ? `\n${r.suppressed.length} risky-code line(s) suppressed with security-sidecar-ignore; review them: ${r.suppressed.map((s) => `${s.file}:${s.line} [${s.rule}]`).join(', ')}` : '';
  const tail = sup + (r.findings.length && !r.strict && r.exitCode === 0
    ? '\n(annotate mode: warnings only, exit 0. Use --strict to fail on findings.)' : '');
  return [head, ...lines].join('\n') + tail;
}

module.exports = { check, format, diffSidecar };
