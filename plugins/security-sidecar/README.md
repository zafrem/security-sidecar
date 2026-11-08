# security-sidecar (Claude Code plugin)

Records the protection intent of each web route in a `.route.json` sidecar file next to the code, whenever the agent creates or changes a route.

> **Annotation is not protection.** By default the plugin only records intent. It blocks nothing, and `check` only warns.

## Install

```
/plugin marketplace add zafrem/security-sidecar
/plugin install security-sidecar --marketplace zafrem/security-sidecar
```

Requires Node 18 or newer. The CLI is bundled in this plugin; nothing else is installed.

## What it adds

| Part | What it does |
| --- | --- |
| Hook (`PostToolUse` on `Write` and `Edit`) | Runs route analysis on route files, and warns about links to admin routes and risky code (`eval`, exec, string-built SQL) in any edited file |
| Skill `route-policy` | Saves clear classifications silently; asks you when unsure, for an admin gate, and before any link to a protected route is kept |
| Skill `secure-functions` | Secure-coding rules for functions that take external input |
| `/security-sidecar:check` | Finds missing, orphan, invalid and unclassified sidecars, exposed admin paths and risky code |
| `/security-sidecar:compile` | Opt-in: builds `routes-manifest.json` and an Nginx config from `mode: enforce` sidecars |

## What it does not do

- It does not enforce anything in `annotate` mode, and it never writes authentication code into your route source.
- It does not store secrets. An admin gate records only a type and a minimum length.
- It detects file-based routes (Next.js, and Express or FastAPI by file path). Routes registered only in code are not found.

## More

Full documentation, configuration and security policy: https://github.com/zafrem/security-sidecar
