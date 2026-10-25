# Verification

Date: 2026-10-24. Working tree includes unrelated concurrent deployment work.

## Frontend

- `npm run type-check` equivalent (`vue-tsc --noEmit --skipLibCheck -p tsconfig.vitest.json --composite false`): passed.
- `npm run lint` equivalent (repository ESLint arguments, including `--fix`): passed, 0 errors and 150 warnings in the current working tree. Reviewed changed paths after lint; preserved concurrent changes.
- `npm test` equivalent (`node node_modules/vitest/vitest.mjs run`): 21 files, 132 tests passed.
- `git diff --check`: passed.

Schedule coverage includes serialization for all three trigger types, independent action payloads, controlled form updates, single-instance creation/editing, validation before destructive editing, inventory pagination, composite identities, administrator access, selections, scope previews, precise deletion, concurrency, partial outcomes, and explicit retry.

## Browser

Headless Chromium drove the real Vue/Ant Design components through a temporary Vite harness. API responses were fixtures; no live instance schedules were changed.

- Two reachable nodes with 53 instances, including a duplicate instance UUID across nodes and stopped instances; one unreachable node.
- All-instance scope discovered both inventory pages and created 53 schedules.
- Existing schedule remained unchanged.
- Schedule filtering and cross-page selection deleted exactly those 53 schedules; the original remained.
- Selected-instance scope then submitted two draft cards to one instance: one same-name conflict was preserved, and one new schedule was created and precisely deleted. Totals: 54 creations and 54 deletions, with the original still present.
- Unreachable node was visibly excluded; no browser page errors.
- Component tests separately cover selected-instance scope, cancellation, exact identities, and refreshed retries.
- Manager, composer, and preview bodies scroll within the viewport.

Screenshots are in `C:/Users/Mateshaopu/.codex/visualizations/2026/10/24/01a16cf0-332e-7673-8e7b-def5358c4c4b/`.

## Backend

Development webpack builds of panel and daemon passed before integration testing. No production deployment was performed.

Extended the existing real-process instance suite without changing backend product behavior. The referenced `docs/integration-test-framework.md` is absent in this checkout; read `docs/integration-test-coverage-2026-09-30.md` and the current harness before editing.

- Real spawned daemon + panel instance suite: 20 tests passed.
- Schedule assertions cover assigned-user creation/list/deletion, unassigned-user GET/POST/DELETE rejection, duplicate preservation, persisted task contents/removal, exact deletion preserving a sibling, eight-plan capacity, and global overview compatibility.
- Persistence assertions read only the isolated integration workspace's TaskConfig files. Restart rehydration was not separately exercised.
- Final full real-process integration runner: 13 suites passed, 163 tests passed and 1 test skipped. The separate Docker suite was skipped by the runner on Windows. This final run supersedes the earlier deployment compression failure and a separate startup attempt blocked by occupied test ports.
- Final common unit suite: 4 files, 58 tests passed.
- Final daemon suite: 11 files, 152 tests passed and 1 skipped. Linux/Docker-specific execution is not covered on this Windows host.
- Final panel unit suite: 5 files, 58 tests passed.

All final child processes use `windowsHide: true`, including a temporary inherited Node preload for native subprocesses. Chromium ran headless. Temporary browser harness and dev server are removed/stopped after verification.
