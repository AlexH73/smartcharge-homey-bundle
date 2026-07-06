/**
 * Normalizes names for loose Homey device matching.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeName(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Rounds a number up to the next given step.
 *
 * @param {number} value
 * @param {number} step
 * @returns {number}
 */
function roundUp(value, step) {
  return Math.ceil(value / step) * step;
}

/**
 * Restricts a number to the given min/max range.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts a Homey Logic value to number.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function toNumberValue(value, name) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    throw new Error(`${name} is not numeric: ${value}`);
  }

  return number;
}
