# CS2 operations production release, 2026-10-25

Release ID: `20261025-0925-cs2-operations`.
Panel: <http://124.222.221.14:23333/#/instances>.
Panel started at 09:32:29 Asia/Shanghai; final authentication check completed at 09:35:12.

The operator requested production deployment and explicitly selected **update plugin files without reloading the game plugin**. No plugin reload, workshop publication, player notification, or game restart was requested by the release scripts. All local tools ran without visible child windows.

## Published artifacts

- Bundled panel 10.22.0 and frontend, including the 15-second default, restart-notification history, schedule changes, deployment backup choice, and instance telemetry presentation.
- Bundled daemon 4.19.3 on all eight configured nodes: the panel's local node plus seven game nodes. Node.js v24.11.1 was installed in the release directory; its archive matched the official Node.js SHA256 list. Existing Linux PTY/compression binaries were retained.
- PreAimMode 2.0.0.14 DLL, deps manifest and PDB installed on seven game nodes. Existing plugin configuration, dependencies and data were retained. Automatic plugin hot reload was confirmed disabled before replacement. The new DLL also contains other completed work present in the shared plugin workspace.
- Two compiled restart-notification Panorama resources staged under each game node's release directory, `hud-resources/panorama/...`. These are release artifacts for the existing workshop flow, not mounted or published client resources.

Artifact hashes:

| Artifact | SHA256 |
| --- | --- |
| Release ZIP | `daf4324b0ac4b347c48d7e3b6d210df360dc618a3c598cc0812899520738db51` |
| Panel app.js | `e473a4eff76897bd752cbdd3d183c081e70ed66190a4d2ca9cb8bb36a93443de` |
| Daemon app.js | `182c82ce18f421128753ca3e9ddc3e6792141df454518d1d46b5745cf9b77779` |
| PreAimMode.dll | `3b31068a7f7c0b3f36cc018ea9d85e6dc96d67fd4344ec5eae57c2e6f887c1b1` |

## Deployment coverage

| SSH target | Role | Running game containers preserved |
| --- | --- | ---: |
| cs2-txy-bj | Beijing | 2 |
| cs2-txy-gz-1 | Guangzhou | 3 |
| cs2-xgy-zjbgp-1 | Zhejiang 1 | 3 |
| cs2-xgy-zjbgp-2 | Zhejiang 2 | 3 |
| cs2-xgy-sdzz | Zaozhuang | 2 |
| cs2-neko-zjbgp-1 | Zhejiang 7–9 | 3 |
| cs2-neko-zjbgp-2 | Zhejiang 10–12 | 3 |
| prod-124 | Panel and empty local daemon | 0 |

Daemon supervisors were rotated separately from Docker-owned game processes. Existing labeled containers were reattached. Each release compared container IDs, start timestamps, PIDs, and game-process start identifiers before and after deployment. All 19 running game containers remained unchanged. Instance and schedule records, panel accounts and registered nodes were preserved.

The first Beijing attempt rolled back automatically because its release validator treated the normal `currentAllocatablePort` cursor advance on container reattachment as a persistent-setting change. Existing games and connection credentials were unchanged. The validator was corrected to allow that runtime cursor, and the successful retry was verified. The first attempt remains available as `20261025-0925-cs2-operations-attempt1`.

## Verification

- Production `BUNDLE=1` daemon/panel webpack builds passed; frontend type check and production Vite build passed. Expected dependency/chunk-size warnings remain.
- Release PreAimMode .NET build passed with 18 warnings and zero errors. The restart-notice offline harness passed all 33 checks. Both Panorama resources compiled successfully.
- All eight installed daemon hashes, all seven installed plugin DLL/deps/PDB hashes, both staged resources on every game node, and installed panel/index hashes matched the release manifest.
- Public panel returned HTTP 200. All 58 published frontend files matched their SHA256 hashes over public HTTP.
- Headless browser rendered the login page without page errors. This did not authenticate as the administrator or exercise live game operations.
- All eight configured nodes authenticated after the new panel started, including the local daemon reached internally. A direct public probe cannot reach that local-only daemon; its authenticated panel reconnection was verified in the current boot's journal.
- Anonymous access to `/api/instance/restart_notice` returned HTTP 403. The existing installation and its administrator account were retained.
- The prerequisite full tests were already completed before release: common 58, panel 113, daemon 163 passed/1 skipped, frontend 171; real-process integration 183 passed/1 skipped across 16 suites. See the archived [verification record](../../openspec/changes/archive/2026-10-25-enhance-cs2-instance-operations/verification.md). Those full suites were not repeated solely for packaging; this release did not change application source.

## Pending activation and client acceptance

The deployed DLL is a file version, not a claim about the currently loaded plugin assembly. Plugin activation was deliberately deferred. The compiled HUD resources still need the established workshop publication/client distribution flow. No live CS2 player-view acceptance was performed.

All 19 configured game instances had panel RCON disabled and no configured RCON port at inspection. Their settings and passwords were not modified. CS2 runtime player/version observations remain unknown until RCON is configured and a supporting plugin is loaded; newly scheduled notified restarts fail closed without it. Manual panel reminders also require a supporting loaded plugin and a matching protocol acknowledgement. Unsupported instances are skipped without restarting.

## Recovery material

Every host retains `/opt/mcsmanager/releases/20261025-0925-cs2-operations/backup/`, containing previous application/plugin artifacts and an owner-only runtime-data archive. On the panel host, the archive includes panel and local daemon data together; each game node retains its own daemon data archive. Deployment reports and process snapshots are saved alongside them.

The daemon runtime override is `/etc/systemd/system/mcsm-daemon.service.d/90-cs2-operations-runtime.conf`. A rollback must account for that override, restore the corresponding application artifacts and previous web assets, and preserve current runtime records. Restoring plugin files does not activate them. Cancel active notification tasks before any later panel rollback; plan plugin activation and any game restarts separately.

## Follow-up: explain missing telemetry configuration

Release `20261025-0954-telemetry-hint` updates frontend static assets only. Following the operator's report of unknown player/version values, read-only checks reconfirmed missing panel RCON configuration on the inspected Beijing and Zhejiang 10–12 instances. Their game CFG trees contained no `rcon_password` definitions. The operator explicitly chose to defer plugin reloading until maintenance.

Running non-Minecraft instances with incomplete RCON settings now display **RCON not configured** for missing telemetry, with a tooltip explaining the maintenance prerequisites. Confirmed values, stopped-instance handling and Minecraft player queries retain their existing behavior. This is a presentation correction; it does not configure RCON, activate a plugin, or establish that a live query succeeds.

Frontend type checking, scoped ESLint and all **173 tests** passed; the Vite production build passed. The static deployment verified 58 files and preserved the backend code, panel/daemon PIDs and runtime records. Previous static assets remain in `/opt/mcsmanager/releases/20261025-0954-telemetry-hint/backup/public/`. No service restart, plugin reload, game command, or game restart was performed for this follow-up.
