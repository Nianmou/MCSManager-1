# Implementation verification

All local commands run in the background with Windows child-process hiding enabled. Browsers are
headless. Production Workshop commands, plugin activation and game lifecycle actions are excluded
from verification.

## Behavior verified

- Additive, correlated version-1 AddonsManager observations come from the exact loaded plugin registry
  identity. Loaded/absent/unloaded/indeterminate/lookup failure and invalid versions are distinguished.
  Older or malformed optional observations retain valid player, PreAimMode and SW2 data.
- Card and table production layouts show labeled AddonsManager loaded/absent values. Stopped/stale
  observations display unknown. No package-on-disk version is substituted.
- The administrator batch action confirms the count and immutable `sw_downloadaddon 3801682815`.
  It deduplicates by node and instance, supports at most 200 targets, limits concurrency to two,
  and paces all API request starts by at least 200 ms. Offline/invalid/global/stopped targets are skipped.
- Confirmation cancellation sends nothing. Duplicate activation is blocked. Failures remain independent;
  response loss after dispatch is uncertain and never automatically retried. Component disposal aborts
  local requests and clears pending pacing timers.
- Real panel/daemon/RCON tests dispatch the exact command to two same-node instances, deny unassigned
  users, and preserve process PIDs/start counts. Production UI tests intercept every API request with
  isolated fixtures and send no live commands.

## Test and build results

The original shared workspace passes common 58, daemon 174 passed/1 skipped, panel 113 and frontend
180 tests. Its complete sequential real-process integration run passes 187 tests, with one individual
environment skip; all 16 runnable suites pass. Docker is skipped on this Windows machine.

The isolated release source excludes unfinished shared function groups. Its common 58, daemon
174 passed/1 skipped, panel 82 and frontend 173 tests pass. Frontend type checking and lint pass
(zero errors; 182 existing warnings). Bundled daemon/panel builds and the Vite production build pass,
with existing dependency/chunk-size warnings. The full release-source integration run is recorded
in the final release report.

The shared PreAimMode restart/status harness passes 51 checks. The isolated companion feature branch's
focused harness passes 18 checks, and both plugin builds pass with automatic deployment disabled.
The companion branch was corrected with a follow-up commit after the repository hook staged unrelated
Panorama resources; its final diff excludes those resources. Final upload version: 2.0.2.0.

## Release boundaries

The production candidate uses the current shared plugin baseline to retain previously installed
companion/restart-notice behavior. The companion GitHub branch contains the focused feature overlay
onto its repository base; it does not commit unrelated shared-workspace changes. Its standalone DLL
is not substituted for the existing production baseline.

The previous operator decision to defer game plugin activation until maintenance remains in effect.
Installing the new DLL does not prove that a running game loaded it. Live AddonsManager acceptance
also requires configured RCON and a supporting loaded plugin. No RCON passwords/configuration are
modified by this change. See the production release report for hashes, deployment coverage and rollback.

## Publication and deployment completed

Implementation is published to `Nianmou/MCSManager-1` on `codex/addons-manager-workshop` (initial
implementation `709845360097910541ef8d5667e8a361c69509c9`) and the focused companion overlay is on
`MatthewNeko/PreAimMode` at `f38b86a269fe0d410c2b08cce77d6c9ef74a1421`.

The final release-source sequential integration passes 179 tests across 15 runnable suites, with one
individual environment skip and the Docker suite skipped on Windows. Published assets pass the same
headless fixture checks after allowing for public download latency. All 59 public frontend files match
their SHA256 hashes. All eight nodes authenticate, installed artifacts match, services are active,
anonymous command requests return 403 and integration bypass is disabled.

The panel and eight daemons are updated; seven game hosts have PreAimMode 2.0.2.0 files installed.
All 19 game container/process identities and real instance records are preserved. The first canary
rolled back on a synthetic-template timestamp/port validation false positive, which was narrowed and
successfully retried with unchanged games. Paired panel/local-daemon data and each game-node data
have owner-only backups. No Workshop download, game restart or plugin reload was requested.

All 19 current instance configurations enable RCON, while current runtime observations remain
unavailable. Activation and live runtime-version acceptance remain explicitly deferred by the operator's
previous maintenance decision; this release does not claim those observations succeeded.
