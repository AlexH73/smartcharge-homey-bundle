# Homey Flow Setup

## Migration to independent manual charging

This section supersedes legacy power-control instructions below when runtime
mode is active. Do not change deployed Flows until the local change is reviewed.

1. Initialize the safety Logic variables described in `Installation.md`, with
   manual OFF and the plug OFF. Never seed an active manual flag without its
   real activation record.
2. The Manual ON button invokes `SMARTCHARGE - Manual Override On` only. Remove
   separate ON cards and writes of `SmartChargeShouldCharge`/manual flags.
   This grants manual charging only; it does not clear the automatic block.
3. The Stop button invokes `SMARTCHARGE - Manual Override Off` only. This is
   USER_STOP. All manual terminal reasons block automatic starts across restarts.
4. Add a separate Auto Mode button invoking `SMARTCHARGE - Auto Mode`. It clears
   the block only after verified OFF, completed manual work, a clear lease,
   fresh Mercedes connection evidence and fresh SOC below 100. Re-running
   the planner is not an Auto Mode action.
5. Remove legacy actuator/lifecycle branches and external plug ON/OFF cards;
   leave event/scheduled trigger cards that invoke runtime. Active-mode legacy
   State Sync and Run Decision now delegate to the same runtime owner.
6. Keep trustworthy connection events pointed at Connection Evidence. Do not
   generate fresh evidence from a timer or a retained status value.
7. Invoke runtime on actual plug power updates, on Homey startup, and with a
   frequent watchdog. Prefer a supported 30-second schedule; sample gaps above
   60 seconds invalidate LOW_POWER evidence. Consolidate ordinary triggers;
   separate activations can still overlap and the Logic lease is not a mutex.
   User Stop must remain callable promptly, independently of vehicle events.
8. Disable duplicate legacy Log On/Log Off branches for runtime-owned commands;
   runtime logs successful transitions itself, including without auto sessions.

A saved manual activation resumes its original deadline and confirmations.
Corrupt/missing activation state or abandoned runtime ownership prevents
automatic re-energization. See `RuntimeController.md` for recovery and the
limitations of cross-instance concurrency. No real Flows are migrated by builds.

Use [the deployment checklist](HomeyDeploymentReadiness.ru.md) to inventory
actual Flows and reduce duplicate triggers before enabling the active runtime.

SmartCharge expects Homey Flows to provide lifecycle triggers. The generated
HomeyScripts contain the decision and logging logic; the flows decide when each
script runs.

Use your own device names and Homey condition cards. The examples below use
placeholder names such as `YOUR_CHARGER_DEVICE`, `YOUR_VEHICLE_DEVICE`, and
`YOUR_LADESTATUS_VARIABLE`.

## Flow: Start Session

Purpose: create a SmartCharge session when the charging cable is connected.

Trigger:

- Charger or vehicle status changes to connected, plugged in, or charging.
- If you track a Homey Logic status variable, use: `YOUR_LADESTATUS_VARIABLE`
  changed.

Conditions:

- `YOUR_LADESTATUS_VARIABLE` is not `Unplugged`.
- `ChargeConnectedAt` is `null`.
- Vehicle battery is below `100`.

Actions:

- Run HomeyScript `SMARTCHARGE - Start Session`.
- Optional: wait 5 to 30 seconds.
- Run HomeyScript `SMARTCHARGE - Run Decision`.

## Flow: Run Decision

Purpose: recalculate the charging plan and turn the plug on when the selected
plan or safety fallback requires charging.

Triggers:

- After `Start Session`.
- On a schedule, for example every 15 minutes while connected.
- After a Tibber price update, if you have a separate price update trigger.
- From the watchdog/session recovery flow.

Conditions:

- `YOUR_LADESTATUS_VARIABLE` is not `Unplugged`.
- `ChargeConnectedAt` is not `null`.
- Vehicle battery is below `100`.

Actions:

- Run HomeyScript `SMARTCHARGE - Run Decision`.

The script writes `SmartChargeShouldCharge`, `SmartChargePlannedStart`,
`SmartChargePlannedEnd`, `SmartChargeTargetDeparture`, and
`SmartChargeReason`. It also turns the configured plug on when charging should
start. It does not turn the plug off.

