# Homey migration and operational acceptance

Baseline: **0.6.4+build.17**, package version **0.6.4**. This consolidates the
2026-10-11 pre-deployment research and migration checklist. The historical readiness
decision was locally validated, not unattended-ready. Subsequently all twelve
bundles were installed and read back in one controlled Homey installation; no
charging acceptance was performed. Private diagnostic evidence is retained locally.

For an already correct 0.6.3 installation use the smaller
[0.6.4 update](Release-0.6.4.md). No new variables, Apps Script or Flow schema are
required for that update. The checklist below preserves the original migration
requirements from the older manual implementation, not instructions to reset an
existing 0.6.3/0.6.4 installation. API maintenance/write procedures have one owner:
[Homey deployment](HomeyDeployment.md).

## Reviewed behavior and boundaries

| Area | Implemented behavior | Practical limit |
| --- | --- | --- |
| Terminal lifecycle | USER_STOP, LOW_POWER, BATTERY_FULL, MAX_DURATION_REACHED and COMMAND_FAILED deny Automatic Charging; automatic Session remains independent. | Failed OFF leaves ERROR without false completion. |
| Durable Auto Block | Boolean block, terminal record, stop token and grant validation deny automatic ON. | Logic writes are not transactional; simultaneous failure of all protective persistence cannot establish durable denial after restart. |
| Manual ON | Saves a new activation while preserving block=true; duplicate ON does not extend deadline. | ERROR/STOPPING use recovery, not a new activation. |
| Auto Mode | Explicit grant bound to current stop token; inactive manual lifecycle, clear lease, cached `onoff=false`, fresh connection evidence and fresh SOC 0..<100. | Grant and device request are not atomic with concurrent Stop; cached OFF is not physical verification. |
| Vehicle | Non-future provider timestamps; 30-minute freshness for automatic permission/evidence. | Retained status or restored subscription cannot be re-stamped as a new connection. |
| Plug power | Two independent fresh samples >500 W >=30 seconds apart confirm start; <=5 W samples spanning >=180 seconds afterwards complete Manual Charging. | Samples <=60 seconds old, gaps <=360 seconds; repeated timestamp is not new evidence. Five-minute sampling cannot prove continuity. |
| Missing timestamp | No start/LOW_POWER confirmation, no invented 0 W. | USER_STOP and the original 360-minute deadline still require invocation. |
| Actuator ownership | Production entrypoints route commands through one shared helper/gate. | A helper in independent VMs is not one serialized executor. |
| Legacy compatibility | Active Run Decision/State Sync delegate to Runtime Controller; compatibility ON respects the gate. | `shadow` is not a global prohibition: legacy compatibility entrypoints and explicit USER_STOP can still command. |
| Restart | Missing/corrupt safety and abandoned/future leases fail closed; old terminal records require a valid explicit grant. | Logic values cannot reconstruct the physical outcome of an already sent command. |
| Logging | Protective OFF is not held behind webhook delivery; ACK telemetry does not fabricate post-command state. | Delivery is best effort; logging can lengthen an invocation after the command. |

The local terminal matrix uses an existing automatic Session with a genuinely
positive planner decision and asserts no new ON for all five manual terminal
reasons. Local coverage includes partial persistence, ERROR/STOPPING, old records,
duplicate activation/runtime, restart, Auto Mode freshness and active/compatibility/
shadow entrypoints. Source-based tests and generated-bundle syntax/full-byte checks
do not prove installed-driver behavior.

## Initial migration preparation

- [ ] Obtain separate authorization for live changes; record Homey model/firmware,
  HomeyScript and plug/vehicle App versions, timezone and permissions privately.
- [ ] Remove load, independently verify physical OFF and ensure emergency physical
  power removal is available when a software OFF fails.
- [ ] Export exact old code with Script IDs, names, compatibility modes, timestamps,
  hashes and Script ID -> Flow card references to private storage.
