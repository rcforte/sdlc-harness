# SDLC Harness — Cheat-Sheet

Quick reference for the commands, personas, and knobs. The canonical *design* is
[`PLAN.md`](./PLAN.md); this file is the operator's lookup so you don't have to
re-read it.

**What it is:** four interactive **intake on-ramps** feed one deterministic
**build→verify→commit engine**, gated by a human at **scope-in** (what enters the
queue) and **scope-out** (what merges). It *conducts* existing skills + persona
agents — it doesn't re-implement them. Global (`~/.claude`); first dogfood target
is `pilates`.

```
 INTAKE (interactive · scope-IN)          ENGINE                    scope-OUT
 feature  grill → prd → issues  ┐
 onboard  explore → docs + net  ├─▶ .scratch/ QUEUE ─▶ run ─▶ slice/<id> ─▶ human
 improve  3-lens audit → pick   │   (ready-for-agent) (Workflow)  branches    reviews
 hunt     adversarial → file    ┘     per issue: developer → tester → N≤2 → commit│escalate
```

---

## ⚠️ Status — what's built

The **v1 spine is built**; `setup` is dogfooded on pilates (greenfield → green baseline)
and the health-check slice is queued. The first engine `run` is the next step. Full
grilled spec: `PLAN.md` §13.

| Piece | State | Notes |
|---|---|---|
| Persona agents (9) | ✅ | Invoke by name as subagents, or via the engine |
| Conducted skills (grill, tdd, review, …) | ✅ | Type the slash command |
| `/sdlc` umbrella router (`SKILL.md`) | ✅ built | dispatches to `modes/*.md` |
| `setup` · `feature` · `run` · `status` modes | ✅ built | the v1 spine |
| `run.workflow.js` engine | ✅ built | pure control-flow; all side effects in subagents |
| Stack-profile-driven personas | ✅ built | `developer`/`tester`/`code-reviewer` read `docs/agents/stack.md` |
| `.scratch/` queue + run reports | ✅ built | local-markdown; report written on first `run` |
| `onboard` mode | ✅ stage 2 | brownfield adoption + char-net — dogfooded: db + awk clones |
| `improve` · `hunt` · `qa`/`triage` · `fix` | ⏳ stage 3 | the remaining on-ramps |

**The front door is live:** `/sdlc setup` → `/sdlc feature` → `/sdlc run`.

---

## Quickstart — the `/sdlc` loop (v1)

```
/sdlc setup                  # once per repo: git + config + green walking-skeleton baseline
/sdlc feature "<idea>"       # grill → PRD → queued vertical-slice issues (ready-for-agent)
#   ↳ you review the queue   # ← scope-IN gate
/sdlc run  [<issue-id>]      # engine: per issue  developer → tester → N≤2 → commit | escalate
/sdlc status                 # queue + last run report, anytime
#   ↳ you review slice/<id>  # ← scope-OUT gate (you merge; the harness never does in v1)
```

`run` (and later `hunt`) are background Workflows; everything else is conversational.
No-arg `/sdlc` prints the subcommand map.

---

## TL;DR — I want to…

| Goal | Do this |
|---|---|
| Stress-test a plan before building | `/grill-with-docs` (writes ADRs + glossary) or `/grill-me` (throwaway) |
| Turn a discussed idea into a PRD | `/to-prd` → publishes to the issue tracker |
| Break a plan/PRD into grabbable issues | `/to-issues` (vertical tracer-bullet slices) |
| Build a slice test-first | `/outside-in-tdd` (never `/tdd` directly) |
| Implement against a PRD/issues | `/implement` (uses tdd at seams, then `/review`) |
| Review a branch/diff | `/review <fixed-point>` (Standards + Spec, parallel) |
| Find architectural friction | `/improve-codebase-architecture` |
| Report a bug conversationally | `/qa` → reproduce → failing test → file |
| Process the incoming issue pile | `/triage` |
| Hand off to a fresh session | `/handoff "<what's next>"` |
| Configure a repo for these skills | `/setup-matt-pocock-skills` (run once per repo) |
| Squeeze tokens on a coding turn | `/caveman` ON |

---

## `/sdlc <subcommand>` — command surface

Intake is interactive; `run`/`hunt` are background Workflows; everything ends at the same
queue → same scope-out review. ✅ = built, ⏳ = stage 2/3.

