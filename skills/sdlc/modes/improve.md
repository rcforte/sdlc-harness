# /sdlc improve [<target>] — scope codebase improvements into queued issues

The interactive **scope-in** on-ramp for IMPROVEMENT work — refactors, module deepening, code-quality,
architecture — distinct from `feature` (user value) and `fix`/`qa` (a defect). A parallel multi-lens
audit surfaces candidates; the **human picks**; picks become issues. Architecture upkeep, run as a
separate command, **not** inside the build loop.

**Prerequisite:** `/sdlc onboard` (improvement leans on the characterization net as a safety floor — a
refactor that changes observable behaviour must self-reveal).

## Process (main thread)
1. **Audit — parallel lenses.** Fan out independent **read-only** reviewers over the `<target>` (a
   path, a module, or recent diffs; default: the whole onboarded context), one per lens:
   - **Clean Code** (Robert C. Martin) · **DDD** (aggregate/boundary fidelity, ubiquitous language) ·
     **modern idioms** (Java 21 / TypeScript / Python per the stack) · **algorithms & data structures**
   - and **only if `has_frontend`** — a **UX** lens.
   Use the `code-reviewer` / `architect-critic` personas; **every finding cites `file:line` + a NAMED
   principle**. (Mirrors `/review` + `/improve-codebase-architecture`.) ADVISORY — these have no
   executable oracle.
2. **You pick.** Present the **deduped** findings grouped by lens + severity. The human SELECTS what to
   act on — Clean-Code/architecture judgments are opinionated, so the selection IS the gate, never an
   agent's say-so.
3. **Issues.** Turn each picked finding into a thin, independently-shippable slice in
   `.scratch/<area>/issues/<NN>-<slug>.md`: `## What` · `## Acceptance criteria` (Gherkin when it has an
   observable; else a crisp done-definition **plus** "the characterization net stays green") ·
   `Context:` (resolved vs `CONTEXT-MAP.md`) · `## Blocked by`. Publish picks as `ready-for-agent`;
   un-picked candidates → drop or `needs-triage`.

## Hand-off
Review the issues (the scope-in gate) → `/sdlc run`. **Safety floor:** a refactor that changes
observable behaviour trips a `*Characterization*` test — that is STOP-and-decide for the developer/
tester, not a test to edit green.
