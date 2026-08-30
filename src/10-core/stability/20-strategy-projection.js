function buildProjectedWindows(allocations = []) {
  const windows = [];

  for (const allocation of allocations) {
    const previous = windows[windows.length - 1];
    const adjacent =
      previous &&
      previous.plannedEnd.getTime() === allocation.startTime.getTime();

    if (adjacent) {
      previous.plannedEnd = allocation.endTime;
      previous.durationMinutes += allocation.allocatedMinutes;
      previous.costEur += allocation.costEur;
      previous.allocations.push(allocation);
      previous.selectedSlotStarts.push(allocation.slotStartTime.toISOString());
      continue;
    }

    windows.push({
      windowIndex: windows.length,
      plannedStart: allocation.startTime,
      plannedEnd: allocation.endTime,
      durationMinutes: allocation.allocatedMinutes,
      costEur: allocation.costEur,
      selectedSlotStarts: [allocation.slotStartTime.toISOString()],
      allocations: [allocation],
    });
  }

  return windows;
}

function isNowInsideStrategyWindows(now, windows = []) {
  return windows.some(
    (window) => now >= window.plannedStart && now < window.plannedEnd,
  );
}

function projectSlotsForRemainingRequirement(slots, options) {
  const { now, remainingChargeMinutes, targetDeparture, chargingPowerKw } =
    options;
  const allocation = allocateChargingMinutes(slots, {
    chargeMinutes: remainingChargeMinutes,
    chargingPowerKw,
    allocationStart: now,
    targetDeparture,
  });
  const windows = buildProjectedWindows(allocation.allocations);

  return {
    feasible: allocation.complete,
    available: true,
    reasonCode: allocation.complete ? null : 'ACCEPTED_STRATEGY_INSUFFICIENT',
    requestedMinutes: Math.max(0, remainingChargeMinutes),
    allocatedMinutes: allocation.allocatedMinutes,
    remainingMinutes: Math.max(
      0,
      remainingChargeMinutes - allocation.allocatedMinutes,
    ),
    costEur: allocation.complete ? allocation.costEur : null,
    allocations: allocation.allocations,
    windows,
    selectedSlotStarts: allocation.allocations.map((item) =>
      item.slotStartTime.toISOString(),
    ),
    shouldChargeNow: isNowInsideStrategyWindows(now, windows),
  };
}

function projectAcceptedStrategy(anchor, options) {
  const validation = validateAcceptedStrategyAnchor(anchor, {
    sessionId: options.sessionId,
  });

  if (!validation.valid) {
    return {
      feasible: false,
      available: false,
      reasonCode: validation.errors.includes('SESSION_MISMATCH')
        ? 'SESSION_MISMATCH'
        : 'ANCHOR_INVALID',
      validationErrors: validation.errors,
    };
  }

  const now = options.now;
  const targetDeparture = options.targetDeparture;
  const freshPricesByStart = new Map(
    options.prices.map((slot) => [slot.startTime.getTime(), slot]),
  );
  const remainingIdentities = anchor.selectedSlotStarts.filter((identity) => {
    const start = new Date(identity);
    return (
      addMinutes(start, CONFIG.priceSlotMinutes) > now &&
      start < targetDeparture
    );
  });

  if (options.remainingChargeMinutes <= 0) {
    return {
      ...projectSlotsForRemainingRequirement([], options),
      elapsedSlotCount:
        anchor.selectedSlotStarts.length - remainingIdentities.length,
      remainingAcceptedSlotStarts: remainingIdentities,
    };
  }

  const requiredIdentities = [];
  let minutesToCover = options.remainingChargeMinutes;

  for (const identity of remainingIdentities) {
    if (minutesToCover <= 0) break;

    const start = new Date(identity);
    const end = addMinutes(start, CONFIG.priceSlotMinutes);
    const usableStart = options.now > start ? options.now : start;
    const usableEnd = targetDeparture < end ? targetDeparture : end;
    const usableMinutes = Math.max(
      0,
      (usableEnd.getTime() - usableStart.getTime()) / 60000,
    );

    if (usableMinutes <= 0) continue;
    requiredIdentities.push(identity);
    minutesToCover -= usableMinutes;
  }

  const missingSlotStarts = requiredIdentities.filter(
    (identity) => !freshPricesByStart.has(new Date(identity).getTime()),
  );

  if (missingSlotStarts.length > 0) {
    return {
      feasible: false,
      available: false,
      reasonCode: 'ACCEPTED_PRICE_SLOT_UNAVAILABLE',
      missingSlotStarts,
    };
  }

  const remainingSlots = requiredIdentities.map((identity) =>
    freshPricesByStart.get(new Date(identity).getTime()),
  );
  const projection = projectSlotsForRemainingRequirement(
    remainingSlots,
    options,
  );

  return {
    ...projection,
    elapsedSlotCount:
      anchor.selectedSlotStarts.length - remainingIdentities.length,
    remainingAcceptedSlotStarts: remainingIdentities,
  };
}

function projectCandidatePlan(candidatePlan, options) {
  if (!candidatePlan) {
    return {
      feasible: false,
      available: false,
      reasonCode: 'CANDIDATE_PLAN_UNAVAILABLE',
    };
  }

  return projectSlotsForRemainingRequirement(getPlanSlots(candidatePlan), {
    ...options,
    remainingChargeMinutes: options.remainingChargeMinutes,
  });
}
