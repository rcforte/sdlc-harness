---
name: sdlc
version: 1.0.0
description: Umbrella for the SDLC harness — four intake on-ramps feed one build→verify→commit engine, gated by a human at scope-in and scope-out. Dispatches /sdlc subcommands to per-mode instructions.
disable-model-invocation: true
argument-hint: "setup | feature \"<idea>\" | improve | hunt | qa | triage | fix \"<bug>\" | run | integrate <feature> | status"
---

# /sdlc — SDLC harness router

Dispatch on the **first word** of the arguments. Read the matching mode file under `modes/`
and follow it; everything after the first word is that mode's argument. The router is a
dispatcher, not a brain — the logic lives in the mode files and `run.workflow.js`.

| First word | Mode file | Kind | Stage |
|---|---|---|---|
| `setup` | `modes/setup.md` | intake · once per repo | ✅ v1 |
| `feature` | `modes/feature.md` | intake (conversational) | ✅ v1 |
| `run` | `modes/run.md` | autonomous execution (Workflow) | ✅ v1 |
| `status` | `modes/status.md` | read-only | ✅ v1 |
| `onboard` | `modes/onboard.md` | intake · once per brownfield repo | ✅ stage 2 |
| `improve` | `modes/improve.md` | intake (conversational) | ✅ stage 3 |
| `hunt` | `modes/hunt.md` | autonomous intake (Workflow) | ✅ stage 3 |
| `qa` / `triage` | `modes/qa-triage.md` | intake | ✅ stage 3 |
| `fix` | `modes/fix.md` | intake + run | ✅ stage 3 |
| `integrate` | `modes/integrate.md` | autonomous execution (Workflow) | ✅ (§13.L) |

Rules:
- **No arg, or an unrecognized word** → print this table with a one-line gloss each, and stop.
  Never guess a mode.
- Read ONLY the dispatched mode file (progressive disclosure — don't pre-load the others).
- If the dispatched mode file does **not exist yet**, say so plainly (it's a later build stage),
  and don't improvise the behavior.
- **Prerequisite gate:** `feature` / `improve` / `hunt` / `run` need `docs/agents/stack.md`.
  If it's missing, tell the user to run `/sdlc setup` (greenfield) or `/sdlc onboard`
  (existing code) first.
- Two human gates frame everything: **scope-in** (a human marks an issue `ready-for-agent`)
  and **scope-out** (a human reviews the `slice/<…>` branch before merge).
- **Engine paths:** the autonomous modes (`run` / `hunt` / `integrate`) use the `Workflow` tool when
  available (fast path) and otherwise auto-select their `modes/<mode>.fallback.md` main-thread engine
  (sequential, foreground). Each engine mode file handles the detection; you don't decide here.
