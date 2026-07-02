# /sdlc run [<scope>] — drain the queue (autonomous, multi-context engine)

The deterministic execution engine. You invoke the **Workflow tool** with the run script — and
that is legitimate precisely because this mode instructs you to (the required explicit opt-in).
An agent never self-starts a run; only a human typing `/sdlc run` does.

## Pre-checks (main thread, before invoking)
- A stack profile exists: `docs/agents/CONTEXT-MAP.md` (multi-context) **or** `docs/agents/stack.md`
  (single-context). If neither → tell the user to `/sdlc setup` or `/sdlc onboard`, stop.
- Confirm **scope** with the user — one of:
  - **all** `ready-for-agent` issues across every context (default);
  - a **context name** (e.g. `frontend`) to drain only that context's queue;
  - a single **`<issue-id>`** (`<feature>/<NN>-<slug>`) — the `fix` express lane's form.

## Engine selection — fast path vs fallback
First check whether the **`Workflow` tool** is available to you (older Claude Code lacks it):
- **Available → fast path.** Call the `Workflow` tool with:
  - `scriptPath`: `<skill-base-dir>/run.workflow.js` — the base directory of THIS skill, given at
    invocation as *"Base directory for this skill: …"*. **Do NOT hardcode `~/.claude`** (breaks
    `--project` installs); use the provided base dir.
  - `args`: `{ "scope": "<all | context-id | issue-id>", "runId": "run-<UTC timestamp>" }`
  - **Stamp `runId` yourself** (e.g. `run-20260625T1430Z`) — the sandboxed script can't read the clock,
    and it's the run-report filename.
- **Not available → fallback.** Read `modes/run.fallback.md` in this skill and follow it: the SAME
  pre-flight → per-issue `developer → tester → N≤2 bounce → commit | escalate` → integrity loop, driven
  from the main thread via the `Agent` tool (sequential, foreground, no parallel lanes/journal/budget).

The Workflow runs in the background and does, deterministically (§13.K):
**pre-flight** — tree clean + resolve each `ready-for-agent` issue's `Context:` against
`CONTEXT-MAP.md` to its per-context stack profile (single-context repos use `stack.md` as the
`default` context) + run a green `commands.test` baseline **once per touched context** + topo-sort
the buildable queue (HALT on a dirty tree, any red baseline, or an unknown `Context:`). Then the buildable issues drain as **per-context lanes running concurrently** (§13.M —
worktree-isolated agents, cross-lane `Blocked by` sync); within a lane each issue is routed to its
context's stack profile: `developer → tester`, **N ≤ 2** bounce → **commit on
pass** (developer owns git; same-context blocker → branch off the blocker's slice, cross-context → off
the default branch, K9) / **escalate** to `ready-for-human` + skip dependents on refute. Each slice is
verified in ISOLATION by its context's `commands.test` only — the full-stack e2e is **not** run here
(it's the separate `/sdlc integrate` gate, §13.L). A run report lands at `.scratch/runs/<runId>.md`.

## After it returns
Summarize from the result: **shipped** (`context · branch @ sha`), **escalated** (+ unresolved
defects), **skipped** (+ reason). Point the user at the run report and the `slice/<…>` branches for the
**scope-out** review — the human merges; the harness never does. If any shipped feature's slices span
**≥2 contexts**, remind the user a pre-merge **`/sdlc integrate <feature>`** gate (§13.L) is owed
before merging — the isolated per-slice tests cannot catch a cross-context contract break.

## Shared-kernel (proto) dependencies

A cross-context blocker is normally **mocked at the seam** (the dependent builds off the default branch,
§13.K4). That breaks when the blocker changes a **shared published contract both sides compile against** —
e.g. a new gRPC RPC in `proto/`: the dependent can't compile against a mock of a stub that doesn't exist
yet. Mark such a blocker issue with a **`Shared-kernel:` line** (e.g. `Shared-kernel: proto`); pre-flight
then bases its cross-context dependents off the blocker's slice branch (stacking them) so they compile
against the regenerated stubs, instead of off the default branch.
