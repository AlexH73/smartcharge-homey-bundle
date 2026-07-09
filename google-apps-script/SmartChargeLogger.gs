/**
 * SmartCharge Google Apps Script webhook template.
 *
 * Replace YOUR_GOOGLE_SHEET_ID before deploying this as a Web app.
 * Do not paste private webhook URLs, tokens, email addresses, or real event
 * logs into this repository.
 */

const SMARTCHARGE_CONFIG = {
  SPREADSHEET_ID: 'YOUR_GOOGLE_SHEET_ID',
  EVENTS_SHEET_NAME: 'Events',
  SESSIONS_SHEET_NAME: 'Sessions',
  STATISTICS_SHEET_NAME: 'Statistics',
  PUBLIC_DASHBOARD_SHEET_NAME: 'Public Dashboard',
};

const EVENT_HEADERS = [
  'receivedAt',
  'eventType',
  'sessionId',
  'loggedAt',
  'battery_%',
  'currentPrice_EUR_per_kWh',
  'chargeMinutes_min',
  'chargeSlots',
  'chargeHoursAhead_h',
  'connectedAt',
  'targetDeparture',
  'plannedStart',
  'plannedEnd',
  'shouldChargeNow',
  'plugOn',
  'plugPower_W',
  'reason',
  'averagePrice_EUR_per_kWh',
  'totalPrice_EUR',
  'priceCount',
  'source',
  'engineVersion',
  'detailsJson',
];

function setupSmartChargeWorkbook() {
  const ss = SpreadsheetApp.openById(SMARTCHARGE_CONFIG.SPREADSHEET_ID);

  ensureSheet(ss, SMARTCHARGE_CONFIG.EVENTS_SHEET_NAME, EVENT_HEADERS);
  ensureSheet(ss, SMARTCHARGE_CONFIG.SESSIONS_SHEET_NAME, [
    'sessionId',
    'connectedAt',
    'disconnectedAt',
    'startBattery_%',
    'endBattery_%',
    'chargeMinutes_min',
    'estimatedCost_EUR',
    'notes',
  ]);
  ensureSheet(ss, SMARTCHARGE_CONFIG.STATISTICS_SHEET_NAME, [
    'metric',
    'value',
    'updatedAt',
  ]);
  ensureSheet(ss, SMARTCHARGE_CONFIG.PUBLIC_DASHBOARD_SHEET_NAME, [
    'label',
    'value',
    'updatedAt',
  ]);

  return 'SmartCharge workbook setup complete';
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SMARTCHARGE_CONFIG.SPREADSHEET_ID);
  const sheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.EVENTS_SHEET_NAME,
    EVENT_HEADERS,
  );

  const data = e && e.postData && e.postData.contents
    ? JSON.parse(e.postData.contents)
    : { eventType: 'manual_test', reason: 'doPost called without postData' };

  sheet.appendRow([
    new Date(),
    cell(data.eventType),
    cell(data.sessionId),
    cell(data.loggedAt),

    cell(data.battery),
    cell(data.currentPrice),

    cell(data.chargeMinutes),
    cell(data.chargeSlots),
    cell(data.chargeHoursAhead),

    cell(data.connectedAt),
    cell(data.targetDeparture),

    cell(data.plannedStart),
    cell(data.plannedEnd),

    cell(data.shouldChargeNow),

    cell(data.plugOn),
    cell(data.plugPower),

    cell(data.reason),

    cell(data.averagePrice),
    cell(data.totalPrice),

    cell(data.priceCount),

    cell(data.source),
    cell(data.engineVersion),

    JSON.stringify(data, null, 0),
  ]);

  return ContentService.createTextOutput('OK');
}

function ensureSheet(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}
