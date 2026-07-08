/**
 * Formats ChargeWindow list into a human-readable string.
 *
 * Example:
 * 02:00-03:00 | 05:00-06:00
 *
 * @param {Array<Object>} windows
 * @returns {string|null}
 */
function formatChargeWindowsText(windows = []) {
  if (!windows.length) {
    return null;
  }

  return windows
    .map((window) => `${window.plannedStart} - ${window.plannedEnd}`)
    .join(' | ');
}

/**
 * Serializes ChargeWindow list into JSON.
 *
 * @param {Array<Object>} windows
 * @returns {string|null}
 */
function serializeChargeWindows(windows = []) {
  if (!windows.length) {
    return null;
  }

  return JSON.stringify(windows);
}

/**
 * Sorts charging slots by price (ascending).
 *
 * Slots with the same price preserve chronological order.
 *
 * @param {Array<{startTime: Date, price: number}>} slots
 * @returns {Array}
 */
function sortSlotsByPrice(slots = []) {
  return [...slots].sort((a, b) => {
    if (a.price !== b.price) {
      return a.price - b.price;
    }

    return a.startTime.getTime() - b.startTime.getTime();
  });
}

/**
 * Selects the cheapest charging slots.
 *
 * @param {Array<{startTime: Date, price: number}>} slots
 * @param {number} slotCount
 * @returns {Array}
 */
function selectCheapestSlots(slots = [], slotCount = 0) {
  if (slotCount <= 0) {
    return [];
  }

  return sortSlotsByPrice(slots).slice(0, slotCount);
}

/**
 * Sorts charging slots chronologically.
 *
 * @param {Array<{startTime: Date}>} slots
 * @returns {Array}
 */
function sortSlotsByTime(slots = []) {
  return [...slots].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
}

/**
 * Merges adjacent charging slots into continuous charging windows.
 *
 * Input slots must already be sorted chronologically.
 *
 * @param {Array<{startTime: Date, price: number}>} slots
 * @returns {Array<Array>}
 */
function mergeAdjacentSlots(slots = []) {
  if (!slots.length) {
    return [];
  }

  const windows = [];
  let currentWindow = [slots[0]];

  for (let i = 1; i < slots.length; i++) {
    const previous = currentWindow[currentWindow.length - 1];
    const current = slots[i];

    const expectedStart = addMinutes(
      previous.startTime,
      CONFIG.priceSlotMinutes,
    ).getTime();

    if (current.startTime.getTime() === expectedStart) {
      currentWindow.push(current);
    } else {
      windows.push(currentWindow);
      currentWindow = [current];
    }
  }

  windows.push(currentWindow);

  return windows;
}

/**
 * Builds ChargeWindow models from merged charging slot groups.
 *
 * @param {Array<Array<{startTime: Date, price: number}>>} mergedSlots
 * @returns {Array<Object>}
 */
function buildChargeWindows(mergedSlots = []) {
  return mergedSlots.map((slots, index) => {
    const totalPrice = slots.reduce((sum, slot) => sum + slot.price, 0);
    const averagePrice = totalPrice / slots.length;

    const plannedStart = slots[0].startTime;
    const plannedEnd = addMinutes(
      slots[slots.length - 1].startTime,
      CONFIG.priceSlotMinutes,
    );

    return createChargeWindow({
      windowIndex: index,

      plannedStart,
      plannedEnd,

      durationMinutes: slots.length * CONFIG.priceSlotMinutes,

      energyTarget: null,

      slotCount: slots.length,

      averagePrice,
      totalPrice,

      startsNow: false,

      slots,
    });
  });
}

/**
 * Collects charging slots that are still available before target departure.
 *
 * @param {Array<{startTime: Date}>} prices
 * @param {Date} now
 * @param {Date} targetDeparture
 * @returns {Array}
 */
function collectAvailableSlots(
  prices = [],
  now,
  targetDeparture,
) {
  return prices.filter(
    (slot) =>
      isSlotAvailable(slot, now) &&
      slot.startTime < targetDeparture,
  );
}
