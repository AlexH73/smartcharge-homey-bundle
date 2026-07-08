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
 * Slots with identical prices preserve their chronological order.
 *
 * @param {Array<Object>} slots
 * @returns {Array<Object>}
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
 * @param {Array<Object>} slots
 * @param {number} slotCount
 * @returns {Array<Object>}
 */
function selectCheapestSlots(slots = [], slotCount = 0) {
  return sortSlotsByPrice(slots).slice(0, slotCount);
}