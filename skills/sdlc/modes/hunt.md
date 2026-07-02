# /sdlc hunt [<scope>] — autonomously hunt bugs, reproduce, file (Workflow)

The **autonomous intake** Workflow (the second Workflow alongside `run`): parallel adversarial probers
find candidate defects, an **independent verifier reproduces each as a failing test**, and reproduced
defects are filed. `hunt` *produces* issues; `run` *consumes* them. You invoke the **Workflow tool** —
legitimate because this mode says so (the required opt-in); an agent never self-starts a hunt.

**Prerequisite:** `/sdlc onboard` (hunt needs the seam + the characterization net as ground truth).

## Pre-checks (main thread, before invoking)
- A stack profile exists (`docs/agents/CONTEXT-MAP.md` or `docs/agents/stack.md`).
- Confirm **scope** with the user: the whole repo (default), a single context, or a path/module.

## Engine selection — fast path vs fallback
First check whether the **`Workflow` tool** is available (older Claude Code lacks it):
- **Available → fast path.** Call the `Workflow` tool with:
  - `scriptPath`: `<skill-base-dir>/hunt.workflow.js` (the base directory of THIS skill from the
    invocation banner — **do NOT hardcode `~/.claude`**).
  - `args`: `{ "scope": "<all | context | path>", "runId": "hunt-<UTC timestamp>" }`
- **Not available → fallback.** Read `modes/hunt.fallback.md` and follow it (probe → verify → file, from
  the main thread via the `Agent` tool, sequential/foreground).

**Stamp `runId` yourself.** It runs (fast path: in the background) and does, deterministically (§13.H):
- **probe** — parallel **read-only** probers, one per lens (boundary/edge · error/concurrency/
  idempotency · state-matrix gaps · property/fuzz · **UI via Playwright iff `has_frontend`**) → candidate
  defects.
- **verify** — an **INDEPENDENT** reproduce-verifier (not the prober) tries to build a **FAILING test at
  the seam** for each candidate; reproduced → keep (the failing test is attached); not → dropped/
  "suspected."
- **file** — **dedup** against open `.scratch` issues; file each reproduced defect — a clear,
  intent-unambiguous defect → `ready-for-agent` (the repro is its acceptance test); reproduced-but-
  intent-unclear **OR contradicts a characterization pin** → `needs-triage` (always — established
  behaviour needs human judgment). Report at `.scratch/hunts/<runId>.md`.

## After it returns
Summarize: lenses probed · reproduced · filed (`ready-for-agent` vs `needs-triage`) · suspected
(dropped). Point the user at the filed issues to **`/sdlc triage` / scope-in**, then `/sdlc run`. `hunt`
also **promotes `onboard`'s `needs-triage` anomalies** by reproducing them, and a hunt-found fix is the
authorized path to revise a characterization pin (the conflicting pin self-reveals when the fix lands).
