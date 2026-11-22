// node test/run.mjs: feeds real hook JSON to every hook through bash and checks exit codes and
// messages, then tests the approval gate and the transcript parser. Needs bash and python on PATH
// (Git Bash on Windows). Writes only to a temp folder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate, NotApproved } from '../patterns/approval-gate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = path.join(ROOT, 'hooks').replace(/\\/g, '/');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-setup-'));
const cfg = path.join(tmp, 'claude-config');
fs.mkdirSync(cfg);
const posix = p => p.replace(/\\/g, '/');
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok  ', name); };

function hook(name, input, { cwd = tmp, env = {} } = {}) {
  const r = spawnSync('bash', [`${HOOKS}/${name}`], { input: typeof input === 'string' ? input : JSON.stringify(input), cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: posix(cfg), ...env } });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const DASH = String.fromCharCode(0x2014);
try {
  await t('no-dash blocks an em dash and allows a clean write', () => {
    const bad = hook('no-dash.sh', { tool_name: 'Write', tool_input: { file_path: 'a.md', content: `one ${DASH} two` } });
    assert.equal(bad.code, 2); assert.match(bad.err, /BLOCKED/);
    const en = hook('no-dash.sh', { tool_name: 'Edit', tool_input: { file_path: 'a.md', new_string: `2020${String.fromCharCode(0x2013)}2026` } });
    assert.equal(en.code, 2);
    assert.equal(hook('no-dash.sh', { tool_name: 'Write', tool_input: { file_path: 'a.md', content: 'one - two' } }).code, 0);
  });

  await t('voice-warn warns on outreach phrasing in .md, never blocks, ignores code files', () => {
    const w = hook('voice-warn.sh', { tool_input: { file_path: 'post.md', content: "Hi there, I'm reaching out because..." } });
    assert.equal(w.code, 0); assert.match(w.err, /WARN/);
    assert.equal(hook('voice-warn.sh', { tool_input: { file_path: 'app.js', content: "// I'm reaching out to the API" } }).err, '');
  });

  await t('git-push-guard reminds on push only', () => {
    assert.match(hook('git-push-guard.sh', { tool_input: { command: 'git push origin feature-x' } }).out, /schannel/);
    assert.equal(hook('git-push-guard.sh', { tool_input: { command: 'git status' } }).out, '');
    assert.doesNotMatch(hook('git-push-guard.sh', { tool_input: { command: 'git -c http.sslBackend=schannel push' } }).out, /REMINDER/);
  });

  await t('look-before-ocr blocks extraction until every rendered page was looked at', () => {
    const pdf = posix(path.join(tmp, 'pack.pdf'));
    fs.writeFileSync(pdf, '%PDF-1.4 fake test file');
    const cmd = { tool_input: { command: `pdftotext "${pdf}" out.txt` } };
    const first = hook('look-before-ocr.sh', cmd);
    assert.equal(first.code, 2); assert.match(first.err, /no page renders/);
    const md5 = crypto.createHash('md5').update(fs.readFileSync(pdf)).digest('hex');
    const pages = [posix(path.join(tmp, 'p001.png')).toLowerCase(), posix(path.join(tmp, 'p002.png')).toLowerCase()];
    fs.mkdirSync(path.join(cfg, 'render-manifests'), { recursive: true });
    fs.writeFileSync(path.join(cfg, 'render-manifests', md5 + '.manifest'), pages.join('\n') + '\n');
    const half = hook('look-before-ocr.sh', cmd);
    assert.equal(half.code, 2); assert.match(half.err, /2 of 2 pages/);
    for (const p of pages) assert.equal(hook('looked-at-log.sh', { tool_input: { file_path: p } }).code, 0);
    assert.equal(hook('look-before-ocr.sh', cmd).code, 0);
    assert.equal(hook('look-before-ocr.sh', { tool_input: { command: 'ls -la' } }).code, 0);
  });

  await t('precompact transcript parser prints the last files and commands', () => {
    const tr = path.join(tmp, 'transcript.jsonl');
    const line = o => JSON.stringify({ message: { content: [{ type: 'tool_use', input: o }] } });
    fs.writeFileSync(tr, ['{"partial', line({ file_path: 'C:\\work\\a.ts' }), line({ command: 'npm test -- "quoted"' }), line({ file_path: 'b.md' })].join('\n'));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'hooks', 'precompact-transcript.js'), tr], { encoding: 'utf8' });
    assert.match(r.stdout, /Last files written or edited[\s\S]*C:\\work\\a\.ts[\s\S]*b\.md/);
    assert.match(r.stdout, /npm test -- "quoted"/);
  });

  await t('precompact-state freezes position; session-start replays it after compaction', () => {
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(path.join(proj, '.remember'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.remember', 'now.md'), '10:02 editing the invoice parser\n');
    const pc = hook('precompact-state.sh', JSON.stringify({ trigger: 'auto', transcript_path: '' }), { cwd: proj });
    assert.equal(pc.code, 0);
    const frozen = fs.readFileSync(path.join(proj, '.remember', 'precompact.md'), 'utf8');
    assert.match(frozen, /Frozen at compaction/); assert.match(frozen, /editing the invoice parser/);
    const ss = hook('session-start-context.sh', JSON.stringify({ source: 'compact' }), { cwd: proj });
    assert.match(ss.out, /THIS IS WHERE YOU WERE/); assert.match(ss.out, /END CONTEXT/);
    assert.doesNotMatch(hook('session-start-context.sh', JSON.stringify({ source: 'startup' }), { cwd: proj }).out, /WHERE YOU WERE/);
  });

  await t('approval gate: dry by default, single use, scoped, expiring, capped, kill switch', async () => {
    let clock = new Date('2026-11-18T10:00:00Z');
    const gate = createGate({ dir: path.join(tmp, 'gate'), perRunCap: 3, ttlHours: 6, now: () => clock });
    let sent = 0;
    const send = async () => { sent++; return 'sent'; };
    const [dry] = gate.approve([{ id: 'inv-1', action: 'email' }]);
    assert.equal((await gate.run({ id: 'inv-1', action: 'email', token: dry.token }, send)).result, 'dry-run');
    assert.equal(sent, 0);
    const [live, other] = gate.approve([{ id: 'inv-2', action: 'email' }, { id: 'inv-3', action: 'email' }], { mode: 'live', by: 'owner' });
    await assert.rejects(gate.run({ id: 'inv-2', action: 'delete', token: live.token }, send), NotApproved); // wrong action
    assert.equal((await gate.run({ id: 'inv-2', action: 'email', token: live.token }, send)).result, 'done');
    await assert.rejects(gate.run({ id: 'inv-2', action: 'email', token: live.token }, send), /already used/);
    clock = new Date('2026-11-18T17:00:00Z');
    await assert.rejects(gate.run({ id: 'inv-3', action: 'email', token: other.token }, send), /expired/);
    clock = new Date('2026-11-18T17:05:00Z');
    const [a, b] = gate.approve([{ id: 'x', action: 'post' }, { id: 'y', action: 'post' }], { mode: 'live' });
    fs.writeFileSync(gate.stopFile, '');
    await assert.rejects(gate.run({ id: 'x', action: 'post', token: a.token }, send), /kill switch/);
    fs.rmSync(gate.stopFile);
    await gate.run({ id: 'x', action: 'post', token: a.token }, send); // third run
    await assert.rejects(gate.run({ id: 'y', action: 'post', token: b.token }, send), /per-run cap/);
    assert.equal(sent, 2);
    assert.ok(fs.readFileSync(gate.files.approvals, 'utf8').split('\n').filter(Boolean).length === 5);
  });

  await t('settings.example.json is valid and every hook it names exists', () => {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.example.json'), 'utf8'));
    const cmds = JSON.stringify(s).match(/hooks[\\/]+[a-z-]+\.(sh|ps1)/g);
    assert.ok(cmds.length >= 7);
    for (const c of cmds) assert.ok(fs.existsSync(path.join(ROOT, 'hooks', c.split(/[\\/]+/).pop())), c);
  });

  await t('no em or en dash in the repo', () => {
    const bad = new RegExp(`[${String.fromCharCode(0x2013)}${DASH}]`);
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    assert.deepEqual(walk(ROOT).filter(f => bad.test(fs.readFileSync(f, 'utf8'))), []);
  });

  console.log(`\nall ${passed} checks passed`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
