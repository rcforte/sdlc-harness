# /sdlc hunt — main-thread fallback engine (no `Workflow` tool)

Use ONLY when the `Workflow` tool is unavailable. Reproduces `hunt.workflow.js`'s probe → verify → file
from the **main thread** via the `Agent` tool — **sequential, foreground**, no journal/budget. Same §13.H
discipline (an INDEPENDENT verifier reproduces each candidate as a failing test); only orchestration
differs. Announce the degradation. Stamp `<runId>` = `hunt-<UTC>` (`date -u`).

## Pre-checks (main thread)
A stack profile exists (`docs/agents/CONTEXT-MAP.md` or `docs/agents/stack.md`); confirm `scope`
(`all` | `<context>` | `<path>`) with the user.

## 1. Probe (spawn one read-only prober per lens)
Spawn `Agent`s (a read-only reviewer type, e.g. `code-reviewer`) — one per lens, over the scope:
boundary/edge · error/concurrency/**idempotency** · state-matrix gaps · property/fuzz · **UI via
Playwright iff the stack's `has_frontend: true`**. Each returns candidate defects with `file:line` + a
named failure mode. (Fast path runs these in parallel; here, sequentially.)

## 2. Verify (an INDEPENDENT reproduce-verifier per candidate)
For each candidate, spawn a DIFFERENT agent than the prober: try to build a **FAILING test at the seam**
that reproduces it. Reproduced → keep (attach the failing test as evidence). Not reproduced → drop as
"suspected". Never let the prober verify its own find.

## 3. File (dedup + route)
Dedup reproduced defects against open `.scratch/*/issues/`. File each into
`.scratch/<area>/issues/<NN>-<slug>.md` (`## What` · `## Acceptance criteria` (Gherkin, anchored on the
repro) · `## Blocked by` · `Status:` · `Context:`):
- clear, intent-unambiguous defect → `ready-for-agent` (the repro is its acceptance test);
- reproduced-but-intent-unclear **OR contradicts a characterization pin** → `needs-triage` (ALWAYS — a
  human decides established behaviour).
Remove any temp repro files you created (the repro lives in the issue). Report at `.scratch/hunts/<runId>.md`
(lenses · reproduced · filed ready/triage · suspected).

## After it returns
Point the user at the filed issues to `/sdlc triage` / scope-in, then `/sdlc run`.
