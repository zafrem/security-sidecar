'use strict';
// Copies the core CLI into the plugin directory so installs need nothing else (SRS 5.3).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dest = path.join(root, 'plugins', 'security-sidecar', 'cli');
fs.rmSync(dest, { recursive: true, force: true });
for (const d of ['bin', 'src', 'schema']) fs.cpSync(path.join(root, d), path.join(dest, d), { recursive: true });
console.log('bundled core CLI ->', path.relative(root, dest));
