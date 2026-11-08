# security-sidecar Architecture

How the pieces fit together. For requirements see [SRS.md](SRS.md); for day-to-day use see [PLAYBOOK.md](PLAYBOOK.md).

## 1. Big picture

All logic lives in one dependency-free Node CLI plus one JSON schema. The Claude Code plugin is a thin adapter that decides *when* to call the CLI. Nothing runs as a server, and nothing leaves the machine.

```text
 Claude Code session
 ┌──────────────────────────────────────────────────────────────┐
 │  agent writes/edits a file                                   │
 │        │                                                     │
 │        ▼  PostToolUse (Write|Edit)                           │
 │  hooks/post-tool-use.js ──► route file?  yes ─► analyze ──┐  │
 │                              │                            │  │
 │                              no ─► link scan ─► warning   │  │
 │                                                           ▼  │
 │  skills/route-policy ◄──── additionalContext (JSON) ──────┘  │
 │        │  high confidence: save silently                     │
 │        │  low confidence / admin gate / linkable: ask user   │
 │        ▼                                                     │
 │  cli/bin/security-sidecar.js save ──► .route.json            │
 └──────────────────────────────────────────────────────────────┘
        later, locally / pre-commit / CI:   check   ·   compile (opt-in)
```

## 2. Repository layout

| Path | Role |
| --- | --- |
| `schema/route.schema.json` | Single source of truth for the sidecar format |
| `src/` | Core library and CLI (CommonJS, no dependencies) |
| `bin/security-sidecar.js` | CLI entry point |
| `plugins/security-sidecar/` | The Claude Code plugin (what users install) |
| `plugins/security-sidecar/cli/` | **Generated copy** of `bin/`, `src/`, `schema/` (see 7) |
| `.claude-plugin/marketplace.json` | Lets users run `/plugin marketplace add` |
| `scripts/bundle.js` | Copies the core into the plugin |
| `guidelines/` | Single source of the secure-coding guidelines (language-neutral core and per-language notes) |
| `scripts/guidelines.js` | Generates the skill and the assistant adapters from `guidelines/` |
| `adapters/` | Generated guideline files for other assistants (`AGENTS.md`, Cursor, Gemini) and how to install them |
| `test/core.test.js` | Unit tests, plus hook and bundle-freshness tests |
| `examples/nextjs/` | Sample app with generated sidecars |

## 3. Core modules (`src/`)

| Module | Responsibility |
| --- | --- |
| `routes.js` | Which files are routes (globs), the URL a file serves, HTTP methods in source, sidecar file naming, directory walk, `adminPaths` matching, config loading |
| `analyze.js` | Classification: exposure, cache, indexing, confidence, options, `needsGate`, `existing` sidecar info |
| `guidance.js` | Framework-specific implementation text for each exposure, plus the input-handling checklist (text only) |
| `validate.js` | Minimal JSON Schema validator for the subset the schema uses |
| `secrets.js` | Secret-pattern detection for every string value and key |
| `save.js` | Merge with existing sidecar, validate, secret scan, canonical key order, write |
| `check.js` | Repo-wide findings and exit code |
| `links.js` | Finds references to protected routes in other files |
| `lint.js` | Line-based lint for `eval`, exec / shell and string-built SQL, with a `security-sidecar-ignore` suppression |
| `compile.js` | Collects `mode: enforce` sidecars into the manifest and calls a target |
| `targets/nginx.js` | Renders the Nginx config |
| `cli.js` | Argument parsing and JSON output for the four subcommands |

## 4. Data model

A sidecar describes one route, per HTTP method. Exposure, caching and enforcement are separate fields, so protection is never equated with CDN caching.

- **Per method:** `exposure` (`public`, `authenticated`, `internal`, `unclassified`), `cache`, `indexing`, `rateLimit`.
- **Per route:** `mode` (`annotate` default, `enforce`), `enforcement.via`, `gate`, `linkable`, `reason`, `notes`.
- `additionalProperties: false` everywhere, so unknown fields are rejected.

**Naming.** Where the directory *is* the route (Next.js `app/**/route.ts` and `page.tsx`) the file is `.route.json`. Where one directory holds many route files (`pages/`, `routes/`, `routers/`) each gets `<name>.route.json`. `save` accepts only these names and no path separators.

## 5. Key flows

### 5.1 analyze

1. Derive the URL from the path (route groups `(x)` and slots `@x` dropped; `[id]` kept).
2. Detect methods from `export function GET`, `router.post(`, `@router.get(` and similar. Unknown means `*`.
3. Classify each method (first match wins): internal segments, then admin (literal or `adminPaths`), then auth segments (`api`, `user`, `cart`, `login` ...), then mutating methods, then public content paths. Anything else is **low confidence and suggests the secured side**.
4. The whole file takes the most restrictive method. Confidence is `low` if any method is low.
5. Output includes `quiet` (from config), `policy` (ready to save), `options` (only when low), `guidance`, and for admin routes `needsGate` and `gateOptions`.

### 5.2 save

