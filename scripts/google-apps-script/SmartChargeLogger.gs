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
  'estimatedSavings',
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
];

const SESSION_HEADERS = [
  'sessionId',
  'connectedAt',

  'chargeStartedAt',
  'chargeStoppedAt',
  'resetAt',

  'status',
  'firstDecisionAt',

  'startBatteryPct',
  'endBatteryPct',
  'batteryDeltaPct',

  'targetBatteryPct',
  'missingBatteryPct',

  'plannerMode',
  'plannerVersion',
  'windowCount',
  'plannedStart',
  'plannedEnd',
  'chargeWindowsText',
  'chargeWindowsJson',

  'chargeFactor',
  'chargeReservePct',
  'plannedChargeMinutes',

  'selectedAvgPriceEurKwh',
  'selectedTotalPrice',
  'baselineAvgPriceEurKwh',
  'baselineTotalPrice',
  'estimatedSavings',
  'estimatedSavingsPct',

  'lastReasonCode',
  'lastReason',
  'lastEventType',

  'createdAt',
  'updatedAt',
];

const EVENT_FIELD_BY_HEADER = {
  schemaVersion: 'schemaVersion',
  eventType: 'eventType',
  reasonCode: 'reasonCode',
  sessionId: 'sessionId',
  loggedAt: 'loggedAt',

  batteryPct: 'battery',
  targetBatteryPct: 'targetBattery',
  missingBatteryPct: 'missingBatteryPercent',
  connectedAt: 'connectedAt',
  targetDeparture: 'targetDeparture',

  chargeFactor: 'chargeFactor',
  chargeReservePct: 'chargeReserve',
  chargeMinutes: 'chargeMinutes',
  chargeSlots: 'chargeSlots',
  chargeHoursAhead: 'chargeHoursAhead',

  currentPriceEurKwh: 'currentPrice',
  avgPlanPriceEurKwh: 'averagePrice',
  totalPlanPrice: 'totalPrice',
  selectedAvgPriceEurKwh: 'selectedAveragePrice',
  selectedTotalPrice: 'selectedTotalPrice',
  baselineAvgPriceEurKwh: 'baselineAveragePrice',
  baselineTotalPrice: 'baselineTotalPrice',
  estimatedSavings: 'estimatedSavings',
  estimatedSavingsPct: 'estimatedSavingsPercent',
  priceCount: 'priceCount',

  plannerMode: 'plannerMode',
  plannerVersion: 'plannerVersion',
  windowCount: 'windowCount',
  plannedStart: 'plannedStart',
  plannedEnd: 'plannedEnd',
  chargeWindowsText: 'chargeWindowsText',
  chargeWindowsJson: 'chargeWindowsJson',

  shouldChargeNow: 'shouldChargeNow',
  decisionSource: 'decisionSource',
  plugOn: 'plugOn',
  plugPowerW: 'plugPower',
  reason: 'reason',

  source: 'source',
  engineVersion: 'engineVersion',
};

function setupSmartChargeWorkbook() {
  const ss = openSmartChargeSpreadsheet();

  const eventsSheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.EVENTS_SHEET_NAME,
    EVENT_HEADERS,
  );

  const sessionsSheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.SESSIONS_SHEET_NAME,
    SESSION_HEADERS,
  );

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

  formatEventSheet(eventsSheet);
  formatSessionSheet(sessionsSheet);

  return 'SmartCharge workbook setup complete';
}

function doPost(e) {
  const ss = openSmartChargeSpreadsheet();

  const eventsSheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.EVENTS_SHEET_NAME,
    EVENT_HEADERS,
  );

  formatEventSheet(eventsSheet);

  const data = e && e.postData && e.postData.contents
    ? JSON.parse(e.postData.contents)
    : { eventType: 'manual_test', reason: 'doPost called without postData' };

  eventsSheet.appendRow(buildEventRow(eventsSheet, data));
  upsertSessionFromEvent(ss, data);

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

function upsertSessionFromEvent(ss, event) {
  if (!event || !event.sessionId) return;

  const sheet = ensureSheet(
    ss,
    SMARTCHARGE_CONFIG.SESSIONS_SHEET_NAME,
    SESSION_HEADERS,
  );

  formatSessionSheet(sheet);

  const headers = getHeaderValues(sheet);
  const rowIndex = findSessionRowById(sheet, event.sessionId);
  const now = new Date();

  if (rowIndex === -1) {
    const newRowIndex = sheet.getLastRow() + 1;
    const emptyRow = headers.map(() => '');

    sheet.appendRow(emptyRow);

    writeSessionValues(sheet, headers, newRowIndex, {
      sessionId: event.sessionId,
      status: getSessionStatus(event),
      createdAt: now,
      updatedAt: now,
      ...buildSessionUpdate(event),
    });

    return;
  }

  writeSessionValues(sheet, headers, rowIndex, {
    status: getSessionStatus(event),
    updatedAt: now,
    ...buildSessionUpdate(event),
  });
}

