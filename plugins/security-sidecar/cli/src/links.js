'use strict';
// Finds links or path references to protected (admin / gated / internal) routes in other files.
const fs = require('fs');
const path = require('path');
const R = require('./routes');

const SCAN_EXT = /\.(?:[cm]?[jt]sx?|py|html?|mdx?|vue|svelte|txt|xml)$/i;
// Config files legitimately mention the path (rewrites, matchers); tests are not shipped.
const SKIP_FILE = /(^|\/)(?:[^/]*\.config\.[^/]+|middleware\.[^/]+|[^/]*\.(?:test|spec)\.[^/]+)$/;

function protectedRoutes(docs, adminPaths) {
  const out = [];
  for (const [sidecar, doc] of docs) {
    if (doc.linkable === true) continue;
    const internal = Object.values(doc.methods).some((p) => p.exposure === 'internal');
    if (!(R.isAdminRoute(doc.route, adminPaths) || doc.gate || internal)) continue;
    const prefix = '/' + doc.route.split('/').filter(Boolean).filter((_, i, a) => a.slice(0, i + 1).every((s) => !s.startsWith('['))).join('/');
    if (prefix === '/') continue;
    const esc = prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    out.push({
      sidecar, route: doc.route, prefix,
      re: new RegExp(`(?<![\\w-])${esc}(?![\\w-])|https?://[^\\s"'\`/]+${esc}(?![\\w-])`, 'i'),
    });
  }
  return out;
}

// A route's own files may reference its own path (admin nav inside /admin).
function ownsFile(sidecar, file) {
  const dir = path.posix.dirname(sidecar);
  const base = path.posix.basename(sidecar);
  const within = dir === '.' ? file : file.startsWith(dir + '/') ? file.slice(dir.length + 1) : null;
  if (within === null) return false;
  if (base === '.route.json') return true;                       // directory is the route
  const stem = base.replace(/\.route\.json$/, '');
  return within.replace(/\.[^.]+$/, '') === stem || within.startsWith(stem + '/');
}

function scanFile(root, rel, prot) {
  if (!SCAN_EXT.test(rel) || SKIP_FILE.test(rel)) return [];
  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return []; }
  const findings = [];
  for (const p of prot) {
    if (ownsFile(p.sidecar, rel)) continue;
    const m = p.re.exec(text);
    if (!m) continue;
    const line = text.slice(0, m.index).split('\n').length;
    findings.push({
      type: 'admin-path-exposed', file: rel, line, route: p.route,
      message: `references protected route ${p.route} (line ${line}); remove the link, or set "linkable": true in ${p.sidecar} if this is intended`,
    });
  }
  return findings;
}

function loadSidecars(root) {
  const { validate } = require('./validate');
  const docs = new Map();
  R.walk(root, (rel) => {
    if (!/(^|\/)(?:[A-Za-z0-9_-]+)?\.route\.json$/.test(rel)) return;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      if (validate(d).valid) docs.set(rel, d);
    } catch { /* ignored here; check reports it */ }
  });
  return docs;
}

module.exports = { protectedRoutes, scanFile, loadSidecars, ownsFile };
