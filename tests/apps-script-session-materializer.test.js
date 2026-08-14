const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(
  ROOT_DIR,
  'scripts',
  'google-apps-script',
  'SmartChargeLogger.gs',
);

function loadSessionHelpers() {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const context = {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() {
            return 'TEST_SPREADSHEET_ID';
          },
        };
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(
    `${source}\nthis.__test = { buildSessionWrite, ensureSheet, migrateSessionHeaders, readSessionValues, upsertSessionFromEvent, SESSION_HEADERS };\n`,
    context,
    { filename: SCRIPT_PATH },
  );

  return context.__test;
}

const {
  buildSessionWrite,
  ensureSheet,
  migrateSessionHeaders,
  readSessionValues,
  upsertSessionFromEvent,
  SESSION_HEADERS,
} = loadSessionHelpers();

function applyEvent(session, event) {
  const update = buildSessionWrite(
    event,
    session,
    new Date('2026-07-08T10:30:00Z'),
  );

  return {
    ...session,
    ...update,
  };
}

function runExpiredSessionRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 55,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    battery: 55,
    targetBattery: 100,
    missingBatteryPercent: 45,
    shouldChargeNow: false,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_on',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T09:50:00Z',
    battery: 55,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_off',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T10:21:00Z',
    battery: 60,
  });

  assert.equal(session.status, 'stopped');
  assert.equal(session.endBatteryPct, 60);
  assert.equal(session.batteryDeltaPct, 5);
  assert.equal(session.chargeStoppedAt, '2026-07-08T10:21:00Z');

  session = applyEvent(session, {
    eventType: 'session_expired',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T10:30:00Z',
    battery: 11,
  });

  assert.equal(session.status, 'expired');
  assert.equal(session.endBatteryPct, 60);
  assert.equal(session.batteryDeltaPct, 5);

  session = applyEvent(session, {
    eventType: 'smartcharge_off',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T11:15:00Z',
    battery: 11,
  });

  assert.equal(session.status, 'expired');
  assert.equal(session.endBatteryPct, 60);
  assert.equal(session.batteryDeltaPct, 5);
  assert.equal(session.chargeStoppedAt, '2026-07-08T10:21:00Z');

  session = applyEvent(session, {
    eventType: 'session_reset',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T11:16:00Z',
    battery: 11,
  });

  assert.equal(session.status, 'expired');
  assert.equal(session.endBatteryPct, 60);
  assert.equal(session.batteryDeltaPct, 5);
  assert.equal(session.resetAt, '2026-07-08T11:16:00Z');
}

function runCompletedSessionRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 55,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    battery: 55,
    targetBattery: 100,
    missingBatteryPercent: 45,
    shouldChargeNow: false,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_off',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T04:45:00Z',
    battery: 100,
  });

  assert.equal(session.status, 'completed');
  assert.equal(session.endBatteryPct, 100);
  assert.equal(session.batteryDeltaPct, 45);

  session = applyEvent(session, {
    eventType: 'session_reset',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T04:46:00Z',
    battery: 100,
  });

  assert.equal(session.status, 'completed');
  assert.equal(session.endBatteryPct, 100);
  assert.equal(session.batteryDeltaPct, 45);
  assert.equal(session.resetAt, '2026-07-08T04:46:00Z');
}

function runManualResetRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 55,
  });

  session = applyEvent(session, {
    eventType: 'session_reset',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T19:00:00Z',
    battery: 11,
  });

  assert.equal(session.status, 'manual_reset');
  assert.equal(session.endBatteryPct, undefined);
  assert.equal(session.batteryDeltaPct, undefined);
  assert.equal(session.resetAt, '2026-07-07T19:00:00Z');
}

