# /sdlc onboard — brownfield adoption

Make an **existing** repo ready for the harness by characterizing its *current* behavior
rather than scaffolding a skeleton. The brownfield twin of `/sdlc setup`. **Contract: when you
finish, `/sdlc run` pre-flight passes** — a git repo, clean tree, `docs/agents/stack.md`
present, and `commands.test` GREEN (existing-green + the new characterization net).

Interactive; a human is present (you stop at the checkpoints below). One conversation,
conducting skills + a read-only `Explore` fan-out — **not** a Workflow. **Prerequisite for
`/sdlc improve` and `/sdlc hunt`** on existing code. The trust model + characterization
semantics are locked in `PLAN.md` §13.G (OB1–OB4) and the build spec in §13.J; this file is the
procedure.

## Idempotency gate (check first)
- **`docs/agents/stack.md` present** → already onboarded (or `setup` ran). Report it and
  **stop**; point the user at `/sdlc feature` / `improve` / `hunt`. Do not re-characterize.
- **Absent, but `CLAUDE.md` / `CONTEXT.md` / `docs/adr/` exist** → normal onboard;
  **merge, never clobber** those (step 4).
- **Has real code but no harness docs** → full onboard from inference.
- **No real code/behavior to characterize** → this is greenfield; redirect to `/sdlc setup`.

Repo *growth after* onboarding is **not** a re-onboard — later slices pin new code lazily (OB4).

**Multi-context / monorepo:** onboard **one bounded context per run** — scope `commands.*` to that
module (e.g. `mvn -f backend/pom.xml test`) and pin that context's seam. Whole-repo multi-context
(`CONTEXT-MAP.md`) is deferred (PLAN §10); note the un-onboarded contexts in the report.

## 1. Explore — read-only fan-out → Checkpoint A
Fan out parallel `Explore` subagents (read-only), one per lens, each returning a structured
digest:
- **stack/build** — languages, frameworks, build tool, test runner, the `commands.*` values
- **test suite** — what exists; which tests are green vs red/flaky (feeds step 5 quarantine)
- **seam + entry-points** — the highest observable boundary + the public entry-point list
- **domain vocabulary** — terms for `CONTEXT.md`; existing CLAUDE.md/docs to seed from
- **anomalies** — behavior that contradicts a *stated* intent (doc / test-name / CLAUDE.md)

Discovery is read-only. **Characterization-test *generation* is not an `Explore` job** — it
happens in step 5, in the main thread or a `developer` subagent, after the human confirms.

**→ Checkpoint A:** present the findings — especially the **detected seam** and the
**entry-point list** — and get the human's confirm/correct before generating anything.

## 2. Config layer (shared with `setup`)
Conduct `/setup-matt-pocock-skills` — it writes `docs/agents/{issue-tracker,triage-labels,
domain}.md` + the CLAUDE.md `## Agent skills` block; default the tracker to **local-markdown**.
Seed its inputs from the existing repo/docs rather than greenfield defaults. Then add the
terminal **`done`** state to `triage-labels.md` (as `setup` does — it sits beyond Matt's five
intake roles and is set by the engine on a green commit).

## 3. Stack profile
Write `docs/agents/stack.md` from `~/.claude/skills/sdlc/templates/stack.md`, filled from the
**real build files + CLAUDE.md** (not house defaults): the YAML `commands` block (+
`has_frontend`) and the prose seam conventions. **`test` is mandatory**; omit optional commands
the stack lacks.

**`commands.test` must be a real oracle** — it must exit non-zero when a test fails. If the
repo's own command doesn't (a shell suite that always exits 0, a runner that can't build without
an absent toolchain), **build a wrapper that does** — or escalate if no green baseline is
achievable. Pre-flight and the `tester` rely on that exit code as ground truth. Prefer the
**fastest real oracle** — a component's unit/integration tests (e.g. on an in-memory DB), **not** a
heavy out-of-band e2e that needs Docker/browsers/a running stack. That e2e is a separate `e2e`
command, never the pre-flight baseline.

Record the **seam** (confirmed at Checkpoint A) in the "Test-seam conventions" prose. Pick the
**outermost observable boundary** by precedence:
1. **HTTP/RPC** service boundary
2. **CLI** — `argv → stdout/stderr/exit-code`
3. **Library** — the public API surface

**Single seam up front** (inner seams are deferred to OB4 lazy per-slice). If the top seam
isn't cleanly executably pinnable (GUI / needs a TTY / no stable surface), **drop one level; if
none is pinnable, ask the human.**

