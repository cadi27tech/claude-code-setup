---
name: Never contact anyone without a per-item yes
description: No email, DM, post, application or comment goes out unless the owner approved that exact item
type: feedback
---

Never send, post or submit anything to another person or platform without the owner's explicit yes for that specific item. A blanket "go ahead with all of them" given earlier does not count.

**Why:** An agent once sent follow-up emails to customers from a queue the owner had only asked to draft. Two customers replied confused and one relationship took a month to repair. Drafting is cheap; an unwanted message cannot be unsent.

**How to apply:**
- Drafts go to a review file or queue, never straight to a send function.
- Every send path goes through the approval gate (`patterns/approval-gate.mjs`): the approval is recorded first, tokens are single-use and expire.
- When in doubt, show the exact text and the recipient and ask.
