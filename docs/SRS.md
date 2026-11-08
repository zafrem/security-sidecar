# security-sidecar Software Requirements Specification (SRS)

Nov 4, 2026 · @Mark

## 1. Overview

security-sidecar records the protection intent of each web route in a `.route.json` sidecar file next to the code, whenever an AI coding agent creates or changes a route. By default it only records; it enforces nothing.

### 1.1 Purpose

- Keep each route's intended exposure, caching and rate limiting in the codebase.
- Make sure that record is not skipped when an agent adds or edits a route.
- Let teams that want it compile the records into Nginx configuration (opt-in; Next.js middleware later).

### 1.2 Scope

| Item | Content |
| --- | --- |
| In scope | Route detection, classification suggestions, asking the user when unsure, saving `.route.json` with schema validation, missing and orphan checks (`check`), manifest compilation |
| In scope (v1 targets) | Claude Code plugin; Next.js (file-based routing) plus one of FastAPI or Express |
| Out of scope (v1) | A runtime enforcement engine, generating real authentication code, Cloudflare WAF output, Codex and agy adapters |

### 1.3 Terms

| Term | Definition |
| --- | --- |
| Sidecar | The `.route.json` or `<name>.route.json` metadata file placed in the same directory as the route source |
| Intent | The declaration in the sidecar of what a route should be. It blocks nothing by itself |
| Enforcement | The means that actually uphold the intent: app middleware, API gateway, WAF, IP allowlist, mTLS and so on |
| Mode | `annotate` (record only) or `enforce` (included in compilation) |
| Manifest | `routes-manifest.json`, the collection of all sidecars |
| Adapter | A thin layer that calls the core CLI from a specific agent such as Claude Code |

### 1.4 Design principles

1. **Intent is separate from enforcement.** Protection is not limited to CDN caching. The sidecar states intent only; the team picks how to enforce it.
2. **Annotate-only is the default.** Compilation and enforcement are for those who turn them on. In this mode `check` only warns and never fails CI.
3. **Exposure and caching are separate axes.** Caching is optional, and both protected and public routes may or may not use it.
4. **When unsure, suggest the conservative option.** If classification is not certain, suggest the non-public side and ask the user. Wrongly suggesting public costs more than the reverse.
5. **No external dependencies.** It runs on the local file system and a standard JSON parser only.
6. **The core is agent-neutral.** Logic lives in the CLI and the schema; differences between agents are absorbed by adapters.

## 2. System Architecture

All logic lives in one core CLI and one schema. The Claude Code plugin is an adapter that decides when to call that CLI. v1 ships no MCP server.

### 2.1 Components

| Component | Role | Location |
| --- | --- | --- |
| Core CLI | Runs `analyze`, `save`, `compile` and `check`. Every output is JSON | `src/` |
| Schema | Single source of truth for `.route.json` | `schema/route.schema.json` |
| Claude Code adapter | Hook (detection), skill (questioning rules), slash commands (entry points) | `plugins/security-sidecar/` |
| Marketplace manifest | File that lets users register with `/plugin marketplace add` | `.claude-plugin/marketplace.json` |
| Target converters | Turn the manifest into Nginx config (opt-in; Next.js middleware later) | `src/targets/` |
| Future adapters | Guidance and call instructions for Codex and agy | `adapters/` |

### 2.2 Repository layout

```text
security-sidecar/
├─ .claude-plugin/marketplace.json
├─ plugins/security-sidecar/
│  ├─ .claude-plugin/plugin.json
│  ├─ hooks/hooks.json
│  ├─ skills/
│  └─ commands/
├─ src/                      # core CLI
├─ schema/route.schema.json
├─ adapters/{codex,antigravity}/
├─ examples/{nextjs,fastapi}/
└─ docs/
```

### 2.3 Data flow

