// Approval gate for anything an agent could send, post, pay or delete.
//
// The rule it enforces: nothing irreversible runs unless a human approved that
// exact item, for that exact action, recently, once. The approval is written to
// disk BEFORE the action path runs, and the action path refuses to run without it.
//
// Five guards, each one a lesson from automating outbound work:
//   1. Dry run by default: an approval says "live" explicitly or nothing real happens.
//   2. Approval record first: approve() writes approvals.jsonl; run() reads it back.
//   3. Single-use, expiring tokens: a token works once, for one item and one action, for ttlHours.
//   4. Per-run cap: a bug cannot turn one approval batch into a thousand actions.
//   5. Kill switch: if the STOP file exists, every run() refuses. Create it from any terminal.
//
// Zero dependencies. Usage:
//   const gate = createGate({ dir: './gate-data' });
//   const [rec] = gate.approve([{ id: 'invoice-42', action: 'send-email', summary: 'Reminder to Acme' }], { mode: 'live', by: 'owner' });
//   await gate.run({ id: 'invoice-42', action: 'send-email', token: rec.token }, async () => sendEmail(...));
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class NotApproved extends Error {}

const readJsonl = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const appendJsonl = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(o) + '\n'); };

export function createGate({ dir, perRunCap = 10, ttlHours = 6, stopFile, now = () => new Date() } = {}) {
  if (!dir) throw new Error('createGate needs a dir');
  const files = { approvals: path.join(dir, 'approvals.jsonl'), used: path.join(dir, 'used.jsonl'), log: path.join(dir, 'actions.jsonl') };
  const stop = stopFile || path.join(dir, 'STOP');
  let done = 0;

  function approve(items, { mode = 'dry', by = 'unknown' } = {}) {
    if (!['dry', 'live'].includes(mode)) throw new Error('mode must be dry or live');
    const batch = crypto.randomUUID();
    const at = now().toISOString();
    return items.map(it => {
      if (!it.id || !it.action) throw new Error('every item needs id and action');
      const rec = { token: crypto.randomUUID(), batch, id: it.id, action: it.action, summary: String(it.summary || '').slice(0, 300), mode, by, approved_at: at };
      appendJsonl(files.approvals, rec);
      return rec;
    });
  }

  function check({ id, action, token }) {
    if (fs.existsSync(stop)) throw new NotApproved(`kill switch: ${stop} exists`);
    if (done >= perRunCap) throw new NotApproved(`per-run cap of ${perRunCap} reached`);
    const rec = readJsonl(files.approvals).find(r => r.token === token);
    if (!rec || rec.id !== id || rec.action !== action) throw new NotApproved(`no approval for ${id} / ${action}`);
    if (now() - new Date(rec.approved_at) > ttlHours * 3600e3) throw new NotApproved(`approval for ${id} expired`);
    if (readJsonl(files.used).some(u => u.token === token)) throw new NotApproved(`approval for ${id} was already used`);
    return rec;
  }

  // Runs fn only for a valid, unused, live approval. Dry approvals log what would have happened.
  async function run(item, fn) {
    const rec = check(item); // throws before anything else happens
    appendJsonl(files.used, { token: rec.token, at: now().toISOString() }); // burn the token first: a crash cannot replay it
    done++;
    if (rec.mode !== 'live') {
      const entry = { at: now().toISOString(), id: rec.id, action: rec.action, result: 'dry-run', summary: rec.summary };
      appendJsonl(files.log, entry);
      return entry;
    }
    try {
      const out = await fn(rec);
      const entry = { at: now().toISOString(), id: rec.id, action: rec.action, result: 'done', detail: out ?? null };
      appendJsonl(files.log, entry);
      return entry;
    } catch (e) {
      appendJsonl(files.log, { at: now().toISOString(), id: rec.id, action: rec.action, result: 'failed', error: String(e.message).slice(0, 300) });
      throw e;
    }
  }

  return { approve, check, run, files, stopFile: stop, get done() { return done; } };
}
