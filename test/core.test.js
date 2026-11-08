'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { analyzeSource } = require('../src/analyze');
const { save } = require('../src/save');
const { check } = require('../src/check');
const { compile } = require('../src/compile');
const R = require('../src/routes');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

test('detects route files and derives URLs', () => {
  assert.ok(R.isRouteFile('app/api/login/route.ts'));
  assert.ok(!R.isRouteFile('app/components/Button.tsx'));
  assert.ok(!R.isRouteFile('node_modules/x/routes/a.js'));
  assert.strictEqual(R.routeFromPath('app/(shop)/products/[id]/page.tsx'), '/products/[id]');
  assert.strictEqual(R.routeFromPath('src/app/api/v1/payment/route.ts'), '/api/v1/payment');
  assert.strictEqual(R.routeFromPath('pages/api/users.ts'), '/api/users');
  assert.strictEqual(R.routeFromPath('server/routes/orders.js'), '/orders');
});

test('classification is conservative', () => {
  const a = analyzeSource({ relPath: 'app/api/login/route.ts', source: 'export async function POST(){}' });
  assert.strictEqual(a.confidence, 'high');
  assert.strictEqual(a.suggestion.exposure, 'authenticated');
  const b = analyzeSource({ relPath: 'app/reports/route.ts', source: 'export async function GET(){}' });
  assert.strictEqual(b.needsUserInput, true);
  assert.strictEqual(b.suggestion.exposure, 'authenticated');
  assert.ok(b.options.some((o) => o.policy.methods.GET.exposure === 'unclassified'));
  const c = analyzeSource({ relPath: 'app/blog/page.tsx', source: '' });
  assert.strictEqual(c.suggestion.exposure, 'public');
});

test('save validates, is deterministic, and preserves human edits', () => {
  const d = tmp();
  const policy = { route: '/api/x', methods: { POST: { cache: { policy: 'no-store' }, exposure: 'authenticated' } }, reason: { source: 'heuristic', rule: 'r' } };
  const r1 = save(d, policy);
  assert.ok(r1.ok);
  const text = fs.readFileSync(path.join(d, '.route.json'), 'utf8');
  assert.ok(text.indexOf('"exposure"') < text.indexOf('"cache"'), 'stable key order');
  assert.strictEqual(JSON.parse(text).mode, 'annotate');
  assert.strictEqual(save(d, policy).written, false, 'idempotent');

  // person edits notes + picks a value
  const doc = JSON.parse(text); doc.notes = 'hand written'; doc.reason = { source: 'user' }; doc.methods.POST.exposure = 'internal';
  fs.writeFileSync(path.join(d, '.route.json'), JSON.stringify(doc));
  assert.ok(save(d, policy).ok);
  const after = JSON.parse(fs.readFileSync(path.join(d, '.route.json'), 'utf8'));
  assert.strictEqual(after.notes, 'hand written');
  assert.strictEqual(after.methods.POST.exposure, 'internal');
});

test('save rejects schema violations and secrets, writing nothing', () => {
  const d = tmp();
  const bad = save(d, { route: '/a', methods: { GET: { exposure: 'nope' } } });
  assert.strictEqual(bad.code, 2);
  const unk = save(d, { route: '/a', methods: { GET: { exposure: 'public' } }, extra: 1 });
  assert.strictEqual(unk.code, 2);
  for (const notes of ['postgres://admin:hunter22@db/prod', 'token=abcdef123456', 'AKIAABCDEFGHIJKLMNOP']) {
    const r = save(d, { route: '/a', methods: { GET: { exposure: 'public' } }, notes });
    assert.strictEqual(r.code, 2, notes);
  }
  assert.strictEqual(save(d, { route: '/a', methods: { GET: { exposure: 'public' } } }, { file: '../evil.route.json' }).code, 2);
  assert.deepStrictEqual(fs.readdirSync(d), []);
});

test('check: missing, orphan, unclassified, static; annotate exits 0, strict exits 1', () => {
  const root = tmp();
  put(root, 'app/api/a/route.ts', 'export function GET(){}');
  put(root, 'app/api/b/route.ts', 'export function GET(){}');
  put(root, 'app/api/b/.route.json', JSON.stringify({ version: 1, route: '/api/b', methods: { GET: { exposure: 'unclassified' } } }));
  put(root, 'app/gone/.route.json', JSON.stringify({ version: 1, route: '/gone', methods: { GET: { exposure: 'public' } } }));
  put(root, 'public/.route.json', JSON.stringify({ version: 1, route: '/p', methods: { GET: { exposure: 'public' } } }));
  const r = check(root);
  const types = r.findings.map((f) => f.type).sort();
  assert.deepStrictEqual(types, ['missing', 'orphan', 'orphan', 'static-served', 'unclassified']);
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(check(root, { strict: true }).exitCode, 1);
});

