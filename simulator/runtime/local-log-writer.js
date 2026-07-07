const fs = require('fs');
const path = require('path');

const LOG_COLUMNS = Object.freeze([
  'scenario',
  'flow',
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

class LocalLogWriter {
  constructor(logDir) {
    this.logDir = logDir;
    this.jsonlPath = path.join(logDir, 'events.jsonl');
    this.csvPath = path.join(logDir, 'events.csv');
    this.events = [];
  }

  reset() {
    fs.mkdirSync(this.logDir, { recursive: true });
    fs.writeFileSync(this.jsonlPath, '', 'utf8');
    fs.writeFileSync(this.csvPath, `${LOG_COLUMNS.join(',')}\n`, 'utf8');
    this.events = [];
  }

  append({ scenario, flow, payload }) {
    const event = {
      scenario,
      flow,
      ...payload,
    };

    this.events.push(event);

    fs.appendFileSync(this.jsonlPath, `${JSON.stringify(event)}\n`, 'utf8');
    fs.appendFileSync(
      this.csvPath,
      `${LOG_COLUMNS.map((column) => csvEscape(event[column])).join(',')}\n`,
      'utf8',
    );

    return event;
  }

  snapshot() {
    return this.events.slice();
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

module.exports = {
  LocalLogWriter,
  LOG_COLUMNS,
};
