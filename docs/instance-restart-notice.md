# Instance restart notifications

Administrators can select instances on the instance list and choose **Notify then restart**. The dialog displays a frozen target list, countdown (default 15 seconds, 10–3600 allowed) and editable message. Its history tab restores backend progress after closing or reopening the page. The top-level **Restart notifications** button also opens history without requiring a new selection.

Only targets positively acknowledged by PreAimMode enter countdown. Offline nodes, stopped instances, old plugins and notification failures are skipped individually. At expiry the panel checks instance and plugin continuity again, persists dispatch intent, sends restart once, and verifies stop/open events plus RUNNING status and an increased start count. A command ACK alone never means notification or restart success. Existing immediate restart actions and persisted legacy schedules retain their behavior. Newly configured notified restart schedules use the same plugin protocol through daemon-owned RCON countdowns; see [CS2 instance operations](cs2-instance-operations.md).

Cancel applies only before dispatch; it can target one instance or every pending row. Once restarting, the operation is no longer cancelable. Retry prepares only skipped/failed/interrupted rows for explicit confirmation with a new full countdown. If a cancel reaches a plugin after begin timed out, it uses the original task ID and cannot affect another task.

## APIs and limits

All routes require administrator permission and the panel's existing session/token or API authentication:

- `POST /api/instance/restart_notice`: `{targets:[{daemonId,instanceUuid}],seconds,message}` → job snapshot.
- `GET /api/instance/restart_notice`: newest-first job snapshots.
- `GET /api/instance/restart_notice/:id`: one job snapshot.
- `POST /api/instance/restart_notice/:id/cancel`: `{taskIds?:string[]}` → updated snapshot. Omit `taskIds` to cancel all pending targets; restarting/finished rows are unchanged.

Job fields: `id`, `createdAt`, `finishedAt`, `seconds`, `message`, `targets`. Each target has node/instance IDs, plugin `taskId`, display `name`, `state`, optional localized `reason` code and countdown `deadline`. States are pending/countdown/restarting/completed/skipped/canceled/interrupted/failed. The timestamp is for display; backend waiting uses monotonic time.

The service accepts at most 100 targets per request and 100 simultaneous active targets. Identical composite targets are deduplicated; overlapping active jobs are rejected. Messages are 1–200 characters with no control characters, and are encoded before entering the game console. Jobs use the configured Storage adapter (including Redis). Completed history is pruned every ten seconds and before creation, with 24-hour/200-batch retention.

On panel restart, unfinished jobs are marked interrupted and never replayed. The panel attempts plugin cancellation after reconnection for up to two minutes. Node disconnect or observed instance lifecycle change aborts a pending target. External process changes cannot be made atomic with an existing daemon restart RPC; the service observes events and compares instance start counts immediately before dispatch.

## Plugin protocol v1

Console only, through the existing authenticated daemon connection:

```text
pam_restart_notice begin <taskUuid> <requestUuid> <seconds> <base64urlUtf8Message>
pam_restart_notice status <taskUuid> <requestUuid>
pam_restart_notice cancel <taskUuid> <requestUuid>
PAM_RESTART_NOTICE {"v":1,"taskId":"...","requestId":"...","action":"begin","state":"countdown","remainingMs":15000}
```

Request UUIDs are fresh for each exchange; task IDs stay fixed for one target. The panel listens before sending and requires matching instance, version, task, request and action. The ACK timeout is six seconds. Output reassembly handles real Windows PTY wrapping/CSI sequences with bounded buffers; arbitrary log/chat lines are ignored.

Plugin states: countdown, ready (deadline reached; retained for 30 seconds), canceled, none, conflict, invalid, unavailable. Repeated begin for the same active task returns its remaining time; another task cannot overwrite it. The plugin remembers the last 64 finished/canceled IDs to reject delayed replay. Missing HUD preparation becomes unavailable after five seconds. No new plugin network listener or daemon protocol upgrade is needed.

## Build and controlled release

Plugin sources are in `H:/Pictures/PreAimMode`. Build with auto-deploy disabled. `tools/restart-notice/compile_resources.py` compiles the two Panorama files into an isolated artifact addon project and does not mount, package or deploy it. Its resource paths remain part of the existing workshop resource flow:

```text
panorama/layout/custom_game/preaim/restart_notice.vxml_c
panorama/styles/custom_game/preaim/restart_notice.vcss_c
```

The local review candidate is `H:/Pictures/PreAimMode/artifacts/restart-notice/candidate-20261025/`: Debug DLL, both compiled resources and a SHA256 manifest. It has not been installed, and its manifest explicitly records pending live CS2 acceptance. Existing plugin dependencies are still required; the candidate is not a standalone server installation or a new VPK.

1. Prepare the new plugin DLL and these resources using the existing workshop distribution/mount procedure.
2. Activate on a designated test instance during an agreed window. Do not hot reload all active game servers as a development check.
3. From a real CS2 client verify the banner, Chinese text, final-ten-second emphasis, late joining, menu coexistence, mouse behavior and cancellation. Verify exactly one restart at expiry.
4. Publish the panel after test-instance acceptance. Old plugins remain safely unsupported and are skipped.
5. For rollback, cancel pending tasks first; restore previous panel/plugin/resources through their normal backed-up release paths. Immediate restart remains available.

Automated process fixtures prove orchestration, not real client rendering. Plugin ACKs prove acceptance and HUD scheduling, not that every client displayed the banner. Live CS2 acceptance and production activation must be recorded separately.
