# Design

## Context

See `proposal.md` for the requested scope. `ServerStatusCommand.cs` in the companion PreAimMode repository emits `PAM_SERVER_STATUS` with players, its own assembly version, and the SW2 API assembly version. MCSManager validates that correlated response in `daemon/src/service/cs2_runtime.ts`, passes it through existing authorized instance info, and formats it in `instanceTelemetry.ts`/`InstanceTelemetry.vue`.

`InstanceList.vue` already implements selection across nodes, a batch dropdown, and a per-instance task console. Its update workflow intentionally deduplicates targets by node and can stop games; that workflow is unsuitable for a console download command. `/api/protected_instance/command` already checks instance ownership and forwards `instance/command` to the selected daemon. RCON command presets catch some authentication/delivery errors, so HTTP success only proves acceptance of the existing command request, not plugin execution.

## Goals / Non-Goals

**Goals:** Add one honest runtime-version observation and one fixed selected-instance command action using the existing protocol and access boundaries. Preserve all unrelated working-tree changes and existing telemetry on older plugins.

**Non-Goals:** An arbitrary batch command editor, editable Workshop IDs, automatic retries, automatic lifecycle actions, Workshop upload, download-completion detection, or a fleet-wide atomic download. No production command dispatch is part of automated verification.

## Decisions

### 1. Optional runtime observation from loaded plugin metadata

Extend the existing version-1 status response with `addonsManager: { state: "loaded" | "not_loaded" | "unknown", version?: string }`. Use SwiftlyS2 1.5.0's documented `ISwiftlyCore.PluginManager` methods (`GetAllPluginStatuses`, `GetPluginMetadata`, `GetAllPlugins`) to find the AddonsManager plugin ID and read metadata only if its status confirms it is loaded. Match the exact plugin identity case-insensitively, not a substring of unrelated names. Implementation must check the installed API's actual status enum/metadata types before calling them.

Perform this bounded lookup inside the existing safe main-thread status callback. Catch optional lookup failures locally so player counts and existing versions still return. Do not scan files, load another assembly, parse uploaded ZIPs, or start another query timer. The plugin may report `not_loaded` only after a successful registry lookup confirms absence; errors and indeterminate status report `unknown`.

The daemon validates the optional observation separately from the existing required fields: accept known states and a nonempty printable bounded version (maximum 96 characters); invalid or absent optional data becomes unknown without rejecting valid existing telemetry. Do not coerce an arbitrary object into a version. Frontend types carry the optional observation, and the existing 30-second/status freshness rule governs it. Display an explicit AddonsManager label in both views. Only a fresh confirmed absence displays not loaded; old plugin responses, unavailable queries, and stopped/stale instances display unknown.

Alternative considered: querying `sw_plugins` and parsing console tables would avoid changing PreAimMode but would introduce a second uncorrelated, output-format-dependent observation path. Reusing the current status response keeps existing nonces, authentication, lifecycle invalidation, and bounded parsing.

### 2. Fixed Workshop action through the existing instance command API

Add an administrator-only item beside the existing operations in `InstanceList.vue`. Reuse the current selection exactly; select-all continues to mean what the current list selects, rather than silently expanding to every instance on the server. Confirmation displays `sw_downloadaddon 3801682815`, selected target count, and that download progress appears in instance output.

Extract dispatch logic to a focused composable with an immutable fixed-command constant and typed API wrapper. The caller supplies targets, not a command or ID. Use existing instance-detail reads for fresh running-state checks, existing node availability for known-offline skips, and `/api/protected_instance/command` for delivery. Preserve the route's per-target ownership gate; there is no new server-side bypass or unrestricted batch endpoint.

Deduplicate only by `(daemonId, instanceUuid)`, never by node or directory. Snapshot targets on confirmation. Bound a batch to 200 unique targets, at most two in-flight requests, and pace API request starts by at least 200 ms to remain below the existing eight-requests/second session guard. Keep each target independent. Do not dispatch to non-running targets, the synthetic global instance, or invalid identifiers. Disable duplicate activation while a batch is active and dispose local timers/controllers with the component. A browser cancellation cannot recall an already dispatched command.

Use the existing task console for progress and per-target details. Keep the fixed action's states distinguishable: queued, requesting, request accepted, skipped, failed, uncertain. If shared task-console status names require adaptation, retain explicit request-only/uncertain labels for this action without changing existing upload/update semantics. API success means request accepted; inspect the instance terminal for actual AddonsManager/Steam progress. Network/response timeouts can occur after execution began, so display uncertainty and never automatically resend. Closing a result view does not imply cancellation of game-side downloading.

Alternative considered: using the existing batch game-update runner is rejected because it merges by node, performs lifecycle operations, and executes update commands instead of the exact game-console command. A new command protocol is unnecessary for a fixed convenience action and would expand daemon rollout requirements.

### 3. Verification and release boundaries

Use the existing daemon protocol tests and PreAimMode offline status test harness for loaded/absent/lookup-failure and older-response compatibility. Expand frontend helper/component tests for all version states. Add composable/menu tests for exact command bytes, selection, same-node multiplicity, permissions, confirmation cancellation, bounds/pacing, partial failures, and uncertain responses without automatic retry.

Extend the existing real-process RCON fixture so the actual daemon/panel APIs carry the AddonsManager observation and record the exact Workshop command on separate isolated instances. Verify unassigned access remains denied, accepted targets are not deduplicated by node, and process start counts/PIDs do not change. Read the integration-framework documentation if present; the previous checkout lacked that document, so use and record the inspected canonical harness if still absent. Run the full sequential integration runner without colliding with another chat's fixed ports/runtime file.

Use hidden Windows child processes and headless browsers. Plugin builds must explicitly set `EnableAutoDeployOnDebugBuild=false`. Produce local artifacts and record actual acceptance limits. Deployment must distinguish the companion plugin, telemetry-aware daemon, and frontend: older daemons ignore the optional property and older plugins omit it. Installing artifacts alone is not proof that a running game loaded the new plugin. Do not restart or hot-reload games as a release smoke test.

## Risks / Trade-offs

- [AddonsManager metadata or plugin ID is not available] → Read the actual loaded registry and report unknown/confirmed absence distinctly; do not invent a version or substitute the package on disk.
- [Older plugin/daemon components are still running] → The property is optional; preserve existing telemetry and document the component rollout needed for the new row.
- [Existing RCON command preset suppresses delivery failures] → Label only request acceptance, surface uncertainty, and direct operators to actual console output; do not assert plugin receipt or download success.
- [Repeated requests can redownload Workshop content] → One active batch, immutable deduplicated targets, explicit confirmation, and no automatic retry.
- [Selected instance changes state after preflight] → Keep existing daemon validation and show its independent result; never start it automatically.
- [Shared checkout or integration ports change concurrently] → Preserve unrelated work, inspect listeners, and wait rather than terminating another task's processes.

## Migration Plan

1. Review these artifacts before code changes, then implement the additive status field and fixed batch action.
2. Run plugin offline tests/build, affected module suites/type checks/lint, all four module tests for language changes, full real-process integration, and headless UI verification.
3. Record hashes and component compatibility in release documentation. Prepare publication under existing deployment rules; do not send commands to production as a test.
4. Deploying code must preserve account/node configuration and paired backups. Any game plugin activation or game-daemon restart requires a coordinated maintenance step; no automatic lifecycle action is included here.
5. Rollback restores prior plugin/daemon/frontend artifacts. No persisted data schema changes are introduced, and already requested Workshop downloads cannot be undone by rolling back the panel.
