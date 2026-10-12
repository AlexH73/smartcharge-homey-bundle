# Controlled HomeyScript deployment

SmartCharge deployment tooling supports the official HomeyScript **3.6.3** custom API.
The prepared [0.6.5+build.18 update](Release-0.6.5.md) has not been deployed;
the installed baseline remains 0.6.4+build.17.
The client reads installed scripts and updates existing IDs using only
`PUT /api/app/com.athom.homeyscript/script/:id` with `{code}`. Names and API
compatibility mode 1/2 are preserved. Create, delete and run endpoints are not used.
Other installed HomeyScript versions stop the operation before writes.

## Implementation and operational status

Status recorded 2026-10-11; installation is distinct from charging acceptance.

| Component | Status | Evidence/boundary |
| --- | --- | --- |
| Local client, release validation, provenance checks, Flow audit | IMPLEMENTED / TESTED LOCALLY | Offline regression suites; no exhaustive external-writer detection. |
| Twelve 0.6.4+build.17 bundles from release commit `5fcff0e` | DEPLOYED | One controlled installation with per-PUT/full-set hashes, preserved IDs/names/modes/Flow references and SmartCharge Logic; Flows left disabled. |
| Operational charging / hardware acceptance | PLANNED | Separate supervised tests; installation is not unattended readiness. |
| Public CI/release workflows | IMPLEMENTED / VALIDATED LOCALLY | Definitions/artifact tests exist; branch not yet pushed or checked by GitHub Actions. No GitHub Release published for this work. |
| Private repository, Windows runner and Environment approval | PLANNED | Allowlisted scaffold/template only; repository not created, end-to-end deployment not tested. |

Private installation evidence stays outside Git. This audit does not repeat
deployment or change Homey. Apps Script/dashboard operational status is not
established by installing HomeyScripts.

## Public CI and private deployment

The public repository contains GitHub-hosted CI and manual release publication.
CI verifies source/bundle consistency, release metadata and reproducibility without
version bumps, then uploads an immutable artifact with SHA-256 checksums.
Publication requires a separate authorized manual dispatch on public `main`, an existing approved release tag,
a successful non-PR CI run and an independently approved manifest digest. It does
not deploy HomeyScripts.

CI runs on pushes to `feature/**`/`develop`, PRs and manual dispatch. A push/merge
does not publish a release. Private deployment runs only by manual dispatch on
private `main`. Actions are pinned to commit SHAs. Public CI has no Homey token
or persistent LAN runner.

Never register a persistent LAN self-hosted runner in the public repository.
The inactive template `deployment/private-repository/smartcharge-deploy.yml` is
intended for a **separate private repository**. Prepare reviewed tooling locally:

```text
node scripts/prepare-private-deployment.js backup/private-deployment-staging
```

The exporter copies only an allowlist of tooling/configuration files; no credentials,
backups, Logic snapshots or public CI workflows. Do not initialize the parent
`backup/` directory as a Git repository. The template uses private-main tooling;
the downloaded public artifact is never executed as deployment tooling.

Private source approval checks authenticated GitHub API data for the fixed public
source repository, successful SmartCharge CI workflow, non-PR event, commit SHA,
release tag resolving to that SHA, published release, immutable artifact ID/run/
attempt/name/digest and expiration. The artifact manifest must also match both the
published release asset and an independently reviewed digest. Checksums alone do
not establish trusted provenance.

Configure these values in the private repository:

| Location | Name | Purpose |
| --- | --- | --- |
| Repository variables | `SOURCE_COMMIT_SHA`, `SOURCE_RELEASE_TAG`, `SOURCE_MANIFEST_SHA256` | Independently reviewed release identity |
| Repository secret | `SOURCE_READ_TOKEN` | Read-only Contents/Actions access to the public source |
| Environment secret | `HOMEY_API_TOKEN` | Homey key; never place in public repository or logs |
| Environment variables | `HOMEY_URL`, `HOMEY_PLUG_ID`, `HOMEY_BACKUP_ROOT`, `HOMEY_MAINTENANCE_FILE` | Local Secure origin, explicit device ID and private local paths |

The public publication workflow uses the same three `SOURCE_*` variables for
the release identity. No Homey credentials are provided to public workflows.

The private `homey-production` environment must have required reviewers and
prevent self-review; otherwise the template refuses to start the LAN job.
[GitHub restricts required reviewers in private repositories to Enterprise plans](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).
Protect private main, runner access and deployment branch policy; disable bypass
where available. Runner labels: `self-hosted`, `Windows`, `X64`, `smartcharge-homey`.
Backups and maintenance attestation must be outside the ephemeral checkout with
private Windows ACLs. Filesystem mode 0600 does not replace Windows ACLs.

## Local preparation and deployment

