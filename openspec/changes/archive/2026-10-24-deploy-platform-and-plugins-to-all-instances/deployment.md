# Production Deployment

Deployed on 2026-10-24 after the user explicitly requested production deployment.

- Panel: `http://124.222.221.14:23333/#/instances`
- Release: `20261024-124433184-bulk-deployment`
- Release directory: `/opt/mcsmanager/releases/20261024-124433184-bulk-deployment`
- Application directory: `/opt/mcsmanager/web`
- Backup: `/opt/mcsmanager/releases/20261024-124433184-bulk-deployment/backup`

## Release contents and activation

Built the current frontend with its type check and Vite production build, and built the panel with `BUNDLE=1`. A temporary isolated local runtime successfully started the bundled panel without installed runtime dependencies and answered its authentication status endpoint. No application source was changed during deployment; the previously completed full regression results remain recorded in `verification.md`.

The release contains the completed batch schedule manager and platform/plugin deployment interface, including the all-current-instances default. Only the panel application and frontend were updated. The existing systemd runtime and configuration were retained. The Daemon was not rebuilt or restarted, and no game lifecycle operation or plugin/platform installation was executed during verification.

The release package contained 62 checksummed application files. All entries were validated after transfer. Before replacement, both panel and daemon data directories were backed up together into the private backup directory, along with the previous panel application and frontend. Existing data remained in place. The panel service was restarted after the frontend and application replacement. Previous hashed frontend assets were retained for already-open tabs. The deployment script included automatic application rollback on a failed health check.

## Verification results

- Panel root: HTTP 200, served index SHA-256 matched the local build.
- Authentication status: HTTP 200, existing installation detected.
- Anonymous node-list request: HTTP 403, permission enforcement retained.
- All 58 public frontend files matched the build's SHA-256 manifest when fetched through the public panel URL.
- Fresh headless Chromium loaded the production application and rendered the login page, with zero page errors. Authenticated deployment controls were verified with fixtures before release, not by modifying live game files.
- All eight configured nodes reconnected and authenticated after the panel restart.
- User records, node configuration, daemon configuration, and local instance configuration hashes were unchanged.
- Daemon PID before and after deployment: `3714725`.
- Panel PID changed from `3732319` to `3822502` for the controlled panel-only restart.

No visible terminal or browser window was opened. All local subprocesses used hidden execution and Chromium ran headless.

## Evidence

Local deployment and browser reports are saved in:

`C:/Users/Mateshaopu/.codex/visualizations/2026/10/24/01a16cf0-332e-7673-8e7b-def5358c4c4b/`

- `deployment-production-report.json`
- `deployed-panel-browser-report.json`
- `deployed-panel-login.png`

The server also retains `deployment-report.json`, the release ZIP and manifest, deployment script, and prior-version backup beneath the release directory. The paired data backup is private and was not copied into the public directory or source repository.
