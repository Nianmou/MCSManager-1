# Spec Delta

## ADDED Requirements

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
