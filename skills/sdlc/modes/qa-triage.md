# /sdlc qa | triage — human bug intake + queue routing

Two interactive flows (the human twin of `hunt`):
- **`qa`** — *you* report a bug → reproduce → failing test → file it.
- **`triage`** — process the incoming / piled-up queue through the label state machine.

**Prerequisite:** a stack profile (for `qa`'s failing test at the seam).

## `qa` — report → reproduce → file
1. **Report.** The user describes a bug conversationally; explore the codebase for context + the
   ubiquitous language as you go (run the background exploration the `qa` skill does).
2. **Reproduce → failing test.** Conduct the `qa` discipline: **reproduce** the defect, then write a
   **FAILING test at the right seam** (it becomes the fix's acceptance test). Reproduce-before-file —
   no repro → `needs-info`, not a bug yet.
3. **File.** `.scratch/<feature|bugs>/issues/<NN>-<slug>.md` — `## What` (with the repro) · Gherkin AC
   anchored on the failing test · `Context:` (resolved vs `CONTEXT-MAP.md`) · `## Blocked by`. **Dedup**
   against open issues. Clear defect → `ready-for-agent`; reproduced-but-intent-unclear → `needs-triage`.
   (To *fix* it immediately instead of just filing, use `/sdlc fix`.)

## `triage` — process the queue
Walk every `needs-triage` issue and route it through the labels (`docs/agents/triage-labels.md`):
- enough info + scoped + wanted → **`ready-for-agent`** (the scope-in gate);
- blocked on a question → **`needs-info`** (record the question);
- not doing it → **`wontfix`** (reason);
- needs human attention / engine escalation → **`ready-for-human`**.
**Never auto-promote** without a human decision — `triage` *is* a human gate. A candidate that
**contradicts a characterization pin** stays `needs-triage` **always** (established behaviour, Hyrum's
law — needs human judgment, §13.H).

## Hand-off
`qa` leaves filed issues; `triage` leaves a routed queue. `ready-for-agent` issues are drainable →
`/sdlc run` (or `/sdlc fix` for a single one).
