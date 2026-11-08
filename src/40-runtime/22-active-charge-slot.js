// This production record is independent of the diagnostic stability anchor.
async function retainActiveChargeSlot(plan, options) {
  const {
    prices,
    now,
    targetDeparture,
    sessionId,
    plugOn,
    mutateDecisionState,
  } = options;
  let record;
  let stopToken;
  try {
    stopToken = await getVariableValue(CONFIG.userStopTokenVariableName);
    record = JSON.parse(
      await getVariableValue(CONFIG.activeChargeSlotVariableName),
    );
  } catch (error) {
    log(`Active charging slot unavailable: ${error.message}`);
    return plan;
  }
  const currentSlot = prices.find(
    (slot) =>
      slot.startTime <= now &&
      addMinutes(slot.startTime, CONFIG.priceSlotMinutes) > now &&
      slot.startTime < targetDeparture,
  );
  const canRetain =
    plugOn === true &&
    plan &&
    currentSlot &&
    record?.schemaVersion === 1 &&
    record.sessionId === sessionId &&
    record.stopToken === stopToken &&
    record.slotStart === currentSlot.startTime.toISOString();
  if (canRetain && !isNowInsidePlan(now, plan)) {
    // Keep future capacity: a partly elapsed hour cannot replace a full slot.
    const slots = sortSlotsByTime([
      currentSlot,
      ...plan.windows.flatMap((window) => window.slots),
    ]);
    const windows = buildChargeWindows(mergeAdjacentSlots(slots));
    const totalPrice = slots.reduce((sum, slot) => sum + slot.price, 0);
    plan = createChargePlan({
      plannerMode: windows.length === 1 ? 'continuous' : 'multi-window',
      optimizationStrategy: 'retain-active-slot',
      plannedStart: windows[0].plannedStart,
      plannedEnd: windows[windows.length - 1].plannedEnd,
      averagePrice: totalPrice / slots.length,
      totalPrice,
      chargeSlots: slots.length,
      windows,
    });
  }
  if (mutateDecisionState) {
    const nextRecord =
      plan && currentSlot && isNowInsidePlan(now, plan)
        ? {
            schemaVersion: 1,
            sessionId,
            slotStart: currentSlot.startTime.toISOString(),
            stopToken,
          }
        : null;
    await tryUpdateVariableByName(
      CONFIG.activeChargeSlotVariableName,
      JSON.stringify(nextRecord),
    );
  }
  return plan;
}