## Flow: State Synchronization

Purpose: keep the physical plug state aligned with the latest SmartCharge
decision.

Trigger:

- Every minute.

Conditions:

- None required for the simple scheduled flow.

Actions:

- Run HomeyScript `SMARTCHARGE - State Sync`.

The script does not recalculate the plan or call Tibber. It only synchronizes
the plug with `SmartChargeShouldCharge`. Lifecycle logging remains the
responsibility of the existing `Log On` and `Log Off` flows triggered by the
plug state change.

The script internally checks `SmartChargeShouldCharge`, plug state, active
session state, and vehicle battery before switching the plug on. The off path is
intentionally independent from active session and vehicle battery telemetry, so
it can turn the plug off even after a missed reset or vehicle integration
outage.

If you build this as an Advanced Flow, split the on and off paths into separate
branches:

- Off branch: `SmartChargeShouldCharge = false` and plug is on, then run
  `SMARTCHARGE - State Sync`. Do not require `ChargeConnectedAt` or battery
  telemetry on this branch.
- On branch: `SmartChargeShouldCharge = true`, plug is off,
  `ChargeConnectedAt` is not `null`, `YOUR_LADESTATUS_VARIABLE` is not
  `Unplugged`, and vehicle battery is below `100`, then run
  `SMARTCHARGE - State Sync`.

Do not combine `SmartChargeShouldCharge = true` and
`SmartChargeShouldCharge = false` as conditions in one regular Homey Flow.

## Flow: Log On

Purpose: write a lifecycle event when SmartCharge charging starts.

Triggers:

- Charging plug turns on.
- Or plug power rises above your charging threshold.

Conditions:

- `ChargeConnectedAt` is not `null`.
- `SmartChargeShouldCharge` is `true`, if you want to log only SmartCharge
  starts.

Actions:

- Run HomeyScript `SMARTCHARGE - Log On`.

## Flow: Log Off

Purpose: write a lifecycle event when SmartCharge charging stops.

Triggers:

- Charging plug turns off.
- Or plug power stays below your charging threshold for a short debounce period.

Conditions:

- `ChargeConnectedAt` is not `null`.

Actions:

- Run HomeyScript `SMARTCHARGE - Log Off`.
- If the battery is full or the charger is disconnected, run
  `SMARTCHARGE - Reset Session`.

## Flow: Reset Session

Purpose: clear the active SmartCharge session after completion, disconnect, or
manual reset.

Triggers:

- Vehicle battery reaches `100`.
- Charger or cable status changes to `Unplugged`.
- Manual Homey Flow button or maintenance flow.

Conditions:

- `ChargeConnectedAt` is not `null`.

Actions:

- Optional: turn `YOUR_CHARGER_DEVICE` off.
- Run HomeyScript `SMARTCHARGE - Reset Session`.

The reset script logs `session_reset`, clears `ChargeConnectedAt`, clears the
planned window variables, sets `SmartChargeShouldCharge` to `false`, and writes
the reset reason.

## Flow: Watchdog / Session Recovery

Purpose: recover from missed Homey triggers. This is useful after Homey
restarts, device reconnects, or a vehicle integration misses the original cable
connection event.

Trigger:

- Every 5 to 15 minutes.
- Or after Homey starts.

Conditions:

- `YOUR_LADESTATUS_VARIABLE` is not `Unplugged`.
- `ChargeConnectedAt` is `null`.
- Vehicle battery is below `100`.

Actions:

- Run HomeyScript `SMARTCHARGE - Start Session`.
- Wait 5 to 30 seconds.
- Run HomeyScript `SMARTCHARGE - Run Decision`.

This watchdog must not start a session when the vehicle is unplugged. Keep the
`Ladestatus is not Unplugged` condition first so the recovery flow only creates
sessions for a real connected charging cable.

## Suggested Debounce Rules

- Do not run `Start Session` repeatedly when `ChargeConnectedAt` already has a
  timestamp.
- Debounce low-power `Log Off` triggers so short power dips do not end a
  charging session.
- Keep `Reset Session` separate from `Log Off` so a temporary stop can be
  logged without clearing the session unless the car is full or disconnected.
