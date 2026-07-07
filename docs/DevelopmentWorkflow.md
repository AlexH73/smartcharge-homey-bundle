# Development Workflow

SmartCharge uses a simplified GitFlow-style process.

```text
main
  ^
release/*
  ^
develop
  ^
feature/*
```

## Branches

### `main`

`main` contains stable releases only. Do not commit directly to `main`.

Release commits should be tagged:

```text
v0.4.0
v0.5.0
v1.0.0
```

### `develop`

`develop` is the integration branch for active development. It should always:

- build successfully;
- pass the simulator;
- be suitable for Homey testing.

### `feature/*`

Every planned task should use its own feature branch from `develop`.

Examples:

```text
feature/multi-window-planner
feature/dashboard
feature/simulator
feature/logger-improvements
feature/energy-cost
feature/statistics
feature/planner-stability
```

### `release/*`

Release branches prepare stable versions from `develop` before merging to
`main`.

### `hotfix/*`

Hotfix branches are for urgent production fixes from `main`. Merge completed
hotfixes back into both `main` and `develop`.

## Definition Of Done

A feature is complete only when all relevant checks are done:

- Code is implemented.
- Simulator coverage exists for behavior changes.
- `npm test` passes.
- `npm run build:homey` passes when HomeyScript output is affected or before
  merging into `develop`.
- Documentation is updated when behavior, workflow, or usage changes.
- Code review is complete.
- The merged `develop` branch has been tested on Homey when production behavior
  is affected.

## Current Practice

- Build behavior in simulator scenarios before changing production planner
  logic.
- Mark future behavior with `futureExpect` and `futureExpectedFailure: true`
  only when the current production runtime is intentionally not ready yet.
- Remove the future-failure marker in the same feature that implements the
  production behavior.
