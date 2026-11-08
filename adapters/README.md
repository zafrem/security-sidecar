# Guidelines for other code assistants

security-sidecar ships one set of secure-coding guidelines, written once in [`guidelines/`](../guidelines) and generated into the formats different assistants read. The Claude Code plugin uses the same source for its `secure-functions` skill.

| Assistant | File | Where to put it |
| --- | --- | --- |
| Codex, Claude Code and other agents that read `AGENTS.md` | [`agents/AGENTS.md`](agents/AGENTS.md) | Project root as `AGENTS.md`, or append its contents to your existing file |
| Claude Code (without the plugin) | the same `AGENTS.md` | Save it in the project and import it from `CLAUDE.md` with a line `@AGENTS.md`, or paste it into `CLAUDE.md` |
| Cursor | [`cursor/security-sidecar.mdc`](cursor/security-sidecar.mdc) | `.cursor/rules/security-sidecar.mdc` |
| Gemini CLI | [`gemini/GEMINI.md`](gemini/GEMINI.md) | Project root as `GEMINI.md`, or append its contents |

The `AGENTS.md` and `GEMINI.md` files wrap the text in `BEGIN` and `END security-sidecar guidelines` comments, so you can find and replace the block when the guidelines are updated.

## Notes

- **Guidance only.** These files ask the assistant to follow the rules. Nothing checks or enforces that it did. Use code review, a strict type checker and a linter as the enforcement.
- **Not verified here.** The file names and locations follow each tool's documented conventions as I know them. The tools change, so confirm against their current documentation.
- **Context cost.** `AGENTS.md` and `GEMINI.md` are read on every session, and they are about 80 lines. If that is too much, delete the language sections you do not use.
- **Route sidecars are separate.** These files carry only the coding guidelines. The sidecar workflow (classifying routes, the admin gate, `check`) needs the Claude Code plugin or the CLI. If your project also uses the CLI, add a line to your instructions telling the assistant to run `check` before it finishes.

## Maintaining

Edit only `guidelines/core.md` and `guidelines/languages/*.md`, then run `npm run guidelines`. Tests fail if a generated file is out of date. To add a language, add a file under `guidelines/languages/` and regenerate.