1. The agent writes or edits a route file.
2. The PostToolUse hook checks whether the file path matches a route pattern and, if so, runs `analyze`.
3. `analyze` returns a classification suggestion and a `needsUserInput` flag as JSON. The hook passes this result to Claude as context.
4. When the suggestion is certain, the skill calls `save` silently. When it is not, the skill asks the user to choose among 2 or 3 options.
5. Only when needed, the user runs `compile` to build the manifest and target configuration.
6. `check` can run locally, in a git pre-commit hook or in CI.

&#91;embedded content: write path · 4 steps, 1 decision\]

Only routes the heuristics cannot classify with confidence reach the user; every other route is saved silently.

## 3. Data Model

`.route.json` is a JSON file that states a route's intent per HTTP method. Exposure, caching and enforcement are separate fields, so protection is never equated with CDN caching.

### 3.1 Example

```json
{
  "version": 1,
  "mode": "annotate",
  "route": "/api/v1/payment",
  "methods": {
    "GET": { "exposure": "authenticated", "cache": { "policy": "no-store" } },
    "POST": {
      "exposure": "authenticated",
      "cache": { "policy": "no-store" },
      "rateLimit": { "windowMs": 60000, "max": 10 }
    }
  },
  "enforcement": { "via": ["app-middleware"] },
  "reason": { "source": "heuristic", "rule": "path-api-payment" },
  "notes": "Payment approval calls require authentication"
}
```

### 3.2 Field definitions

| Field | Required | Values | Description |
| --- | --- | --- | --- |
| `version` | Yes | `1` | Schema version |
| `mode` | No | `annotate` (default), `enforce` | Only `enforce` files are included in `compile` |
| `route` | Yes | Path pattern | For example `/api/v1/payment` or `/products/[id]` |
| `methods` | Yes | Object keyed by HTTP method or `*` | Per-method policy. A file with both GET and POST records each separately |
| `exposure` | Yes | `public`, `authenticated`, `internal`, `unclassified` | Who should be able to reach the route. `check` warns on `unclassified` |
| `cache` | No | `policy`: `no-store`, `private`, `public`, `unspecified`; optional `maxAgeSec` | Caching intent. Omitting it claims nothing |
| `indexing` | No | `index`, `noindex` | Search engine indexing intent (SEO), independent of protection |
| `rateLimit` | No | `windowMs`, `max` | Rate limiting intent |
| `enforcement.via` | No | `app-middleware`, `api-gateway`, `waf`, `ip-allowlist`, `mtls`, `other`, `none` | How this intent is upheld. For the record only; it is not verified |
| `gate` | No | `type`: `passphrase`, `sso`, `mfa`, `basic-auth`, `other`; `minLength` (integer, 8 or more) | The extra access step required for the route, such as an admin page. Only the type and minimum length are recorded; the secret is never stored |
| `linkable` | No | `true` | Explicitly allows links to this route from elsewhere. Absent means admin, gated and internal routes must not be linked |
| `reason` | No | `source`: `heuristic`, `user`, `agent`; `rule` | Basis of the classification, so a reviewer knows which decisions to trust |
| `notes` | No | String | Free-form note left by a person |

### 3.3 Storage rules

- The sidecar lives in the same directory as the route source. Where the directory itself is the route (Next.js app router: `route.ts`, `page.tsx`), the file is `.route.json`, one per directory. Where one directory holds many route files (`pages/`, `routes/`, `routers/`), each route gets `<name>.route.json` named after its source file (`users.ts` gives `users.route.json`).
- `save` accepts only these file names and refuses any path separator.
- The schema sets `additionalProperties: false`, so unknown fields are rejected.
- `save` refuses any field whose value looks like a secret key, token or database connection string.
- `check` warns when a sidecar sits inside a statically served directory such as `public/` or `static/`.
- `compile` stops if a file with `mode: enforce` still contains `unclassified`.

## 4. Functional Requirements

The must-have features of v1 (P0) are detection, classification suggestions, questioning, saving and `check`. `compile` is opt-in, so it ranks one level lower. Priorities: P0 required, P1 v1 goal, P2 later.

