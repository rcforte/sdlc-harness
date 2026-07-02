# CLAUDE.md — <repo name>

Guidance for Claude Code in this repo. This file is the **override / index / quality-bar**
layer; the machine-parsed detail lives in `docs/agents/*` (linked below). Where this file
and a `docs/agents/*` value disagree on a *command or seam*, the `docs/agents` file wins;
this file wins on *behavior, style, and the quality bar*.

## What this project is

_One-paragraph product / vision summary. For a greenfield repo this is written by the first
`/sdlc feature` run; for a brownfield repo, by `/sdlc onboard`._

## How we work

- **SDLC harness** — this repo is driven by `/sdlc`. Intake (`/sdlc feature`, `improve`,
  `hunt`, `qa`) queues issues; **`/sdlc run`** builds them; humans gate **scope-in**
  (`ready-for-agent`) and **scope-out** (branch review). See
  `~/.claude/skills/sdlc/README.md`.
- **Every slice is outside-in TDD**, BDD-driven from the issue's Gherkin acceptance criteria.
- **`/caveman`** on for coding turns; off for grilling, specs, and CLAUDE.md/ADR edits.

## Agent skills

### Stack & commands
Build/test/run commands and test-seam conventions: **`docs/agents/stack.md`** (authoritative).

### Issue tracker
_One line — set by `setup-matt-pocock-skills`._ See `docs/agents/issue-tracker.md`.

### Triage labels
Five intake roles + the engine's terminal `done`. See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: ubiquitous language in `CONTEXT.md`, decisions in `docs/adr/`.
See `docs/agents/domain.md`.

## Quality bar

_Project-specific UX / quality bar that the `ux-auditor` and reviewers read against — filled
as the product takes shape._
