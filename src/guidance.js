'use strict';
// Implementation guidance for a classified route. Text only: the tool never writes auth code (NFR-6).

function frameworkOf(relPath) {
  if (/\.py$/.test(relPath)) return 'fastapi';
  if (/(^|\/)(app|pages)\//.test(relPath)) return 'nextjs';
  return 'express';
}

const AUTH = {
  nextjs: 'Check the session inside the handler or server component (not only in middleware) and return 401/403 when it is missing.',
  fastapi: 'Add a dependency such as `Depends(get_current_user)` to the route and raise HTTPException(401/403) when it fails.',
  express: 'Mount an auth middleware on this router (for example `router.use(requireAuth)`) and respond 401/403 when it fails.',
};
const CACHE = {
  nextjs: 'Prefer static generation or `revalidate` so the page is served from cache; export `metadata` (title, description, canonical).',
  fastapi: 'Send `Cache-Control: public, max-age=...` and render server-side HTML so crawlers see the content.',
  express: 'Send `Cache-Control: public, max-age=...` and render server-side HTML so crawlers see the content.',
};

function guidance({ exposure, relPath, isAdmin }) {
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
  return g;
}

module.exports = { guidance, frameworkOf };
