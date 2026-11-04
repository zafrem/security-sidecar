'use strict';
// Classification suggestion (FR-2.x). Conservative: when unsure, suggest the non-public side.
const fs = require('fs');
const path = require('path');
const R = require('./routes');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_SEGMENTS = ['admin', 'auth', 'api', 'user', 'users', 'account', 'cart', 'checkout', 'login', 'logout', 'signup', 'session', 'dashboard', 'settings', 'payment', 'billing'];
const INTERNAL_SEGMENTS = ['internal', 'cron', 'jobs', 'webhook', 'webhooks', 'private'];
const PUBLIC_SEGMENTS = ['products', 'product', 'blog', 'posts', 'post', 'docs', 'about', 'pricing', 'faq', 'contact', 'news', 'articles', 'help', 'health', 'healthz', 'status'];

const segs = (route) => route.split('/').filter(Boolean).map((s) => s.toLowerCase());
const has = (list, s) => s.some((x) => list.includes(x));

function classifyMethod(route, method) {
  const s = segs(route);
  const isApi = s[0] === 'api' || s.includes('api');
  if (has(INTERNAL_SEGMENTS, s)) {
    return { exposure: 'internal', cache: { policy: 'no-store' } , confidence: 'high', rule: 'path-internal' };
  }
  if (has(['admin'], s)) return { exposure: 'authenticated', cache: { policy: 'no-store' }, indexing: 'noindex', confidence: 'high', rule: 'path-admin' };
  if (has(AUTH_SEGMENTS, s)) {
    const p = { exposure: 'authenticated', cache: { policy: 'no-store' }, confidence: 'high', rule: `path-${(AUTH_SEGMENTS.find((a) => s.includes(a)))}` };
    if (!isApi) p.indexing = 'noindex';
    return p;
  }
  if (MUTATING.has(method)) return { exposure: 'authenticated', cache: { policy: 'no-store' }, confidence: 'high', rule: 'method-mutating' };
  if (s.length === 0 || has(PUBLIC_SEGMENTS, s)) {
    return { exposure: 'public', ...(isApi ? {} : { indexing: 'index' }), confidence: 'high', rule: s.length === 0 ? 'path-root' : 'path-public-content' };
  }
  return { exposure: 'authenticated', confidence: 'low', rule: 'unsure-default' };
}

const RANK = { unclassified: 0, public: 1, authenticated: 2, internal: 3 };

function analyzeSource({ relPath, source = '', methods }) {
  const route = R.routeFromPath(relPath);
  const detected = methods && methods.length ? methods : R.detectMethods(source, relPath);
  const ms = detected.length ? detected : ['*'];
  const per = Object.fromEntries(ms.map((m) => [m, classifyMethod(route, m === '*' ? 'GET' : m)]));

  // One suggestion for the whole file: the most restrictive method wins.
  const strongest = Object.values(per).sort((a, b) => RANK[b.exposure] - RANK[a.exposure])[0];
  const confidence = Object.values(per).every((p) => p.confidence === 'high') ? 'high' : 'low';
  const { confidence: _c, rule, ...suggestion } = strongest;

  const policyFor = (exposure) => ({
    route,
    methods: Object.fromEntries(ms.map((m) => [m, exposure === 'unclassified' ? { exposure } : { ...suggestion, exposure }])),
  });
  const reasonRule = rule;
  const options = [];
  if (confidence === 'low') {
    options.push({ label: 'Authenticated (recommended)', policy: policyFor('authenticated') });
    options.push({ label: 'Public', policy: policyFor('public') });
    options.push({ label: 'Leave unclassified', policy: policyFor('unclassified') });
  }
  return {
    route, methods: ms, suggestion, confidence, needsUserInput: confidence === 'low', options,
    policy: { ...policyFor(suggestion.exposure), reason: { source: 'heuristic', rule: reasonRule } },
  };
}

function analyze(file, { root = process.cwd(), methods } = {}) {
  const abs = path.resolve(root, file);
  const relPath = R.toPosix(path.relative(root, abs));
  let source = '';
  try { source = fs.readFileSync(abs, 'utf8'); } catch (e) { throw new Error(`cannot read ${file}: ${e.code || e.message}`); }
  const out = analyzeSource({ relPath, source, methods });
  const sidecar = R.sidecarPathFor(relPath);
  out.sidecar = sidecar;
  out.saveDir = path.posix.dirname(sidecar) === '.' ? '.' : path.posix.dirname(sidecar);
  out.saveFile = path.posix.basename(sidecar);
  try {
    const ex = JSON.parse(fs.readFileSync(path.join(root, sidecar), 'utf8'));
    out.existing = { mode: ex.mode || 'annotate', reasonSource: ex.reason && ex.reason.source, hasNotes: !!ex.notes };
  } catch { /* none yet */ }
  return out;
}

module.exports = { analyze, analyzeSource, classifyMethod };
