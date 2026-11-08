## Python

- Add type hints and run `mypy --strict`. Model external input with pydantic using `extra="forbid"` and `Field` constraints. Never `Any` or a bare `dict`.
- No `eval`, `exec` or `pickle.loads` on untrusted data. Use `yaml.safe_load`, and `defusedxml` for XML.
- Call `subprocess.run([...])` with an argument list and never `shell=True` or `os.system`.
- Pass SQL parameters separately (`cur.execute(sql, params)`). Do not use f-strings, `%` or `.format` to build SQL.
- Confine paths: resolve with `pathlib` and check `is_relative_to(base)` before opening.
- Use the `secrets` module for tokens and `hmac.compare_digest` for comparing secrets. Do not rely on `assert` for validation, because it is removed under `-O`.
