# SmartCharge 0.6.13 MANUAL/AUTO control

Prepared **0.6.13+build.31** on 2026-11-08; not installed yet.
Installed baseline: 0.6.12+build.30.

Artifact: `dist/release-0.6.13-build.31`. Manifest SHA-256:
`c562d6ac24bbce90bd4ce2f75ddacfdd6dc11651f5009a286a9cd98e0bdbd33a`.

Explicit AUTO may arm waiting at full/stale/missing SOC or without a connected
vehicle. Runtime still requires demand and fresh connection/SOC for charging ON;
climate power retains its own fresh connection/intent checks. AUTO preparation,
manual error recovery, stop tokens and runtime lease guards remain in force.
Date AUTO permission after manual termination, including when hardware OFF takes
time. No second AUTO press is needed when fresh demand later arrives.

The existing Manual Override On script accepts argument `toggle`. With no argument
it remains idempotent Manual ON. Toggle starts manual power from AUTO/STOP, or
returns active MANUAL to AUTO through the existing safe OFF preparation. A new
eligible plan or climate demand may then request ON. STOP is independent.
Optional `controlToggle` in schema-1 manual state records the accepted timestamp
and reservation ID. A three-second debounce survives restarts; busy runtime,
ERROR/STOPPING and changed stop token cannot create a new manual ON. Existing
cross-invocation locks remain best effort, not an atomic executor.

Provision optional Text Logic `SmartChargeControlStatus=STOP` during maintenance.
Runtime publishes AUTO/MANUAL/STOP/ERROR for display only. It is never control
input; read/write failure cannot change actuator behavior. The primary button's
name is static; no custom device or dynamic dashboard skin is introduced.

After verified twelve-script installation, migrate the existing Manual ON Flow
to `runWithArg` with argument `toggle` and the same script ID. Rename the primary
Flow to MANUAL/AUTO and preserve the STOP Flow. Export the former AUTO Flow and
verify that no callers reference it before removing it. Restore only watchdog,
connection evidence, toggle and STOP after separate authorization. Keep scripts
and old exports for rollback; no additional script or periodic caller is created.
Apps Script is unchanged. Follow [controlled deployment](HomeyDeployment.md) with
fresh physical/operator confirmations; do not exercise hardware manual ON during
installation. Supervised AUTO arming at 100% should leave the socket OFF.

Local coverage includes manual toggle/debounce/restart, legacy calls, STOP races,
status failure and shadow isolation, delayed manual OFF to AUTO, waiting with
full/stale/unknown SOC and disconnected vehicle, fresh later Session creation,
and a later climate request at full SOC without a second AUTO press.
