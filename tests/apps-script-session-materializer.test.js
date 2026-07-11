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
    `${source}\nthis.__test = { buildSessionWrite };\n`,
    context,
    { filename: SCRIPT_PATH },
  );

  return context.__test;
}

const { buildSessionWrite } = loadSessionHelpers();

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

runExpiredSessionRegression();
runCompletedSessionRegression();
runManualResetRegression();

console.log('PASS apps-script-session-materializer');
