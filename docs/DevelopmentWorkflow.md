# Development workflow

SmartCharge uses `develop` for integration and `main` for stable release publication.
Work normally starts on a scoped task branch from updated `develop`, preserving
existing local work and following applicable operator/repository instructions.
Prefixes describe intent: `feature/`, `fix/`, `chore/`; releases may use `release/*`
and urgent fixes `hotfix/*`, merged back into both main/develop as appropriate.
The current manual reliability work remains on `feature/manual-charging-reliability`.

## Validation and review

```powershell
npm ci
npm run verify
git diff --check
```

`verify` runs ESLint, Prettier, unit/regression suites, simulator, all twelve
reuse-version builds and offline release/deployment/provenance checks. Add
meaningful tests for behavior changes. Documentation links/examples/privacy need
separate validation because docs are excluded from Prettier and simulator evidence
cannot prove real Flow/driver behavior. Follow [Coding standards](CodingStandards.md).

Before committing/pushing, inspect the whole diff and ignored/private boundaries.
Use Conventional Commits and obtain confirmation when operator instructions require
it. PRs target `develop`; merge only after review and successful applicable CI.
Branch deletion follows verified merge, not merely a submitted PR. No source
merge/CI success authorizes Homey deployment or GitHub Release publication.

## Versioned builds and artifacts

Ordinary `npm run build:homey` and target builds increment patch/build metadata.
Only release-authoring work should do this. `--release VERSION` sets the requested
semantic version and advances the monotonic build counter. Review/CI reproduction:

```powershell
npm run build:homey -- --reuse-version
node scripts/release-artifact.js create
node scripts/release-artifact.js verify dist/release
```

These preserve committed identity/time and compare full source bytes/metadata.
Approve one immutable artifact; do not rebuild, bump version or edit code during
deployment. Release tags identify approved source (for this version,
`v0.6.4+build.17` or `0.6.4+build.17`). Tag creation/release publication are separate
authorized actions. The public manual release workflow requires existing tag,
approved SHA/digest and successful non-PR CI artifact; it never deploys Homey.

## Public CI and private deployment

Public pushes to `feature/**`/`develop`, PRs and manual dispatch use GitHub-hosted
runners and upload verified artifacts. The inactive Windows LAN workflow belongs
in a separate private repository, with trusted-main tooling, authenticated source
provenance, Environment reviewers and private credentials/backups. It has not been
created or end-to-end tested. See [Homey deployment](HomeyDeployment.md).

## Completion evidence

Record implemented behavior, local checks, CI results, code installation and
supervised operational acceptance separately. A reviewed source PR can be ready
for integration without claiming hardware acceptance or autonomous readiness.
After any separately authorized installation leave Flows disabled until
[supervised acceptance](HomeyDeploymentReadiness.md). Preserve historical research
and private diagnostic evidence. Proposed behavior stays explicitly marked planned;
remove scenario future-failure markers only when the behavior is implemented.
