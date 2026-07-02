export const meta = {
  name: 'sdlc-run',
  description:
    'Drain the ready-for-agent queue across contexts: per issue, developer builds → tester verifies → N≤2 bounce → commit on pass, else escalate. Routes each issue to its context stack profile and drains per-context lanes concurrently (multi-context §13.K + parallel lanes §13.M). Writes a run report.',
  phases: [
    { title: 'Pre-flight', detail: 'tree clean + per-context CONTEXT-MAP resolution + touched-context baselines + topo-sort the queue' },
    { title: 'Build & verify', detail: 'per-context lanes (concurrent, worktree-isolated): developer → tester → N≤2 bounce → commit|escalate, cross-lane Blocked-by sync' },
    { title: 'Report', detail: 'write .scratch/runs/<runId>.md' },
  ],
}

// ---- structured-output schemas (the only contracts the script depends on) ----

const PREFLIGHT = {
  type: 'object',
  required: ['ok', 'issues'],
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    workingTreeClean: { type: 'boolean' },
    baselineGreen: { type: 'boolean' },
    multiContext: { type: 'boolean' }, // true when a CONTEXT-MAP.md was found and parsed
    defaultBranch: { type: 'string' }, // resolved default branch name (the integrity guard's subject)
    defaultBranchSha: { type: 'string' }, // its HEAD sha BEFORE the run — slices must never advance it
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'path', 'branch', 'context', 'stackProfile', 'baseBranch'],
        properties: {
          id: { type: 'string' },
          path: { type: 'string' },
          prdPath: { type: 'string' },
          branch: { type: 'string' },
          blockedBy: { type: 'array', items: { type: 'string' } },
          context: { type: 'string' }, // resolved context name ('default' in a single-context repo)
          stackProfile: { type: 'string' }, // path to this context's stack profile (the per-slice oracle)
          baseBranch: { type: 'string' }, // K9: same-context-blocker tip if unmerged, else the default branch
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
}

