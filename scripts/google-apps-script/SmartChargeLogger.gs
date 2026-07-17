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

  'initialWindowCount',
  'initialSelectedTotalPrice',
  'initialBaselineTotalPrice',
  'initialEstimatedSavings',
  'initialEstimatedSavingsPct',
];

const TERMINAL_SESSION_STATUSES = [
  'completed',
  'expired',
  'manual_reset',
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
    if (sheetName === SMARTCHARGE_CONFIG.SESSIONS_SHEET_NAME) {
      migrateSessionHeaders(sheet);
    }

    appendMissingHeaders(sheet, headers);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function migrateSessionHeaders(sheet) {
  const headers = getHeaderValues(sheet);
  const legacyColumnIndex = headers.indexOf('windowCounts');
  const canonicalColumnIndex = headers.indexOf('initialWindowCount');

  if (legacyColumnIndex < 0 || canonicalColumnIndex >= 0) return;

  sheet
    .getRange(1, legacyColumnIndex + 1)
    .setValue('initialWindowCount');
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
    const update = buildSessionWrite(event, {}, now);

    sheet.appendRow(emptyRow);

    writeSessionValues(sheet, headers, newRowIndex, {
      sessionId: event.sessionId,
      createdAt: now,
      ...update,
    });

    return;
  }

  const currentSession = readSessionValues(sheet, headers, rowIndex);

  writeSessionValues(
    sheet,
    headers,
    rowIndex,
    buildSessionWrite(event, currentSession, now),
  );
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

function readSessionValues(sheet, headers, rowIndex) {
  const values = sheet
    .getRange(rowIndex, 1, 1, headers.length)
    .getValues()[0];

  return headers.reduce((session, header, index) => {
    if (header) {
      session[header] = values[index];
    }

    return session;
  }, {});
}

function writeSessionValues(sheet, headers, rowIndex, update) {
  Object.keys(update).forEach((fieldName) => {
    const columnIndex = headers.indexOf(fieldName) + 1;

    if (columnIndex < 1) return;

    sheet.getRange(rowIndex, columnIndex).setValue(cell(update[fieldName]));
  });
}

function buildSessionWrite(event, currentSession, now) {
  const update = buildSessionUpdate(event, currentSession || {});

  return {
    status: getSessionStatus(event, currentSession || {}, update),
    updatedAt: now,
    ...update,
  };
}

function buildSessionUpdate(event, currentSession) {
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
    if (!hasValue(currentSession.startBatteryPct)) {
      update.startBatteryPct = event.battery;
    }
  }

  if (event.eventType === 'smartcharge_decision') {
    if (!hasValue(currentSession.firstDecisionAt)) {
      update.firstDecisionAt = event.loggedAt;
    }

    update.targetBatteryPct = event.targetBattery;
    update.missingBatteryPct = event.missingBatteryPercent;

    if (!hasValue(currentSession.plannerMode) && hasValue(event.plannerMode)) {
      update.plannerMode = event.plannerMode;
    }

    if (hasCompleteChargingPlan(event)) {
      addInitialPlanValue(
        update,
        currentSession,
        'initialWindowCount',
        event.windowCount,
      );
      addInitialPlanValue(
        update,
        currentSession,
        'initialSelectedTotalPrice',
        event.selectedTotalPrice,
      );
      addInitialPlanValue(
        update,
        currentSession,
        'initialBaselineTotalPrice',
        event.baselineTotalPrice,
      );
      addInitialPlanValue(
        update,
        currentSession,
        'initialEstimatedSavings',
        event.estimatedSavings,
      );
      addInitialPlanValue(
        update,
        currentSession,
        'initialEstimatedSavingsPct',
        event.estimatedSavingsPercent,
      );
    }

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

    if (
      isCompletionEvent(event, currentSession) &&
      canUpdateFinalBattery(currentSession)
    ) {
      update.endBatteryPct = event.battery;
    }
  }

  if (event.eventType === 'smartcharge_on') {
    update.chargeStartedAt = event.loggedAt;
  }

  if (event.eventType === 'smartcharge_off') {
    if (!hasValue(currentSession.chargeStoppedAt)) {
      update.chargeStoppedAt = event.loggedAt;
    }

    if (hasValue(event.battery) && canUpdateFinalBattery(currentSession)) {
      update.endBatteryPct = event.battery;
    }
  }

  if (event.eventType === 'session_reset') {
    update.resetAt = event.loggedAt;
  }

  if (
    event.eventType === 'battery_full' &&
    hasValue(event.battery) &&
    canUpdateFinalBattery(currentSession)
  ) {
    update.endBatteryPct = event.battery;
  }

  addBatteryDelta(update, currentSession);

  return update;
}

