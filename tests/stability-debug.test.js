const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');

const root = path.resolve(__dirname, '..');
const loader = new ScriptLoader(root);
const values = {
  runtime: { name: 'SmartChargeRuntimeMode', value: 'active' },
  connected: {
    name: 'ChargeConnectedAt',
    value: '2026-07-07 18:00:00',
  },
  anchor: {
    name: 'SmartChargeAcceptedStrategy',
    value: JSON.stringify({
      schemaVersion: 1,
      sessionId: '2026-07-07 18:00:00',
      plannerVersion: 'planner-v2',
      acceptedAt: '2026-07-07T16:05:00.000Z',
      revision: 1,
      targetDeparture: '2026-07-08T05:30:00.000Z',
      selectedSlotStarts: ['2026-07-07T21:00:00.000Z'],
    }),
  },
  shouldCharge: { name: 'SmartChargeShouldCharge', value: false },
  manual: { name: 'SmartChargeManualMode', value: false },
  disconnect: { name: 'SmartChargeDisconnectObservedAt', value: 'null' },
  connection: { name: 'SmartChargeConnectionEvidenceAt', value: 'null' },
};
const logs = [];

async function failWrite() {
  throw new Error('read-only debug attempted a write');
}

function diagnostics(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    loggedAt: '2026-07-07T16:15:00.000Z',
    sessionId: '2026-07-07 18:00:00',
    productionShouldCharge: false,
    stabilityDecision: 'CONTINUE',
    shadowEffectiveShouldCharge: true,
    transition: 'OFF_TO_ON',
    acceptedRevision: 1,
    continuationCostEur: 0.5,
    candidateCostEur: 0.4,
    savingEur: 0.1,
    savingPct: 20,
    persistenceStatus: 'PRESERVED',
    reason: 'REPLACEMENT_BENEFIT_INSUFFICIENT',
    ...overrides,
  });
}

async function executeDebug(diagnosticsValue) {
  const scenarioValues = structuredClone(values);
  if (diagnosticsValue !== undefined) {
    scenarioValues.diagnostics = {
      name: 'SmartChargeStabilityDiagnostics',
      value: diagnosticsValue,
    };
  }
  return loader.executeFlow({
    flow: 'stability-debug',
    homey: {
      logic: {
        getVariables: async () => scenarioValues,
        updateVariable: failWrite,
      },
      devices: { getDevices: failWrite, setCapabilityValue: failWrite },
    },
    fetch: failWrite,
    log: (message) => logs.push(message),
    now: new Date('2026-07-07T16:15:00.000Z'),
  });
}

(async () => {
  const report = await executeDebug(diagnostics());

  assert.match(report, /Build: 0\.6\.1\+build\.14/);
  assert.match(report, /Runtime Mode: active/);
  assert.match(report, /Live Shadow: ENABLED/);
  assert.match(report, /Status: RESTORED/);
  assert.match(report, /Revision: 1/);
  assert.match(report, /- 2026-07-07T21:00:00\.000Z/);
  assert.match(report, /Last Stability Diagnostics:/);
  assert.match(report, /Status: RESTORED/);
  assert.match(report, /Session Match: YES/);
  assert.match(report, /Stability Decision: CONTINUE/);
  assert.match(report, /Production Should Charge: false/);
  assert.match(report, /Shadow Effective ShouldCharge: true/);

  assert.match(await executeDebug('null'), /Status: EMPTY/);
  assert.match(await executeDebug('  '), /Status: EMPTY/);
  assert.match(await executeDebug('{bad'), /Status: CORRUPT/);
  assert.match(
    await executeDebug(diagnostics({ schemaVersion: 2 })),
    /Status: INVALID/,
  );
  assert.match(
    await executeDebug(diagnostics({ sessionId: 'stale-session' })),
    /Session Match: NO/,
  );
  assert.match(await executeDebug(undefined), /Status: MISSING/);
  assert.equal(logs.length, 7);

  console.log('Stability debug read-only test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
