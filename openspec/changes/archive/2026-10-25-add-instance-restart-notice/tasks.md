# Tasks

## 1. Panel orchestration

- [x] 1.1 Implement bounded persistent job orchestration, correlated daemon transport and administrator APIs with unit tests; verify `cd panel && npm test` and `npm run build`.

## 2. Plugin notification

- [x] 2.1 Implement console-only protocol, monotonic notification service, passive HUD and lifecycle wiring; document protocol/resources and verify `dotnet build PreAimMode.sln --configuration Debug` plus notification offline tests.

## 3. Instance-list UI

- [x] 3.1 Add selected-target composer, progress/history, cancellation and fresh retries with translations and frontend regression tests; verify frontend type-check, lint and `npm test`.

## 4. Cross-module verification

- [x] 4.1 Add real-process notification integration cases and release/acceptance instructions; run all four module suites plus backend integration and record actual results separately from unperformed live CS2 acceptance.

## Workflow follow-up

- Archive after implementation verification and record the separately required controlled game acceptance before production activation.
