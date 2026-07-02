# /sdlc status — queue + last run (read-only)

No mutations, no Workflow. Report three things:

1. **Queue** — scan `.scratch/<feature>/issues/*.md`; group by the `Status:` line
   (`ready-for-agent`, `needs-triage`, `needs-info`, `ready-for-human`, `done`, `wontfix`).
   Show counts, the `ready-for-agent` ids (what `/sdlc run` would drain, in blocker order), and
   the `ready-for-human` ids (what's waiting on a human).
2. **Last run** — read the newest `.scratch/runs/*.md`; show its header (shipped / escalated /
   skipped) and any escalation still unresolved.
3. **Readiness** — whether `docs/agents/stack.md` exists and whether the working tree is clean
   (so the user knows if `/sdlc run` pre-flight would pass).
4. **Harness** — this skill's `version` (from its `SKILL.md` frontmatter / `VERSION`), and which engine
   path is active: **`Workflow` tool present → fast path** (parallel, background, journaled) vs
   **absent → main-thread fallback** (sequential, foreground; `modes/*.fallback.md`). Check your own
   available tools to determine which.

End with the suggested next action (e.g. *"3 ready-for-agent → `/sdlc run`"*, or *"2 escalated →
review the `slice/…` branches"*).