function hasCompleteChargingPlan(event) {
  return (
    hasValue(event.windowCount) &&
    hasValue(event.selectedTotalPrice) &&
    hasValue(event.baselineTotalPrice)
  );
}

function addInitialPlanValue(update, currentSession, fieldName, value) {
  if (!hasValue(currentSession[fieldName]) && hasValue(value)) {
    update[fieldName] = value;
  }
}

function getSessionStatus(event, currentSession, update) {
  const currentStatus = normalizeStatus(currentSession.status);

  if (currentStatus === 'completed') return 'completed';

  if (
    currentStatus === 'expired' ||
    currentStatus === 'manual_reset'
  ) {
    return currentStatus;
  }

  switch (event.eventType) {
    case 'session_start':
      return 'active';

    case 'smartcharge_decision':
      if (isCompletionEvent(event, currentSession)) return 'completed';
      if (event.shouldChargeNow) return 'ready_to_charge';
      return 'planned';

    case 'smartcharge_on':
      return 'charging';

    case 'smartcharge_off':
      if (isCompletionEvent(event, currentSession)) return 'completed';
      return 'stopped';

    case 'session_reset':
      if (isCompletionUpdate(update, currentSession)) return 'completed';
      return 'manual_reset';

    case 'session_expired':
      return 'expired';

    case 'battery_full':
      return 'completed';

    case 'charger_disconnected':
      if (isCompletionEvent(event, currentSession)) return 'completed';
      return 'disconnected';

    default:
      return 'unknown';
  }
}

function hasValue(value) {
  // Numeric zero is a valid telemetry value.
  // Only null, undefined and empty string are considered missing.
  return value !== null && value !== undefined && value !== '';
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isTerminalSession(session) {
  return TERMINAL_SESSION_STATUSES.includes(normalizeStatus(session.status));
}

function canUpdateFinalBattery(currentSession) {
  if (isTerminalSession(currentSession)) return false;

  return !(
    hasValue(currentSession.chargeStoppedAt) &&
    hasValue(currentSession.endBatteryPct)
  );
}

function isCompletionUpdate(update, currentSession) {
  const status = normalizeStatus(currentSession.status);

  if (status === 'completed') return true;
  if (!hasValue(update.endBatteryPct)) return false;

  return isBatteryAtTarget(
    update.endBatteryPct,
    currentSession.targetBatteryPct,
  );
}

function isCompletionEvent(event, currentSession) {
  if (event.eventType === 'battery_full') return true;
  if (event.reasonCode === 'BATTERY_FULL') return true;
  if (
    event.eventType !== 'smartcharge_decision' &&
    event.eventType !== 'smartcharge_off' &&
    event.eventType !== 'charger_disconnected'
  ) {
    return false;
  }

  const targetBattery = hasValue(event.targetBattery)
    ? event.targetBattery
    : currentSession.targetBatteryPct;

  return isBatteryAtTarget(event.battery, targetBattery);
}

function isBatteryAtTarget(battery, targetBattery) {
  const batteryValue = numberOrNull(battery);
  const targetValue = hasValue(targetBattery) ? numberOrNull(targetBattery) : 100;

  return (
    batteryValue !== null &&
    targetValue !== null &&
    batteryValue >= targetValue
  );
}

function addBatteryDelta(update, currentSession) {
  const startBattery = numberOrNull(
    hasValue(update.startBatteryPct)
      ? update.startBatteryPct
      : currentSession.startBatteryPct,
  );

  const endBattery = numberOrNull(
    hasValue(update.endBatteryPct)
      ? update.endBatteryPct
      : currentSession.endBatteryPct,
  );

  if (startBattery === null || endBattery === null) return;
  if (endBattery < startBattery) return;

  update.batteryDeltaPct = endBattery - startBattery;
}

function numberOrNull(value) {
  if (!hasValue(value)) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
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
