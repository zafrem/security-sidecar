## TypeScript / JavaScript

- Turn on `strict`. Type external input as `unknown` and narrow it with a schema library (for example zod `.strict()`). Never `any`.
- No `eval`, `new Function` or string arguments to `setTimeout`. Use `child_process.execFile` or `spawn` with an argument array and no `shell: true`, never `exec` with a built string.
- Use parameterized queries (`$1` placeholders or a query builder). Do not interpolate into SQL template literals.
- Do not set `innerHTML` or `dangerouslySetInnerHTML` from data. Render text, or sanitize with a vetted library.
- Use `crypto.randomUUID` or `crypto.randomBytes`, not `Math.random`. Use `crypto.timingSafeEqual` for secrets.
- Do not merge untrusted objects into plain objects. Reject `__proto__`, `constructor` and `prototype` keys.
