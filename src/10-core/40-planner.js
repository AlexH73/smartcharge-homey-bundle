/**
 * Checks whether a Tibber price slot is still usable.
 *
 * @param {{startTime: Date}} priceSlot
 * @param {Date} now
 * @returns {boolean}
 */
function isSlotAvailable(priceSlot, now) {
  const slotEnd = addMinutes(priceSlot.startTime, CONFIG.priceSlotMinutes);
  return slotEnd > now;
}

/**
 * Finds the cheapest continuous charging block before target departure.
 *
 * @param {Array<{startTime: Date, price: number}>} prices
 * @param {{now: Date, targetDeparture: Date, chargeSlots: number}} options
 * @returns {{plannedStart: Date, plannedEnd: Date, totalPrice: number, averagePrice: number, slots: Array}|null}
 */
function findCheapestContinuousPlan(prices, options) {
  const { now, targetDeparture, chargeSlots } = options;

  if (!chargeSlots || chargeSlots <= 0) {
    return null;
  }

  const availablePrices = prices.filter(
    (price) => isSlotAvailable(price, now) && price.startTime < targetDeparture,
  );

  if (availablePrices.length < chargeSlots) {
    return null;
  }

  let bestPlan = null;

  for (let i = 0; i <= availablePrices.length - chargeSlots; i++) {
    const block = availablePrices.slice(i, i + chargeSlots);

    let isContinuous = true;

    for (let j = 1; j < block.length; j++) {
      const expectedStart = addMinutes(
        block[j - 1].startTime,
        CONFIG.priceSlotMinutes,
      ).getTime();

      if (block[j].startTime.getTime() !== expectedStart) {
        isContinuous = false;
        break;
      }
    }

    if (!isContinuous) {
      continue;
    }

    const totalPrice = block.reduce((sum, price) => sum + price.price, 0);
    const averagePrice = totalPrice / block.length;
    const plannedStart = block[0].startTime;
    const plannedEnd = addMinutes(
      block[block.length - 1].startTime,
      CONFIG.priceSlotMinutes,
    );

    const plan = {
      plannedStart,
      plannedEnd,
      totalPrice,
      averagePrice,
      slots: block,
    };

    if (!bestPlan || totalPrice < bestPlan.totalPrice) {
      bestPlan = plan;
    }
  }

  return bestPlan;
}

/**
 * Checks whether current time is inside selected charging plan.
 *
 * @param {Date} now
 * @param {{plannedStart: Date, plannedEnd: Date}|null} plan
 * @returns {boolean}
 */
function isNowInsidePlan(now, plan) {
  if (!plan) {
    return false;
  }

  return now >= plan.plannedStart && now < plan.plannedEnd;
}

/**
 * Safety fallback: start charging when latest safe start has been reached.
 *
 * @param {Date} now
 * @param {Date} targetDeparture
 * @param {number} chargeMinutes
 * @param {number} battery
 * @returns {boolean}
 */
function isSafetyStartRequired(now, targetDeparture, chargeMinutes, battery) {
  if (battery >= CONFIG.batteryFullPercentage || chargeMinutes <= 0) {
    return false;
  }

  const latestSafeStart = addMinutes(targetDeparture, -chargeMinutes);

  return now >= latestSafeStart;
}
