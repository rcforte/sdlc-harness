#!/usr/bin/env bash
# install.sh — install the SDLC harness (skills + agent personas) into Claude Code.
#
#   ./install.sh                 symlink into ~/.claude (default; `git pull` then reflects instantly)
#   ./install.sh --copy          copy instead of symlink (isolated; re-run to update)
#   ./install.sh --project DIR    install into DIR/.claude instead of ~/.claude (team-vendored)
#   ./install.sh --update         git pull, then re-install (re-symlink/re-copy) and re-check
#
# Prereqs it reports: git; the Matt-Pocock skills (assumed installed separately); and the `Workflow`
# tool (a Claude-Code capability that can't be probed from a shell — `/sdlc status` reports whether the
# fast path or the main-thread fallback is active).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="symlink"; TARGET="$HOME/.claude"; DO_UPDATE=false
while [[ $# -gt 0 ]]; do case "$1" in
  --copy) MODE="copy";;
  --project) TARGET="$(cd "$2" && pwd)/.claude"; shift;;
  --update) DO_UPDATE=true;;
  -h|--help) sed -n '2,12p' "$0"; exit 0;;
  *) echo "unknown arg: $1"; exit 1;;
esac; shift; done

say(){ printf '\033[0;32m[sdlc-install]\033[0m %s\n' "$*"; }
warn(){ printf '\033[0;33m[sdlc-install]\033[0m %s\n' "$*"; }

if $DO_UPDATE; then say "updating…"; git -C "$REPO" pull --ff-only; fi

# --- grep gate: never ship personal / dogfood-specific refs ---
if grep -rnE '/home/[a-z]+/|com\.rcforte|pmt-analytics' "$REPO/skills" "$REPO/agents" 2>/dev/null \
     | grep -v 'PACKAGING.md' | grep -q .; then
  echo "ABORT: personal/dogfood references found in shipped files:"; \
  grep -rnE '/home/[a-z]+/|com\.rcforte|pmt-analytics' "$REPO/skills" "$REPO/agents" | grep -v PACKAGING.md
  exit 1
fi

mkdir -p "$TARGET/skills" "$TARGET/agents"
link_or_copy(){ local src="$1" dst="$2"; rm -rf "$dst"; if [[ "$MODE" == symlink ]]; then ln -s "$src" "$dst"; else cp -r "$src" "$dst"; fi; }

for d in "$REPO"/skills/*/; do n="$(basename "$d")"; link_or_copy "$d%/" "$TARGET/skills/$n"; done
for f in "$REPO"/agents/*.md; do n="$(basename "$f")"; link_or_copy "$f" "$TARGET/agents/$n"; done
say "installed $(ls "$REPO/skills" | wc -l | tr -d ' ') skills + $(ls "$REPO/agents" | wc -l | tr -d ' ') agents into $TARGET ($MODE)"

# --- prerequisite check ---
say "prerequisite check:"
command -v git >/dev/null && echo "  ✓ git" || warn "  ✗ git (required)"
missing=""; for s in setup-matt-pocock-skills to-prd to-issues review; do
  [[ -e "$TARGET/skills/$s" ]] && echo "  ✓ Matt-Pocock skill: $s" || missing="$missing $s"; done
[[ -n "$missing" ]] && warn "  ✗ missing Matt-Pocock prerequisite skill(s):$missing — install them (see README Prerequisites)"
echo "  ? Workflow tool — can't probe from a shell. Run '/sdlc status' in Claude Code: it reports"
echo "      'Workflow tool present → fast path' or '→ main-thread fallback' (older Claude Code)."
say "done. Next: open your repo in Claude Code and run '/sdlc onboard' (existing code) or '/sdlc setup' (greenfield)."
