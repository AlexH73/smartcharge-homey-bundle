# Generated HomeyScript bundles

Only this README is tracked. Generated JavaScript and `dist/release` stay outside
Git. Prepared identity: **0.6.5+build.18**. The new local artifact is
`dist/release-0.6.5-build.18`; preserve the old 0.6.4 artifact separately.
See [release preparation and update](../docs/Release-0.6.5.md).
Check candidates without writing bundles:

```powershell
npm run build:homey -- --reuse-version --check
node scripts/release-artifact.js verify dist/release '<APPROVED_MANIFEST_SHA256>' '<APPROVED_RELEASE_TAG>'
```

The complete release artifact contains twelve bundles, `manifest.json` and
`SHA256SUMS`. Ordinary/individual-target builds increment patch/build metadata;
`--release VERSION` is release authoring, not an update command. Never rebuild an
approved deployment artifact. All bundles include shared sources and must remain
one coherent set. Actual manifest/client order:

| Bundle | Role |
| --- | --- |
| `SMARTCHARGE - Connection Evidence.js` | Records a trustworthy connection event, then calls Runtime Controller. |
| `SMARTCHARGE - Runtime Controller.js` | Reconciles Manual Charging or automatic Session/planner and Actuator. |
| `SMARTCHARGE - Run Decision.js` | Legacy compatibility decision; active mode delegates to runtime. |
| `SMARTCHARGE - Reset Session.js` | Explicit automatic Session reset; does not reset independent manual intent. |
| `SMARTCHARGE - Start Session.js` | Compatibility automatic Session creation; not a second active lifecycle owner. |
| `SMARTCHARGE - Log On.js` | Compatibility lifecycle logging, not an Actuator command. |
| `SMARTCHARGE - Log Off.js` | Compatibility lifecycle logging; not a substitute for manual power confirmation. |
| `SMARTCHARGE - State Sync.js` | Legacy reconciliation; active mode delegates to runtime. |
| `SMARTCHARGE - Manual Override On.js` | Activates durable Manual Charging while preserving Durable Auto Block. |
| `SMARTCHARGE - Manual Override Off.js` | Explicit USER_STOP; denies Automatic Charging across restarts. |
| `SMARTCHARGE - Auto Mode.js` | Explicit automatic permission after safe-state/freshness checks. |
| `SMARTCHARGE - Stability Debug.js` | Read-only persisted stability diagnostics. |

Use [Installation](../docs/Installation.md) for initial setup and
[Homey deployment](../docs/HomeyDeployment.md) for approved artifact backup,
existing-ID update/readback and separate rollback. Writers remain disabled while
the set is replaced. First-time manual script creation is separate; the API client
never creates/deletes/runs scripts. Generated files may contain local configuration:
review privacy before deliberately publishing a release artifact.