test('check fails on violations in enforce-mode sidecars', () => {
  const root = tmp();
  put(root, 'app/x/route.ts', 'export function GET(){}');
  put(root, 'app/x/.route.json', JSON.stringify({ version: 1, mode: 'enforce', route: '/x', methods: { GET: { exposure: 'unclassified' } } }));
  assert.strictEqual(check(root).exitCode, 1);
});

test('compile: enforce only, skips by via, refuses unclassified', () => {
  const root = tmp();
  const w = (rel, doc) => put(root, rel, JSON.stringify({ version: 1, ...doc }));
  w('app/a/.route.json', { mode: 'enforce', route: '/admin/a', methods: { GET: { exposure: 'internal' } }, enforcement: { via: ['ip-allowlist'] } });
  w('app/b/.route.json', { mode: 'enforce', route: '/b/[id]', methods: { POST: { exposure: 'authenticated', cache: { policy: 'no-store' }, rateLimit: { windowMs: 60000, max: 10 } } }, enforcement: { via: ['api-gateway'] } });
  w('app/c/.route.json', { mode: 'enforce', route: '/c', methods: { GET: { exposure: 'public' } }, enforcement: { via: ['app-middleware'] } });
  w('app/d/.route.json', { route: '/d', methods: { GET: { exposure: 'unclassified' } } });
  const r = compile(root, 'nginx');
  assert.ok(r.ok);
  assert.strictEqual(r.compiled, 2);
  assert.deepStrictEqual(r.skipped.map((s) => s.route), ['/c']);
  const conf = fs.readFileSync(r.target, 'utf8');
  assert.match(conf, /location = \/admin\/a/);
  assert.match(conf, /location ~ \^\/b\/\[\^\/\]\+\$/);
  assert.match(conf, /limit_req_zone .* rate=10r\/m/);
  assert.ok(!conf.includes('/d'), 'annotate sidecars are not compiled');
  assert.strictEqual(compile(root, 'nextjs').ok, false);
  w('app/e/.route.json', { mode: 'enforce', route: '/e', methods: { GET: { exposure: 'unclassified' } } });
  assert.strictEqual(compile(root, 'nginx').code, 1);
});

test('plugin hook emits context for route files only, and the bundle is current', () => {
  const hook = path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'post-tool-use.js');
  const root = tmp();
  put(root, 'app/api/login/route.ts', 'export async function POST(){}');
  put(root, 'lib/util.ts', 'export const x = 1');
  const run = (file) => spawnSync('node', [hook], { input: JSON.stringify({ cwd: root, tool_input: { file_path: path.join(root, file) } }), encoding: 'utf8' });
  const hit = JSON.parse(run('app/api/login/route.ts').stdout);
  assert.match(hit.hookSpecificOutput.additionalContext, /"route": "\/api\/login"/);
  assert.strictEqual(run('lib/util.ts').stdout, '');
  for (const f of ['src/analyze.js', 'src/save.js', 'src/check.js', 'src/compile.js', 'src/routes.js', 'src/targets/nginx.js', 'src/links.js', 'src/lint.js', 'src/guidance.js', 'schema/route.schema.json']) {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'plugins/security-sidecar/cli', f), 'utf8'), fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), `${f} out of date; run npm run bundle`);
  }
});

test('adminPaths config classifies renamed admin paths without prompting', () => {
  const adminPaths = ['/ops-k7Qx92mVbT4nLw'];
  const a = analyzeSource({ relPath: 'app/ops-k7Qx92mVbT4nLw/users/route.ts', source: 'export function GET(){}', adminPaths });
  assert.strictEqual(a.confidence, 'high');
  assert.strictEqual(a.policy.reason.rule, 'config-admin-path');
  assert.strictEqual(a.suggestion.indexing, 'noindex');
  assert.strictEqual(analyzeSource({ relPath: 'app/ops-k7Qx92mVbT4nLw/route.ts', source: 'export function GET(){}' }).needsUserInput, true, 'unconfigured path still asks');
  assert.ok(R.isAdminRoute('/ops-abc/x', ['/ops-*']));
  assert.ok(!R.isAdminRoute('/ops-abc-extra', ['/ops-abc']));
});

