# Spec Delta

## ADDED Requirements

### Requirement: Fixed Workshop download batch action
The instance-list batch menu SHALL offer administrators a Workshop download action for selected instances. The action SHALL request exactly `sw_downloadaddon 3801682815`, show this command and target count before confirmation, and provide no editable command or Workshop ID. It SHALL preserve existing selection scope and instance authorization.

#### Scenario: Select all then request the fixed download
- **WHEN** an administrator selects all instances in the current list and confirms the Workshop action
- **THEN** each unique selected node-and-instance pair is considered once for the exact fixed command

#### Scenario: Empty selection
- **WHEN** the action has no selected instances
- **THEN** it sends no command and asks the administrator to select instances

#### Scenario: Cancel confirmation
- **WHEN** the administrator cancels the target-and-command confirmation
- **THEN** no download command is requested

#### Scenario: Instances share a node
- **WHEN** two selected running instances belong to the same node
- **THEN** each receives its own command request rather than being merged into a single node operation

#### Scenario: Access changes after selection
- **WHEN** the authenticated caller no longer has access to a selected instance at dispatch time
- **THEN** the existing instance ownership gate rejects the request and no permission bypass is introduced

### Requirement: Bounded and truthful Workshop request results
Workshop batches SHALL use bounded requests and show independent per-instance request outcomes. Stopped or known-offline targets SHALL be skipped. An accepted request SHALL NOT be labeled download complete; timeouts SHALL be reported as uncertain without automatic retry. The action SHALL NOT automatically start, stop, restart, or reload any game instance.

#### Scenario: Partial node failure
- **WHEN** one selected target fails and another accepts its command request
- **THEN** the batch preserves both outcomes and continues without retrying accepted requests

#### Scenario: Stopped instance or offline node
- **WHEN** preflight observes a stopped instance or unavailable node
- **THEN** that target is skipped with a reason and no lifecycle action is attempted

#### Scenario: Command request returns successfully
- **WHEN** the existing command API accepts a target's request
- **THEN** the result identifies request dispatch and directs the operator to instance output for download progress rather than asserting completion

#### Scenario: Response is lost
- **WHEN** a command request times out after dispatch may have occurred
- **THEN** that target displays an uncertain result and the batch does not automatically resend its command

#### Scenario: Repeated activation during an active batch
- **WHEN** the same action is activated while its batch is still running
- **THEN** a duplicate batch is not dispatched and already requested targets are not sent twice
