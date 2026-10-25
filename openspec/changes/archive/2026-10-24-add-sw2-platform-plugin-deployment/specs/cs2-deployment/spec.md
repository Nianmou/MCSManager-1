# Spec Delta

## Purpose

Defines administrator workflows for deploying the SwiftlyS2 runtime platform and its plugins to CS2 servers across selected nodes, with distinct package destinations and verified file deployment results.

## ADDED Requirements

### Requirement: Separate Platform and Plugin Actions
The instance list SHALL expose separate administrator actions for deploying the SW2 platform and deploying a plugin. Each action SHALL open its matching deployment mode, reuse selected instances, and offer target selection when the selection is empty.

#### Scenario: Distinct modes
- **WHEN** an administrator opens either deployment action
- **THEN** the dialog identifies platform or plugin mode and applies that mode's destination rules

#### Scenario: Empty selection
- **WHEN** an administrator opens a deployment action without selected instances
- **THEN** the dialog permits selecting instances before starting the deployment

### Requirement: Explicit Package Mapping
The deployment workflow SHALL accept local ZIP packages and folders and preview their destination paths before writing. Platform packages SHALL map to the selected CS2 game directory. Plugin packages SHALL map only below the selected SW2 plugins directory, with exactly one plugin directory layer.

#### Scenario: Platform archive layout
- **WHEN** a platform package has a recognized `game/csgo`, `csgo`, or `addons/swiftlys2` wrapper
- **THEN** the preview normalizes the wrapper and installs into the corresponding game directory without duplicated path segments

#### Scenario: Plugin folder layout
- **WHEN** a folder named `PreAimMode` is selected for plugin deployment
- **THEN** the preview maps its contents to `addons/swiftlys2/plugins/PreAimMode` exactly once

#### Scenario: Ambiguous or unsafe package
- **WHEN** an archive has conflicting roots, incompatible platform binaries, escaping entry paths, or platform files in plugin mode
- **THEN** the workflow rejects it before writing destination files and explains the invalid layout

### Requirement: Authorized Node File Operations
Only administrators SHALL perform this deployment workflow. Existing file permissions and workspace boundaries SHALL remain enforced. Shared game directories outside an instance workspace SHALL use the authorized node file context rather than expanding the ordinary instance's access.

#### Scenario: Regular user cannot deploy
- **WHEN** a regular user attempts the node deployment workflow
- **THEN** it is denied and no deployment upload credential or destination mutation is produced

#### Scenario: Legacy protocol compatibility
- **WHEN** a connected daemon supports existing node file and transfer operations but lacks custom real-path or deployment routes
- **THEN** deployment uses the supported operations without requiring a daemon upgrade

#### Scenario: Unsupported destination context
- **WHEN** a node cannot provide the required authorized file context
- **THEN** preflight fails for that node before destination files are changed

### Requirement: Shared Destination Planning
The workflow SHALL identify targets by node and canonical destination, deduplicate shared destinations, and list every configured instance sharing each destination. Before applying files it SHALL verify that all affected instances are stopped, and SHALL NOT automatically stop, start, restart, or reload them.

#### Scenario: Multiple instances share files
- **WHEN** three selected instances on a node share one game and plugin directory
- **THEN** the preview shows one deployment and all affected instances, and the files are transferred once

#### Scenario: Running unselected sibling
- **WHEN** an unselected instance sharing the destination is running
- **THEN** file application is blocked with the affected instance identified and its process remains running

### Requirement: Backup and Configuration Preservation
Before overwriting files, deployment SHALL create and verify a backup of the files to replace and any loader file to edit, reporting the backup location. Existing configuration, plugin data, and unrelated files SHALL be preserved by default; replacing protected files SHALL require an explicit preview choice.

#### Scenario: Backup fails
- **WHEN** the backup cannot be created or verified
- **THEN** the destination is not overwritten and that target reports a failure

#### Scenario: Platform upgrade preserves plugins
- **WHEN** a platform package includes default configuration or plugin directories
- **THEN** existing plugin binaries, plugin data, and configuration remain unchanged unless explicitly included in the approved replacement list

### Requirement: Platform Loader Registration
Platform deployment SHALL verify the SW2 game search-path entry and, when required, add it idempotently while preserving unrelated game configuration and backing up the original file. Plugin deployment SHALL NOT change loader registration.

#### Scenario: Loader entry is missing
- **WHEN** the platform files are deployed and the game configuration lacks the SW2 search path
- **THEN** the workflow inserts the required entry in the supported load order and verifies the resulting configuration

#### Scenario: Loader entry already exists
- **WHEN** the game configuration already contains the SW2 search path
- **THEN** the workflow leaves that entry unduplicated

### Requirement: Verified Deployment Results
The workflow SHALL distinguish queued, transferring, extracting, verifying, successful, failed, and canceled targets. Success SHALL require finalized transfer, finished extraction where applicable, and destination verification. Results SHALL distinguish files deployed from runtime activation and permit retrying failed targets without redeploying successful ones.

#### Scenario: Queue admission is not completion
- **WHEN** an upload has only entered the transfer queue
- **THEN** the target remains pending or transferring and does not report successful deployment

#### Scenario: Extraction or verification fails
- **WHEN** extraction is rejected or an expected destination file is missing or has an unexpected size
- **THEN** the target reports failure with its backup location and does not claim the plugin or platform is active

#### Scenario: Mixed batch outcome
- **WHEN** one node succeeds and another fails
- **THEN** both results remain visible and retry selects only the failed target by default
