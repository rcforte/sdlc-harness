# SDLC Harness — Design & Build Plan

**Status:** Approved design (grilled 2026-06-22). Ready to build.

**Vision:** A reusable, autonomous SDLC harness. **Four intake on-ramps** feed **one
deterministic build→verify→commit engine**, gated by a human at **scope-in** (what
enters the queue) and **scope-out** (what merges). It *conducts* Matt Pocock's
engineering skills and the repo's persona agents rather than re-implementing them.

**First product applied:** `pilates` (real product, greenfield, Java 21 + Spring /
React 19 + TS). The harness is global (`~/.claude`); pilates is its first dogfood target.

---

## 1. Goals / Non-goals

**Goals**
- Organized, consistent, methodical SDLC that produces good-quality products.
- Autonomous execution of the build *middle*; human judgment at the *ends*.
- Reuse across products of differing stacks.
- Quality via **independent executable verification** (generator ≠ verifier).

**Non-goals (v1 — designed-for, deferred):**
- Parallel slice execution (worktrees).
- GitHub PR / CI integration.
- Fully unattended scheduling (`/schedule` / `/loop`).

---

## 2. Architecture — four front doors, one engine, two human gates

```
  INTAKE ON-RAMPS  (interactive · scope-IN)            SHARED CORE                  scope-OUT
 ┌───────────────────────────────────────────┐
 │ feature   grill → to-prd → to-issues       │─┐
 │ onboard   explore → CONTEXT/ADR/stack      │ │
 │           + char-net + seed backlog        │ ├─▶ .scratch/ QUEUE ─▶  run  ─▶ branches ─▶ human
 │ improve   3-lens audit → human pick        │ │   (ready-for-agent)  (Workflow)  slice/<id>  reviews
 │ hunt      adversarial → reproduce → file   │ │                          │       + run report  diffs
 │ qa/triage you report / process incoming    │─┘                          ▼
 └───────────────────────────────────────────┘     per issue: developer → tester → N≤2 → commit│escalate

 Dependency: onboard (once, existing code) ──prerequisite──▶ improve / hunt
 Every door ends at the same queue → same run → same scope-out review.
```

---

## 3. Execution engine — `/sdlc run` (deterministic Workflow)

The autonomous middle. A Workflow script; the model's judgment lives *inside* each
subagent, the *process* around it is fixed and reproducible.

**Inputs:** scope (all `ready-for-agent`, or a single issue id for `fix`); token budget.

**Pre-flight (halt before building if any fail):**
- Stack profile present (`docs/agents/stack.md`).
- Repo's `test` command runs green on a clean tree (baseline oracle exists).
- Working tree clean.
- Resolve `Blocked by` graph; drop issues whose blockers aren't `done`.

**Order:** topological sort by `Blocked by`; **sequential** (v1).

**Per issue:**
1. Branch `slice/<issue-id>` off `main`.
2. **`developer` subagent** (fresh context) — fed the issue + PRD + `CONTEXT.md`/ADRs +
   stack profile. Builds via `/implement` → `/outside-in-tdd` at agreed seams; self-`/review`.
   For a *bug*, the reproduction failing-test **is** the outer acceptance test.
3. **`tester` subagent** (fresh, independent — did not build it) — maps AC → checks; runs
   the stack profile's `test`/`e2e`; probes edges. Emits structured VERDICT (pass/score/defects).
4. VERDICT refutes & attempts < **N = 2** → feed defects back to `developer`; repeat.
5. Pass → commit `slice/<id>` (message references the issue); mark issue `done`; record SHA.
6. Still red after N → **escalate**: flip label `ready-for-agent → needs-human`, write report,
   leave the branch unmerged, **skip dependents**.
7. Append a row to the run report.
8. Budget check; stop the run cleanly if exhausted.

**Output:** `.scratch/runs/<runid>.md` (header + per-slice: issue, attempts, verdict, SHA,
escalations) + an end-of-run summary (shipped / escalated / skipped). Resumable via Workflow `runId`.

