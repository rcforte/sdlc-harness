# /sdlc fix "<bug>" — express lane for a single bug (intake + run fused)

The fast path: **reproduce → failing test → drive to green → scope-out**, in one go. Conversational
intake in the main thread (your invocation IS the scope-in gate), then it invokes the `run` engine for
that single issue. For SMALL, single-context bugs; a genuinely cross-context bug is a feature →
redirect. Converges on the same reproduce→test→fix→confirm invariant as `qa`/`hunt`.

**Prerequisite:** a stack profile (`docs/agents/CONTEXT-MAP.md` or `docs/agents/stack.md`).

## Process (main thread)
1. **Reproduce.** With the user, pin the bug to a concrete, observable failure. Conduct the `qa`
   discipline — reproduce it, then write a **FAILING test at the right seam** (the repro becomes the
   fix's acceptance test). No repro → it's not a fix yet (gather more, or file `needs-info` and stop).
2. **Frame one issue.** Write `.scratch/<feature|fixes>/issues/<NN>-<slug>.md`: `## What` ·
   `## Acceptance criteria` (Gherkin, anchored on the repro) · `## Blocked by` (usually none) · a
   `Context:` line resolved against `CONTEXT-MAP.md` (confirm with the user; default the single
   context) · `Status: ready-for-agent`. **If the bug spans ≥2 contexts, STOP** — it's a feature:
   redirect to `/sdlc feature` (decompose into per-context slices + `/sdlc integrate`).
3. **Run it.** Commit the issue (clean tree), then invoke `/sdlc run <issue-id>` (single-issue scope):
   the developer drives the failing test green, the tester confirms, commit lands on the slice branch.

## After it returns
Summarize shipped/escalated. **Blast-radius (N2):** if the diff touched a **published seam** (a REST
controller, `proto`, or the API surface a sibling context consumes per `CONTEXT-MAP.md`), warn the user
to run `/sdlc integrate <feature>` (or `./run_tests.sh`) before merging — the isolated per-slice test
can't catch a cross-context contract break. Otherwise it's a normal `slice/<…>` scope-out (human
reviews + merges; the harness never does).
