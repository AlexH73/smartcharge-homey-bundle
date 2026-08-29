# Plan Stability Persistent Live Shadow

Phase 3B can evaluate Plan Stability across independent HomeyScript executions.
It is diagnostic only: canonical `shouldChargeNow`, Runtime actuator decisions,
Manual Override, lifecycle handling, telemetry, and the Events schema remain
authoritative and unchanged.

## Enablement

The experiment is disabled by default with
`CONFIG.planStabilityLiveShadowEnabled = false`. Before an experimental build is
enabled, manually create the Homey Logic Text variable
`SmartChargeAcceptedStrategy` with value `null`. The adapter never creates
Logic variables automatically. A missing or unreadable variable fails open:
charging decisions continue and the persistence error is reported only in
shadow diagnostics.

The experimental policy is declared separately in
`CONFIG.planStabilityShadowExperimentPolicy`:

- waiting: EUR 0.05 and 5%;
- actively charging: EUR 0.50 and 20%;
- threshold mode: `ALL`.

These are shadow experiment values, not active production thresholds.

## Persistent contract

The variable contains either the literal `null` or JSON for schema version 1:

```json
{
  "schemaVersion": 1,
  "sessionId": "2026-07-07 18:00:00",
  "plannerVersion": "planner-v2",
  "acceptedAt": "2026-07-07T16:05:00.000Z",
  "revision": 1,
  "targetDeparture": "2026-07-08T05:30:00.000Z",
  "selectedSlotStarts": ["2026-07-07T21:00:00.000Z"]
}
```

Only stable strategy identity is persisted. SOC, remaining charge minutes,
slot counts, prices, costs, `shouldChargeNow`, and projected windows are always
recomputed from fresh inputs and are never stored in this variable.

`INITIAL_ACCEPT` and `REPLACE` write a valid anchor. `CONTINUE`, `BYPASS`, and
non-evaluable outcomes preserve it. Identical serialized state is not written
again. Corrupt JSON, invalid schemas, timestamp errors, and session mismatch
are treated as unavailable state, never as a production decision failure.

## Lifecycle and restart behavior

An active session restores its matching anchor after a script restart. Elapsed
slots disappear during projection, updated SOC changes the fresh remaining
allocation, and separated charging windows retain their gaps. A suspected
disconnect preserves the anchor so a reconnect before confirmation continues
the same session.

The anchor is cleared by Runtime session cleanup on confirmed disconnect,
charge completion, and expired-session cleanup, only after the required OFF
transition and terminal lifecycle work have succeeded. A failed OFF command
therefore preserves both Session state and the anchor for retry. Canonical
terminal/no-session decisions only return shadow `BYPASS` diagnostics and never
perform persistent lifecycle cleanup. Explicit manual reset owns its cleanup
boundary and may also clear the anchor. A later session begins with revision 1.
Read, evaluation, write, or cleanup failures are isolated from the Runtime
actuator path.
