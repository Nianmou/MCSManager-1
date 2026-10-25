# Tasks

## 1. Shared Schedule Drafts

- [x] 1.1 Extract pure schedule parsing/serialization helpers that return fresh request payloads; add coverage for all three trigger types, ordered actions, finite/unlimited counts, and independent drafts without changing existing cron semantics. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.
- [x] 1.2 Extract controlled schedule form fields and reuse them in `NewSchedule.vue`; add regression tests for single-instance create/edit and emitted form updates, and introduce required English/Chinese labels with the component. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.

## 2. Inventory and Selection

- [x] 2.1 Refactor manager inventory/selection into a focused composable while preserving existing uncommitted pagination and overview fixes; test all node pages, identical UUIDs/names across nodes, node read failures, and valid-selection retention after refresh. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.
- [x] 2.2 Build administrator-only instance/schedule tabs with separate selections, node/name filters, cross-page select-all-filtered controls, hidden-selection counts, and translated empty/error states; remove manager batch restart and offline auto-selection. Extend component tests to verify permissions and precise scope. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.

## 3. Bulk Creation

- [x] 3.1 Add the selected/all-instance composer using shared fields, one-to-eight draft cards, unique-name validation, all-page target preview, frozen targets, and conflict/capacity/offline exclusions; add component tests proving that all scope ignores filters and never enrolls future instances. Include English/Chinese strings. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.
- [x] 3.2 Implement append-only request execution with five global workers, ordered drafts per instance, independent API request state, affirmative-success checks, per-pair results, progress, duplicate-submit protection, and queue cleanup. Test mixed successes/conflicts/errors, existing schedule preservation, capacity boundaries, maximum concurrency, and unmount behavior. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.

## 4. Bulk Deletion and Recovery

- [x] 4.1 Add exact schedule deletion confirmation with all selected node/instance/name identities and affected counts; reuse the executor, retain unselected schedules, and refresh after execution. Test cancel-with-no-requests, cross-page deletion, hidden selections, and independent same-name schedules on different nodes. Include English/Chinese strings. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.
- [x] 4.2 Add result details and explicit unresolved-only retry with refreshed state and renewed delete confirmation; test that successes are never replayed, uncertain creates are not overwritten, absent deletes are reported accurately, and changing nodes cannot produce a false fleet-wide success. Verify with `cd frontend && npm run type-check` followed by `cd frontend && npm test`.

## 5. Integration Verification

- [x] 5.1 Use the `mcsmanager-test` skill for the final frontend gate: run type-check, lint, review any lint edits, and manually verify the selected/all-instance add and precise delete flows, including a stopped instance and an unreachable node. Record actual outcomes and limitations. Finish with `cd frontend && npm test`.
- [x] 5.2 Run the existing backend regression coverage for schedule authorization, duplicate preservation, limits, persistence, and overview compatibility. Read `docs/integration-test-framework.md` before any integration-suite edit; extend coverage only if a specified backend contract lacks a real-process assertion. Satisfy the test skill's build prerequisites before `cd common && npm run test:integration`; report failures/skips honestly. Finish with `cd common && npm test`, `cd daemon && npm test`, and `cd panel && npm test`.

## Workflow follow-up

- Present this proposal, design, and delta specification for human review before editing project code, as required by root `AGENTS.md` section 3.
- After implementation and all applicable testing gates pass, use `openspec-archive-change` to archive the change and sync its specification delta.
