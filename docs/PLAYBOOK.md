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
     "exclude": ["**/legacy/**"]
   }
   ```
   - `adminPaths`: route prefixes treated like `/admin` (`*` matches within one segment).
   - `include` / `exclude`: extra or removed route-file globs.
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
| `linkable-not-approved` | Confirm with the owner, then re-save with `reason.source: user`, or remove `linkable` |

`save` exits 2 on a schema error, a secret-like value, a sidecar name that is not allowed, or an unapproved `linkable`. Nothing is written in that case.

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
