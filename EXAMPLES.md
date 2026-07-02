# Reference dogfood — battle-testing the harness

The `/sdlc` harness was developed and comprehensively battle-tested against a real multi-service repo
(a Spring Boot + Python-gRPC + React portfolio-management app) over a single extended session. Every mode
was driven end-to-end on real work, and the harness **found and fixed six of its own bugs** while
hardening that codebase. This is reference evidence — the specifics below are from that dogfood, not
requirements for your repo.

## Modes exercised (all ten)
| Mode | Exercised as |
|---|---|
| `setup` | greenfield probe → walking skeleton → green baseline, pre-flight-ready |
| `onboard` | characterized a 3-context repo (backend · analytics · frontend) |
| `feature` | full loop intake→build→integrate→merge, incl. a **proto shared-kernel** feature |
| `fix` | express lane (reproduce → failing test → green → scope-out) |
| `improve` | 4-lens parallel audit → human-picked → refactor chain, characterization-net-guarded |
| `hunt` | 2 passes: 15 + 15 reproduced defects, independently verified as failing tests |
| `qa/triage` | routed dozens of issues against a domain model + ADRs |
| `run` | ~13 runs incl. an 11-slice `Blocked by` chain |
| `integrate` | 5 gates incl. the ad-hoc `issues:[…]` form + a RED→fix→GREEN cycle |
| `status` | read-only queue/run/readiness report |

## Special paths proven
- Multi-context concurrent lanes; deep `Blocked by` chains (up to 11 slices stacked).
- **Shared-kernel / proto stacking** — a cross-context slice based on its blocker's branch so it compiles
  against regenerated stubs.
- The ad-hoc `integrate {issues:[…]}` assembly form.
- Cold-start-**deterministic** full-stack e2e (serial + retries) as the integrate gate's oracle.
- The post-run slice-isolation integrity check (each shipped slice's branch ≥1 ahead of its base).

## Six self-found harness bugs (found while dogfooding, all fixed)
1. **Lane isolation** — first-issue-in-lane committed to the default branch instead of its slice branch.
2. **Integrate couldn't gate an ad-hoc cross-context slice set** — added the `issues:[…]` form.
3. **e2e non-determinism** blocked a trustworthy integrate verdict — run the suite in CI mode
   (serial + retries).
4. **Integrate left the working tree on the integration branch** — restore to the default branch.
5. **Shared-kernel (proto) changes didn't fit the per-context-lane base rule** — added the
   `Shared-kernel:` base exception.
6. **The isolation integrity guard false-positived** when a human committed to the default branch mid-run
   — rewritten to the precise per-slice signature.

## Takeaway
The core loop (`run`) self-corrected a real isolation bug; the integrate gate went RED → fix → GREEN on a
real feature; and the intake modes (`feature`/`fix`/`improve`/`hunt`) each shipped genuine, merged work.
The harness hardens the target codebase **and** hardens itself as you use it.