1. Reject bad file names and non-directories.
2. If a sidecar exists, merge: keep `notes`; keep `enforcement`, `gate`, `linkable` unless supplied; keep user-chosen methods and reason unless the new data is also from the user.
3. Refuse `linkable: true` without `reason.source: user` (unless already set).
4. Validate against the schema, then scan every string for secrets. Any failure exits 2 and writes nothing.
5. Write with canonical key order. Identical content is not rewritten, so diffs stay small.

### 5.3 check

Walk the repo once, then compare the set of *expected* sidecars (from route files) with those on disk. Findings:

| Type | Meaning |
| --- | --- |
| `missing` | Route has no sidecar |
| `orphan` | Sidecar has no matching route source |
| `schema` | Invalid JSON or schema violation |
| `unclassified` | A method is still `unclassified` |
| `static-served` | Sidecar sits under `public/` or `static/` |
| `admin-no-network-restriction` | Admin or internal route without `ip-allowlist` or `mtls` |
| `admin-no-gate` | Admin route without a `gate` |
| `admin-path-exposed` | Another file references an admin, gated or internal route |
| `linkable-not-approved` | `linkable: true` without `reason.source: user` |
| `risky-code` | `eval`, exec / shell, or string-built SQL on a line (suppressed lines are listed separately and do not fail `--strict`) |

Exit code: 0 in annotate mode; 1 if `--strict` is given or the finding belongs to an `enforce` sidecar.

### 5.4 compile (opt-in)

Only `mode: enforce` sidecars are used. Compile stops (exit 1) if any still has `unclassified`. It always writes `routes-manifest.json`, then renders the target config for sidecars whose `enforcement.via` the target accepts (Nginx: `api-gateway`, `ip-allowlist`); the rest are reported as skipped. Output is sorted and has no timestamps, so it is deterministic.

### 5.5 Link guard

`links.js` builds the protected set (admin, gated, or internal, and not `linkable`). A file is excluded if it belongs to that route itself, is a config file (`*.config.*`, `middleware.*`) or a test. Matching is textual: the route's static prefix as a whole path token, or a full URL ending in it. The hook runs it on any non-route file the agent writes; `check` runs it on the whole repo.

### 5.6 Secure-coding rules

Two parts, both advisory. `guidance.js` appends `Input:` lines to the `analyze` result for handlers and dynamic pages, in TypeScript or Python terms. The full rule set lives in one place, `guidelines/` (`core.md` plus `languages/*.md`), and `scripts/guidelines.js` generates from it the `secure-functions` skill (triggers on any function that takes external input), an `AGENTS.md` block, a Cursor rule and a `GEMINI.md` block under `adapters/`. A test fails if a generated file differs from the source. A `SessionStart` hook (`hooks/session-start.js`) prints the generated `hooks/security-reminder.txt` (a compact rule list) as `additionalContext`, unless `guidelines` is `false` in the config; errors are swallowed so a session never fails to start. The only code lint is `lint.js` (`eval`, exec, string-built SQL). It does not check types such as `any`: the tool has no parser, and that would be mostly false positives.

## 6. Security design

- **Intent is not enforcement.** Annotate mode blocks nothing, and the docs and `check` output say so.
- **Conservative defaults.** Unsure means secured or unclassified, never public.
- **No secrets, ever.** `save` rejects secret-like values. The gate records only a type and a minimum length.
- **Untrusted input.** File paths and source text are parsed in-process. No shell command is built from them. The CLI never edits route source (NFR-6).
- **Human decisions are protected.** `save` preserves `notes`, user-chosen values, `gate` and `linkable`. Removing a protection (`linkable`) needs `reason.source: user`.
- **Obscurity is not a control.** Admin routes get warnings until a network restriction and a gate are recorded.
- **Known limit.** The `user` source is a convention, not authentication: an agent could write it. `check` detects hand edits but cannot prove who made a choice.

## 7. Packaging

Plugin installs copy only `plugins/security-sidecar/`, so the CLI is bundled inside it (`cli/`). `npm run bundle` regenerates it from the root sources. A test fails if the copy is stale. Always edit `src/`, never `plugins/.../cli/`.

## 8. Extension points

| To add | Touch |
| --- | --- |
| A route pattern or framework | `routes.js` (`DEFAULT_PATTERNS`, `detectMethods`, `routeFromPath`), `guidance.js` |
| A classification rule | `analyze.js` (`classifyMethod`) |
| A schema field | `schema/route.schema.json`, `save.js` (`KEY_ORDER`, merge), docs |
| A compile target | New file in `src/targets/` exporting `accepts`, `outFile`, `render`; register in `compile.js` |
| Another agent (Codex, agy) | A new adapter that calls the same CLI; no core change (SRS 6.3) |

## 9. Known limitations

- Only file-based routes are detected. Routes registered in code (Express `app.use`, Flask, Django) are not.
- One target (Nginx). Next.js middleware is planned.
- No verification that the recorded enforcement exists.
- Link detection is text matching; paths built at runtime are missed.
- The lint is single-line text matching: it misses SQL split across lines or built in a variable first, and cannot tell a constant from user input.