function runCompletedSessionSheetRegression() {
  const sheet = new HeaderSheet([[...SESSION_HEADERS, ' status ']]);
  const spreadsheet = new MockSpreadsheet(sheet);
  const sessionId = '2026-07-19 18:00:00';

  [
    {
      eventType: 'session_start',
      sessionId,
      connectedAt: sessionId,
      loggedAt: '2026-07-19T18:00:00Z',
      battery: '89',
    },
    {
      eventType: 'smartcharge_decision',
      sessionId,
      loggedAt: '2026-07-19T18:05:00Z',
      battery: '89',
      targetBattery: '100',
      missingBatteryPercent: '11',
      shouldChargeNow: true,
      reasonCode: 'CURRENT_SLOT',
    },
    {
      eventType: 'smartcharge_on',
      sessionId,
      loggedAt: '2026-07-19T18:06:00Z',
      battery: '89',
    },
    {
      eventType: 'smartcharge_off',
      sessionId,
      loggedAt: '2026-07-19T19:00:00Z',
      battery: '100',
    },
    {
      eventType: 'session_reset',
      sessionId,
      loggedAt: '2026-07-19T19:01:00Z',
      battery: '100',
    },
  ].forEach((event) => upsertSessionFromEvent(spreadsheet, event));

  const headers = sheet.rows[0].map((header) => String(header || '').trim());
  const session = readSessionValues(sheet, headers, 2);

  assert.equal(session.status, 'completed');
  assert.equal(session.endBatteryPct, '100');
  assert.equal(session.batteryDeltaPct, 11);
  assert.equal(session.chargeStoppedAt, '2026-07-19T19:00:00Z');
  assert.equal(session.resetAt, '2026-07-19T19:01:00Z');
  assert.equal(session.lastEventType, 'session_reset');
}

function runManualResetSheetRegression() {
  const sheet = new HeaderSheet([SESSION_HEADERS]);
  const spreadsheet = new MockSpreadsheet(sheet);
  const sessionId = '2026-07-19 20:00:00';

  upsertSessionFromEvent(spreadsheet, {
    eventType: 'session_start',
    sessionId,
    connectedAt: sessionId,
    loggedAt: '2026-07-19T20:00:00Z',
    battery: '89',
  });
  upsertSessionFromEvent(spreadsheet, {
    eventType: 'smartcharge_decision',
    sessionId,
    loggedAt: '2026-07-19T20:01:00Z',
    battery: '89',
    targetBattery: '100',
    missingBatteryPercent: '11',
    shouldChargeNow: false,
  });
  upsertSessionFromEvent(spreadsheet, {
    eventType: 'session_reset',
    sessionId,
    loggedAt: '2026-07-19T20:02:00Z',
    battery: '89',
  });

  const headers = sheet.rows[0].map((header) => String(header || '').trim());
  const session = readSessionValues(sheet, headers, 2);

  assert.equal(session.status, 'manual_reset');
  assert.equal(session.resetAt, '2026-07-19T20:02:00Z');
  assert.equal(session.lastEventType, 'session_reset');
}

function runImmutablePlannerModeRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 55,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    battery: 55,
    targetBattery: 100,
    missingBatteryPercent: 45,
    plannerMode: 'multi-window',
    windowCount: 2,
    plannedStart: '2026-07-07 15:00:00',
    plannedEnd: '2026-07-08 13:00:00',
    chargeWindowsText: '15:00-16:00, 09:00-13:00',
    chargeWindowsJson: '[{"plannedStart":"15:00"},{"plannedStart":"09:00"}]',
    chargeMinutes: 300,
    selectedAveragePrice: 0.12,
    selectedTotalPrice: 0.6,
    baselineAveragePrice: 0.2,
    baselineTotalPrice: 1,
    estimatedSavingsEur: 0.4,
    estimatedSavingsPct: 40,
    shouldChargeNow: false,
    reasonCode: 'WAITING_FOR_PLAN',
    reason: 'Waiting for selected charging plan',
  });

  assert.equal(session.plannerMode, 'multi-window');
  assert.equal(session.windowCount, 2);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T08:00:00Z',
    battery: 65,
    targetBattery: 100,
    missingBatteryPercent: 35,
    plannerMode: 'continuous',
    windowCount: 1,
    plannedStart: '2026-07-08 09:00:00',
    plannedEnd: '2026-07-08 13:00:00',
    chargeWindowsText: '09:00-13:00',
    chargeWindowsJson: '[{"plannedStart":"09:00"}]',
    chargeMinutes: 240,
    selectedAveragePrice: 0.14,
    selectedTotalPrice: 0.56,
    baselineAveragePrice: 0.19,
    baselineTotalPrice: 0.76,
    estimatedSavingsEur: 0.2,
    estimatedSavingsPct: 26.32,
    shouldChargeNow: false,
    reasonCode: 'WAITING_FOR_PLAN',
    reason: 'Waiting for selected charging plan',
  });

  assert.equal(session.plannerMode, 'multi-window');
  assert.equal(session.windowCount, 1);
  assert.equal(session.plannedStart, '2026-07-08 09:00:00');
  assert.equal(session.plannedEnd, '2026-07-08 13:00:00');
  assert.equal(session.chargeWindowsText, '09:00-13:00');
  assert.equal(session.chargeWindowsJson, '[{"plannedStart":"09:00"}]');
  assert.equal(session.plannedChargeMinutes, 240);
  assert.equal(session.selectedAvgPriceEurKwh, 0.14);
  assert.equal(session.selectedTotalPrice, 0.56);
  assert.equal(session.baselineAvgPriceEurKwh, 0.19);
  assert.equal(session.baselineTotalPrice, 0.76);
  assert.equal(session.estimatedSavingsEur, 0.2);
  assert.equal(session.estimatedSavingsPct, 26.32);
  assert.equal(session.lastReasonCode, 'WAITING_FOR_PLAN');
  assert.equal(session.lastReason, 'Waiting for selected charging plan');
}

function runContinuousPlannerModeRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 70,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    battery: 70,
    plannerMode: 'continuous',
    windowCount: 1,
    shouldChargeNow: false,
  });

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T19:05:00Z',
    battery: 70,
    plannerMode: 'continuous',
    windowCount: 1,
    shouldChargeNow: false,
  });

  assert.equal(session.plannerMode, 'continuous');
  assert.equal(session.windowCount, 1);
}

function runPlannerModeInitializationRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'session_start',
    sessionId: '2026-07-07 18:00:00',
    connectedAt: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:00:00Z',
    battery: 70,
  });

  assert.equal(session.plannerMode, undefined);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    battery: 70,
    plannerMode: 'continuous',
    windowCount: 1,
    shouldChargeNow: false,
  });

  assert.equal(session.plannerMode, 'continuous');
  assert.equal(session.windowCount, 1);
}

function runInitialPlanSnapshotRegression() {
  let session = {};

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-07T18:05:00Z',
    plannerMode: 'multi-window',
    windowCount: 2,
    selectedTotalPrice: 0.7567,
    baselineTotalPrice: 0.7615,
    estimatedSelectedCostEur: 1.25,
    estimatedBaselineCostEur: 1.5,
    estimatedSavingsEur: 0.25,
    estimatedSavingsPct: 16.67,
    allocatedChargeMinutes: 180,
    baselineAllocatedMinutes: 180,
    chargingPowerKw: 2.6,
    baselineAllocationComplete: true,
  });

  assert.equal(session.plannerMode, 'multi-window');
  assert.equal(session.initialWindowCount, 2);
  assert.equal(session.windowCount, 2);
  assert.equal(session.initialSelectedTotalPrice, 0.7567);
  assert.equal(session.initialBaselineTotalPrice, 0.7615);
  assert.equal(session.initialEstimatedSelectedCostEur, 1.25);
  assert.equal(session.initialEstimatedBaselineCostEur, 1.5);
  assert.equal(session.initialEstimatedSavingsEur, 0.25);
  assert.equal(session.initialEstimatedSavingsPct, 16.67);
  assert.equal(session.estimatedSelectedCostEur, 1.25);
  assert.equal(session.estimatedBaselineCostEur, 1.5);
  assert.equal(session.estimatedSavingsEur, 0.25);
  assert.equal(session.estimatedSavingsPct, 16.67);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    loggedAt: '2026-07-08T08:00:00Z',
    plannerMode: 'continuous',
    windowCount: 1,
    selectedTotalPrice: 0.3801,
    baselineTotalPrice: 0.3801,
    estimatedSelectedCostEur: 0.75,
    estimatedBaselineCostEur: 0.75,
    estimatedSavingsEur: 0,
    estimatedSavingsPct: 0,
    baselineAllocationComplete: true,
    allocatedChargeMinutes: 90,
    baselineAllocatedMinutes: 90,
    chargingPowerKw: 2.6,
  });

  assert.equal(session.plannerMode, 'multi-window');
  assert.equal(session.initialWindowCount, 2);
  assert.equal(session.windowCount, 1);
  assert.equal(session.initialSelectedTotalPrice, 0.7567);
  assert.equal(session.initialBaselineTotalPrice, 0.7615);
  assert.equal(session.initialEstimatedSavingsEur, 0.25);
  assert.equal(session.initialEstimatedSavingsPct, 16.67);
  assert.equal(session.estimatedSavingsEur, 0);
  assert.equal(session.estimatedSavingsPct, 0);
  assert.equal(session.selectedTotalPrice, 0.3801);
  assert.equal(session.baselineTotalPrice, 0.3801);
}