| Command | Kind | Role | |
|---|---|---|---|
| `setup` | once per repo | greenfield config + green walking-skeleton baseline | ✅ |
| `feature "<idea>"` | intake (scope-in) | conduct grill → prd → issues | ✅ |
| `run` [`<id>`] | **autonomous** (Workflow) | drain `ready-for-agent` → branches + run report | ✅ |
| `status` | read-only | queue + last run report | ✅ |
| `onboard` | once per repo | brownfield adoption + characterization safety net | ✅ |
| `improve` | intake (scope-in) | 3-lens audit (arch / code / UX) → you pick | ⏳ |
| `hunt` | autonomous (Workflow) | agents find bugs → reproduce → file | ⏳ |
| `qa` / `triage` | intake | you report a bug / process incoming | ⏳ |
| `fix "<bug>"` | intake + run | express lane: one bug, inline | ⏳ |

---

## Personas (the agents in `~/.claude/agents/`)

A **maker** and its independent **evaluator twin** per SDLC phase. Generator ≠
verifier — the evaluator runs cold, with fresh context. Invoke by name as a
subagent (e.g. "use the developer agent to build this slice").

| Persona | Owns | Hands to | Judged by | Oracle strength |
|---|---|---|---|---|
| `product-owner` | WHAT / WHY — stories + Gherkin AC | architect, ux-design | `product-owner-critic` | — (human/market is the oracle) |
| `architect` | Backend design — DDD, boundaries, ADRs | developer | `architect-critic` | **advisory** (no executable oracle) |
| `ux-design` | Experience — flows, IA, state matrix, wireframes | developer, frontend-design | `ux-auditor` | — |
| `developer` | BUILD the vertical slice (BE + FE, outside-in) | tester | `tester` | — |
| `tester` | Verify slice vs AC (suites + API + Playwright) | — | — | **authoritative** (executable ground truth) |
| `ux-auditor` | Audit live screen (Nielsen + WCAG + CSS/colour/nav) | — | — | structural only (taste stays human) |
| `code-reviewer` | Code quality, one dimension per pass | — | — | medium (objective + opinionated) |

**Evaluator rule:** critics/auditors are **read-only — they judge, never fix.**
`product-owner-critic` + `architect-critic` are **advisory** (two LLMs can
rubber-stamp → human decides). `tester` is **authoritative**.

---

## Skills the harness conducts

`⌨️` = **manual-only** (`disable-model-invocation`) — you must type the slash
command; the model won't auto-pick it. Others the model may invoke on its own.

**Plan / frame**
| Skill | What |
|---|---|
| `grilling` | Relentless one-question-at-a-time interview to sharpen a plan |
| `grill-me` ⌨️ | Grilling for throwaway discussion (no docs touched) |
| `grill-with-docs` ⌨️ | Grilling that also writes ADRs + glossary as decisions crystallise |
| `domain-modeling` | Actively build/sharpen the domain model (`CONTEXT.md` + ADRs) |
| `ubiquitous-language` ⌨️ | Extract a DDD glossary → `UBIQUITOUS_LANGUAGE.md` |
| `codebase-design` | Deep-module vocabulary (module, seam, depth, adapter, leverage) |
| `design-an-interface` | Generate several radically different module interfaces in parallel |
| `decision-mapping` ⌨️ | Loose idea → sequenced map of investigation tickets |
| `zoom-out` ⌨️ | "Go up a layer" — map the modules + callers of an area |

**Intake / backlog**
| Skill | What |
|---|---|
| `to-prd` ⌨️ | Conversation → PRD, published to the issue tracker |
| `to-issues` ⌨️ | Plan/PRD → independently-grabbable vertical-slice issues |
| `triage` ⌨️ | Move issues (and external PRs) through the triage state machine |
| `qa` | Conversational bug report → reproduce → failing test → file |
| `request-refactor-plan` | Refactor RFC with tiny commits, filed as an issue |

**Build**
| Skill | What |
|---|---|
| `implement` ⌨️ | Build from a PRD/issues; tdd at seams; ends with `/review`; commits |
| `outside-in-tdd` | **Default for every line of code** — Percival double-loop |
| `tdd` | Inner unit cycle only, inside an already-failing outer loop |
| `prototype` ⌨️ | Throwaway code to answer a question (terminal logic app *or* UI variations) |
| `diagnose` / `diagnosing-bugs` | Disciplined hard-bug / perf-regression loop |

