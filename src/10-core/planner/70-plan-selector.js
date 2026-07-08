/**
 * Selects the optimal charging plan.
 *
 * Current strategy:
 * - compare continuous and multi-window plans;
 * - return the cheaper one;
 *
 * Future:
 * - learning engine;
 * - hysteresis;
 * - adaptive strategy;
 * - max window policy.
 *
 * @param {Array<{startTime: Date, price: number}>} prices
 * @param {Object} options
 * @returns {Object|null}
 */
function selectChargePlan(prices, options) {
  const continuousPlan = findCheapestContinuousPlan(prices, options);
  const multiWindowPlan = findCheapestMultiWindowPlan(prices, options);

  if (!continuousPlan) {
    return multiWindowPlan;
  }

  if (!multiWindowPlan) {
    return continuousPlan;
  }

  return multiWindowPlan.totalPrice < continuousPlan.totalPrice
    ? multiWindowPlan
    : continuousPlan;
}
