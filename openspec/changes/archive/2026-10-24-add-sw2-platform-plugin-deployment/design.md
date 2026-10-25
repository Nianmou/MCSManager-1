# Design

## Context

See `proposal.md` for motivation and scope. `frontend/src/widgets/InstanceList.vue` already contains batch selection, node-aware task rows, upload dialogs, transfer-address mapping, and retry delays. Its upload action sets `real_path: true`, uses a hard-coded PreAimMode directory, and marks a row successful immediately after `uploadService.append` queues the transfer.

`useModUpload.ts` is a Minecraft-oriented single-instance upload helper, so it is not the correct deployment entry point. `folderUploader.ts` and the existing `fflate` dependency can handle package inspection and repacking without a new dependency. `uploadService.ts` exposes end callbacks, but stopping also invokes them and initialization errors do not provide a reliable completion result.

The deployed game nodes run mixed daemon versions. The existing `file-management` specification documents a root-scoped global node instance (`global0001`), ordinary transfer missions, compression, and archive validation. These provide an administrator route to shared CS2 directories without depending on custom `file/real_list` or `realPath` support. Ordinary instance file operations retain their existing sandbox contracts. The current `file-management` specification does not describe the repository's custom real-path extension; this proposal does not expand that extension.

`daemon/src/tools/gameinfo.ts` contains the current SW2 search-path insertion algorithm and load order. It is a reference, not a capability that can be assumed present on older deployed daemons.

## Goals / Non-Goals

**Goals:** Reuse supported file transports, make platform/plugin destinations explicit, protect shared files, and provide observable completion and failure states.

**Non-Goals:** GitHub release browsing, automatic package downloads, compiling plugins, dependency installation, automatic game-server lifecycle operations, daemon upgrades, and changes to Minecraft mod management.

## Decisions

### Two actions share one deployment dialog

Add `Deploy SW2 Platform` and `Deploy Plugin` beside schedule management. Both initialize a typed mode in a dedicated dialog and composable under `frontend/src/widgets/instance/`. Reuse the current selection using `(daemonId, instanceUuid)` keys and fetch all pages when selecting targets. An empty selection opens a picker. Keep deployment logic out of the already large instance-list component.

A single generic upload button was considered but cannot explain the different package boundaries or prevent platform files from being installed as a plugin.

### Normalize packages before transfer

Inspect the archive or selected folder locally, with bounded compressed and expanded sizes and file counts. Reject traversal, absolute entry names, ambiguous roots, duplicate canonical destinations, unsupported symlink entries, and empty packages. Normalize recognized SW2 platform wrappers against a selected CS2 `game/csgo` directory. Plugin mode accepts a named plugin subtree and maps it exactly once beneath `addons/swiftlys2/plugins`; it rejects runtime/library files outside that subtree. Preview every resulting path and preserve per-node destination overrides. Existing backend extraction validation remains authoritative.

Repack only approved entries into a deployment ZIP using existing folder/archive tooling. This permits excluding protected configuration and data before the backend's overwrite-on-extract behavior. A raw copy of an arbitrary ZIP was rejected because it silently introduces extra directory levels and can overwrite defaults.

### Use administrator node file contexts and preflight legacy support

Resolve the node's global file context through supported file APIs, using the documented `global0001` context only after authorization and availability checks. Preserve normal instance file access and node transfer address mapping for direct and proxy modes. Read canonical destinations from directory listings; deduplicate by `(daemonId, canonicalGameDirectory, mode, pluginName)`.

Preflight a representative node without writes to confirm node-context, listing, file read, and upload-mission support. A missing primitive produces an unsupported-node result rather than an automatic daemon update or a fallback to arbitrary shell execution. This is preferable to a new deployment protocol that would repeat the schedule-overview compatibility problem.

### Shared files require shared state checks

Enumerate all instances on each target node and compare their configured working directories and startup references with the resolved game directory. Display selected and unselected instances that share it. If the mapping is ambiguous, require an explicit affected-instance selection before enabling deployment. Recheck their states immediately before application and block if any are running, starting, busy, or stopping. Do not call stop/restart/reload endpoints as part of deployment.

### Back up before overwriting and preserve configuration

Build a manifest of package entries, lengths, destination conflicts, and protected files. Default to preserving existing SW2 configuration, plugin configuration/data, and all unrelated files. Create a unique backup ZIP through the existing compression operation for files that will be overwritten, including `gameinfo.gi` for platform loader edits. Wait for its task to settle and confirm the backup file exists and is non-empty before applying. New installations with no conflicts report that no replacement backup was required.

Apply one deployment at a time per canonical directory. Platform mode verifies loader registration using the existing insertion algorithm through file read/write APIs and verifies the result; plugin mode does not edit the game loader. Report both the backup path and any partial deployment on failure. Recovery uses the existing file manager and backup; a transactional rollback service is outside this first version.

### Track actual completion

Add an additive typed terminal result to upload tasks covering success, failed initialization, failed chunks, and cancellation; preserve existing callback behavior for callers. The deployment composable waits for successful transfer finalization and extraction completion, then lists expected destination files and compares their lengths with the normalized manifest. Never infer success from an end callback or an empty task counter alone. A timeout is a failed verification, not success. Recheck loader content for platform mode.

Show per-target phases and a final summary stating that files are deployed and activation requires a separate server start. Retrying failed targets performs preflight again and preserves successful results. Keep the dialog open during work; closing the page is not reported as successful completion.

## Risks / Trade-offs

- [Large packages exhaust browser memory] -> Reject oversized archives and expanded manifests before repacking; bound work to one prepared package and a small transfer concurrency.
- [Legacy node file-context differences] -> Verify supported operations first and retain an explicit unsupported result without changing the daemon.
- [Shared-directory inference misses launcher indirection] -> Show the full affected-instance list and require an explicit mapping when startup references are ambiguous; block unsafe application.
- [Another administrator starts a game during deployment] -> Recheck state before writes and warn that the operation requires an operator maintenance window; the existing protocol provides no distributed directory/lifecycle lock.
- [Partial file replacement] -> Back up all replacement inputs first, verify after transfer, and retain exact failed paths and recovery location. Do not claim atomic batch rollback.
- [Protected defaults are needed for first install] -> Preserve existing protected files while allowing missing defaults to be created and explicit replacement choices in the preview.

## Migration Plan

1. Add frontend helpers, dialog, upload completion results, and translations without changing existing file protocols or persisted account/node data.
2. Run focused frontend regression tests and type checking, all module suites for shared language changes, and the full real-process integration runner with administrator node-context upload cases in both data-plane modes.
3. Build production artifacts, preserve the current 124 release and account/node/daemon data backups, and update only the components changed by implementation. Preserve the deployed schedule fix.
4. Validate the buttons and read-only preflight against configured nodes. Exercise destructive package deployment only on isolated test directories and stopped test instances; do not install a package into live game directories without a user-selected package and targets.
5. Roll back the panel assets/code if needed. Node file backups are per deployment and remain available independently.
