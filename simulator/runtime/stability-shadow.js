// Simulator characterization values only. These are not production settings.
const SIMULATOR_STABILITY_POLICY = Object.freeze({
  thresholdMode: 'ALL',
  waiting: Object.freeze({
    minReplacementSavingsEur: 0.05,
    minReplacementSavingsPct: 5,
  }),
  charging: Object.freeze({
    minReplacementSavingsEur: 0.5,
    minReplacementSavingsPct: 20,
  }),
});

function createStabilityShadowInput(runtime, step) {
  if (!runtime.scenario.shadowStability || step.shadow?.enabled === false) {
    return null;
  }

  const logic = runtime.homeyMock.getLogicSnapshot();
  const devices = runtime.homeyMock.getDeviceSnapshot();
  const sessionId = logic.ChargeConnectedAt;

  if (
    runtime.stabilityShadowAnchor &&
    runtime.stabilityShadowAnchor.sessionId !== sessionId
  ) {
    runtime.stabilityShadowAnchor = null;
  }

  return {
    enabled: true,
    acceptedAnchor: runtime.stabilityShadowAnchor,
    policyConfiguration: SIMULATOR_STABILITY_POLICY,
    context: {
      stabilityAllowed: true,
      activelyCharging:
        step.shadow?.activelyCharging ??
        devices.plug.capabilitiesObj.onoff.value === true,
      manualOverrideActive:
        step.shadow?.manualOverrideActive ??
        logic.SmartChargeManualMode === true,
      disconnectSafetyActive: step.shadow?.disconnectSafetyActive === true,
      lifecycleBypassActive: step.shadow?.lifecycleBypassActive === true,
    },
  };
}

function applyStabilityShadowResult(runtime, result) {
  if (!runtime.scenario.shadowStability) return;

  if (
    (result?.stabilityDecision === 'INITIAL_ACCEPT' ||
      result?.stabilityDecision === 'REPLACE') &&
    result.stabilityCandidateAnchor
  ) {
    runtime.stabilityShadowAnchor = result.stabilityCandidateAnchor;
  }

  if (result?.stabilityMode === 'shadow') {
    result.acceptedStrategyRevision =
      runtime.stabilityShadowAnchor?.revision ?? null;
    delete result.stabilityCandidateAnchor;
  }

  if (result?.terminalState) {
    runtime.stabilityShadowAnchor = null;
  }

  const sessionId = runtime.homeyMock.getLogicSnapshot().ChargeConnectedAt;
  if (!sessionId || sessionId === 'null') {
    runtime.stabilityShadowAnchor = null;
  }
}

module.exports = {
  SIMULATOR_STABILITY_POLICY,
  applyStabilityShadowResult,
  createStabilityShadowInput,
};
