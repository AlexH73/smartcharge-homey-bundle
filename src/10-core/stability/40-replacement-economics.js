function calculateReplacementEconomics(
  continuationProjection,
  candidateProjection,
) {
  if (!continuationProjection?.available || !candidateProjection?.available) {
    return {
      available: false,
      reasonCode: 'COST_COMPARISON_UNAVAILABLE',
      continuationRemainingCostEur: null,
      candidateRemainingCostEur: null,
      replacementSavingsEur: null,
      replacementSavingsPct: null,
    };
  }
  if (!continuationProjection.feasible || !candidateProjection.feasible) {
    return {
      available: false,
      reasonCode: 'COST_COMPARISON_INFEASIBLE',
      continuationRemainingCostEur: continuationProjection.costEur,
      candidateRemainingCostEur: candidateProjection.costEur,
      replacementSavingsEur: null,
      replacementSavingsPct: null,
    };
  }
  if (
    continuationProjection.requestedMinutes !==
    candidateProjection.requestedMinutes
  ) {
    return {
      available: false,
      reasonCode: 'REMAINING_REQUIREMENT_MISMATCH',
      continuationRemainingCostEur: continuationProjection.costEur,
      candidateRemainingCostEur: candidateProjection.costEur,
      replacementSavingsEur: null,
      replacementSavingsPct: null,
    };
  }

  const replacementSavingsEur =
    continuationProjection.costEur - candidateProjection.costEur;
  const replacementSavingsPct =
    continuationProjection.costEur > 0
      ? (replacementSavingsEur / continuationProjection.costEur) * 100
      : replacementSavingsEur === 0
        ? 0
        : null;

  return {
    available: true,
    reasonCode: null,
    continuationRemainingCostEur: continuationProjection.costEur,
    candidateRemainingCostEur: candidateProjection.costEur,
    replacementSavingsEur,
    replacementSavingsPct,
    comparedRemainingMinutes: continuationProjection.requestedMinutes,
  };
}