function runZeroInitialSavingsRegression() {
  let session = applyEvent(
    {},
    {
      eventType: 'smartcharge_decision',
      sessionId: '2026-07-07 18:00:00',
      windowCount: 1,
      selectedTotalPrice: 0.3801,
      baselineTotalPrice: 0.3801,
      estimatedSelectedCostEur: 0.75,
      estimatedBaselineCostEur: 0.75,
      estimatedSavingsEur: 0,
      estimatedSavingsPct: 0,
      baselineAllocationComplete: true,
    },
  );

  assert.equal(session.initialEstimatedSavingsEur, 0);
  assert.equal(session.initialEstimatedSavingsPct, 0);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    windowCount: 1,
    selectedTotalPrice: 0.3,
    baselineTotalPrice: 0.4,
    estimatedSelectedCostEur: 0.8,
    estimatedBaselineCostEur: 1,
    estimatedSavingsEur: 0.2,
    estimatedSavingsPct: 20,
    baselineAllocationComplete: true,
  });

  assert.equal(session.initialEstimatedSavingsEur, 0);
  assert.equal(session.initialEstimatedSavingsPct, 0);
  assert.equal(session.estimatedSavingsEur, 0.2);
  assert.equal(session.estimatedSavingsPct, 20);
}

function runIncompletePlanRegression() {
  let session = applyEvent(
    {},
    {
      eventType: 'smartcharge_decision',
      sessionId: '2026-07-07 18:00:00',
      plannerMode: 'continuous',
      windowCount: 1,
    },
  );

  assert.equal(session.plannerMode, 'continuous');
  assert.equal(session.windowCount, 1);
  assert.equal(session.initialWindowCount, undefined);
  assert.equal(session.initialSelectedTotalPrice, undefined);
  assert.equal(session.initialBaselineTotalPrice, undefined);
  assert.equal(session.initialEstimatedSavingsEur, undefined);
  assert.equal(session.initialEstimatedSavingsPct, undefined);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    windowCount: 1,
    selectedTotalPrice: 0.41,
    baselineTotalPrice: 0.44,
    estimatedSelectedCostEur: 0.41,
    estimatedBaselineCostEur: 0.44,
    estimatedSavingsEur: 0.03,
    estimatedSavingsPct: 6.8,
    baselineAllocationComplete: true,
  });

  assert.equal(session.initialWindowCount, 1);
  assert.equal(session.initialSelectedTotalPrice, 0.41);
  assert.equal(session.initialBaselineTotalPrice, 0.44);
  assert.equal(session.initialEstimatedSavingsEur, 0.03);
  assert.equal(session.initialEstimatedSavingsPct, 6.8);
  assert.equal(session.initialEstimatedSelectedCostEur, 0.41);
  assert.equal(session.initialEstimatedBaselineCostEur, 0.44);

  session = applyEvent(session, {
    eventType: 'smartcharge_decision',
    sessionId: '2026-07-07 18:00:00',
    windowCount: 2,
    selectedTotalPrice: 0.5,
    baselineTotalPrice: 0.6,
    estimatedSelectedCostEur: 0.5,
    estimatedBaselineCostEur: 0.6,
    estimatedSavingsEur: 0.1,
    estimatedSavingsPct: 16.67,
    baselineAllocationComplete: true,
  });

  assert.equal(session.initialWindowCount, 1);
  assert.equal(session.initialSelectedTotalPrice, 0.41);
  assert.equal(session.initialBaselineTotalPrice, 0.44);
  assert.equal(session.initialEstimatedSavingsEur, 0.03);
  assert.equal(session.initialEstimatedSavingsPct, 6.8);
}

