# Plan Stability Simulator Shadow

Phase 3A invokes the pure Plan Stability evaluation immediately after the
canonical planner and existing safety decision have produced a fresh candidate.
The existing `shouldChargeNow`, reason, planner output, telemetry payload, and
actuator path remain authoritative. `shadowEffectiveShouldCharge` is diagnostic
only.

The canonical hook is optional. Normal Homey execution supplies no shadow
input, so the existing result contract and behavior are unchanged. Phase 3A
does not add a Homey Logic variable or modify the Events schema.

## Simulator state

Each simulator scenario owns an in-memory accepted anchor. `INITIAL_ACCEPT`
stores revision 1, `CONTINUE` preserves it, and `REPLACE` stores the candidate
with an incremented revision. `BYPASS` and `NO_DECISION` do not overwrite it.
The anchor is cleared when the Session ends or its identity changes. A reconnect
within the same Session preserves the anchor and still projects fresh SOC.

There is deliberately no restart persistence. A new simulator runtime starts
without an anchor and therefore returns `INITIAL_ACCEPT`. Real restart
continuity remains Phase 3B scope.

## Characterization policy

`SIMULATOR_STABILITY_POLICY` contains deterministic test values:

- waiting: EUR 0.05 and 5%;
- charging: EUR 0.50 and 20%;
- threshold mode: `ALL`.

**These values are simulator characterization values, not production
settings.** They are defined only under `simulator/runtime` and are never
exported as production defaults.

Runtime, lifecycle, Manual Override, disconnect, and latest-safe-start code
continue to own their existing decisions. Simulator scenarios inject already
derived shadow context flags; the stability layer does not reproduce those
calculations.
