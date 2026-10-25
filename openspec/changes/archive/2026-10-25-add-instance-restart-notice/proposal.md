# Proposal

## Why

An immediate instance restart disconnects players without warning. Administrators need an explicit selected-instance action that lets PreAimMode display a countdown before the panel restarts each successfully notified server.

## What Changes

- Add an administrator-only notify-and-restart workflow with editable 60-second default, progress, cancellation and explicit retry.
- Own timers and persisted results in the panel; require correlated plugin acknowledgements and skip unsupported or disconnected instances.
- Add a console-only PreAimMode protocol and passive Panorama banner, including late joiners and lifecycle cleanup.
- Preserve immediate restart and schedules. Production activation and player-visible acceptance remain controlled release steps.

## Capabilities

### New Capabilities

- `instance-restart-notice`: Selected-instance restart notifications, orchestration, cancellation and plugin HUD protocol.

### Modified Capabilities

None. Existing immediate restart and schedule contracts remain unchanged.

## Impact

MCSManager panel services/routes, instance-list frontend, language catalogs and real-process integration tests; PreAimMode commands, service, HUD resources and offline tests in H:/Pictures/PreAimMode. Reuses existing authenticated daemon interfaces without requiring a daemon protocol upgrade.