### 4.1 Detection

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1.1 | The hook runs `analyze` only when the path of a written or edited file matches a route pattern (`app/**/route.ts`, `pages/**`, `routers/**`, `routes/**`, `urls.py` and so on). | P0 |
| FR-1.2 | Patterns can be added or excluded in `.security-sidecar.config.json`. | P1 |
| FR-1.3 | `check` reports the sidecar of a deleted or renamed route as an orphan. | P1 |

### 4.2 Classification suggestions

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-2.1 | Suggest `exposure` from path, method and directory signals. `/admin/`, `/auth/`, `/api/`, `/user/`, `/cart/` and POST, PUT, PATCH, DELETE suggest `authenticated`; GET-only content paths suggest `public`. | P0 |
| FR-2.2 | Return a confidence value (`high` or `low`) with every suggestion. | P0 |
| FR-2.3 | When unsure, suggest the non-public side. | P0 |
| FR-2.4 | Suggest `cache` and `indexing` only when there is a signal; otherwise leave them empty. | P0 |
| FR-2.5 | Adjust confidence using authentication signals in the source (session checks, middleware decorators). | P2 |
| FR-2.7 | Every `analyze` result includes `guidance`: framework-specific implementation steps for the suggested exposure (public: caching, metadata, sitemap for SEO; secured: auth check, `no-store`, `noindex`, rate limiting; internal: network restriction). Text only; the tool never edits route source. | P0 |
| FR-2.8 | `analyze` guidance includes an input-handling checklist (strict schema validation, no free types, value and size constraints, ownership check, no input-built queries, commands or paths) for route handlers and dynamic pages, in the language of the detected framework (TypeScript or Python). A `secure-functions` skill carries the full rules for any function that receives external input. Guidance only; not enforced. | P1 |
| FR-2.9 | `quiet: true` in `.security-sidecar.config.json` (default off) silences only the confirmation line after a successful save. `analyze` reports `quiet`, and the hook repeats the instruction in its context. Refusals, questions, `check` findings, link warnings and code security problems are never silenced. | P1 |
| FR-2.6 | `adminPaths` in `.security-sidecar.config.json` lists route prefixes (`*` matches within one segment) that are treated like `/admin`: suggested as `authenticated`, `no-store`, `noindex` with `high` confidence, so renamed admin paths do not prompt. | P1 |

### 4.3 User questions

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-3.1 | With `high` confidence, do not ask; call `save` directly. | P0 |
| FR-3.2 | With `low` confidence, ask with 2 or 3 options. Always include "leave unclassified (`unclassified`)" among them. | P0 |
| FR-3.4 | For an admin route (literal `/admin` or an `adminPaths` match) without a `gate`, `analyze` returns `needsGate` and `gateOptions`, and the skill asks the user to choose passphrase (8+ characters), SSO/MFA or none. The passphrase is never requested, printed or stored. | P0 |
| FR-3.3 | Record values the user chose as `reason.source: user`. | P0 |

### 4.4 Saving

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-4.1 | `save` validates against the schema before writing and never overwrites fields a person edited (`notes`, user-chosen values). | P0 |
| FR-4.2 | `save` refuses to write when a secret-like value is present. | P0 |
| FR-4.3 | The default `mode` of a new sidecar is `annotate`. | P0 |

