// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY IN HOMEY.
// Source: smartcharge-homey-bundle
// Target: start-session
// Version: 0.3.35+build.35
// Built at: 2026-07-07T11:12:58.561Z

// -----------------------------------------------------------------------------
// Source file: src/00-config/00-build-info.generated.js
// -----------------------------------------------------------------------------

/**
 * Auto-generated build information.
 * Do not edit manually.
 */
const BUILD_INFO = Object.freeze({
  version: '0.3.35',
  fullVersion: '0.3.35+build.35',
  build: 35,
  builtAt: '2026-07-07T11:12:58.561Z',
});


// -----------------------------------------------------------------------------
// Source file: src/00-config/10-config.js
// -----------------------------------------------------------------------------

/**
 * Runtime configuration for SmartCharge HomeyScript.
 *
 * This file contains only constants and naming conventions.
 * It must be loaded before all modules that use CONFIG.
 */
const CONFIG = {
  timeZone: 'Europe/Berlin',

  tibberAccessTokenVariableName: 'TIBBER_ACCESS_TOKEN',

  mercedesDeviceNameIncludes: 'E 300',
  plugDeviceNameIncludes: 'Auto Plug In',

  chargeConnectedAtVariableName: 'ChargeConnectedAt',
  chargeFactorVariableName: 'ChargeFactor',
  chargeReserveVariableName: 'ChargeReserve',

  chargeMinutesVariableName: 'ChargeMinutes',
  chargeSlotsVariableName: 'ChargeSlots',
  legacyChargeQuartersVariableName: 'ChargeQuarters',
  chargeHoursAheadVariableName: 'ChargeHoursAhead',

  smartChargePlannedStartVariableName: 'SmartChargePlannedStart',
  smartChargePlannedEndVariableName: 'SmartChargePlannedEnd',
  smartChargeShouldChargeVariableName: 'SmartChargeShouldCharge',
  smartChargeReasonVariableName: 'SmartChargeReason',
  smartChargeTargetDepartureVariableName: 'SmartChargeTargetDeparture',
  smartChargeSessionStatusVariableName: 'SmartChargeSessionStatus',

  workdayDepartureHour: 7,
  workdayDepartureMinute: 30,
  weekendDepartureHour: 13,
  weekendDepartureMinute: 0,

  roundToMinutes: 5,
  minChargeMinutes: 30,
  maxChargeMinutes: 300,
  minHoursAhead: 1,
  maxHoursAhead: 24,

  batteryFullPercentage: 100,
  priceSlotMinutes: 60,

  tibberApiUrl: 'https://api.tibber.com/v1-beta/gql',
};

/**
 * Tibber GraphQL query for current, today and tomorrow prices.
 */
const TIBBER_PRICE_INFO_QUERY = `
{
  viewer {
    homes {
      currentSubscription {
        priceInfo {
          current {
            total
            startsAt
          }
          today {
            total
            startsAt
          }
          tomorrow {
            total
            startsAt
          }
        }
      }
    }
  }
}
`;


// -----------------------------------------------------------------------------
// Source file: src/10-core/00-utils.js
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// Source file: src/10-core/10-time.js
// -----------------------------------------------------------------------------

/**
 * Adds minutes to a Date.
 *
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Parses SmartCharge datetime value or returns fallback when missing/invalid.
 *
 * Supported formats:
 *  - SmartCharge local format: YYYY-MM-DD HH:mm:ss
 *  - ISO datetime string
 *
 * Local SmartCharge strings are interpreted in CONFIG.timeZone.
 *
 * @param {unknown} value
 * @param {Date} fallbackDate
 * @returns {Date}
 */
function parseDateOrFallback(value, fallbackDate) {
  if (!value || value === 'null') {
    return fallbackDate;
  }

  if (typeof value !== 'string') {
    return fallbackDate;
  }

  const localMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );

  if (localMatch) {
    const [, year, month, day, hour, minute, second] = localMatch;

    return createDateFromLocalParts(
      {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
      },
      CONFIG.timeZone,
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallbackDate;
  }

  return parsed;
}

