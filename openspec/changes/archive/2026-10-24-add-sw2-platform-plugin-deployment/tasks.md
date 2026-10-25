# Tasks

## 1. Package Mapping

- [x] 1.1 Add typed platform/plugin package manifests and bounded ZIP/folder inspection using the existing archive dependency; cover wrapper normalization, exactly one plugin directory, traversal, conflicting roots, wrong platform binaries, duplicate paths, and protected entries. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 2. Target Preflight

- [x] 2.1 Add a deployment composable that resolves administrator node file contexts, paginates instance discovery, previews canonical paths and shared instances, deduplicates destinations, and blocks unavailable/unsupported nodes or running affected instances. Cover legacy routes, instance UUID collisions across nodes, and unselected siblings in regression tests. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 3. Observable Transfers

- [x] 3.1 Extend upload tasks with additive terminal success/failure/cancellation results while retaining current callers; cover initialization failures, exhausted retries, stop, finalization, and existing mod-upload behavior. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 4. Backup and File Application

- [x] 4.1 Build approved replacement manifests, preserve existing configuration/data by default, create verified backups through existing file APIs, and retain recovery paths on failure. Cover backup failure and protected files in tests. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.
- [x] 4.2 Orchestrate serialized deployment per shared destination, wait for transfer/extraction and destination verification, add idempotent platform loader registration based on the existing gameinfo algorithm, and support failed-target retry. Test cancellation, partial extraction, missing files, timeout, preserved game configuration, and plugin mode never changing the loader. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.

## 5. Buttons and Deployment Dialog

- [x] 5.1 Wire separate `Deploy SW2 Platform` and `Deploy Plugin` buttons next to schedule management; add administrator gating, target picker, package/destination preview, protected-file choices, per-target progress, backup locations, and explicit activation status. Add user documentation and component tests covering both modes and empty selections. Verify with `cd frontend && npm run type-check`, then `cd frontend && npm test`.
- [x] 5.2 Add localized labels, progress, validation errors, and documentation for stopped shared instances and manual recovery; ensure the existing batch-upload and schedule entry points remain functional. Verify frontend type checking and lint without broad autofixes; then run `cd common && npm test`, `cd daemon && npm test`, `cd panel && npm test`, and `cd frontend && npm test`.

## 6. Cross-System Verification

- [x] 6.1 Extend the real-process integration suite using isolated directories and stopped test instances to cover administrator global-node file context, unauthorized requests, platform/plugin package placement, configuration preservation, finalized extraction, and both direct/proxy transfers; rebuild the affected test runtimes and run `cd common && npm run test:integration`, then `cd common && npm test`.

## Workflow follow-up

- Present the proposal, specification, design, and tasks for human review before editing application code, as required by the repository workflow.
- After approval and successful implementation checks, build and back up the current 124 panel, deploy changed components in the background, and verify both entry points and read-only node preflight without activating windows or restarting game servers.
- Leave installation into real game directories to the operator's explicit package and target selections; use isolated stopped test targets for implementation verification.
- Archive the change after implementation and required validation are complete.