**Verify / review / upkeep**
| Skill | What |
|---|---|
| `review` | Two-axis diff review (Standards + Spec) in parallel sub-agents |
| `improve-codebase-architecture` ⌨️ | Find deepening opportunities → HTML report → grill the pick |
| `code-review` (`/code-review`) | Diff review for bugs + cleanups; `ultra` = cloud multi-agent |

**Support**
| Skill | What |
|---|---|
| `handoff` ⌨️ | Compact the conversation into a handoff doc for a fresh agent |
| `setup-matt-pocock-skills` ⌨️ | Configure a repo (tracker + labels + domain docs). **Run once first.** |
| `caveman` | Ultra-compressed responses (~75% fewer tokens) |

> Skills like `financial-advisor`, `obsidian-vault`, `writing-*`, `teach`,
> `ask-matt`, `quant-developer`, `researcher` live in `~/.claude/skills` too but
> are **not** part of this harness.

---

## Knobs

| Knob | Values / default | Where |
|---|---|---|
| **`/caveman`** | ON for coding turns; **OFF** for grilling, specs, CLAUDE.md/ADR edits, architecture discussion | per-turn |
| **Tester bounce `N`** | refute → defects back to `developer` → repeat **≤ 2** → escalate | `PLAN.md §3` |
| **Stop conditions** | refute(N=2) · requirement ambiguity · budget hit · pre-flight fail · scope drift | → **skip-and-continue**, auto-skip dependents, one end-of-run summary |
| **Token budget** | per-`run` input; run stops cleanly when exhausted | `/sdlc run` arg |
| **Stack profile** | `commands{build,test,test-one,e2e,lint,run,typecheck}` + `has_frontend` (hybrid YAML) + seam conventions (prose); `test` mandatory | `docs/agents/stack.md` |
| **Issue tracker** | GitHub · GitLab · **local-markdown** · other | `docs/agents/issue-tracker.md` |
| **Triage labels** | `needs-triage` · `needs-info` · `ready-for-agent` · `ready-for-human` · `wontfix` | `docs/agents/triage-labels.md` |
| **Domain layout** | single-context (`CONTEXT.md`) · multi-context (`CONTEXT-MAP.md`) | `docs/agents/domain.md` |
| **settings.json** | `model: opus[1m]`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `skipDangerousModePermissionPrompt` | `~/.claude/settings.json` |

**Two human gates:** **scope-in** = a human marks an issue `ready-for-agent`;
**scope-out** = a human reviews the `slice/<id>` branch diffs before merge.

**Bug invariant (every path, human- or agent-found):**
**reproduce → failing test → fix → tester-confirm.** No bug is "fixed" without a
test that first failed because of it and now passes.

---

## Per-repo files the harness reads / writes

Written by `setup` (`onboard` for brownfield), consumed by the skills + engine:

```
docs/agents/issue-tracker.md   tracker choice (+ PRs-as-surface?)
docs/agents/triage-labels.md   5 intake labels + terminal `done`
docs/agents/stack.md           stack profile — YAML commands + has_frontend, prose seams
docs/agents/domain.md          domain-doc layout + consumer rules
CLAUDE.md                      repo override/index/bar layer (points at docs/agents/*)
CONTEXT.md                     ubiquitous language (the glossary every skill reads)
docs/adr/NNNN-*.md             Architecture Decision Records (don't re-litigate)
.scratch/<feature>/issues/<NN>-<slug>.md   the issue queue (a Status: line per issue)
.scratch/runs/<runid>.md       committed run reports (resumable via Workflow runId)
branches: slice/<feature>/<NN>-<slug>      one branch per slice, off main
```

---

## Where things live

| | Path |
|---|---|
| Design + build spec (canonical) | `~/.claude/skills/sdlc/PLAN.md` (§13 = grilled impl spec) |
| This cheat-sheet | `~/.claude/skills/sdlc/README.md` |
| Router | `~/.claude/skills/sdlc/SKILL.md` |
| Mode files | `~/.claude/skills/sdlc/modes/*.md` |
| Engine | `~/.claude/skills/sdlc/run.workflow.js` |
| Per-repo config templates | `~/.claude/skills/sdlc/templates/*.md` |
| Persona agents | `~/.claude/agents/*.md` |
| Skills | `~/.claude/skills/<name>/SKILL.md` |
| Global settings | `~/.claude/settings.json` |
| First dogfood target | `~/dev/pilates/` (bootstrapped; health-check queued) |
| `db` project methodology (worked example) | `~/dev/code/db/CLAUDE.md` |
