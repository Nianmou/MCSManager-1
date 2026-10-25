# Proposal

## Why

The instance list already reports loaded PreAimMode and SW2 versions, but omits AddonsManager. Administrators also need a quick action beside the existing select-all batch operations to request the single Workshop download command `sw_downloadaddon 3801682815` for selected instances.

## What Changes

- Add an explicitly labeled AddonsManager loaded-version row to runtime version displays in both instance list and card layouts.
- Extend the existing correlated `pam_server_status` response with an optional AddonsManager observation obtained from SwiftlyS2's currently loaded plugin metadata. Distinguish not loaded, unavailable, and stale observations; older responses must retain their working PreAimMode/SW2/player data.
- Add an administrator batch-menu action, **Download Workshop addon**, for exactly `sw_downloadaddon 3801682815`. Show the fixed command and selected instance count before dispatch; there is no command or addon-ID input.
- Reuse authorized instance-command delivery and the existing per-instance results console, with composite node/instance identity, bounded paced requests, stopped/offline skips, and independent partial outcomes. Do not merge different instances on the same node.
- Report request dispatch separately from download completion. Existing RCON command handling can swallow delivery errors, so an accepted API response cannot prove that AddonsManager received the command or that Steam finished downloading. Never automatically retry an uncertain dispatch.
- Run relevant local tests, builds, real-process integration, and headless UI checks. Do not send the command to live instances as a verification step or automatically restart/reload game servers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cs2-runtime-status`: Include a current AddonsManager observation without weakening existing telemetry correlation, freshness, or ownership boundaries.
- `instance-management`: Add a fixed Workshop download request to selected-instance batch operations with truthful per-target request states.

## Impact

- Plugin companion: `H:/Pictures/PreAimMode/Command/ServerStatusCommand.cs` and its existing offline status tests, following that repository's AGENTS.md and SwiftlyS2-Toolkit.
- Daemon: `daemon/src/service/cs2_runtime.ts`, existing protocol tests and real-process RCON fixture. Keep the existing query timer, six-second bound, console restriction, and lifecycle cleanup.
- Frontend: runtime types/formatting/display, `InstanceList.vue` batch-menu integration, an extracted fixed-command composable/API wrapper, existing result-console reuse, English/Chinese text and tests.
- Panel: reuse the existing `/api/protected_instance/command` ownership gate and daemon command RPC; no new unrestricted command endpoint or persistence model.
- Documentation: runtime protocol compatibility, Workshop action usage, request-vs-download semantics, verification evidence and component rollout requirements. Existing shared-configuration work remains separate.

## Authorized release follow-up

The operator subsequently approved implementation, GitHub publication and deployment to the 124 server. Publish isolated feature branches, deploy the panel and telemetry-aware daemons, and install companion plugin files while preserving the previous explicit decision to defer activation until maintenance. Preserve existing game processes and runtime configuration. No production Workshop or lifecycle commands are verification steps.
