# security-sidecar

Records the protection intent of each web route in a `.route.json` sidecar file next to the code, whenever an AI coding agent creates or changes a route.

> **Annotation is not protection.** By default (`mode: annotate`) this tool only records intent. It blocks nothing, and `check` only warns. A route with a sidecar is not thereby protected.

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
