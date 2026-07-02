# /sdlc integrate — main-thread fallback engine (no `Workflow` tool)

Use ONLY when the `Workflow` tool is unavailable. Reproduces `integrate.workflow.js` from the **main
thread** — you run the git assembly + the stack + the e2e yourself (foreground). Same §13.L gate; the
harness assembles + tests + reports, **the human merges**. Stamp `<runId>` = `integrate-<UTC>`.

## Pre-checks (main thread)
Resolve the slice set — **either** a `feature` (all `slice/<feature>/<NN>` branches) **or** an explicit
`issues` list (`<feature>/<NN>-<slug>` ids). Each named slice's branch must exist and be `Status: done`
**on that branch**; the slices must span **≥2 distinct `Context:` values** (else no gate is needed — say
so and stop); the working tree must be clean. Pick a `<name>` (the feature slug, or a label for an
explicit set).

## 1. Assemble (main thread git)
Delete any existing `integration/<name>`; create a FRESH `integration/<name>` off the **current** default
branch; `git merge --no-edit` each done slice branch in `Blocked by` topological order. A conflict →
`git merge --abort`, write a RED report naming the conflicting slice, stop (do not merge to the default
branch).

## 2. Full-stack e2e (main thread)
On `integration/<name>`: bring the whole stack up (the repo's start script), run the whole e2e suite
against the real running stack, then ALWAYS tear the stack down (even on failure). Capture pass/total/
failing-specs.

## 3. Verdict + restore
- **GREEN** (every spec passed): `integration/<name>` is the human's **merge candidate** — an atomic
  feature landing. Write `.scratch/integrations/<name>-<runId>.md` (GREEN, assembled SHAs, next action:
  review + merge).
- **RED:** escalate-only — write the report (failing specs, assembled SHAs), **retain**
  `integration/<name>` for diagnosis, leave slices `done`; NO auto-repair.
- Either way, **`git switch` back to the default branch** before you finish (retain the integration
  branch; just move the checkout, so your next commits don't land on it).

## After it returns
Summarize the verdict; on GREEN point the user at `integration/<name>` to review + merge (the harness
never merges); on RED point them at the report + retained branch to diagnose → repair → re-run.
