function compareProjectedStrategies(acceptedProjection, candidateProjection) {
  if (!acceptedProjection?.available || !candidateProjection?.available) {
    return {
      comparable: false,
      equivalent: false,
      classification: 'UNAVAILABLE',
    };
  }
  if (!acceptedProjection.feasible || !candidateProjection.feasible) {
    return {
      comparable: false,
      equivalent: false,
      classification: 'INFEASIBLE',
    };
  }

  const acceptedSlots = acceptedProjection.selectedSlotStarts;
  const candidateSlots = candidateProjection.selectedSlotStarts;
  const equivalent =
    acceptedSlots.length === candidateSlots.length &&
    acceptedSlots.every(
      (identity, index) => identity === candidateSlots[index],
    );

  return {
    comparable: true,
    equivalent,
    classification: equivalent ? 'CONTINUATION' : 'REPLACEMENT',
    acceptedSlotStarts: acceptedSlots,
    candidateSlotStarts: candidateSlots,
  };
}
