'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./routes');
const { validate } = require('./validate');
const nginx = require('./targets/nginx');

const TARGETS = { nginx };

function compile(root, target) {
  const t = TARGETS[target];
  if (!t) return { ok: false, code: 1, error: `unsupported target "${target}" (v1 supports: ${Object.keys(TARGETS).join(', ')})` };

  const entries = [];
  const problems = [];
  R.walk(root, (rel) => {
    if (!/(^|\/)(?:[A-Za-z0-9_-]+)?\.route\.json$/.test(rel)) return;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const v = validate(doc);
      if (!v.valid) return problems.push({ file: rel, message: v.errors.join('; ') });
      if (doc.mode === 'enforce') entries.push({ file: rel, ...doc });
    } catch (e) { problems.push({ file: rel, message: e.message }); }
  });

  const unclassified = entries.filter((e) => Object.values(e.methods).some((p) => p.exposure === 'unclassified'));
  if (unclassified.length) {
    return { ok: false, code: 1, error: 'enforce sidecars still contain "unclassified"; nothing compiled', files: unclassified.map((e) => e.file) };
  }

  entries.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.file < b.file ? -1 : 1));
  const manifest = {
    version: 1,
    routes: entries.map(({ file, version, mode, ...rest }) => ({ source: file, ...rest })),
  };
  const manifestPath = path.join(root, 'routes-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const used = []; const skipped = [];
  for (const e of entries) {
    const via = (e.enforcement && e.enforcement.via) || [];
    if (via.some((v) => t.accepts.includes(v))) used.push(e);
    else skipped.push({ file: e.file, route: e.route, reason: `enforcement.via does not include ${t.accepts.join(' or ')} for target ${target}` });
  }
  const targetPath = path.join(root, t.outFile);
  fs.writeFileSync(targetPath, t.render(used));

  return {
    ok: true, code: 0, manifest: manifestPath, target: targetPath, compiled: used.length, skipped, invalid: problems,
    warnings: [
      'routes-manifest.json lists admin and internal paths. Keep it out of public build output and deploy artifacts.',
      'The generated config enforces only what the target can express; review it before deploying.',
    ],
  };
}

module.exports = { compile };
