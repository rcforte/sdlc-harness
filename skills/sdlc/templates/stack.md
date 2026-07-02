# Stack profile — <repo name>

The parsed source of truth for this repo's **commands** and **conventions**. Read by the
SDLC harness's pre-flight, `developer`, and `tester` agents — **never** by the `run`
Workflow script itself (that script has no filesystem access; only its subagents read this).
`CLAUDE.md` may *point* here but never duplicates these values; where they disagree, **this
file wins** for machine-critical values.

## Machine fields — keep this block valid YAML (parsed exactly)

```yaml
languages:   [java]            # e.g. [java, typescript]
frameworks:  [spring-boot]     # e.g. [spring-boot, react]
has_frontend: false            # gates the UX lenses in improve/hunt; flip true when a FE exists
commands:
  # `test` is MANDATORY — it is the green-baseline oracle AND the tester's ground truth.
  test:      "./mvnw -q test"
  # The rest are optional; omit any the stack lacks (the agent skips that check and says so).
  build:     "./mvnw -q -DskipTests package"
  run:       "./mvnw spring-boot:run"
  test-one:  "./mvnw -q -Dtest=%CLASS% test"   # %CLASS% = single test class/name
  e2e:       ""                                  # empty until a frontend exists
  lint:      ""
  typecheck: ""
```

## Test-seam conventions (prose — read by developer/tester)

- **Highest seam:** the REST/HTTP boundary. Acceptance tests drive it with
  `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `WebTestClient`/`MockMvc`, structured
  as Given/When/Then. One issue Gherkin scenario → one acceptance test at this seam.
- **Inner unit seam:** application services + domain, plain JUnit 5.
- **Characterization tests** (brownfield only) live under `…/characterization/` and are
  named `*CharacterizationTest`. They pin *current* observable behavior and are **never
  edited green** — a failing one means behavior changed (see the developer/tester rules).

## Prior-art locations (prose)

- _Where to find an existing controller / service / acceptance test to copy conventions
  from — filled during `setup`/`onboard`._
