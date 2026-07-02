export const meta = {
  name: 'sdlc-hunt',
  description:
    'Autonomous intake (§13.H): parallel adversarial probers find candidate defects, an INDEPENDENT verifier reproduces each as a failing test at the seam, reproduced defects are deduped + filed (ready-for-agent | needs-triage). Produces issues; run consumes them.',
  phases: [
    { title: 'Probe', detail: 'parallel read-only probers, one per lens → candidate defects' },
    { title: 'Verify', detail: 'independent reproduce-verifier builds a failing test per candidate' },
    { title: 'File', detail: 'dedup vs open issues + file reproduced defects' },
    { title: 'Report', detail: 'write .scratch/hunts/<runId>.md' },
  ],
}

// ---- schemas ----

const SETUP = {
  type: 'object',
  required: ['seams', 'hasFrontend'],
  properties: {
    seams: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          context: { type: 'string' },
          stackProfile: { type: 'string' },
          seam: { type: 'string' },
        },
      },
    },
    hasFrontend: { type: 'boolean' },
    openIssues: { type: 'array', items: { type: 'string' } }, // titles, for dedup
  },
}

const CANDIDATES = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          location: { type: 'string' }, // file:line
          context: { type: 'string' },
          hypothesis: { type: 'string' }, // how it fails
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['reproduced'],
  properties: {
    reproduced: { type: 'boolean' },
    failingTest: { type: 'string' }, // the test code/path, or why it couldn't be built
    intentClear: { type: 'boolean' }, // unambiguously a defect vs established behavior
    contradictsPin: { type: 'boolean' }, // contradicts an existing *Characterization* pin
    notes: { type: 'string' },
  },
}