const BUILD = {
  type: 'object',
  required: ['committed'],
  properties: {
    committed: { type: 'boolean' },
    sha: { type: 'string' },
    branch: { type: 'string' },
    notes: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['pass', 'defects'],
  properties: {
    pass: { type: 'boolean' },
    score: { type: 'number' },
    advisory: { type: 'boolean' },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          location: { type: 'string' },
          fix: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const INTEGRITY = {
  type: 'object',
  required: ['isolationBreach', 'treeWasDirty'],
  properties: {
    isolationBreach: { type: 'boolean' }, // a shipped slice's work leaked onto the default branch
    leakedSlices: { type: 'array', items: { type: 'string' } }, // ids of shipped slices whose branch is 0-ahead
    treeWasDirty: { type: 'boolean' }, // main working tree had stray tracked changes
    cleaned: { type: 'array', items: { type: 'string' } }, // paths restored via `git checkout --`
    notes: { type: 'string' },
  },
}

// ---- subagent prompts ----

function developerPrompt(issue, defects, attempt) {
  const repair = defects
    ? `\n\nThis is repair attempt ${attempt}. The independent tester REFUTED the previous` +
      ` attempt with these defects — fix ALL of them, do not regress what passed:\n` +
      JSON.stringify(defects, null, 2)
    : ''
  return (
    `You are the \`developer\` building SDLC slice ${issue.id} (context: ${issue.context}).\n` +
    `Issue: ${issue.path}\nPRD: ${issue.prdPath || '(none)'}\n` +
    `Domain: CONTEXT.md + docs/adr/. Stack profile for THIS slice's context: ${issue.stackProfile} ` +
    `(authoritative for all commands + test-seam conventions — resolve commands.* + the seam from it, ` +
    `never assume a fixed tool). Honor the repo CLAUDE.md for style/overrides.\n\n` +
    `You OWN git for this slice:\n` +
    `1. ISOLATION INVARIANT (§13.M — non-negotiable): all work lands on '${issue.branch}', and the ` +
    `default branch (\`git symbolic-ref --short refs/remotes/origin/HEAD\`, else the current main/master) ` +
    `must NOT move. Create branch '${issue.branch}' OFF base '${issue.baseBranch}' and \`git switch\` to ` +
    `it (K9: the base already carries any same-context predecessor's code; cross-context dependencies are ` +
    `mocked at the seam, so the base is the default branch in that case). If '${issue.branch}' already ` +
    `exists, \`git switch\` to it. NEVER commit while HEAD is the default branch or detached at its tip: ` +
    `before EVERY commit, assert \`git branch --show-current\` == '${issue.branch}' — if not, switch first.\n` +
    `2. Build outside-in via /outside-in-tdd. The issue's '## Acceptance criteria' Gherkin scenarios ARE ` +
    `the contract: each becomes one failing acceptance test at the highest seam (per ${issue.stackProfile}), ` +
    `driven green by inner unit cycles. Never invent AC.\n` +
    `3. Self-review via /review.\n` +
    `4. When commands.test (from ${issue.stackProfile}) is green: re-assert HEAD == '${issue.branch}' (NOT ` +
    `the default branch), then COMMIT to it with a message referencing ${issue.id}, then set the issue's ` +
    `'Status:' line to 'done — ${issue.branch} @ <sha>' using the real commit sha — this Status edit and ` +
    `its commit also land on '${issue.branch}', never on the default branch's working tree.\n` +
    `Return {committed, sha, branch:'${issue.branch}', notes}. If you cannot reach green, return ` +
    `committed:false with notes explaining the blocker — do NOT commit a red tree.` +
    repair
  )
}

function testerPrompt(issue, build) {
  return (
    `You are the independent \`tester\` for SDLC slice ${issue.id} (context: ${issue.context}). You did ` +
    `NOT build it; verify it cold. The developer built it on branch '${build.branch}'.\n` +
    `Issue: ${issue.path}\nStack profile: ${issue.stackProfile}.\n\n` +
    `Checkout '${build.branch}'. Map every '## Acceptance criteria' Gherkin scenario to an observable ` +
    `check. Run ONLY commands.test from ${issue.stackProfile} (K4: this is an ISOLATED per-slice ` +
    `verification — do NOT run commands.e2e; the real cross-context full-stack e2e is a separate ` +
    `post-merge integration gate, not part of this loop). Exercise the API/UI per the AC, probe edges, ` +
    `and enforce the characterization net if existing behavior was touched. Return a VERDICT: pass=true ` +
    `ONLY if every AC is verified and commands.test is green; else pass=false with concrete defects ` +
    `(criterion, severity, location, fix, evidence). Read-only on source — run and observe, never edit ` +
    `production code.`
  )
}

// ---- engine ----

// `args` may arrive as an object OR as a JSON string depending on how the Workflow tool
// serialized it — normalize defensively so scope/runId thread either way.
const _args =
  args && typeof args === 'object'
    ? args
    : typeof args === 'string'
      ? (() => {
          try {
            return JSON.parse(args)
          } catch {
            return {}
          }
        })()
      : {}
const scope = (_args && _args.scope) || 'all'
const runId = (_args && _args.runId) || 'run-unknown'
const N = 2

phase('Pre-flight')
const pf = await agent(
  `You are the SDLC \`run\` pre-flight gate for a possibly MULTI-CONTEXT repo (§13.K).\n\n` +
    `STEP 0 — Resolve contexts. If 'docs/agents/CONTEXT-MAP.md' EXISTS, parse it into a registry mapping ` +
    `each context-name → {stackProfile: that context's stack-profile path, testCmd: that context's ` +
    `commands.test}. (E.g. backend → docs/agents/stack.md, frontend → docs/agents/stack.frontend.md, ` +
    `analytics → docs/agents/stack.analytics.md; read each stack profile's YAML 'commands.test'.) Set ` +
    `multiContext:true. If CONTEXT-MAP.md is ABSENT, this is a SINGLE-context repo: the sole context is ` +
    `'default' with stackProfile 'docs/agents/stack.md' (fall back to extracting commands.test from it, ` +
    `or from CLAUDE.md/the repo if that is also absent, and note the fallback); multiContext:false.\n\n` +
    `STEP 1 — Working tree must be clean (\`git status --porcelain\` empty across the repo). If dirty, ` +
    `return ok:false with a reason and proceed no further.\n\n` +
    `STEP 2 — Read the queue: every .scratch/<feature>/issues/<NN>-<slug>.md whose 'Status:' line is ` +
    `'ready-for-agent'. For each, read its 'Context:' line. RESOLUTION: if multiContext, every ready ` +
    `issue MUST carry a 'Context:' whose value is a known context — a missing or unknown Context is a ` +
    `HALT (return ok:false naming the issue). If NOT multiContext, ignore Context: lines and assign every ` +
    `issue context 'default'.\n\n` +
    `STEP 3 — Apply scope. scope='${scope}'. If 'all', keep all ready issues. Else if it equals a known ` +
    `context name, keep only issues in that context. Otherwise treat it as a single issue id ` +
    `('<feature>/<NN>-<slug>') and keep only that issue.\n\n` +
    `STEP 4 — Buildability + topo-sort. Parse each '## Blocked by'. A ready issue is BUILDABLE iff every ` +
    `blocker is either 'Status: done' OR another ready issue in this scoped set. DROP any whose blocker is ` +
    `neither (record in 'skipped' with a reason). Topologically sort the buildable set so blockers precede ` +
    `dependents.\n\n` +
    `STEP 5 — Touched-context baselines (K5). For EACH DISTINCT context that has ≥1 buildable issue, run ` +
    `that context's commands.test ONCE (dedup per context; a context with no buildable issue is NOT run). ` +
    `If ANY touched baseline exits non-zero, return ok:false with a reason naming the red context — go no ` +
    `further. Set baselineGreen accordingly.\n\n` +
    `STEP 6 — Branch base per issue (K9). For each buildable issue, compute baseBranch: among its blockers ` +
    `that resolve to the SAME context as the issue, take the topologically-LAST one (the chain tip); if it ` +
    `exists AND its slice branch 'slice/<feature>/<NN>-<slug>' is NOT already merged into the default ` +
    `branch, baseBranch = that branch (the dependent needs its predecessor's real code). Otherwise ` +
    `baseBranch = the repo's default branch name (cross-context blockers are behaviourally mocked at the ` +
    `seam, so they do NOT change the base). SHARED-KERNEL EXCEPTION: if a CROSS-context blocker's issue ` +
    `carries a 'Shared-kernel:' line (it changes a shared published contract both sides COMPILE against — ` +
    `e.g. 'Shared-kernel: proto' for a new gRPC RPC in proto/), the dependent CANNOT compile against a mock ` +
    `of a stub that does not exist yet; base it off that blocker's UNMERGED slice branch instead (stack it), ` +
    `taking the topologically-last such blocker. Determine the default branch from \`git symbolic-ref ` +
    `--short refs/remotes/origin/HEAD\` or the current main/master.\n\n` +
    `Return for each buildable issue: {id:'<feature>/<NN>-<slug>', path, prdPath, ` +
    `branch:'slice/<feature>/<NN>-<slug>', blockedBy:[ids], context, stackProfile, baseBranch}. Also set ` +
    `workingTreeClean, baselineGreen, multiContext, and — for the post-run integrity guard — defaultBranch ` +
    `(the resolved default branch name) and defaultBranchSha (\`git rev-parse <defaultBranch>\` NOW, before ` +
    `any slice runs). If the tree is dirty, any touched baseline is red, or ` +
    `any in-scope issue's Context is unknown, return ok:false with a reason. You may run git + the test ` +
    `commands; do NOT modify any files.`,
  { schema: PREFLIGHT, label: 'preflight', phase: 'Pre-flight' }
)

if (!pf || !pf.ok) {
  const reason = pf ? pf.reason : 'pre-flight agent failed to return'
  log(`Pre-flight HALT: ${reason}`)
  return {
    runId,
    halted: true,
    reason,
    shipped: [],
    escalated: [],
    skipped: (pf && pf.skipped) || [],
  }
}
const ctxCount = new Set(pf.issues.map((i) => i.context)).size
log(
  `Pre-flight green — ${pf.issues.length} buildable across ${ctxCount} context(s)` +
    `${pf.multiContext ? '' : ' (single-context)'}, ${(pf.skipped || []).length} skipped.`
)

phase('Build & verify')
const shipped = []
const escalated = []
const skipped = (pf.skipped || []).slice()
const rows = []

// Build one issue: developer → tester → N≤2 bounce → ship | escalate. Each dev/tester agent runs in
// an isolated git WORKTREE (§13.M4) so concurrent lanes never clobber a shared working tree; commits
// + branches land in the shared .git, so K9 same-context stacking still works across worktrees. The
// escalate agent edits the shared .scratch queue on the MAIN tree, so it gets NO worktree. Returns
// { shipped }.
async function buildIssue(issue) {
  if (budget.total && budget.remaining() < 40000) {
    log(`Budget exhausted before ${issue.id} — skipping.`)
    skipped.push({ id: issue.id, reason: 'budget' })
    rows.push({ id: issue.id, context: issue.context, attempts: 0, verdict: 'skipped', reason: 'budget' })
    return { shipped: false }
  }

  let defects = null
  let verdict = null
  let build = null
  let attempt = 0

  while (attempt < N) {
    attempt++
    build = await agent(developerPrompt(issue, defects, attempt), {
      agentType: 'developer',
      schema: BUILD,
      isolation: 'worktree',
      label: `dev:${issue.id} [${issue.context}] (${attempt}/${N})`,
      phase: 'Build & verify',
    })
    if (!build) {
      defects = [{ criterion: 'agent', severity: 'critical', fix: 'developer agent did not return' }]
      continue
    }
    if (!build.committed) {
      defects = [
        { criterion: 'build', severity: 'critical', fix: build.notes || 'developer did not reach green' },
      ]
      continue
    }
    verdict = await agent(testerPrompt(issue, build), {
      agentType: 'tester',
      schema: VERDICT,
      isolation: 'worktree',
      label: `test:${issue.id} [${issue.context}] (${attempt}/${N})`,
      phase: 'Build & verify',
    })
    if (verdict && verdict.pass) break
    defects = verdict ? verdict.defects : [{ criterion: 'agent', severity: 'critical', fix: 'tester agent did not return' }]
    log(`${issue.id}: tester refuted (attempt ${attempt}/${N}).`)
  }

  if (verdict && verdict.pass && build && build.committed) {
    shipped.push({ id: issue.id, context: issue.context, sha: build.sha, branch: build.branch })
    rows.push({ id: issue.id, context: issue.context, attempts: attempt, verdict: 'pass', sha: build.sha, branch: build.branch })
    log(`✓ ${issue.id} [${issue.context}] shipped on ${build.branch} @ ${build.sha || '?'}`)
    return { shipped: true }
  }

  const finalDefects = (verdict && verdict.defects) || defects || []
  escalated.push({ id: issue.id, context: issue.context, defects: finalDefects })
  rows.push({ id: issue.id, context: issue.context, attempts: attempt, verdict: 'escalated', defects: finalDefects })
  await agent(
    `Escalate SDLC issue ${issue.id} (file ${issue.path}). Set its 'Status:' line to ` +
      `'ready-for-human'. Append under '## Comments' a dated note summarizing these ` +
      `unresolved tester defects after ${N} attempts: ${JSON.stringify(finalDefects)}. Leave ` +
      `the slice branch '${issue.branch}' unmerged. Modify no other issue.`,
    { label: `escalate:${issue.id}`, phase: 'Build & verify' }
  )
  log(`✗ ${issue.id} [${issue.context}] escalated to ready-for-human after ${attempt} attempt(s).`)
  return { shipped: false }
}

// ---- §13.M: per-context lanes, concurrent, with cross-lane Blocked-by sync ----
// One completion promise per in-run issue; a blocker already 'done' before this run (not in the
// buildable set) resolves immediately as shipped. A lane awaits each issue's blockers (same- OR
// cross-context) before building it, so the topo order holds ACROSS lanes (M2: lanes are a
// context-grouped DAG, not independent pipelines).
const resolvers = new Map()
const completion = new Map()
for (const i of pf.issues) completion.set(i.id, new Promise((res) => resolvers.set(i.id, res)))
const inRun = new Set(pf.issues.map((i) => i.id))
const blockerDone = (bid) => (inRun.has(bid) ? completion.get(bid) : Promise.resolve({ shipped: true }))

// Group issues into per-context lanes; pf.issues is globally topo-sorted, so each lane's slice
// preserves intra-context order (M1).
const lanes = new Map()
for (const i of pf.issues) {
  if (!lanes.has(i.context)) lanes.set(i.context, [])
  lanes.get(i.context).push(i)
}
log(`Draining ${lanes.size} context lane(s) concurrently (§13.M): ${[...lanes.keys()].join(', ')}.`)

// Lanes run concurrently (parallel barrier); each lane is SERIAL internally and blocks on its
// cross-lane dependencies via the completion promises. The try/finally guarantees every issue's
// completion resolves, so a failure never deadlocks a lane awaiting it.
await parallel(
  [...lanes.values()].map((laneIssues) => async () => {
    for (const issue of laneIssues) {
      let result = { shipped: false }
      try {
        const blockerResults = await Promise.all((issue.blockedBy || []).map(blockerDone))
        if (blockerResults.some((b) => !b || !b.shipped)) {
          log(`Skipping ${issue.id} [${issue.context}] — a blocker did not ship.`)
          skipped.push({ id: issue.id, reason: 'blocker-failed' })
          rows.push({ id: issue.id, context: issue.context, attempts: 0, verdict: 'skipped', reason: 'blocker-failed' })
        } else {
          result = await buildIssue(issue)
        }
      } catch (err) {
        log(`Lane error on ${issue.id}: ${(err && err.message) || err}`)
        const d = [{ criterion: 'lane', severity: 'critical', fix: String((err && err.message) || err) }]
        escalated.push({ id: issue.id, context: issue.context, defects: d })
        rows.push({ id: issue.id, context: issue.context, attempts: 0, verdict: 'escalated', defects: d })
      } finally {
        resolvers.get(issue.id)(result)
      }
    }
  })
)

phase('Report')
await agent(
  `Write the SDLC run report to .scratch/runs/${runId}.md (create .scratch/runs/ if needed; ` +
    `this is the ONLY file you write). Header: run id ${runId}, scope '${scope}', counts ` +
    `${shipped.length} shipped / ${escalated.length} escalated / ${skipped.length} skipped. ` +
    `Then a markdown table, one row per issue, from this data (do not invent rows): ` +
    `${JSON.stringify(rows)}. Columns: issue, context, attempts, verdict, sha/branch (if shipped), ` +
    `defects (if escalated), reason (if skipped). Close with a 2–3 sentence prose summary and, ` +
    `if anything escalated, the next human action. If any shipped feature's slices span ≥2 contexts, ` +
    `note that a pre-merge full-stack integration gate (/sdlc integrate) is owed before merge.`,
  { label: 'report', phase: 'Report' }
)

// §13.M worktree cleanup: dev/tester ran in isolated worktrees (M4). The harness only auto-removes
// worktrees that did NO work, so committed lane worktrees LEAK — remove this run's worktrees now so
// the next pre-flight sees a clean tree. Slice branches PERSIST (for the human scope-out); only the
// transient working dirs go.
await agent(
  `Clean up the SDLC run's git worktrees. Run \`git worktree list --porcelain\`; for EVERY worktree ` +
    `whose path is under '.claude/worktrees/' (NOT the main repo working tree), run ` +
    `\`git worktree remove --force <path>\`, then \`git worktree prune\`. ALSO \`git branch -D\` any ` +
    `leftover scaffold branch named 'worktree-wf_*' the removed worktrees left behind — but NEVER a ` +
    `'slice/*' branch (those persist for scope-out). Do NOT touch the main working tree or ` +
    `any tracked file. This must leave \`git status --porcelain\` clean for the next pre-flight.`,
  { label: 'worktree-cleanup', phase: 'Report' }
)

// §13.M isolation invariant: each shipped slice's work must live on its own slice/* branch (preserved
// for scope-out), never leak onto the default branch. A first-issue-in-lane base bug once committed a
// slice straight to the default branch (run-20260630T1631Z), bypassing scope-out. The PRECISE signature
// of that leak is a shipped slice whose branch is 0 commits ahead of the pre-run default sha — its work
// went to the default branch instead of its branch. We detect THAT (not "did the default branch move?",
// which false-positives whenever the human legitimately commits to / merges into the default branch
// while the run is in flight — run-20260702T1212Z). Plus restore any stray tracked file in the main tree.
let integrity = null
const shippedForGuard = shipped.map((s) => ({ id: s.id, branch: s.branch }))
if (pf.defaultBranchSha && shippedForGuard.length) {
  integrity = await agent(
    `SDLC run integrity check (§13.M slice-isolation invariant). The default branch was at ` +
      `'${pf.defaultBranchSha}' BEFORE this run. Each SHIPPED slice's commits must live on its OWN ` +
      `slice/* branch, not on the default branch.\n` +
      `Shipped slices: ${JSON.stringify(shippedForGuard)}.\n` +
      `1. For EACH shipped slice, run \`git rev-list --count ${pf.defaultBranchSha}..<branch>\`. A shipped ` +
      `slice MUST be >= 1 (its commits are on its branch). If it is 0, that slice committed its work ` +
      `DIRECTLY to the default branch instead of its branch — an isolation breach; add its id to ` +
      `leakedSlices. (Do NOT flag the default branch merely advancing: the human legitimately committing ` +
      `to / merging into it while the run is in flight is NOT a breach — only a shipped slice branch that ` +
      `lacks its own commits is. Do not rewrite history.)\n` +
      `2. \`git status --porcelain\`. For any stray MODIFIED tracked file in the main tree (e.g. an issue ` +
      `'Status:' edit that escaped a worktree), \`git checkout -- <path>\` to restore it (canonical version ` +
      `is on the slice branch); record in cleaned. Leave untracked/ignored files alone. Modify nothing else.\n` +
      `Return {isolationBreach:<leakedSlices non-empty>, leakedSlices, treeWasDirty, cleaned, notes}.`,
    { schema: INTEGRITY, label: 'integrity-guard', phase: 'Report' }
  )
  if (integrity && integrity.isolationBreach) {
    log(
      `⚠️ ISOLATION BREACH: shipped slice(s) leaked their work onto the default branch (branch 0-ahead), ` +
        `bypassing scope-out: ${JSON.stringify(integrity.leakedSlices || [])}. Review before merge.`
    )
  }
  if (integrity && integrity.treeWasDirty) {
    log(`Restored stray main-tree changes left by the run: ${JSON.stringify(integrity.cleaned || [])}.`)
  }
}

return {
  runId,
  halted: false,
  scope,
  shipped,
  escalated,
  skipped,
  integrity,
  summary: `${shipped.length} shipped, ${escalated.length} escalated, ${skipped.length} skipped`,
}
