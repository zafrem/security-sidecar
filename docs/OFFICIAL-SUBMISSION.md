# Preparing for the official plugin directory

Status: **prepared, not submitted.** Nothing here registers the plugin anywhere. Submission is a manual step through Anthropic's form: https://clau.de/plugin-directory-submission

The directory lists a plugin as a small catalog entry that points at a git repo, path, tag and commit. The plugin stays in this repo.

## What is already in place

| Requirement | Where |
| --- | --- |
| Self-contained plugin folder (works when copied out of the repo) | `plugins/security-sidecar/` with the CLI bundled in `cli/` |
| Plugin manifest with name, version, description, author, license, homepage, repository, keywords | `plugins/security-sidecar/.claude-plugin/plugin.json` |
| Plugin README | `plugins/security-sidecar/README.md` |
| License | `LICENSE` (MIT) |
| Security policy and reporting channel | `SECURITY.md` |
| CI on Linux, macOS and Windows, bundle freshness check | `.github/workflows/ci.yml` |
| Own marketplace with description and category | `.claude-plugin/marketplace.json` |
| Changelog | `CHANGELOG.md` |
| Generator for the catalog entry | `npm run listing` |

`claude plugin validate plugins/security-sidecar` runs a subset of the directory's checks. The directory also runs a safety scan and a policy review that cannot be run locally.

## Decide before submitting

1. **The plugin name is permanent.** `security-sidecar` becomes an immutable slug once published. A rename later needs a `renames` entry in the directory. If you want a different slug, change it now in `plugin.json`, `marketplace.json`, the README install lines and the slash command names. A friendlier label can be set later with `displayName`.
2. **The icon is effectively permanent.** The validator warns `ICON_MISSING`. It wants a square PNG or JPEG, 512 to 2048 px on each side, under 2 MB (no SVG or WebP), at `.claude-plugin/icon.png` or set through `icon` in `plugin.json`. Only the first icon seen at submission becomes the listing icon, and later changes do not replace it, so choose it deliberately.
3. **Author name.** `plugin.json` and `LICENSE` use `zafrem`. Change them to a name or organization if you prefer.

## Steps when you are ready

1. Add the icon (above) and rerun `claude plugin validate plugins/security-sidecar`.
2. In the GitHub repo settings, enable **Private vulnerability reporting** (Settings, Code security). `SECURITY.md` depends on it.
3. Commit and push everything. Make sure the CI run is green on every OS and Node version, including Windows and Node 18, which have not been tested yet.
4. Test the install from GitHub on a clean setup:
   ```
   /plugin marketplace add zafrem/security-sidecar
   /plugin install security-sidecar --marketplace zafrem/security-sidecar
   ```
   Then trigger the hook once by writing a route file. This has only been tested with `--plugin-dir` so far.
5. Tag and release. The catalog pins an exact commit, so tag a commit you are happy with (this step is public, so do it yourself or ask for it explicitly):
   ```
   git tag v0.1.0 && git push origin v0.1.0
   ```
   Keep `version` in `plugin.json` and `package.json` equal to the tag, and update `CHANGELOG.md`.
6. Generate the catalog entry (it refuses if the tag is missing or not pushed):
   ```
   npm run listing
   ```
   The output has this shape:
   ```json
   {
     "name": "security-sidecar",
     "description": "...",
     "author": { "name": "zafrem" },
     "category": "security",
     "source": {
       "source": "git-subdir",
       "url": "https://github.com/zafrem/security-sidecar.git",
       "path": "plugins/security-sidecar",
       "ref": "v0.1.0",
       "sha": "<commit of the tag>"
     },
     "homepage": "https://github.com/zafrem/security-sidecar"
   }
   ```
7. Submit through the form and include the entry. Expect a safety scan and a policy review.

## Facts reviewers will want

- The plugin makes no network calls, collects no data and uses no external services (SRS NFR-2).
- The hook runs only the bundled Node script in the plugin folder. File paths and source text are parsed in-process and never used to build shell commands.
- The plugin writes only sidecar files and, if asked, generated manifests. It never edits route source (NFR-6) and never stores secrets.
- By default it records intent only and enforces nothing, and the README says so at the top.

## After listing

- Every release is a new tag and a new `sha` in the catalog entry.
- Never rename the plugin. Keep behavior changes backward compatible, because installs are pinned by the catalog entry.
