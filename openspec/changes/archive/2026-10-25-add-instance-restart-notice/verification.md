# Verification record

Implementation verified locally on Windows on 2026-10-24/25. The approved plan authorizes implementation and the OpenSpec workflow. Production plugin activation and real CS2 restarts remain separate controlled release actions.

## Scope and runtime boundaries

- MCSManager source: `H:/MCSManager`.
- Plugin source: `H:/Pictures/PreAimMode` (SwiftlyS2 1.5.0, .NET 10).
- Existing immediate restart and scheduled operations retain their behavior.
- Build/test children run with hidden Windows process flags. No visible console or game control was used.
- No production plugin deployment, workshop upload, hot reload, live notification or game restart was performed.

## Automated results

| Check | Actual result |
| --- | --- |
| Common unit suite | 58 passed, 4 files |
| Common TypeScript build | Passed |
| Panel unit suite | 110 passed, 9 files; includes 18 job-service and 6 protocol/transport tests |
| Panel webpack/type build | Passed |
| Daemon kept suite | 152 passed, 1 skipped, 11 files |
| Daemon webpack/type build | Passed |
| Frontend type-check | Passed |
| Frontend ESLint, configured fix command | 0 errors, 186 warnings |
| Frontend unit suite | 163 passed, 25 files; includes 6 hook and 3 dialog tests |
| Frontend Vite production build | Passed; Sass and chunk-size warnings remain |
| Real-process restart-notification suite | 8 passed; repeated successfully in the full runner |
| Full sequential backend integration runner | Passed, exit 0: 179 passed and 1 skipped across 15 suites; Docker suite skipped on Windows |
| Plugin solution Debug build, auto-deploy disabled | Passed, 0 errors, 18 warnings |
| Plugin offline notification harness | 23 checks passed |
| Panorama source validator | Passed: 31 layouts, 34 styles, 4220 IDs, 40227 declarations, 139 known properties |
| Valve resource compiler | 2 resources compiled, 0 failed, 0 skipped, isolated artifact project |
| OpenSpec strict change validation | Passed |
| OpenSpec main-spec validation after sync | 11 passed, 0 failed |
| Git whitespace check | Passed |

The daemon suite has platform-dependent Docker/bash cases that skip or return early on Windows. These results do not establish real Docker coverage. Frontend lint warnings and plugin/compiler warnings are retained rather than hidden; no warning-free build is claimed.

## Covered boundaries

Panel tests cover strict input bounds, composite target deduplication, reservations, positive plugin acknowledgement, full countdown, one restart dispatch, stop/open/running completion, unsupported plugins, stale task/request/action replies, bounded fragmented output, subscription reference counts, cancellation races, node/lifecycle interruption, changed start counts, plugin state loss, dispatch-intent storage failure, timeouts, retention and interrupted recovery.

Real daemon/panel tests start isolated Node instance processes that implement the notification protocol, including split stdout writes. They check all task endpoints against anonymous and regular users, validation, persistence, partial success, cancellation, active-task conflicts, lost plugin state, manual stopping and panel process recovery without replay. The test processes restart; production game processes do not.

The plugin offline harness links the actual service, command and HUD sources to fake engine boundaries. It checks console restrictions, strict message encoding, duplicate/conflicting tasks, request correlation, monotonic expiry, late joiners, session reuse, bots, final-ten-second emphasis, map repaint, cancellation, missing HUD preparation and unload disposal. Fake host input-capture methods throw if called.

## Findings and incidental test repairs

- Real Windows ConPTY soft-wraps the structured plugin response, including within JSON keys, and emits CSI controls. The bounded parser now reconstructs at most eight lines and strips CSI sequences. A regression test and the real process suite verify the fix.
- An initial full integration attempt could not start the panel because another test run occupied port 23333 (`EADDRINUSE`). No unrelated process was killed. The complete sequential runner was restarted after the ports became free.
- The existing gateway-token tamper test could change only unused base64url padding bits and intermittently preserve the signature bytes. It now decodes, flips one signature byte and re-encodes. Production authentication code was not changed.
- A concurrently added frontend inherited-settings test mocked `t` but omitted `$t`; its i18n boundary now exports both. No production function-group behavior was changed for that repair.
- The instructions reference `docs/integration-test-framework.md`, which is absent in this checkout. The existing real-process harness and test skill were used as the integration reference.

## Concrete artifacts

- Candidate: `H:/Pictures/PreAimMode/artifacts/restart-notice/candidate-20261025/`.
- Candidate `manifest.json` records DLL/resource SHA256 values, Debug configuration and pending live acceptance. It contains the plugin DLL and the two compiled resource paths, not dependencies or a new VPK.
- Compiler report: `H:/Pictures/PreAimMode/artifacts/restart-notice/resources/20261024T160718115097Z/report.json`.
- Full integration log: `C:/Users/Mateshaopu/AppData/Local/Temp/mcsm-restart-notice-integration-final.log` (contains isolated test bootstrap identifiers; do not publish it as a production log).
- Release instructions: `docs/instance-restart-notice.md` and plugin `docs/restart-notice.md`.

## Separate live release gate

Actual CS2 player acceptance has **not** been performed. Before activating production plugin/panel changes, release HUD resources through the existing workshop flow, activate the new DLL on a designated test instance during an agreed window, and verify:

- Chinese text, banner placement and the final ten seconds at real screen sizes.
- No mouse capture, menu dismissal or obstruction of training input.
- Players already online and players joining during countdown see the reminder.
- Cancellation removes the reminder; map changes repaint; unload cleans up.
- The panel performs exactly one restart after the full countdown and correctly reports the new running instance.

Publish the panel feature after plugin/resources and test-instance acceptance. Old plugins must remain explicitly unsupported and skipped. Plugin ACKs establish acceptance and HUD scheduling, not proof that every client rendered the banner.

## Workflow completion

All four implementation tasks are complete. The five added requirements are synchronized into `openspec/specs/instance-restart-notice/spec.md`. The completed spec-driven change is archived as `openspec/changes/archive/2026-10-25-add-instance-restart-notice/`, preserving this record and the separately pending controlled live acceptance gate.
