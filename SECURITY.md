# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, the steps to reproduce it, the version or commit, and the impact you expect.

You can expect an acknowledgement and a first assessment, but this is a small project without a guaranteed response time. Please allow reasonable time for a fix before you disclose the problem publicly.

## Supported versions

Only the latest release on `main` receives security fixes.

## What counts as a vulnerability

Examples of problems we want to hear about:

- `save` writes a secret-like value (key, token, password, connection string) to a sidecar, or accepts a password in the `gate` field.
- `save` writes outside the target directory, or accepts a sidecar file name with path separators.
- A file path, route name or source text from the project leads to command execution or file access outside the project (the CLI and hook must never build shell commands from input).
- The `linkable` approval guard can be bypassed through the CLI alone, without `reason.source: user`.
- The hook or CLI crashes in a way that blocks the agent or the CI run on crafted input.
- Sidecars or `routes-manifest.json` are written somewhere they could be served publicly.

## What is not a vulnerability

- **Annotation is not enforcement.** In `annotate` mode the tool records intent and blocks nothing. A route with a sidecar is not protected by it.
- The documented limits: routes registered only in code are not detected, `enforcement.via` is not verified, the lint and link scan are text matching, and an agent can write `reason.source: user` or a `security-sidecar-ignore` comment (`check` lists suppressions for review).
- Findings that need a malicious maintainer or write access to the repository.
