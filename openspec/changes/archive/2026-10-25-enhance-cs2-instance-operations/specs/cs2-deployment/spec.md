# Deployment Delta

## ADDED Requirements

### Requirement: Unified game directory
Platform and plugin deployment SHALL use one shared CS2 game directory without per-node directory selectors. Both modes SHALL map destinations below `/mnt/steam/cs2/game/csgo` and continue displaying the actual reviewed paths.

#### Scenario: Open either deployment mode
- **WHEN** an administrator opens platform or plugin deployment
- **THEN** every node uses the shared game root without repeated directory input

## MODIFIED Requirements

### Requirement: Backup and Configuration Preservation
Deployment SHALL enable verified pre-write backups by default, reporting their location. Administrators SHALL be able to explicitly disable backups independently of protected-file replacement, with that choice frozen into the reviewed targets and shown in approval/results. Existing configuration, plugin data and unrelated files SHALL be preserved by default; replacing protected files SHALL require an explicit preview choice.

#### Scenario: Backup fails
- **WHEN** backups are enabled and a backup cannot be created or verified
- **THEN** the destination is not overwritten and that target reports a failure

#### Scenario: Platform upgrade preserves plugins
- **WHEN** a platform package includes default configuration or plugin directories
- **THEN** existing plugin binaries, plugin data, and configuration remain unchanged unless explicitly included in the approved replacement list

#### Scenario: Explicit no-backup deployment
- **WHEN** an administrator disables backups and approves the refreshed preview
- **THEN** no recovery archive or staging tree is created, the approved replacements proceed and the result explicitly identifies the no-backup policy

#### Scenario: Backup choice changes
- **WHEN** the administrator changes the backup choice after preview
- **THEN** approval is invalidated and a fresh preview is required

### Requirement: Platform Loader Registration
Platform deployment SHALL verify the SW2 game search-path entry and, when required, add it idempotently while preserving unrelated game configuration and honoring the reviewed backup policy for the original file. Plugin deployment SHALL NOT change loader registration.

#### Scenario: Loader entry is missing
- **WHEN** the platform files are deployed and the game configuration lacks the SW2 search path
- **THEN** the workflow inserts the required entry in the supported load order and verifies the resulting configuration

#### Scenario: Loader entry already exists
- **WHEN** the game configuration already contains the SW2 search path
- **THEN** the workflow leaves that entry unduplicated
