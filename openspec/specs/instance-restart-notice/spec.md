# instance-restart-notice Specification

## Purpose

Allow administrators to warn players through PreAimMode before restarting selected instances, with explicit confirmation, cancellation and per-instance results.

## Requirements

### Requirement: Explicit selected-instance action
The system SHALL provide an administrator-only notify-and-restart action for selected instances, with a default 15-second countdown editable from 10 to 3600 seconds and an editable message. Existing immediate restart and schedules SHALL retain their behavior.

#### Scenario: Selected targets
- **WHEN** an administrator confirms the action
- **THEN** only the displayed selected instances are targeted and each result remains visible

### Requirement: Plugin confirmation gates restart
The system SHALL require a versioned, task-correlated plugin acknowledgement before counting down and SHALL check plugin and instance continuity before dispatching restart once. Unsupported, offline, failed or interrupted targets SHALL NOT restart through this workflow.

#### Scenario: Partial notification failure
- **WHEN** one plugin fails to acknowledge while another accepts
- **THEN** the failed target is skipped and the acknowledged target continues

#### Scenario: Instance changes during countdown
- **WHEN** the instance stops, restarts, loses its node connection or loses plugin task state
- **THEN** its pending restart is interrupted and never retried automatically

### Requirement: Durable progress and cancellation
The panel SHALL own countdowns independently of browser lifetime, persist per-target results using configured storage, reject simultaneous active tasks for the same instance, and allow cancellation before dispatch. Panel recovery SHALL interrupt unfinished work without replaying restarts.

#### Scenario: Browser closes
- **WHEN** the administrator closes and later reopens the page
- **THEN** the countdown continues in the backend and its progress can be retrieved

#### Scenario: Cancel or panel restart
- **WHEN** a pending target is canceled or its panel process restarts
- **THEN** no delayed restart is dispatched and a plugin cancellation is attempted

### Requirement: Passive in-game countdown
PreAimMode SHALL accept only server-console notification commands and display a passive countdown to connected and newly joined real players, with emphasis in the final ten seconds. HUD operations SHALL respect player sessions, map lifecycle and main-thread boundaries.

#### Scenario: Players and menus
- **WHEN** a notification starts or a player joins during it
- **THEN** the player sees the remaining countdown without mouse capture or menu dismissal

#### Scenario: Cleanup
- **WHEN** the notification is canceled, expires, or the plugin unloads
- **THEN** HUD and session state are removed without affecting other HUD input

### Requirement: Bounded retention and honest results
The system SHALL bound active tasks and output buffers, retain completed jobs for at most 24 hours and 200 batches, and distinguish plugin acceptance from client-rendering proof. Retries SHALL start a fresh full notification countdown.

#### Scenario: Restart result
- **WHEN** restart is dispatched
- **THEN** success requires observed stopped and running lifecycle states rather than command delivery alone
