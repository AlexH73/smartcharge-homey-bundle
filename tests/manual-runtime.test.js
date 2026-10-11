const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const {
  DEFAULT_LOGIC_VARIABLES,
} = require('../simulator/runtime/default-state');

const root = path.resolve(__dirname, '..');
const base = '2026-10-10T10:00:00.000Z';
const at = (seconds) =>
  new Date(Date.parse(base) + seconds * 1000).toISOString();
const cases = [];
function runtime(logic = {}, plug = {}, vehicle = {}) {
  const writer = {
    events: [],
    append({ payload }) {
      this.events.push(payload);
    },
  };
  return new SimulatorRuntime({
    scriptLoader: new ScriptLoader(root),
    logWriter: writer,
    scenario: {
      name: 'manual-reliability',
      now: base,
      initial: {
        logic: { SmartChargeRuntimeMode: 'active', ...logic },
        devices: {
          plug: {
            capabilitiesObj: { onoff: false, measure_power: null, ...plug },
          },
          mercedes: {
            capabilitiesObj: {
              measure_battery: {
                value: 44,
                lastUpdated: '2026-10-03T10:41:44.735Z',
              },
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: '2026-10-03T16:19:32.500Z',
              },
              onoff_charging: {
                value: false,
                lastUpdated: '2026-10-03T10:41:44.732Z',
              },
              measure_charge_power: {
                value: 0,
                units: 'kW',
                lastUpdated: '2026-10-03T10:41:44.735Z',
              },
              ...vehicle,
            },
          },
        },
      },
    },
  });
}
async function run(r, flow = 'runtime-controller', seconds = 0, set) {
  const out = await r.runStep({ flow, now: at(seconds), set });
  if (out.error) throw out.error;
  return out;
}
function state(r) {
  return JSON.parse(r.homeyMock.getLogicValue('SmartChargeManualState'));
}
const power = (value, seconds) => ({
  devices: {
    plug: {
      capabilitiesObj: {
        measure_power: { value, lastUpdated: at(seconds) },
      },
    },
  },
});
async function confirmed(r) {
  await run(r, 'manual-on');
  await run(r, 'runtime-controller', 1, power(2600, 1));
  const out = await run(r, 'runtime-controller', 31, power(2600, 31));
  assert.equal(state(r).status, 'CHARGING');
  assert.equal(out.eventTypes.includes('manual_charging_started'), true);
}
async function low(r, start = 40, end = 220) {
  for (let seconds = start; seconds <= end; seconds += 30)
    await run(r, 'runtime-controller', seconds, power(0, seconds));
}
async function test(label, fn) {
  await fn();
  cases.push(label);
  console.log(`PASS ${label}`);
}

