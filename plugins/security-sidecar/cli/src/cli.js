'use strict';
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['strict', 'json'].includes(k)) flags[k] = true; else flags[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, flags };
}

const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');

function readPolicy(raw) {
  if (raw === undefined) throw new Error('--policy is required');
  const text = raw === '-' ? fs.readFileSync(0, 'utf8') : raw.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw;
  return JSON.parse(text);
}

function main(argv) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  try {
    switch (cmd) {
      case 'analyze': {
        if (!rest[0]) throw new Error('usage: security-sidecar analyze <file> [--methods GET,POST]');
        const methods = flags.methods ? flags.methods.split(',').map((m) => m.trim().toUpperCase()) : undefined;
        out(require('./analyze').analyze(rest[0], { root: flags.root || process.cwd(), methods }));
        return 0;
      }
      case 'save': {
        if (!rest[0]) throw new Error('usage: security-sidecar save <dir> --policy <json|@file|-> [--file <name>]');
        const r = require('./save').save(rest[0], readPolicy(flags.policy), { file: flags.file });
        const { code, ...body } = r; out(body);
        return code;
      }
      case 'check': {
        const r = require('./check').check(rest[0] || process.cwd(), { strict: !!flags.strict, base: flags.base });
        if (flags.json) out(r); else process.stdout.write(require('./check').format(r) + '\n');
        return r.exitCode;
      }
      case 'compile': {
        const r = require('./compile').compile(path.resolve(rest[0] || process.cwd()), flags.target);
        const { code, ...body } = r; out(body);
        return code;
      }
      default:
        process.stderr.write('usage: security-sidecar <analyze|save|check|compile> ...\n');
        return 64;
    }
  } catch (e) {
    out({ ok: false, error: e.message });
    return 2;
  }
}

module.exports = { main };
