const assert = require('assert/strict');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const scenario = require('../simulator/scenarios/runtime-active-slot-rounding.json');

function runtime() {
  const logWriter = {
    events: [],
    append({ payload }) {
      this.events.push(payload);
      return payload;
    },
  };
  return new SimulatorRuntime({
    scenario,
    scriptLoader: new ScriptLoader(require('path').resolve(__dirname, '..')),
    logWriter,
  });
}

async function run() {
  const valid = {
    schemaVersion: 1,
    sessionId: '2026-11-07 14:35:00',
    slotStart: '2026-11-08T03:00:00.000Z',
    stopToken: 'null',
  };
  for (const [record, retained] of [
    [JSON.stringify(valid), true],
    ['null', false],
    ['{', false],
    [JSON.stringify({ ...valid, schemaVersion: 2 }), false],
    [JSON.stringify({ ...valid, sessionId: 'another-session' }), false],
    [JSON.stringify({ ...valid, stopToken: 'older-token' }), false],
    [JSON.stringify({ ...valid, slotStart: '2026-11-08T02:00:00Z' }), false],
  ]) {
    const r = runtime();
    await r.runStep(scenario.steps[0]);
    const step = structuredClone(scenario.steps[1]);
    step.set.logic = { SmartChargeActiveChargeSlot: record };
    const result = await r.runStep(step);
    assert.equal(result.error, null);
    assert.equal(result.result.shouldChargeNow, retained, record);
    assert.equal(result.result.actualPlugState, retained, record);
    if (retained) {
      assert.equal(result.result.allocatedChargeMinutes, 240);
    }
  }

  for (const flow of ['manual-off', 'runtime-controller']) {
    const r = runtime();
    await r.runStep(scenario.steps[0]);
    const step = structuredClone(scenario.steps[1]);
    step.flow = flow;
    if (flow === 'runtime-controller') {
      step.set.devices.mercedes.capabilitiesObj.measure_battery.value = 100;
    }
    const result = await r.runStep(step);
    assert.equal(result.error, null);
    assert.equal(result.devices.plug.capabilitiesObj.onoff.value, false);
    if (flow === 'manual-off') {
      const following = await r.runStep(scenario.steps[1]);
      assert.equal(following.error, null);
      assert.equal(following.devices.plug.capabilitiesObj.onoff.value, false);
    }
  }

  // A failed initial record write falls back to the ordinary tariff decision.
  const writeFailure = runtime();
  const first = structuredClone(scenario.steps[0]);
  first.set.failLogicUpdateVariableNames = ['SmartChargeActiveChargeSlot'];
  const started = await writeFailure.runStep(first);
  assert.equal(started.error, null);
  assert.equal(started.devices.plug.capabilitiesObj.onoff.value, true);
  const afterFailure = await writeFailure.runStep(scenario.steps[1]);
  assert.equal(afterFailure.error, null);
  assert.equal(afterFailure.result.shouldChargeNow, false);
  assert.equal(afterFailure.devices.plug.capabilitiesObj.onoff.value, false);

  // A record cannot grant a new ON if the socket was independently turned OFF.
  const stopped = runtime();
  await stopped.runStep(scenario.steps[0]);
  const independentlyOff = structuredClone(scenario.steps[1]);
  independentlyOff.set.devices.plug.capabilitiesObj.onoff = {
    value: false,
    lastUpdated: independentlyOff.now,
  };
  independentlyOff.set.devices.plug.capabilitiesObj.measure_power.value = 0;
  const stillOff = await stopped.runStep(independentlyOff);
  assert.equal(stillOff.error, null);
  assert.equal(stillOff.result.shouldChargeNow, false);
  assert.equal(stillOff.devices.plug.capabilitiesObj.onoff.value, false);

  const expired = runtime();
  await expired.runStep(scenario.steps[0]);
  const deadline = structuredClone(scenario.steps[1]);
  deadline.now = '2026-11-08T13:05:00+01:00';
  const ended = await expired.runStep(deadline);
  assert.equal(ended.error, null);
  assert.equal(ended.devices.plug.capabilitiesObj.onoff.value, false);
  assert.equal(ended.logic.SmartChargeSessionStatus, 'expired');

  const r = runtime();
  await r.runStep(scenario.steps[0]);
  const step = structuredClone(scenario.steps[1]);
  step.set.logic = { SmartChargeRuntimeMode: 'shadow' };
  const result = await r.runStep(step);
  assert.equal(result.error, null);
  assert.equal(
    result.logic.SmartChargeActiveChargeSlot,
    result.logicBefore.SmartChargeActiveChargeSlot,
  );
  assert.equal(
    result.devices.plug.commands.length,
    result.devicesBefore.plug.commands.length,
  );
  console.log(
    'PASS active charging slot scope, terminal priority and shadow isolation',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
