# Proposal

## Why

CS2 operators need separate actions for installing or updating the SwiftlyS2 platform and deploying the plugins it runs. The current instance list only offers generic batch uploads with a hard-coded PreAimMode directory, and reports queue admission rather than deployment completion.

## What Changes

- Add distinct administrator actions, `Deploy SW2 Platform` and `Deploy Plugin`, alongside schedule management on the instance list.
- Reuse the current instance selection, with a target picker when nothing is selected; support multiple nodes and show shared-directory effects before applying files.
- Accept local ZIP packages and folders. Platform deployment targets the CS2 `game/csgo` tree; plugin deployment targets a named directory below `addons/swiftlys2/plugins` and never installs platform binaries.
- Preview the destination, package layout, overwritten files, protected configuration, and all instances sharing the destination. Create a backup before replacing existing files.
- Deduplicate by node and canonical destination. Require affected instances to be stopped before applying platform or plugin files; the workflow never automatically stops, starts, restarts, or reloads a game server.
- Track actual upload, extraction, and verification results separately from queue admission, with per-target failures and retries.
- Use existing node-level file operations under administrator authorization so older game daemons do not need a new deployment protocol. Unsupported operations fail preflight without modifying that node.

## Capabilities

### New Capabilities

- `cs2-deployment`: Administrator deployment of SwiftlyS2 platform packages and plugins, including destination mapping, shared-directory targeting, backup, and verified completion.

### Modified Capabilities

None. Existing Minecraft mod management, general workspace sandboxing, transfer authorization, and file APIs retain their contracts. The new workflow uses the already documented administrator node-file context for shared game directories.

## Impact

- Frontend: `InstanceList.vue`, a dedicated deployment dialog and composable, package validation helpers, upload completion reporting in `uploadService.ts`, and focused tests.
- Existing file-management, upload, and instance APIs; both direct and proxied transfers must remain supported. No new daemon protocol is planned.
- Existing SwiftlyS2 search-path logic in `daemon/src/tools/gameinfo.ts` is the reference for idempotent loader registration through ordinary file read/write operations.
- Root language files: localized action labels, destination previews, progress, and errors.
- Local regression and real-process integration coverage; subsequent deployment of the panel UI to 124 must preserve existing accounts, nodes, schedules, and game processes.
- Assumption: the first version deploys operator-supplied local packages. Remote release selection and automatic GitHub downloads are outside this change.
