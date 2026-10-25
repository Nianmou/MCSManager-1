# Design

## Context

See `proposal.md` for motivation. `ScheduleManager.vue` already merges the administrator node list, paginated global instance list, and global schedule overview. Its selected rows currently drive immediate instance restart; schedule mutations still use `NewSchedule.vue` or individual delete buttons. Existing uncommitted changes fix pagination, cross-node UUID collisions, and overview compatibility and must be preserved.

`NewSchedule.vue` binds its form and `useSchedule` to one instance. `useSchedule` also catches mutation errors for notifications, making it unsuitable as a batch result source. `/api/protected_schedule` already exposes instance-authorized POST/DELETE operations. The daemon rejects duplicates and enforces eight schedules per instance, ten actions per schedule, and interval limits. The panel overview service uses the older-compatible `schedule/list` protocol with five workers per node and exposes only a node-level partial-read error.

The design is required because selection scope, request concurrency, partial results, and shared form extraction affect correctness across multiple components.

## Goals / Non-Goals

**Goals:**

- Make instance targets, schedule drafts, and individual deletion targets distinct and visible.
- Reuse existing authorized endpoints and preserve scheduler/storage semantics.
- Keep selection and results correct across nodes, pagination, refreshes, and partial failures.
- Share form fields and serialization without coupling a draft to a target instance.

**Non-Goals:**

- Fleet transactions, server-side background batch jobs, or automatic offline replay.
- Persistent templates, policies for future instances, or changing the eight-schedule limit.
- Bulk replacement, overwriting conflicts, or redesigning per-instance edit behavior.
- Changing date/cron recurrence semantics or adding arbitrary host command execution.

## Decisions

### 1. Two views with separate selection state

Keep the existing entry point and a wide, responsive manager dialog with two tabs:

- **Instances**: node, instance, connectivity, schedule count, concise schedule summary, and instance checkboxes. Toolbar: batch add to selected, apply to all instances, refresh, node filter, and instance search.
- **Schedules**: one row per schedule with node, instance, name, trigger, action summary, recurrence count, and a schedule checkbox. Toolbar: batch delete, refresh, and node/instance/schedule filters.

Creation is available even for instances with no schedules. A schedule view is necessary because selecting an instance is ambiguous authorization for deleting its schedules. Keep direct single-instance add/edit/delete available as secondary actions. Remove immediate batch restart and offline auto-selection from this manager; scheduled restart remains an ordinary draft action.

Selection uses composite identities `(daemonId, instanceUuid)` and `(daemonId, instanceUuid, taskName)`, encoded without ambiguous delimiter collisions. State survives table pagination/filtering. Show total selected and hidden selected counts with a clear-selection control. Header selection applies only to the visible page; label an additional action for selecting all filtered schedules or instances across pages. Switching tabs never converts instance selections into deletion targets. Refresh intersects selections with confirmed current records and visibly reports removed selections.

Alternative: one nested instance table for all operations. Rejected because schedule selection becomes difficult to distinguish from instance selection and creates hidden deletion scope.

### 2. One creation composer with selected/all target scope

Both creation toolbar actions open the same composer with an explicit scope selector:

1. Review selected instances or choose all current instances across every node and page.
2. Prepare a list of one to eight schedule drafts; add, duplicate, edit, or remove draft cards using the existing schedule field layout.
3. Review target count, draft count, potential creation count, and exclusions, then apply.

The user confirmed append-only behavior with same-name conflicts. Display that behavior beside the final action. One draft is the default; multiple drafts remove the need to repeat a complete fleet operation for related schedules. Names must be unique within the draft list, and existing form constraints apply. Target selection never changes draft values.

All scope ignores current filters and completes every available node's instance pagination before preview. Refresh inventory before the final preview, show unknown/offline nodes, and freeze target identities and deep-copied draft payloads on submission. New instances are not enrolled later. If inventory is incomplete, label the operation as applying to discovered eligible instances and require the visible preview rather than implying full coverage. Do not infer instance counts for unreachable nodes.

### 3. Reuse form fields and pure serialization

Extract schedule fields into a controlled component, for example `ScheduleTaskFields.vue`, with values passed down and updates emitted up. Extract trigger parsing/serialization as pure helpers that return a fresh API payload, including the existing empty-count-to-`-1` normalization. `NewSchedule.vue` keeps its single-instance mutation/edit orchestration; the batch composer uses the same fields and serialization without calling the single-instance dialog in a loop.

