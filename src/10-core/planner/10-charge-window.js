/**
 * Creates a ChargeWindow model.
 *
 * ChargeWindow describes one continuous charging interval.
 * This function contains no planner, Homey or logger logic.
 *
 * @param {Object} options
 * @param {number} options.windowIndex
 * @param {string|null} options.plannedStart
 * @param {string|null} options.plannedEnd
 * @param {number|null} options.durationMinutes
 * @param {number|null} options.energyTarget
 * @param {number|null} options.slotCount
 * @param {number|null} options.averagePrice
 * @param {number|null} options.totalPrice
 * @param {boolean} options.startsNow
 * @param {Array<Object>} options.slots
 * @returns {Object}
 */
function createChargeWindow(options = {}) {
  return {
    windowIndex: options.windowIndex ?? 0,

    plannedStart: options.plannedStart ?? null,
    plannedEnd: options.plannedEnd ?? null,

    durationMinutes: options.durationMinutes ?? null,
    energyTarget: options.energyTarget ?? null,

    slotCount: options.slotCount ?? null,

    averagePrice: options.averagePrice ?? null,
    totalPrice: options.totalPrice ?? null,

    startsNow: Boolean(options.startsNow),

    slots: Array.isArray(options.slots) ? options.slots : [],
  };
}
