# security-sidecar

Records the protection intent of each web route in a `.route.json` sidecar file next to the code, whenever an AI coding agent creates or changes a route.

> **Annotation is not protection.** By default (`mode: annotate`) this tool only records intent. It blocks nothing, and `check` only warns. A route with a sidecar is not thereby protected.

## Features

1. Detects route files when an agent writes or edits them.
2. Suggests exposure, caching and indexing for each route.
3. Asks you only when the suggestion is uncertain.
4. Saves a `.route.json` sidecar, validated against a schema.
5. Refuses to save secrets (keys, tokens, connection strings).
6. `check` reports missing, orphan, invalid and unclassified sidecars.
7. `adminPaths` setting for renamed admin pages.
8. Warns when an admin or internal route has no network restriction.
9. Optional `compile` to `routes-manifest.json` and an nginx config.
10. Claude Code plugin with a hook, a skill and two slash commands.

## Security features

1) Public or secured decision: every new route is classified as public (indexable, for SEO) or secured, and when unsure it suggests the secured side and asks you.
2) Implementation guidance: each classification comes with concrete steps for your framework (auth check, `no-store`, `noindex`, rate limiting for secured routes; caching, metadata and sitemap for public ones).
3) Extra gate for admin pages: `/admin` and any path in `adminPaths` prompts for a second step (a passphrase of 8+ characters, SSO or MFA). Only the type and minimum length are recorded, never the secret.
4) No links to admin pages: `check` and the editing hook flag any link, sitemap entry or `robots.txt` line that points to an admin, gated or internal route, until you approve it. Setting `"linkable": true` needs your explicit confirmation; `save` refuses it otherwise and `check` flags a hand-edited one.
5) Renamed admin paths: list them in `adminPaths` and they are treated like `/admin`.
6) Network restriction warning: admin and internal routes warn if no `ip-allowlist` or `mtls` is recorded.
7) Secret rejection: keys, tokens, passwords and connection strings are refused before anything is written.
8) Safe sidecars: schema validation, no unknown fields, warning for sidecars in `public/` or `static/`, and a warning that `routes-manifest.json` lists admin paths.
9) Your edits are kept: `save` never overwrites your notes, your chosen values or your `gate` and `linkable` settings.
10) Secure function rules: the `secure-functions` skill and the route guidance tell the agent to validate every input with a strict schema, avoid free types (`any`, `Any`, bare `dict`), constrain values and sizes, check resource ownership, and never build queries, commands or paths from input. Guidance only; nothing is enforced.
11) Honest defaults: annotate mode records intent only and blocks nothing, and `check` says so.

## Install (Claude Code)

```
/plugin marketplace add zafrem/security-sidecar
/plugin install security-sidecar --marketplace zafrem/security-sidecar
```

Local testing: `/plugin marketplace add ./security-sidecar`.

## How it works

1. You or the agent write a route file (`app/**/route.ts`, `pages/**`, `routers/**`, `routes/**`, `urls.py`).
2. A PostToolUse hook runs `analyze` and gives Claude a classification suggestion.
3. Clear cases are saved silently. Unclear ones prompt you with 2 or 3 options, always including "leave unclassified".
4. `/security-sidecar:check` finds routes with no sidecar, orphans, schema errors and `unclassified` values.
5. Opt in: `/security-sidecar:compile nginx` turns `mode: enforce` sidecars into `routes-manifest.json` and an nginx config.

Sidecar naming: `.route.json` where the directory is the route (Next.js app router); `<name>.route.json` where one directory holds many route files.

## Quiet mode

By default Claude mentions in one line when it saves a sidecar. To turn that off, set `"quiet": true` in `.security-sidecar.config.json`. Quiet mode silences only the success confirmation. Questions, refusals, `check` findings, link warnings and security problems in the code are always reported.

## Admin pages

A renamed admin path (for example `/ops-k7Qx92mVbT4nLw`) is not recognized as admin unless you list it in `.security-sidecar.config.json`:

```json
{ "adminPaths": ["/ops-k7Qx92mVbT4nLw", "/backoffice-*"] }
```

Routes under a listed prefix are suggested as `authenticated`, `no-store`, `noindex` without prompting. `*` matches within one path segment.

The plugin then asks which extra gate to use and records it in the sidecar:

```json
"gate": { "type": "passphrase", "minLength": 8 }
```

The passphrase itself must live in an environment variable or secret store. It is never written to a sidecar (`save` rejects it). To allow a link to an admin page on purpose, confirm it when the plugin asks. It then saves `"linkable": true` with `reason.source: user`.

A hidden path is not protection. `check` warns about any admin or `internal` route whose `enforcement.via` lacks `ip-allowlist` or `mtls`. Put the real control (network restriction, MFA, server-side role checks) underneath the hidden path.

## Security notes

- Keep `.route.json` out of statically served directories (`public/`, `static/`). `check` warns about this.
- `routes-manifest.json` lists admin and internal paths. Keep it out of public build output and deploy artifacts.
- `save` refuses secret-like values (keys, tokens, connection strings).

## Development

```
npm test          # core + hook tests
npm run bundle    # copy the CLI into plugins/security-sidecar/cli (commit the result)
```

Zero runtime dependencies; Node 18+.
