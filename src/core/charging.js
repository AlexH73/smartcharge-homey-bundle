/**
 * Calculates required charging duration in minutes.
 *
 * Formula:
 * missing battery percentage * factor + reserve,
 * then rounded and clamped to configured limits.
 *
 * @param {number} battery
 * @param {number} factor
 * @param {number} reserve
 * @returns {number}
 */
function calculateChargeMinutes(battery, factor, reserve) {
  if (battery >= CONFIG.batteryFullPercentage) {
    return 0;
  }

  const rawMinutes =
    (CONFIG.batteryFullPercentage - battery) * factor + reserve;
  const roundedMinutes = roundUp(rawMinutes, CONFIG.roundToMinutes);

  return clamp(
    roundedMinutes,
    CONFIG.minChargeMinutes,
    CONFIG.maxChargeMinutes,
  );
}

/**
 * Converts charging duration to price slots.
 *
 * @param {number} chargeMinutes
 * @returns {number}
 */
function calculateChargeSlots(chargeMinutes) {
  return Math.ceil(chargeMinutes / CONFIG.priceSlotMinutes);
}

/**
 * Calculates how many hours are available until target departure.
 *
 * @param {Date} targetDeparture
 * @param {Date} now
 * @returns {number}
 */
function calculateHoursAhead(targetDeparture, now) {
  const diffMs = targetDeparture.getTime() - now.getTime();
  const rawHours = Math.ceil(diffMs / (1000 * 60 * 60));

  return clamp(rawHours, CONFIG.minHoursAhead, CONFIG.maxHoursAhead);
}
