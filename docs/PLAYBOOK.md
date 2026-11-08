# security-sidecar Playbook

Practical steps for using security-sidecar. For how it works inside see [ARCHITECTURE.md](ARCHITECTURE.md).

> **A sidecar records intent. It blocks nothing.** Annotate mode never protects a route by itself.

## 1. Set up

1. Install the plugin in Claude Code:
   ```
   /plugin marketplace add zafrem/security-sidecar
   /plugin install security-sidecar --marketplace zafrem/security-sidecar
   ```
2. Optional, in the project root, `.security-sidecar.config.json`:
   ```json
   {
     "adminPaths": ["/ops-k7Qx92mVbT4nLw", "/backoffice-*"],
     "include": ["**/handlers/**"],
     "exclude": ["**/legacy/**"],
     "quiet": false,
     "guidelines": true
   }
   ```
   - `adminPaths`: route prefixes treated like `/admin` (`*` matches within one segment).
   - `include` / `exclude`: extra or removed route-file globs.
   - `quiet`: `true` stops Claude mentioning successful sidecar saves. Questions, refusals, findings and security warnings still appear.
   - `guidelines`: `false` turns off the session-start security reminder (see "Security reminder in every session" below). Default `true`.
3. Commit the `.route.json` files with the code. Never put them in `public/` or `static/`.

## 2. Everyday flow

1. You or the agent add or edit a route.
2. The plugin classifies it. **Clear cases are saved silently.** Unclear ones ask you to choose secured, public, or leave unclassified.
3. Review the new `.route.json` in the diff like any other file.
4. Run `/security-sidecar:check` before you merge.

## 3. Scenarios

### A. New public page (SEO)
1. Add the page, for example `app/blog/page.tsx`.
2. Expect a silent save: `public`, `indexing: index`.
3. Follow the guidance: static generation or caching, page metadata, add to the sitemap, no per-user data.

### B. New API or account route
1. Add it, for example `app/api/orders/route.ts`.
2. Expect `authenticated`, `no-store`.
3. Follow the guidance: check the session inside the handler (not only middleware), check role or ownership, rate limit, CSRF for cookie sessions.

### Writing handlers and other functions
1. The `secure-functions` skill applies to any function that receives external input, in any of the supported languages. The route guidance also lists the key rules as `Input:` lines.
2. The rules (SG-1 to SG-14) are in `guidelines/core.md`: validate with a strict schema at the edge, no free types, constrain values and sizes, check ownership, never build queries, commands or paths from input, keep secrets out of code and logs, fail closed. Language notes sit in `guidelines/languages/`.
3. Using another assistant? Copy the generated file from `adapters/` (see `adapters/README.md`).
4. To change or add a rule or language, edit `guidelines/` and run `npm run guidelines`.
5. These are guidance. Nothing blocks code that breaks them, so use code review and your type checker (`strict` mode, `mypy --strict`) as the enforcement.

### Security reminder in every session
1. A `SessionStart` hook (on startup, resume, clear and compact) gives the agent a compact list of the SG rules, so they apply to **all** code it writes, not only routes and handlers.
2. The list is generated from `guidelines/core.md` into `plugins/security-sidecar/hooks/security-reminder.txt`. After editing a rule run `npm run guidelines`; `npm test` fails if the file is stale.
3. It costs a small amount of context per session. To turn it off, set `"guidelines": false` in `.security-sidecar.config.json`. The route hooks and skills keep working.
4. It is advice for the agent, not a control. It never says code is secure, and it does not stop code that ignores the rules. Keep code review and the `check` lint in place.
5. Informal test (2026-11-08, headless Claude Code, one prompt: an Express `DELETE /files/:name` handler, five runs each way): with the plugin all five runs flagged missing authentication, limited the file-name format and deleted regular files only; without it none did. Path traversal was handled in both. None of the plugin runs added a real authentication check, only a TODO. One task and ten runs, so it shows the reminder has an effect, not how large it is.
6. If the agent seems to ignore it, ask it to apply the `secure-functions` skill explicitly for that change.

### C. A route the tool is unsure about
1. You are asked. Pick **Secured** unless the page is meant for search engines.
2. Your choice is saved with `reason.source: user` and is never overwritten by later heuristic saves.
3. Choose "Leave unclassified" only temporarily. `check` will keep warning.

### D. Admin page
1. If the path is not `/admin`, add it to `adminPaths` first.
2. Create the route. You are asked for the extra gate:
   - SSO or MFA (best),
   - a passphrase of 8 or more characters (16+ recommended),
   - or none (not recommended).
