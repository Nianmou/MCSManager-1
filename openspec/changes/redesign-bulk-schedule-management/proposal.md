# Proposal

## Why

The global schedule manager currently offers per-instance creation/deletion and a batch instance restart, while administrators need to add and delete schedules in bulk. Repeating the same configuration for every instance makes fleet-wide schedule setup slow and error-prone.

## What Changes

- Redesign the administrator schedule manager around instance selection and schedule management, removing its unrelated batch instance restart action and automatic selection of unreachable instances.
- Support drafting one or several schedules once and appending them to selected instances or all currently discoverable instances across nodes and pagination.
- Preserve all existing schedules. Report duplicate names as conflicts without overwriting, clearing, or renaming existing schedules, as confirmed by the user.
- Provide a schedule list with individual schedule checkboxes, cross-page selection, filters, and a confirmed batch delete showing the exact affected instances and schedules.
- Show preflight exclusions, bounded execution progress, and per-instance/per-schedule success, conflict, failure, or uncertain outcomes. Refresh and retry only explicitly chosen unresolved items.
- Keep existing schedule limits, per-instance APIs, authorization, persistence, and daemon compatibility. Applying to all is a one-time operation, not a policy for future instances.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instance-schedules`: Add administrator bulk creation, all-instance targeting, precise bulk deletion, and observable partial-result behavior while preserving the existing per-instance contract.

## Impact

- Frontend: `ScheduleManager.vue`, extracted schedule form/serialization logic reused by `NewSchedule.vue`, a focused bulk-operation composable, associated types/tests, and the schedule-manager entry in `InstanceList.vue`.
- Localization: English source keys and Chinese translations for the redesigned flow in root-level `languages/`.
- Backend: Reuse `/api/protected_schedule` and the existing administrator overview endpoints; no new batch API, daemon protocol, storage format, dependency, or migration is planned.
- Existing uncommitted overview/pagination/test changes are inputs to preserve and review, not files to reset. Current overview errors are node-level; failed node reads will conservatively exclude that node until refreshed.
- Verification: frontend type-check, lint, and full Vitest suite; existing panel/daemon suites and real-process backend integration provide regression coverage for the reused schedule endpoints during implementation.
