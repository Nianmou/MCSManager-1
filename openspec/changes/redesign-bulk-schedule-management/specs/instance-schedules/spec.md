# Spec Delta

## ADDED Requirements

### Requirement: Administrator Bulk Schedule Workspace
The global schedule manager SHALL provide administrator-only instance and schedule views with node/name filters, counts, and cross-page selection. Opening the manager SHALL select nothing. Refresh SHALL retain only valid explicit selections. The workspace SHALL expose schedule creation and deletion rather than immediate batch instance restart.

#### Scenario: Opening the manager has no implied targets
- **WHEN** an administrator opens the schedule manager with reachable and unreachable nodes
- **THEN** no instance or schedule is selected and no immediate restart control is offered

#### Scenario: Identical identifiers on different nodes stay independent
- **WHEN** two nodes contain the same instance UUID and schedule name
- **THEN** selecting either instance or schedule does not select or mutate its counterpart on the other node

#### Scenario: Selection survives pagination without expanding on filtering
- **WHEN** an administrator selects records on multiple pages and changes a filter
- **THEN** the existing explicit selection is preserved, its total is visible, and newly displayed records are not implicitly selected

### Requirement: Append Schedules to Multiple Instances
Administrators SHALL be able to draft one or more schedules once and append them to selected instances. Existing schedules SHALL remain unchanged. A duplicate name SHALL be reported as a conflict for that instance without overwrite, deletion, or automatic renaming. Existing trigger, action, name, and capacity limits SHALL continue to apply per instance.

#### Scenario: Several drafts are applied to selected instances
- **WHEN** two valid schedule drafts are submitted for three eligible instances
- **THEN** six individual creation outcomes are reported and all pre-existing schedules remain unchanged

#### Scenario: A name conflict does not stop other instances
- **WHEN** a draft name exists on one selected instance but not on another eligible instance
- **THEN** the first instance reports a conflict with its schedule unchanged and the second instance receives the new schedule

#### Scenario: Existing capacity is respected
- **WHEN** an instance has seven schedules and two non-conflicting drafts are applied
- **THEN** at most one draft is added in displayed draft order and the remaining draft reports the capacity limit

#### Scenario: Invalid drafts cannot start a batch
- **WHEN** drafts contain repeated names or violate the existing form limits
- **THEN** submission is blocked with a validation explanation before any creation request is sent

### Requirement: Apply to All Current Instances
The creation flow SHALL offer an explicit all-instances scope spanning all configured nodes and every instance page, independently of current filters. Before submission it SHALL show discovered targets and unavailable or unreadable nodes. Submission SHALL freeze that scope. Instances created later SHALL require another explicit application.

#### Scenario: All scope is independent of the current table page
- **WHEN** an administrator chooses all instances while viewing filtered page one
- **THEN** the preview includes every discoverable instance across all nodes and pages, including instances outside that filter

#### Scenario: An unreachable node prevents a complete fleet result
- **WHEN** a configured node cannot provide its instance or schedule inventory
- **THEN** the preview identifies the node as excluded with unknown coverage where applicable and completion does not claim every configured instance was updated

#### Scenario: New instances do not inherit an earlier batch
- **WHEN** an instance is created after an all-instances batch is submitted
- **THEN** that batch does not create schedules on the new instance

### Requirement: Precise Bulk Schedule Deletion
Administrators SHALL be able to select individual schedules across instances and pages for deletion. Confirmation SHALL identify the exact schedules and affected instance count, including hidden selections. Cancellation SHALL send no mutations. Execution SHALL delete only the confirmed schedule identities; selecting instances alone SHALL NOT authorize deleting their schedules.

#### Scenario: Delete a subset of schedules across instances
- **WHEN** an administrator confirms deletion of one schedule from each of two instances that have additional schedules
- **THEN** only the two confirmed schedules are deleted and all unselected schedules remain

#### Scenario: Hidden selected schedules appear in confirmation
- **WHEN** an administrator changes pages or filters after selecting schedules and opens delete confirmation
- **THEN** the confirmation includes all selected schedule identities and their instance count, not just visible rows

#### Scenario: Cancel deletion
- **WHEN** an administrator cancels the deletion confirmation
- **THEN** no schedule deletion request is sent

### Requirement: Explicit Partial Batch Results
Bulk operations SHALL show progress and a result for every planned instance/schedule pair, distinguishing success, conflict, skipped, failure, and uncertain outcomes. One failure SHALL NOT suppress other outcomes or roll back successes. Execution SHALL bound concurrent requests and prevent duplicate submission. Transport failures SHALL NOT be presented as confirmed success or automatically retried.

#### Scenario: One node fails during a batch
- **WHEN** a node becomes unreachable after submission while another node accepts operations
- **THEN** successful operations remain applied and the other affected entries report failure or uncertainty with their node, instance, and schedule identity

#### Scenario: Retry avoids successful operations
- **WHEN** an administrator requests retry after partial completion
- **THEN** successful entries are excluded, uncertain entries are refreshed before explicit resubmission, and newly observed conflicts are preserved

#### Scenario: Repeated confirmation cannot duplicate an active batch
- **WHEN** an operation is already executing and the administrator clicks submit again
- **THEN** no second batch starts

### Requirement: Bulk Schedule Authorization and Compatibility
The global workspace SHALL remain restricted to administrators. Every mutation SHALL retain server-side authorization for its target instance and existing schedule validation. Existing per-instance management for assigned users, daemon protocols, storage formats, and schedule execution semantics SHALL remain compatible.

#### Scenario: Assigned user retains ordinary instance schedule access
- **WHEN** a regular user manages schedules for an assigned instance through the existing per-instance flow
- **THEN** authorized operations continue to work without granting access to the global administrator workspace

#### Scenario: Forged targets remain unauthorized
- **WHEN** a regular user submits schedule mutations for an unassigned instance directly
- **THEN** the server rejects the request regardless of frontend selection state
