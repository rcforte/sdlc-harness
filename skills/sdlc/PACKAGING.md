# Packaging the SDLC harness for sharing — plan (grilled 2026-07-02)

Goal: package `/sdlc` so other developers can install it in their own projects. Distribution = a
**bare git repo** (no plugin/marketplace machinery). Decisions from the grilling session:

## Decisions
1. **Format** — bare git repo (files + git), not a Claude Code plugin.
2. **Dependencies — bundle-all** — the repo mirrors `~/.claude/` (`skills/` + `agents/`) and ships the
   harness + the **self-authored** sub-skills + the **9 agent personas**. The **Matt-Pocock skills**
   (`setup-matt-pocock-skills`, `to-prd`, `to-issues`, …) are a **declared prerequisite** (assumed
   installed) — NOT redistributed (avoids attribution/license issues).
3. **Workflow-tool gap — dual-path** — the `*.workflow.js` engines (via the `Workflow` tool) are the
   FAST PATH; add a thin **main-thread fallback** (`run.fallback.md` / `hunt.fallback.md` /
   `integrate.fallback.md`) that reproduces the per-issue `developer → tester → N≤2 bounce →
   commit|escalate` loop **sequentially, foreground**, via the `Agent`/`Task` tools (present in older
   Claude Code). The engine mode files **detect `Workflow`-tool availability and auto-select**;
   degradation (no parallel lanes / no journal / no budget, same isolation+scope-out gates) is documented.
4. **Install — symlink-default `install.sh`** — symlinks each `skills/<name>` + `agents/<name>.md` into
   `~/.claude/` (so `git pull` updates everyone). Flags: `--copy` (isolated), `--project <path>` (vendor
   into a project `.claude/`), `--update` (pull + re-check), and a **prerequisite check** on run
   (Workflow tool? Matt skills? git?) that tells the adopter fast-path vs fallback.
5. **Portability** — make the workflow `scriptPath`s **base-dir-relative** (use the skill's provided base
   dir, not hardcoded `~/.claude/...`) so `--project` installs work; move PMT dogfood examples out of the
   mode logic into `EXAMPLES.md`; `install.sh` runs a **grep gate** asserting no personal refs
   (`/home/rcforte`, `com.rcforte`, `pmt-*`) remain in shipped files.
6. **Docs** — `README.md` = adopter front door (Prerequisites · Install · 5-min Quickstart:
   onboard→feature→run→scope-out · fast-path-vs-fallback callout · Troubleshooting). `PLAN.md` = the
   authoritative §13 design spec (linked, not inlined). `EXAMPLES.md` = the PMT dogfood evidence.
7. **Versioning** — semver git tags + `CHANGELOG.md` + a `VERSION` stamp; updates via `git pull`
   (`install.sh --update`); `/sdlc status` reports version + active path; README carries a Claude-Code
   compatibility line (fast path needs the `Workflow` tool; older → fallback).

## Target repo layout
```
sdlc-harness/                 (shareable bare repo)
├── install.sh  README.md  EXAMPLES.md  CHANGELOG.md  VERSION
├── skills/
│   ├── sdlc/                 (SKILL.md, modes/*.md, *.workflow.js, *.fallback.md, PLAN.md, templates/)
│   └── <self-authored deps>/ (grill-with-docs, grill-me, outside-in-tdd, tdd, review, caveman, qa,
│                              improve-codebase-architecture)   # NOT the Matt-Pocock skills
└── agents/                   (developer, tester, architect, architect-critic, code-reviewer,
                               product-owner, product-owner-critic, ux-design, ux-auditor)
```

## Work items
- [ ] Restructure into the bundle layout (`skills/` + `agents/`).
- [ ] Author `run/hunt/integrate.fallback.md` + add Workflow-tool detection/dispatch to the engine modes.
- [ ] Base-dir-relative `scriptPath`s in `run/hunt/integrate.md`.
- [ ] `install.sh` (symlink default; `--copy`/`--project`/`--update`; prereq check; grep gate).
- [ ] `README.md` front door · `EXAMPLES.md` (PMT evidence) · `CHANGELOG.md` · `VERSION`.
- [ ] Genericize the 3 PMT refs; confirm the Matt-Pocock skill boundary (authorship check).