async function main() {
  await test('A manual no session plug OFF', async () => {
    const r = runtime();
    const out = await run(r, 'manual-on');
    assert.equal(out.result.action, 'switched_on');
    assert.equal(out.result.desiredPlugState, true);
    assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
    assert.equal(r.tibberCalls, 0);
  });
  await test('B manual no session plug ON', async () => {
    const r = runtime({}, { onoff: true, measure_power: 2600 });
    const out = await run(r, 'manual-on');
    assert.equal(out.result.action, 'none');
    assert.equal(out.result.actualPlugState, true);
    assert.equal(state(r).confirmedAt, null);
  });
  await test('C stale Mercedes and missing vehicle', async () => {
    const r = runtime();
    delete r.homeyMock.devices.mercedes;
    await run(r, 'manual-on');
    assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, true);
    const out = await run(r, 'manual-off');
    assert.equal(out.result.runtimeDecisionReason, 'USER_STOP');
  });
  await test('D fresh Mercedes does not create automatic session in manual', async () => {
    const r = runtime(
      {},
      {},
      { text_charging_status: { value: 'Charge break', lastUpdated: base } },
    );
    await run(r, 'manual-on');
    assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  });
  await test('E automatic expiry and reset do not end manual', async () => {
    const r = runtime({ ChargeConnectedAt: '2026-10-08 22:00:00' });
    await run(r, 'manual-on');
    await run(r, 'runtime-controller', 30);
    await run(r, 'reset-session', 31);
    const out = await run(r, 'runtime-controller', 32);
    assert.equal(out.result.desiredPlugState, true);
    assert.equal(r.tibberCalls, 0);
  });
  await test('F fresh 100 SOC completes manual', async () => {
    const r = runtime(
      {},
      {},
      { measure_battery: { value: 100, lastUpdated: base } },
    );
    const out = await run(r, 'manual-on');
    assert.equal(out.result.runtimeDecisionReason, 'BATTERY_FULL');
    assert.equal(out.result.actualPlugState, false);
    assert.equal(r.homeyMock.getLogicValue('SmartChargeManualMode'), false);
  });
  await test('G stale and pre-activation 100 SOC ignored', async () => {
    for (const timestamp of ['2026-10-03T10:00:00Z', at(-1)]) {
      const r = runtime(
        {},
        {},
        { measure_battery: { value: 100, lastUpdated: timestamp } },
      );
      const out = await run(r, 'manual-on');
      assert.equal(out.result.desiredPlugState, true);
    }
  });
  await test('H start needs two independent fresh samples >=30s apart', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'runtime-controller', 1, power(2600, 1));
    await run(r, 'runtime-controller', 31);
    assert.equal(state(r).confirmedAt, null);
    await run(r, 'runtime-controller', 32, power(2600, 32));
    assert.ok(state(r).confirmedAt);
  });
  await test('I low power before start never completes', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await low(r, 30, 240);
    assert.equal(state(r).lowPowerSince, null);
    assert.equal(state(r).status, 'STARTING');
  });
  await test('J low power after start creates durable timer', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r, 40, 40);
    assert.equal(state(r).lowPowerSince, at(40));
  });
  await test('K low power below three minutes continues', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r, 40, 190);
    const out = await run(r, 'runtime-controller', 219, power(0, 219));
    assert.equal(out.result.desiredPlugState, true);
  });
  await test('L low power exactly three minutes completes', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r);
    assert.equal(state(r).stopReason, 'LOW_POWER');
    assert.equal(state(r).endedAt, at(220));
    assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
  });
  await test('M high power and >60s gaps reset low interval', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r, 40, 100);
    await run(r, 'runtime-controller', 130, power(6, 130));
    assert.equal(state(r).lowPowerSince, null);
    await run(r, 'runtime-controller', 160, power(0, 160));
    await run(r, 'runtime-controller', 221);
    assert.equal(state(r).lowPowerSince, null);
    await run(r, 'runtime-controller', 222, power(null, 222));
    assert.equal(state(r).lowPowerSince, null);
  });
  for (const watts of [3, 4, 5, 5.1, 6]) {
    await test(`Five-minute watchdog with ${watts} W`, async () => {
      const r = runtime();
      await run(r, 'manual-on');
      await run(r, 'runtime-controller', 300, power(2600, 300));
      const started = await run(r, 'runtime-controller', 600, power(2600, 600));
      assert.equal(state(r).status, 'CHARGING');
      assert.equal(
        started.eventTypes.includes('manual_charging_started'),
        true,
      );
      await run(r, 'runtime-controller', 900, power(watts, 900));
      await run(r, 'runtime-controller', 1200, power(watts, 1200));
      assert.equal(state(r).stopReason, watts <= 5 ? 'LOW_POWER' : null);
      if (watts <= 5) {
        const events = r.logWriter.events.filter((event) =>
          [
            'smartcharge_off',
            'manual_charging_completed',
            'manual_override_disabled',
          ].includes(event.eventType),
        );
        assert.equal(events.length, 3);
        for (const event of events) {
          assert.equal(event.plugOn, null);
          assert.equal(event.plugPower, null);
        }
      }
    });
  }
  await test('Watchdog gaps, restart, duplicate and missing power evidence', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'runtime-controller', 300, power(2600, 300));
    r.scriptLoader = new ScriptLoader(root);
    await run(r, 'runtime-controller', 600, power(2600, 600));
    assert.equal(state(r).confirmedAt, at(600));
    await run(r, 'runtime-controller', 900, power(4, 900));
    await run(r, 'runtime-controller', 930, power(4, 900));
    assert.equal(state(r).lowPowerSince, at(900));
    await run(r, 'runtime-controller', 960, power(6, 960));
    assert.equal(state(r).lowPowerSince, null);
    await run(r, 'runtime-controller', 1200, power(4, 1200));
    await run(r, 'runtime-controller', 1500, power(null, 1500));
    assert.equal(state(r).lowPowerSince, null);
    await run(r, 'runtime-controller', 1800, power(4, 1800));
    r.scriptLoader = new ScriptLoader(root);
    await run(r, 'runtime-controller', 2161, power(4, 2161));
    assert.equal(state(r).lowPowerSince, at(2161));
    assert.equal(state(r).stopReason, null);
  });
  await test('Persisted confirmation survives a lost start webhook', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'runtime-controller', 300, power(2600, 300));
    r.handleLocalWebhook = () => {
      throw new Error('webhook unavailable');
    };
    await run(r, 'runtime-controller', 600, power(2600, 600));
    assert.equal(state(r).status, 'CHARGING');
    assert.equal(
      r.logWriter.events.some(
        (event) => event.eventType === 'manual_charging_started',
      ),
      false,
    );
    r.scriptLoader = new ScriptLoader(root);
    await run(r, 'runtime-controller', 900, power(2600, 900));
    assert.equal(state(r).confirmedAt, at(600));
    assert.equal(r.homeyMock.devices.plug.commands.length, 1);
  });
  await test('N maximum duration below six hours', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    const out = await run(r, 'runtime-controller', 21599);
    assert.equal(out.result.desiredPlugState, true);
    assert.equal(state(r).startedAt, base);
  });
  await test('O maximum duration exactly six hours', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    const out = await run(r, 'runtime-controller', 21600);
    assert.equal(out.result.runtimeDecisionReason, 'MAX_DURATION_REACHED');
    assert.equal(state(r).endedAt, at(21600));
  });
  await test('P USER_STOP persists automatic block and planner cannot clear it', async () => {
    const r = runtime({
      ChargeConnectedAt: '2026-10-10 11:00:00',
      SmartChargeShouldCharge: true,
    });
    await run(r, 'manual-on');
    await run(r, 'manual-off', 5);
    assert.equal(state(r).stopReason, 'USER_STOP');
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
    for (const flow of ['runtime-controller', 'run-decision', 'state-sync']) {
      const out = await run(r, flow, 10);
      assert.equal(out.result.actualPlugState, false);
    }
  });
  await test('Q restart preserves deadline and confirmed start', async () => {
    const r = runtime();
    await confirmed(r);
    // Every ScriptLoader invocation is a new AsyncFunction with no retained local guard.
    r.scriptLoader = new ScriptLoader(root);
    await run(r, 'runtime-controller', 60, power(2600, 60));
    assert.equal(state(r).startedAt, base);
    assert.equal(state(r).confirmedAt, at(31));
  });
  await test('R restart during low-power countdown', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r, 40, 130);
    r.scriptLoader = new ScriptLoader(root);
    await low(r, 160, 220);
    assert.equal(state(r).stopReason, 'LOW_POWER');
  });
  await test('S stale vehicle power cannot create automatic session', async () => {
    const r = runtime(
      {},
      {},
      {
        measure_charge_power: {
          value: 2.6,
          units: 'kW',
          lastUpdated: at(-3600),
        },
      },
    );
    const out = await run(r);
    assert.equal(out.result.sessionActive, false);
    assert.equal(out.result.desiredPlugState, false);
  });
  await test('T legacy entry points respect manual owner', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    for (const flow of ['run-decision', 'state-sync']) {
      const out = await run(r, flow, 30);
      assert.equal(out.result.desiredPlugState, true);
    }
    assert.equal(r.homeyMock.devices.plug.commands.length, 1);
    assert.equal(r.tibberCalls, 0);
  });
  await test('U webhook failure after ON does not repeat command', async () => {
    const r = runtime();
    r.handleLocalWebhook = () => {
      throw new Error('webhook unavailable');
    };
    await run(r, 'manual-on');
    await run(r, 'runtime-controller', 1);
    assert.equal(r.homeyMock.devices.plug.commands.length, 1);
    assert.equal(state(r).status, 'STARTING');
    assert.ok(
      r.scriptLogs.some((x) => x.message.includes('webhook unavailable')),
    );
  });
  await test('V command failure is ERROR, OFF failure not completed', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    r.homeyMock.devices.plug.failSetCapabilityValue = true;
    const out = await run(r, 'manual-off', 1);
    assert.equal(out.result.runtimeState, 'ERROR');
    assert.equal(out.result.actualPlugState, true);
    assert.equal(state(r).endedAt, null);
    r.homeyMock.devices.plug.failSetCapabilityValue = false;
    await run(r, 'runtime-controller', 2);
    assert.equal(state(r).status, 'STOPPED');
  });
  await test('W repeated activation does not extend deadline', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'manual-on', 600);
    assert.equal(state(r).startedAt, base);
    assert.equal(r.homeyMock.devices.plug.commands.length, 1);
  });
  await test('X repeated USER_STOP is idempotent', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'manual-off', 1);
    const eventCount = r.logWriter.events.length;
    await run(r, 'manual-off', 2);
    assert.equal(r.homeyMock.devices.plug.commands.length, 2);
    assert.equal(r.logWriter.events.length, eventCount);
  });
  await test('Y concurrent runtime and stop during pending ON', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    r.homeyMock.setDeviceState('plug', { capabilitiesObj: { onoff: false } });
    let resolveOn;
    let enteredOn;
    const entered = new Promise((resolve) => {
      enteredOn = resolve;
    });
    const release = new Promise((resolve) => {
      resolveOn = resolve;
    });
    const plug = r.homeyMock.devices.plug;
    const original = plug.setCapabilityValue.bind(plug);
    plug.setCapabilityValue = async (capability, value) => {
      if (value) {
        enteredOn();
        await release;
      }
      return original(capability, value);
    };
    const first = run(r, 'runtime-controller', 1);
    await entered;
    const second = await run(r, 'runtime-controller', 1);
    assert.equal(second.result.skipped, true);
    const stop = await run(r, 'manual-off', 1);
    assert.equal(stop.result.desiredPlugState, false);
    resolveOn();
    await first;
    assert.equal(plug.capabilitiesObj.onoff.value, false);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  await test('Z Mercedes recovery does not replace manual lifecycle', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    const out = await run(r, 'runtime-controller', 30, {
      devices: {
        mercedes: {
          capabilitiesObj: {
            text_charging_status: { value: 'Charge', lastUpdated: at(30) },
            measure_battery: { value: 80, lastUpdated: at(30) },
          },
        },
      },
    });
    assert.equal(out.result.desiredPlugState, true);
    assert.equal(state(r).startedAt, base);
    assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  });
  await test('Recovery corrupt/missing state is fail-closed', async () => {
    const r = runtime(
      { SmartChargeManualMode: true, SmartChargeManualState: '{}' },
      { onoff: true },
    );
    const out = await run(r);
    assert.equal(out.result.runtimeDecisionReason, 'RECOVERY_BLOCKED');
    assert.equal(out.result.actualPlugState, false);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  await test('Auto Mode requires fresh connection and is explicit', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'manual-off', 1);
    await run(r, 'auto-mode', 2);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
    await run(r, 'auto-mode', 3, {
      devices: {
        mercedes: {
          capabilitiesObj: {
            text_charging_status: { value: 'Charge break', lastUpdated: at(3) },
            measure_battery: { value: 44, lastUpdated: at(3) },
          },
        },
      },
    });
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      false,
    );
    assert.notEqual(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  });
  for (const [label, socAt, statusAt, soc, allowed] of [
    ['stale vehicle', -3600, -3600, 44, false],
    ['fresh SOC only', 3, -3600, 44, false],
    ['fresh status only', -3600, 3, 44, false],
    ['full battery', 3, 3, 100, false],
    ['recovered capabilities without connection event', 3, 3, 44, true],
  ]) {
    await test(`Auto Mode ${label} after restored terminal state`, async () => {
      const r = runtime();
      await run(r, 'manual-on');
      await run(r, 'manual-off', 1);
      r.scriptLoader = new ScriptLoader(root);
      await run(r, 'auto-mode', 3, {
        devices: {
          mercedes: {
            capabilitiesObj: {
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: at(statusAt),
              },
              measure_battery: { value: soc, lastUpdated: at(socAt) },
            },
          },
        },
      });
      assert.equal(
        r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
        !allowed,
      );
      if (!allowed)
        assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
      assert.equal(state(r).startedAt, base);
      assert.equal(state(r).endedAt, at(1));
    });
  }
  await test('Reactivation preserves automatic block without reusing old deadline', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    await run(r, 'manual-off', 1);
    await run(r, 'manual-on', 2);
    assert.equal(state(r).startedAt, at(2));
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  await test('Missing plug does not report successful stop', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    delete r.homeyMock.devices.plug;
    const out = await run(r, 'manual-off', 1);
    assert.equal(out.result.runtimeState, 'ERROR');
    assert.equal(out.result.actualPlugState, null);
    assert.equal(state(r).endedAt, null);
  });
  await test('Missing automatic variables do not disable manual', async () => {
    const r = runtime();
    delete r.homeyMock.logicVariables.ChargeConnectedAt;
    delete r.homeyMock.logicVariables.TIBBER_ACCESS_TOKEN;
    await run(r, 'manual-on');
    assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, true);
  });
  await test('Timestamp-less, stale and future plug power cannot confirm start', async () => {
    for (const reading of [
      2600,
      { value: 2600, lastUpdated: at(-3600) },
      { value: 2600, lastUpdated: at(300) },
    ]) {
      const r = runtime({}, { measure_power: reading });
      await run(r, 'manual-on');
      await run(r, 'runtime-controller', 30);
      assert.equal(state(r).confirmedAt, null);
      await run(r, 'runtime-controller', 21600);
      assert.equal(state(r).stopReason, 'MAX_DURATION_REACHED');
    }
  });
  await test('Repeated low timestamp cannot complete; restart gap resets timer', async () => {
    const r = runtime();
    await confirmed(r);
    await low(r, 40, 40);
    await run(r, 'runtime-controller', 100);
    assert.equal(state(r).endedAt, null);
    r.scriptLoader = new ScriptLoader(root);
    await run(r, 'runtime-controller', 101);
    assert.equal(state(r).lowPowerSince, null);
  });
  await test('Failed OFF is attempted once per invocation', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    let attempts = 0;
    r.homeyMock.devices.plug.setCapabilityValue = async () => {
      attempts++;
      throw new Error('rejected OFF');
    };
    await run(r, 'manual-off', 1);
    assert.equal(attempts, 1);
    assert.equal(state(r).endedAt, null);
  });
  await test('Failed ON is diagnosed and cannot claim CHARGING', async () => {
    const r = runtime();
    r.homeyMock.devices.plug.failSetCapabilityValue = true;
    const out = await run(r, 'manual-on');
    assert.equal(out.result.runtimeState, 'ERROR');
    assert.equal(state(r).confirmedAt, null);
    assert.ok(
      r.logWriter.events.some((x) => x.reasonCode === 'COMMAND_FAILED'),
    );
  });
  await test('Concurrent Manual ON and USER_STOP prefer stop', async () => {
    const r = runtime();
    await Promise.all([run(r, 'manual-on'), run(r, 'manual-off')]);
    await run(r, 'runtime-controller', 1);
    assert.equal(r.homeyMock.getLogicValue('SmartChargeManualMode'), false);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
    assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
  });
  await test('Abandoned or future ownership fails closed', async () => {
    for (const lock of [
      'bad json',
      JSON.stringify({ token: 'old', at: at(-61) }),
      JSON.stringify({ token: 'future', at: at(1) }),
    ]) {
      const r = runtime({ SmartChargeRuntimeLock: lock }, { onoff: true });
      const out = await run(r);
      assert.equal(out.result.runtimeDecisionReason, 'RECOVERY_BLOCKED');
      assert.equal(out.result.actualPlugState, false);
    }
  });
  await test('Unknown plug state prohibits ON but USER_STOP still requests OFF', async () => {
    const r = runtime({}, { onoff: null });
    const out = await run(r, 'manual-on');
    assert.equal(out.result.runtimeState, 'ERROR');
    assert.equal(
      r.homeyMock.devices.plug.commands.some((command) => command.value),
      false,
    );
    r.homeyMock.setDeviceState('plug', { capabilitiesObj: { onoff: null } });
    const stop = await run(r, 'manual-off', 1);
    assert.equal(stop.result.actualPlugState, false);
    assert.equal(state(r).stopReason, 'USER_STOP');
  });
  await test('Explicit USER_STOP remains available after switching to shadow', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    r.homeyMock.setLogicValues({ SmartChargeRuntimeMode: 'shadow' });
    const out = await run(r, 'manual-off', 1);
    assert.equal(out.result.actualPlugState, false);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  await test('Shadow legacy OFF cannot interrupt persisted manual intent', async () => {
    const r = runtime();
    await run(r, 'manual-on');
    r.homeyMock.setLogicValues({
      SmartChargeRuntimeMode: 'shadow',
      SmartChargeShouldCharge: false,
    });
    const out = await run(r, 'state-sync', 1);
    assert.equal(out.result.action, 'off_blocked');
    assert.equal(out.result.plugOnAfter, true);
    assert.equal(r.homeyMock.devices.plug.commands.length, 1);
  });
  assert.ok(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState);
  console.log(
    `${cases.length} manual simulator integration cases passed (A-Z and recovery).`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
