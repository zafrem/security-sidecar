#!/usr/bin/env node
'use strict';
// PostToolUse hook: if the written/edited file is a route, run `analyze` and hand the result to Claude.
// File paths and source text are only parsed in-process; no shell command is ever built from them.
const path = require('path');
const R = require('../cli/src/routes');
const { analyze } = require('../cli/src/analyze');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(input);
    const file = evt.tool_input && evt.tool_input.file_path;
    if (!file) return;
    const root = evt.cwd || process.cwd();
    const rel = R.toPosix(path.relative(root, path.resolve(root, file)));
    if (rel.startsWith('..') || !R.isRouteFile(rel, R.loadConfig(root))) return;

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
