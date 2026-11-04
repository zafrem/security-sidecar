'use strict';
// Minimal JSON Schema validator (subset used by route.schema.json). No dependencies.
const fs = require('fs');
const path = require('path');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'route.schema.json'), 'utf8'));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function check(s, v, p, root, errs) {
  if (s.$ref) s = s.$ref.split('/').slice(1).reduce((o, k) => o[k], root);
  if ('const' in s && v !== s.const) return errs.push(`${p}: must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) return errs.push(`${p}: must be one of ${s.enum.join(', ')}`);
  if (s.type) {
    const t = typeOf(v);
    if (!(t === s.type || (s.type === 'number' && t === 'integer'))) return errs.push(`${p}: must be ${s.type}`);
  }
  if (typeof v === 'string') {
    if (s.minLength && v.length < s.minLength) errs.push(`${p}: too short`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${p}: does not match ${s.pattern}`);
  }
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) errs.push(`${p}: must be >= ${s.minimum}`);
  if (Array.isArray(v) && s.items) v.forEach((x, i) => check(s.items, x, `${p}[${i}]`, root, errs));
  if (typeOf(v) === 'object') {
    const keys = Object.keys(v);
    if (s.minProperties && keys.length < s.minProperties) errs.push(`${p}: needs at least ${s.minProperties} propert${s.minProperties > 1 ? 'ies' : 'y'}`);
    for (const r of s.required || []) if (!(r in v)) errs.push(`${p}: missing required "${r}"`);
    for (const k of keys) {
      const sub = (s.properties && s.properties[k]) ||
        Object.entries(s.patternProperties || {}).find(([re]) => new RegExp(re).test(k))?.[1];
      if (sub) check(sub, v[k], `${p}/${k}`, root, errs);
      else if (s.additionalProperties === false) errs.push(`${p}: unknown field "${k}"`);
    }
  }
}

function validate(doc) {
  const errors = [];
  check(schema, doc, '', schema, errors);
  return { valid: errors.length === 0, errors };
}

module.exports = { validate, schema };
