#!/usr/bin/env node
'use strict';
// SessionStart hook: gives the agent a compact list of the security rules so they apply to all code,
// not only to route files. Opt out with { "guidelines": false } in .security-sidecar.config.json.
const fs = require('fs');
const path = require('path');
const R = require('../cli/src/routes');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    let root = process.cwd();
    try { root = JSON.parse(input).cwd || root; } catch { /* use cwd */ }
    if (R.loadConfig(root).guidelines === false) return;
    const text = fs.readFileSync(path.join(__dirname, 'security-reminder.txt'), 'utf8');
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  } catch {
    // Never disturb the session because of a hook failure.
  }
});