- [ ] Export normal and Homey Advanced Flows with cards/arguments/connections,
  enabled state and folders; preserve screenshots. Official
  [ManagerFlow API](https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerFlow.html)
  provides reads; a snapshot does not promise universal one-click JSON import.
- [ ] Save private Logic names/types/values, capability timestamps, manual/automatic
  records and plans. Never commit credentials or snapshots.
- [ ] Save Apps Script source/version/deployment ID/config and a workbook copy.
  Preserve new Events during recovery.
- [ ] If supported by the model, verify a recent
  [Homey backup](https://support.homey.app/hc/en-us/articles/12402204219164-Back-up-and-restore-Homey-Pro).
  Full restore is broader than SmartCharge and may require a model-specific reset.
- [ ] Audit every writer: real Flow IDs/cards, variable writes, inline/delegated
  calls, voice/UI controls, external Apps/API calls and manual scripts.

## Initial Logic migration and Apps Script

The four safety variables (`SmartChargeManualState`, `SmartChargeAutoStartBlocked`,
`SmartChargeRuntimeLock`, `SmartChargeUserStopToken`) are required. Initial values
and the versioned IDLE JSON are defined once in [Installation](Installation.md).
Text `null` is a literal four-character value. Start with ManualMode=false,
ShouldCharge=false, block=true and physical OFF. Do not delete an automatic Session
merely to migrate. Preserve existing running/terminal state and timestamps.

Keep RuntimeMode `active` only after the full set and topology are prepared.
`shadow` cannot replace removal of legacy writers. Never fabricate connection
timestamps or clear a lease while a delayed request remains possible.

For migration from pre-0.6.3 code, first test
[the Apps Script template](../scripts/google-apps-script/SmartChargeLogger.gs) on a
private workbook copy: manual start, completion and disabled-event materialization,
plus automatic compatibility. Existing Events/Sessions columns are not reordered.
After explicit authorization update the existing Apps Script deployment to a new
version, preserve configuration/previous version and verify permissions/URL. If
the URL changes, change the private webhook separately. Do not mix test Events
with production. A correctly migrated 0.6.3 materializer does not need another
update solely for 0.6.4.

Install one verified twelve-bundle set under disabled writers, using the
[release manifest order](Release-0.6.4.md). The historical manual checklist put
Stop/Runtime/Manual ON/Auto Mode first; that was a preparation convenience, not a
mixed-version execution guarantee. The current API client uses manifest order,
existing IDs and code-only PUT. Neither path authorizes runs between replacements.
Check headers, all code hashes, IDs/modes, Flow references, Logic types and exact
device matching before separately enabling controls.

## Entry-point/concurrency audit retained from research

| Entry/writer | Potential commands | Possible overlap |
| --- | --- | --- |
| Runtime Controller | ON/OFF | Watchdog, startup, event, previous slow tick. |
| Connection Evidence | ON/OFF through runtime | Connection event vs watchdog/button. |
| Manual Override On | Manual ON, protective OFF | Repeated button, Stop, timer. |
| Manual Override Off | OFF/recovery | Already sent ON; Stop bypasses busy lease. |
| Auto Mode | Preparatory OFF, automatic ON | Stop/Manual ON, watchdog, grant persistence. |
| Run Decision | Compatibility ON; active runtime ON/OFF | Old price/plan/watchdog caller. |
| State Sync | Compatibility ON/OFF; active runtime | Old minute/ShouldCharge caller. |
| Start/Reset Session, Log On/Off, Stability Debug | No direct device commands | Logic/lifecycle/log writes may still race. |
| Old scripts, direct cards, voice/UI, other Apps | Commands outside gate | Operator inventory required. |

The historical two-independent-scope/shared-mock lease reproducer allowed both
instances past ownership checks and produced **[ON, ON]**. This is reproduced race
evidence, not a passing safety test. Its original private diagnostic report and
result are retained; no strict executor was added in this release.

Read/write/read acquisition, ownership-check -> device-call and lease release are
not atomic. The 60-second lease cannot cancel a slow old command. Do not add another
Logic busy flag and call it a mutex. Use the consolidated
[Flow topology](HomeyFlows.md): one five-minute watchdog, trustworthy event ingress,
optional supervised startup, explicit Manual/Auto controls and prompt USER_STOP.
During initial supervised Manual ON/Auto Mode checks, quiesce ordinary ingress,
wait for known executions and inspect lease/state before resuming the watchdog.
A clear lease alone cannot prove absence of a delayed request.

Advanced Flow Start/Delay/ANY/ALL order one invocation, not a verified global queue.
[Serialization research](HomeyExecutionSerialization.md) preserves comparison of
Flows, a future Homey App-owned queue and an external coordinator. A future queue
requires durable intent, Stop priority, unknown-outcome recovery and all writers
using it. This remains PLANNED.

## Supervised acceptance (separate authorization)

- [ ] No load: verify exactly one plug, real onoff/power units/timestamps and
  emergency OFF. Blocked runtime must not issue ON; retained samples are not new.
- [ ] Manual ON -> STARTING/ON; repeat preserves id/startedAt. Unconfirmed zero
  power does not trigger LOW_POWER.
- [ ] USER_STOP -> OFF, manual=false, block=true, terminal record; repeat Stop and
  blocked runtime/legacy calls: no new ON, automatic Session preserved.
- [ ] Restart after Stop: verify durable denial without startup state resets.
  Remain OFF when recovery is ambiguous.
- [ ] Stale real vehicle data must deny Auto Mode. Do not mutate production SOC
  or timestamps to manufacture a passing result.
- [ ] Test logger/materializer on a workbook copy, measure latency and cadence.
  Local fault-injection coverage does not justify damaging live Logic/API.
- [ ] One operator/vehicle and no other writers: observe two real >500 W samples
  with different timestamps >=30 seconds apart; verify USER_STOP under load.
- [ ] Observe natural LOW_POWER or fresh real SOC100; conditions not observed
  remain unverified. Do not shorten the production six-hour limit just for a test.
- [ ] After termination, several ticks do not issue ON; new Manual ON retains
  the Durable Auto Block. Explicit Auto Mode may immediately request plan-driven ON.
- [ ] Save actual topology, code version, timestamps, command history and physical
  observations privately. Do not infer unattended readiness from mocks.

Stop acceptance on failed OFF, uncontrolled ON, unknown command outcome, missed
cadence, corrupt safety or a competing writer. Quiesce ingress, safely remove load/
power and inspect privately before choosing rollback. No automatic rollback.

## Recovery beyond the script API rollback

The guarded client restores script code only; see [rollback](HomeyDeployment.md).
It never restores/enables Flows, changes Logic/devices or reverts Apps Script.
For a separately authorized broader migration recovery:

1. Stop normal/ON/Auto ingress and external writers; request Stop where available
   and independently verify OFF. Use physical power removal if OFF fails.
2. Preserve state/block/token/lease/logs and resolve pending/unknown outcomes before
   clearing ownership or permitting ON.
3. Restore a coherent old script set and references; if previously changed, restore
   the old Apps Script deployment/config/URL separately. Keep automation disabled.
4. Retain new safety records; do not replay an old Session/ON or delete new variables
   before compatibility review. Any configuration restoration is a manual decision.
5. Keep all Events/manual records. An older materializer may not rebuild new manual
   events correctly. Old releases contain known manual risks; restoring old code
   does not authorize old automation. Safe fallback remains OFF.
6. A full Homey restore requires its official model-specific procedure and separate
   authorization because it affects unrelated devices.

Remaining risks: lease races, late ON after Stop, total persistence failure,
unknown outcomes after restart, unverified physical OFF/driver timing, sampled
watchdog limits, external writers and webhook/Tibber latency. Controlled code
installation closes none of these operational acceptance items by itself.