test('check warns when admin/internal routes lack a network restriction', () => {
  const root = tmp();
  put(root, '.security-sidecar.config.json', JSON.stringify({ adminPaths: ['/ops-k7Qx92mVbT4nLw'] }));
  const w = (dir, route, via, exposure = 'authenticated') => {
    put(root, `app/${dir}/route.ts`, 'export function GET(){}');
    put(root, `app/${dir}/.route.json`, JSON.stringify({ version: 1, route, methods: { GET: { exposure } }, ...(via ? { enforcement: { via } } : {}) }));
  };
  w('ops-k7Qx92mVbT4nLw', '/ops-k7Qx92mVbT4nLw', ['app-middleware']);
  w('admin', '/admin', ['ip-allowlist']);
  w('jobs', '/jobs', null, 'internal');
  w('shop', '/shop', null, 'public');
  const hits = check(root).findings.filter((f) => f.type === 'admin-no-network-restriction').map((f) => f.file).sort();
  assert.deepStrictEqual(hits, ['app/jobs/.route.json', 'app/ops-k7Qx92mVbT4nLw/.route.json']);
  assert.strictEqual(check(root).exitCode, 0, 'warning only in annotate mode');
  assert.strictEqual(check(root, { strict: true }).exitCode, 1);
});

test('analyze gives guidance and asks for a gate on admin routes', () => {
  const a = analyzeSource({ relPath: 'app/admin/route.ts', source: 'export function GET(){}' });
  assert.strictEqual(a.needsGate, true);
  assert.ok(a.gateOptions.some((o) => o.gate && o.gate.minLength === 8));
  assert.ok(a.guidance.some((g) => /404/.test(g)));
  const p = analyzeSource({ relPath: 'app/blog/page.tsx', source: '' });
  assert.ok(p.guidance.some((g) => /sitemap/i.test(g)));
  assert.strictEqual(p.needsGate, undefined);
  assert.ok(analyzeSource({ relPath: 'app/reports/route.ts', source: 'export function GET(){}' }).options.some((o) => /SEO/.test(o.label)));
});

test('gate: passphrase needs 8+ chars, no secret stored, human setting preserved', () => {
  const d = tmp();
  const base = { route: '/admin', methods: { GET: { exposure: 'authenticated' } } };
  assert.strictEqual(save(d, { ...base, gate: { type: 'passphrase', minLength: 4 } }).code, 2);
  assert.strictEqual(save(d, { ...base, gate: { type: 'passphrase', password: 'hunter2hunter2' } }).code, 2);
  assert.ok(save(d, { ...base, gate: { type: 'passphrase', minLength: 12 } }).ok);
  assert.ok(save(d, base).ok, 're-save without gate');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, '.route.json'), 'utf8')).gate.minLength, 12);
});

test('check flags links to admin routes outside the route, unless linkable', () => {
  const root = tmp();
  put(root, 'app/admin/route.ts', 'export function GET(){}');
  put(root, 'app/admin/users/page.tsx', 'export default () => <a href="/admin">back</a>');
  put(root, 'app/admin/.route.json', JSON.stringify({ version: 1, route: '/admin', gate: { type: 'sso' }, methods: { GET: { exposure: 'authenticated' } }, enforcement: { via: ['ip-allowlist'] } }));
  put(root, 'app/page.tsx', 'export default () => <a href="/admin">Admin</a>');
  put(root, 'app/api/admin-stats/route.ts', 'const x = "/administrator"; const y = "/api/admin"');
  put(root, 'public/robots.txt', 'Disallow: /admin');
  put(root, 'app/layout.tsx', 'const u = "https://site.com/admin"');
  const exposed = check(root).findings.filter((f) => f.type === 'admin-path-exposed').map((f) => f.file).sort();
  assert.deepStrictEqual(exposed, ['app/layout.tsx', 'app/page.tsx', 'public/robots.txt']);
  assert.ok(!check(root).findings.some((f) => f.type === 'admin-no-gate'), 'gate recorded');
  const side = path.join(root, 'app/admin/.route.json');
  fs.writeFileSync(side, JSON.stringify({ ...JSON.parse(fs.readFileSync(side, 'utf8')), linkable: true }));
  assert.strictEqual(check(root).findings.filter((f) => f.type === 'admin-path-exposed').length, 0);
});

