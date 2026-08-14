# Runtime State Controller

`SMARTCHARGE - Runtime Controller.js` is the single target runtime entry point.
It collects a normalized snapshot, evaluates provider evidence, reconciles the
Session, invokes the canonical planner-v2 decision pipeline, derives desired
plug state, and reports or applies lifecycle and actuator actions.

## Modes

`SmartChargeRuntimeMode` selects `shadow` or `active`; the configured default is
`shadow`. Shadow mode may fetch prices and calculate decisions for an existing
Session, but it does not change planner variables, write decision telemetry,
create/reset Sessions, persist disconnect observations, or send plug commands.
Its result exposes `would_create_session`, `would_switch_on`,
`would_switch_off`, `would_complete_session`, `suspected_disconnect`,
`telemetry_contradiction`, or `none` as applicable.

Active mode owns lifecycle and physical plug reconciliation. It must only be
enabled after the corresponding legacy Advanced Flow branches are disabled.

## Provider evidence

Health and freshness are separate:

- health is `HEALTHY`, `CONTRADICTED`, or `UNAVAILABLE`;
- freshness is `FRESH`, `STALE`, or `UNKNOWN`.

A retained capability value is not proof of freshness. A Session can only be
created from a connected status with `HEALTHY` health and `FRESH` evidence.
Freshness comes from a capability timestamp exposed by Homey, or the explicit
`SmartChargeConnectionEvidenceAt` timestamp written by a trustworthy
event-driven connection trigger. Without either, freshness is `UNKNOWN` and a
periodic run cannot create a Session.

`SmartChargeConnectionEvidenceAt` is single-use lifecycle evidence. Active mode
clears it immediately after it creates a Session and during every terminal
cleanup. Shadow mode only evaluates it and never consumes it.

The capability names are configurable fallbacks, not claims about the real
Mercedes device. Shadow diagnostics report the capability actually found and
its raw value for vehicle status and preconditioning.

An existing Session is local authority. `Unplugged` combined with charging
power is contradictory provider telemetry and preserves the Session. Provider
unavailability also preserves an existing Session conservatively.

## Disconnect confirmation

`Unplugged`/`Disconnected` with idle power starts a suspected disconnect. Active
mode persists the first observation in `SmartChargeDisconnectObservedAt`. The
Session is preserved and the plug remains off before the configured timeout.
After `disconnectConfirmationMinutes`, active mode emits
`charger_disconnected` and clears the Session through the runtime lifecycle
reset path. Charging power or trustworthy connected evidence cancels the
pending observation. This observation-before-action order prevents the
controller from creating its own zero-power evidence.

Completion from target battery has higher priority than disconnect, followed
by expired Session, confirmed disconnect, suspected disconnect, manual
override, planner request, preconditioning, and waiting. In active mode an
expired planner result is a runtime-owned terminal transition: the plug is
switched off, `session_expired` is emitted, and runtime state is cleared without
turning the Session into `manual_reset`. Runtime states remain internal and do
not replace public Session statuses.

Successful active-mode physical transitions emit `smartcharge_on` or
`smartcharge_off` after the Homey command succeeds. Matching states, failed
commands, duplicate runs, and shadow proposals do not emit actuator lifecycle
events.

## Idempotency and concurrency

Desired and actual plug states are compared before commands. Session existence
is rechecked immediately before creation, and the disconnect timestamp is
persisted across independent executions. An in-memory guard prevents re-entry
inside one HomeyScript instance. HomeyScript provides no atomic cross-process
lock in the current architecture, so separate instances are not strictly
serialized; state reconciliation and idempotent actuator checks limit effects.

## Rollout

1. Keep legacy Advanced Flows active and deploy the Runtime Controller in
`shadow` mode, triggered every 15 minutes and optionally by fast events.
2. Compare proposed actions, capability diagnostics, and planner decisions for
   several days.
3. Disable the corresponding legacy lifecycle/power-control branches, then
   switch `SmartChargeRuntimeMode` to `active`.
4. After validation, remove obsolete business logic from Advanced Flows so
   remaining Flows are triggers only.

Never run the legacy and runtime lifecycle/actuator owners active at the same
time. Shadow mode never consumes connection evidence, persists disconnect
state, updates planner Logic variables, switches the plug, or emits lifecycle or
decision telemetry. Telemetry v2 schema remains unchanged during this hardening
pass.
