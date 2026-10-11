# Runtime State Controller

Baseline: SmartCharge 0.6.4+build.17. This page owns runtime semantics, not Flow
installation or deployment status. Use [Homey Flows](HomeyFlows.md) for the current
five-minute topology and [Homey deployment](HomeyDeployment.md) for status.

## AUTO / MANUAL / BLOCKED

These are conceptual permission/ownership labels, not a new Logic enum. MANUAL
means valid independent Manual Charging intent. BLOCKED means Automatic Charging
is denied by block/terminal/token/grant checks; it can coexist with Manual Charging.
AUTO means permission is available, not plug ON: Session/evidence, battery, planner
and Actuator gates still apply. `SmartChargeRuntimeMode=active|shadow` is separate.

## Independent manual charging

Manual ON and Auto Mode require `SmartChargeRuntimeMode=active`; explicit USER_STOP
remains available in shadow mode as a user-requested safety action. `Manual Override On`
now activates durable manual intent. `Manual Override Off` means USER_STOP;
the new `Auto Mode` entry explicitly returns to automatic charging. In active
mode `Run Decision` and `State Sync` delegate to Runtime Controller. Shadow-mode
legacy compatibility remains, with all physical commands passing through the
runtime command function and its safety gate.

Manual charging does not create, expire, or depend on an automatic session and
does not call Tibber. Automatic resets cannot clear its intent or timers.
Mercedes device absence is diagnostic, not a manual stop condition.
`SmartChargeManualMode=true` is intent, not evidence of charging.

The persisted states are IDLE, STARTING, CHARGING, STOPPING, COMPLETED, STOPPED,
and ERROR. Activation time is saved before requesting power. A restored raw flag
without a valid activation record is RECOVERY_BLOCKED: runtime cannot invent a
new timestamp. Repeated ON keeps the deadline; ON after a completed stop starts
a new activation.

- START_CONFIRMED requires two independent fresh **plug** `measure_power`
  samples above 500 W, at least 30 seconds apart. Re-reading one timestamp does
  not count. Samples must be at/after activation, non-future, at most 60 seconds
  old, with the plug ON. Lower power, an unavailable/stale observation, or a gap
  over 360 seconds resets unconfirmed high-power evidence.
- LOW_POWER only applies after confirmed consumption. Independent samples
  at/below 5 W spanning 180 seconds trigger OFF and completion. Power above 5 W
  resets the interval. An unavailable/stale observation or more than 360 seconds
  between readings resets the uncompleted low interval, including after restart.
  Missing/invalid/negative
  or timestamp-less power is never zero and cannot confirm either transition.
- MAX_DURATION_REACHED triggers at 360 minutes from activation even without
  power or vehicle readings. Restart and duplicate ON cannot extend it.
- BATTERY_FULL requires SOC at least 100 and a non-future battery timestamp
  fresh under the existing 30-minute policy and at/after manual activation.
  This is independent of vehicle health and status freshness.
- USER_STOP persists `SmartChargeAutoStartBlocked=true`, clears manual intent,
  and requests OFF. OFF failure leaves ERROR without a completion timestamp;
  stop during in-flight runtime work remains STOPPING until reconciliation.

Every manual stop reason (USER_STOP, LOW_POWER, BATTERY_FULL,
MAX_DURATION_REACHED, COMMAND_FAILED) denies automatic ON across restarts.
Manual ON starts only a new manual lifecycle and keeps the automatic block.
Ordinary runtime/planner/reset execution cannot clear it. Only explicit Auto
Mode can grant automatic permission, after stopping manual work, checking a
clear runtime lease and cached plug OFF, and validating fresh trustworthy
vehicle connection evidence plus fresh SOC below 100 under the existing
30-minute policy. Stale vehicle power cannot create an automatic session.

The existing manual JSON adds `activationStopToken` and `autoGrant` (UTC `at`
and matching `stopToken`); no additional Logic variable is required. A grant
belongs to that saved record and is invalidated by a new activation or stop.
Old terminal records without a valid grant remain effectively blocked even
if the Boolean flag was false. ERROR/STOPPING cannot resume ON. Persistence
failures invalidate intent through the stop token, block and saved error record
where writes succeed, then request protective OFF. This is not a multi-variable
transaction: simultaneous loss of every durable write cannot be recovered from
memory after restart. Missing/corrupt safety records fail closed.

`SmartChargeRuntimeLock` is a persisted best-effort execution lease. A valid
busy lease skips duplicate work; an invalid or abandoned lease fails closed.
ON re-reads intent before the command and after acknowledgement; USER_STOP
during in-flight ON causes compensating OFF. `SmartChargeUserStopToken` also
protects concurrent activation against clearing a new stop. Homey Logic has no
atomic compare-and-swap in the current adapter: this is **not** a strict mutex
between independent script instances. Serialize deployed runtime triggers.
After a crash leaves a lease, verify all executions have ended and power is OFF
before an operator resets the lease to `null`; preserve manual timestamps.
The lease's 60-second age check is not a command timeout or cancellation mechanism.