const FILED = {
  type: 'object',
  properties: {
    ready: { type: 'array', items: { type: 'string' } },
    triage: { type: 'array', items: { type: 'string' } },
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
const scope = (_args && _args.scope) || 'all'
const runId = (_args && _args.runId) || 'hunt-unknown'

// ---- setup: resolve the seam(s) + has_frontend + open issues for dedup ----

phase('Probe')
const setup = await agent(
  `You are the \`/sdlc hunt\` setup gate. Scope: '${scope}'.\n` +
    `1. If 'docs/agents/CONTEXT-MAP.md' exists, read it (+ each context's stack profile) to list the ` +
    `contexts IN SCOPE (scope='all' → all; a context name → just it; a path → the owning context) as ` +
    `{context, stackProfile, seam} where 'seam' is that context's outermost observable boundary (REST ` +
    `'/api/*', gRPC service, CLI, etc.). If no CONTEXT-MAP, use 'docs/agents/stack.md' as the sole ` +
    `'default' context. Set hasFrontend from the profiles (has_frontend).\n` +
    `2. List the TITLES (first heading) of every open issue under .scratch/**/issues/*.md — for dedup.\n` +
    `Return {seams:[{context,stackProfile,seam}], hasFrontend, openIssues:[titles]}. Read-only.`,
  { schema: SETUP, label: 'setup', phase: 'Probe' }
)

if (!setup || !setup.seams || setup.seams.length === 0) {
  log('Hunt HALT: could not resolve any seam to hunt.')
  return { runId, scope, halted: true, reason: 'no seam resolved' }
}

const LENSES = [
  'boundary / edge cases (off-by-one, empty/null, min/max, unicode, huge inputs)',
  'error handling / concurrency / idempotency (partial failure, retries, races, double-submit)',
  'state-matrix gaps (empty / loading / error / partial / over-limit states left unhandled)',
  'property / fuzz (invariants that must always hold — round-trips, conservation, ordering)',
  ...(setup.hasFrontend ? ['UI via Playwright (broken/blank states, actions with no feedback)'] : []),
]

// ---- probe → verify pipeline (each lens's candidates verified as they surface) ----

const seamsJson = JSON.stringify(setup.seams)
const perLens = await pipeline(
  LENSES,
  (lens) =>
    agent(
      `You are an adversarial PROBER. Lens: ${lens}. READ-ONLY. Hunt the code in scope ('${scope}') at ` +
        `its seams ${seamsJson} for CANDIDATE defects through THIS lens only. For each, return ` +
        `{title, location:'file:line', context, hypothesis (concretely how it fails), severity}. Do NOT ` +
        `fix and do NOT write tests here. Prefer a few HIGH-SIGNAL candidates over many guesses.`,
      { schema: CANDIDATES, label: `probe:${lens.split(' ')[0]}`, phase: 'Probe' }
    ),
  (probe, lens) =>
    parallel(
      (probe && probe.candidates ? probe.candidates : []).map((c) => () =>
        agent(
          `You are an INDEPENDENT reproduce-verifier — you did NOT probe this; verify it cold. Candidate ` +
            `defect (lens ${lens}): ${JSON.stringify(c)}. Using the context's stack profile, try to build a ` +
            `FAILING test AT THE SEAM that reproduces it — the test must FAIL against current code for the ` +
            `predicted reason (reproduce-before-file). Then judge: is it UNAMBIGUOUSLY a defect, or could it ` +
            `be established/intended behaviour? Does it CONTRADICT an existing \`*Characterization*\` pin? ` +
            `Return {reproduced, failingTest (the test, or why not), intentClear, contradictsPin, notes}. ` +
            `Read-only on production source; do NOT commit.`,
          { schema: VERDICT, label: `verify:${(c.title || '').slice(0, 32)}`, phase: 'Verify' }
        ).then((v) => ({ lens, c, v }))
      )
    )
)

const flat = perLens.flat().filter(Boolean)
const reproduced = flat.filter((x) => x.v && x.v.reproduced)
const suspected = flat.length - reproduced.length
log(`Probed ${LENSES.length} lenses → ${reproduced.length} reproduced, ${suspected} suspected/dropped.`)

// ---- file (barrier: dedup across ALL reproduced before writing) ----

phase('File')
let filed = { ready: [], triage: [] }
if (reproduced.length) {
  const payload = reproduced.map((x) => ({
    ...x.c,
    intentClear: x.v.intentClear,
    contradictsPin: x.v.contradictsPin,
    failingTest: x.v.failingTest,
  }))
  const f = await agent(
    `File these REPRODUCED defects as SDLC issues in the local-markdown tracker. First DEDUP against the ` +
      `open-issue titles ${JSON.stringify(setup.openIssues || [])} — skip any duplicate. For each kept ` +
      `defect write \`.scratch/<area>/issues/<NN>-<slug>.md\`: \`## What\` (hypothesis + the repro), ` +
      `\`## Acceptance criteria\` (Gherkin anchored on the attached failing test — it IS the fix's ` +
      `acceptance test), \`Context:\` = the candidate's KNOWN context name (e.g. <analytics-context>), the ROUTING field — NOT prose; put bug background in the ## What section, never a second Context field, \`## Blocked by\` (none), and a ` +
      `\`Status:\` line. LABEL RULE (§13.H): a clear, intent-unambiguous defect → \`ready-for-agent\`; ` +
      `reproduced-but-intent-unclear OR contradictsPin=true → \`needs-triage\` ALWAYS (established ` +
      `behaviour / Hyrum's law needs human judgment). Defects: ${JSON.stringify(payload)}. Return ` +
      `{ready:[ids], triage:[ids]}.`,
    { schema: FILED, label: 'file', phase: 'File' }
  )
  if (f) filed = { ready: f.ready || [], triage: f.triage || [] }
}

// ---- report ----

phase('Report')
await agent(
  `Write the hunt report to .scratch/hunts/${runId}.md (create .scratch/hunts/ if needed; the ONLY file ` +
    `you write). Scope '${scope}'. Counts: ${LENSES.length} lenses probed · ${reproduced.length} ` +
    `reproduced · ${filed.ready.length} filed ready-for-agent · ${filed.triage.length} filed ` +
    `needs-triage · ${suspected} suspected/dropped. List the filed issues (id + label) from ` +
    `${JSON.stringify(filed)} and a short line per SUSPECTED candidate (title + why it didn't reproduce) ` +
    `from ${JSON.stringify(flat.filter((x) => !(x.v && x.v.reproduced)).map((x) => ({ title: x.c.title, notes: x.v && x.v.notes })))}. ` +
    `Close with the next human action: \`/sdlc triage\` the filed issues, then \`/sdlc run\`.`,
  { label: 'report', phase: 'Report' }
)

return {
  runId,
  scope,
  halted: false,
  lenses: LENSES.length,
  reproduced: reproduced.length,
  filedReady: filed.ready.length,
  filedTriage: filed.triage.length,
  suspected,
}
