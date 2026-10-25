# Tasks

## 1. AddonsManager runtime observation

- [x] 1.1 Extend the companion plugin's existing status callback with loaded-registry AddonsManager metadata and additive daemon parsing; preserve existing data on missing/malformed optional observations, and cover loaded/absent/lookup-failure/stale/old-response cases with plugin offline and daemon tests; document the protocol and component compatibility; verify the PreAimMode status test harness and `dotnet build PreAimMode.sln -p:EnableAutoDeployOnDebugBuild=false`, then `cd daemon && npm test`.

## 2. Version display and fixed Workshop action

- [x] 2.1 Add typed AddonsManager runtime observations to the existing frontend formatter and both version displays, with explicit labels and unknown/not-loaded/fresh/stopped regression tests plus English/Chinese text; update the operator documentation; verify `cd frontend && npm run type-check`, `npm run lint`, and `npm test`.
- [x] 2.2 Add the immutable `sw_downloadaddon 3801682815` API wrapper/composable and administrator select-all batch-menu action, confirmation, paced bounded dispatch, per-target result-console adaptation, offline/stopped skips, and uncertain-response handling without automatic resend; cover cancellation, empty selection, same-node multiple instances, same UUID on different nodes, partial failures, duplicate activation and exact command bytes; document request-only results; verify `cd frontend && npm run type-check`, `npm run lint`, and `npm test`.

## 3. Integration and release evidence

- [x] 3.1 Extend the canonical isolated real-panel/daemon/RCON fixture to prove AddonsManager observation compatibility, exact Workshop command dispatch, instance authorization, same-node multiplicity, and unchanged game-process start counts/PIDs; run the complete sequential backend integration runner using hidden Windows children after checking shared test-port availability, and record skipped environments accurately; finish with `cd common && npm test`, `cd panel && npm test`, `cd daemon && npm test`, `cd frontend && npm test`, and `cd common && npm run test:integration`.
- [x] 3.2 Build local plugin/daemon/panel/frontend release candidates under the build skills with plugin automatic deployment disabled; run headless production-asset UI checks against isolated API fixtures, record artifact hashes and the component rollout/rollback instructions, and state any real-game acceptance still unperformed; do not dispatch Workshop commands or lifecycle actions to production for testing; finish with `cd panel && npm test` and `cd frontend && npm test`.

## Workflow follow-up

- Present this proposal, design, specs, and tasks for human review before changing application code, as required by AGENTS.md.
- After implementation and verification, sync the two capability deltas and archive this change.
- Coordinate any production plugin activation or game-daemon restart separately from isolated verification; retain paired configuration backups and existing running-instance state.

## 4. Authorized publication and deployment

- [x] 4.1 Commit the reviewed release source and required completed baseline dependencies to GitHub feature branches, excluding the unfinished shared function groups; verify remote commit identities before deployment.
- [x] 4.2 Deploy the verified release to the 124 panel and its seven game nodes with paired backups, preserving game container/PID continuity and credentials; verify public assets, node authentication, installed hashes and anonymous command denial. Preserve deferred plugin activation and send no live Workshop or game lifecycle test commands.
