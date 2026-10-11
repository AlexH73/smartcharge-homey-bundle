const path = require('path');
const assert = require('assert/strict');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { HomeyMock } = require('../simulator/runtime/homey-mock');
const { createFixedDate } = require('../simulator/runtime/fixed-date');
const root = path.resolve(__dirname, '..');
const now = '2026-07-07T18:15:00.000Z';
const trace = [];
let releaseBWrite, releaseACommand;
const allowBWrite = new Promise((resolve) => {
  releaseBWrite = resolve;
});
const allowACommand = new Promise((resolve) => {
  releaseACommand = resolve;
});
let signalBReady;
const bReady = new Promise((resolve) => {
  signalBReady = resolve;
});
const homey = new HomeyMock({
  logic: {
    SmartChargeRuntimeMode: 'active',
    SmartChargeManualMode: true,
    SmartChargeManualState: JSON.stringify({
      version: 1,
      status: 'STARTING',
      id: 'manual:race',
      startedAt: now,
      confirmedAt: null,
      highPowerAt: null,
      lastPowerAt: null,
      lowPowerSince: null,
      endedAt: null,
      stopReason: null,
      error: null,
    }),
  },
});
const loader = new ScriptLoader(root);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const instrumentation = `
const originalUpdate = updateVariableByName;
updateVariableByName = async (name, value) => {
  if (name === CONFIG.runtimeLockVariableName && value !== 'null') {
    if (label === 'B') { trace.push('B read empty lock; pause before write'); signalBReady(); await allowBWrite; }
    trace.push(label + ' writes own lock');
  }
  return originalUpdate(name, value);
};
const originalOn = setDeviceOn;
setDeviceOn = async device => {
  trace.push(label + ' passed ownership check and entered physical ON');
  if (label === 'A') { releaseBWrite(); await allowACommand; }
  await originalOn(device);
  trace.push(label + ' ON acknowledged');
  if (label === 'B') releaseACommand();
};
return await runRuntimeController();`;
async function execute(label) {
  const fn = new AsyncFunction(
    'Homey',
    'fetch',
    'log',
    'Date',
    'label',
    'trace',
    'signalBReady',
    'allowBWrite',
    'releaseBWrite',
    'allowACommand',
    'releaseACommand',
    loader.sharedCode + '\n' + instrumentation,
  );
  return fn(
    homey.api,
    async () => ({ ok: true, status: 200 }),
    () => {},
    createFixedDate(now),
    label,
    trace,
    signalBReady,
    allowBWrite,
    releaseBWrite,
    allowACommand,
    releaseACommand,
  );
}
(async () => {
  const b = execute('B');
  await bReady;
  const a = execute('A');
  const outcomes = await Promise.all([a, b]);
  const commands = homey.devices.plug.commands.map((x) => x.value);
  assert.deepEqual(commands, [true, true]);
  const result = {
    description:
      'Two separate script scopes read null; B writes after A passes its last ownership check. Delays model API scheduling, not changed production rules.',
    trace,
    commands,
    outcomes: outcomes.map((x) => ({
      action: x.action,
      runtimeState: x.runtimeState,
    })),
    finalLock: homey.getLogicValue('SmartChargeRuntimeLock'),
  };
  assert.equal(result.commands.length, 2);
  console.log('PASS RuntimeLock limitation: separate scopes can both issue ON');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