test('check warns when an admin route has no gate', () => {
  const root = tmp();
  put(root, 'app/admin/route.ts', 'export function GET(){}');
  put(root, 'app/admin/.route.json', JSON.stringify({ version: 1, route: '/admin', methods: { GET: { exposure: 'authenticated' } } }));
  assert.ok(check(root).findings.some((f) => f.type === 'admin-no-gate'));
});

test('hook warns when a non-route file links to an admin route', () => {
  const hook = path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'post-tool-use.js');
  const root = tmp();
  put(root, 'app/admin/route.ts', 'export function GET(){}');
  put(root, 'app/admin/.route.json', JSON.stringify({ version: 1, route: '/admin', methods: { GET: { exposure: 'authenticated' } } }));
  put(root, 'components/Nav.tsx', 'export const Nav = () => <a href="/admin">x</a>');
  put(root, 'components/Footer.tsx', 'export const Footer = () => null');
  const run = (file) => spawnSync('node', [hook], { input: JSON.stringify({ cwd: root, tool_input: { file_path: path.join(root, file) } }), encoding: 'utf8' }).stdout;
  assert.match(JSON.parse(run('components/Nav.tsx')).hookSpecificOutput.additionalContext, /components\/Nav\.tsx:1 -> \/admin/);
  assert.strictEqual(run('components/Footer.tsx'), '');
});

test('linkable needs user approval: save refuses, check flags hand edits', () => {
  const d = tmp();
  const base = { route: '/admin', methods: { GET: { exposure: 'authenticated' } } };
  const refused = save(d, { ...base, linkable: true, reason: { source: 'agent' } });
  assert.strictEqual(refused.code, 2);
  assert.match(refused.error, /approval/);
  assert.deepStrictEqual(fs.readdirSync(d), []);
  assert.ok(save(d, { ...base, linkable: true, reason: { source: 'user' } }).ok);
  assert.ok(save(d, { ...base, reason: { source: 'heuristic' } }).ok, 're-save keeps an approved linkable');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, '.route.json'), 'utf8')).linkable, true);

  const root = tmp();
  put(root, 'app/admin/route.ts', 'export function GET(){}');
  put(root, 'app/admin/.route.json', JSON.stringify({ ...base, version: 1, linkable: true, reason: { source: 'heuristic' }, gate: { type: 'sso' } }));
  assert.ok(check(root).findings.some((f) => f.type === 'linkable-not-approved'));
  put(root, 'app/admin/.route.json', JSON.stringify({ ...base, version: 1, linkable: true, reason: { source: 'user' }, gate: { type: 'sso' } }));
  assert.ok(!check(root).findings.some((f) => f.type === 'linkable-not-approved'));
});

test('guidance includes an input checklist for handlers, per language', () => {
  const next = analyzeSource({ relPath: 'app/api/orders/route.ts', source: 'export async function POST(){}' });
  assert.ok(next.guidance.some((g) => /^Input:.*zod/.test(g)));
  assert.ok(next.guidance.some((g) => /^Input:.*ownership/.test(g)));
  const py = analyzeSource({ relPath: 'routers/orders.py', source: '@router.post("/x")\ndef f(): pass' });
  assert.ok(py.guidance.some((g) => /pydantic/.test(g)));
  assert.ok(!analyzeSource({ relPath: 'app/blog/page.tsx', source: '' }).guidance.some((g) => /^Input:/.test(g)), 'static page has no inputs');
  assert.ok(analyzeSource({ relPath: 'app/blog/[slug]/page.tsx', source: '' }).guidance.some((g) => /^Input:/.test(g)), 'dynamic page has params');
});

test('quiet config is reported by analyze and defaults to off', () => {
  const { analyze } = require('../src/analyze');
  const root = tmp();
  put(root, 'app/api/x/route.ts', 'export async function POST(){}');
  assert.strictEqual(analyze('app/api/x/route.ts', { root }).quiet, false);
  put(root, '.security-sidecar.config.json', JSON.stringify({ quiet: true }));
  assert.strictEqual(analyze('app/api/x/route.ts', { root }).quiet, true);
  put(root, '.security-sidecar.config.json', JSON.stringify({ quiet: 'yes' }));
  assert.strictEqual(analyze('app/api/x/route.ts', { root }).quiet, false, 'only boolean true counts');
  // quiet never hides findings
  put(root, 'app/api/x/route.ts', 'export async function POST(){}');
  assert.ok(check(root).findings.some((f) => f.type === 'missing'));
});

