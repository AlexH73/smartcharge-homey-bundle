function evaluatePlanStability(options) {
  const projectionOptions = {
    sessionId: options.sessionId,
    prices: options.prices,
    now: options.now,
    remainingChargeMinutes: options.remainingChargeMinutes,
    targetDeparture: options.targetDeparture,
    chargingPowerKw: options.chargingPowerKw,
  };
  const candidateProjection = projectCandidatePlan(
    options.candidatePlan,
    projectionOptions,
  );

  if (!options.acceptedAnchor) {
    const policyResult = decidePlanStability({
      hasAcceptedStrategy: false,
      candidateProjection,
      context: options.context,
      policyConfiguration: options.policyConfiguration,
    });

    return {
      ...policyResult,
      continuationProjection: null,
      candidateProjection,
      equivalence: null,
      economics: null,
    };
  }

  const continuationProjection = projectAcceptedStrategy(
    options.acceptedAnchor,
    projectionOptions,
  );
  const equivalence = compareProjectedStrategies(
    continuationProjection,
    candidateProjection,
  );
  const economics = calculateReplacementEconomics(
    continuationProjection,
    candidateProjection,
  );
  const policyResult = decidePlanStability({
    hasAcceptedStrategy: true,
    continuationProjection,
    candidateProjection,
    equivalence,
    economics,
    context: options.context,
    policyConfiguration: options.policyConfiguration,
  });

  return {
    ...policyResult,
    continuationProjection,
    candidateProjection,
    equivalence,
    economics,
  };
}
