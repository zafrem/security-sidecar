---
name: secure-functions
description: Secure-coding rules for functions that receive external input. Use when writing or editing request handlers, API routes, server actions, or any function that takes user-controlled values (params, query, body, headers, cookies, uploads, environment, files). Covers input validation, value constraints, avoiding free types such as any, and ownership checks.
---

# Secure functions

Apply these rules to code you write or change. They are guidance: security-sidecar does not enforce them, so say so if asked whether the code is "protected".

## Rules

1. **Validate at the boundary.** Every external value is parsed with a schema before any other code uses it. Reject unknown fields. Validate once, at the edge, then pass the typed result inward.
2. **No free types.** Do not use `any`, untyped parameters, bare `object`, `Function`, `dict`, `Any` or `**kwargs` for external data. Use `unknown` and narrow it through the schema; use literals, enums and specific types.
3. **Constrain the values, not just the type.** Numbers get a min and max. Strings get a length limit and a pattern or enum. Arrays get a size limit. Bodies and uploads get a size limit. Prefer an allowlist of accepted values over a denylist.
4. **Check scope and ownership.** Confirm the caller may use this specific resource id (owner, role, tenant). Being logged in is not enough.
5. **Never build commands, queries or paths from input.** Use parameterized queries. Avoid `eval`, `exec`, shell calls and dynamic `require`/`import`. Normalize file paths and confine them to a base directory.
6. **Fail closed.** On a validation or auth error, deny and return a generic message. Do not echo raw input back and do not log secrets or personal data.
7. **Take only what is needed.** Pass the validated fields a function uses, not the whole request object.
8. **Never hardcode secrets.** Read keys and passwords from the environment or a secret store.

## Examples

TypeScript (zod):

```ts
const Body = z.object({
  id: z.string().uuid(),
  qty: z.number().int().min(1).max(100),
  note: z.string().max(200).optional(),
}).strict();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());   // unknown in, typed out
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  // parsed.data is { id: string; qty: number; note?: string }
}
```

Python (pydantic):

```python
class Order(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    qty: int = Field(ge=1, le=100)
    note: str | None = Field(default=None, max_length=200)

@router.post("/orders")
def create(order: Order, user=Depends(current_user)): ...
```

## How to apply

- New or changed handler: apply all rules without asking.
- Existing code you were not asked to change: do not rewrite it. Mention a gap in one line if you notice one.
- Do not add a validation library the project does not use. Use what it has, or ask before adding one.
- Do not record any of this in a sidecar; sidecars hold route intent only.
