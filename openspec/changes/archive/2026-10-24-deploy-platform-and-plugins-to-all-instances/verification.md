# Verification

Verified on Windows on 2026-10-24. All subprocesses inherited a temporary Node child-process preload setting `windowsHide: true`; Chromium ran headless. No visible terminal or browser window was opened.

## Frontend checks

- Type check: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit --skipLibCheck -p tsconfig.vitest.json --composite false` passed.
- ESLint, with the repository's `--fix` and ignore arguments, passed with 0 errors and 161 warnings. No unrelated behavior changes were introduced by lint.
- Full frontend Vitest passed: 21 files, 147 tests. Repeated after browser verification and temporary harness removal; final run completed at 19:34 on the verification date.
- OpenSpec strict change validation passed.
- `git diff --check` passed (Git emitted Windows line-ending normalization notices).

## Headless Chromium

The fixture used the real deployment dialog, package reader/normalizer, planner, executor, and HTTP inventory transport. File operations used an in-memory transport; no live panel or game directory was contacted. Both platform and plugin ZIPs were generated locally.

Passed checks:

- Both modes opened in all-instance scope despite one seeded list selection.
- Inventory included 52 instances across two pages on node A, one on B with an identical instance UUID to A, one running instance on D, and offline node C with unknown inventory: 54 known instances and four displayed destinations/nodes.
- Switching to selected scope retained the seeded instance. Plugin preview affected node A's 52 shared siblings and only one destination.
- Returning to all scope invalidated the selected preview. Each all-scope preview showed two eligible and two blocked destinations.
- One checkbox approved the batch. Without approval, the deployment button stayed disabled.
- Each mode uploaded exactly once to A and once to B. Neither the offline node nor the node with a running sibling received writes.
- Backup operations ran, extraction and file-size verification completed, and existing platform/plugin JSON configuration retained its original content.
- Recovery retry refreshed C and D, required new approval, and deployed once to each. A and B remained successful without repeated uploads. The recovered batch displayed 55 affected instances, four successes, and zero unresolved targets.
- Browser page errors: zero.

Artifacts are saved under:

`C:/Users/Mateshaopu/.codex/visualizations/2026/10/24/01a16cf0-332e-7673-8e7b-def5358c4c4b/`

- `deployment-all-browser-report.json`
- `deployment-all-browser.cjs`, `deployment-all-browser-check.html`, `deployment-all-fixture.js`
- `deployment-platform-all-preview.png`, `deployment-platform-all-results.png`
- `deployment-plugin-all-preview.png`, `deployment-plugin-all-results.png`, `deployment-plugin-retry-results.png`

The temporary Vite harness files were removed from the frontend directory and its test server was stopped. These browser checks cover interaction and planning; real HTTP/direct/proxy file primitives are covered by the isolated backend integration suite.

## Full regression gate

- Common unit suite: 4 files, 58 tests passed.
- Daemon kept suite: 11 files, 152 tests passed, 1 skipped (the Linux-only unreadable-JAR file-descriptor check). Linux/Docker-specific paths and the opt-in host Docker restart check are not exercised on this Windows host.
- Panel unit suite: 5 files, 58 tests passed.
- Frontend suite: 21 files, 147 tests passed.
- Sequential real-process integration: 13 suites passed, 163 tests passed, 1 skipped. The runner exited 0 at 19:37. The file suite's external URL download case remains skipped; the Docker suite was skipped at runner level on Windows. The deployment suite's three direct/proxy and authorization cases passed.

Existing panel/daemon development builds and native helpers satisfied the integration prerequisites. No backend product source was changed by this change, so the existing builds were reused. Integration tests start isolated temporary daemon/panel processes and use temporary data and directories.

## Operational limits

This implementation does not publish a production frontend or deploy a package to live servers. Game activation remains manual. Existing protocol limitations remain: no cross-administrator filesystem/process lock, conservative all-sibling checks per node, and canonical paths depend on daemon directory listings. Docker execution still needs a Linux host with Docker available.