test('hook carries the quiet-mode instruction only when quiet is on', () => {
  const hook = path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'post-tool-use.js');
  const root = tmp();
  put(root, 'app/api/x/route.ts', 'export async function POST(){}');
  const run = () => JSON.parse(spawnSync('node', [hook], { input: JSON.stringify({ cwd: root, tool_input: { file_path: path.join(root, 'app/api/x/route.ts') } }), encoding: 'utf8' }).stdout).hookSpecificOutput.additionalContext;
  assert.ok(!/QUIET MODE/.test(run()));
  put(root, '.security-sidecar.config.json', JSON.stringify({ quiet: true }));
  assert.match(run(), /QUIET MODE is on/);
});

test('lint flags eval, exec and string-built SQL, with few false positives', () => {
  const { lintSource } = require('../src/lint');
  const rules = (rel, src) => lintSource(rel, src).map((h) => `${h.line}:${h.rule}`);
  // JS / TS: should flag
  assert.deepStrictEqual(rules('a.ts', 'const r = eval(input)\nconst f = new Function("x", body)'), ['1:eval', '2:eval']);
  assert.deepStrictEqual(rules('a.ts', 'import { exec } from "child_process"\nexec(`ls ${dir}`)'), ['2:exec']);
  assert.deepStrictEqual(rules('a.ts', 'cp.execSync(cmd)\nspawn("a", [], { shell: true })'), ['1:exec', '2:exec']);
  assert.deepStrictEqual(rules('a.ts', 'db.query(`SELECT * FROM users WHERE id = ${id}`)'), ['1:sql-string']);
  assert.deepStrictEqual(rules('a.ts', 'db.query("SELECT * FROM users WHERE id = " + id)'), ['1:sql-string']);
  assert.deepStrictEqual(rules('a.ts', 'db.query("DELETE FROM t WHERE id = $1", [id])'), []);
  // JS / TS: should not flag
  assert.deepStrictEqual(rules('a.ts', '/\\d+/.exec(s)\nawait page.evaluate(fn)\nconst ev = obj.eval2()\n// eval(x) in a comment'), []);
  assert.deepStrictEqual(rules('a.ts', 'exec(sql)'), [], 'bare exec without child_process import');
  // Python
  assert.deepStrictEqual(rules('a.py', 'x = eval(s)\nexec(code)\nos.system(cmd)\nsubprocess.run(c, shell=True)'), ['1:eval', '2:exec', '3:exec', '4:exec']);
  assert.deepStrictEqual(rules('a.py', 'cur.execute(f"SELECT * FROM t WHERE id = {i}")'), ['1:sql-string']);
  assert.deepStrictEqual(rules('a.py', 'cur.execute("SELECT * FROM t WHERE id = %s" % i)\ncur.execute("UPDATE t SET a=1 WHERE id={}".format(i))'), ['1:sql-string', '2:sql-string']);
  assert.deepStrictEqual(rules('a.py', 'cur.execute("SELECT * FROM t WHERE id = %s", (i,))\nast.literal_eval(s)\nre.compile(p).exec_x()'), []);
  // suppression and skipped files
  assert.deepStrictEqual(rules('a.ts', '// security-sidecar-ignore reviewed\nconst r = eval(trusted)\nconst q = eval(x) // security-sidecar-ignore'), []);
  assert.deepStrictEqual(rules('a.test.ts', 'eval(x)'), []);
  assert.deepStrictEqual(rules('README.md', 'eval(x)'), []);
});

test('check reports risky code with file and line; strict fails; hook warns', () => {
  const root = tmp();
  put(root, 'lib/run.ts', 'export const run = (c: string) => {\n  return eval(c)\n}');
  const f = check(root).findings.filter((x) => x.type === 'risky-code');
  assert.deepStrictEqual(f.map((x) => `${x.file}:${x.line}:${x.rule}`), ['lib/run.ts:2:eval']);
  assert.strictEqual(check(root).exitCode, 0);
  assert.strictEqual(check(root, { strict: true }).exitCode, 1);
  const hook = path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'post-tool-use.js');
  const run = (file) => spawnSync('node', [hook], { input: JSON.stringify({ cwd: root, tool_input: { file_path: path.join(root, file) } }), encoding: 'utf8' }).stdout;
  assert.match(JSON.parse(run('lib/run.ts')).hookSpecificOutput.additionalContext, /lib\/run\.ts:2 \[eval\]/);
  put(root, 'app/api/q/route.ts', 'export async function POST(r: Request){ return db.query(`SELECT * FROM t WHERE a = ${await r.text()}`) }');
  const ctx = JSON.parse(run('app/api/q/route.ts')).hookSpecificOutput.additionalContext;
  assert.match(ctx, /"route": "\/api\/q"/);
  assert.match(ctx, /\[sql-string\]/);
});

