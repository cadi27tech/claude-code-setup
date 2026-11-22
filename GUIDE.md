# Claude Code Setup Pack: step-by-step guide

At the end you will have Claude Code that follows your house rules every session, remembers lessons between sessions, picks up where it was after a long conversation is compacted, and cannot send anything without your approval.

## Before you start

- Claude Code installed and working (`claude --version`).
- Node.js 22+, Python 3, and bash. On Windows, Git for Windows gives you Git Bash.
- 45 minutes.

## Part 1: Install and test (10 minutes)

1. Download this repository as a ZIP and unzip it.
2. Open Git Bash (Windows) or Terminal (Mac, Linux) in the folder.
3. Run `npm test`. You should see `all 9 checks passed`. The test runs every hook with the same JSON Claude Code sends.

## Part 2: Copy the hooks (5 minutes)

1. Run `mkdir -p ~/.claude/hooks && cp hooks/* ~/.claude/hooks/`.
2. Open `~/.claude/settings.json` in an editor. If it does not exist, copy `settings.example.json` there.
3. If it exists, copy the `"hooks"` block from `settings.example.json` into it. Keep any hooks you already have.
4. On Mac or Linux remove the `image-size-guard.ps1` entry (it is for Windows).
5. Restart Claude Code and type `/hooks`. You should see SessionStart, PreCompact, PreToolUse and PostToolUse entries.

**Try it:** ask Claude to "write a file test.md containing an em dash". The write is blocked with a message. Ask it to use a hyphen instead and it goes through.

## Part 3: Write your rules (15 minutes)

1. Copy `rules/CLAUDE.example.md` to `~/.claude/CLAUDE.md`.
2. Replace every `[placeholder]`. Delete rules you do not want; a rule you will not enforce is noise.
3. Keep it under about 80 lines. It is read on every turn.

Good rules are checkable: "never commit without my yes" works; "be careful" does not.

## Part 4: Start a memory (10 minutes)

Claude Code keeps a memory folder per project. The pattern that works:

1. One index file, `MEMORY.md`: one line per memory, with a link and a 10-word summary.
2. One file per rule, with three parts: the rule, **Why** (the incident), **How to apply** (the concrete steps).
3. Types: `feedback` (how you want things done), `reference` (facts about tools and machines), `project` (live open items, deleted when done).

Look at `memory/examples/` for five fictional examples. When Claude makes a mistake you never want again, say: "save this as a feedback memory with why and how to apply."

## Part 5: Never send without approval (5 minutes to understand, then use in your code)

Any script Claude writes that sends email, posts, pays or deletes should use `patterns/approval-gate.mjs`:

1. Your review screen or CLI calls `gate.approve(items, { mode: 'live' })` only after you said yes. That writes the approval to disk.
2. The send code calls `gate.run(item, sendFn)`. Without a valid, unused, recent token for that exact item and action, it throws and nothing is sent.
3. `mode: 'dry'` approvals log what would happen. That is the default.
4. Emergency stop: create an empty file named `STOP` in the gate folder.

Add to your rules: "anything that sends goes through the approval gate."

## Part 6: Delegate to a second model (optional)

A pattern that cuts cost on big builds: Claude plans and writes a precise brief, a cheaper coding model or CLI builds it headless, Claude reviews the diff and runs the tests. Rules that make it work:

- The brief lists files, function signatures and the test command; nothing is left to guess.
- The helper never gets secrets or permission to push.
- Claude always reads the diff and the test output before accepting it.

## If something goes wrong

| What you see | What to do |
|---|---|
| `BLOCKED: ... no python interpreter` | Install Python 3; check `python --version` inside bash. |
| `/hooks` shows nothing | The `settings.json` file has a JSON error. Paste it into a JSON checker. |
| A hook blocks something it should not | Read its message; every block says why and what to do. Edit the pattern at the top of that hook. |
| After compaction Claude still lost its place | Check `.remember/precompact.md` exists in the project. The folder `.remember` must exist in the project or its parent. |

Questions: the Source Included community, with the exact message you saw.
