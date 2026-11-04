'use strict';
// Detects secret-like values (keys, tokens, connection strings) before anything is written.
const PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['API key (sk-)', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['connection string with credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ['credential assignment', /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[=:]\s*['"]?[^\s'"]{6,}/i],
  ['long high-entropy string', /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{32,}\b/],
];

function findSecrets(value, p = '') {
  const hits = [];
  if (typeof value === 'string') {
    for (const [name, re] of PATTERNS) if (re.test(value)) hits.push({ path: p || '/', kind: name });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findSecrets(v, `${p}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      hits.push(...findSecrets(k, `${p}/${k} (key)`), ...findSecrets(v, `${p}/${k}`));
    }
  }
  return hits;
}

module.exports = { findSecrets };
