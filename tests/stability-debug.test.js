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

(async () => {
  const report = await loader.executeFlow({
    flow: 'stability-debug',
    homey: {
      logic: { getVariables: async () => values, updateVariable: failWrite },
      devices: {
        getDevices: failWrite,
        setCapabilityValue: failWrite,
      },
    },
    fetch: failWrite,
    log: (message) => logs.push(message),
    now: new Date('2026-07-07T16:15:00.000Z'),
  });

  assert.match(report, /Build: 0\.6\.1\+build\.13/);
  assert.match(report, /Runtime Mode: active/);
  assert.match(report, /Live Shadow: ENABLED/);
  assert.match(report, /Status: RESTORED/);
  assert.match(report, /Revision: 1/);
  assert.match(report, /- 2026-07-07T21:00:00\.000Z/);
  assert.match(report, /Last Stability Decision: NOT PERSISTED/);
  assert.equal(logs.length, 1);

  console.log('Stability debug read-only test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
