# Runtime State Controller

The primary control invokes the existing Manual Override On entry with argument
`toggle`. The persisted manual record may contain optional `controlToggle` with
`at` and unique `id`; legacy records remain valid. Accepted presses less than
three seconds apart are ignored, including after a script restart. STOP bypasses
the debounce; an intervening stop token or a replaced reservation cancels the
toggle. ERROR/STOPPING never becomes a new manual activation through this button.
RuntimeLock remains best effort across independent executions. Display-only
`SmartChargeControlStatus` is updated from safety state, not from cached UI intent.

## Active tariff hour continuity

Automatic planning records its selected current tariff slot in the separate
`SmartChargeActiveChargeSlot` Text variable (initialize to literal `null`). The
schema-1 record contains `sessionId`, UTC `slotStart` and `stopToken`. It is
independent of the diagnostic-only Plan Stability anchor.

If the socket remains ON in that same slot and Session, SOC-driven replanning
keeps the slot even when fewer, slightly cheaper future hours would otherwise
replace it. Future slots are retained too: a partly elapsed hour must not count
as a full replacement hour. Cost allocation still uses remaining required minutes.
The record expires at the tariff slot boundary; an old Session or stop token
cannot extend it. Missing/corrupt state falls back to ordinary planning with a
console diagnostic. Shadow execution does not write this record.

This changes only the proposed tariff plan. Manual OFF, completion, departure,
disconnect, grant checks, stale telemetry and climate idle protection remain
owned by Runtime and can still turn power OFF. Provision the variable during
maintenance before deploying this correction. Existing records need no manual
clearing at Session completion because their Session identity and slot expiry
prevent reuse.

Baseline: SmartCharge 0.6.4+build.17. This page owns runtime semantics, not Flow
installation or deployment status. Use [Homey Flows](HomeyFlows.md) for the current
five-minute topology and [Homey deployment](HomeyDeployment.md) for status.

## AUTO / MANUAL / BLOCKED

These are conceptual permission/ownership labels, not a new Logic enum. MANUAL
means valid independent Manual Charging intent. BLOCKED means Automatic Charging
is denied by block/terminal/token/grant checks; it can coexist with Manual Charging.
AUTO means permission is available, not plug ON: Session/evidence, battery, planner
and Actuator gates still apply. `SmartChargeRuntimeMode=active|shadow` is separate.

The next local departure correction selects the earliest configured departure
strictly after the connection timestamp in Europe/Berlin: weekdays 07:30 and
weekends 13:00 by default. A weekday connection at 03:00 targets that morning;
an evening connection targets the following day. At the departure time itself,
the next day's schedule applies. Weekday/weekend selection uses the departure
date. An active Session keeps its original connection anchor, so its deadline
does not roll forward when runtime executes later. This correction is local and
has not been deployed.

When upgrading a Session originally created before its morning departure under
the old next-day rule, the same saved connection timestamp now resolves to that
morning. Its deadline can therefore become earlier; review any such active
Session during deployment rather than expecting the old next-day deadline.

## Power for preconditioning (0.6.9+build.24)

When AUTO is authorized, a fresh Boolean preconditioning signal and fresh,
trustworthy vehicle connection evidence request socket power independently of
the tariff plan, SOC and automatic Session. This supports a full battery or
temporarily missing SOC. SmartCharge does not send climate commands to Mercedes:
the operator starts and stops preconditioning in the Mercedes application.