function findSessionRowById(sheet, sessionId) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return -1;

  const headers = getHeaderValues(sheet);
  const sessionIdCol = headers.indexOf('sessionId') + 1;

  if (sessionIdCol < 1) {
    throw new Error('Sessions sheet is missing sessionId column');
  }

  const expectedSessionId = String(sessionId || '').trim();

  const values = sheet
    .getRange(2, sessionIdCol, lastRow - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const currentSessionId = String(values[i][0] || '').trim();

    if (currentSessionId === expectedSessionId) {
      return i + 2;
    }
  }

  return -1;
}

function writeSessionValues(sheet, headers, rowIndex, update) {
  Object.keys(update).forEach((fieldName) => {
    const columnIndex = headers.indexOf(fieldName) + 1;

    if (columnIndex < 1) return;

    sheet.getRange(rowIndex, columnIndex).setValue(cell(update[fieldName]));
  });
}

function buildSessionUpdate(event) {
  const update = {
    lastEventType: event.eventType || '',
    lastReasonCode: event.reasonCode || '',
    lastReason: event.reason || '',
  };

  if (event.connectedAt) {
    update.connectedAt = event.connectedAt;
  }

  if (event.eventType === 'session_start') {
    update.connectedAt = event.connectedAt || event.sessionId;
    update.startBatteryPct = event.battery;
    update.endBatteryPct = event.battery;
  }

  if (event.eventType === 'smartcharge_decision') {
    update.firstDecisionAt = event.loggedAt;
    update.targetBatteryPct = event.targetBattery;
    update.missingBatteryPct = event.missingBatteryPercent;

    update.plannerMode = event.plannerMode;
    update.plannerVersion = event.plannerVersion;
    update.windowCount = event.windowCount;
    update.plannedStart = event.plannedStart;
    update.plannedEnd = event.plannedEnd;
    update.chargeWindowsText = event.chargeWindowsText;
    update.chargeWindowsJson = event.chargeWindowsJson;

    update.chargeFactor = event.chargeFactor;
    update.chargeReservePct = event.chargeReserve;
    update.plannedChargeMinutes = event.chargeMinutes;

    update.selectedAvgPriceEurKwh = event.selectedAveragePrice;
    update.selectedTotalPrice = event.selectedTotalPrice;
    update.baselineAvgPriceEurKwh = event.baselineAveragePrice;
    update.baselineTotalPrice = event.baselineTotalPrice;
    update.estimatedSavings = event.estimatedSavings;
    update.estimatedSavingsPct = event.estimatedSavingsPercent;
  }

  if (event.eventType === 'smartcharge_on') {
    update.chargeStartedAt = event.loggedAt;
  }

  if (event.eventType === 'smartcharge_off') {
    update.chargeStoppedAt = event.loggedAt;
  }

  if (event.eventType === 'session_reset') {
    update.resetAt = event.loggedAt;
    update.endBatteryPct = event.battery;
  }

  if (event.battery !== null && event.battery !== undefined) {
    update.endBatteryPct = event.battery;
  }

  return update;
}

function getSessionStatus(event) {
  switch (event.eventType) {
    case 'session_start':
      return 'active';

    case 'smartcharge_decision':
      if (event.shouldChargeNow) return 'ready_to_charge';
      return 'planned';

    case 'smartcharge_on':
      return 'charging';

    case 'smartcharge_off':
      return 'stopped';

    case 'session_reset':
      return 'completed';

    case 'session_expired':
      return 'expired';

    default:
      return 'unknown';
  }
}

function formatEventSheet(sheet) {
  sheet.setFrozenRows(1);
}

function formatSessionSheet(sheet) {
  const headers = getHeaderValues(sheet);

  const sessionIdCol = headers.indexOf('sessionId') + 1;

  if (sessionIdCol > 0) {
    sheet
      .getRange(1, sessionIdCol, sheet.getMaxRows(), 1)
      .setNumberFormat('@');
  }

  const createdAtCol = headers.indexOf('createdAt') + 1;
  const updatedAtCol = headers.indexOf('updatedAt') + 1;

  if (createdAtCol > 0) {
    sheet
      .getRange(1, createdAtCol, sheet.getMaxRows(), 1)
      .setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }

  if (updatedAtCol > 0) {
    sheet
      .getRange(1, updatedAtCol, sheet.getMaxRows(), 1)
      .setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }

  sheet.setFrozenRows(1);
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