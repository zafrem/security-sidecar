'use strict';
// Small, line-based lint for a few high-risk patterns: eval, exec/shell, and string-built SQL.
// It is text matching, not parsing: it can miss multi-line constructs and can false-positive.
// Suppress a reviewed line with a `security-sidecar-ignore` comment on that line or the line above.
const fs = require('fs');
const path = require('path');

const EXT = /\.(?:[cm]?[jt]sx?|py)$/i;
const SKIP = /(^|\/)(?:[^/]*\.(?:test|spec)\.[^/]+|(?:tests?|__tests__)\/.*|conftest\.py)$/;
const IGNORE = /security-sidecar-ignore/;
const SQL = /\b(?:select\b.*?\bfrom|insert\s+into|update\b.*?\bset|delete\s+from)\b/i;

const MSG = {
  eval: 'eval / dynamic code execution; never run input as code (use a parser or a lookup table)',
  exec: 'shell or process execution; avoid it, or pass an argument list without a shell and with validated values',
  'sql-string': 'SQL built by string interpolation or concatenation; use parameterized queries',
};

function isPy(file) { return /\.py$/i.test(file); }

function codeRules(line, py, text) {
  const hits = [];
  if (py) {
    if (/(?<![\w.])eval\s*\(/.test(line)) hits.push('eval');
    if (/(?<![\w.])exec\s*\(|\bos\.(?:system|popen)\s*\(|\bsubprocess\.\w+\([^)]*shell\s*=\s*True/.test(line)) hits.push('exec');
  } else {
    if (/(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(/.test(line)) hits.push('eval');
    const cp = /\b(?:child_process|childProcess|cp)\.(?:exec|execSync)\s*\(/.test(line);
    // security-sidecar-ignore: this is the lint's own pattern text, not a call
    const bare = /child_process/.test(text) && /(?<![\w.$])exec(?:Sync)?\s*\(/.test(line);
    if (cp || bare || /\bshell\s*:\s*true\b/.test(line)) hits.push('exec');
  }
  return hits;
}

function sqlString(line, py) {
  const re = /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  let m;
  while ((m = re.exec(line))) {
    const lit = m[1]; const inner = lit.slice(1, -1);
    if (!SQL.test(inner)) continue;
    const before = line.slice(0, m.index); const after = line.slice(m.index + lit.length);
    if (!py && lit[0] === '`' && /\$\{/.test(inner)) return true;
    if (py && /(?<![\w$])[fF]$/.test(before) && /\{[^{}]+\}/.test(inner)) return true;
    if (/^\s*\+/.test(after) || /\+\s*$/.test(before)) return true;
    if (py && (/^\s*%\s*[\w(]/.test(after) || /^\s*\.format\s*\(/.test(after))) return true;
  }
  return false;
}

function lintSource(rel, text, { includeSuppressed = false } = {}) {
  if (!EXT.test(rel) || SKIP.test(rel)) return [];
  const py = isPy(rel);
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) return;
    const suppressed = IGNORE.test(line) || (i > 0 && IGNORE.test(lines[i - 1]));
    if (suppressed && !includeSuppressed) return;
    const rules = codeRules(line, py, text);
    if (sqlString(line, py)) rules.push('sql-string');
    for (const rule of rules) out.push({ type: 'risky-code', file: rel, line: i + 1, rule, ...(suppressed ? { suppressed: true } : {}), message: `${MSG[rule]} (line ${i + 1}); fix it, or add a "security-sidecar-ignore" comment if reviewed` });
  });
  return out;
}

function lintFile(root, rel, opts) {
  if (!EXT.test(rel) || SKIP.test(rel)) return [];
  try { return lintSource(rel, fs.readFileSync(path.join(root, rel), 'utf8'), opts); } catch { return []; }
}

module.exports = { lintSource, lintFile };