3. Implement it: the passphrase comes from an environment variable or secret store, is compared in constant time, is rate limited with lockout, and is never committed. Visitors who fail the gate should get the same 404 as an unknown URL.
4. Restrict by network as well (IP allowlist, VPN or mTLS) and record it:
   ```json
   "enforcement": { "via": ["ip-allowlist"] }
   ```
5. Do **not** link to the page from nav, footer, sitemap or `robots.txt`. The plugin warns if anything does.
6. Run `check`. A clean admin route has no `admin-no-gate`, `admin-no-network-restriction` or `admin-path-exposed` finding.

### E. Allowing a link to an admin page on purpose
1. Ask for the link. The plugin asks you to confirm, because the link reveals the hidden URL to every visitor.
2. If you confirm, it saves `"linkable": true` with `reason.source: user`.
3. To undo: remove the link and delete `linkable` from the sidecar.

### F. Renamed or deleted route
1. Move the sidecar with the route (`git mv`), and update its `route` field.
2. A deleted route leaves an `orphan` finding. Delete the sidecar.

### G. Turning on enforcement (optional, Nginx only)
1. Classify everything first. `compile` refuses `unclassified` in enforce sidecars.
2. Set `"mode": "enforce"` and `enforcement.via` (`api-gateway` or `ip-allowlist` for Nginx) on the sidecars you want compiled.
3. Run `/security-sidecar:compile nginx`. Review `security-sidecar.nginx.conf` before use; where methods differ, the strictest applies to the path.
4. Add `routes-manifest.json` and the generated config to `.gitignore` and to your deploy exclusions. The manifest lists admin paths.

## 4. Checking and CI

Exit codes for `check`: **0** in annotate mode (warnings only), **1** with `--strict` or for violations in `enforce` sidecars.

Local or CI (from a checkout; the CLI needs only Node 18+):
```bash
node plugins/security-sidecar/cli/bin/security-sidecar.js check . --strict
node plugins/security-sidecar/cli/bin/security-sidecar.js check . --json   # machine-readable
```

Git pre-commit hook (`.git/hooks/pre-commit`, make it executable):
```bash
#!/bin/sh
node plugins/security-sidecar/cli/bin/security-sidecar.js check . --strict || exit 1
```

GitHub Actions step:
```yaml
- run: node plugins/security-sidecar/cli/bin/security-sidecar.js check . --strict
```
Adjust the path to where the CLI lives in your project.

## 5. Finding reference

| Finding | Fix |
| --- | --- |
| `missing` | Edit the route to retrigger the plugin, or run `analyze` then `save` |
| `orphan` | Delete or move the sidecar to match the route |
| `schema` | Fix the JSON; unknown fields are not allowed |
| `unclassified` | Choose secured or public and re-save |
| `static-served` | Move the sidecar out of `public/` or `static/` |
| `admin-no-network-restriction` | Add an IP allowlist, VPN or mTLS, then record it in `enforcement.via` |
| `admin-no-gate` | Add SSO/MFA or a passphrase gate and record it in `gate` |
| `admin-path-exposed` | Remove the link, sitemap or `robots.txt` entry, or approve it as in scenario E |
| `risky-code` | Replace `eval` with a parser or lookup table, shell calls with an argument-list API, and string-built SQL with parameterized queries. If reviewed and safe, add a `security-sidecar-ignore` comment with the reason |
| `linkable-not-approved` | Confirm with the owner, then re-save with `reason.source: user`, or remove `linkable` |

`save` exits 2 on a schema error, a secret-like value, a sidecar name that is not allowed, or an unapproved `linkable`. Nothing is written in that case.

### Reviewing suppressions
`check` lists every line suppressed with `security-sidecar-ignore` under `suppressed`. An agent can add that comment, so treat each one as a review item in pull requests and check the stated reason.

## 6. Rules of thumb

- When unsure, secure it. Wrongly public costs more than wrongly secured.
- Hide admin URLs for noise reduction only. The real controls are the network restriction, the gate and server-side role checks.
- Never put passwords, keys, tokens or connection strings in a sidecar, including `notes`. `save` will refuse them.
- Let the tool write sidecars. Hand edits are fine for `notes`, but not for `linkable`.
- Review sidecar changes in pull requests. A change from `authenticated` to `public` deserves a second pair of eyes; consider CODEOWNERS for `*.route.json`.

## 7. Maintaining the tool itself

```bash
npm test           # unit, hook and bundle-freshness tests
npm run bundle     # after changing src/ or schema/, copy into the plugin; commit the result
claude plugin validate .
```
