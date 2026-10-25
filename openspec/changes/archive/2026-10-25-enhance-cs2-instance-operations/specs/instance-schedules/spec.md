# Schedule Delta

## ADDED Requirements

### Requirement: Newly configured notified restarts
New restart plans SHALL offer a notify-before-restart action with a default 15-second countdown and editable bounded message. Existing persisted immediate-restart actions SHALL retain their behavior and be identified explicitly when edited.

#### Scenario: Add a restart plan
- **WHEN** a user selects restart while creating a plan
- **THEN** its action requests player notification through RCON before restart instead of immediate restart

### Requirement: Confirmed scheduled restart
A notified restart SHALL require matching plugin acceptance, wait the full monotonic countdown and recheck process/plugin continuity before restarting once. Missing RCON, unsupported plugins, conflicts or lost continuity SHALL fail without restarting. Concurrent runs for the same instance SHALL NOT overlap.

#### Scenario: Scheduled notification succeeds
- **WHEN** PreAimMode acknowledges the task and remains healthy through countdown
- **THEN** players receive the passive reminder and the daemon dispatches one restart after the deadline

#### Scenario: Scheduled notification fails
- **WHEN** the plugin does not acknowledge or the instance changes before the deadline
- **THEN** the scheduled restart is skipped, its failure is logged and listeners/timers are cleaned
