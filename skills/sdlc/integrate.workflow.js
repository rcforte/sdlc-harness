export const meta = {
  name: 'sdlc-integrate',
  description:
    "Pre-merge full-stack integration gate (§13.L): assemble a multi-context feature's done slices on integration/<feature>, run the full-stack e2e, report a merge verdict; escalate-only on red. The human merges — the harness never does.",
  phases: [
    { title: 'Assemble', detail: 'integration/<feature> off current main + merge done slices in Blocked-by order' },
    { title: 'Full-stack e2e', detail: 'start.sh → run_tests.sh --headless → stop.sh (always)' },
    { title: 'Verdict', detail: 'green = merge candidate; red = escalate + retain branch' },
  ],
}

// ---- schemas ----

const ASSEMBLE = {
  type: 'object',
  required: ['assembled'],
  properties: {
    assembled: { type: 'boolean' },
    branch: { type: 'string' }, // integration/<feature>
    defaultBranch: { type: 'string' }, // main/master — the eventual merge target
    contexts: { type: 'array', items: { type: 'string' } }, // distinct Context values among slices
    mergedSlices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          context: { type: 'string' },
          branch: { type: 'string' },
          sha: { type: 'string' },
        },
      },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { slice: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
      },
    },
    reason: { type: 'string' }, // why assembled:false (incomplete | single-context | conflict | unknown)
  },
}

const E2E = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean' },
    total: { type: 'number' },
    failed: { type: 'number' },
    failingSpecs: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }, // e.g. "start.sh failed to come up"
  },
}

// ---- args (defensive: the Workflow tool may deliver args as a JSON string) ----

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
const feature = (_args && _args.feature) || null
// Explicit ad-hoc slice set (e.g. a cross-context pair from the 'triage' bucket that shares no feature
// slug): a list of '<feature>/<NN>-<slug>' issue ids. Either `feature` OR `issues` must be provided.
const issues = Array.isArray(_args && _args.issues) ? _args.issues.filter(Boolean) : null
const runId = (_args && _args.runId) || 'integrate-unknown'
// Name for the integration branch + report: the feature slug when globbing a feature, else an explicit
// label (or 'adhoc') for an ad-hoc slice set. `name` drives 'integration/<name>' and the report file.
const name = feature || (_args && _args.label) || 'adhoc'

if (!feature && !(issues && issues.length)) {
  log('Integrate HALT: provide args.feature (glob a feature) OR args.issues (explicit <feature>/<NN>-<slug> list)')
  return { feature: name, runId, halted: true, reason: 'no feature or issues provided' }
}

// The assembler resolves slices either from an explicit list or by globbing the feature's issue dir.
const sliceSource = issues
  ? `Integrate EXACTLY these explicit slices — an ad-hoc cross-context set (e.g. from the 'triage' ` +
    `bucket) that shares no single feature slug: ${JSON.stringify(issues)}. For each id ` +
    `'<feat>/<NN>-<slug>' read \`.scratch/<feat>/issues/<NN>-<slug>.md\` (its Context + '## Blocked by') ` +
    `and use its slice branch 'slice/<feat>/<NN>-<slug>'. Integrate ONLY these — ignore any other slice.`
  : `List the feature's slices: read each \`.scratch/${name}/issues/<NN>-<slug>.md\` from the CURRENT ` +
    `tree for its id, Context, and '## Blocked by'; its slice branch is 'slice/${name}/<NN>-<slug>'.`

// ---- assemble ----

phase('Assemble')
const asm = await agent(
  `You are the SDLC \`/sdlc integrate\` ASSEMBLER for '${name}'. Pre-merge gate: build a ` +
    `throwaway integration branch from a set of done slices. Do NOT push; do NOT merge to the ` +
    `default branch.\n\n` +
    `1. ${sliceSource} The engine records 'done' on the SLICE BRANCH, not on the queue ` +
    `branch — so for EACH slice verify (a) its branch exists (\`git rev-parse --verify\`) and (b) the ` +
    `issue ON THAT BRANCH (\`git show <branch>:<issue-path>\`) carries ` +
    `\`Status: done — <branch> @ <sha>\`; take the sha from there. If a slice branch is missing or not ` +
    `marked done on its branch, return assembled:false, reason:'incomplete — <which>'. Collect per ` +
    `slice: id, Context, branch, sha, '## Blocked by'.\n` +
    `2. Confirm the slices span **≥2 distinct Context values**. If only one, return assembled:false, ` +
    `reason:'single-context — no integration gate needed'.\n` +
    `3. Determine the default branch (\`git symbolic-ref --short refs/remotes/origin/HEAD\` else the ` +
    `local main/master). Delete any existing 'integration/${name}', then create a FRESH ` +
    `'integration/${name}' off the CURRENT default branch and check it out.\n` +
    `4. Merge each done slice branch into 'integration/${name}' in **Blocked-by topological order** ` +
    `(blockers first) with \`git merge --no-edit\`. Context-scoped slices touch disjoint dirs, so ` +
    `this is normally conflict-free. If a merge CONFLICTS, \`git merge --abort\` and return ` +
    `assembled:false with the conflicting slice + files in 'conflicts'.\n` +
    `5. Return {assembled:true, branch:'integration/${name}', defaultBranch, ` +
    `contexts:[distinct], mergedSlices:[{id,context,branch,sha}], conflicts:[]}. Leave the repo ` +
    `checked out on 'integration/${name}'. Modify no issue files.`,
  { schema: ASSEMBLE, label: `assemble:${name}`, phase: 'Assemble' }
)

