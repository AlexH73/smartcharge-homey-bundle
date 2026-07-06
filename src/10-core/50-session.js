/**
 * Checks whether charging session target departure is already in the past.
 *
 * @param {Date} now
 * @param {Date} targetDeparture
 * @param {number} battery
 * @returns {boolean}
 */
function isChargingSessionExpired(now, targetDeparture, battery) {
  return targetDeparture < now && battery < CONFIG.batteryFullPercentage;
}

/**
 * Returns reason for expired charging session.
 *
 * @returns {string}
 */
function getExpiredSessionReason() {
  return 'Session expired: target departure is in the past';
}
