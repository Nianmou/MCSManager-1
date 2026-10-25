# Verification and requirement audit

Date: 2026-10-25. Scope: local prerequisite implementation before production rollout.

## Five requested outcomes

| Outcome | Implementation | Evidence |
| --- | --- | --- |
| Players immediately after status | Table column order in `InstanceList.vue`; shared `InstanceTelemetry.vue` beside card status; fresh CS2 count with Minecraft fallback | Telemetry presentation tests; real panel/daemon/RCON fixture returns three humans; unavailable/stopped/stale data does not become zero |
| Loaded plugin and platform versions | Console-only `pam_server_status`; current loaded plugin/API assembly versions, validated correlated stdout; authorized instance info | Plugin offline player/version/console-boundary checks; real RCON observation and denied unassigned-instance access |
| One shared deployment directory | `SHARED_GAME_ROOT` maps both modes to `/mnt/steam/cs2/game/csgo`; repeated per-node inputs removed | Dialog tests for both modes and common roots on two nodes; existing deployment integration verifies direct/proxy operations |
| Optional backups independent of replacement | Default-on `backupBeforeDeploy` frozen per target; changing choice invalidates approval; no-backup warning/result; runner skips file/loader recovery artifacts | Dialog invalidation/forwarding tests; no-backup runner retains protected configuration, creates no backup tree/copy/archive, and preserves policy on retry; backup-enabled failure gate retained |
| Scheduled RCON reminders, default 15 seconds | New `restart_notice` action; legacy immediate actions remain explicit; daemon waits for matching ACK and full monotonic countdown, rechecks process/plugin and dispatches once | New schedule selection/edit/validation tests; daemon timeout/conflict/overlap/continuity tests; real RCON test proves >=15 seconds before quit and exactly two total process starts; unsupported/missing-RCON/manual-stop cases never restart |

## Checks completed

- Common build (`tsc`) and unit tests: **58 passed**.
- Panel webpack build and unit tests: **113 passed**.
- Daemon webpack build and full kept/unit suite: **163 passed, 1 skipped**. Process cases ran; unavailable Linux/Docker cases are not evidence of Docker validation on Windows.
- Frontend `vue-tsc` type check: passed. Full Vitest suite: **171 passed**, including platform loader edits with backup both enabled and disabled. ESLint on touched source and deployment/dialog test scope: **0 errors**, existing/stub warnings remain. Vite production frontend build: passed, with its existing large-chunk advisory.
- New real-process CS2 RCON suite: **4 passed** (87.58 seconds), then passed again inside the complete backend run. Real panel and daemon, real TCP authentication and child processes; no mocked cross-module path.
- PreAimMode `tools/RestartNoticeTests`: **33 checks passed**, including passive HUD lifecycle and current runtime status. Player callers, including a player context with a missing sender, cannot query status. Training bots with disguised identities are excluded.
- PreAimMode `.NET` build with `EnableAutoDeployOnDebugBuild=false`: passed. The final observed workspace artifact is `H:/Pictures/PreAimMode/artifacts/cs2-runtime-status/build/PreAimMode.dll`, assembly **2.0.0.12**, SHA256 `2942aafe719093f4d8fbf78f568e30c80c6ad181b4b894c03c403750883c81fb`. The workspace's other ongoing plugin edits are included; this is a local build, not a production deployment package.
- `git diff --check`: passed.

The complete sequential backend integration runner exited successfully: **16 suites passed, 183 cases passed, 1 case skipped**. The separate Docker suite was explicitly skipped because Windows has no supported Linux Docker test environment. Passing groups: auth, user, instance, restart_notice, cs2_operations, files, streams, dataplane, deployment, function_groups, proxy_advanced, security_user, security_instance, security_files, security_sso_redirect and security_auth. Log: `%TEMP%/mcsm-ops-full-integration.log`.

## Release boundary

No production panel/daemon deployment, plugin activation/hot reload, workshop upload, live player notification or game restart was performed. The old review candidate under `artifacts/restart-notice/candidate-20261025/` is a historical snapshot, not this new DLL. Real CS2 visual/input acceptance (Chinese banner, passive mouse behavior, late joining, cancellation and one real restart) remains a controlled release step; offline checks and process fixtures do not replace it.

All development commands used noninteractive background processes and hidden-child options. No visible command window was opened.

## Specification closure

All seven tracked tasks completed after their testing gates passed. The three capability deltas were merged into main specifications, compared requirement by requirement, and validated: **12 main specs passed, 0 failed**. Strict validation of this change passed before archiving. The change was archived on 2026-10-25 with its `.openspec.yaml` preserved.
