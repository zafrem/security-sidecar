---
description: Check that every route has a valid sidecar and summarize findings
argument-hint: "[--strict] [--base <git-ref>]"
allowed-tools: Bash(node:*)
---

Run the security-sidecar check on the current project and summarize the result:

!`node "${CLAUDE_PLUGIN_ROOT}/cli/bin/security-sidecar.js" check . --json $ARGUMENTS`

Group the findings by type (missing, orphan, schema, unclassified, static-served, intent-code-mismatch, policy-downgrade, admin-no-network-restriction, admin-no-gate, admin-path-exposed, linkable-not-approved, risky-code). For each group give the files and the suggested fix. Offer to classify missing or unclassified routes using the route-policy skill. Remind the user that in annotate mode findings are warnings only and exit code 0 does not mean the routes are protected.
