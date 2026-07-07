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
