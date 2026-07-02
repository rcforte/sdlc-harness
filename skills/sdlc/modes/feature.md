# /sdlc feature "<idea>" — frame a capability into queued issues

The interactive **scope-in** on-ramp. One unbroken conversation conducting Matt's skills; ends
with vertical tracer-bullet issues in the queue at `ready-for-agent`.

**Prerequisite:** `docs/agents/stack.md` exists (run `/sdlc setup` or `/sdlc onboard` first).

## Process
1. **Grill.** Conduct `/grill-with-docs` on the idea (use `/grill-me` if the repo is greenfield
   with no domain yet). Stress-test against `CONTEXT.md` + `docs/adr/`; sharpen terminology and
   write ADRs/glossary as decisions crystallize. Use the `product-owner` lens to frame user value
   and a story map (walking skeleton first).
2. **PRD.** Conduct `/to-prd` — synthesize the agreed scope into a PRD published to the tracker.
   Do not re-interview; just synthesize what the grilling settled.
3. **Issues.** Conduct `/to-issues` — break the PRD into independently-grabbable vertical slices
   (tracer bullets), blocker-ordered. **Each issue's `## Acceptance criteria` MUST be Gherkin**
   (Given/When/Then): it is the contract the `developer` drives outside-in (one scenario → one
   acceptance test) and the `tester` maps to checks. Each issue also carries a **`Context:` line** (a
   context name from `CONTEXT-MAP.md` — the multi-context engine routes on it, §13.K2). Publish as
   `ready-for-agent`.

## Hand-off
The queue is now drainable. Tell the user to **review the issues (the scope-in gate)** and then
run `/sdlc run`. Context hygiene: this one conversation framed everything; each slice then builds
in a *fresh* subagent inside the engine.