Thresholds run on the next runtime invocation with qualifying samples. They
are not hard real-time cutoffs or proof of continuous power between samples.
The deployed five-minute watchdog can confirm two fresh samples without
resetting evidence on every tick. Individual samples remain at most 60 seconds
old; the maximum observation gap is 360 seconds. LOW_POWER still requires
180 seconds between independent low samples, typically stopping on the next
five-minute tick. Unobserved power recovery between ticks cannot be excluded.
The cadence is unchanged; this is sampled evidence, not continuous monitoring.
Software protections do not replace line, EVSE, plug, or vehicle protections.

Request/success/failure are diagnosed locally; webhook delivery is best effort
and happens after the physical command so it cannot delay OFF. Logging failure
never repeats a successful command. See `TelemetryContract.md` for Events.

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

`SMARTCHARGE - Connection Evidence.js` is the dedicated entry point for a
trustworthy Mercedes charger-connected event. It first writes the current UTC
ISO timestamp to `SmartChargeConnectionEvidenceAt` through the shared Homey
Logic adapter, then calls the same canonical Runtime Controller pipeline. If
the write fails, Runtime Controller is not called. If Runtime Controller fails,
the entry point does not clear the successfully recorded evidence.

The capability names are configurable fallbacks, not claims about the real
Mercedes device. Shadow diagnostics report the capability actually found and
its raw value for vehicle status and preconditioning.

Other providers need compatible capabilities/events/units and timestamp validation;
the current adapter still uses the `mercedes` object/configuration identifiers.
The 30-minute freshness checks gate connection/session creation and explicit Auto
Mode; they are not a blanket promise that every decision for an existing Session
rejects stale SOC. An existing Session remains local authority during provider outage.

The verified Mercedes mapping is `text_charging_status`, `onoff_charging`,
`measure_battery`, `measure_charge_power`, and `onoff_precond`. `Charge break`
is normalized as connected but not actively charging. It can create a Session
only with fresh event evidence or a fresh provider timestamp. A fresh
`onoff_charging=true` or meaningful `measure_charge_power` is strong charging
and connection evidence. `onoff_connector` and `text_connector_status` are
ignored because they are always null on the observed vehicle.

`measure_charge_power` is normalized to watts from capability metadata: `W`
is unchanged and `kW` is multiplied by 1000. A non-zero value with missing or
unsupported units remains visible as raw diagnostics but is not used as
charging or connection evidence. Raw zero remains safely equivalent to `0 W`
even when units metadata is unavailable.

An existing Session is local authority. `Unplugged` combined with charging
power is contradictory provider telemetry and preserves the Session. Provider
unavailability also preserves an existing Session conservatively.

## Disconnect confirmation

`Unplugged`/`Disconnected` with idle power starts a suspected disconnect. Active
mode persists the first observation in `SmartChargeDisconnectObservedAt` and
immediately reconciles the plug to OFF in the same execution. The Session is
preserved before the configured timeout. After `disconnectConfirmationMinutes`,
the disconnect becomes confirmed; active mode emits
`charger_disconnected` and clears the Session through the runtime lifecycle
reset path, but only after the desired OFF state is already observed or the OFF
command is acknowledged. ACK alone does not verify electrical OFF. A failed OFF
command aborts the execution before actuator telemetry,
the terminal event, and Session cleanup, preserving the Session for a safe
retry. Charging power or trustworthy connected evidence cancels the
pending observation. This observation-before-action order prevents the
controller from creating its own zero-power evidence.

For automatic charging, completion from target battery has higher priority than
disconnect, followed by expired Session, confirmed disconnect, suspected
disconnect, planner request, and waiting. Manual charging uses the independent
path described above. Preconditioning is diagnostic and does
not keep the plug on outside a selected charging window. In active mode an
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

## Rollout and deployment boundary

Use the single current [Flow topology](HomeyFlows.md): one five-minute Runtime
Controller watchdog, a trustworthy event -> Connection Evidence, explicit Manual
ON / USER_STOP / Auto Mode, and optional supervised Startup Recovery. No duplicate
price/power/decision timers or direct Actuator cards. Connection Evidence writes
the event before invoking runtime; the runtime may skip busy work, leaving evidence
for a later tick. Recording an external event is distinct from shadow runtime.

Shadow mode is for observation, not a global kill switch: legacy compatibility
scripts and explicit USER_STOP can command the device. Do not run competing legacy
and active lifecycle/Actuator owners. Prepare under disabled writers and independent
physical OFF. Follow [deployment](HomeyDeployment.md) and separately authorized
[operational acceptance](HomeyDeploymentReadiness.md); keep Flows disabled after
code installation. Never reset saved safety state merely because Homey restarted.

After ACK, command and following lifecycle events publish null plugOn/plugPower,
not old or synthetic values. The request message contains the pre-command snapshot;
the ACK message includes physicalStateVerified=false. Event columns are unchanged.
