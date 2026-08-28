function evaluateCanonicalStabilityShadow(options) {
  const input = options.shadowInput;
  if (!input?.enabled) return null;

  const evaluation = evaluatePlanStability({
    acceptedAnchor: input.acceptedAnchor || null,
    candidatePlan: options.candidatePlan,
    prices: options.prices,
    sessionId: options.sessionId,
    now: options.now,
    remainingChargeMinutes: options.remainingChargeMinutes,
    targetDeparture: options.targetDeparture,
    chargingPowerKw: options.chargingPowerKw,
    context: {
      ...input.context,
      safetyRequiresCandidate:
        input.context?.safetyRequiresCandidate ||
        options.safetyRequiresCandidate,
    },
    policyConfiguration: input.policyConfiguration,
  });
  const decision = evaluation.decision;
  const shadowEffectiveShouldCharge =
    decision === 'CONTINUE'
      ? (evaluation.continuationProjection?.shouldChargeNow ??
        options.productionShouldChargeNow)
      : decision === 'INITIAL_ACCEPT' || decision === 'REPLACE'
        ? evaluation.candidateShouldCharge
        : options.productionShouldChargeNow;
  const currentRevision = input.acceptedAnchor?.revision ?? null;
  const candidateRevision =
    decision === 'INITIAL_ACCEPT'
      ? 1
      : decision === 'REPLACE'
        ? currentRevision + 1
        : currentRevision;
  const candidateAnchor =
    (decision === 'INITIAL_ACCEPT' || decision === 'REPLACE') &&
    evaluation.candidateProjection?.feasible
      ? createAcceptedStrategyAnchor({
          sessionId: options.sessionId,
          plannerVersion: CONFIG.plannerVersion,
          acceptedAt: options.now.toISOString(),
          revision: candidateRevision,
          targetDeparture: options.targetDeparture.toISOString(),
          selectedSlotStarts: evaluation.candidateProjection.selectedSlotStarts,
        })
      : null;

  return {
    stabilityMode: 'shadow',
    stabilityDecision: decision,
    stabilityReasonCode: evaluation.reasonCode,
    acceptedStrategyRevision: currentRevision,
    replacementSavingsEur: evaluation.replacementSavingsEur,
    replacementSavingsPct: evaluation.replacementSavingsPct,
    currentStrategyRemainingCostEur:
      evaluation.economics?.continuationRemainingCostEur ?? null,
    candidateRemainingCostEur:
      evaluation.economics?.candidateRemainingCostEur ?? null,
    strategyEquivalent: evaluation.equivalent,
    continuationFeasible: evaluation.continuationFeasible,
    candidateFeasible: evaluation.candidateFeasible,
    transition: evaluation.transition,
    disruptiveTransition: evaluation.disruptiveTransition,
    candidateShouldCharge: evaluation.candidateShouldCharge,
    shadowEffectiveShouldCharge,
    projectedRemainingMinutes:
      evaluation.continuationProjection?.requestedMinutes ?? null,
    projectedWindows:
      evaluation.continuationProjection?.windows?.map((window) => ({
        plannedStart: window.plannedStart.toISOString(),
        plannedEnd: window.plannedEnd.toISOString(),
      })) ?? null,
    stabilityCandidateAnchor: candidateAnchor,
  };
}

function createCanonicalStabilityBypass(shadowInput, reasonCode) {
  if (!shadowInput?.enabled) return null;

  return {
    stabilityMode: 'shadow',
    stabilityDecision: 'BYPASS',
    stabilityReasonCode: reasonCode,
    acceptedStrategyRevision: shadowInput.acceptedAnchor?.revision ?? null,
    replacementSavingsEur: null,
    replacementSavingsPct: null,
    currentStrategyRemainingCostEur: null,
    candidateRemainingCostEur: null,
    strategyEquivalent: false,
    continuationFeasible: false,
    candidateFeasible: false,
    transition: 'OFF_TO_OFF',
    disruptiveTransition: false,
    candidateShouldCharge: false,
    shadowEffectiveShouldCharge: false,
    stabilityCandidateAnchor: null,
  };
}
