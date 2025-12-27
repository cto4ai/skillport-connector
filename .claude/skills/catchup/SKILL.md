---
description: Restore Claude's context after conversation reset. Triggers on "catchup", "where were we", "what were we working on".
---

# Catchup

Run the catchup script to gather all context in one call:

```bash
bash .claude/skills/catchup/catchup.sh
```

Then summarize:
- Current branch and status
- Recent work (from commits and checkpoint)
- What to pick up next
