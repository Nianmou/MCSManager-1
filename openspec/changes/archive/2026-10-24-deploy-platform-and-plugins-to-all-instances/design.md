# Design

## Context

See `proposal.md` for motivation. The archived `add-sw2-platform-plugin-deployment` change has already introduced separate platform/plugin modes, package validation, administrator node-file operations, backup, and verified application. This change builds on that implementation rather than reopening its archived artifacts.

`InstanceList.vue` passes selected rows to `DeploymentDialog.openDialog`. The dialog currently has only a multi-select picker. `transport.discover()` walks node pages, but does not expose incomplete inventory as a first-class result. `prepareDeployment()` selects instances from a fresh discovery and creates one configured destination per selected node. It conservatively treats all node siblings as affected because launch scripts can hide shared paths. `DeploymentRunner` rechecks stopped state and affected identities before writing. The dialog currently requires every target to be ready and individually confirmed, so a preflight failure blocks the whole batch.

The deployment tests already cover shared targets, stopped-state checks, backup, package mapping, legacy file operations, direct/proxy transfers, and verified completion. A separate active change concerns shared configuration profiles; this proposal does not change that work or the completed schedule manager.

## Goals / Non-Goals

**Goals:** Make whole-fleet deployment the explicit default, preserve a narrower selected scope, review the batch once, and report actual coverage while retaining all existing destination checks.

**Non-Goals:** Automatic game stopping or activation, installing both package types from one action, remote release downloads, recursive filesystem discovery, multiple independently configured game directories on one node, new backend endpoints, and live production release during implementation.

## Decisions

### Explicit scope instead of selecting every visible row

Store a scope value (`all` or `selected`) separately from selected keys. Both action entry points open in `all` mode. Carry existing checkboxes only as the optional selected-mode seed. Explain the active scope and discovered counts near the top of the dialog. All mode does not depend on list filters, current node, or page.

Alternative: silently fill the current picker with visible rows. Rejected because it makes page-local selection look like fleet coverage.

### Reuse deployment discovery with explicit completeness

Extend the existing deployment discovery result with bounded node-level inventory issues, using the configured node list as the reference. Preserve per-node page counts, deduplicate `(daemonId, instanceUuid)`, and flag missing responses, page errors, invalid data, and offline nodes. Use fresh requests with explicit timeouts. A failed later page excludes that node from writes; it must never appear safe merely because a running sibling was omitted.

Keep discovery changes within the deployment transport/workflow. The schedule inventory also fetches schedules and is unsuitable as a deployment dependency. Reuse existing global instance APIs instead of introducing another backend fanout route.

For all mode, resolve all keys from the same fresh complete-per-node discovery used to build the preview. Do not capture only the dialog-opening snapshot and then omit newly discovered instances before preview. For selected mode, require the requested identities to remain resolvable. Make the planner accept a scope input or a supplied discovery snapshot to avoid two inconsistent inventory reads during preview creation.

### Preview and freeze one batch

Keep one normalized package and the current per-node game directory setting, initially `/mnt/steam/cs2/game/csgo`. Render the discovered instance count separately from unique deployment destinations. Retain one target for each node/canonical destination and retain the conservative affected-sibling list. Invalid game directories or unsupported nodes appear as blocked results; they do not trigger fallback writes into instance working directories.

Replace mandatory per-target approval clicks with one batch confirmation covering the displayed eligible destination and affected-instance lists. Preserve detailed cards and file manifests for inspection. Scope/package/directory/plugin/protected-file changes invalidate the preview and its confirmation. Targets remain frozen after confirmation. Existing before-write identity/state rechecks block changed shared scopes; retry never turns back into a new all-fleet operation.

Alternative: start deploying immediately when a package is selected. Rejected because destination mapping, protected-file replacement, and affected-instance review are already required contracts.

### Separate eligible work from blocked coverage

Allow the batch start button when at least one reviewed target is eligible, with no requirement that blocked targets disappear. Show planned, eligible, blocked, and completed counts. Run the existing sequential target executor against approved eligible targets; preserve blocked records and their causes. Keep request pacing and verification unchanged.

On retry, refresh only unresolved target identities and rebuild their read-only plans. Newly recovered nodes that had unknown instance inventory require explicit renewed review rather than hidden enrollment. Confirmed successes remain untouched. Do not claim complete deployment when excluded inventory remains unknown.

## Risks / Trade-offs

- [Default scope is broader than existing checkbox behavior] -> Label all scope prominently and require a batch preview/approval; selected scope remains explicit.
- [Incomplete inventory can miss a running shared sibling] -> Track completeness per configured node and block that node both at preview and before application.
- [Unrelated instances or launcher scripts share a node] -> Keep the existing conservative all-sibling stopped-state guard and validated per-node CS2 directory. Per-instance game-directory inference is outside this change.
- [Concurrent changes invalidate a preview] -> Freeze identities, reuse before-write checks, and require a new preview for changed affected sets or settings.
- [Large fleets generate many target cards] -> Use bounded/scrollable views and one global confirmation while retaining inspectable identities and per-node detail.
- [Legacy daemons lack custom deployment support] -> Continue existing global file APIs, package validation, transfer modes, and supported directory inspection; report unsupported targets.

## Migration Plan

1. Review these artifacts before editing application code.
2. Implement discovery completeness, scope-aware planning, and the dialog/entry integration while preserving concurrent workspace changes.
3. Run frontend type-check, lint, all frontend tests, headless fixture-based browser verification, and the project test gate for language changes. Existing integration tests exercise actual direct/proxy deployment primitives in isolated directories.
4. Update operator instructions to explain default all scope, shared-directory counts, partial coverage, and manual activation. No package is deployed into live directories by verification.
5. Production deployment is a separate authorized step. Rollback can restore the previous frontend; deployment backups remain the existing recovery mechanism for actual package operations.
