/**
 * SmartCharge Google Apps Script webhook template.
 *
 * Spreadsheet ID is read from Apps Script Project Settings:
 *   Script properties -> SPREADSHEET_ID
 *
 * Do not paste private webhook URLs, tokens, email addresses, or real event
 * logs into this repository.
 */

const SMARTCHARGE_CONFIG = {
  SPREADSHEET_ID: PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID'),

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
  'plannerMode',
  'windowCount',
  'chargeWindowsText',
  'chargeWindowsJson',
];

const EVENT_FIELD_BY_HEADER = {
  eventType: 'eventType',
  sessionId: 'sessionId',
  loggedAt: 'loggedAt',
  'battery_%': 'battery',
  currentPrice_EUR_per_kWh: 'currentPrice',
  chargeMinutes_min: 'chargeMinutes',
  chargeSlots: 'chargeSlots',
  chargeHoursAhead_h: 'chargeHoursAhead',
  connectedAt: 'connectedAt',
  targetDeparture: 'targetDeparture',
  plannedStart: 'plannedStart',
  plannedEnd: 'plannedEnd',
  shouldChargeNow: 'shouldChargeNow',
  plugOn: 'plugOn',
  plugPower_W: 'plugPower',
  reason: 'reason',
  averagePrice_EUR_per_kWh: 'averagePrice',
  totalPrice_EUR: 'totalPrice',
  priceCount: 'priceCount',
  source: 'source',
  engineVersion: 'engineVersion',
  plannerMode: 'plannerMode',
  windowCount: 'windowCount',
  chargeWindowsText: 'chargeWindowsText',
  chargeWindowsJson: 'chargeWindowsJson',
};

function setupSmartChargeWorkbook() {
  const ss = openSmartChargeSpreadsheet();

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
  const ss = openSmartChargeSpreadsheet();

  const sheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.EVENTS_SHEET_NAME,
    EVENT_HEADERS,
  );

  const data = e && e.postData && e.postData.contents
    ? JSON.parse(e.postData.contents)
    : { eventType: 'manual_test', reason: 'doPost called without postData' };

  sheet.appendRow(buildEventRow(sheet, data));

  return ContentService.createTextOutput('OK');
}

function openSmartChargeSpreadsheet() {
  const spreadsheetId = SMARTCHARGE_CONFIG.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error(
      'Missing SPREADSHEET_ID script property. ' +
      'Open Apps Script Project Settings and add SPREADSHEET_ID.',
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function ensureSheet(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    appendMissingHeaders(sheet, headers);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function appendMissingHeaders(sheet, headers) {
  const existingHeaders = getHeaderValues(sheet);

  const missingHeaders = headers.filter((header) =>
    !existingHeaders.includes(header),
  );

  if (missingHeaders.length === 0) return;

  sheet
    .getRange(1, sheet.getLastColumn() + 1, 1, missingHeaders.length)
    .setValues([missingHeaders]);
}

function buildEventRow(sheet, data) {
  return getHeaderValues(sheet).map((header) => eventCell(header, data));
}

function eventCell(header, data) {
  if (header === 'receivedAt') return new Date();
  if (header === 'detailsJson') return JSON.stringify(data, null, 0);

  const fieldName = EVENT_FIELD_BY_HEADER[header] || header;
  return cell(data[fieldName]);
}

function getHeaderValues(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((header) => String(header || '').trim());
}

function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}
