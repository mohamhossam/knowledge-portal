# Test reliability

A test that fails and then passes on a rerun is a bug until its cause is found: in the code, in
the test or in the environment. Nothing is skipped or quarantined to get green. This page lists
what was found and what is still open.

## Found and fixed

| Symptom | Cause | Fix |
|---|---|---|
| e2e: the catalogue and squads keyboard journeys sometimes lost the record they had just opened (1 run in 5 on a busy machine) | A real bug, not the test. The find field writes `?find=` to the address 250 ms after typing stops. Opening a result before then started a navigation to a page that loads as its own chunk; the old page stayed mounted while it loaded, its timer fired and wrote the address against the old page, pulling the reader back to the list. | `useFindParam` stands down when the page changed while it waited (`frontend/src/catalogue/frame/useFindParam.ts`); `useFindParam.test.tsx` reproduces the race with a lazy route. |
| vitest: tracking and realisation tests timed out under the full suite | Heavy renders with real CSS in jsdom, many workers in parallel: some passed 5 s under load (each runs in about 0.5 s alone). | A 15 s per-test budget (`frontend/vitest.config.ts`): a hang still fails. |
| e2e: a run reused a local server left running with other data | Environment: `reuseExistingServer` is on locally. | Stop local preview and API servers before `npm run e2e`. CI never reuses. |

## Open

None known. A new intermittent failure goes here with its symptom, until its cause is found.
