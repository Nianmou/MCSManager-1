# Tasks

## 1. Complete Deployment Inventory

- [x] 1.1 Extend deployment discovery with per-node completeness/errors, explicit fresh-request timeouts, all-page enumeration, and composite identity deduplication. Add transport tests for unequal node page counts, a missing/failed later page, an offline configured node, and identical UUIDs on different nodes; incomplete nodes must never pass stopped-state validation. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 2. Scope-Aware Batch Planning

- [x] 2.1 Add explicit all/selected planning from one fresh discovery snapshot, preserve unique shared-node destinations, and retain blocked coverage records. Test filter-independent all scope, explicit selected scope, instances added before preview, frozen identities after preview, empty fleet behavior, and blocked incomplete inventory. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.
- [x] 2.2 Permit approved eligible targets to execute while preserving blocked results, reuse before-write state/identity checks, and rebuild only unresolved target plans for renewed approval. Test running-node exclusion, mixed node readiness, newly recovered incomplete nodes, backup/verification regressions, and no replay of successful targets. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 3. Global Deployment Interface

- [x] 3.1 Default both instance-list actions and the deployment dialog to all current instances; expose explicit selected scope, separate instance/destination counts, excluded-node details, and one batch confirmation. Invalidate approval after relevant edits, keep large previews scrollable, and prevent duplicate starts. Add component tests for both modes, existing selections, one-confirmation execution, changed settings, partial coverage, and administrator restrictions. Add English/Chinese labels and update `docs/cs2-deployment.md` with the actual scope and activation behavior. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 4. Integrated Verification

- [x] 4.1 Run final frontend type-check and lint, review lint edits, and exercise both deployment modes in headless Chromium using fixture APIs and local test packages. Verify multiple nodes/pages, shared destinations, stopped/running instances, exclusions, selected fallback, and one approved batch without changing live game files. Record outcomes and limitations. Finish with `cd frontend && npm test`.
- [x] 4.2 Use the `mcsmanager-test` skill for the required full regression gate after shared-language edits. Satisfy existing integration build prerequisites, run `cd common && npm run test:integration` sequentially, and report actual failures/skips. Preserve hidden subprocess execution and do not open visible terminal/browser windows. Verify all module suites with `cd common && npm test`, `cd daemon && npm test`, `cd panel && npm test`, and `cd frontend && npm test`.

## Workflow follow-up

- Obtain human review of the proposal, specification, design, and tasks before application-code edits, as required by root `AGENTS.md` section 3.
- Archive and synchronize the specification after implementation and the testing gate pass.
- Production release and deployment of actual packages into live game directories remain separate explicitly authorized operations.
