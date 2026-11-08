# SmartCharge 0.6.12 active tariff slot continuity

Prepared **0.6.12+build.30** on 2026-11-08. Installation pending; installed
baseline is 0.6.11+build.29. Apps Script is unchanged by this release.

Artifact: `dist/release-0.6.12-build.30`. Manifest SHA-256:
`0cb4d8bb9f9b268c4cadcab374cef0d6527ab5ed876ae5e1fbda3b7aba9c1a01`.

The 04:10 interruption occurred when the remaining estimate fell from 250 to
240 minutes. Selecting four future hours removed the active hour and caused OFF.
The corrected planner keeps a selected, powered current slot until its boundary,
while future windows remain free to replan. It does not replace a full future
hour with a partially elapsed hour. Actual cost allocation uses required minutes.

Before installation, provision the Text Logic variable
`SmartChargeActiveChargeSlot` with literal `null`, during verified maintenance.
Preserve an existing valid record. It is production state independent of the
diagnostic stability anchor; it is scoped to Session, stop token and current
tariff slot. Missing/corrupt state and failed writes fall back to ordinary planning.
No existing Session or historic slot is seeded during migration.

The hold never grants a new ON to an OFF socket. Manual OFF, full SOC, expiry,
disconnect, telemetry and grant guards retain priority. A full tariff gap can
still stop charging at the slot boundary. Shadow execution cannot write the
record or issue commands. Follow [controlled deployment](HomeyDeployment.md),
with fresh operator confirmation, backup, twelve-script readback and separately
authorized controls/AUTO restoration.

Review reproduced ON at 04:05 and OFF at 04:10 without the correction; the new
scenario retains ON at 04:10 and preserves gap and completion OFF transitions.
Regression coverage includes mismatched/expired/corrupt records, stop tokens,
record write failure, independently OFF sockets, manual OFF followed by watchdog,
departure expiry, remaining-minute allocation and shadow isolation.
