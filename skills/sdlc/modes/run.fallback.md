# /sdlc run — main-thread fallback engine (no `Workflow` tool)

Use this ONLY when the `Workflow` tool is unavailable (older Claude Code). It reproduces
`run.workflow.js`'s deterministic loop from the **main thread** using the `Agent` tool, **sequentially**
(one issue at a time — no parallel lanes), in the **foreground** (it blocks the chat), with **no**
journal/replay or token budget. The per-issue contract, slice isolation, and scope-out gate are
**identical** to the fast path — only the orchestration differs. Announce the degradation to the user.

The `developer` and `tester` agent personas live in `~/.claude/agents/` (installed with this harness);
spawn them with the `Agent` tool's `subagent_type` set to `developer` / `tester`.

## 1. Pre-flight (main thread — do it yourself with Bash/reads; HALT on any failure)
- **Tree clean:** `git status --porcelain` empty, else HALT.
- **Resolve contexts:** if `docs/agents/CONTEXT-MAP.md` exists, parse each context → its stack profile +
  `commands.test`; else single `default` context = `docs/agents/stack.md`.
- **Queue:** every `.scratch/<feature>/issues/<NN>-<slug>.md` with `Status: ready-for-agent`. Apply
  `scope` (`all` | `<context>` | `<issue-id>`). Resolve each issue's `Context:`; unknown → HALT.
- **Buildable + topo-sort:** an issue is buildable iff every `## Blocked by` blocker is `done` or another
  in-scope ready issue; drop the rest (record as skipped). Topo-sort so blockers precede dependents.
- **Baselines (once per touched context):** run each touched context's `commands.test`; any red → HALT.
- **Base branch per issue (K9):** same-context blocker's slice tip if unmerged, else the default branch.
  **Shared-kernel exception:** if a cross-context blocker's issue carries a `Shared-kernel:` line, base on
  that blocker's slice branch (so the dependent compiles against the regenerated stubs).
- Capture the default branch + its current sha (for the integrity check in step 4).

## 2. Per-issue loop (SEQUENTIAL, in topo order)
For each buildable issue, `N = 2` max attempts:
1. Spawn a **`developer`** agent (`subagent_type: developer`) with the developer contract: build the slice
   OUTSIDE-IN on its own `slice/<feature>/<NN>-<slug>` branch off its baseBranch, drive the issue's
   `## Acceptance criteria` Gherkin green via `commands.test`, self-review, **commit on green**, flip the
   issue `Status:` to `done — <branch> @ <sha>`. **Never commit to the default branch**; assert
   `git branch --show-current` == the slice branch before each commit. On repair attempts, pass the
   prior tester's defects. If it returns `committed:false` → treat as a failing attempt.
2. If committed, spawn an **independent `tester`** agent (`subagent_type: tester`): check out the slice
   branch, map each Gherkin scenario to an observable check, run ONLY `commands.test` (not e2e), return a
   VERDICT (pass + defects). Pass → **shipped**, break. Fail → feed defects back (attempt++).
3. After `N` attempts without a pass → **escalate**: set the issue `Status: ready-for-human`, append the
   unresolved defects under `## Comments`, leave the slice branch unmerged, skip its dependents.

## 3. Report
Write `.scratch/runs/<runId>.md`: counts (shipped/escalated/skipped) + one row per issue
(id · context · attempts · verdict · sha/branch · defects/reason) + a short prose summary and the next
human action. Stamp `<runId>` = `run-<UTC>` (get it with `date -u`).

## 4. Integrity (main thread)
For EACH shipped slice, `git rev-list --count <pre-run-default-sha>..<slice-branch>` must be ≥ 1 (its
work is on its branch, not leaked to the default branch). If any is 0 → report an isolation breach.
Restore any stray tracked file in the main tree (`git checkout -- <path>`).

## After it returns
Same as the fast path: slices land on `slice/<…>` branches for the human **scope-out** (you never merge);
if a shipped feature spans ≥2 contexts, remind the user a `/sdlc integrate` gate is owed before merge.