## 4. Domain + ADRs → Checkpoint B
Conduct `/domain-modeling` → `CONTEXT.md`. Reverse-engineer **load-bearing *and* evidenced**
ADRs only — cross-cutting, constrains future slices, costly to reverse — **capped to a handful**
(the founding decisions). Transcribe from a rich CLAUDE.md "locked decisions" where present;
infer from structure (tooling, module boundaries, dominant patterns) when bare. Each ADR =
context · decision · consequences.

**Merge, don't clobber:** if `CONTEXT.md` / `docs/adr/` already exist, seed from them and
propose only the gaps.

**→ Checkpoint B:** present the proposed glossary + candidate ADRs; get confirm/correct
**before** writing.

## 5. Characterization net + green baseline
Generate in the main thread / a `developer` subagent (OB1/OB2/OB3; trust model in §13.G):

**Enumerate evidence-driven** — the distinct happy-path scenarios that existing evidence already
demonstrates at the seam, **not** every public symbol. Un-evidenced public surface → a **logged
gap** (step 7 report), never a blanket signature-pinned smoke test.

**Already-pinned seam (rich brownfield).** If existing tests already characterize the seam
(green, at the same boundary), **adopt them as the evidence**: pin only the load-bearing golden
round-trips in the protected `*CharacterizationTest` namespace and **log the rest as covered** —
do not duplicate the whole existing suite. The net's value here is the marked namespace + the
green-baseline contract, not new coverage.

**Order-independent goldens.** When the seam shares a mutable/self-seeding test fixture (e.g. one
cached Spring context + in-memory DB that integration tests seed per-case), pin **contract-shaped**
goldens — status · response shape · error codes — that hold regardless of accumulated state, and
adopt data-valued behavior from the existing tests. Data goldens there are order-fragile.

**Per scenario:** derive the input by the evidence ladder — existing test › executable example ›
real call site › signature-derived; **no evidence at any tier → ask the human**. Run it, capture
the **actual current output**, and pin it as a **golden assertion** (bugs included — this is a
regression net, not a correctness claim). Output that contradicts a stated intent → still pin it
green **and** file a `needs-triage` anomaly (step 6).

**Placement:** under `…/characterization/`, named `*CharacterizationTest` (golden shell tests for
a non-xUnit stack). These are **never edited green** — the persona rule in `developer.md` /
`tester.md` treats a failing one as "you changed observable behavior — STOP and decide."

**Quarantine** the existing red/flaky tests: run the suite once (reds), re-run **once** (flips =
flaky). Exclude them from `commands.test` with a **reason linking** a single **batched**
`needs-triage` issue — by **tag/annotation** (xUnit) or, for a **monolithic/shell suite** with no
per-test selection, by an **allow-list in the test wrapper** (it passes iff the failing set ⊆ the
allow-list, so a *new* failure still goes red). Confirm the char-net runs inside `commands.test`.

**Majority-red guard:** if most existing tests are red (or the suite won't run at all), **STOP
and escalate** — report `<N>/<M>` red; do not mass-quarantine your way to a fake-green baseline.

## 6. Seed the backlog
`needs-triage` **only** — never `ready-for-agent` (that's the human's scope-in gate). Exactly
two sources:
- **anomalies** (intent-contradicting behavior) → **one issue each**
- **quarantined red/flaky tests** → **one batched issue**

**Gaps** (un-pinned surface) go in the report, **not** the queue — OB4 pins them lazily when a
slice touches them. **Do not seed features** — that's `/sdlc feature`.

## 7. Confirm + commit + report
Run `commands.test`; confirm **GREEN** (existing-green + char-net). Write
**`.scratch/onboard.md`**: detected stack · chosen seam · entry-points pinned · gaps logged ·
anomalies filed · tests quarantined · baseline status. **Commit every onboard artifact**
(`docs/agents/*`, any `CONTEXT.md`/ADR additions, the char-net, the report) so the **tree is
clean** — that is what makes pre-flight pass (mirrors `setup`'s "commit the skeleton"). If the
build/test cycle drops artifacts **in-tree** (not every stack has a gitignored `build/` dir),
**extend `.gitignore`** so a clean build+test leaves no stray files. `/sdlc status` surfaces the report.

Report to the user; point them at `/sdlc feature` (build new work) or `/sdlc improve` / `hunt`
(now unlocked).

**Out of scope here:** fuzzing (→ `hunt`), feature planning (→ `feature`), inner-seam pinning
(→ OB4 lazy per-slice). Persona/template edits are already done — `developer.md` / `tester.md`
carry the characterization rule and the `stack.md` template carries the `characterization/`
convention.
