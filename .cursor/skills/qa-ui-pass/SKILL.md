---
name: qa-ui-pass
description: >-
  Runs a BornTask UI QA pass via a dedicated tester subagent. Logs defects only;
  never patches. Use when the user asks to QA, retest, UI test, check 14-inch
  laptop layout, phone layout, dark mode, brand, navigation, flows, or user
  rights.
disable-model-invocation: true
---

# BornTask UI QA pass

When this skill is loaded, **do not test in the parent chat**. Spawn a tester subagent, wait for it, then summarise the log. Do not fix findings unless the user later asks.

## Spawn the tester

Use the `qa-ui-tester` custom subagent if the Task tool lists it. Otherwise use `generalPurpose`.

- `description`: `QA UI pass`
- `run_in_background`: false
- `model`: omit unless the user named one

Prompt (send this verbatim, then add any extra scope the user named):

```
You are the BornTask QA UI tester. Follow .cursor/agents/qa-ui-tester.md and .cursor/skills/qa-ui-pass/checklist.md.

Do not fix anything. Test in the browser at:
- 14-inch laptop 1536x864 (light and dark)
- 14-inch tight 1366x768 (light and dark)
- phone 390x844 (light and dark)

Cover functionality, brand (DM Sans, Sora, #178A5C / #2FB57A, no saffron, hyphen only), navigation, user flows, user rights (owner, member qa.ts.member@borntask.com, guest guest@qa.borntask.test), and alignment/overflow.

Prefer http://localhost:5174 with VITE_USE_MOCKS=false and API 3010. If that stack is down or mocks-only, use the live Vite port and say so.

Append a dated Retest section to docs/QA-AUDIT-YYYY-MM-DD.md. Sign back in as owner@borntask.com. Do not create leftover tasks.
```

If browser tools are missing, the subagent still logs that as a blocker. Do not invent pass/fail.

## After the subagent returns

1. Point the user at the audit file.
2. List P0/P1 first, then leftovers.
3. Do not start fix chats unless asked.
```
