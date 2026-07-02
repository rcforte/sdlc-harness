# /sdlc setup — greenfield bootstrap

Make a repo ready for the harness. **Contract: when you finish, `/sdlc run` pre-flight passes**
— the repo is a git repo, the tree is clean, and `commands.test` is GREEN (the baseline oracle).

Interactive; a human is present. (For an *existing* codebase, use `/sdlc onboard` instead — it
characterizes current behavior rather than scaffolding a skeleton.)

## 1. Git
If not a git repo, `git init` + an initial commit. Ensure a default branch (`main`).

## 2. Issue tracker + triage labels + domain layout
Conduct `/setup-matt-pocock-skills` — it writes `docs/agents/issue-tracker.md`,
`triage-labels.md`, `domain.md`, and the CLAUDE.md `## Agent skills` block. Default the tracker
to **local-markdown** (`.scratch/<feature>/issues/<NN>-<slug>.md`) for a solo/greenfield repo.
Then add the harness's terminal **`done`** state to `triage-labels.md` — it sits beyond Matt's
five *intake* roles and is set by the engine on a green commit (`done — <branch> @ <sha>`).

## 3. Stack profile
Detect the stack (languages, frameworks, build tool, test runner). Write `docs/agents/stack.md`
from `~/.claude/skills/sdlc/templates/stack.md`: fill the YAML `commands` block + `has_frontend`
and the prose seam conventions. **`test` is mandatory**; omit optional commands the stack lacks.
Author **backend-only** (`has_frontend: false`) until a frontend is actually scaffolded.

## 4. Repo CLAUDE.md + CONTEXT.md
If the repo has no CLAUDE.md of its own, create one from
`~/.claude/skills/sdlc/templates/CLAUDE.md` (overrides + pointer block — **never duplicate**
command values; point at `docs/agents/stack.md`). Seed `CONTEXT.md` from the template stub.

## 5. Walking skeleton (the green baseline)
Scaffold the **thinnest runnable app** so the baseline compiles and one test passes:
- **Spring Boot backend:** one `@SpringBootApplication` class + the build file (pom.xml /
  build.gradle) + a single `contextLoads` test.
- Generalize per detected stack: the smallest "it builds and one test is green" skeleton.

Run `commands.test`; confirm **GREEN**. Commit the skeleton.

## 6. Confirm
Report: tree clean, `commands.test` green, config + skeleton written. The repo is ready for
`/sdlc feature` → `/sdlc run`.

**Do not author feature issues here** — that's `/sdlc feature`. `setup` only bootstraps.
