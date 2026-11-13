'use strict';
// Route file detection: which files are routes, what URL they serve, which methods they handle.
const fs = require('fs');
const path = require('path');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'venv', '.venv', '__pycache__', 'coverage', '.turbo']);
const STATIC_DIRS = new Set(['public', 'static']);
const SRC_EXT = /\.(?:[cm]?[jt]sx?|py|go|java)$/;

// Default route patterns (FR-1.1). Globs: ** any depth, * within a segment.
const DEFAULT_PATTERNS = [
  '**/app/**/route.{ts,js,tsx,jsx,mjs}',
  '**/app/**/page.{tsx,jsx,ts,js}',
  '**/pages/**',
  '**/routers/**',
  '**/routes/**',
  '**/urls.py',
];

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escape).join('|') + ')';
      i = end;
    } else re += escape(c);
  }
  return new RegExp('^' + re + '$');
}
function escape(s) { return s.replace(/[.+^$()|[\]\\?]/g, '\\$&'); }

function loadConfig(root) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, '.security-sidecar.config.json'), 'utf8'));
    return { include: c.include || [], exclude: c.exclude || [], adminPaths: c.adminPaths || [], quiet: c.quiet === true, guidelines: c.guidelines !== false };
  } catch { return { include: [], exclude: [], adminPaths: [], quiet: false, guidelines: true }; }
}

// True for the literal /admin segment or any route under a configured admin path.
// adminPaths entries are route prefixes; `*` matches within one segment (e.g. "/ops-*").
function isAdminRoute(route, adminPaths = []) {
  const segs = route.split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (segs.includes('admin')) return true;
  return adminPaths.some((p) => {
    const prefix = '/' + p.split('/').filter(Boolean).join('/');
    const lower = prefix.toLowerCase();
    return globToRegex(lower).test(route.toLowerCase()) || globToRegex(lower + '/**').test(route.toLowerCase());
  });
}

function toPosix(p) { return p.split(path.sep).join('/'); }

function isRouteFile(relPath, config = { include: [], exclude: [] }) {
  const p = toPosix(relPath);
  if (!SRC_EXT.test(p)) return false;
  const base = path.posix.basename(p);
  if (/\.(test|spec)\.[^.]+$/.test(base) || /_test\.go$/.test(base) || /Test\.java$/.test(base) || /^(_app|_document|_error|__init__|conftest)\./.test(base)) return false;
  if (p.split('/').some((s) => SKIP_DIRS.has(s))) return false;
  if (config.exclude.some((g) => globToRegex(g).test(p))) return false;
  return [...DEFAULT_PATTERNS, ...config.include].some((g) => globToRegex(g).test(p));
}

// Sidecar name: "<dir>/.route.json" when the directory is the route (Next app router),
// otherwise "<stem>.route.json" because many route files share one directory.
function sidecarName(relPath) {
  const p = toPosix(relPath);
  const stem = path.posix.basename(p).replace(SRC_EXT, '');
  if (/(^|\/)app\//.test(p) && (stem === 'route' || stem === 'page')) return '.route.json';
  return `${stem}.route.json`;
}

function sidecarPathFor(relPath) {
  return path.posix.join(path.posix.dirname(toPosix(relPath)), sidecarName(relPath));
}

// URL pattern served by a route file, derived from its path.
function routeFromPath(relPath) {
  const p = toPosix(relPath);
  const stem = path.posix.basename(p).replace(SRC_EXT, '');
  let segs = path.posix.dirname(p).split('/').filter((s) => s !== '.');
  const anchor = Math.max(segs.lastIndexOf('app'), segs.lastIndexOf('pages'));
  const frameworkRoot = anchor >= 0 && !/\.(?:py|go|java)$/.test(p);
  if (frameworkRoot) {
    segs = segs.slice(anchor + 1);
    if (stem !== 'route' && stem !== 'page' && stem !== 'index') segs.push(stem);
  } else {
    const a = Math.max(segs.lastIndexOf('routes'), segs.lastIndexOf('routers'));
    segs = a >= 0 ? segs.slice(a + 1) : segs.slice(-0);
    if (!['index', 'urls', 'route'].includes(stem)) segs.push(stem);
  }
  segs = segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')); // route groups, parallel slots
  return '/' + segs.join('/');
}

function detectMethods(source, relPath) {
  const found = new Set();
  for (const m of METHODS) {
    if (new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${m}\\b`).test(source)) found.add(m);
  }
  const call = source.matchAll(/\b(?:app|router|route|api|bp|r|mux|\w+Router)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(/gi);
  for (const x of call) found.add(x[1].toUpperCase());
  const deco = source.matchAll(/@\s*\w+\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(/gi);
  for (const x of deco) found.add(x[1].toUpperCase());
  const spring = source.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping\b/g);
  for (const x of spring) found.add(x[1].toUpperCase());
  const goHttp = source.matchAll(/\bhttp\.Method(Get|Post|Put|Patch|Delete|Head|Options)\b/g);
  for (const x of goHttp) found.add(x[1].toUpperCase());
  if (/(^|\/)page\.[^/]+$/.test(toPosix(relPath))) found.add('GET');
  return [...found].sort((a, b) => METHODS.indexOf(a) - METHODS.indexOf(b));
}

function walk(root, visit, rel = '') {
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, visit, r); }
    else if (e.isFile()) visit(r);
  }
}

function inStaticDir(relPath) {
  return toPosix(relPath).split('/').slice(0, -1).some((s) => STATIC_DIRS.has(s));
}

module.exports = {
  METHODS, isRouteFile, loadConfig, sidecarName, sidecarPathFor, routeFromPath,
  detectMethods, walk, inStaticDir, toPosix, isAdminRoute,
};
