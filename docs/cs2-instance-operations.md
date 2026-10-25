# CS2 instance observations and scheduled reminders

The instance table displays **Players** immediately after **Status**, followed by loaded **Plugin** and **SW2 platform** versions. Cards show the same player count beside the status tag and both versions in the details. A confirmed empty server displays `0`; a stopped instance, failed query, unsupported plugin or observation older than 30 seconds displays **Unknown**. Minecraft counts remain supported.

## Runtime query

Runtime versions also include **AddonsManager** in both table and card layouts. The optional version-1
field is `"addonsManager":{"state":"loaded","version":"1.2.3"}`. The companion reads the exact
case-insensitive `AddonsManager` entry in SwiftlyS2's plugin registry on the existing game-thread callback;
only `Loaded` status and valid loaded metadata produce a version. Confirmed absence/unloaded status
produces `not_loaded`; lookup errors, loading/error/indeterminate status, missing observations from older
plugins, malformed values, stopped instances and observations older than 30 seconds display **Unknown**.
Only fresh confirmed absence displays **Not loaded**. Versions must be nonempty strings of at most
96 characters without control characters. Invalid optional fields preserve existing player/PreAimMode/SW2 data.
The new plugin and telemetry-aware daemon are both required; replacing files does not activate the game plugin.

## Selected-instance Workshop download

Administrators can select instances (including **Select all** in the current list), open the batch menu,
and choose **Download Workshop addon**. Confirm the selected count and exact fixed command:

```text
sw_downloadaddon 3801682815
```

There is no editable command or Workshop ID. Each unique node-and-instance pair gets its own preflight
and request, including multiple instances on one node. A batch supports at most 200 targets, at most two
in-flight requests and at least 200 ms between API request starts. Offline, invalid, global-template or
non-running targets are skipped. Existing instance ownership checks still apply. No game is started,
stopped, restarted or reloaded by this action.

The result console distinguishes queued, requesting, **Request accepted**, skipped, failed and
**Uncertain**. Acceptance by the existing command API does not prove plugin receipt or download completion:
its RCON preset can catch delivery errors. Inspect each instance terminal for actual progress. A timeout
or lost command response may follow delivery; the batch never automatically resends. Canceling confirmation
sends nothing. Closing the result drawer leaves the batch running; leaving the component cancels local
queued requests but cannot recall commands already sent or cancel a game-side download.

Configure the instance's existing RCON host, port and password and enable RCON. Running non-Minecraft instances query the plugin once per ten seconds after the preceding query completes. The daemon subscribes to instance stdout before authenticated RCON delivery. An empty RCON response is expected and is not proof of success. The command is console-only:

```text
pam_server_status <requestUuid>
PAM_SERVER_STATUS {"v":1,"requestId":"...","players":3,"pluginVersion":"2.0.0.11","platformVersion":"1.5.0"}
```

PreAimMode queries the host player collection on the game thread, counting valid authorized humans with a nonzero Steam ID, excluding fake clients and registered training bots even when their identities are disguised. Versions come from the currently loaded plugin and SwiftlyS2 API assemblies, including informational versions where present. They do not describe an uploaded package or independently verify a native binary version.

Observations travel through existing authorized instance details/list APIs. No additional public telemetry endpoint or credential field is introduced. Stops invalidate observations and abort pending requests. Each query has a six-second limit; line reassembly is limited to 4096 characters/eight wrapped lines, and machine RCON connections are capped at 128. Old process generations cannot publish results.

## Newly configured restart schedules

When adding an action in either single-instance or batch plan creation, choose **Notify then restart**. Its default is **15 seconds**, range 10–3600, with an editable message of up to 200 characters. Editing an existing immediate restart keeps it explicitly labeled **Immediate restart (existing plan)**; saving it does not silently convert its behavior. Immediate operation buttons remain available.

The persisted action is:

```json
{"type":"restart_notice","payload":"{\"seconds\":15,\"message\":\"Server restarting soon\"}"}
```

The daemon sends the existing `pam_restart_notice begin/status/cancel` protocol through authenticated RCON. Matching plugin acceptance starts the complete monotonic countdown; periodic and final status checks must remain healthy. Immediately before dispatch the instance must still be running with the original start count and timestamp, and the plugin must report `ready`. Only one restart is dispatched. Missing RCON, unsupported plugins, conflicts, delivery/confirmation failures, lost plugin state, manual stop/restart and changed processes fail without dispatch. Failures are recorded in daemon schedule logs without RCON credentials; later actions in that failed execution are abandoned. Recurring runs cannot overlap for one instance; at most 64 scheduled reminder runs can be active.

The browser does not own the countdown. Closing it leaves the daemon task running. Removing a future schedule cancels its future triggers; it does not promise cancellation of a countdown that has already started. The manual panel **Restart notifications** history governs panel-created batches only. Both paths share the plugin's conflict protection and cannot overwrite another active reminder. If a daemon exits during a countdown it does not replay that in-memory execution; the plugin clears its banner after expiry/grace. Existing recurring schedules resume their normal future triggers.

## Deployment and release

Platform/plugin deployment share `/mnt/steam/cs2/game/csgo` on each node. The local package is still chosen once; there are no repeated remote directory inputs. **Back up before deployment** is enabled by default and independent of protected-file replacement. An explicit no-backup choice requires a new preview and remains visible in approved targets and results. See [deployment details](cs2-deployment.md).

Implementation and automated verification are local prerequisites. They do not activate a plugin, upload workshop resources, deploy production code or restart a live game. Publish the plugin and its existing Panorama workshop resources first, accept on a designated CS2 test instance, then publish the daemon/panel/frontend. Older plugins show unknown telemetry and skip notified restart. Real CS2 player-view rendering/input acceptance remains necessary; process fixtures and offline builds cannot prove it.

## Verification

The real-process `common/test/integration/suites/cs2_operations.test.ts` starts the actual panel and daemon and a Source RCON TCP game fixture. It verifies correlated delayed/fragmented stdout observations, instance permissions, a full 15-second countdown and exactly one restart, no restart for missing RCON/unsupported plugins, and a manual stop invalidating both the countdown and telemetry. It uses isolated temporary directories and test credentials.

Daemon unit tests cover malformed/oversized output, mismatched nonce/version, lifecycle cleanup, bounded parameters, conflicts, overlap and lost plugin state. Frontend tests cover deployment backup choices, telemetry unknown/zero/version display, new schedule controls/defaults and legacy edit compatibility. Plugin offline tests include command restrictions, player filters, loaded-version sources and the passive reminder lifecycle. See [the archived verification record](../openspec/changes/archive/2026-10-25-enhance-cs2-instance-operations/verification.md) for this run's results.
