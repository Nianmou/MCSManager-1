# cs2-deployment Specification

## Purpose

Defines administrator workflows for deploying the SwiftlyS2 runtime platform and its plugins to CS2 servers across selected nodes, with distinct package destinations and verified file deployment results.

## Requirements

### Requirement: Separate Platform and Plugin Actions
The instance list SHALL expose separate administrator actions for deploying the SW2 platform and deploying a plugin. Each action SHALL open its matching mode with all current instances as the default scope. An explicit selected-instances scope SHALL remain available and reuse existing list selections without restricting the default all-instances scope.

#### Scenario: Distinct modes
- **WHEN** an administrator opens either deployment action
- **THEN** the dialog identifies platform or plugin mode and applies that mode's destination rules

#### Scenario: Empty selection
- **WHEN** an administrator opens a deployment action without selected instances
- **THEN** the dialog defaults to all current instances and also permits explicit instance selection before starting deployment

#### Scenario: Existing selection does not narrow the default
- **WHEN** an administrator opens either action with one instance selected in a filtered list
- **THEN** the default scope remains all current instances and switching explicitly to selected scope restores the narrower selection

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

### Requirement: Complete All-Instance Deployment Scope
All-instance scope SHALL discover every configured node and every available instance page independently of list filters. The preview SHALL freeze discovered instance identities and unique destinations and identify nodes with unavailable or incomplete inventory. It SHALL NOT claim complete fleet coverage when any configured node cannot be inspected.

#### Scenario: Discover all pages and nodes
- **WHEN** the instance list displays one filtered page but deployment uses all-instance scope
- **THEN** the preview includes discoverable instances from all pages and nodes, including instances outside the filter

#### Scenario: Incomplete node inventory
- **WHEN** a configured node is offline or an instance page cannot be read
- **THEN** the preview identifies that node as blocked with unknown coverage where applicable and no deployment writes are authorized on it from incomplete inventory

#### Scenario: Scope remains frozen
- **WHEN** new instances appear after a batch preview
- **THEN** they are not silently added to that batch and a changed affected-instance set requires a new preview before files are applied to its shared destination

### Requirement: Single Reviewed Deployment Batch
Administrators SHALL select a package once and approve one batch preview for all eligible destinations. The preview SHALL show instance and unique-destination counts, per-node directories, protected-file choices, and blocked targets. Shared node directories SHALL receive one deployment. Changing scope, package, or destination settings SHALL invalidate approval.

#### Scenario: One package serves shared installations
- **WHEN** many instances on two nodes use the configured shared CS2 directory on each node
- **THEN** one approved package produces two deployment destinations and each destination receives one transfer regardless of its instance count

#### Scenario: One confirmation covers reviewed targets
- **WHEN** an administrator approves a preview with several eligible destinations
- **THEN** one deployment action starts the reviewed batch without requiring separate start actions for each instance or node

#### Scenario: Settings change invalidates approval
- **WHEN** the administrator changes the scope, package, game directory, plugin name, or protected-file replacement choice after preview
- **THEN** a fresh preview and approval are required before deployment can begin

### Requirement: Honest Partial Deployment Coverage
A batch SHALL preserve explicit blocked and failed results while allowing approved eligible destinations to proceed. Running affected instances, incomplete inventory, and invalid destinations SHALL block writes only to their affected destination. Retry SHALL refresh unresolved targets, require renewed approval, and exclude confirmed successes.

#### Scenario: Offline node does not suppress eligible nodes
- **WHEN** one configured node cannot be inspected and another has a valid stopped deployment target
- **THEN** the administrator can approve the eligible target while the unavailable node remains visibly unresolved and completion does not claim all instances were deployed

#### Scenario: Running games remain untouched
- **WHEN** a destination has any running, starting, stopping, or busy affected instance
- **THEN** deployment to that destination is blocked without stopping or restarting the game, while other approved eligible destinations can continue

#### Scenario: Retry preserves completed destinations
- **WHEN** a batch has successful and unresolved destinations and the administrator retries
- **THEN** only refreshed unresolved destinations are offered for renewed approval and completed destinations are not redeployed

### Requirement: Unified game directory
Platform and plugin deployment SHALL use one shared CS2 game directory without per-node directory selectors. Both modes SHALL map destinations below `/mnt/steam/cs2/game/csgo` and continue displaying the actual reviewed paths.

#### Scenario: Open either deployment mode
- **WHEN** an administrator opens platform or plugin deployment
- **THEN** every node uses the shared game root without repeated directory input
