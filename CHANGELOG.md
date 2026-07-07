# Changelog

All notable SmartCharge Homey Bundle changes should be documented here.

The project follows semantic release tags such as `v0.4.0`, `v0.5.0`, and
`v1.0.0`.

## Unreleased

### Added

- Local SmartCharge Simulator with Homey, Tibber, and logger mocks.
- Scenario coverage for lifecycle, pricing, safety fallback, and logger
  payload behavior.
- Future simulator coverage for multi-window charging behavior.
- Human-readable simulator HTML log output.

### Changed

- Development flow now uses `main`, `develop`, `feature/*`, `release/*`, and
  `hotfix/*` branches.

## 0.3.42

### Added

- Modular HomeyScript source layout.
- HomeyScript build pipeline.
- SmartCharge lifecycle flows.
- Google Sheets logging contract.
