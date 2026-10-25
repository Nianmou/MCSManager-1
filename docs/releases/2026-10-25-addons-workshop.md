# AddonsManager runtime version and fixed Workshop request release

Release ID: `20261025-1130-addons-workshop`.
Panel: <http://124.222.221.14:23333/#/instances>.

The operator authorized implementation, GitHub publication and server deployment. The previous
decision to update game plugin files without activating/reloading them is retained. No live Workshop
command or game restart is a deployment test.

## Published behavior

Both instance cards and tables include an explicitly labeled AddonsManager version sourced from
the currently loaded plugin registry. Fresh confirmed absence shows not loaded; old plugins,
malformed optional observations, lookup failures, stopped or stale observations show unknown while
preserving other valid telemetry.

Administrators can select instances, including Select all, then choose Download Workshop addon.
Confirmation shows the count and exactly `sw_downloadaddon 3801682815`. Two instances on one node
receive independent requests. The console distinguishes request accepted, skipped, failed and
uncertain; acceptance does not assert download completion. No automatic retry or game lifecycle
operation occurs.

The release source retains the previously completed deployment, schedule and notification features
required by the current production baseline. Unfinished shared function groups are excluded.

## Artifact checksums

| Artifact | SHA256 |
| --- | --- |
| Release ZIP | `61523929a6f77bb6497d0ce2929ea39dc488fe0e3968286b60db2cf055880e70` |
| Bundled panel | `2fe7301a79a49eb0566acc14cfeacc8141c01839c3a9f1ab71e4ea0ce6f8cc5a` |
| Bundled daemon | `cf9fdb3c9e6253a3aef94d8f85c63fe5f5f590770b77571dea48869f63b6a68f` |
| PreAimMode 2.0.2.0 DLL | `41aecbe45e72b8345c0110c3138ee4fb9f21dcdc0f8a4fbc0d76d0726e5c397a` |

The manifest contains 70 files, including frontend assets and the companion DLL/deps/PDB. It excludes
runtime data and host-native daemon binaries; the existing Linux PTY/compression binaries are retained.
The deployment retains the existing Node.js v24.11.1 runtime and systemd definitions.

## Validation

The isolated release source passes common 58, daemon 174 passed/1 skipped, panel 82 and frontend
173 tests. Frontend type checking, lint (zero errors) and production build pass. Both `BUNDLE=1`
backend builds pass. The shared plugin harness passes 51 checks; the companion feature overlay
passes 18 checks. Both .NET builds pass with automatic deployment disabled.

Headless production-asset checks cover card/table version states, administrator/regular-user
visibility, Select all, cancellation with no requests, exact requests to two same-node instances,
request-only results, and exclusion of unfinished function groups. All APIs are intercepted with
isolated fixtures and there are no page errors or production command sends.

The shared-workspace full integration passes all 16 runnable suites and 187 tests, with one
individual environment skip; the Docker suite is skipped on Windows. The release-source full integration passes all 15 runnable suites and 179 tests, with one
individual environment skip and the Docker suite skipped. Production results are appended after deployment.

## Rollout and rollback

Each host receives a checksum-verified release under
`/opt/mcsmanager/releases/20261025-1130-addons-workshop/`. Before replacement, the deployment saves
previous code and an owner-only runtime-data archive. The 124 archive includes panel/local-daemon
data together; each game host retains its own daemon data and previous plugin files.

Only daemon supervisors are rotated; Docker game containers retain their IDs, start times and PIDs.
Deployment fails closed if the current installed code hashes differ from preflight or plugin automatic
reload is enabled. Panel static assets retain previous hashed assets for open browsers. Failures restore
previous code without overwriting current runtime data. The existing systemd runtime overrides are unchanged.

Rollback restores the corresponding backup application/static/plugin files and rotates the relevant
supervisor, checking game continuity again. Plugin rollback does not activate the old DLL. Existing
accounts, node credentials, instance settings and schedules must be preserved. An already requested
Workshop download cannot be undone by rolling back the panel.

## Activation limits

Plugin files are deployed for later maintenance activation. The existing panel RCON configuration
is retained. Until RCON is configured and the supporting DLL is loaded, live version values can remain
unknown; no file-on-disk version is shown as a runtime observation. No live CS2 download or player-view
acceptance has been performed.
