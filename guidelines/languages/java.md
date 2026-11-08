## Java

- Bind and validate input with Bean Validation (`@Valid`, `@NotNull`, `@Size`, `@Pattern`) on typed request classes. Do not pass raw `Map<String, Object>` around.
- Use `PreparedStatement` or an ORM's parameter binding, never string concatenation in SQL or JPQL.
- Use `ProcessBuilder` with an argument list, not `Runtime.exec` with a joined string.
- Do not deserialize untrusted data with `ObjectInputStream`. Use JSON with explicit types, and an allowlist if polymorphic types are needed.
- Use `SecureRandom` for tokens and `MessageDigest.isEqual` for comparing secrets. Disable external entities and DTDs in XML parsers to prevent XXE.