test('suppressed risky lines are not hidden: check lists them for review', () => {
  const root = tmp();
  put(root, 'lib/a.ts', '// security-sidecar-ignore: reviewed\nconst r = eval(trusted)');
  const r = check(root);
  assert.strictEqual(r.findings.filter((f) => f.type === 'risky-code').length, 0);
  assert.deepStrictEqual(r.suppressed, [{ file: 'lib/a.ts', line: 2, rule: 'eval' }]);
  assert.match(require('../src/check').format(r), /suppressed.*lib\/a\.ts:2 \[eval\]/);
  assert.strictEqual(check(root, { strict: true }).exitCode, 0, 'suppressed lines do not fail strict');
});

test('generated guideline files match the single source', () => {
  const { build } = require('../scripts/guidelines');
  const out = build();
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'adapters/agents/AGENTS.md', 'adapters/cursor/security-sidecar.mdc', 'adapters/gemini/GEMINI.md',
    'plugins/security-sidecar/hooks/security-reminder.txt', 'plugins/security-sidecar/skills/secure-functions/SKILL.md',
  ]);
  for (const [rel, content] of Object.entries(out)) {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), content, `${rel} is out of date; run npm run guidelines`);
  }
});

test('guidelines: every rule and language is in every output, with valid front matter', () => {
  const { build } = require('../scripts/guidelines');
  const core = fs.readFileSync(path.join(__dirname, '..', 'guidelines', 'core.md'), 'utf8');
  const ids = [...core.matchAll(/\*\*(SG-\d+)\./g)].map((m) => m[1]);
  assert.ok(ids.length >= 14);
  assert.deepStrictEqual(ids, ids.map((_, i) => `SG-${i + 1}`), 'ids are sequential');
  for (const [rel, content] of Object.entries(build())) {
    if (rel.endsWith('security-reminder.txt')) { for (const id of ids) assert.ok(content.includes(`- ${id}.`), `${rel} lacks ${id}`); continue; }
    for (const id of ids) assert.ok(content.includes(`**${id}.`), `${rel} lacks ${id}`);
    for (const lang of ['TypeScript / JavaScript', 'Python', 'Go', 'Java']) assert.ok(content.includes(lang), `${rel} lacks ${lang}`);
  }
  const skill = build()['plugins/security-sidecar/skills/secure-functions/SKILL.md'];
  assert.match(skill, /^---\nname: secure-functions\ndescription: [^\n]+\n---\n/);
  const cursor = build()['adapters/cursor/security-sidecar.mdc'];
  assert.match(cursor, /^---\ndescription: [^\n]+\nglobs: [^\n]+\nalwaysApply: false\n---\n/);
  assert.match(build()['adapters/agents/AGENTS.md'], /<!-- BEGIN security-sidecar guidelines -->[\s\S]*<!-- END security-sidecar guidelines -->/);
});

test('session-start hook gives the security rules to the agent unless disabled', () => {
  const hook = path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'session-start.js');
  const root = tmp();
  const run = () => spawnSync('node', [hook], { input: JSON.stringify({ cwd: root, hook_event_name: 'SessionStart' }), encoding: 'utf8' }).stdout;
  const out = JSON.parse(run()).hookSpecificOutput;
  assert.strictEqual(out.hookEventName, 'SessionStart');
  const core = fs.readFileSync(path.join(__dirname, '..', 'guidelines', 'core.md'), 'utf8');
  for (const id of [...core.matchAll(/\*\*(SG-\d+)\./g)].map((m) => m[1])) assert.ok(out.additionalContext.includes(id), `reminder lacks ${id}`);
  assert.match(out.additionalContext, /ALL code/);
  put(root, '.security-sidecar.config.json', JSON.stringify({ guidelines: false }));
  assert.strictEqual(run(), '', 'opt-out prints nothing');
  put(root, '.security-sidecar.config.json', '{ not json');
  assert.ok(run().includes('SessionStart'), 'a broken config falls back to the default (on)');
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'security-sidecar', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.ok(hooks.SessionStart && hooks.PostToolUse, 'both hooks are registered');
});
