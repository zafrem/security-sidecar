# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/). The plugin name `security-sidecar` is a fixed identifier and will not change.

## [Unreleased]

## [0.1.0]

First version. Not yet tagged or released.

- Core CLI: `analyze`, `save`, `check`, `compile` (Nginx target).
- Claude Code plugin: PostToolUse hook, `route-policy` and `secure-functions` skills, `check` and `compile` commands.
- Admin protection: `adminPaths`, extra gate prompt, link detection with user approval for `linkable`.
- Risky-code lint for `eval`, exec and string-built SQL, with reviewable suppressions.
- `quiet` option for the save confirmation.
