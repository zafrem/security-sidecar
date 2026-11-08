'use strict';
// Prints the catalog entry used to list this plugin in a marketplace that references it by git source
// (for example the official directory). It does not submit anything.
// Usage: node scripts/listing.js [tag]      (default tag: v<version from plugin.json>)
const { execFileSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const plugin = require('../plugins/security-sidecar/.claude-plugin/plugin.json');
const market = require('../.claude-plugin/marketplace.json');
const entry = market.plugins.find((p) => p.name === plugin.name);

const tag = process.argv[2] || `v${plugin.version}`;
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

let sha;
try { sha = git('rev-list', '-n', '1', tag); } catch {
  console.error(`Tag ${tag} does not exist yet. Create and push it first (see docs/OFFICIAL-SUBMISSION.md).`);
  process.exit(1);
}
if (git('ls-remote', '--tags', 'origin', tag) === '') {
  console.error(`Tag ${tag} exists locally but is not pushed to origin.`);
  process.exit(1);
}
const url = git('remote', 'get-url', 'origin').replace(/\.git$/, '') + '.git';
console.log(JSON.stringify({
  name: plugin.name,
  description: entry.description,
  author: plugin.author,
  category: entry.category,
  source: { source: 'git-subdir', url, path: 'plugins/security-sidecar', ref: tag, sha },
  homepage: plugin.homepage,
}, null, 2));
