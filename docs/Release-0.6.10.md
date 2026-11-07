# SmartCharge 0.6.10 expected power-cut recovery

Installed **0.6.10+build.28** on 2026-11-06 from develop `a743661` plus the uncommitted
preconditioning work and this correction. The previous installed set was 0.6.9+build.24.
No tag or GitHub Release has been created.

Artifact: `dist/release-0.6.10-build.28`. Manifest SHA-256:
`3d22da3058d43e17076c455efad4aacd102fa2180fb75e930146f232771fd187`.
Earlier local 0.6.10 candidates are superseded and must not be installed.

## Correction

The operator confirmed that this vehicle reports charging `Failure` after our
socket OFF and can recover when supply returns. Treating every retained Failure
as missing connection evidence deadlocked the next tariff or climate ON.

After a successful ordinary automatic OFF with trustworthy connection evidence,
record its time, Session context, stop token and expiry in the existing climate
state's optional `powerCut` field. Supporting load must be fresh/recently observed,
or the active Session must have freshly reached full SOC. USER_STOP, failed OFF,
idle-load inhibition and a pre-existing Failure do not create this permission.

An otherwise authorized tariff/climate request may make one bounded attempt when
Failure was observed after that recorded cut. Require the known available,
warning-free Mercedes integration and fresh heartbeat, unchanged stop/Session
context, no fresh connector disconnect, and an unexpired record. Expiry is the
saved Session departure, or the existing 30-minute freshness interval if there
was no charging Session. Failure is never added to generally connected statuses;
retained charging=true cannot independently bypass an unknown Failure.

Reserve the attempt durably before ON and re-read current permission/vehicle/lease
after reservation. The existing load/startup guard also tracks tariff recovery.
If normal vehicle connection/charging evidence has not returned after the
180-second startup grace, inhibit power on the next watchdog even if the plug
reports consumption. A restart cannot reuse a spent attempt. Once native evidence
recovers, normal planning and idle protection apply. Shadow does not spend the
permission. Preserve OFF ACK ordering if saving cut evidence fails.

## Migration and acceptance

The optional field is backward compatible with schema-1 climate records; no new
Logic variable is required over 0.6.9. Preserve existing activation/inhibition.
The already observed OFF on 0.6.9 did not record this field. During investigation,
native Charge break returned without switching the socket. No historical cut or
connection timestamp is seeded: preserve the existing record and let the new
runtime record future eligible OFF commands. A standalone Failure cannot create
recovery permission.

Use [controlled deployment](HomeyDeployment.md), fresh operator confirmations,
private backup, preflight and twelve-script hash readback. Keep 0.6.9+build.24 for
rollback. Real recovery acceptance remains pending.

`npm run verify` passed: lint, formatting, regression suites, 97 simulator
scenarios, bundle/source checks and release/deployment mock suites. Regressions
cover climate and tariff recovery, full SOC/zero load at completion, recent heater
load reaching zero before OFF, unknown/pre-existing Failure, stale heartbeat,
connector disconnect, Session/expiry mismatch, reservation races with USER_STOP,
spent-attempt inhibition, native charging confirmation, shadow isolation and OFF
ACK ordering after state-write failure. Read-only discovery verified the twelve
installed 0.6.9 hashes/IDs/names/modes and saved a private backup; dry-run identified
twelve replacements and five control Flows requiring maintenance. Homey was not
changed during preparation; its native charging status has recovered.

After fresh operator confirmation, five control Flows were disabled and AUTO
blocked with its grant revoked. Preflight and saved-state validation passed.
Installation returned VERIFIED, followed by independent readback of all twelve
hashes, IDs, names and API modes. Installation preserved all SmartCharge Logic,
Flow topology, active Session, plan and the existing IDLE climate record. No
historical cut was seeded and no Logic variable was created/reset. The socket
remained OFF at zero measured power. After separate operator authorization, all
five control Flows were restored and the installed AUTO MODE completed
successfully. AUTO is unblocked with a valid grant; the same Session and plan
remain in WAITING, the climate state is IDLE, and the runtime lock is released.
Native Mercedes status is Charge break with fresh integration evidence. The
socket remains OFF at zero measured power outside the plan. No recovery attempt
was requested or historical cut seeded. Private snapshots and write journals are
retained outside Git; real expected-cut recovery acceptance remains pending.
