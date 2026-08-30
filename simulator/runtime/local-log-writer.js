const fs = require('fs');
const path = require('path');

const LOG_COLUMNS = Object.freeze([
  'receivedAt',
  'schemaVersion',
  'eventType',
  'reasonCode',
  'sessionId',
  'loggedAt',
  'batteryPct',
  'targetBatteryPct',
  'missingBatteryPct',
  'connectedAt',
  'targetDeparture',
  'chargeFactor',
  'chargeReservePct',
  'chargeMinutes',
  'chargeSlots',
  'chargeHoursAhead',
  'currentPriceEurKwh',
  'avgPlanPriceEurKwh',
  'totalPlanPrice',
  'selectedAvgPriceEurKwh',
  'selectedTotalPrice',
  'baselineAvgPriceEurKwh',
  'baselineTotalPrice',
  'estimatedSavingsEur',
  'estimatedSavingsPct',
  'priceCount',
  'plannerMode',
  'plannerVersion',
  'windowCount',
  'plannedStart',
  'plannedEnd',
  'chargeWindowsText',
  'chargeWindowsJson',
  'shouldChargeNow',
  'decisionSource',
  'plugOn',
  'plugPowerW',
  'reason',
  'source',
  'engineVersion',
  'detailsJson',
  'estimatedSelectedCostEur',
  'estimatedBaselineCostEur',
  'allocatedChargeMinutes',
  'baselineAllocatedMinutes',
  'chargingPowerKw',
  'baselineAllocationComplete',
  'baselineIncompleteReason',
]);

class LocalLogWriter {
  constructor(logDir) {
    this.logDir = logDir;
    this.jsonlPath = path.join(logDir, 'events.jsonl');
    this.csvPath = path.join(logDir, 'events.csv');
    this.htmlPath = path.join(logDir, 'events.html');
    this.events = [];
  }

  reset() {
    fs.mkdirSync(this.logDir, { recursive: true });
    fs.writeFileSync(this.jsonlPath, '', 'utf8');
    fs.writeFileSync(this.csvPath, `${LOG_COLUMNS.join(',')}\n`, 'utf8');
    this.events = [];
    this.writeHtml();
  }

  append({ scenario, flow, payload }) {
    const receivedAt = new Date().toISOString();
    const event = {
      receivedAt,
      scenario,
      flow,
      ...payload,
    };
    const tableRow = toTableRow(event);

    this.events.push(event);

    fs.appendFileSync(this.jsonlPath, `${JSON.stringify(event)}\n`, 'utf8');
    fs.appendFileSync(
      this.csvPath,
      `${LOG_COLUMNS.map((column) => csvEscape(tableRow[column])).join(',')}\n`,
      'utf8',
    );
    this.writeHtml();

    return event;
  }

  snapshot() {
    return this.events.slice();
  }

  writeHtml() {
    const rows = this.events.map(toTableRow);
    fs.writeFileSync(this.htmlPath, buildHtmlReport(rows), 'utf8');
  }
}

function toTableRow(event) {
  return {
    receivedAt: event.receivedAt,
    schemaVersion: event.schemaVersion,
    eventType: event.eventType,
    reasonCode: event.reasonCode,
    sessionId: event.sessionId,
    loggedAt: event.loggedAt,
    batteryPct: event.battery,
    targetBatteryPct: event.targetBattery,
    missingBatteryPct: event.missingBatteryPercent,
    connectedAt: event.connectedAt,
    targetDeparture: event.targetDeparture,
    chargeFactor: event.chargeFactor,
    chargeReservePct: event.chargeReserve,
    chargeMinutes: event.chargeMinutes,
    chargeSlots: event.chargeSlots,
    chargeHoursAhead: event.chargeHoursAhead,
    currentPriceEurKwh: event.currentPrice,
    avgPlanPriceEurKwh: event.averagePrice,
    totalPlanPrice: event.totalPrice,
    selectedAvgPriceEurKwh: event.selectedAveragePrice,
    selectedTotalPrice: event.selectedTotalPrice,
    baselineAvgPriceEurKwh: event.baselineAveragePrice,
    baselineTotalPrice: event.baselineTotalPrice,
    estimatedSavingsEur: event.estimatedSavingsEur,
    estimatedSavingsPct: event.estimatedSavingsPct,
    priceCount: event.priceCount,
    plannerMode: event.plannerMode,
    plannerVersion: event.plannerVersion,
    windowCount: event.windowCount,
    plannedStart: event.plannedStart,
    plannedEnd: event.plannedEnd,
    chargeWindowsText: event.chargeWindowsText,
    chargeWindowsJson: event.chargeWindowsJson,
    shouldChargeNow: event.shouldChargeNow,
    decisionSource: event.decisionSource,
    plugOn: event.plugOn,
    plugPowerW: event.plugPower,
    reason: event.reason,
    source: event.source,
    engineVersion: event.engineVersion,
    estimatedSelectedCostEur: event.estimatedSelectedCostEur,
    estimatedBaselineCostEur: event.estimatedBaselineCostEur,
    allocatedChargeMinutes: event.allocatedChargeMinutes,
    baselineAllocatedMinutes: event.baselineAllocatedMinutes,
    chargingPowerKw: event.chargingPowerKw,
    baselineAllocationComplete: event.baselineAllocationComplete,
    baselineIncompleteReason: event.baselineIncompleteReason,
    detailsJson: JSON.stringify({
      scenario: event.scenario,
      flow: event.flow,
      message: event.message,
    }),
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildHtmlReport(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SmartCharge Simulator Events</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f172a;
      --fg: #e5e7eb;
      --muted: #94a3b8;
      --header-bg: #1e293b;
      --header-fg: #f8fafc;
      --border: #334155;
      --row-alt: rgba(148, 163, 184, 0.08);
      --row-hover: rgba(59, 130, 246, 0.18);
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: Segoe UI, Arial, sans-serif;
      font-size: 13px;
    }

    main {
      padding: 16px;
    }

    h1 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 650;
    }

    .meta {
      margin: 0 0 14px;
      color: var(--muted);
    }

    .table-wrap {
      height: calc(100vh - 88px);
      overflow: auto;
      border: 1px solid var(--border);
    }

    table {
      border-collapse: separate;
      border-spacing: 0;
      min-width: 2200px;
      width: max-content;
    }

    th,
    td {
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 7px 9px;
      max-width: 320px;
      vertical-align: top;
      white-space: nowrap;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--header-bg);
      color: var(--header-fg);
      font-weight: 700;
      box-shadow: 0 2px 0 var(--border);
    }

    tr:nth-child(even) td {
      background: var(--row-alt);
    }

    tr:hover td {
      background: var(--row-hover);
    }

    td.reason,
    td.chargeWindowsText,
    td.chargeWindowsJson,
    td.detailsJson {
      white-space: normal;
      min-width: 280px;
    }
  </style>
</head>
<body>
  <main>
    <h1>SmartCharge Simulator Events</h1>
    <p class="meta">Generated at ${escapeHtml(new Date().toISOString())}. Rows: ${rows.length}.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${LOG_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => buildHtmlRow(row)).join('\n          ')}
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>
`;
}

function buildHtmlRow(row) {
  return `<tr>${LOG_COLUMNS.map((column) => {
    const className = [
      'reason',
      'chargeWindowsText',
      'chargeWindowsJson',
      'detailsJson',
    ].includes(column)
      ? ` class="${column}"`
      : '';

    return `<td${className}>${escapeHtml(row[column])}</td>`;
  }).join('')}</tr>`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  LocalLogWriter,
  LOG_COLUMNS,
};
