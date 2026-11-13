'use strict';
// Implementation guidance for a classified route. Text only: the tool never writes auth code (NFR-6).

function frameworkOf(relPath) {
  if (/\.py$/.test(relPath)) return 'fastapi';
  if (/\.go$/.test(relPath)) return 'go';
  if (/\.java$/.test(relPath)) return 'java';
  if (/(^|\/)(app|pages)\//.test(relPath)) return 'nextjs';
  return 'express';
}

const AUTH = {
  nextjs: 'Check the session inside the handler or server component (not only in middleware) and return 401/403 when it is missing.',
  fastapi: 'Add a dependency such as `Depends(get_current_user)` to the route and raise HTTPException(401/403) when it fails.',
  express: 'Mount an auth middleware on this router (for example `router.use(requireAuth)`) and respond 401/403 when it fails.',
  go: 'Verify the caller identity from context/middleware inside the handler and return `http.StatusUnauthorized` / `http.StatusForbidden` when missing.',
  java: 'Require authentication via Spring Security (`@PreAuthorize` / SecurityFilterChain) and verify caller identity before acting.',
};
const CACHE = {
  nextjs: 'Prefer static generation or `revalidate` so the page is served from cache; export `metadata` (title, description, canonical).',
  fastapi: 'Send `Cache-Control: public, max-age=...` and render server-side HTML so crawlers see the content.',
  express: 'Send `Cache-Control: public, max-age=...` and render server-side HTML so crawlers see the content.',
  go: 'Send `Cache-Control: public, max-age=...` on public responses.',
  java: 'Send `Cache-Control: public, max-age=...` on public responses.',
};

const INPUT = {
  nextjs: 'Parse params, query, body and headers with a strict schema (for example zod `.strict()`) before use. Type inputs as `unknown` and narrow them; never `any`.',
  express: 'Parse params, query, body and headers with a strict schema (for example zod `.strict()`) before use. Type inputs as `unknown` and narrow them; never `any`.',
  fastapi: 'Declare inputs as pydantic models or typed parameters with `Field(...)` constraints and `extra="forbid"`; never `Any` or a bare `dict`.',
  go: 'Decode into a typed struct with `DisallowUnknownFields()`, limit body size with `http.MaxBytesReader`, and never use `map[string]any` for input.',
  java: 'Deserialize into a typed record/DTO with `@Valid` Bean Validation (`@NotNull`, `@Size`, `@Pattern`) and `FAIL_ON_UNKNOWN_PROPERTIES`; never `Map<String, Object>`.',
};

// Secure-coding checklist for code that receives external input (see skills/secure-functions).
function inputRules(relPath, route) {
  const isPage = /(^|\/)page\.[^/]+$/.test(relPath);
  if (isPage && !/\[/.test(route)) return [];
  return [
    `Input: ${INPUT[frameworkOf(relPath)]}`,
    'Input: constrain every value: numeric min/max, string length and pattern or enum, array size, and a body/upload size limit. Prefer allowlists.',
    'Input: check the caller may access this specific resource id (ownership or role), not only that they are logged in.',
    'Input: never build SQL, shell commands or file paths from input; use parameterized queries and confine paths. Fail closed with a generic error.',
  ];
}

function guidance({ exposure, relPath, isAdmin, route = '' }) {
  const fw = frameworkOf(relPath);
  const g = [];
  if (exposure === 'public') {
    g.push('Public: keep it reachable without login so search engines can index it.');
    g.push(CACHE[fw]);
    g.push('Add it to the sitemap and set `indexing: index`. Do not expose per-user data on this route.');
    g.push('Still rate limit any form or search input on the page.');
  } else if (exposure === 'internal') {
    g.push('Internal: restrict by network (IP allowlist, VPN or mTLS). A login or a hidden URL is not a network restriction.');
    g.push('Verify a shared signature for webhooks and cron callers. Send `Cache-Control: no-store`.');
    g.push('Record the control in `enforcement.via` (`ip-allowlist` or `mtls`).');
  } else if (exposure === 'authenticated') {
    g.push('Secured: do not make this route public or indexable.');
    g.push(AUTH[fw]);
    g.push('Send `Cache-Control: no-store`, set `noindex`, and check the user\'s role or ownership on every request.');
    g.push('Rate limit it, and add CSRF protection if it changes data with cookie sessions.');
  } else {
    g.push('Unclassified: decide public vs secured before shipping. Until then treat it as secured.');
  }
  if (isAdmin) {
    g.push('Admin: add a second gate on top of login. Preferred order: IP allowlist/VPN, SSO with MFA, then a passphrase of 8+ characters (16+ recommended).');
    g.push('A passphrase must come from an environment variable or secret store, be compared in constant time, and be rate limited with lockout. Never commit it or write it into a sidecar.');
    g.push('Return the same 404 as an unknown URL to visitors who fail the gate. Do not link to this route from nav, footer, sitemap or robots.txt.');
  }
  g.push(...inputRules(relPath, route));
  return g;
}

module.exports = { guidance, frameworkOf };
