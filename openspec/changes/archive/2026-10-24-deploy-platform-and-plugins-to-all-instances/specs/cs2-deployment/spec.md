# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
