# Proposal

## Why

Before production rollout, the approved five-item plan requires live CS2 player/version visibility, one shared deployment directory, optional backups, and player notification before newly configured scheduled restarts.

## What Changes

- Show real player counts beside instance status and loaded PreAimMode/SW2 versions; report unavailable data honestly.
- Use the same shared game directory for platform and plugin deployment without per-node directory selection.
- Keep backup enabled by default and allow an explicit reviewed no-backup choice independently of protected-file replacement.
- Add a 15-second notify-before-restart schedule action using authenticated RCON and the existing PreAimMode confirmation protocol.
- Preserve instance assignment permissions, deployment preflight, existing immediate actions and persisted legacy schedules.

## Capabilities

### New Capabilities

- `cs2-runtime-status`: Correlated, bounded live player and loaded-version queries displayed on instance lists.

### Modified Capabilities

- `cs2-deployment`: Shared destination and an explicit optional-backup policy.
- `instance-schedules`: Newly configured notified restarts with plugin acknowledgement and full countdown.

## Impact

Daemon lifecycle/status/scheduling services, frontend instance cards/table/deployment/schedules, translations, PreAimMode console protocol and tests. No production game control or deployment is authorized by this prerequisite implementation.
