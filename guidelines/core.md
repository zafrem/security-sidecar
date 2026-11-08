## Rules

**SG-1. Validate every external input at the boundary.** External means request parameters, query, body, headers and cookies; files and uploads; environment and CLI arguments; messages from queues or other services; and data users stored earlier. Parse it with a strict schema into typed values, reject unknown fields, and validate once at the edge.

**SG-2. No free types for external data.** Do not carry it in dynamic, `any`, untyped, `object`, `Map<string, any>`, `dict` or `interface{}` values. Treat it as unknown until validated, then use specific types, enums and literals.

**SG-3. Constrain the values, not only the type.** Give numbers a min and max, strings a length limit and a pattern or enum, collections a size limit, and bodies and uploads a size limit. Prefer an allowlist of accepted values over a denylist.

**SG-4. Authorize every access to a resource.** Check on the server, for each request, that the caller may use this specific id (owner, role, tenant). Being logged in is not enough. Never trust a role, id or flag sent by the client.

**SG-5. Never build interpreter input from data.** This covers SQL, shell commands, file paths, URLs, HTML, templates, regular expressions and NoSQL or LDAP queries. Use parameterized queries, argument lists without a shell, path normalization confined to a base directory, and context-aware output encoding.

**SG-6. Never execute data as code.** No `eval` or dynamic code, and no deserialization of native object formats from untrusted sources (pickle, Java serialization, unsafe YAML loaders). Use plain data formats such as JSON with a schema.

**SG-7. Make outbound requests safe.** When the destination depends on input, allow only known hosts, block private, link-local and cloud-metadata addresses, do not follow redirects blindly, and set timeouts.

**SG-8. Keep secrets out of code, logs and responses.** Read keys, tokens and passwords from the environment or a secret store. Never commit them, never log them or personal data, and redact them from errors.

**SG-9. Use vetted cryptography.** Do not invent algorithms. Hash passwords with a slow salted function (argon2, bcrypt, scrypt). Generate tokens and ids with a cryptographically secure random source. Compare secrets in constant time. Keep TLS certificate verification on.

**SG-10. Fail closed and say little.** On a validation, authentication or internal error, deny the request. Send clients a generic message and keep details (including stack traces) in server logs only.

**SG-11. Limit resources.** Set timeouts, size limits, pagination and rate limits, and bound loops, recursion and concurrency that depend on user input.

**SG-12. Use least privilege and minimal exposure.** Pass a function only the validated fields it needs, not the whole request. Give database users, tokens and files the narrowest permissions. Do not ship debug endpoints or verbose modes enabled by default.

**SG-13. Be careful with dependencies.** Prefer the standard library and packages the project already uses. Ask before adding a new package, pin versions, and never add a package whose name you cannot verify.

**SG-14. Do not weaken security to make something work.** Do not disable certificate checks, CSRF protection, authentication, validation or linters. If a control blocks the task, say so instead of removing it.

## How to apply

- New or changed code that handles external input: follow all rules without asking.
- Existing code you were not asked to change: do not rewrite it. If you notice a gap, mention it in one line.
- If a rule conflicts with what the user asked for, do what is safe, explain the conflict briefly and offer the alternative. Do not silently skip the rule.
- These rules are guidance. Nothing enforces them, so never claim code is "secure" or "protected" because you followed them.
