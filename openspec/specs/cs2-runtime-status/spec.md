# cs2-runtime-status Specification

## Purpose

Provide current CS2 human player counts and loaded plugin/platform versions in instance lists without confusing unavailable telemetry with an empty server.

## Requirements

### Requirement: Live runtime observations
The system SHALL query a running CS2 instance for real player count and loaded PreAimMode and SW2 versions through authenticated, correlated console communication. Queries SHALL be bounded and stop with the instance lifecycle.

#### Scenario: Runtime status is available
- **WHEN** the plugin confirms a matching runtime-status query
- **THEN** the list shows its real player count after instance status and displays both loaded versions

#### Scenario: Query is unavailable or stale
- **WHEN** RCON is not configured, the instance stops, or the plugin fails to confirm
- **THEN** the interface shows unknown or unavailable data rather than inventing a zero count or version

### Requirement: Assigned-instance scope
Runtime observations SHALL be returned only through existing authorized instance access and SHALL NOT expose RCON credentials.

#### Scenario: Unassigned user requests runtime data
- **WHEN** a user cannot access the target instance
- **THEN** they cannot obtain its runtime observations through a new unrestricted endpoint