Use the official [Local Secure HTTPS hostname](https://support.homey.app/hc/en-us/articles/8178797067292-Create-and-use-API-Keys-on-Homey-Pro)
for the Homey's address, with certificate verification enabled. Set the Homey key
only in protected process-local environment for local execution; never pass its
value on the command line or persist it in source, artifacts or logs.

Example process-local setup in PowerShell 7 (documentation-only placeholder IP,
not an installation address):

```powershell
$env:HOMEY_URL = 'https://192-168-0-123.homey.homeylocal.com'
$taskSecureKey = Read-Host 'Homey API key' -AsSecureString
$env:HOMEY_API_TOKEN = [System.Net.NetworkCredential]::new('', $taskSecureKey).Password
$taskSecureKey.Dispose()
Remove-Variable taskSecureKey
$env:HOMEY_BACKUP_ROOT = 'C:\SmartChargePrivate\homey-backups'
$env:HOMEY_PLUG_ID = 'YOUR_APPROVED_PLUG_ID'
```

Use a privately ACL-protected path outside Git/runner checkout; never print the
environment or run under a shell transcript that captures credentials. On an
existing protected user-level setup you may load the key into the process using
`[Environment]::GetEnvironmentVariable('HOMEY_API_TOKEN', 'User')` without printing
it. Remove the process token after work with `Remove-Item Env:HOMEY_API_TOKEN`.
Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` or substitute a plain HTTP/IP endpoint.
Create the key with only necessary read permissions and HomeyScript update access;
validate actual scopes against the installed Homey model/version. The client does
not edit Logic, Flows or device capabilities.

The client has these modes:

```text
node scripts/homey-deployment.js inventory
node scripts/homey-deployment.js dry-run dist/release
node scripts/homey-deployment.js preflight dist/release
```

`dry-run` saves a private snapshot, checksums, replacement plan and an unconfirmed
maintenance template. `preflight` requires `HOMEY_MAINTENANCE_FILE` and performs
GET-only checks. Confirm physical OFF independently, disable all candidate writer/
runtime/control Flows, drain pending executions and quiesce external Apps/API
writers and manual script runs. The read-only Flow audit is:

```powershell
New-Item -ItemType Directory -Path diagnostics -Force | Out-Null
node scripts/homey-flow-audit.js diagnostics/flow-audit.md
```

For cached Mercedes SOC/status timestamps and Connection Evidence card wiring,
set `HOMEY_MERCEDES_ID` to the privately reviewed existing device ID, then run:

```powershell
node scripts/homey-mercedes-audit.js backup/homey/mercedes-audit.json
```

The Flow audit conservatively includes HomeyScript calls, delegated Flows and direct plug
actions, including disconnected Advanced Flow cards. External writers and active
executions cannot be exhaustively proved by this API and require operator inspection.
Connection Evidence must use a trustworthy connection event and the dedicated
script, not polling or an extra Runtime trigger. Keep one five-minute watchdog.

Copy/check the dry-run template and fill operator confirmations only after an
explicit human confirmation. Attestation must be less than 15 minutes old and
contain the reviewed 12 Script IDs. Preflight requires OFF, ManualMode=false,
AutoStartBlocked=true, empty runtime lock, inactive manual state and no auto grant.
`PREFLIGHT_READY_NO_PUT` does not authorize installation.

The CLI does not fill operator confirmations. Point `HOMEY_MAINTENANCE_FILE` to
your privately completed template before preflight. Renew confirmations if older
than 15 minutes or if live guards/state change; elapsed time is not consent.
The API cannot prove pending executions drained or external writers stopped.

After separate explicit authorization, set `SMARTCHARGE_WRITE_CONFIRMATION` to
`INSTALL SmartCharge 0.6.4+build.17` and run:

```text
node scripts/homey-deployment.js deploy dist/release
```

No rebuild or version bump occurs. A new private backup is saved before PUTs.
Live guards are repeated before each update; each PUT is followed by SHA-256
readback, then the whole release, identities, Flow references and unchanged
SmartCharge Logic are verified. Flows are not enabled and scripts/devices are not
run. Leave maintenance in place before separately supervised operational tests.

Update order is the [manifest order](Release-0.6.4.md); already identical code is
skipped, with the full selected set still verified. Approved Script IDs must match
the dry-run plan. Without an explicit-ID mapping, duplicate names fail closed,
including old release copies; the client never selects a script by release ranking.
No new scripts are created and no names/compatibility modes are changed.

To resolve duplicate names, independently review a private JSON mapping and set
`HOMEY_SCRIPT_SELECTION_FILE` before `dry-run`. It must cover exactly the twelve
manifest filenames. Each entry requires `id`, `name`, `apiCompatibilityVersion`
and `currentSha256` for the installed script. The ID must exist and match the
returned identity; the name must match both the approved name and bundle target;
the compatibility mode and installed code SHA-256 must match the approval.
Missing entries, unknown IDs or changed names, modes or hashes stop the operation
before PUT. Keep operator-specific mappings and installed hashes out of Git.

The dry-run template includes this mapping as `scriptSelection`, alongside the
approved `scriptIds`. Preserve both in `HOMEY_MAINTENANCE_FILE` for preflight and
installation. Explicit selection resolves identity only: it does not waive any
maintenance, artifact or operator-confirmation requirement. Older unselected
same-name scripts remain unchanged, and inventory guards detect their modification
during deployment. Per-script readback and final whole-set verification retain
the ID/name/mode/hash checks.

The local client verifies artifact bytes/metadata but does not itself fetch GitHub
provenance. Locally approve source commit, source-to-bundle comparison and manifest
through an independent trusted review. Private GitHub deployment additionally
requires the published approved tag/release and authenticated successful non-PR CI
artifact. Commit `5fcff0e` predates these workflows; do not claim it already has a
successful CI artifact or published release. Future CI may validate a later commit
with the same bundle source/version, but its actual SHA/tag/digest must be approved.

## Failure and rollback

Stop on the first PUT/readback error. Unknown PUT outcomes are not retried and
rollback is never automatic. Inspect actual installed hashes using read-only API.
Use the backup of that installation, including its checksummed deployment journal;
a dry-run snapshot alone is not an installation rollback journal.

After renewed maintenance conditions and separate rollback authorization, set
`HOMEY_ARTIFACT_DIR` to the verified artifact and `SMARTCHARGE_WRITE_CONFIRMATION`
to `ROLLBACK SmartCharge 0.6.4+build.17`, then run:

```text
node scripts/homey-deployment.js rollback <private-backup-directory>
```

The client rejects corrupted backups/journals, altered identities and unknown
installed code. It restores only changed scripts whose hashes match a journaled
installation attempt; already restored scripts are skipped. Recovery snapshots
and readbacks are saved; Flow/Logic/device state is not automatically restored.
Rollback uses the selected identities from the verified installation backup and
journal, not a new name-based selection. Explicit-ID mapping does not weaken
rollback identity or code-hash checks; older unselected same-name scripts are not
rollback targets.

Installation is not atomic. RuntimeLock is a best-effort lease, not a strict mutex;
GET guards cannot eliminate the race before PUT. Cached OFF and command ACK do not
prove physical OFF. Backups contain code/Flow arguments that may include private
data or embedded credentials: keep them private. SHA-256 detects corruption but
does not authenticate a backup against someone with write access to its directory.

The five-minute watchdog samples power; it cannot prove uninterrupted low power.
LOW_POWER is ≤5 W across ≥180 seconds, sample freshness 60 seconds, allowed
observation gap 360 seconds and MAX_DURATION 360 minutes. Restored Mercedes service
does not itself prove fresh telemetry or a trustworthy connection event.

Validation: `npm run verify` includes offline release/deployment/provenance tests;
`npm run test:deployment` runs the deployment and source-provenance suites directly.

## Version-independent contract and corrective release

The installed 0.6.4+build.17 remains unchanged. Corrected Actuator source bytes
are prepared as 0.6.5+build.18 in a separate artifact directory. Commit, publication,
tag and deployment each remain subject to separate authorization. Local tests
create temporary candidates only; they do not replace dist/release.

Build/source verification uses the release checkout and all twelve builder targets.
Artifact integrity verification uses the explicit schema-1 bundle allowlist,
manifest metadata, SHA-256, regular files and exact directory contents, without
reading checkout source/build metadata. Unsupported schemas or safety threshold
formats fail closed. Tooling compatibility depends on supported schema, not equal
checkout versions. Integrity alone does not authenticate the source.

CLI `inspect` performs integrity-only checks. CLI `verify <directory> <approved-digest>
<approved-tag>` additionally requires an independently approved manifest digest and
tag/version. GitHub provenance binds the public repository, commit, tag-to-commit
mapping, that commit's build metadata, trusted successful non-PR workflow, artifact
ID/name/digest and published release manifest. Existing release publication fails
instead of replacing its assets. Matching artifact version/header is mandatory.

Maintenance templates now include `tag` and `manifestSha256`. Compare these fields
with independent approval; template values copied from the artifact are not proof
of trusted origin. Deploy/preflight require this binding plus all existing operator
conditions. Typed approval is `INSTALL SmartCharge <approved version>` or
`ROLLBACK SmartCharge <approved version>`, without a leading v. Renewal and
independent physical OFF remain mandatory. Original checksummed snapshots/journals
remain supported; do not rewrite them to add newer optional plan fields.
