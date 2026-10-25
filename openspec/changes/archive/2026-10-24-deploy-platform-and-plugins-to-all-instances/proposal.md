# Proposal

## Why

Administrators intend the platform and plugin actions to deploy one package across the whole current fleet. The implemented dialog still starts with a manually selected target list, making this intent hard to express and easy to limit accidentally to a visible page or node.

## What Changes

- Default both **Deploy SW2 Platform** and **Deploy Plugin** to an explicit **All current instances** scope, spanning every configured node and instance page independently of list filters or existing checkboxes.
- Keep an explicit selected-instances scope for narrower deployments, with any existing list selection available there.
- Select and inspect the package once, retain per-node game-directory overrides, and present one batch preview and confirmation showing instance counts, unique deployment destinations, and excluded or blocked nodes.
- Apply once per node/canonical game directory, so shared instance installations do not receive repeated transfers. Preserve current package mapping, configuration protection, backups, verification, and manual runtime activation.
- Freeze the reviewed target scope; never enroll future instances silently. Mark incomplete inventory and unreachable nodes visibly instead of claiming fleet-wide success.
- Permit eligible reviewed targets to proceed while blocked targets remain visible as unresolved. Reuse explicit failed-target retry without replaying successful targets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cs2-deployment`: Default deployment scope to all current instances, with complete inventory discovery, a single reviewed batch, explicit exclusions, shared-destination deduplication, and selected-scope fallback.

## Impact

- Frontend: `frontend/src/widgets/instance/deployment/DeploymentDialog.vue`, `workflow.ts`, `transport.ts`, their existing tests, and the entry integration in `InstanceList.vue`.
- English/Chinese labels in `languages/` and operator instructions in `docs/cs2-deployment.md`.
- Reuse current administrator node-file APIs and direct/proxy transfer configuration; no new daemon protocol, storage migration, package source, or dependency.
- Deployment remains scoped to validated CS2 destinations. An unavailable or incompatible game directory produces a visible blocked target; discovering an instance does not authorize writing into arbitrary instance folders.
- Implementation remains local until separately authorized for production release. This proposal does not perform live package deployment or change game-server lifecycle behavior.
