#!/usr/bin/env node
'use strict';
// PostToolUse hook: if the written/edited file is a route, run `analyze` and hand the result to Claude.
// File paths and source text are only parsed in-process; no shell command is ever built from them.
const path = require('path');
const R = require('../cli/src/routes');
const { analyze } = require('../cli/src/analyze');
const L = require('../cli/src/links');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);
    const file = evt.tool_input && evt.tool_input.file_path;
    if (!file) return;
    const root = evt.cwd || process.cwd();
    const rel = R.toPosix(path.relative(root, path.resolve(root, file)));
    if (rel.startsWith('..')) return;
    const config = R.loadConfig(root);
    if (!R.isRouteFile(rel, config)) {
      // Not a route: make sure it does not link to an admin / gated / internal route.
      const hits = L.scanFile(root, rel, L.protectedRoutes(L.loadSidecars(root), config.adminPaths));
      if (hits.length) {
        const msg = ['security-sidecar: this file references protected route(s). Remove the link unless the user explicitly wants it; if they do, set "linkable": true in that route\'s sidecar.',
          ...hits.map((h) => `- ${h.file}:${h.line} -> ${h.route}`)].join('\n');
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
      }
      return;
    }

    const result = analyze(rel, { root });
    const cli = path.join(__dirname, '..', 'cli', 'bin', 'security-sidecar.js');
    const context = [
      `security-sidecar: "${rel}" is a route file. Follow the route-policy skill.`,
      `CLI: node "${cli}" (run from the project root ${root})`,
      'analyze result:',
      JSON.stringify(result, null, 2),
    ].join('\n');
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } }));
  } catch {
    // Never block or disturb the agent because of a hook failure.
  }
});
