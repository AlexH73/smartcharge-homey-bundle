const PLAN_STABILITY_DECISIONS = Object.freeze({
  INITIAL_ACCEPT: 'INITIAL_ACCEPT',
  CONTINUE: 'CONTINUE',
  REPLACE: 'REPLACE',
  BYPASS: 'BYPASS',
  NO_DECISION: 'NO_DECISION',
});

const PLAN_STABILITY_THRESHOLD_MODES = Object.freeze({
  ANY: 'ANY',
  ALL: 'ALL',
});

function isUsableProjection(projection) {
  return projection?.available === true && projection.feasible === true;
}

function validateStabilityPolicyConfiguration(configuration) {
  const errors = [];

  if (
    !Object.values(PLAN_STABILITY_THRESHOLD_MODES).includes(
      configuration?.thresholdMode,
    )
  ) {
    errors.push('THRESHOLD_MODE_INVALID');
  }

  for (const profileName of ['waiting', 'charging']) {
    const profile = configuration?.[profileName];
    const thresholds = [
      profile?.minReplacementSavingsEur,
      profile?.minReplacementSavingsPct,
    ];

    if (!profile) {
      errors.push(`${profileName.toUpperCase()}_POLICY_MISSING`);
      continue;
    }

    if (thresholds.every((value) => value === null || value === undefined)) {
      errors.push(`${profileName.toUpperCase()}_THRESHOLD_MISSING`);
    }

    for (const [index, value] of thresholds.entries()) {
      if (
        value !== null &&
        value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      ) {
        const suffix = index === 0 ? 'EUR' : 'PCT';
        errors.push(`${profileName.toUpperCase()}_${suffix}_THRESHOLD_INVALID`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function evaluateReplacementThreshold(economics, profile, thresholdMode) {
  const criteria = [];

  if (
    profile.minReplacementSavingsEur !== null &&
    profile.minReplacementSavingsEur !== undefined
  ) {
    criteria.push({
      metric: 'EUR',
      threshold: profile.minReplacementSavingsEur,
      value: economics.replacementSavingsEur,
    });
  }
  if (
    profile.minReplacementSavingsPct !== null &&
    profile.minReplacementSavingsPct !== undefined
  ) {
    criteria.push({
      metric: 'PCT',
      threshold: profile.minReplacementSavingsPct,
      value: economics.replacementSavingsPct,
    });
  }

  const evaluable = criteria.every(
    (criterion) =>
      typeof criterion.value === 'number' && Number.isFinite(criterion.value),
  );
  const evaluatedCriteria = criteria.map((criterion) => ({
    ...criterion,
    satisfied:
      typeof criterion.value === 'number' &&
      Number.isFinite(criterion.value) &&
      criterion.value >= criterion.threshold,
  }));

  return {
    evaluable,
    satisfied:
      evaluable &&
      (thresholdMode === PLAN_STABILITY_THRESHOLD_MODES.ALL
        ? evaluatedCriteria.every((criterion) => criterion.satisfied)
        : evaluatedCriteria.some((criterion) => criterion.satisfied)),
    mode: thresholdMode,
    criteria: evaluatedCriteria,
  };
}

function decidePlanStability(input) {
  const {
    hasAcceptedStrategy,
    continuationProjection,
    candidateProjection,
    equivalence,
    economics,
    context = {},
    policyConfiguration,
  } = input;
  const continuationFeasible = isUsableProjection(continuationProjection);
  const candidateFeasible = isUsableProjection(candidateProjection);
  const currentShouldCharge =
    context.currentShouldCharge ??
    continuationProjection?.shouldChargeNow ??
    false;
  const candidateShouldCharge = candidateProjection?.shouldChargeNow ?? false;
  const transition = `${currentShouldCharge ? 'ON' : 'OFF'}_TO_${candidateShouldCharge ? 'ON' : 'OFF'}`;
  const diagnostics = {
    equivalent: equivalence?.equivalent === true,
    continuationAvailable: continuationProjection?.available === true,
    continuationFeasible,
    candidateAvailable: candidateProjection?.available === true,
    candidateFeasible,
    economicsAvailable: economics?.available === true,
    replacementSavingsEur: economics?.replacementSavingsEur ?? null,
    replacementSavingsPct: economics?.replacementSavingsPct ?? null,
    currentShouldCharge,
    candidateShouldCharge,
    transition,
    disruptiveTransition: currentShouldCharge && !candidateShouldCharge,
  };
  const result = (decision, reasonCode, extra = {}) => ({
    decision,
    reasonCode,
    ...diagnostics,
    ...extra,
  });

  if (context.manualOverrideActive) {
    return result(PLAN_STABILITY_DECISIONS.BYPASS, 'MANUAL_OVERRIDE');
  }
  if (context.safetyRequiresCandidate) {
    return result(PLAN_STABILITY_DECISIONS.BYPASS, 'SAFETY_OVERRIDE');
  }
  if (context.lifecycleBypassActive) {
    return result(PLAN_STABILITY_DECISIONS.BYPASS, 'LIFECYCLE_BYPASS');
  }
  if (context.disconnectSafetyActive) {
    return result(PLAN_STABILITY_DECISIONS.BYPASS, 'DISCONNECT_SAFETY');
  }
  if (context.stabilityAllowed === false) {
    return result(PLAN_STABILITY_DECISIONS.BYPASS, 'STABILITY_NOT_ALLOWED');
  }

  if (!hasAcceptedStrategy) {
    return candidateFeasible
      ? result(PLAN_STABILITY_DECISIONS.INITIAL_ACCEPT, 'NO_ACCEPTED_STRATEGY')
      : result(
          PLAN_STABILITY_DECISIONS.NO_DECISION,
          candidateProjection?.available === false
            ? 'CANDIDATE_UNAVAILABLE'
            : 'CANDIDATE_INFEASIBLE',
        );
  }

  if (!candidateFeasible) {
    return result(
      continuationFeasible
        ? PLAN_STABILITY_DECISIONS.CONTINUE
        : PLAN_STABILITY_DECISIONS.NO_DECISION,
      candidateProjection?.available === false
        ? 'CANDIDATE_UNAVAILABLE'
        : 'CANDIDATE_INFEASIBLE',
    );
  }

  if (!continuationFeasible) {
    return result(
      PLAN_STABILITY_DECISIONS.REPLACE,
      'CURRENT_STRATEGY_INFEASIBLE',
    );
  }

  if (equivalence?.equivalent) {
    return result(PLAN_STABILITY_DECISIONS.CONTINUE, 'EQUIVALENT_STRATEGY');
  }

  const configurationValidation =
    validateStabilityPolicyConfiguration(policyConfiguration);
  if (!configurationValidation.valid) {
    return result(
      PLAN_STABILITY_DECISIONS.NO_DECISION,
      'POLICY_CONFIGURATION_INVALID',
      { configurationErrors: configurationValidation.errors },
    );
  }

  if (!economics?.available) {
    return result(PLAN_STABILITY_DECISIONS.CONTINUE, 'ECONOMICS_UNAVAILABLE');
  }

  if (!(economics.replacementSavingsEur > 0)) {
    return result(
      PLAN_STABILITY_DECISIONS.CONTINUE,
      'REPLACEMENT_NOT_BENEFICIAL',
    );
  }

  const profileName = context.activelyCharging ? 'charging' : 'waiting';
  const threshold = evaluateReplacementThreshold(
    economics,
    policyConfiguration[profileName],
    policyConfiguration.thresholdMode,
  );
  if (!threshold.evaluable) {
    return result(PLAN_STABILITY_DECISIONS.CONTINUE, 'ECONOMICS_UNAVAILABLE', {
      policyProfile: profileName,
      threshold,
    });
  }

  return result(
    threshold.satisfied
      ? PLAN_STABILITY_DECISIONS.REPLACE
      : PLAN_STABILITY_DECISIONS.CONTINUE,
    threshold.satisfied
      ? 'REPLACEMENT_BENEFIT_SUFFICIENT'
      : 'REPLACEMENT_BENEFIT_INSUFFICIENT',
    { policyProfile: profileName, threshold },
  );
}
