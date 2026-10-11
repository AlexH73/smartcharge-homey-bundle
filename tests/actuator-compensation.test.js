const assert = require('assert/strict');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const loader = new ScriptLoader(require('path').resolve(__dirname, '..'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function scenario(options = {}) {
  const run = new AsyncFunction(
    'options',
    'log',
    loader.sharedCode +
      `
    let stopped = false;
    let reads = 0;
    let physicalOn = false;
    const commands = [], events = [];
    const state = { id: 'synthetic-manual', status: 'STARTING', stopReason: null };
    const plug = { capabilitiesObj: { onoff: {value: false} }, async setCapabilityValue(capability, value) {
      commands.push(value);
      if (value) {
        if (options.stopDuringOn) stopped = true;
        if (options.unknownOn) { physicalOn = true; throw new Error('unknown ON outcome'); }
        physicalOn = true;
        if (!options.stale) this.capabilitiesObj.onoff.value = true;
      } else {
        if (options.failOff) throw new Error('OFF failed');
        physicalOn = false;
        if (!options.stale) this.capabilitiesObj.onoff.value = false;
      }
    }};
    readRuntimeSafety = async () => { reads++; if (options.stopAfterAck && commands.includes(true)) stopped = true; return { blocked: true, manual: !stopped, manualAllowed: !stopped, state: stopped ? {...state, stopReason: 'USER_STOP'} : state }; };
    runtimeEvent = async (type, reason, snapshot, manual, message) => { events.push({type, reason, message}); if (options.loggerFail) throw new Error('logger failure'); };
    let action, error;
    try { action = await executeRuntimePlugCommand({plug}, true, 'MANUAL_START', state); } catch (e) { error = e.message; }
    return {commands, events, physicalOn, action, error};
  `,
  );
  return run(options, () => {});
}
async function lifecycle(stopAfterAck) {
  const {
    SimulatorRuntime,
  } = require('../simulator/runtime/simulator-runtime');
  const timeline = [];
  const base = '2026-10-10T10:00:00.000Z';
  const r = new SimulatorRuntime({
    scriptLoader: loader,
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
        timeline.push(payload.eventType);
      },
    },
    scenario: {
      name: 'ordered-stop',
      now: base,
      initial: { logic: { SmartChargeRuntimeMode: 'active' } },
    },
  });
  const step = async (flow, seconds = 0) => {
    const out = await r.runStep({
      flow,
      now: new Date(Date.parse(base) + seconds * 1000).toISOString(),
    });
    if (out.error) throw out.error;
    return out;
  };
  await step('manual-on');
  timeline.length = 0;
  const update = r.homeyMock.api.logic.updateVariable;
  r.homeyMock.api.logic.updateVariable = async (request) => {
    await update(request);
    if (
      request.id === 'SmartChargeManualState' &&
      JSON.parse(request.variable.value).endedAt
    )
      timeline.push('terminal_persisted');
  };
  const plug = r.homeyMock.devices.plug;
  plug.capabilitiesObj.onoff.value = false;
  let ack, entered;
  const pending = new Promise((resolve) => (ack = resolve));
  const called = new Promise((resolve) => (entered = resolve));
  const original = plug.setCapabilityValue.bind(plug);
  plug.setCapabilityValue = async (capability, value) => {
    if (value) {
      entered();
      await pending;
    }
    await original(capability, value);
  };
  const runtime = step('runtime-controller', 1);
  await called;
  const concurrent = await step('runtime-controller', 1);
  assert.equal(concurrent.result.skipped, true);
  if (stopAfterAck) {
    const get = r.homeyMock.api.logic.getVariables;
    let stopped = false;
    r.homeyMock.api.logic.getVariables = async (...args) => {
      if (!stopped && plug.commands.at(-1)?.value === true) {
        stopped = true;
        await step('manual-off', 1);
      }
      return get(...args);
    };
    ack();
  } else {
    await step('manual-off', 1);
    ack();
  }
  await runtime;
  const saved = JSON.parse(r.homeyMock.getLogicValue('SmartChargeManualState'));
  assert.equal(plug.capabilitiesObj.onoff.value, false);
  assert.equal(r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'), true);
  assert.equal(saved.status, 'STOPPED');
  assert.equal(saved.stopReason, 'USER_STOP');
  assert.ok(saved.endedAt);
  const on = timeline.indexOf('smartcharge_on'),
    off = timeline.lastIndexOf('smartcharge_off'),
    completed = timeline.indexOf('manual_charging_completed');
  assert.ok(on >= 0 && off > on && completed > off, JSON.stringify(timeline));
  const persisted = timeline.indexOf('terminal_persisted');
  assert.ok(persisted > off && completed > persisted, JSON.stringify(timeline));
  assert.equal(timeline[on - 1], 'actuator_request');
  assert.equal(timeline[off - 1], 'actuator_request');
}
async function main() {
  for (const stop of ['stopDuringOn', 'stopAfterAck'])
    for (const stale of [false, true]) {
      const result = await scenario({ [stop]: true, stale });
      assert.deepEqual(
        result.commands,
        [true, false],
        `${stop}, stale=${stale}: compensating OFF required`,
      );
      assert.equal(result.physicalOn, false);
      const on = result.events.findIndex((e) => e.type === 'smartcharge_on');
      const off = result.events.findIndex((e) => e.type === 'smartcharge_off');
      assert.ok(
        on >= 0 && off > on,
        `${stop}: ON ACK must precede compensating OFF event`,
      );
      assert.equal(result.action, 'switched_off');
      for (const event of result.events.filter((e) =>
        /smartcharge_(on|off)/.test(e.type),
      ))
        assert.equal(JSON.parse(event.message).physicalStateVerified, false);
    }
  const normal = await scenario();
  assert.deepEqual(normal.commands, [true]);
  assert.equal(normal.action, 'switched_on');
  const failure = await scenario({ stopDuringOn: true, failOff: true });
  assert.match(failure.error, /OFF failed/);
  assert.equal(failure.physicalOn, true);
  assert.equal(
    failure.events.some((e) => e.type === 'smartcharge_off'),
    false,
  );
  const unknown = await scenario({ unknownOn: true, stale: true });
  assert.deepEqual(unknown.commands, [true, false]);
  assert.match(unknown.error, /unknown ON outcome/);
  assert.equal(unknown.physicalOn, false);
  assert.equal(
    unknown.events.some((e) => e.type === 'smartcharge_on'),
    false,
  );
  const logger = await scenario({
    stopDuringOn: true,
    loggerFail: true,
    stale: true,
  });
  assert.deepEqual(logger.commands, [true, false]);
  assert.equal(logger.physicalOn, false);
  await lifecycle(false);
  await lifecycle(true);
  console.log(
    'PASS Actuator ACK ordering, stale snapshot compensation, OFF/ON/logger failures',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
