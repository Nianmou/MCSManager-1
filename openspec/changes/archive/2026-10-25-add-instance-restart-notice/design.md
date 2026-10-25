# Design

## Context

See proposal.md for motivation. The panel already has authenticated daemon command, output-forwarding and restart interfaces; PreAimMode has a main-thread CustomHudLayoutHost and tracked command/event teardown. The user approved the conversational plan and explicitly requested implementation.

## Goals / Non-Goals

Goals: fail-closed notifications, browser-independent jobs, session-safe passive HUD and bounded resources. Non-goals: changing immediate restart/schedules, upgrading daemon protocol, production hot reload or claiming unperformed player acceptance.

## Decisions

- Add an injectable panel job service with persistent snapshots and a transport owning reference-counted output subscriptions. Default limits: 100 targets per request, 100 active targets, 200 completed jobs and 24-hour completed retention. Serialize creates and persistence, and update cancellation state synchronously before awaiting storage; do not hold an execution lock for a countdown.
- Administrator routes under `/api/instance/restart_notice`: POST create, GET list/detail and POST cancel. Targets are frozen composite daemon/instance identifiers; validate message (1-200 characters, no controls) and integer countdown (10-3600).
- Protocol v1: `pam_restart_notice begin <taskUuid> <requestUuid> <seconds> <base64urlUtf8Message>`, `status <taskUuid> <requestUuid>`, `cancel <taskUuid> <requestUuid>`. Dedicated stdout prefix `PAM_RESTART_NOTICE ` followed by JSON `{v:1,taskId,requestId,action,state,remainingMs}`. Register the waiter before sending. Use independent random request UUIDs to reject late replies, bounded 4096-character/eight-line reconstruction of ConPTY soft wraps, and exact identifiers/action matching. Status retains the expired token for 30 seconds while the banner says restarting, then clears it. No raw user text enters the command parser.
- Panel countdown starts conservatively from ACK remaining time and uses monotonic elapsed time. Poll instance continuity and plugin status every five seconds; monitor lifecycle/disconnect continuously. Recheck immediately before restart. Restart success requires stop/open events plus running status and increased start count; never re-dispatch on uncertainty.
- Persist dispatch intent before issuing restart. On panel recovery mark all unfinished targets interrupted, release reservations, and retry cancellation after node reconnect within a bounded recovery period. No automatic overdue work.
- Plugin service owns protocol state and monotonic deadlines; HUD owns slot/session/map-generation writes. A lightweight tick updates once per second. Hide with class writes, never the input-capturing host Show/Hide methods. Retain active deadline across map change, clear handles and repaint.

## Risks / Trade-offs

- ACK proves plugin acceptance, not every player's rendering: require real CS2 acceptance separately.
- Console output is not an independent authenticated plugin channel: rely on authenticated daemon transport and unpredictable task correlation; ignore chat/log lines without exact protocol structure.
- Existing daemon interfaces cannot make external/manual process changes atomic with dispatch: observe lifecycle and compare start count immediately before dispatch; abort on any detected continuity loss.
- Panel failover aborts pending countdowns instead of resuming, prioritizing no unexpected restart.

## Migration Plan

Prepare plugin DLL and existing workshop Panorama resources; test on a designated instance, then publish the panel. Older plugins time out and are skipped. Do not activate production plugins or restart live game processes during implementation. Rollback panel/plugin independently after canceling active jobs.
