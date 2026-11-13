---
description: Compile enforce-mode sidecars into routes-manifest.json and a target config (opt-in)
argument-hint: "[nginx|nextjs|cloudflare]"
allowed-tools: Bash(node:*)
---

Compile the sidecars with `mode: enforce`. The target is `$ARGUMENTS`; if empty, ask the user (supports `nginx`, `nextjs`, `cloudflare`).

Run: `node "${CLAUDE_PLUGIN_ROOT}/cli/bin/security-sidecar.js" compile . --target <target>`

Report the manifest path, the target file path, and every skipped entry with its reason. Always repeat the warnings: `routes-manifest.json` lists admin and internal paths and must stay out of deploy artifacts, and the generated config should be reviewed before use. If compile fails on `unclassified` entries, list those files and offer to classify them.
