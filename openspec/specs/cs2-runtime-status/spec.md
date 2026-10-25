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

### Requirement: Loaded AddonsManager version
Fresh runtime version displays SHALL include an explicitly labeled AddonsManager version obtained from the currently loaded plugin. A confirmed absence SHALL display not loaded; unreadable or stale data SHALL display unknown. Uploaded package names, files on disk, and versions from other plugins SHALL NOT substitute for the loaded version.

#### Scenario: AddonsManager is loaded
- **WHEN** a fresh authenticated runtime observation reports the loaded AddonsManager version
- **THEN** the instance table and card display that version alongside the existing PreAimMode and SW2 versions

#### Scenario: AddonsManager is not loaded
- **WHEN** the game runtime confirms that AddonsManager is absent from its loaded plugins
- **THEN** its version row displays not loaded while valid player, PreAimMode, and SW2 observations remain visible

#### Scenario: Previously observed plugin version becomes stale
- **WHEN** the instance stops or its latest observation exceeds the existing freshness limit
- **THEN** the AddonsManager row displays unknown rather than retaining the previous process's version

### Requirement: Optional AddonsManager observation compatibility
AddonsManager runtime observations SHALL be additive to the current status protocol. Missing or malformed AddonsManager data SHALL NOT invalidate otherwise valid current player, PreAimMode, or SW2 data. Unassigned users SHALL retain no access to instance observations or credentials.

#### Scenario: Existing plugin omits the new observation
- **WHEN** an existing plugin returns a valid correlated status response without AddonsManager information
- **THEN** the existing telemetry remains available and only the AddonsManager row displays unknown

#### Scenario: AddonsManager version is invalid
- **WHEN** the optional AddonsManager version is oversized, has invalid types, or contains control characters
- **THEN** the optional observation is treated as unknown without corrupting the remaining validated telemetry

#### Scenario: User lacks instance access
- **WHEN** a regular user requests observations for an unassigned instance
- **THEN** the ownership gate refuses access before any runtime data is returned
