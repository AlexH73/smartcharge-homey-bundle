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