Call `scheduleCreate` and `scheduleDelete` directly from a bulk composable. Give each concurrent request its own API wrapper state and require an affirmative result; inspect the existing wrapper's error contract during implementation. Do not infer success from a stale shared response ref or from `useSchedule` swallowing an exception. Avoid altering unrelated single-instance edit behavior during extraction.

Alternative: add an instances prop and batch mode to `NewSchedule.vue`. Rejected because it mixes UI drafts, per-instance edit side effects, and batch execution in one component.

### 4. Ordered, bounded requests with explicit outcomes

A focused composable owns frozen operations and results identified by node, instance, schedule, and operation kind. Limit active mutations to five across the batch and execute drafts sequentially in displayed order within each instance. This keeps capacity handling deterministic without requiring a new batch API. Flatten deletion selections into the same result model.

Preflight skips unreachable nodes and nodes with incomplete schedule reads. Use known names and remaining capacity to report per-pair conflicts/limits; process eligible drafts in order. Server validation remains authoritative if another client changes schedules after preflight. A conflict or failed draft does not prevent an otherwise eligible later draft or another instance from being attempted.

Results distinguish pending/running, success, conflict, skipped, failed, and uncertain transport outcomes. Show completed/total progress, per-category counts, and inspectable detail rows. One failure never cancels successful operations or causes rollback. Block concurrent submissions and normal dialog closure while executing. Destroy operation state when the completed dialog is released; component unmount stops dispatching queued work and does not claim to undo requests already sent. No persistent background queue is added.

Offer explicit retry for unresolved entries only. Refresh their schedules first; never resubmit confirmed successes automatically. If a timed-out create now exists, report that it exists without overwriting it or claiming proof of the original request's success. If a timed-out delete is absent, report the desired absence. If it remains present, require explicit deletion confirmation again. There is no automatic retry loop.

Alternative: one backend fleet endpoint and persistent job records. Deferred because existing endpoints already enforce the needed permission and validation boundaries and remain compatible with older daemons.

### 5. Delete exact schedule selections

Delete confirmation shows the number of schedules, affected instance count, and a scrollable list of node/instance/name identities, including filtered-out selections. The danger button names the schedule count. Cancel sends no request. A separate explicit select-all-filtered action allows deleting many schedules quickly; merely selecting instances never clears all their schedules.

After completion, refresh inventory, retain result details, and remove successful deletion targets from selection. Already absent schedules are reported as absent rather than as newly deleted when that state can be confirmed.

### 6. Preserve permission and localization boundaries

The global entry and workspace require administrator status; the overview endpoints already enforce it. All mutations continue through instance-authorized panel endpoints. Existing assigned-user access remains in the per-instance schedule flow. Draft command actions are instance console commands using the established action model, never host shell commands.

Use descriptive `TXT_CODE_` keys in `languages/en_US.json` with Chinese translations in `zh_CN.json`; use single-brace frontend parameters for counts and names. Translate redesigned labels and statuses, including hard-coded text that is replaced in the manager and its entry. Do not run source-rewriting i18n tooling incidentally.

## Risks / Trade-offs

- **Unreachable nodes cannot enumerate their instances** -> Report node-level unknown coverage, skip them, and never claim complete fleet success.
- **Node-level read errors lack per-instance detail** -> Conservatively exclude that node until a successful refresh; avoid expanding the backend response contract in this change.
- **Overview fanout still grows with fleet size** -> Reuse the existing bounded per-node reads, avoid duplicate simultaneous reloads, and keep mutation concurrency globally bounded. A paginated backend inventory can be considered separately if production scale requires it.
- **Concurrent clients can invalidate preview** -> Preserve daemon validation, record precise per-item outcomes, and refresh before retries.
- **Delete endpoints have no revision token** -> Confirmation binds to node/instance/name. A concurrent same-name replacement cannot be distinguished atomically; a conditional-delete protocol is outside this change.
- **Browser closure interrupts local orchestration** -> Do not claim durable completion; reload actual state before another submission and avoid automatic replay.
- **Form extraction can affect single-instance scheduling** -> Cover existing trigger serialization, count handling, and single-instance create/edit behavior with frontend tests.
- **Existing local changes overlap the manager** -> Implement on the current working tree, preserve the overview tests and service, and review combined diffs without resetting unrelated work.

## Migration Plan

No data migration or dependency change is required. After human review, implement the frontend changes, run the relevant checks and backend regression suites, and deploy the frontend through the normal release process. Rollback restores the previous frontend; successfully created/deleted schedules remain normal daemon records and are not automatically reversed. Archive only after implementation and its testing gate complete.