### 4.5 Validation (`check`)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-5.1 | Report routes with no sidecar, orphan sidecars, schema violations, `unclassified` values, and sidecars inside statically served directories. | P0 |
| FR-5.2 | In `annotate` mode only warn and exit with code 0. In `enforce` mode or with `--strict`, exit with code 1 on a violation. | P0 |
| FR-5.1a | Warn (`admin-no-network-restriction`) when a sidecar's route is an admin route (literal `/admin` or an `adminPaths` match) or has `internal` exposure, and `enforcement.via` lacks `ip-allowlist` or `mtls`. A hidden path or a login alone is not a network restriction. | P1 |
| FR-5.1b | Warn (`admin-no-gate`) when an admin route has no `gate`. | P1 |
| FR-5.1c | Warn (`admin-path-exposed`) when any scanned file (source, HTML, Markdown, `robots.txt`, sitemap) outside the route's own files references an admin, gated or internal route, unless the sidecar sets `linkable: true`. Config files (`*.config.*`, `middleware.*`) and tests are skipped. | P1 |
| FR-5.1f | `check` reports `risky-code` findings (file, line, rule) for `eval` / dynamic code, `exec` / shell execution, and SQL built by interpolation or concatenation, in JavaScript, TypeScript and Python files (tests excluded). It is line-based text matching. A `security-sidecar-ignore` comment on the line or the line above suppresses a finding; suppressed lines are listed in the `check` output (`suppressed`) and never fail `--strict`. The hook runs the same lint on every edited file and reports hits to the agent. | P1 |
| FR-5.1d | The PostToolUse hook runs the same reference scan on any edited non-route file and reports hits to the agent, which must remove the link unless the user explicitly asks to keep it. | P1 |
| FR-5.1e | `save` refuses `linkable: true` unless the policy carries `reason.source: user` (or the sidecar was already linkable), and `check` warns (`linkable-not-approved`) when `linkable: true` is present without `reason.source: user`. The skill must ask the user before setting it, even when the user's own request mentioned the link. | P0 |
| FR-5.3 | Print both a human-readable summary and machine-readable JSON (`--json`). | P1 |

### 4.6 Compilation (`compile`, opt-in)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-6.1 | Collect only `mode: enforce` sidecars into `routes-manifest.json`. | P1 |
| FR-6.2 | The v1 target is Nginx (decided, see 6.4). Next.js middleware is P2; `--target nextjs` is rejected. | P1 |
| FR-6.3 | Warn that the manifest is a list of admin paths, and print guidance to exclude it from deploy artifacts. | P1 |
| FR-6.4 | Skip and report entries whose `enforcement.via` does not include the target. The Nginx target accepts `api-gateway` and `ip-allowlist`. | P1 |
| FR-6.5 | Add a Cloudflare converter. | P2 |

## 5. CLI and Plugin Interface

The CLI has four subcommands that each print JSON. The plugin connects them to Claude Code through one hook, one skill and two slash commands.

### 5.1 CLI commands

| Command | Input | Output | Exit code |
| --- | --- | --- | --- |
| `security-sidecar analyze <file>` | Route file path; optional `--methods GET,POST` | Route, methods, suggestion, confidence, `needsUserInput`, options | 0 |
| `security-sidecar save <dir> --policy <json>` | Target directory and a policy object | Path written and validation result | 0 on success; 2 on schema or secret rejection |
| `security-sidecar check [root] [--strict] [--json]` | Project root | List of findings | 0 in `annotate`; 1 on violation in `enforce` or `--strict` |
| `security-sidecar compile [root] --target <nginx\|nextjs>` | Project root and target | Manifest path, target file path, skipped entries | 0 on success; 1 if `unclassified` remains in `enforce` files |

### 5.2 `analyze` output

```json
{
  "route": "/api/v1/payment",
  "methods": ["POST"],
  "suggestion": { "exposure": "authenticated", "cache": { "policy": "no-store" } },
  "confidence": "high",
  "needsUserInput": false,
  "options": []
}
```

When `confidence` is `low`, `needsUserInput` is `true` and `options` holds 2 or 3 candidate policies, always including an `unclassified` choice.

### 5.3 Claude Code plugin parts

