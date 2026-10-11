# Coding standards

Follow the existing HomeyScript modules, naming and tests. Production modules are
concatenated in source-path order and run in the HomeyScript async wrapper; do not
introduce Node-only dependencies into `src/`. Local tooling uses CommonJS and the
repository's Node.js runtime. Pure planner/model functions belong in the core;
device/Logic access belongs in adapters/runtime orchestration.

Keep changes scoped. Do not change production logic to match a document. Treat
unknown/stale telemetry as unavailable, preserve stable identifiers/reason codes,
and distinguish intent, command ACK and physical observation. Shared Logic writes
are not transactional; document concurrency limits instead of inventing guarantees.

Run `npm run verify` for behavior/tooling changes. ESLint uses
[eslint.config.js](../eslint.config.js); Prettier settings are in
[.prettierrc](../.prettierrc). Documentation is excluded by
[.prettierignore](../.prettierignore), so validate links and examples separately.
Never publish real credentials, local configuration or raw diagnostic evidence.

Use Conventional Commits and the [development workflow](DevelopmentWorkflow.md).
Any user-supplied AGENTS.md instructions remain applicable; this repository does
not currently contain a tracked AGENTS.md or CONTRIBUTING.md.