/**
 * Returns local date/time parts for a given timezone.
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {{year:number,month:number,day:number,hour:number,minute:number,second:number}}
 */
function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Returns weekday in local timezone.
 *
 * Sunday = 0, Monday = 1, ... Saturday = 6.
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
function getLocalDayOfWeek(date, timeZone) {
  const parts = getLocalParts(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * Adds days to local date parts.
 *
 * @param {{year:number,month:number,day:number}} parts
 * @param {number} daysToAdd
 * @returns {{year:number,month:number,day:number}}
 */
function addDaysToLocalDate(parts, daysToAdd) {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + daysToAdd),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Creates a Date from local timezone parts.
 *
 * @param {{year:number,month:number,day:number,hour:number,minute:number,second?:number}} localParts
 * @param {string} timeZone
 * @returns {Date}
 */
function createDateFromLocalParts(localParts, timeZone) {
  const desiredUtc = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second || 0,
  );

  let utc = desiredUtc;

  for (let i = 0; i < 3; i++) {
    const actual = getLocalParts(new Date(utc), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );

    utc -= actualAsUtc - desiredUtc;
  }

  return new Date(utc);
}

/**
 * Calculates the target departure based on connection date and configured schedule.
 *
 * @param {Date} anchorDate
 * @returns {Date}
 */
function getTargetDeparture(anchorDate) {
  const day = getLocalDayOfWeek(anchorDate, CONFIG.timeZone);
  const localAnchor = getLocalParts(anchorDate, CONFIG.timeZone);
  const targetDate = addDaysToLocalDate(localAnchor, 1);

  if (day >= 1 && day <= 4) {
    return createDateFromLocalParts(
      {
        ...targetDate,
        hour: CONFIG.workdayDepartureHour,
        minute: CONFIG.workdayDepartureMinute,
        second: 0,
      },
      CONFIG.timeZone,
    );
  }

  if (day === 5 || day === 6) {
    return createDateFromLocalParts(
      {
        ...targetDate,
        hour: CONFIG.weekendDepartureHour,
        minute: CONFIG.weekendDepartureMinute,
        second: 0,
      },
      CONFIG.timeZone,
    );
  }

  return createDateFromLocalParts(
    {
      ...targetDate,
      hour: CONFIG.workdayDepartureHour,
      minute: CONFIG.workdayDepartureMinute,
      second: 0,
    },
    CONFIG.timeZone,
  );
}

/**
 * Formats a Date as local time string.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatLocal(date) {
  return date.toLocaleString('sv-SE', {
    timeZone: CONFIG.timeZone,
    hour12: false,
  });
}


// -----------------------------------------------------------------------------
// Source file: src/10-core/20-homey-logic.js
// -----------------------------------------------------------------------------

/**
 * Finds a Homey Logic variable by name.
 *
 * @param {string} name
 * @returns {Promise<object>}
 */
async function getVariableByName(name) {
  const variables = await Homey.logic.getVariables();
  const variable = Object.values(variables).find((v) => v.name === name);

  if (!variable) {
    throw new Error(`Logic variable not found: ${name}`);
  }

  return variable;
}

/**
 * Reads a Homey Logic variable value by name.
 *
 * @param {string} name
 * @returns {Promise<unknown>}
 */
async function getVariableValue(name) {
  const variable = await getVariableByName(name);
  return variable.value;
}

/**
 * Updates a Homey Logic variable by name.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function updateVariableByName(name, value) {
  const variable = await getVariableByName(name);

  await Homey.logic.updateVariable({
    id: variable.id,
    variable: { value },
  });
}

/**
 * Updates a Homey Logic variable if it exists.
 * Missing optional variables do not break SmartCharge.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function tryUpdateVariableByName(name, value) {
  try {
    await updateVariableByName(name, value);
  } catch (error) {
    log(`Optional variable not updated: ${name} (${error.message})`);
  }
}


// -----------------------------------------------------------------------------
// Source file: src/10-core/30-charging.js
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// Source file: src/10-core/40-planner.js
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// Source file: src/10-core/50-session.js
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// Source file: src/10-core/60-decision.js
// -----------------------------------------------------------------------------



// -----------------------------------------------------------------------------
// Source file: src/20-adapters/10-tibber.js
// -----------------------------------------------------------------------------

/**
 * Fetches price information from Tibber GraphQL API.
 *
 * @param {string} tibberAccessToken
 * @returns {Promise<object>}
 */
async function fetchTibberPriceInfo(tibberAccessToken) {
  const response = await fetch(CONFIG.tibberApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tibberAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: TIBBER_PRICE_INFO_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Tibber HTTP error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Tibber GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const homes = json?.data?.viewer?.homes || [];
  const priceInfo = homes[0]?.currentSubscription?.priceInfo;

  if (!priceInfo) {
    throw new Error('Tibber priceInfo not found');
  }

  return priceInfo;
}

/**
 * Converts Tibber priceInfo into sorted hourly price slots.
 *
 * @param {object} priceInfo
 * @returns {Array<{startsAt:string,startTime:Date,price:number,total:number,sourceDay:string}>}
 */
function normalizeTibberPrices(priceInfo) {
  const result = [];

  for (const [sourceDay, entries] of [
    ['today', priceInfo.today || []],
    ['tomorrow', priceInfo.tomorrow || []],
  ]) {
    for (const entry of entries) {
      if (!entry || !entry.startsAt || typeof entry.total !== 'number') {
        continue;
      }

      const startTime = new Date(entry.startsAt);

      if (Number.isNaN(startTime.getTime())) {
        continue;
      }

      result.push({
        startsAt: entry.startsAt,
        startTime,
        price: entry.total,
        total: entry.total,
        sourceDay,
      });
    }
  }

  return result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}


// -----------------------------------------------------------------------------
// Source file: src/20-adapters/20-homey-devices.js
// -----------------------------------------------------------------------------

/**
 * Finds a Homey device by partial name match.
 *
 * @param {string} namePart
 * @returns {Promise<object>}
 */
async function getDeviceByNamePart(namePart) {
  const devices = await Homey.devices.getDevices();
  const normalizedNamePart = normalizeName(namePart);

  const device = Object.values(devices).find((d) =>
    normalizeName(d.name).includes(normalizedNamePart),
  );

  if (!device) {
    throw new Error(`Device not found: ${namePart}`);
  }

  return device;
}

/**
 * Switches a Homey device on.
 *
 * @param {object} device
 * @returns {Promise<void>}
 */
async function setDeviceOn(device) {
  await device.setCapabilityValue('onoff', true);
}


// -----------------------------------------------------------------------------
// Source file: src/20-adapters/30-google-sheets.js
// -----------------------------------------------------------------------------



// -----------------------------------------------------------------------------
// Source file: src/20-adapters/40-homey.js
// -----------------------------------------------------------------------------



// -----------------------------------------------------------------------------
// Source file: src/30-logger/10-smartcharge-logger.js
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// SmartCharge logger helper for HomeyScript.
// -----------------------------------------------------------------------------

const SmartChargeLogger = (() => {
  const EVENT_TYPES = Object.freeze({
    SESSION_START: 'session_start',
    SESSION_RESET: 'session_reset',
    SESSION_EXPIRED: 'session_expired',

    SMARTCHARGE_DECISION: 'smartcharge_decision',
    SMARTCHARGE_ON: 'smartcharge_on',
    SMARTCHARGE_OFF: 'smartcharge_off',

    BATTERY_FULL: 'battery_full',
    CHARGER_DISCONNECTED: 'charger_disconnected',
    SMARTCHARGE_ERROR: 'smartcharge_error',
  });

  const SUPPORTED_EVENT_TYPES = Object.freeze(Object.values(EVENT_TYPES));

  const CRITICAL_EVENT_TYPES = Object.freeze([
    EVENT_TYPES.SESSION_START,
    EVENT_TYPES.SESSION_RESET,
    EVENT_TYPES.SESSION_EXPIRED,
    EVENT_TYPES.SMARTCHARGE_ON,
    EVENT_TYPES.SMARTCHARGE_OFF,
    EVENT_TYPES.BATTERY_FULL,
    EVENT_TYPES.CHARGER_DISCONNECTED,
    EVENT_TYPES.SMARTCHARGE_ERROR,
  ]);

  const LOGIC_VARIABLE_NAMES = Object.freeze({
    WEBHOOK_URL: 'SMARTCHARGE_LOG_WEBHOOK_URL',
    LAST_LOG_KEY: 'SmartChargeLastLogKey',
  });

  const LOG_RESULT_REASONS = Object.freeze({
    WRITTEN: 'Log written',
    SKIPPED_UNCHANGED: 'Log key unchanged',
  });

  const DECISION_LOG_KEY_FIELDS = Object.freeze([
    'eventType',
    'battery',
    'currentPrice',
    'connectedAt',
    'targetDeparture',
    'chargeMinutes',
    'chargeSlots',
    'shouldChargeNow',
    'plannedStart',
    'plannedEnd',
    'reason',
    'plugOn',
    'plugPower',
    'totalPrice',
    'averagePrice',
  ]);

  const GOOGLE_SHEETS_PAYLOAD_FIELDS = Object.freeze([
    'eventType',
    'sessionId',
    'loggedAt',

    'battery',
    'currentPrice',

    'chargeMinutes',
    'chargeSlots',
    'chargeHoursAhead',

    'connectedAt',
    'targetDeparture',

    'plannedStart',
    'plannedEnd',

    'shouldChargeNow',

    'plugOn',
    'plugPower',

    'reason',

    'averagePrice',
    'totalPrice',

    'priceCount',

    'source',
    'engineVersion',

    'message',
  ]);

  /**
   * Ensures that a value is an object.
   *
   * @param {unknown} value
   * @param {string} name
   * @returns {void}
   */
  function assertObject(value, name) {
    if (!value || typeof value !== 'object') {
      throw new TypeError(`${name} must be an object`);
    }
  }

  /**
   * Validates SmartCharge event type.
   *
   * @param {string} eventType
   * @returns {void}
   */
  function assertEventType(eventType) {
    if (!SUPPORTED_EVENT_TYPES.includes(eventType)) {
      throw new RangeError(`Unsupported log event type: ${eventType}`);
    }
  }

  /**
   * Extracts and validates event type from string or log event object.
   *
   * @param {string|object} logEventOrType
   * @returns {string}
   */
  function normalizeEventType(logEventOrType) {
    if (typeof logEventOrType === 'string') {
      assertEventType(logEventOrType);
      return logEventOrType;
    }

    assertObject(logEventOrType, 'logEvent');

    const eventType = logEventOrType.eventType || logEventOrType.type;
    assertEventType(eventType);

    return eventType;
  }

  /**
   * Converts Date values to ISO strings.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  function normalizeDateLike(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    return value;
  }

  /**
   * Normalizes values for Google Sheets payload.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  function normalizeValue(value) {
    const normalized = normalizeDateLike(value);

    if (normalized === undefined || normalized === '') {
      return null;
    }

    if (typeof normalized === 'number' && !Number.isFinite(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Normalizes a SmartCharge log event.
   *
   * @param {object} logEvent
   * @returns {object}
   */
  function normalizeLogEvent(logEvent) {
    assertObject(logEvent, 'logEvent');

    const eventType = normalizeEventType(logEvent);

    return {
      ...logEvent,

      eventType,
      sessionId: normalizeValue(logEvent.sessionId),
      loggedAt: normalizeValue(logEvent.loggedAt),

      battery: normalizeValue(logEvent.battery),
      currentPrice: normalizeValue(logEvent.currentPrice),

      connectedAt: normalizeValue(logEvent.connectedAt),
      targetDeparture: normalizeValue(logEvent.targetDeparture),

      chargeMinutes: normalizeValue(logEvent.chargeMinutes),
      chargeQuarters: normalizeValue(logEvent.chargeQuarters),
      chargeSlots: normalizeValue(logEvent.chargeSlots),
      chargeHoursAhead: normalizeValue(logEvent.chargeHoursAhead),

      shouldChargeNow: normalizeValue(logEvent.shouldChargeNow),

      plannedStart: normalizeValue(logEvent.plannedStart),
      plannedEnd: normalizeValue(logEvent.plannedEnd),

      plugOn: normalizeValue(logEvent.plugOn),
      plugPower: normalizeValue(logEvent.plugPower),

      reason: normalizeValue(logEvent.reason),

      totalPrice: normalizeValue(logEvent.totalPrice),
      averagePrice: normalizeValue(logEvent.averagePrice),
      priceCount: normalizeValue(logEvent.priceCount),

      source: normalizeValue(logEvent.source || 'smartcharge-engine'),
      engineVersion: normalizeValue(logEvent.engineVersion),
      message: normalizeValue(logEvent.message),
    };
  }

  /**
   * Formats a value for log key generation.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function formatKeyValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  }

  /**
   * Builds a stable key used to suppress duplicate decision logs.
   *
   * @param {object} logEvent
   * @returns {string}
   */
  function buildLogKey(logEvent) {
    const event = normalizeLogEvent(logEvent);

    return DECISION_LOG_KEY_FIELDS.map(
      (field) => `${field}=${formatKeyValue(event[field])}`,
    ).join('|');
  }

  /**
   * Checks whether event type is critical and must always be written.
   *
   * @param {string|object} eventType
   * @returns {boolean}
   */
  function isCriticalEvent(eventType) {
    const normalizedEventType = normalizeEventType(eventType);
    return CRITICAL_EVENT_TYPES.includes(normalizedEventType);
  }

  /**
   * Decides whether the log should be written.
   *
   * @param {string|null} previousKey
   * @param {string} currentKey
   * @param {string} eventType
   * @returns {boolean}
   */
  function shouldWriteLog(previousKey, currentKey, eventType) {
    const normalizedEventType = normalizeEventType(eventType);

    if (isCriticalEvent(normalizedEventType)) {
      return true;
    }

    if (normalizedEventType === EVENT_TYPES.SMARTCHARGE_DECISION) {
      return formatKeyValue(previousKey) !== formatKeyValue(currentKey);
    }

    return false;
  }

  /**
   * Resolves loggedAt value.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function toLoggedAt(value) {
    const normalized = normalizeDateLike(value || new Date());

    if (!normalized) {
      return new Date().toISOString();
    }

    return String(normalized);
  }

  /**
   * Creates Google Sheets payload with a stable field order.
   *
   * @param {object} logEvent
   * @param {object} [options]
   * @returns {object}
   */
  function prepareGoogleSheetsPayload(logEvent, options = {}) {
    const event = normalizeLogEvent(logEvent);
    const loggedAt = toLoggedAt(
      options.loggedAt || event.loggedAt || event.timestamp,
    );

    const payload = {
      ...event,
      loggedAt,
      logKey: options.logKey || buildLogKey(event),
    };

    return GOOGLE_SHEETS_PAYLOAD_FIELDS.reduce((result, field) => {
      result[field] = normalizeValue(payload[field]);
      return result;
    }, {});
  }

  function getGlobalFetch() {
    if (typeof fetch === 'function') {
      return fetch;
    }

    return null;
  }

  function resolveFetch(fetchImpl) {
    const resolvedFetch = fetchImpl || getGlobalFetch();

    if (typeof resolvedFetch !== 'function') {
      throw new Error('fetch is not available');
    }

    return resolvedFetch;
  }

  function assertWebhookUrl(webhookUrl) {
    if (
      typeof webhookUrl !== 'string' ||
      webhookUrl.trim().length === 0 ||
      webhookUrl === 'null'
    ) {
      throw new Error('Google Sheets webhook URL is missing');
    }

    return webhookUrl.trim();
  }

  /**
   * Sends prepared payload to Google Sheets webhook.
   *
   * @param {string} webhookUrl
   * @param {object} payload
   * @param {object} [options]
   * @returns {Promise<{ok:boolean,status:number}>}
   */
  async function postGoogleSheetsLog(webhookUrl, payload, options = {}) {
    const resolvedWebhookUrl = assertWebhookUrl(webhookUrl);
    const fetchImpl = resolveFetch(options.fetch);

    const response = await fetchImpl(resolvedWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response || !response.ok) {
      const status = response ? response.status : 'unknown';
      throw new Error(`Google Sheets webhook error: ${status}`);
    }

    return {
      ok: true,
      status: response.status,
    };
  }

  function resolveHomey(options = {}) {
    if (options.homey) {
      return options.homey;
    }

    if (typeof Homey !== 'undefined') {
      return Homey;
    }

    return null;
  }

  async function getHomeyLogicVariable(name, options = {}) {
    const homey = resolveHomey(options);

    if (
      !homey ||
      !homey.logic ||
      typeof homey.logic.getVariables !== 'function'
    ) {
      throw new Error('Homey logic API is not available');
    }

    const variables = await homey.logic.getVariables();
    const variable = Object.values(variables).find(
      (item) => item.name === name,
    );

    if (!variable) {
      throw new Error(`Logic variable not found: ${name}`);
    }

    return {
      homey,
      variable,
    };
  }

  async function getLogicVariableValue(name, options = {}) {
    if (typeof options.getLogicVariableValue === 'function') {
      return options.getLogicVariableValue(name);
    }

    if (
      options.logicVariables &&
      Object.prototype.hasOwnProperty.call(options.logicVariables, name)
    ) {
      return options.logicVariables[name];
    }

    const { variable } = await getHomeyLogicVariable(name, options);
    return variable.value;
  }

  async function updateLogicVariableValue(name, value, options = {}) {
    if (typeof options.updateLogicVariableValue === 'function') {
      await options.updateLogicVariableValue(name, value);
      return value;
    }

    if (
      options.logicVariables &&
      Object.prototype.hasOwnProperty.call(options.logicVariables, name)
    ) {
      options.logicVariables[name] = value;
      return value;
    }

    const { homey, variable } = await getHomeyLogicVariable(name, options);

    await homey.logic.updateVariable({
      id: variable.id,
      variable: { value },
    });

    return value;
  }

  async function getPreviousLogKey(eventType, options = {}) {
    if (options.previousKey !== undefined) {
      return options.previousKey;
    }

    if (eventType !== EVENT_TYPES.SMARTCHARGE_DECISION) {
      return null;
    }

    return getLogicVariableValue(LOGIC_VARIABLE_NAMES.LAST_LOG_KEY, options);
  }

  async function getWebhookUrl(options = {}) {
    if (options.webhookUrl !== undefined) {
      return options.webhookUrl;
    }

    return getLogicVariableValue(LOGIC_VARIABLE_NAMES.WEBHOOK_URL, options);
  }

  /**
   * Main logger entry point.
   *
   * Writes a SmartCharge event to Google Sheets.
   * Decision events are deduplicated by log key.
   * Critical lifecycle events are always written.
   *
   * @param {object} logEvent
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async function logToGoogleSheets(logEvent, options = {}) {
    const eventType = normalizeEventType(logEvent);
    const currentKey = buildLogKey(logEvent);
    const previousKey = await getPreviousLogKey(eventType, options);
    const shouldWrite = shouldWriteLog(previousKey, currentKey, eventType);

    const payload = prepareGoogleSheetsPayload(logEvent, {
      ...options,
      logKey: currentKey,
    });

    if (!shouldWrite) {
      return {
        written: false,
        reason: LOG_RESULT_REASONS.SKIPPED_UNCHANGED,
        previousKey: normalizeValue(previousKey),
        currentKey,
        payload,
      };
    }

    const webhookUrl = await getWebhookUrl(options);

    const postResult =
      typeof options.postGoogleSheetsLog === 'function'
        ? await options.postGoogleSheetsLog(webhookUrl, payload, options)
        : await postGoogleSheetsLog(webhookUrl, payload, options);

    if (eventType === EVENT_TYPES.SMARTCHARGE_DECISION) {
      await updateLogicVariableValue(
        LOGIC_VARIABLE_NAMES.LAST_LOG_KEY,
        currentKey,
        options,
      );
    }

    return {
      written: true,
      reason: LOG_RESULT_REASONS.WRITTEN,
      previousKey: normalizeValue(previousKey),
      currentKey,
      payload,
      postResult,
    };
  }

  /**
   * Writes a lifecycle event to Google Sheets.
   *
   * This helper automatically collects the current SmartCharge runtime state:
   *  - sessionId / connectedAt
   *  - battery
   *  - plug state
   *  - plug power
   *
   * It is intended for:
   *  - session_start
   *  - session_reset
   *  - smartcharge_on
   *  - smartcharge_off
   *  - battery_full
   *  - charger_disconnected
   *
   * @param {object} options
   * @param {string} options.eventType
   * @param {string} options.reason
   * @param {string|null} [options.message]
   * @param {string} [options.source]
   * @param {number|null} [options.currentPrice]
   * @returns {Promise<object>}
   */
  async function logLifecycleEvent({
    eventType,
    reason,
    message = null,
    source = 'smartcharge-runtime',
    currentPrice = null,
  }) {
    const now = new Date();

    const mercedes = await getDeviceByNamePart(
      CONFIG.mercedesDeviceNameIncludes,
    );

    const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);

    const battery = mercedes.capabilitiesObj.measure_battery?.value ?? null;
    const plugOn = plug.capabilitiesObj.onoff?.value ?? null;
    const plugPower = plug.capabilitiesObj.measure_power?.value ?? null;

    const connectedAtRaw = await getVariableValue(
      CONFIG.chargeConnectedAtVariableName,
    );

    const hasActiveSession = connectedAtRaw && connectedAtRaw !== 'null';

    const sessionId = hasActiveSession ? connectedAtRaw : formatLocal(now);

    const connectedAt = hasActiveSession ? connectedAtRaw : null;

    return logToGoogleSheets(
      {
        eventType,

        sessionId,
        loggedAt: now,

        battery,
        currentPrice,

        connectedAt,
        targetDeparture: null,

        chargeMinutes: null,
        chargeSlots: null,
        chargeHoursAhead: null,

        plannedStart: null,
        plannedEnd: null,

        shouldChargeNow: false,

        plugOn,
        plugPower,

        reason,

        averagePrice: null,
        totalPrice: null,
        priceCount: null,

        source,
        engineVersion: BUILD_INFO.fullVersion,

        message,
      },
      {
        webhookUrl: await getVariableValue(LOGIC_VARIABLE_NAMES.WEBHOOK_URL),
      },
    );
  }

  return {
    CRITICAL_EVENT_TYPES,
    EVENT_TYPES,
    LOGIC_VARIABLE_NAMES,

    buildLogKey,
    logLifecycleEvent,
    logToGoogleSheets,
    prepareGoogleSheetsPayload,
    postGoogleSheetsLog,
    shouldWriteLog,
  };
})();


// -----------------------------------------------------------------------------
// Source file: src/90-flows/start-session.entry.js
// -----------------------------------------------------------------------------

/**
 * Starts a new SmartCharge session.
 *
 * Trigger:
 *   Charging cable was connected.
 *
 * Responsibilities:
 *   - create a new charging session;
 *   - store connection timestamp;
 *   - clear previous charging plan;
 *   - reset SmartCharge runtime state;
 *   - write session_start event to Google Sheets.
 *
 * Does NOT:
 *   - calculate charging plan;
 *   - switch the plug on;
 *   - fetch Tibber prices.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const now = new Date();
  const connectedAt = formatLocal(now);
  const reason = 'Session started';

  await tryUpdateVariableByName(CONFIG.chargeConnectedAtVariableName, connectedAt);
  await tryUpdateVariableByName(CONFIG.smartChargePlannedStartVariableName, 'null');
  await tryUpdateVariableByName(CONFIG.smartChargePlannedEndVariableName, 'null');
  await tryUpdateVariableByName(CONFIG.smartChargeShouldChargeVariableName, false);
  await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);

  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.SESSION_START,
      reason,
      source: 'smartcharge-start-session',
      message: 'Charging cable connected',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('SmartCharge session started');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`SessionId        : ${connectedAt}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    started: true,
    sessionId: connectedAt,
    reason,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();