if (!asm || !asm.assembled) {
  const reason = asm ? asm.reason : 'assembler agent did not return'
  log(`Integrate HALT (assemble): ${reason}`)
  await agent(
    `Write a SHORT integration report to .scratch/integrations/${name}-${runId}.md (create the ` +
      `dir; ONLY file you write). The gate did NOT run the e2e because assembly failed: ${reason}. ` +
      `If conflicts: ${JSON.stringify((asm && asm.conflicts) || [])}. Next human action depends on the ` +
      `reason (complete the slices / single-context needs no gate / resolve the conflict). Modify no ` +
      `other file.`,
    { label: 'report:halt', phase: 'Assemble' }
  )
  return { feature: name, runId, halted: true, verdict: 'not-run', reason, branch: (asm && asm.branch) || null }
}
log(
  `Assembled 'integration/${name}' from ${asm.mergedSlices.length} slice(s) across ` +
    `${(asm.contexts || []).length} contexts — running full-stack e2e.`
)

// ---- full-stack e2e ----

phase('Full-stack e2e')
const e2e = await agent(
  `You are the SDLC \`/sdlc integrate\` E2E runner. The branch 'integration/${name}' is checked ` +
    `out with all of the feature's slices merged. Run the FULL-STACK acceptance suite against the ` +
    `real, running stack:\n` +
    `1. \`./start.sh\` — bring up the stack (Docker + TimescaleDB + Kafka + analytics gRPC + backend ` +
    `+ frontend, health-gated). Wait until it is healthy.\n` +
    `2. \`./run_tests.sh --headless\` — the WHOLE Playwright suite against the real backend/analytics.\n` +
    `3. ALWAYS run \`./stop.sh\` afterward — even if start.sh hung or the e2e failed — to tear the ` +
    `stack down and free ports.\n` +
    `Capture the result. Return {passed:<every spec green>, total, failed, failingSpecs:[names], ` +
    `notes}. If start.sh cannot bring the stack up, return passed:false with notes explaining (still ` +
    `run stop.sh). Read-only on source — do not edit code.`,
  { schema: E2E, label: `e2e:${name}`, phase: 'Full-stack e2e' }
)

// Return the working tree to the default branch. The assembler + e2e run ON 'integration/<name>', but
// leaving the tree there is a footgun: the caller's next commits would land on the integration branch
// instead of the default branch. The branch is NOT deleted — it is retained for the human to review +
// merge (green) or diagnose (red); only the checkout moves back.
if (asm.defaultBranch) {
  await agent(
    `Run \`git switch ${asm.defaultBranch}\` to return the working tree to the default branch. Do NOT ` +
      `delete 'integration/${name}' — it is retained for the human to review/merge or diagnose. The e2e ` +
      `already ran and the stack is down; edit no files and do nothing else.`,
    { label: 'restore-branch', phase: 'Verdict' }
  )
}

// ---- verdict ----

phase('Verdict')
const passed = !!(e2e && e2e.passed)

if (passed) {
  await agent(
    `Write the integration report to .scratch/integrations/${name}-${runId}.md (create the dir; ` +
      `ONLY file you write). **GREEN** verdict for feature '${name}': assembled on ` +
      `'${asm.branch}' from slices ${JSON.stringify(asm.mergedSlices)} (contexts ` +
      `${JSON.stringify(asm.contexts)}); full-stack e2e PASSED (${e2e.total || '?'} specs). Next human ` +
      `action: review '${asm.branch}' and merge it to '${asm.defaultBranch || 'the default branch'}' ` +
      `— an atomic feature landing (what was tested == what lands). Modify no issue files.`,
    { label: `report:green:${name}`, phase: 'Verdict' }
  )
  log(`✓ ${name}: integration e2e GREEN — '${asm.branch}' is the merge candidate.`)
  return { feature: name, runId, halted: false, verdict: 'pass', branch: asm.branch, defaultBranch: asm.defaultBranch, e2e }
}

// red — escalate-only (L5): no auto-repair (cross-context fix-location is ambiguous)
await agent(
  `The full-stack e2e FAILED for feature '${name}'. ESCALATE-ONLY (no auto-repair — a cross-context ` +
    `contract mismatch has an ambiguous fix-location, a human/product call). Do exactly this:\n` +
    `1. Write .scratch/integrations/${name}-${runId}.md (create the dir): **RED** verdict; the ` +
    `failing specs ${JSON.stringify((e2e && e2e.failingSpecs) || [])}; e2e notes ` +
    `${JSON.stringify((e2e && e2e.notes) || '')}; the assembled slice SHAs ` +
    `${JSON.stringify(asm.mergedSlices)}; and that 'integration/${name}' is **RETAINED** as the ` +
    `reproduction. State the next human action: diagnose which slice owns the contract, repair it, set ` +
    `it back to ready-for-agent/re-run /sdlc run, then re-run /sdlc integrate ${name}.\n` +
    `2. Do NOT merge. Do NOT delete 'integration/${name}'. Do NOT change any slice's Status ` +
    `(each is legitimately done in isolation). This report is the feature-level ready-for-human signal.`,
  { label: `escalate:${name}`, phase: 'Verdict' }
)
log(`✗ ${name}: integration e2e RED — escalated; 'integration/${name}' retained for diagnosis.`)
return { feature, runId, halted: false, verdict: 'fail', branch: asm.branch, e2e }
