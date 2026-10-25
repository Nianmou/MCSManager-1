# Design

## Context

The user explicitly requests completing the five listed prerequisites before deployment. Their plan is the implementation authorization. Existing telemetry is Minecraft-only; deployment repeats the same root per node; all overwrites require a backup; the daemon executes restart schedules immediately. PreAimMode already implements passive restart notices, and instance commands already select RCON when enabled.

## Goals / Non-Goals

Goals: accurate live observations, simple deployment inputs, explicit backup policy, and fail-closed scheduled player reminders with a 15-second default.

Non-goals: production deployment, workshop upload, hot reload, automatic game shutdown for deployment, or claiming unperformed real CS2 acceptance.

## Decisions

- Add a console-only `pam_server_status <requestUuid>` response containing protocol version, real authorized player count, loaded plugin version and loaded SW2 host assembly informational version. Never infer active versions from selected upload packages. Use bounded output correlation and existing authenticated RCON config; background lifecycle queries are rate-limited, cleaned on stop and invalidated on process generation changes.
- Show unavailable or stale observations distinctly from zero. Add player count after status in the global table and beside the status tag in cards. Show plugin/platform versions in both views.
- Both deployment modes use `/mnt/steam/cs2/game/csgo` as the shared remote root. Remove per-node directory inputs; continue displaying actual reviewed destinations. Local ZIP/folder package selection remains necessary.
- Freeze `backupBeforeDeploy` into every reviewed target, default true. Disabling it invalidates approval and visibly states that no recovery backup is created. Protected-file replacement remains a separate choice. Loader backups follow the same explicit policy. Fail backup-enabled targets before writing when backup verification fails.
- New schedule restart choices use a dedicated `restart_notice` action with bounded JSON seconds/message payload and 15-second default. Persisted legacy `restart` actions remain readable and retain immediate behavior. The daemon subscribes before RCON delivery, checks exact task/request/action/version, waits the full monotonic countdown, checks instance/plugin continuity, then dispatches restart once. A plugin conflict also prevents overlap with panel-created notifications.
- Use existing configured RCON credentials only; do not add arbitrary network destinations or client-provided shell commands. Missing RCON, plugin confirmation, continuity loss or timeout fails without restarting. Clean all listeners/timers; bound concurrent notification executions and serialize each instance. Log actionable failures without credentials.

## Risks / Trade-offs

- Platform version reports the loaded managed SW2 host version, not an uploaded package label.
- RCON may not include asynchronous plugin output in its reply: dedicated stdout correlation remains authoritative, registered before command delivery.
- No-backup mode deliberately removes automatic recovery artifacts and must be visible at approval and results.
- Real CS2 visual/input acceptance remains a separate controlled release step. Local process/RCON fixtures establish orchestration only.
