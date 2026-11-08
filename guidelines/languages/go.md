## Go

- Decode request bodies into typed structs with `json.Decoder.DisallowUnknownFields`, wrap the body in `http.MaxBytesReader`, then validate field values. Do not use `interface{}` or `any` for external data.
- Use `database/sql` placeholders. Do not build queries with `fmt.Sprintf`.
- Use `exec.Command` with separate arguments, never `sh -c` with a built string.
- Use `crypto/rand`, not `math/rand`, for tokens. Use `subtle.ConstantTimeCompare` for secrets.
- Keep `InsecureSkipVerify` off. Set timeouts on `http.Client` and `http.Server`.