function runSessionHeaderMigrationRegression() {
  const sheet = new HeaderSheet([
    ['sessionId', 'windowCounts', 'windowCount'],
    ['session-1', 2, 1],
  ]);

  migrateSessionHeaders(sheet);

  assert.deepEqual(sheet.rows[0], [
    'sessionId',
    'initialWindowCount',
    'windowCount',
  ]);
  assert.deepEqual(sheet.rows[1], ['session-1', 2, 1]);

  const afterFirstMigration = JSON.stringify(sheet.rows);
  migrateSessionHeaders(sheet);
  assert.equal(JSON.stringify(sheet.rows), afterFirstMigration);
}

function runDualSessionHeaderRegression() {
  const sheet = new HeaderSheet([
    ['sessionId', 'windowCounts', 'initialWindowCount', 'windowCount'],
    ['session-1', 9, 2, 1],
  ]);

  migrateSessionHeaders(sheet);

  assert.deepEqual(sheet.rows, [
    ['sessionId', 'windowCounts', 'initialWindowCount', 'windowCount'],
    ['session-1', 9, 2, 1],
  ]);
}

function runMissingSessionHeaderRegression() {
  const sheet = new HeaderSheet([['sessionId', 'windowCount']]);
  const spreadsheet = {
    getSheetByName() {
      return sheet;
    },
    insertSheet() {
      throw new Error('Existing Sessions sheet should be reused');
    },
  };

  ensureSheet(spreadsheet, 'Sessions', SESSION_HEADERS);
  ensureSheet(spreadsheet, 'Sessions', SESSION_HEADERS);

  assert.equal(
    sheet.rows[0].filter((header) => header === 'initialWindowCount').length,
    1,
  );
  assert.equal(sheet.rows[0].includes('windowCounts'), false);
}

function runReusableSessionHeaderMigration() {
  const sheet = new HeaderSheet([
    [
      'sessionId',
      'startBattery_%',
      'endBattery_%',
      'estimatedCost_EUR',
      'chargeMinutes_min',
      'notes',
    ],
  ]);

  migrateSessionHeaders(sheet);

  assert.deepEqual(sheet.rows[0], [
    'sessionId',
    'startBatteryPct',
    'endBatteryPct',
    'estimatedSelectedCostEur',
    'chargeMinutes_min',
    'notes',
  ]);
}

class HeaderSheet {
  constructor(rows) {
    this.rows = rows.map((row) => [...row]);
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    return this.rows[0] ? this.rows[0].length : 0;
  }

  appendRow(row) {
    this.rows.push([...row]);
  }

  setFrozenRows() {}

  getMaxRows() {
    return Math.max(this.rows.length, 1000);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues: () =>
        Array.from({ length: rowCount }, (_row, rowOffset) =>
          Array.from(
            { length: columnCount },
            (_column, columnOffset) =>
              this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '',
          ),
        ),
      getDisplayValues: () =>
        Array.from({ length: rowCount }, (_row, rowOffset) =>
          Array.from({ length: columnCount }, (_column, columnOffset) =>
            String(
              this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '',
            ),
          ),
        ),
      setValue: (value) => {
        this.rows[row - 1][column - 1] = value;
      },
      setValues: (values) => {
        values.forEach((valuesRow, rowOffset) => {
          if (!this.rows[row - 1 + rowOffset]) {
            this.rows[row - 1 + rowOffset] = [];
          }

          valuesRow.forEach((value, columnOffset) => {
            this.rows[row - 1 + rowOffset][column - 1 + columnOffset] = value;
          });
        });
      },
      setNumberFormat: () => {},
    };
  }
}

class MockSpreadsheet {
  constructor(sessionsSheet) {
    this.sessionsSheet = sessionsSheet;
  }

  getSheetByName(sheetName) {
    return sheetName === 'Sessions' ? this.sessionsSheet : null;
  }

  insertSheet() {
    throw new Error('Existing Sessions sheet should be reused');
  }
}

runExpiredSessionRegression();
runCompletedSessionRegression();
runManualResetRegression();
runCompletedSessionSheetRegression();
runManualResetSheetRegression();
runImmutablePlannerModeRegression();
runContinuousPlannerModeRegression();
runPlannerModeInitializationRegression();
runInitialPlanSnapshotRegression();
runZeroInitialSavingsRegression();
runIncompletePlanRegression();
runSessionHeaderMigrationRegression();
runDualSessionHeaderRegression();
runMissingSessionHeaderRegression();
runReusableSessionHeaderMigration();

console.log('PASS apps-script-session-materializer');
