# Tasks

## 1. Deployment simplification

- [x] 1.1 Unify the game root and add frozen optional backup policy, reviewed warnings/results and regression tests; verify `cd frontend && npm test` plus type-check and lint.

## 2. Runtime observations

- [x] 2.1 Add bounded daemon RCON/protocol helpers and lifecycle runtime status queries with tests; verify `cd daemon && npm test` and build.
- [x] 2.2 Add plugin console runtime status and verify loaded-version/player boundaries plus existing reminder lifecycle tests; run .NET build/offline tests and `cd daemon && npm test` for protocol compatibility.
- [x] 2.3 Show counts beside status and plugin/platform versions on instance cards and table, including unavailable states; verify `cd frontend && npm test`, type-check and lint.

## 3. Scheduled reminders

- [x] 3.1 Add fail-closed RCON notification schedule execution with continuity/overlap/timeout tests; verify `cd daemon && npm test` and build.
- [x] 3.2 Add schedule controls/serialization with 15-second default and legacy compatibility; verify `cd frontend && npm test`, type-check and lint.

## 4. Completion verification

- [x] 4.1 Add real-process RCON/telemetry/scheduled-reminder integration coverage and update docs; run `cd common && npm test`, `cd panel && npm test`, `cd daemon && npm test`, `cd frontend && npm test` and full backend integration, then record evidence for all five requested outcomes before archive.