| Part | File | Behavior |
| --- | --- | --- |
| Hook | `hooks/hooks.json` | PostToolUse on Write and Edit. If the path matches a route pattern, run `analyze` and return the JSON to Claude as context |
| Skill | `skills/route-policy/SKILL.md` | With `high` confidence call `save` silently; with `low` ask the user with 2 or 3 options via AskUserQuestion; never write secret values; respect `mode` |
| Slash command | `commands/check.md` | `/security-sidecar:check` runs `check` and summarizes findings |
| Slash command | `commands/compile.md` | `/security-sidecar:compile` runs `compile` for a chosen target |
| Plugin manifest | `.claude-plugin/plugin.json` | Name, version, description, component paths |
| Marketplace manifest | `.claude-plugin/marketplace.json` | Lets users run `/plugin marketplace add <owner>/security-sidecar` |

The CLI is bundled inside the plugin directory and called by the hook and commands through the plugin root path, so users install nothing separately.

## 6. Non-functional Requirements, Security and Roadmap

The tool must stay out of the developer's way, never write secrets, and never claim to protect anything it does not enforce.

### 6.1 Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Clear cases (for example creating `/api/login`) are saved without asking. Only ambiguous cases interrupt the developer. |
| NFR-2 | No external services or paid monitoring. The tool runs on the local file system and a standard JSON parser only. |
| NFR-3 | Secret-like values (keys, tokens, connection strings) are rejected before any write. |
| NFR-4 | `analyze` on a single file finishes fast enough that the hook does not noticeably delay the agent (target: under 1 second). |
| NFR-5 | Output is deterministic. The same input gives the same sidecar, with stable key order, so diffs stay small. |
| NFR-6 | The tool never modifies route source code, only sidecars and generated manifests. |
| NFR-7 | It runs on macOS, Linux and Windows. |

### 6.2 Security considerations

- **Annotation is not protection.** Documentation must say plainly that `annotate` mode records intent and blocks nothing, so teams do not assume a route is protected.
- **Sidecars must not be served.** `check` warns on sidecars inside statically served directories, and the README gives per-framework guidance.
- **The manifest is sensitive.** It lists admin and internal paths, so it must stay out of public build output.
- **Inputs are untrusted.** The hook passes file paths and source text to the CLI. The CLI must never build shell commands from them.

### 6.3 Other agents (Codex, agy)

Other agents get a new adapter and nothing else: the CLI and schema are reused unchanged. Where an agent has no hook equivalent to PostToolUse, the adapter relies on an instruction file that tells the agent to call `analyze` and `save`, and on `check` in git pre-commit or CI as the safety net. Hook support in each agent still has to be verified.

### 6.4 Decisions and open issues

Decided for the first implementation:

1. **v1 target: Nginx.** Next.js middleware moves to P2.
2. **CLI language: Node (18+), no dependencies.** The `route.schema.json` rules are checked by a small built-in validator.
3. **Second framework: Express and FastAPI are both detected by file path (`routes/`, `routers/`) and method patterns** (`router.get(`, `@router.get(`). Only the Next.js example is tested; neither has an example yet.
4. **Multi-route directories use `<name>.route.json`** (see 3.3). In Next.js, `page.tsx` is treated as a route and shares the directory's `.route.json` with `route.ts`.
5. **When a directory's methods differ, Nginx output applies the strictest policy** to the path, because Nginx locations are per path.

Still open:

1. How `analyze` finds routes registered in code (Express, FastAPI, Flask, Django) rather than by file path or method pattern.
2. Whether Codex and agy offer hooks equivalent to PostToolUse.
3. Whether the README subtitle may mention Claude, given Anthropic's trademark guidance.
4. Whether `.route.json` should instead be one file per directory with a `routes` array, to match the original wording of 3.3.

### 6.5 Milestones

1. **M1.** Schema, `analyze` and `save` working against a Next.js example.
2. **M2.** `check` with the annotate and strict behaviors.
3. **M3.** Claude Code plugin wrapper (hook, skill, commands), tested locally with `/plugin marketplace add ./security-sidecar`.
4. **M4.** `compile` for one target.
5. **M5.** Public release and marketplace registration.
6. **M6.** Codex and agy adapters.
