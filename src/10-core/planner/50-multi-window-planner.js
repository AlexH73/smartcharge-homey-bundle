/**
 * Finds the cheapest charging plan using multiple charging windows.
 *
 * @param {Array<{startTime: Date, price: number}>} prices
 * @param {{now: Date, targetDeparture: Date, chargeSlots: number}} options
 * @returns {Object|null}
 */
function findCheapestMultiWindowPlan(prices, options) {
  const { now, targetDeparture, chargeSlots } = options;

  if (!chargeSlots || chargeSlots <= 0) {
    return null;
  }

  const availableSlots = prices.filter(
    (slot) => isSlotAvailable(slot, now) && slot.startTime < targetDeparture,
  );

  if (availableSlots.length < chargeSlots) {
    return null;
  }

  const cheapestSlots = selectCheapestSlots(availableSlots, chargeSlots);

  const orderedSlots = sortSlotsByTime(cheapestSlots);

  const mergedSlots = mergeAdjacentSlots(orderedSlots);

  const windows = buildChargeWindows(mergedSlots);

  const totalPrice = windows.reduce(
    (sum, window) => sum + window.totalPrice,
    0,
  );

  const averagePrice = totalPrice / chargeSlots;

  return createChargePlan({
    plannerMode: 'multi-window',
    optimizationStrategy: 'lowest-cost',

    plannedStart: windows[0].plannedStart,
    plannedEnd: windows[windows.length - 1].plannedEnd,

    averagePrice,
    totalPrice,

    chargeSlots,

    windowCount: windows.length,

    windows,
  });
}