Read `onoff_precond`, `climate_active` and the existing compatibility aliases.
Choose the newest valid, non-future Boolean observation; OFF wins on timestamp
ties. Climate uses its own capability timestamp under the existing 30-minute
freshness policy. The provider heartbeat never refreshes retained climate intent.
Unavailable/warning devices, stale or missing climate observations, and missing
connection evidence cannot authorize climate power. A fresh connector disconnect
retains priority. The installed Mercedes integration reports both climate
capabilities; its [provider mapping](https://github.com/andersdissing/Mercedes-Benz-homey-app/blob/main/drivers/mercedes-vehicle/device.js)
also handles manual starts from Mercedes me.

The runtime returns PRECONDITIONING without calling Tibber, creating a charging
Session or modifying the saved tariff strategy. Completion/expiry of an existing
charging Session is deferred until climate power ends. Then ordinary runtime
reconciliation resumes: keep power if the charging plan requires it, otherwise
request OFF. A full battery cannot create a new automatic charging Session.

USER_STOP and the existing AUTO grant retain priority, including after restart.
Explicit AUTO may grant permission while the socket is OFF, including at 100%,
with unknown/stale SOC, or without a connected vehicle. This arms future automatic
decisions; it does not authorize physical ON without demand and fresh evidence.
Normal charging still requires fresh SOC below target and trustworthy connection;
preconditioning retains its independent fresh climate and connection checks.
MANUAL charging keeps its own lifecycle.
The sole actuator function checks climate/connection again immediately before
ON and after its acknowledgement; loss of evidence or intent during ON causes
compensating OFF. Failed commands retain the existing error/compensation policy.
Shadow execution changes no Logic, devices or timers.

This implementation uses the existing five-minute watchdog. Detection of start
and stop can take up to one watchdog interval after Homey receives the vehicle
update, plus any provider delay; it does not promise immediate switching.
Installation reuses the existing script IDs and five-minute watchdog without a
new periodic trigger or app update. Physical acceptance of both vehicle signals
remains pending.

Cabin power additionally uses the durable `SmartChargePreconditioningState`
record (schema 1: IDLE, RUNNING, INHIBITED). The startup deadline is saved before
ON. No observed load above 5 W within 180 seconds inhibits power on the next
watchdog. After load starts, independent fresh samples at/below 5 W spanning
180 seconds inhibit power. Samples use the existing 60-second freshness and
360-second observation-gap rules; a missing/invalid sample is never zero.
After consumption is observed, losing fresh samples for more than 360 seconds
also inhibits power. These are watchdog decisions, not background timers.

INHIBITED means automatic ON is denied; it is not a claim that a failed OFF
command succeeded. Persist inhibition before OFF; a failed OFF is retried by the
next watchdog. Failed state writes block AUTO and request OFF. Old climate true,
heartbeat refreshes and a falling SOC alone cannot remove inhibition. A fresh
positive connection observation after inhibition, a new observed OFF/ON climate
cycle (except after a known disconnect), or explicit AUTO can authorize a new
bounded attempt. Session completion, expiry and confirmed-disconnect cleanup
still run while power is inhibited. MANUAL remains independent.

Deployment migration: while in maintenance, create the string Logic variable
`SmartChargePreconditioningState` with literal text `null` if it is absent.
Preserve an existing record; do not reset inhibition as part of an update.
Missing or corrupt state fails closed. The deployment client preserves Logic
and does not create this variable automatically.

## Expected power cuts (0.6.10+build.28)

The operator reports that this Mercedes can retain charging Failure after our
ordinary socket OFF. Schema-1 climate state optionally retains `powerCut`:
`at`, `expiresAt`, `sessionId`, `stopToken`, `usedAt`, `lease`.
Record only a successful ordinary automatic OFF with trustworthy connection and
fresh/recent consumption or freshly completed full SOC. Failure before OFF,
USER_STOP, failed commands and idle inhibition do not authorize recovery.

An unexpired matching record can authorize one otherwise valid tariff/climate ON
if Failure appeared after the cut and the known Mercedes integration remains
available, warning-free and freshly seen, with no fresh connector disconnect.
It expires at the Session departure, or after the existing 30-minute freshness
interval without a Session. Reserve before ON; recheck safety, current vehicle
evidence and lease after the write. A post-ON climate check may use the same
in-flight reservation, but a later script cannot spend it again. The normal
vehicle evidence must recover by the first watchdog after the 180-second grace;
otherwise inhibit OFF. Tariff recovery uses the same load/startup protection.
Unknown Failure remains excluded from general connection evidence, including
when a retained charging flag is true. Existing schema-1 records without the
optional field remain valid. Physical recovery acceptance is pending.

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

Automatic SOC and connection-status checks also accept a fresh `lastSeenAt`
heartbeat from the installed `com.mercedes.mbapi:mercedes-vehicle` integration
when the device is available, has no warning, and the capability has a nonempty
value and a valid, non-future change timestamp. This prevents unchanged parked-car
values being rejected solely because they last changed hours ago. Unknown
providers, missing/future/stale heartbeats and unavailable/warning devices do not
receive this fallback. Manual SOC completion and plug power sampling continue to
use their per-capability timestamps.

Diagnostics distinguish `device_last_seen` from `capability_timestamp`, preserving
both the original change timestamp and the device observation timestamp. A device
heartbeat establishes integration responsiveness, not an independent measurement
of every retained attribute. A partial update may leave other values cached; this
depends on the Mercedes integration's data delivery. See the
[Homey device heartbeat contract](https://apps-sdk-v3.developer.homey.app/Device.html#setLastSeenAt).

The next local disconnect correction gives a fresh Boolean `onoff_connector=false`
priority over retained charging status and other consumption evidence in AUTO.
It blocks Session creation/new ON, requests OFF for an active Session, and uses
the existing 15-minute disconnect confirmation. A missing, non-Boolean,
timestamp-less, future or stale connector reading remains unknown; the device
heartbeat does not refresh that reading. Stale/unknown vehicle charging flags or
charging power no longer cancel disconnect confirmation. Existing measured plug
consumption still preserves the legacy fallback when no explicit fresh connector
disconnect is available. This correction is local and has not been deployed.
Fresh vehicle power above the existing 50 W idle threshold still prevents
status-based disconnect confirmation even below the 500 W charging threshold.

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
The 30-minute freshness checks gate connection/session creation, explicit Auto
Mode, and every automatic physical ON (including compatibility callers). The
actuator re-reads the Session, SOC, provider connection evidence, durable block,
manual ownership and runtime lease before ON. Existing charging and Session
history remain local authority during provider outage; this does not permit a
new ON using stale SOC. The global TTL is unchanged.

When AUTO is blocked or no Session can be established, the runtime calculates
a preliminary tariff plan from last-known SOC and the configured departure
policy anchored to the current time. This planning horizon is an assumption, not
a connection timestamp. It does not create a Session or connection evidence, clear
the block, erase manual history, grant AUTO, or write session events to Sheets.
Active-mode runs publish the preliminary start/end, target departure, duration and
reason in existing Logic fields with ShouldCharge=false. Shadow runs only return
the plan. The returned preliminaryPlan includes the actual SOC timestamp, age,
FRESH/STALE/UNKNOWN freshness and limited confidence. Missing SOC, configuration
or tariffs produces an explicit unavailable reason. A stale SOC plan for an
existing Session is also labelled preliminary in the returned result; the actuator
still rejects new ON. Safety OFF and terminal cleanup precede optional preliminary
tariff requests. Publication re-reads Session/AUTO state before each Logic write
and stops if the context changed; an authorized active Session's plan is preserved.

Preliminary Tibber requests use HomeyScript's node-fetch v2 native timeout: at most
10 seconds for headers and 10 seconds for body consumption. Both phases share the
remaining 60-second RuntimeLock lease budget, reserving 5 seconds for publication
and lock release. An exhausted budget skips the request. Redirects and compression
are disabled for these bounded requests; a dedicated HTTPS agent closes their
sockets on completion or failure, and a timed-out body stream is destroyed. No
detached planner promise can publish a late result. Timeout returns
preliminaryPlan.available=false with a specific reason; Runtime's existing finally
releases the owned lock. Canonical requests and Manual/actuator behavior are unchanged.

Without fresh SOC and trustworthy connection evidence, desiredPlugState is false.
An already powered Session with measured charging power may continue when the
tariff decision still requests charging and no completion, expiry, disconnect or
durable stop applies. This is reported as continuingExistingCharge=true with
action=none and the actual plug state; it never issues a new ON. Preliminary tariff
metadata remains shouldChargeNow=false and does not overwrite the confirmed plan
merely to annotate its freshness.

A transient null SOC in an active Session retains the previous tariff decision
for already measured charging only. The Session deadline and all safety stops
still apply. Null SOC cannot authorize a new ON, even with a fresh capability
timestamp; fresh SOC restores normal planning for the same Session.

A terminal manual record, including BATTERY_FULL, describes that activation only.
Fresh provider data alone never clears its durable block. Explicitly select Auto
Mode to arm waiting, even before a trip or reconnection and at full SOC. The
watchdog can establish a new automatic Session when trustworthy connection and
below-target SOC become available; new ON still requires fresh SOC. USER_STOP
likewise requires an explicit operator decision. All automatic ON paths require
a valid AUTO grant matching the current stop token, even for IDLE manual history.

If Mercedes does not supply fresh samples while parked, AUTO can remain armed
with the socket OFF. A real provider update (for example through the vehicle or
its app, if the integration forwards it) must supply fresh SOC and connection
evidence before a new charging ON. Refresh behavior is not guaranteed by this bundle.
If fresh connection evidence remains unavailable, use explicit Manual Charging
with its existing power observations and deadline, or wait for telemetry. Never
rewrite Mercedes timestamps or trigger a synthetic connection event to bypass
this boundary.

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

## Unreleased Actuator correction

After ON ACK and a newly observed stop, compensating OFF ignores the pre-command
cached OFF value. Unknown ON outcomes also request a compensating OFF while
preserving the original error and Durable Auto Block. An OFF failure remains an
error and never produces a successful OFF event.

ACK events are queued in command order and emitted after compensation, so an ON
ACK is not logged after its compensating OFF ACK. Webhook waits and failures do
not delay or repeat compensation. Requested, acknowledged and physically verified
states remain distinct; ACK does not prove physical power. This does not cancel
other executions or provide a strict mutex. These changes require a new release
identity; they are not installed in 0.6.4+build.17.
