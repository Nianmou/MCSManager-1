# Implementation and deployment verification

Completed on 2026-10-24 after approval of the platform/plugin split.

## Delivered behavior

- Separate administrator buttons on the instance list, shared typed dialog, ZIP/folder inspection, per-node directory overrides, and exact plugin-directory mapping.
- Read-only preflight through legacy `global0001` file APIs; composite instance identifiers, pagination, shared-node deduplication, affected-instance confirmation, and stopped-state rechecks without lifecycle calls.
- Verified replacement backups: original files are copied into a unique tree alongside the ZIP before compression, preserving nested paths with legacy basename-only compressors. Existing protected configuration and data remain unchanged by default.
- Upload terminal results, explicit extraction, file-length verification, idempotent SW2 loader edits, cancel/failure recovery information, and failed-target rechecks without repeating successful targets.
- English and Simplified Chinese labels and operator documentation in `docs/cs2-deployment.md`.

## Validation

- Frontend type check and production build passed.
- Frontend: 132 tests passed, including package, transport, workflow, upload completion, dialog, and existing mod-upload and schedule regressions.
- Frontend lint: zero errors; existing/style warnings remain.
- Common: 58 tests passed. Panel: 58 passed. Daemon: 152 passed, 1 skipped.
- Full real-process integration: 160 tests passed across 13 executed suites; Docker unavailable on Windows and skipped. The new suite runs the actual deployment planner/runner against real panel/daemon HTTP and finalized chunked transfers in both direct and proxy modes, using isolated directories and a stopped test instance. Regular and anonymous global-context requests were rejected.
- Headless Chromium at 976 × 918 verified both mode dialogs, normalized package previews, target selection, and confirmation enabling without page errors. Mock API responses were confined to the browser verification; real transfer behavior is covered by integration tests.
- Local child-process hiding was applied for Windows tests to avoid interrupting the user's foreground game.

## Production publication

Only frontend static assets were published to the 124 panel. Existing hashed assets were retained for already-open tabs; the new index was replaced last. No panel or daemon restart was needed.

- Release: `/opt/mcsmanager/releases/20261024-sw2-deployment`.
- Backup: `/opt/mcsmanager/backups/20261024-sw2-deployment`, containing prior frontend files and paired panel/daemon data.
- Deployment verified 59 artifact hashes and HTTP 200, with one user, eight node configurations, and credential hashes preserved. Production authentication remains enabled.
- All eight nodes authenticated during read-only compatibility checks; all seven game nodes expose the required global context and readable game directory/loader. No package was applied to a live game directory.
- Before/after node inventories match: all 19 game instances remained running with unchanged states.
- Headless Chromium loaded the published production assets and opened both deployment dialogs without page errors. Browser API responses were intercepted with local fixtures; this UI check made no production API writes.

The supported older protocol has no distributed maintenance lock and may return normalized paths rather than physical symlink resolutions. Operators must keep affected instances stopped and avoid concurrent deployment/editing. Files deployed still require a separate manual server start for activation.
