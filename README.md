# Claude Code Setup Pack

The setup behind daily Claude Code work across 42 projects with their own memory: a rules file, eight guardrail hooks (plus three helpers), a memory system that survives new sessions and context compaction, and an approval gate for anything that sends, posts, pays or deletes.

Part of **Source Included**, by Adrian Capraru. Source available under FSL-1.1-MIT (see `LICENSE`). It becomes MIT two years after release.

Every hook here exists because something went wrong once. The comment at the top of each file says what.

## Runs in production

| | |
|---|---|
| Months live | 3 (hook files dated 17-23 Aug 2026, in use since) |
| Monthly running cost | EUR 0 extra; runs inside Claude Code, which needs your paid Claude plan (Pro or Max) or API usage |
| Version | 1.0.0 |
| Last tested | 20 Nov 2026 (`npm test`: 9 checks green; every hook is fed real hook JSON through bash) |
| Incidents | Each hook exists because of a dated incident (listed below); none recorded since Aug 2026. |

## What is inside

| Path | Hook event | What it does | The incident behind it |
|---|---|---|---|
| `hooks/no-dash.sh` | PreToolUse Write/Edit | Blocks any write containing an em or en dash | A house style rule the model kept breaking in client copy |
| `hooks/voice-warn.sh` | PreToolUse Write/Edit | Warns when .md/.html/.txt contains ghost-written outreach phrasing ("I'm reaching out", "I'd love to") | Drafts in the owner's voice read as robotic when pasted |
| `hooks/git-push-guard.sh` | PreToolUse Bash | On `git push`: Windows TLS reminder, and a warning if the branch's PR is already merged | Commits pushed to a merged branch went nowhere |
| `hooks/look-before-ocr.sh` + `looked-at-log.sh` + `render-all-pages.py` | PreToolUse Bash, PostToolUse Read | Refuses PDF text extraction until every page was rendered and actually shown to the model | Six wrong conclusions from PDFs never opened; three findings were handwritten |
| `hooks/precompact-state.sh` + `precompact-transcript.js` | PreCompact | Freezes the git state, last files edited and last commands to `.remember/precompact.md` at the moment of compaction | Mid-task position lost after every compaction |
| `hooks/session-start-context.sh` | SessionStart | Prints branch, recent activity, open PRs; after a compaction it replays the frozen position | Same |
| `hooks/image-size-guard.ps1` | PreToolUse Read and screenshots (Windows) | Blocks full-page screenshots and downscales images over 1400 px before they are read | Oversized images broke long sessions for good |
| `hooks/_hookjson.sh` | shared | Reads hook JSON with Python and fails loud if it cannot | jq was missing, so every hook silently enforced nothing for three days |
| `rules/CLAUDE.example.md` | | Rules template: skills first, evidence before claims, no irreversible action without a per-item yes, secrets handling | |
| `memory/` | | `MEMORY.md` index plus one-rule-per-file memories with **Why** and **How to apply** (5 fictional examples) | |
| `patterns/approval-gate.mjs` | | Dry run by default, approval written before the action, single-use expiring tokens, per-run cap, kill switch | An agent sent emails from a queue it was only asked to draft |

## Quick start

Needs Claude Code, bash (Git Bash on Windows), Python 3 and Node 22. PyMuPDF only for `render-all-pages.py` (`pip install pymupdf`).

```
npm test                                   # 9 checks
mkdir -p ~/.claude/hooks && cp hooks/* ~/.claude/hooks/
```

Then merge `settings.example.json` into `~/.claude/settings.json` (keep any hooks you already have), copy `rules/CLAUDE.example.md` to `~/.claude/CLAUDE.md` and edit it. Restart Claude Code and run `/hooks` to see them loaded.

## Configuration

| Variable | Default | Used by |
|---|---|---|
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where render manifests and the looked-at log are kept |

Project reminders: add a block to `session-start-context.sh` for any repository with a known trap (there is a commented example).

## The approval gate in 10 lines

```js
import { createGate } from './patterns/approval-gate.mjs';
const gate = createGate({ dir: './gate-data', perRunCap: 10, ttlHours: 6 });
// 1. A human approves exact items (from a review screen, a CLI prompt, a chat reply):
const [rec] = gate.approve([{ id: 'invoice-42', action: 'send-email', summary: 'Reminder to Acme' }], { mode: 'live', by: 'owner' });
// 2. The send path refuses to run without that token:
await gate.run({ id: 'invoice-42', action: 'send-email', token: rec.token }, () => sendEmail(/* ... */));
// touch gate-data/STOP to stop everything.
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `BLOCKED: ... no python interpreter on PATH` | Install Python 3 and make sure `python` or `python3` runs in bash. The blocking hooks fail closed on purpose. |
| Hooks do not fire | Run `/hooks` in Claude Code. Paths in `settings.json` must point to where you copied the files. On Windows use Git Bash's `bash`. |
| The dash hook blocks a file that must contain a dash (for example a test fixture) | Build the character from its code instead of typing it: `String.fromCharCode(0x2014)` in JavaScript, `chr(0x2014)` in Python. |
| `look-before-ocr` keeps blocking | Run the `render-all-pages.py` command it prints, then Read every PNG it lists. |
| `image-size-guard.ps1` does nothing on Mac or Linux | It is Windows-only; leave it out of `settings.json` there. |

## Known limits

- `voice-warn.sh` is a pattern list, not a classifier; it warns, never blocks.
- `look-before-ocr.sh` recognises common extraction tools by name (pdftotext, pdfplumber, PyPDF, tesseract and similar).
- The approval gate is a single-process file store. For several workers, move the three JSONL files to a database with a unique constraint on the token.

## Full guide

`GUIDE.md` and the Source Included Vault include the memory system walkthrough and how to delegate work to a second, cheaper model with Claude reviewing.
