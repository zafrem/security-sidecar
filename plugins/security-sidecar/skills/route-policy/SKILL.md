---
name: route-policy
description: Record the protection intent of a web route in a .route.json sidecar. Use when a security-sidecar hook reports that a route file was written or edited, or when the user asks to classify or document a route's exposure, caching or rate limiting.
---

# Route policy

A hook runs `analyze` whenever you write or edit a route file and passes you its JSON result, plus the path of the bundled CLI. Your job is to turn that result into a saved `.route.json` sidecar. A sidecar only **records intent**. It blocks nothing, so never tell the user a route is "protected" because a sidecar exists.

## Procedure

1. Read the `analyze` result from the hook context. Key fields: `confidence`, `needsUserInput`, `policy`, `options`, `saveDir`, `saveFile`, `existing`.
2. **`existing.mode` is `enforce`:** do not change it. Save only if the user asked, and keep `mode` as it is.
3. **`confidence` is `high` (`needsUserInput: false`):** save silently, without asking. Pass `policy` unchanged:
   ```bash
   node "<cli>" save "<saveDir>" --file "<saveFile>" --policy '<policy JSON>'
   ```
4. **`confidence` is `low` (`needsUserInput: true`):** ask the user with AskUserQuestion, using the entries in `options` (2 or 3). Keep the "Leave unclassified" option. Then save the chosen option's `policy` with `"reason": {"source": "user"}` added.
5. **Exit code 2 from `save`:** it refused (schema error or secret-like value). Fix the policy and retry. Never work around a secret rejection.
6. Mention in one short line what was recorded (route, exposure). Do not paste JSON back at the user.

## Rules

- Prefer the conservative side. When unsure, `authenticated` or `unclassified` beats `public`.
- Never put keys, tokens, passwords or connection strings in any field, including `notes`.
- Never edit route source code for this. Touch only sidecars.
- Do not overwrite a person's edits. `save` already preserves `notes` and user-chosen values, so do not delete or recreate a sidecar by hand.
- Add `cache`, `indexing` or `rateLimit` only when the user states them or `analyze` suggested them.
- Large quoted JSON on the command line: write it to a temp file and pass `--policy @file`.