**Stop conditions (escalate, never push through):** tester refute after N · requirement
ambiguity (ask, don't guess) · budget hit · pre-flight failure · scope drift (propose re-slice).
**On escalation: skip-and-continue** (independent issues proceed; dependents auto-skip);
one end-of-run summary.

---

## 4. On-ramps (each *conducts* existing skills; each ends in queue issues)

- **`feature "<idea>"`** — interactive. Conduct `grill-with-docs` (or `grill-me` if greenfield)
  → `to-prd` → `to-issues`; publish vertical tracer-bullet issues as `ready-for-agent`.
  Context hygiene: one unbroken window through `to-issues`; each slice then builds in a fresh subagent.
- **`onboard`** — interactive, **once** per brownfield repo; **prerequisite for `improve`/`hunt`** on
  existing code. Explore (fan-out) → detect & write **stack profile** → `domain-modeling` → `CONTEXT.md`
  → reverse-engineer **load-bearing ADRs** → **highest-seam characterization net** (pins *current*
  behavior incl. bugs — a regression net, not a correctness assertion) → seed backlog. Deeper areas are
  characterized *lazily*: each later slice writes its char/regression test as its outside-in-TDD
  acceptance test before changing code.
- **`improve`** — interactive selection. Parallel lenses: **arch** (`improve-codebase-architecture`),
  **code** (`code-reviewer` + `code-simplifier`), **UX** (`ux-auditor` + `ux-*`; skipped when stack
  profile has no frontend). → consolidated ranked report (Strong/Worth-exploring/Speculative) → **human
  picks** → `to-issues` / `request-refactor-plan` → `ready-for-agent`. (Refactors are discretionary, so a
  human curates.)
- **`hunt`** — semi-auto. Parallel adversarial probers (boundary/edge, error/concurrency/idempotency,
  state-matrix gaps, property/fuzz, UI via Playwright if FE). Each candidate must **reproduce executably**;
  confirmed bugs filed via `qa` **with repro + failing test** (clear defect → `ready-for-agent`; ambiguous
  → `needs-triage`); unreproduced candidates dropped or logged "suspected." The repro becomes the fix's
  acceptance test.
- **`qa`** — interactive. Conduct Matt's `qa`: *you* report a bug → reproduce → failing test → file
  (`ready-for-agent` / `needs-triage`). The human twin of `hunt`.
- **`triage`** — conduct Matt's `triage`: process incoming / piled-up issues through the state machine.
- **`fix "<bug>"`** — express lane: `qa` + `run` fused for one bug — reproduce → failing test → drive to
  green → `tester` confirms → commit, inline and immediately. Same loop, no batch wait.

**Invariant across every bug path (human- or agent-found):** reproduce → failing test → fix → tester-confirm.
No bug is "fixed" without a test that first failed because of it and now passes.

---

## 5. Invocation surface — umbrella `/sdlc <subcommand>`

A router-skill that dispatches on the first word (`/sdlc` with no arg = router, `ask-matt`-style).

| Command | Kind | Role |
|---|---|---|
| `setup` / `onboard` | once per repo | greenfield config / brownfield adoption + safety net |
| `feature "<idea>"` | intake (scope-in) | conduct grill→prd→issues |
| `improve` | intake (scope-in) | 3-lens audit → you pick |
| `hunt` | intake (semi-auto) | agent finds bugs → reproduce → file |
| `qa` / `triage` | intake | you report a bug / process incoming |
| `fix "<bug>"` | intake + run | express lane: one bug, inline |
| `run` | **autonomous** | drain `ready-for-agent` → branches + report |
| `status` | read-only | queue + last run report |

Naming is bikeshed (`/sdlc` matches "sdlc workflow harness"; `/ship`/`/harness` also fine).

---

## 6. Locked decisions (grilling log)

1. **Reusable global harness**; pilates = first dogfood.
2. **Supervised autonomy** — human gates scope-in (`ready-for-agent`) + scope-out (merge); autonomous middle.
3. **Pure-Matt artifacts** — PRD → issues → agent-brief (issue comment) + `CONTEXT.md`/ADRs. No `specs/`, no Feature Briefs, no committed brief.
4. **Independent executable oracle** — `tester` verdict is authoritative; N-bounce then escalate; critics advisory.
5. **Hybrid engine** — conversational planning (intake) + deterministic Workflow (execution) + human scope-out.
6. **Single builder** — one `developer` per slice via `/implement`; only `developer` + `tester` live in the loop. Architecture is settled in planning, not re-litigated per slice.
7. **Stack-agnostic personas** + per-repo **stack profile**; house default Java 21 + Spring / React 19 + TS.
8. **Sequential** dependency-ordered execution (v1); parallel deferred.
9. **Stop conditions** — refute(N=2) / ambiguity / budget / pre-flight / scope-drift → **skip-and-continue**, auto-skip dependents, one end-of-run summary.
10. **Local-markdown** queue (`.scratch/`), branch-diff scope-out; no `gh` dependency (v1).
11. **Committed run report** at `.scratch/runs/<runid>.md`.
12. Architecture improvement = **separate upkeep** command, not in the build loop.
13. Full harness in v1 (built in dependency-sequenced stages).
14. **Suite = 1 shared engine + intake on-ramps**; `onboard` gates `improve`/`hunt` on existing code.
15. **Umbrella `/sdlc`** command; intake interactive, `run` autonomous; conducts Matt's skills (no duplication).
16. **`onboard`** = highest-seam characterization baseline + lazy per-slice characterization.
17. **`improve`** = parallel 3-lens audit + human-gated selection; UX skipped if no FE.
18. **`hunt`** = reproduce-before-file; defects auto-queue, ambiguous → triage; repro = fix's acceptance test.
19. **Human bug intake** = `qa` + `triage`; `fix "<bug>"` express lane; all converge on the reproduce→test→fix→confirm invariant.
20. **pilates** = real product, house stack, first to run through the harness.

---

## 7. File layout

**Global (the harness):**
```
~/.claude/skills/sdlc/
  PLAN.md                 ← this doc
  SKILL.md                ← umbrella router (to build)
  modes/{setup,onboard,feature,improve,hunt,qa-triage,fix,run}.md   ← per-mode refs (to build)
  run.workflow.js         ← execution Workflow script (to build)
~/.claude/agents/developer.md, tester.md   ← edit: de-hardcode stack, read profile
```

**Per-repo (written by `setup`/`onboard`):**
```
docs/agents/issue-tracker.md   (local-markdown), triage-labels.md,
            stack.md           (profile: languages, frameworks,
                                commands{build,test,test-one,e2e,lint,run,typecheck},
                                test-seam conventions, prior-art locations, has-frontend),
            domain.md
CONTEXT.md, docs/adr/
.scratch/<feature>/*.md        ← issues (the queue)
.scratch/runs/<runid>.md       ← run reports
branches: slice/<issue-id>
```

---

## 8. Deliverables

- Umbrella router `SKILL.md` + per-mode reference files (progressive disclosure).
- `run.workflow.js` — the deterministic execution engine.
- De-hardcoded `developer.md` + `tester.md` (read the stack profile).
- `setup` writing the per-repo config incl. the **stack profile**.

---

## 9. Build order (dependency-sequenced; dogfood checkpoint after each — the harness eats its own walking-skeleton rule)

1. **Core engine + `feature` + `setup` + de-hardcoded personas** → dogfood **one trivial slice on pilates**
   (proves developer → tester → N-bounce → commit → run report end-to-end).
2. **`onboard`** → dogfood by onboarding an existing repo (`db` or `awk`).
3. **`improve` + `hunt` (+ `qa`/`triage`/`fix`)** → dogfood on the onboarded repo.

---

## 10. Deferred (designed-for, not v1)

GitHub PR/CI adapter · unattended `/schedule`/`/loop` around `/sdlc run` (full-AFK).

**Un-deferred** (design validated, grilled 2026-06-28; awaiting the build): multi-context engine
(§13.K) · full-stack integration gate `/sdlc integrate` (§13.L, **pre-merge**, feature-level) ·
parallel slices via per-context-lane worktrees (§13.M, lowest priority).

---

## 11. Open product question

**What is `pilates` as a product?** (domain, core user, first capability) — deliberately *not* a harness
decision. It is the input to the **first `/sdlc feature`** run, which will grill it into a PRD + issues.

---

## 12. Best-practices traceability

| Requirement | Where it lives |
|---|---|
| **Boris / Claude Code** | tight per-repo `CONTEXT.md`/stack profile; executable feedback loop; small steps + commit-per-slice; human at high-leverage ends; skills + Workflow + subagents; plan/grill before code |
| **Agentic** | generator ≠ verifier (`tester` + reproduce-before-file); context isolation (fresh subagent per slice); deterministic orchestration; loop-until-verified with bounded repair |
| **SDLC** | story-mapped PRDs; vertical tracer-bullet slices; characterization safety net (Feathers); ADR memory; sequential green-on-green history |
| **Product** | `product-owner`/`to-prd` framing (user value, walking skeleton first); discretionary work human-curated |

---

## 13. Implementation decisions (grilled 2026-06-22 → 06-27)

**Status:** Resolved via `/grill-me`. This section is the **build spec** for v1 — it
refines §3–§9 with the concrete calls needed to write code. Where it sharpens a §6
locked decision, it says so.

### A. Scope & sequencing
- **Full v1**, built in §9 dependency order — the **spine** (engine + `feature` +
  `setup` + de-hardcoded personas) lands and is dogfooded **before** the
  `onboard`/`improve`/`hunt` on-ramps. Spine-first is how full-v1 avoids big-bang.
- **Dogfood target** = a throwaway `health-check` slice (*GET /health → 200*) in a
  freshly `git init`'d pilates. "What is pilates" (§11) is deferred to the first real
  `feature` run, *after* the spine is proven.

### B. The `run` engine (sharpens §3)
- **The Workflow script is pure control flow.** Its sandbox has no filesystem, shell,
  or git — it can only spawn subagents via `agent()`. **Every side effect runs inside a
  subagent.**
- **Pre-flight agent** (one call, structured output): working tree clean → run
  `commands.test` for a green baseline → read `.scratch/*/issues/*.md`, resolve
  `Blocked by`, topo-sort the `ready-for-agent` set → drop issues whose blockers aren't
  `done`. Any failure → script halts.
- **Per issue, sequential, N≤2 bounce:**
  - `agent({agentType:'developer'})` — fed issue + PRD + CONTEXT/ADRs + stack profile.
    **Developer owns git:** branch `slice/<feature>/<NN>-<slug>` step 1; build via
    `/outside-in-tdd`; self-`/review`; **commit on green last**, then set the issue
    `Status: done — <branch> @ <sha>`.
  - `agent({agentType:'tester', schema: VERDICT})` — independent verify; validated
    `pass/score/defects`.
  - `pass=false` & attempts<2 → re-spawn developer with the defects; else **escalate**
    (`Status: ready-for-human`, write report, skip dependents).
- **Run report**: script accumulates rows in memory; a **final agent** writes
  `.scratch/runs/<runid>.md`. Sequential only; `VERDICT` schema = the one in `tester.md`.

### C. Stack profile & CLAUDE.md layering
- **`docs/agents/stack.md` is the parsed source of truth** for machine-critical values,
  read only by *agents* (never the script). Hybrid: a **YAML fenced block** for
  `commands.*` + `has_frontend`; **prose** for `test-seam conventions` + `prior-art`.
  `test` is the **only mandatory** command; a missing optional → the agent skips that
  check and says so.
- **Layer-don't-merge with CLAUDE.md.** CLAUDE.md = ambient, auto-loaded
  **override/index/bar** layer (authoritative for behavior/style/quality bar — the
  ux-auditor already reads the "CLAUDE.md UX bar"); `docs/agents/*` + `CONTEXT.md` +
  `docs/adr/` = authoritative **parsed** sources. **stack.md wins** for parsed values;
  `setup` writes a **pointer** into CLAUDE.md, never duplicated command values;
  `onboard` **seeds** stack.md/CONTEXT.md/ADRs by reading CLAUDE.md; if stack.md is
  absent, pre-flight **falls back** to CLAUDE.md/the repo and warns.
- pilates authored **backend-only** (`has_frontend: false`) until a frontend exists;
  pilates gets **its own CLAUDE.md** (today it only inherits the unrelated home-dir one).

### D. Queue schema (conforms to the local-markdown tracker — no fork)
- Layout (existing): `.scratch/<feature-slug>/PRD.md` + `issues/<NN>-<slug>.md`; body
  `## What to build` · `## Acceptance criteria` · `## Blocked by` · a `Status:` line ·
  `## Comments`.
- **AC content = Gherkin** (developer's outer loop = "one scenario → one acceptance
  test"; tester maps AC→checks). Structure unchanged; content sharpened.
- **`Status:` line, not frontmatter** — one format across `to-issues`/`triage`/`qa`/
  engine. Escalation edits `ready-for-agent` → `ready-for-human`.
- **New terminal `done` state** (Matt's 5 labels are intake-only): developer sets
  `Status: done` + SHA on green commit → unblocks dependents, lets re-runs skip.
- **Issue id** = path stem `<feature-slug>/<NN>-<slug>`; `Blocked by` references it;
  **branch** = `slice/<feature-slug>/<NN>-<slug>`.

### E. Router (sharpens §5)
- **Thin `SKILL.md`** dispatches on the first arg word → `modes/<name>.md`; no arg →
  prints the subcommand map. A dispatcher, not a brain.
- **Three-way split:** intake (`setup`/`onboard`/`feature`/`improve`/`qa`/`triage`/
  `fix`) runs **conversationally in the main thread** (it *is* the scope-in gate);
  **`run` and `hunt` are background Workflows** (the only modes that call the Workflow
  tool — a skill instructing the agent to call Workflow is the required explicit opt-in,
  so an agent never self-starts one); **`status`** is read-only.

### F. Personas & bootstrap (sharpens §6.7, §8)
- **Surgical de-hardcoding:** replace literal commands (`./mvnw test`/`verify`,
  `./mvnw -q compile`) + seam locations in `tester.md`/`code-reviewer.md` with "resolve
  `commands.*` + seams from `docs/agents/stack.md`"; **keep house-default Java/Spring/
  React identity**. `developer.md` gets the same note. Minimal diff.
- **Contract: after `setup` (greenfield), pre-flight passes.** Greenfield setup leaves a
  **green walking-skeleton baseline** — `git init` + a minimal runnable app (pilates:
  one `@SpringBootApplication` + a context-loads test) + full `docs/agents/*` + the
  repo's own CLAUDE.md + a stub CONTEXT.md. The health-check issue is authored by the
  first `feature` run, not by setup.

### G. `onboard` characterization (brownfield analog; sharpens §4, §6.16)
- **Seam** = highest executable/observable boundary (library API / HTTP / CLI
  argv↔stdout). **Scope** = happy-path baseline up front + lazy per-slice deepening.
- **OB1 trust model** — **pin-but-flag**: pin observed current behavior (bugs included)
  as regression tests; emit suspected anomalies as `needs-triage`, never silently
  blessed. **Structural marking** (`characterization/` namespace / `*CharacterizationTest`).
  Cross-cutting persona rule: **a failing characterization test = "you changed observable
  behavior" = STOP-and-decide, never a test to edit green.**
- **OB2 generation** — **evidence-derived inputs**: existing tests › executable examples
  › real call sites › signature-derived happy-path. **No fuzzing — that's `hunt`.**
  Coverage = every public entry-point's happy path pinned + gaps **logged** (no %).
  "Anomaly" = behavior that **contradicts a stated intent** (doc/CLAUDE.md/CONTEXT.md/
  test-name), not "looks weird." **No evidence at all → ask the human** (onboard is
  interactive).
- **OB3 baseline** — **quarantine-and-flag** red/flaky existing tests (exclude from
  `commands.test`, file as `needs-triage`); post-onboard `commands.test` = existing-green
  + char-net. **Contract: after `onboard`, pre-flight passes.** **Escalate when
  mostly-red.**
- **OB4 lazy slice** — sharpen §6.16's "char test **as** the acceptance test" →
  "**before**": a brownfield slice (1) **pins the current behavior of the blast radius**
  (green), then (2) **outside-in-TDDs the change** (red→green). **The `tester` enforces
  it** — altering observable behavior with no net around the blast radius → failing VERDICT.

### H. `hunt` (sharpens §4, §6.18)
- **`hunt` is the second Workflow** (alongside `run`). Taxonomy is three: *interactive
  intake* (feature/improve/qa/triage) · **autonomous intake (`hunt`)** · *autonomous
  execution (`run`)*. `hunt` produces issues; `run` consumes them.
- **Reproduce-before-file:** parallel probers (boundary/edge · error/concurrency/
  idempotency · state-matrix gaps · property/fuzz · UI-via-Playwright **iff
  `has_frontend`**) emit candidates → an **independent reproduce-verifier** (not the
  prober) tries to build a **failing test at the seam**. Reproduces → **file via `qa`**
  with the failing test attached (it becomes the fix's acceptance test); doesn't →
  dropped/"suspected." **Dedup** against open `.scratch` issues. Clear defect →
  `ready-for-agent`; reproduced-but-intent-unclear → `needs-triage`.
- **onboard→hunt handoff:** (a) `hunt` **promotes** onboard's `needs-triage` anomalies by
  reproducing them; (b) a hunt-found fix is the **authorized path to revise a pin** — the
  conflicting pin self-reveals (fails when the fix lands), the developer updates it
  (issue-authorized), the tester confirms the revision was *intended*; (c) a candidate
  that **contradicts an existing pin** → `needs-triage` **always** (established behavior,
  Hyrum's law, needs human judgment).

### I. File layout to build
```
~/.claude/skills/sdlc/
  PLAN.md  README.md                      ← exist
  SKILL.md                                ← router
  modes/{setup,feature,run,status}.md     ← spine
  modes/{onboard,hunt,improve,qa-triage,fix}.md   ← stage 2/3
  run.workflow.js  hunt.workflow.js       ← engines (hunt in stage 3)
  templates/{stack,issue-tracker-local,triage-labels,domain,CLAUDE,CONTEXT}.md
~/.claude/agents/{developer,tester,code-reviewer}.md   ← de-hardcoded
```

### J. `onboard` — build spec (grilled 2026-06-27)

**Status:** Resolved via `/grill-me`. Refines §4, §6.16, and §13.G (OB1–OB4) into the
procedural shape of `modes/onboard.md`. References OB1–OB4 rather than restating them.

**Frame.** Brownfield twin of `setup`; **once per repo · interactive · conversational
(no Workflow** — it *is* the scope-in gate, §13.E). **Contract: on finish, `/sdlc run`
pre-flight passes** (git clean · `commands.test` green = existing-green + char-net ·
`docs/agents/stack.md` present). **Shares `setup`'s config layer, diverges at the
characterization tail** (J1). **Gates `improve`/`hunt`** (§2).

**J1 — Factoring.** `onboard` = `setup`'s config layer, **brownfield-seeded**, then
*characterize* instead of *scaffold*. The shared layer (steps 2–3) reuses `setup`'s
`/setup-matt-pocock-skills` + stack-detection; only steps 4–6 are new.

**J2 — Procedural shape (`modes/onboard.md`):**
1. **Explore — read-only fan-out.** Parallel `Explore` subagents on **5 lenses**:
   stack/build · test-suite (green/red/flaky) · seam+entry-points · domain vocabulary ·
   anomalies-vs-stated-intent; each returns a structured digest. *Discovery is read-only;
   char-test **generation** is NOT an `Explore` job* — it runs post-checkpoint in the main
   thread / a `developer` subagent. **→ Checkpoint A** (confirm seam + entry-point list).
2. **Config layer (shared).** Conduct `/setup-matt-pocock-skills` (tracker/labels/domain,
   seeded from existing docs) + the terminal `done` label.
3. **Stack profile.** Write `docs/agents/stack.md` from the **real build files + CLAUDE.md**
   (not house defaults). Record the **seam** in the seam-conventions prose: precedence
   **HTTP/RPC → CLI(argv↔stdout/exit) → library API** = the outermost observable boundary;
   **single seam up front** (inner seams → OB4 lazy); **fallback one level, then ask** if the
   top seam isn't executably pinnable.
4. **Domain + ADRs.** `domain-modeling` → `CONTEXT.md`; reverse-engineer **load-bearing *and*
   evidenced** ADRs, **capped to a handful** (transcribe from a rich CLAUDE.md, infer from
   structure when bare). **Merge-don't-clobber** existing docs. **→ Checkpoint B** (confirm
   glossary + candidate ADRs before writing).
5. **Characterization net + baseline** (sharpens OB1/OB2/OB3):
   - **Enumerate evidence-driven**, not surface-driven: the distinct happy-path scenarios that
     existing evidence demonstrates at the seam; un-evidenced public surface → **logged gap**,
     never blanket signature-pinned (a signature can't yield a meaningful input at a coarse
     high seam).
   - Per scenario: input by the OB2 ladder (existing test › example › call-site › signature;
     none → **ask**) → run → **pin observed output as a golden assertion** (bugs included, OB1).
     Intent-contradicting output → pin green **and** file a `needs-triage` anomaly.
   - Placement/naming per the stack template (`…/characterization/`, `*CharacterizationTest`;
     golden shell tests for non-xUnit stacks).
   - **Quarantine** red/flaky: run once → reds; re-run **once** → flaky; **tag-exclude-with-
     reason** linking a **batched** `needs-triage` issue; confirm the char-net runs inside
     `commands.test`. **Majority-red → STOP + escalate** (never mass-quarantine to a fake-green
     baseline).
6. **Seed backlog.** `needs-triage` **only** (never `ready-for-agent` — preserves scope-in):
   **anomalies one-each** + **quarantined reds batched**. **Gaps → the report, not the queue**
   (OB4 pins them lazily). **No feature-seeding** (that's `feature`).
7. **Confirm + report.** Verify pre-flight green; write **`.scratch/onboard.md`** (singular —
   once per repo): detected stack · seam · entry-points pinned · gaps · anomalies filed · tests
   quarantined · baseline status. `status` surfaces it.

**J3 — Idempotency (three-state).** `stack.md` **present** → "already onboarded," report +
**stop** (redirect to `improve`/`hunt`/`feature`). `stack.md` **absent, other docs present**
(db's state) → normal onboard, leaning on merge-don't-clobber. **Bare repo** (awk) → full
onboard from inference. Repo *growth* after onboarding → **OB4 lazy**, not re-onboard.

**J4 — Human touch-points.** Checkpoint A (findings/seam/entry-points) · Checkpoint B
(domain/ADRs) · majority-red escalation · "no evidence → ask" (OB2). Otherwise autonomous
within the one conversation.

**J5 — Dogfood (sharpens §9 step 2).** **db-first on a throwaway clone** (library seam ·
seed-from-CLAUDE/merge · green JUnit baseline · evidence-rich char-net) — the real repo stays
pristine, and merge-don't-clobber + never-touching-`specs/` keeps db's native methodology
uncollided. **awk-second** (CLI seam · inference · shell-golden net) stress-tests stack/seam
agnosticism. Success = pre-flight green on the onboarded copy.

**J6 — Out of scope.** Fuzzing (→ `hunt`) · feature planning (→ `feature`) · inner-seam pinning
(→ OB4 lazy) · persona/template edits (**already done**: `developer.md`/`tester.md` carry the
characterization rule; the `stack.md` template carries the `characterization/` convention).

**J7 — Dogfood hardening (2026-06-27).** Validated by onboarding a throwaway clone of `db`
(library seam · merge path · green JUnit baseline) → **pre-flight passes** (tree clean ·
`stack.md` present · `commands.test` green = existing-green + a 3-test char-net). Two refinements
folded into `modes/onboard.md`:
- **Step 7 commits.** onboard writes many files; the clean-tree contract requires committing
  them (mirrors `setup`'s "commit the skeleton") — was implicit, now explicit.
- **Rich-brownfield adopt (step 5).** When existing tests already pin the seam, adopt them as
  evidence and pin only load-bearing golden round-trips in the protected namespace; log the rest
  as covered (no duplication).

For `db` the quarantine + anomaly paths were **exercised-but-empty** (clean green repo) — a valid
outcome.

**awk-second (2026-06-27)** — onboarded a throwaway clone of `awk` (CLI seam · inference path ·
C/make · 8 real reds) → **pre-flight passes** (clean tree · `stack.md` · `commands.test` green via
a REGRESS allow-list wrapper + 7 golden CLI behaviors; the test run leaves the tree clean).
Exercises stack/seam agnosticism + the quarantine path. Three more refinements folded into
`modes/onboard.md`:
- **Real-oracle check (step 3).** A repo's test command may exit 0 despite failures (REGRESS) →
  `commands.test` must exit non-zero on failure; build a wrapper if it doesn't, else escalate.
- **Allow-list quarantine (step 5).** A monolithic/shell suite has no per-test tag-exclude →
  quarantine via an **allow-list in the test wrapper** (green iff the failing set ⊆ allow-list).
- **In-tree artifacts (step 7).** No gitignored `build/` dir → onboard **extends `.gitignore`** so
  the build+test cycle leaves a clean tree.

A 4th finding was already covered: an absent build toolchain (`bison`) correctly blocked the
baseline → validates the "can't establish a baseline → escalate" guard (OB3).

**pmt-third (2026-06-27)** — first **real adoption** (not a clone): the `pmt` backend context on an
`onboard/sdlc` branch (Spring Boot / Java 21 · REST seam · H2 `mvn test` oracle, no Docker) →
**pre-flight passes** (clean tree · `stack.md` · 365 green = 361 + 4 contract goldens; commit
isolated on the branch for scope-out). First **multi-context monorepo** and **`has_frontend` repo
scoped to one context**. Three refinements folded into `modes/onboard.md`:
- **Monorepo → one context per run**, module-scoped `commands.*` (`mvn -f backend/pom.xml test`);
  whole-repo `CONTEXT-MAP.md` still deferred.
- **Fastest real oracle**, not the heavy e2e — the repo-wide Playwright run (Docker+browsers) is the
  `e2e` command, never the pre-flight baseline.
- **Order-independent goldens** for a shared self-seeding test DB — pin contract shape (status /
  shape / errors), adopt data behavior from existing tests.

Quarantine + anomaly paths were exercised-but-empty a third time (mature green repo) — consistent
across db/pmt; awk remains the only run that exercised quarantine.

### K. Multi-context engine (un-defers §10; design validated via `/grill-me` 2026-06-28)

**Status:** Design validated, NOT yet built. Makes `/sdlc run` route **per issue** across the bounded
contexts a monorepo onboarded (per-context `stack.<ctx>.md` + `CONTEXT-MAP.md`) instead of the single
hardcoded `docs/agents/stack.md`. Dogfood target: PMT (backend · frontend · analytics; ADR 0016).

**K1 — Slice model (decisive).** An issue targets **exactly one context's seam** (context-scoped
slices), NOT a vertical slice spanning contexts. A full-stack feature decomposes into per-context
slices linked by `Blocked by` (analytics → backend → frontend); one feature keeps one
`.scratch/<feature>/` dir + one `PRD.md`. Rejected: one outer UI-e2e acceptance test driving inner
contexts in a single slice — forces the heavy Docker+browser e2e as the per-slice baseline and demands
all touched contexts green at once (re-introduces exactly what onboard's fastest-oracle rule rejected).

**K2 — Context tag.** A machine-readable **`Context:` line** in the issue file (mirrors `Status:`);
value = a context name resolved against `CONTEXT-MAP.md`. One feature dir, per-issue context tags.
Backward compat: **no `Context:` line OR no `CONTEXT-MAP.md` → the single active context** (today's
behavior). Missing `Context:` in a repo that HAS a `CONTEXT-MAP.md` → pre-flight error (must tag).

**K3 — Run scope.** `scope = all | <context-id> | <issue-id>`. Default **all** drains every
`ready-for-agent` issue across contexts, routing each to its stack (the point of the engine — a
feature's analytics→backend→frontend slices drain in `Blocked by` order in one run). Optional
`--context` narrows to one context (the onboard's "one context per run" mode). Generalizes the
existing `scope` arg.

**K4 — Verification = isolated per slice; e2e deferred.** Each slice branches off the **default
branch** and is verified ONLY by its context's fast `commands.test`. Sound because every context's
onboarded oracle already mocks/avoids its cross-context runtime seam (backend mocks the gRPC client;
frontend `commands.test` = build+typecheck; analytics mocks `PriceFetcher`) — so the per-slice loop
never needs a sibling's real code. Therefore **no branch-stacking, no merge-on-green** (the "human
merges, harness never does" invariant holds), and the per-slice **tester runs `commands.test` only** —
`commands.e2e` is dropped from the autonomous loop. The real full-stack e2e becomes a **post-merge
integration gate** (human at scope-out, or a future `/sdlc integrate`) — OUT OF SCOPE here.

**K5 — Pre-flight (where resolution lives).** The Workflow script is sandboxed (no fs), so the
**pre-flight AGENT** resolves: read `CONTEXT-MAP.md`, map each ready issue's `Context:` → its
`stack.<ctx>.md`, run `commands.test` once per **touched** context (≥1 buildable in-scope issue;
dedup), and return per-issue `{context, stackProfile}` in the extended `PREFLIGHT` schema (`issues[]`
gains `context` + `stackProfile`). Halt on: dirty tree (one repo-wide `git status` check) · ANY
touched baseline red · ANY unknown `Context:`. Cross-context `Blocked by` topo-sort already works
(blocker by issue-id, any context).

**K6 — Branch naming unchanged.** `slice/<feature>/<NN>-<slug>` (context implicit via the issue) —
keeps a feature's per-context slices one coherent branch family for scope-out. Context surfaces as a
**run-report column**, not a branch prefix.

**K7 — Change-set (the build, when scheduled).**
- `run.workflow.js`: extend `PREFLIGHT` schema; rewrite the pre-flight prompt (K5); `developerPrompt`
  /`testerPrompt` consume `issue.stackProfile` (drop the hardcoded `docs/agents/stack.md`); tester runs
  `commands.test` only (K4).
- `modes/run.md`: `scope = all|context-id|issue-id`; pre-checks accept `CONTEXT-MAP.md` or `stack.md`.
- `agents/{developer,tester,code-reviewer}.md`: generalize the literal `docs/agents/stack.md` →
  "the stack profile named in your task (default `docs/agents/stack.md`)".
- `templates/` + the issue-tracker doc: record the `Context:`-line convention.
- PMT (dogfood, at build time): `Context:` lines on issues; update `CONTEXT-MAP.md`'s engine-constraint
  note; **ADR 0017 supersedes ADR 0016's "engine stays single-active" consequence — written WHEN it
  ships** (ADRs record reality, not aspiration), keeping 0016's per-context-layout decision.

**K8 — Verification of the engine itself.** No unit harness for a Workflow script → the oracle is a
**dogfood run** on PMT: author a tiny cross-context feature (e.g. 2 slices, analytics-blocks-backend),
mark `ready-for-agent`, `/sdlc run`, confirm per-issue routing + touched-context baselines + isolated
green + the report's context column. Mirrors §9's dogfood-after-each-build rule.

**K9 — Branch base for `Blocked by` (refines K4; fixes a latent sequential-engine gap).** A
dependent slice's branch base depends on the **blocker's context**: a **same-context** blocker →
branch **off the blocker's slice branch** (the dependent needs its predecessor's real code to
compile); a **cross-context** blocker → branch **off the default branch** (the seam is mocked per K4,
so no sibling code is needed). Today's engine branches every slice off default (`run.workflow.js:94`),
which silently breaks same-context code-dependent chains — this is the fix, **independent of
parallelism** (the sequential engine needs it too). The developer prompt computes the base from each
`Blocked by` edge's context rather than hardcoding the default branch.

### L. Full-stack integration gate — `/sdlc integrate <feature>` (design validated via `/grill-me` 2026-06-28)

**Status:** Design validated, NOT yet built; depends on §13.K (the multi-context engine) shipping
first. Closes the gap K4 leaves open: the engine verifies each slice in ISOLATION (cross-context seams
mocked), so the real full-stack behaviour (frontend UI → backend REST → analytics gRPC, all running the
new code) is never checked. The Playwright e2e (`commands.e2e` = `start.sh` + `run_tests.sh`) is the
only oracle for a cross-context contract mismatch.

**L1 — Pre-merge, feature-level, human-invoked (decisive).** `/sdlc integrate <feature>` runs BEFORE
the feature lands on main. Rationale (the masking failure mode): after the engine lands isolated-green
slices, a cross-context contract break (FE expects REST field `x`, BE returns `y`) is invisible to
EVERY isolated baseline (analytics mocks; backend mocks the gRPC + asserts its own contract; frontend
`commands.test` = build+typecheck; `src/types/index.ts` is hand-maintained, not generated) AND to the
next run's pre-flight (touched-context `commands.test` only) — so a post-merge break would sit on main
looking green, poisoning the always-green-main invariant pre-flight depends on. Pre-merge catches it
first. The "harness never merges to main" invariant holds: the gate assembles + tests + reports a
verdict; the HUMAN merges. **Scope: only features whose slices span ≥2 contexts** (a single-context
feature has no cross-context contract → its isolated slice tests suffice).

**L2 — Integration branch = the merge unit.** Cut `integration/<feature>` fresh off CURRENT main each
run; merge each `done` slice in `Blocked by` topo order (conflict-free in practice — context-scoped
slices touch disjoint dirs: `<analytics-context>/` · `backend/` · `frontend/`); run the full-stack e2e on it.
Green → this ONE branch is the human's merge candidate (atomic feature landing; what was tested == what
lands). Cutting off current main tests against what main will truly become (catches conflicts with
features merged in the meantime). Rejected: a throwaway test vehicle + per-slice human merges — that
de-binds the green evidence from main's actual post-merge state.

**L3 — Whole e2e suite.** Run the entire `run_tests.sh --headless` (~43 specs), not just the feature's
specs — it IS the integration gate, so regressions this feature causes elsewhere are in scope, and there
is no per-feature spec map.

**L4 — Orchestration.** A background LINEAR pipeline (the third Workflow-tool mode after `run`/`hunt`,
but no per-issue loop): assemble (git) → `start.sh` (Docker + TimescaleDB + Kafka + analytics + backend,
health-gated) → `run_tests.sh --headless` (frontend dev server + Playwright vs the real stack) → parse →
`stop.sh` (ALWAYS, even on failure) → report. Background because the bring-up + e2e is minutes-long.

**L5 — Failure = escalate-only (no auto-repair).** Red e2e → do NOT merge; write
`.scratch/integrations/<feature>-<runId>.md` (failing specs, assembled slice SHAs, the
`integration/<feature>` branch) + raise ONE feature-level `ready-for-human` signal; RETAIN the
integration branch as the reproduction. Slices stay `done` (correct in isolation). No auto-repair: a
cross-context contract mismatch has ambiguous fix-location (relax the FE or change the BE response — a
product decision), so the harness must not guess. Human repairs a slice → re-`done` → re-run.

**L6 — Pre-checks (main thread, before invoking).** Feature dir exists; ALL its slices `Status: done`
(else feature-incomplete, stop); ≥2 distinct `Context:` values among them (else single-context, no gate
needed). Stamp a `runId`.

**L7 — Recording + sequencing.** New `modes/integrate.md` + a router-table row (`integrate`); built
AFTER §13.K (it integrates what the engine produces). Spec-only now (per the §13.J/K precedent — this
grilling produces validated design, not code). When shipped, the engine ADR (0017) notes the gate, or a
sibling ADR records it — written as reality, not aspiration.

**L8 — Needs a green e2e baseline on main (dogfood finding 2026-06-28).** The gate runs the WHOLE suite
(L3), so it cannot distinguish "this feature broke integration" from "main's e2e was already red". The
`ping-healthcheck` dogfood RED'd **23/43** — but the feature touched **zero frontend code** (slices:
analytics `health()` + backend `GET /api/ping`), so the integration branch's frontend is byte-identical
to main and the failures are **pre-existing**: Playwright `waitForLoadState('networkidle')` never settles
against the app's persistent STOMP/SockJS WebSocket feed. So §13.L **assumes main's e2e suite is green**;
a pre-existing-red suite RED's every integration. Refinement options (future): (a) document the
green-e2e-on-main precondition; (b) run an e2e baseline on main first and fail the feature only on **new**
failures (delta — doubles e2e cost); (c) migrate the suite off `networkidle` to explicit element waits
(the specs that already do — benchmarks, classification — passed). The gate MECHANISM validated
end-to-end: assemble → `start.sh` (with orphan-container self-remediation) → `run_tests.sh` → `stop.sh`
→ RED → escalate-only + retained branch.

### M. Parallel slices via per-context lanes (un-defers §10's "parallel slices via worktrees"; validated via `/grill-me` 2026-06-28)

**Status:** **Implemented + dogfood-verified 2026-06-28** (`run.workflow.js`: per-context lanes via
`parallel()`, worktree-isolated dev/tester agents, cross-lane completion-promise sync). The
`parallel-probe` dogfood (analytics `pong()` ‖ backend `/api/pong`, independent / no `Blocked by`)
confirmed BOTH lane developers started ~1 s apart (21:12:19 vs :20 — vs ~6 min apart, sequential, in
the K dogfood) and both shipped — so worktree isolation (per-agent worktree → shared `.git`) and the
concurrent lane dispatch both work. The **lowest-priority** spec (correctness comes from K+L;
parallelism only buys wall-clock). Depends on §13.K.

**M1 — Dimension = per-context lanes (decisive).** Parallelize ACROSS contexts: one persistent
worktree per context, issues SERIAL within a lane, lanes concurrent. Bounded to ≤ N contexts (3 for
PMT). Leverages two facts the onboard established: cross-context slices touch DISJOINT dirs
(`<analytics-context>/` · `backend/` · `frontend/`) and the fast oracles are parallel-SAFE (H2 in-memory,
in-process pytest, static build — no shared ports/DB). Rejected: full DAG-parallel (a global parallel
executor + cap-tuning against heavy `mvn`/`npm` builds, for marginal gain at this scale).

**M2 — Lanes are a context-grouped DAG, not independent pipelines (the honest caveat).** Cross-context
`Blocked by` edges are cross-LANE sync points: a frontend slice waits for its backend blocker (another
lane) to be `done`. So a SINGLE full-stack feature (analytics→backend→frontend chain) runs mostly
SERIALLY even with lanes — parallelism's real payoff is draining MULTIPLE INDEPENDENT features
concurrently (feature X's analytics lane ‖ feature Y's backend lane), not speeding up one chained
feature. This is why M is low-priority until the backlog is wide.

**M3 — Reuse the sequential machinery.** A lane = the existing per-issue loop (dev→test→N≤2 bounce→
commit|escalate) run in its own worktree (`isolation:'worktree'`); the engine wraps the lanes in a
parallel-over-contexts outer loop with cross-lane `Blocked by` sync. Minimal new code — the inner
slice machinery is untouched. Same-context chains stack within the lane's worktree (K9); cross-context
deps are mocked (K4). In-memory scheduling (as today) — no reliance on reading `Status:` mid-run, so
the forked-`.scratch/`-across-worktrees problem never bites (each lane writes `Status: done` only to
its own slice branches; it persists on merge).

**M4 — Worktree lifecycle (impl reality + dogfood finding).** Implemented as **one worktree per
AGENT** (`isolation:'worktree'` is per-agent; M's earlier "per-lane reused" idea is unbuilt — per-agent
is simpler and correct, since commits/branches live in the shared `.git`). Slice branches persist (for
scope-out); worktrees are ephemeral. **Cleanup gap the `parallel-probe` dogfood surfaced:** the harness
only auto-removes worktrees that did NO work, so committed lane worktrees LEAK (4 leaked — 2
committed-dev + 2 detached-tester), dirtying the tree (`.claude/worktrees/` untracked) and pinning the
slice branches (`git branch -D` refuses a branch checked out in a worktree). Fix: the engine now runs a
**worktree-cleanup agent at run end** (`git worktree remove --force` each `.claude/worktrees/*`, keeping
the branches), and `.claude/worktrees/` is gitignored. Fast oracles are isolated, so N concurrent lanes
don't collide; the integration gate (§13.L, fixed ports via `start.sh`) stays SINGLE — never run
parallel lanes against it.

### N. `/sdlc fix` express lane — multi-context interaction (validated via `/grill-me` 2026-06-28)

**Status:** Refines the stage-3 `fix` mode (intake+run of a single issue; the human's invocation IS the
scope-in gate) for multi-context repos. The mode itself is still unbuilt; this records the routing +
blast-radius decisions so the build inherits them.

**N1 — Context + scope.** A fix is a SINGLE-context slice: its `Context:` (K2) is resolved at the
conversational intake (human present — confirm, defaulting to inference / the single context).
Lightweight intake (one issue + Gherkin AC, no PRD); auto-marked `ready-for-agent`; drained via the
single-issue run engine (`scope = issue-id`); scope-out retained. A bug that is genuinely cross-context
is NOT an express fix → redirect to `/sdlc feature` (decompose into per-context slices + §13.L).

**N2 — Blast-radius = warn on seam-touch (decisive).** A single-context fix is verified by its context's
ISOLATED `commands.test` (mocks), which cannot see that the fix changed a seam a sibling context
consumes (a REST response the frontend relies on) — the same masking §13.L exists to catch. The fix
stays express (NO reflexive integration gate); instead its report FLAGS blast radius ONLY when the diff
touches a PUBLISHED seam (a REST controller / `proto` / the API surface per `CONTEXT-MAP.md`), and
recommends the human run `/sdlc integrate` (or `./run_tests.sh`) before merging. Rejected: auto-chain L
on every fix with consumers (guts "express" with a minutes-long e2e) · refuse on any seam-touch (too
rigid — most fixes are internal). Keys on **seam-touch**, not mere "context has consumers".
