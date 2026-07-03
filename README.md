# SDLC Harness (`/sdlc`)

An autonomous **intake → build → verify → integrate** engine for Claude Code, packaged as a bare git
repo. One human-gated pipeline with ten modes:

```
setup · onboard · feature · fix · improve · hunt · qa/triage · run · integrate · status
```

`hunt`/`feature`/`improve`/`qa`/`fix` **produce** issues; `run` **builds** each slice (developer → tester,
commit-on-pass); `integrate` runs the full-stack e2e before a human merges. Two gates frame everything:
**scope-in** (a human marks an issue `ready-for-agent`) and **scope-out** (a human reviews the
`slice/<…>` branch before merge — the harness never merges to your default branch).

## Prerequisites

| Requirement | Why | If missing |
|---|---|---|
| **`Workflow` tool** (Claude Code) | fast-path engines (`run`/`hunt`/`integrate`) | **older Claude Code auto-uses a main-thread fallback** — same outcomes, sequential/foreground, no parallel lanes. `/sdlc status` tells you which path is active. |
| **Matt-Pocock skills** — `setup-matt-pocock-skills`, `to-prd`, `to-issues`, `review` | intake modes drive them | install them separately (they are **not** bundled here) |
| **git** | slice branches, scope-out | — |
| a per-repo **stack profile** | pre-flight + tester oracle | created for you by `/sdlc setup` (greenfield) or `/sdlc onboard` (existing code) |

The bundled agent personas (`developer`, `tester`, `architect`, `code-reviewer`, `product-owner`, … — 9)
and the self-authored sub-skills (`grill-with-docs`, `outside-in-tdd`, `caveman`, `qa`, …) install *with*
the harness.

## Install

```bash
git clone https://github.com/rcforte/sdlc-harness.git
cd sdlc-harness
./install.sh                 # symlink into ~/.claude (git pull then updates you instantly)
# ./install.sh --copy         # isolated copies instead of symlinks
# ./install.sh --project DIR   # vendor into DIR/.claude for a whole team via that repo
# ./install.sh --update        # git pull + re-install + re-check
```

**Windows:** use `install.bat` instead (same flags: `--copy` / `--project DIR` / `--update`). It junctions the skill dirs (no admin) and copies the agent files.

`install.sh` runs a **prerequisite check** (git · Matt skills · a note on the Workflow tool) and a
**grep gate** that refuses to ship personal/dogfood references.

## Quickstart (5 minutes, on an existing repo)

```
/sdlc onboard        # characterizes current behavior → docs/agents/stack.md + a green baseline
/sdlc hunt backend   # (or) /sdlc feature "…"  → files issues into .scratch/<feature>/issues/
/sdlc triage         # you route needs-triage → ready-for-agent  (the scope-in gate)
/sdlc run            # developer → tester → commit-on-pass onto slice/… branches
# review the slice/… branches, then merge them yourself   (the scope-out gate)
/sdlc status         # queue + last run + which engine path is active
```

Greenfield instead? `/sdlc setup` bootstraps a git repo, a stack profile, and a green walking skeleton so
`/sdlc run` pre-flight passes.

## Docs
- **`skills/sdlc/PLAN.md`** — the authoritative design/§13 spec.
- **`EXAMPLES.md`** — the reference dogfood: this harness was comprehensively battle-tested against a real
  multi-service repo (all modes; six self-found harness bugs fixed).
- **`CHANGELOG.md`** / **`VERSION`** — releases; `/sdlc status` surfaces the installed version.

## Troubleshooting
- **`run`/`hunt`/`integrate` "does nothing" / no background task** — you likely lack the `Workflow` tool;
  the mode should have used its `*.fallback.md` engine (foreground). `/sdlc status` confirms the path.
- **`--project` install, engines can't find their script** — ensure you're on a build that resolves the
  skill base dir; the engine modes use `<skill-base-dir>/…workflow.js`, never a hardcoded `~/.claude`.
- **pre-flight HALTs** — dirty tree (commit/stash), a red `commands.test` baseline (fix first), or an
  unknown `Context:` on an issue (fix the `Context:` line vs `docs/agents/CONTEXT-MAP.md`).
- **an intake mode references a missing `/…` skill** — install the Matt-Pocock prerequisites.
