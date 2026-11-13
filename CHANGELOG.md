# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/). The plugin name `security-sidecar` is a fixed identifier and will not change.

## [Unreleased]

- `analyze`: detect in-handler authentication signals (`getServerSession`, `await auth()`, `req.user`, `Depends`, `@login_required`) to boost confidence (`source-auth-signal`), and preserve distinct per-method policies in multi-method route files.
- `check`: detect `intent-code-mismatch` when route source caching (`force-static`, `revalidate > 0`) or `robots` metadata contradicts the sidecar.
- `check`: add `--base <git-ref>` and `policy-downgrade` findings to catch weakened exposure, removed gates, removed rate limits, or removed network restrictions against a git ref.
- `compile`: add `nextjs` (`security-sidecar.nextjs.js`) and `cloudflare` (`security-sidecar._headers` + WAF expressions) targets alongside `nginx`.
- `lint`: add Go (`.go`) and Java (`.java`) support for shell execution and SQL string formatting, plus `xss-raw-html` (`dangerouslySetInnerHTML`, `innerHTML`) for JS/TS.

## [0.1.0]

First version. Not yet tagged or released.

- Core CLI: `analyze`, `save`, `check`, `compile` (Nginx target).
- Claude Code plugin: PostToolUse hook, `route-policy` and `secure-functions` skills, `check` and `compile` commands.
- Admin protection: `adminPaths`, extra gate prompt, link detection with user approval for `linkable`.
- Risky-code lint for `eval`, exec and string-built SQL, with reviewable suppressions.
- `quiet` option for the save confirmation.
- Session-start hook that reminds the agent of the secure-coding rules for all code; opt out with `"guidelines": false`.
- Common secure-coding guidelines (SG-1 to SG-14, TypeScript, Python, Go and Java notes) generated into the `secure-functions` skill and `adapters/` for `AGENTS.md`, Cursor and Gemini.
