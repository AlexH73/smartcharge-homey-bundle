/**
 * Calculates an unrounded charging cost for one tariff interval.
 */
function calculateIntervalCostEur(priceEurKwh, chargingPowerKw, minutes) {
  return priceEurKwh * chargingPowerKw * minutes / 60;
}

/**
 * Allocates charging minutes over chronological tariff slots.
 *
 * A slot is usable between max(slot start, allocation start) and the earlier
 * of its end and target departure.
 */
function allocateChargingMinutes(slots, options) {
  const {
    chargeMinutes,
    chargingPowerKw,
    allocationStart,
    targetDeparture,
    requireConsecutiveSlots = false,
  } = options;

  const orderedSlots = sortSlotsByTime(slots);
  const allocations = [];
  const requestedMinutes = Math.max(0, chargeMinutes);
  let remainingMinutes = requestedMinutes;
  let totalCostEur = 0;
  let previousSlotEnd = null;
  let incompleteReason = null;

  for (const slot of orderedSlots) {
    if (remainingMinutes <= 0) break;

    const slotStart = slot.startTime;
    const slotEnd = addMinutes(slotStart, CONFIG.priceSlotMinutes);

    if (
      requireConsecutiveSlots &&
      previousSlotEnd &&
      slotStart.getTime() !== previousSlotEnd.getTime()
    ) {
      incompleteReason = 'NON_CONSECUTIVE_PRICE_SLOTS';
      break;
    }

    const usableStart = allocationStart && allocationStart > slotStart
      ? allocationStart
      : slotStart;
    const usableEnd = targetDeparture && targetDeparture < slotEnd
      ? targetDeparture
      : slotEnd;
    const usableMinutes = Math.max(
      0,
      (usableEnd.getTime() - usableStart.getTime()) / 60000,
    );

    if (usableMinutes <= 0) continue;

    previousSlotEnd = slotEnd;

    const allocatedMinutes = Math.min(remainingMinutes, usableMinutes);
    const intervalCostEur = calculateIntervalCostEur(
      slot.price,
      chargingPowerKw,
      allocatedMinutes,
    );

    allocations.push({
      startTime: usableStart,
      endTime: addMinutes(usableStart, allocatedMinutes),
      priceEurKwh: slot.price,
      allocatedMinutes,
      costEur: intervalCostEur,
    });
    remainingMinutes -= allocatedMinutes;
    totalCostEur += intervalCostEur;
  }

  const allocatedMinutes = requestedMinutes - remainingMinutes;

  return {
    complete: remainingMinutes === 0,
    allocatedMinutes,
    costEur: totalCostEur,
    allocations,
    incompleteReason:
      remainingMinutes === 0
        ? null
        : incompleteReason || 'INSUFFICIENT_USABLE_TIME_BEFORE_DEPARTURE',
  };
}

function getPlanSlots(plan) {
  if (!plan || !Array.isArray(plan.windows)) return [];

  const slotsByStart = new Map();

  for (const window of plan.windows) {
    for (const slot of window.slots || []) {
      slotsByStart.set(slot.startTime.getTime(), slot);
    }
  }

  return sortSlotsByTime([...slotsByStart.values()]);
}

/**
 * Compares the selected SmartCharge plan with charging immediately from now.
 */
function estimatePlanCosts(options) {
  const {
    plan,
    prices,
    now,
    targetDeparture,
    chargeMinutes,
    chargingPowerKw,
  } = options;

  const selected = allocateChargingMinutes(getPlanSlots(plan), {
    chargeMinutes,
    chargingPowerKw,
    allocationStart: now,
    targetDeparture,
  });

  const baseline = allocateChargingMinutes(prices, {
    chargeMinutes,
    chargingPowerKw,
    allocationStart: now,
    targetDeparture,
    requireConsecutiveSlots: true,
  });

  const signedSavingsEur = baseline.costEur - selected.costEur;
  const estimatedSavingsEur =
    selected.complete && baseline.complete
      ? Math.max(0, signedSavingsEur)
      : null;
  const estimatedSavingsPct =
    estimatedSavingsEur !== null && baseline.costEur > 0
      ? estimatedSavingsEur / baseline.costEur * 100
      : estimatedSavingsEur === 0
        ? 0
        : null;

  return {
    estimatedSelectedCostEur: selected.complete ? selected.costEur : null,
    estimatedBaselineCostEur: baseline.complete ? baseline.costEur : null,
    estimatedSavingsEur,
    estimatedSavingsPct,
    allocatedChargeMinutes: selected.allocatedMinutes,
    baselineAllocatedMinutes: baseline.allocatedMinutes,
    chargingPowerKw,
    baselineAllocationComplete: baseline.complete,
    baselineIncompleteReason: baseline.incompleteReason,
  };
}
