# Changelog

## v1.0.0 — 2026-07-02
First shareable release. The SDLC harness (`/sdlc`) + its self-authored sub-skills + 9 agent personas,
packaged as a bare git repo installable via `install.sh`.

- **Modes:** `setup · onboard · feature · fix · improve · hunt · qa/triage · run · integrate · status`.
- **Dual engine:** `Workflow`-tool fast path (parallel, background, journaled) with an automatic
  **main-thread `Agent`-tool fallback** (`*.fallback.md`) for older Claude Code that lacks the tool.
- **Install:** symlink-default `install.sh` (`--copy`, `--project`, `--update`, prerequisite check).
- Comprehensively battle-tested against a real multi-service repo (see `EXAMPLES.md`): every mode driven
  end-to-end; six self-found harness bugs fixed.

**Prerequisites:** git; the Matt-Pocock skills (`setup-matt-pocock-skills`, `to-prd`, `to-issues`,
`review`) installed separately; the `Workflow` tool for the fast path (older Claude Code auto-uses the
fallback).
