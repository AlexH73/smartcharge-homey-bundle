# SmartCharge 0.6.5 — update from 0.6.4+build.17

Prepared version: **0.6.5+build.18**, package version **0.6.5**.
Base develop / merged PR #1 commit: `db614304cfe28ce00522a3b50d4522f8e05eb49d`.
The release changes are uncommitted: this base SHA is not a release source SHA.
Record and independently approve the final commit after authorized commit, before
tagging, publishing or deployment. No tag, publication or live installation is
performed by this preparation.

Artifact: `dist/release-0.6.5-build.18`, containing twelve bundles, `manifest.json`
and `SHA256SUMS`. Manifest SHA-256:
`ded8f2cc60bbc532c66b2169229fb3a4fefcc0fbe0cd01a2ed78f81ebab0a087`.
Intended release identity: `v0.6.5+build.18` (tag not created).
The creator refuses to replace different existing artifact bytes. Preserve this
set and its independently recorded digest; never rebuild or edit it during update.

## Scope and preserved behavior

Merged PR #1 supplies forced compensating OFF after ON, including stale cached OFF;
ON ACK events precede compensating OFF events. Unknown ON outcomes attempt recovery
OFF while preserving the original error. Logger failures do not repeat physical
commands. The release includes the version-independent schema-1 artifact,
approval and deployment metadata contract. No architecture refactoring is added.

LOW_POWER remains <=5 W across >=180 seconds after START_CONFIRMED (>500 W);
observation gap remains 360 seconds, MAX_DURATION 360 minutes, watchdog five
minutes. Durable Auto Block, explicit Auto Mode, USER_STOP, Mercedes freshness,
Session lifecycle, Tibber planner and Google Sheets schema are unchanged.
No Connection Evidence Flow is enabled and its trigger is unchanged.

## Complete replacement set

All twelve bundles change relative to 0.6.4: the version/build metadata and shared
corrected runtime occur in every bundle. Replace code using existing Script IDs;
preserve names, compatibility modes and Flow references. Do not create scripts.

1. `SMARTCHARGE - Connection Evidence.js`
2. `SMARTCHARGE - Runtime Controller.js`
3. `SMARTCHARGE - Run Decision.js`
4. `SMARTCHARGE - Reset Session.js`
5. `SMARTCHARGE - Start Session.js`
6. `SMARTCHARGE - Log On.js`
7. `SMARTCHARGE - Log Off.js`
8. `SMARTCHARGE - State Sync.js`
9. `SMARTCHARGE - Manual Override On.js`
10. `SMARTCHARGE - Manual Override Off.js`
11. `SMARTCHARGE - Stability Debug.js`
12. `SMARTCHARGE - Auto Mode.js`

This is manifest order; writers must remain disabled throughout replacement.
Updating Connection Evidence script code does not authorize enabling its Flow.
A correctly configured 0.6.4 installation needs **no Flow, Logic, Apps Script,
Google Sheets column or App migration**. Preserve existing safety state/timestamps.

## Preflight and maintenance

- Obtain separate deployment authorization and approve the final source SHA,
  release identity and manifest digest. Production provenance requires the trusted
  non-PR CI artifact and published release; neither exists for this candidate yet.
- Verify artifact integrity with the recorded digest and intended identity:
  `node scripts/release-artifact.js verify dist/release-0.6.5-build.18 <digest> v0.6.5+build.18`.
  This local check does not establish GitHub provenance.
- Follow [controlled deployment](HomeyDeployment.md) with the existing twelve
  approved Script IDs, supported HomeyScript version and protected credentials.
- Remove charging load, independently confirm physical OFF and retain emergency
  physical power removal. Disable all runtime/control/writer Flows, drain pending
  runs and stop external/manual writers. Keep Connection Evidence Flow unchanged.
- Save a new private backup of exact script code, IDs/names/modes/hashes, Flow
  configuration/enabled states and Logic state. Keep all snapshots outside Git.
- Require inactive manual state, ManualMode=false, AutoStartBlocked=true, no auto
  grant and empty runtime lock. Do not fabricate timestamps or erase active state
  to pass preflight; safely finish current work first.
- Perform dry-run and GET-only preflight using a fresh maintenance attestation
  (under 15 minutes), approved tag/digest and Script IDs. Reconfirm conditions
  immediately before separately authorized code-only installation.

## Update, readback and rollback

Use `HOMEY_ARTIFACT_DIR` pointing to this exact artifact and typed installation
approval `INSTALL SmartCharge 0.6.5+build.18` with the documented client procedure.
Stop at the first write/readback error; do not retry an unknown PUT outcome.
Verify each script and the entire installed set against manifest SHA-256, version,
IDs, names and compatibility modes. Confirm Flow references and saved Logic are
preserved; leave writers disabled until supervised acceptance.

Rollback is separately authorized, never automatic. Renew maintenance and physical
OFF checks; inspect installed hashes first. Use the checksummed backup/journal from
this installation, the verified 0.6.5 artifact and
`ROLLBACK SmartCharge 0.6.5+build.18` with
`node scripts/homey-deployment.js rollback <private-backup-directory>`.
The client restores backed-up 0.6.4 code only for journaled changes, skips already
restored scripts and refuses unexpected identities/hashes. Verify whole-set backup
hashes afterward. Flow/Logic/device state requires separate operator review;
never replay an old active session or clear Durable Auto Block blindly.

## Supervised acceptance and readiness limits

With an operator present and an independently verified safe load, enable only the
existing approved test path. Exercise Manual ON then USER_STOP; confirm physical
OFF independently, ordered ON/OFF ACK telemetry and Durable Auto Block. Confirm
the next existing watchdog cannot restart charging. Exercise explicit Auto Mode
only as a separate deliberate permission with valid fresh evidence. Observe power
confirmation/LOW_POWER under existing thresholds without synthesizing telemetry.
Keep Connection Evidence disabled if disabled before the update. Stop and remove
power independently on failed/unknown OFF, unexpected ON or inconsistent state.
Unknown outcomes, stale snapshots and logger faults belong in mocks, not deliberate
production fault injection. Restore only approved prior Flow enablement after
acceptance; keep logs/private evidence outside Git.

ACK does not prove physical OFF. Updates are not atomic; RuntimeLock is a best-effort
lease. Offline tests do not prove hardware acceptance, strict serialization or
unattended readiness. Final source commit, CI provenance, publication and supervised
hardware acceptance remain pending. Local validation evidence is recorded in the
ignored operator report; this document does not claim a live deployment.

## Local validation — 2026-10-12

`npm run verify` completed successfully: public-safety/credential checks, ESLint,
Prettier, unit tests, 52 manual-runtime cases, 112 manual-terminal cases, actuator
compensation regressions, 94 simulator scenarios, twelve source syntax checks,
release/deployment checks, 23 deployment mock scenarios, 14 provenance cases,
RuntimeLock characterization and artifact compatibility. Existing Script IDs and
mock rollback are covered. Two mock tests now derive approval/baseline versions
from their fixture instead of assuming 0.6.4+build.17; production runtime is unchanged.
Actionlint 1.7.12 passed both public workflows and the inactive private scaffold
(external shellcheck/pyflakes disabled). `git diff --check`, full source-to-bundle
comparison, immutable artifact/checksum verification and identical reuse-version
rebuild passed. The preserved old artifact differs in all twelve bundle hashes.
No test contacted real Homey; no production state was changed. GitHub CI for the
final release commit and hardware acceptance have not been performed.
