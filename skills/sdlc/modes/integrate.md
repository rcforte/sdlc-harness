# /sdlc integrate <feature | slice set> — pre-merge full-stack integration gate (§13.L)

The pre-merge gate for a **multi-context** change: assemble its `done` slices on a throwaway
`integration/<name>` branch, run the full-stack e2e, and report a **merge verdict**. You invoke
the **Workflow tool** (the required opt-in). A human types `/sdlc integrate`; an agent never
self-starts it. The harness **assembles + tests + reports**; the **human merges** — the harness
never merges to the default branch.

Two selection forms:
- **Feature** — a cohesive feature whose slices all live under `.scratch/<feature>/issues/`.
- **Explicit slice set** — an ad-hoc cross-context set that shares no feature slug (e.g. a pair from
  the `triage` bucket, like a backend status-mapping slice + its frontend consumer). Name the exact
  issue ids; the gate integrates only those. This exists because a cross-context *triage* pair would
  otherwise have no automated pre-merge gate (a bare `integrate triage` would treat every `triage/NN`
  as one feature and fail on the already-merged ones).

Why this gate exists: `/sdlc run` verifies each slice in **isolation** (cross-context seams mocked,
§13.K/K4), so a cross-context contract break (frontend expects a REST field the backend renamed) is
invisible to every isolated baseline and to the next pre-flight. This gate is the only thing that
runs the real, integrated stack before the feature lands.

## Pre-checks (main thread, before invoking)
- The slices exist: for a **feature**, `.scratch/<feature>/issues/` exists; for an **explicit set**,
  each named `<feature>/<NN>-<slug>` issue file exists. If not → unknown; stop.
- **Every** in-scope slice has a `slice/<feature>/<NN>-<slug>` branch marked `Status: done` **on that
  branch** (the engine records `done` on the slice branch, not the queue copy on the default branch).
  If a slice branch is missing or not done there → incomplete; stop and name the unfinished slice(s).
  (For the explicit form, this is only the named slices — not the whole bucket.)
- The slices span **≥2 distinct `Context:` values**. If single-context → no integration gate is
  needed (its isolated slice tests already suffice); say so and stop.
- The working tree is clean (the gate assembles branches and brings the stack up).

## Engine selection — fast path vs fallback
First check whether the **`Workflow` tool** is available (older Claude Code lacks it):
- **Available → fast path.** Call the `Workflow` tool with `scriptPath: <skill-base-dir>/integrate.workflow.js`
  (the base directory of THIS skill from the invocation banner — **do NOT hardcode `~/.claude`**) and
  **either** form:
  - Feature: `{ "feature": "<feature-slug>", "runId": "integrate-<UTC timestamp>" }`
  - Explicit set: `{ "issues": ["<feature>/<NN>-<slug>", ...], "label": "<short-name>", "runId": "integrate-<UTC timestamp>" }`
    — `label` names the `integration/<label>` branch + report (defaults to `adhoc`). Provide `feature`
    **or** `issues`, not neither.
- **Not available → fallback.** Read `modes/integrate.fallback.md` and follow it (assemble → full-stack
  e2e → verdict, from the main thread).

**Stamp `runId` yourself** (e.g. `integrate-20260628T1700Z`) — the sandboxed script can't read the
clock, and it's the report filename.

The Workflow runs in the background (§13.L): assemble `integration/<feature>` off **current** main +
merge the `done` slices in `Blocked by` order → `./start.sh` → `./run_tests.sh --headless` →
`./stop.sh` (always) → verdict.
- **GREEN:** `integration/<feature>` is the human's **merge candidate** — an atomic feature landing
  (what was tested == what lands).
- **RED:** escalate-only — a report at `.scratch/integrations/<feature>-<runId>.md` (failing specs +
  assembled SHAs), the `integration/<feature>` branch **retained** for diagnosis, slices left `done`
  (the fix-location is a human/product call). **No auto-repair.**

## After it returns
The workflow returns the working tree to the **default branch** (the `integration/<name>` branch is
retained but no longer checked out — so your follow-up commits don't land on it). Summarize the verdict.
On **GREEN**, point the user at `integration/<feature>` to review + merge. On **RED**, point them at the
integration report + the retained branch; they diagnose which slice owns the broken contract, repair it
(re-`done` via `/sdlc run`), and re-run `/sdlc integrate <feature>`.
