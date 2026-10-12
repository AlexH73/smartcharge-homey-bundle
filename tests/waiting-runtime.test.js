const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fixture } = require('./helpers/release-fixture');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const { createFixedDate } = require('../simulator/runtime/fixed-date');
const {
  DEFAULT_LOGIC_VARIABLES,
} = require('../simulator/runtime/default-state');
const root = path.resolve(__dirname, '..');
const now = '2026-07-07T18:05:00+02:00';
const grant = { at: '2026-07-07T17:55:00+02:00', stopToken: 'stop-1' };
function make(scriptLoader, initial) {
  return new SimulatorRuntime({
    scriptLoader,
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
      },
    },
    scenario: {
      name: 'waiting-update',
      now,
      fixture: 'cheap-night',
      initial: initial || {
        logic: {
          ChargeConnectedAt: '2026-07-07 18:00:00',
          SmartChargeSessionStatus: 'active',
          SmartChargeRuntimeMode: 'active',
          SmartChargeAutoStartBlocked: false,
          SmartChargeUserStopToken: 'stop-1',
          SmartChargeManualState: JSON.stringify({
            ...JSON.parse(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState),
            status: 'STOPPED',
            id: 'manual:previous',
            startedAt: '2026-07-07T17:00:00+02:00',
            endedAt: '2026-07-07T17:30:00+02:00',
            stopReason: 'USER_STOP',
            autoGrant: grant,
          }),
        },
        devices: {
          plug: { capabilitiesObj: { onoff: false, measure_power: 0 } },
        },
      },
    },
  });
}
async function run(runtime, at, priceFixture = 'cheap-night') {
  const out = await runtime.runStep({
    flow: 'runtime-controller',
    now: at,
    fixture: priceFixture,
    set: {
      devices: {
        mercedes: {
          capabilitiesObj: {
            measure_battery: { value: 70, lastUpdated: at },
            text_charging_status: { value: 'Charge break', lastUpdated: at },
          },
        },
      },
    },
  });
  if (out.error) throw out.error;
  return out.result;
}
function snapshot(runtime) {
  return {
    logic: runtime.homeyMock.getLogicSnapshot(),
    devices: runtime.homeyMock.getDeviceSnapshot(),
  };
}
async function main() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smartcharge-waiting-'),
  );
  try {
    const artifact = path.join(temporary, 'artifact');
    fixture(artifact);
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const bundle = new AsyncFunction(
      'Homey',
      'fetch',
      'log',
      'Date',
      fs.readFileSync(
        path.join(artifact, 'SMARTCHARGE - Runtime Controller.js'),
        'utf8',
      ),
    );
    const loader = {
      executeFlow({ homey, fetch, log, now: at }) {
        return bundle(homey, fetch, log, createFixedDate(at));
      },
    };
    const before = make(new ScriptLoader(root));
    const waiting = await run(before, now);
    assert.equal(waiting.runtimeState, 'WAITING');
    assert.equal(before.homeyMock.devices.plug.commands.length, 0);
    const saved = snapshot(before);
    // No invocation while mock Flows are disabled; replacing code does not mutate Logic.
    for (let replaced = 1; replaced <= 12; replaced++) {
      const paused = make(loader, saved);
      assert.deepEqual(snapshot(paused), saved);
      assert.equal(paused.homeyMock.devices.plug.commands.length, 0);
    }
    const resumed = make(loader, saved);
    assert.equal(
      (await run(resumed, '2026-07-07T18:10:00+02:00')).runtimeState,
      'WAITING',
    );
    for (const key of [
      'ChargeConnectedAt',
      'SmartChargePlannedStart',
      'SmartChargePlannedEnd',
      'SmartChargeManualState',
    ])
      assert.equal(resumed.homeyMock.getLogicValue(key), saved.logic[key]);
    assert.equal(resumed.homeyMock.devices.plug.commands.length, 0);
    const repriced = make(loader, saved);
    await run(repriced, '2026-07-07T18:15:00+02:00', 'price-update-evening');
    assert.equal(
      repriced.homeyMock.getLogicValue('ChargeConnectedAt'),
      saved.logic.ChargeConnectedAt,
    );
    assert.equal(
      repriced.homeyMock.getLogicValue('SmartChargeManualState'),
      saved.logic.SmartChargeManualState,
    );
    assert.notEqual(
      repriced.homeyMock.getLogicValue('SmartChargePlannedStart'),
      saved.logic.SmartChargePlannedStart,
    );
    assert.equal(repriced.homeyMock.devices.plug.commands.length, 0);
    const inWindow = make(loader, saved);
    assert.equal(
      (await run(inWindow, '2026-07-08T02:05:00+02:00')).action,
      'switched_on',
    );
    assert.equal(
      inWindow.homeyMock.getLogicValue('ChargeConnectedAt'),
      saved.logic.ChargeConnectedAt,
    );
    assert.deepEqual(
      JSON.parse(inWindow.homeyMock.getLogicValue('SmartChargeManualState'))
        .autoGrant,
      grant,
    );
    assert.equal(
      inWindow.homeyMock.devices.plug.commands.filter((c) => c.value).length,
      1,
    );
    // An old in-flight invocation is not cancelled by disabling triggers.
    const pending = make(new ScriptLoader(root), saved);
    assert.equal(
      (await run(pending, '2026-07-08T02:05:00+02:00')).action,
      'switched_on',
    );
    for (const logic of [
      { SmartChargeAutoStartBlocked: true },
      { SmartChargeUserStopToken: 'changed-stop-token' },
    ]) {
      const denied = make(loader, {
        ...saved,
        logic: { ...saved.logic, ...logic },
      });
      await run(denied, '2026-07-08T02:05:00+02:00');
      assert.equal(
        denied.homeyMock.devices.plug.commands.some((c) => c.value),
        false,
      );
    }
    console.log(
      'PASS WAITING pause, generated-bundle restart, preserved session/grant/plan, due-window ON, pending old execution and safety denial',
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
