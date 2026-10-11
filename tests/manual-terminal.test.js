const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const root = path.resolve(__dirname, '..');
const end = Date.parse('2026-07-07T20:15:00+02:00');
const at = (offset) => new Date(end + offset * 1000).toISOString();
const reasons = [
  'LOW_POWER',
  'BATTERY_FULL',
  'MAX_DURATION_REACHED',
  'USER_STOP',
  'COMMAND_FAILED',
];
const entries = ['runtime-controller', 'run-decision', 'state-sync'];
let count = 0;
function make(initial) {
  return new SimulatorRuntime({
    scriptLoader: new ScriptLoader(root),
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
      },
    },
    scenario: {
      name: 'terminal-manual',
      now: at(0),
      priceAnchor: '2026-07-07T18:00:00+02:00',
      fixture: 'multi-window-separated',
      initial: initial || {
        logic: {
          SmartChargeRuntimeMode: 'active',
          ChargeConnectedAt: '2026-07-07 14:00:00',
          SmartChargeShouldCharge: true,
        },
        devices: {
          mercedes: {
            capabilitiesObj: {
              measure_battery: 20,
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: at(0),
              },
            },
          },
          plug: { capabilitiesObj: { onoff: false, measure_power: null } },
        },
      },
    },
  });
}
function restart(r) {
  return make(
    JSON.parse(
      JSON.stringify({
        logic: r.homeyMock.getLogicSnapshot(),
        devices: r.homeyMock.getDeviceSnapshot(),
      }),
    ),
  );
}
function state(r) {
  return JSON.parse(r.homeyMock.getLogicValue('SmartChargeManualState'));
}
async function run(r, flow = 'runtime-controller', offset = 0, set) {
  const out = await r.runStep({ flow, now: at(offset), set });
  if (out.error) throw out.error;
  return out.result;
}
const power = (value, offset) => ({
  devices: {
    plug: {
      capabilitiesObj: { measure_power: { value, lastUpdated: at(offset) } },
    },
  },
});
const ready = (offset) => ({
  devices: {
    mercedes: {
      capabilitiesObj: {
        measure_battery: { value: 20, lastUpdated: at(offset) },
        text_charging_status: {
          value: 'Charge break',
          lastUpdated: at(offset),
        },
      },
    },
  },
});
async function finish(reason, failVariable = null) {
  const r = make();
  if (reason === 'COMMAND_FAILED')
    r.homeyMock.devices.plug.failSetCapabilityValue = true;
  await run(r, 'manual-on', reason === 'MAX_DURATION_REACHED' ? -21600 : -300);
  const fail = () => {
    if (failVariable)
      r.homeyMock.failLogicUpdateVariableNames.add(failVariable);
  };
  if (reason === 'COMMAND_FAILED') {
    assert.equal(state(r).status, 'ERROR');
    r.homeyMock.devices.plug.failSetCapabilityValue = false;
    fail();
    await run(r);
  } else if (reason === 'LOW_POWER') {
    await run(r, 'runtime-controller', -290, power(2600, -290));
    await run(r, 'runtime-controller', -260, power(2600, -260));
    for (let t = -180; t <= 0; t += 30) {
      if (t === 0) fail();
      await run(r, 'runtime-controller', t, power(0, t));
    }
  } else if (reason === 'BATTERY_FULL') {
    fail();
    await run(r, 'runtime-controller', 0, {
      devices: {
        mercedes: {
          capabilitiesObj: {
            measure_battery: { value: 100, lastUpdated: at(0) },
          },
        },
      },
    });
  } else {
    fail();
    await run(r, reason === 'USER_STOP' ? 'manual-off' : 'runtime-controller');
  }
  if (failVariable) return r;
  assert.equal(state(r).stopReason, reason);
  assert.ok(state(r).endedAt);
  assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
  assert.equal(
    r.homeyMock.getLogicValue('ChargeConnectedAt'),
    '2026-07-07 14:00:00',
  );
  assert.equal(r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'), true);
  return r;
}
async function test(label, fn) {
  await fn();
  count++;
  console.log('PASS ' + label);
}
async function main() {
  await test('positive control: preserved automatic session has real planner=true', async () => {
    const r = make();
    const result = await run(r, 'runtime-controller', 1);
    assert.equal(result.plannerShouldCharge, true);
    assert.equal(result.action, 'switched_on');
  });
  for (const reason of reasons)
    for (const reboot of [false, true])
      for (const mode of ['active', 'shadow'])
        for (const entry of entries) {
          await test(`${reason} ${mode} ${entry} restart=${reboot}`, async () => {
            let r = await finish(reason);
            if (reboot) r = restart(r);
            const before = r.homeyMock.devices.plug.commands.length;
            for (const t of [1, 2, 3])
              await run(r, entry, t, {
                ...ready(t),
                logic: {
                  SmartChargeRuntimeMode: mode,
                  SmartChargeShouldCharge: true,
                },
              });
            assert.equal(
              r.homeyMock.devices.plug.capabilitiesObj.onoff.value,
              false,
            );
            assert.equal(
              r.homeyMock.devices.plug.commands
                .slice(before)
                .some((x) => x.value),
              false,
            );
            assert.equal(
              r.homeyMock.getLogicValue('ChargeConnectedAt'),
              '2026-07-07 14:00:00',
            );
            assert.equal(state(r).stopReason, reason);
          });
        }
  for (const reason of reasons)
    await test(`${reason}: legacy block=false, Manual ON and explicit Auto grant`, async () => {
      let r = await finish(reason);
      r.homeyMock.setLogicValues({ SmartChargeAutoStartBlocked: false });
      r = restart(r);
      for (const mode of ['shadow', 'active'])
        for (const entry of entries)
          await run(r, entry, 1, {
            ...ready(1),
            logic: { SmartChargeRuntimeMode: mode },
          });
      assert.equal(
        r.homeyMock.devices.plug.commands.some((x) => x.value),
        false,
      );
      await run(r, 'manual-on', 2, ready(2));
      assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, true);
      assert.equal(
        r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
        true,
      );
      const started = state(r).startedAt;
      const before = r.homeyMock.devices.plug.commands.length;
      await run(r, 'manual-on', 3);
      assert.equal(state(r).startedAt, started);
      assert.equal(r.homeyMock.devices.plug.commands.length, before);
      await run(r, 'manual-off', 4);
      await run(r, 'auto-mode', 5, ready(5));
      assert.equal(
        r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
        false,
      );
      assert.ok(state(r).autoGrant);
      r = restart(r);
      const result = await run(r, 'runtime-controller', 6, ready(6));
      assert.equal(result.plannerShouldCharge, true);
      assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, true);
    });
  const variables = [
    'SmartChargeUserStopToken',
    'SmartChargeAutoStartBlocked',
    'SmartChargeManualMode',
    'SmartChargeManualState',
  ];
  for (const reason of reasons)
    for (const variable of variables)
      await test(`${reason} terminal partial persistence: ${variable}`, async () => {
        let r = await finish(reason, variable);
        assert.equal(
          r.homeyMock.devices.plug.capabilitiesObj.onoff.value,
          false,
        );
        r = restart(r);
        const before = r.homeyMock.devices.plug.commands.length;
        for (const entry of entries) await run(r, entry, 1, ready(1));
        assert.equal(
          r.homeyMock.devices.plug.commands.slice(before).some((x) => x.value),
          false,
        );
        assert.equal(
          r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
          true,
        );
      });
  for (const variable of variables)
    await test(`Manual ON partial persistence after terminal: ${variable}`, async () => {
      let r = await finish('LOW_POWER');
      r.homeyMock.failLogicUpdateVariableNames.add(variable);
      await run(r, 'manual-on', 1);
      assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
      r = restart(r);
      const before = r.homeyMock.devices.plug.commands.length;
      await run(r, 'runtime-controller', 2, ready(2));
      assert.equal(
        r.homeyMock.devices.plug.commands.slice(before).some((x) => x.value),
        false,
      );
    });
  for (const variable of [
    'SmartChargeAutoStartBlocked',
    'SmartChargeManualMode',
    'SmartChargeManualState',
  ])
    await test(`Auto grant partial persistence: ${variable}`, async () => {
      let r = await finish('LOW_POWER');
      r.homeyMock.failLogicUpdateVariableNames.add(variable);
      await run(r, 'auto-mode', 1, ready(1));
      r = restart(r);
      await run(r, 'runtime-controller', 2, ready(2));
      assert.equal(
        r.homeyMock.devices.plug.commands.some((x) => x.value),
        false,
      );
    });
  await test('Auto grant persisted but final block=false write fails', async () => {
    let r = await finish('LOW_POWER');
    const update = r.homeyMock.api.logic.updateVariable;
    r.homeyMock.api.logic.updateVariable = async (request) => {
      if (
        request.id === 'SmartChargeAutoStartBlocked' &&
        request.variable.value === false
      )
        throw new Error('Final auto permission write failed');
      return update(request);
    };
    await run(r, 'auto-mode', 1, ready(1));
    r = restart(r);
    await run(r, 'runtime-controller', 2, ready(2));
    assert.equal(
      r.homeyMock.devices.plug.commands.some((x) => x.value),
      false,
    );
  });
  await test('USER_STOP racing persisted Auto grant keeps ON prohibited', async () => {
    const r = await finish('LOW_POWER');
    const update = r.homeyMock.api.logic.updateVariable;
    let stopped = false;
    r.homeyMock.api.logic.updateVariable = async (request) => {
      if (
        request.id === 'SmartChargeManualState' &&
        JSON.parse(request.variable.value).autoGrant &&
        !stopped
      ) {
        stopped = true;
        await run(r, 'manual-off', 1);
      }
      return update(request);
    };
    const before = r.homeyMock.devices.plug.commands.length;
    await run(r, 'auto-mode', 1, ready(1));
    await run(r, 'runtime-controller', 2, ready(2));
    assert.equal(
      r.homeyMock.devices.plug.commands.slice(before).some((x) => x.value),
      false,
    );
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  await test('state and block writes fail together: token invalidates saved CHARGING', async () => {
    let r = make();
    await run(r, 'manual-on', -300);
    await run(r, 'runtime-controller', -290, power(2600, -290));
    await run(r, 'runtime-controller', -260, power(2600, -260));
    for (let t = -180; t < 0; t += 30)
      await run(r, 'runtime-controller', t, power(0, t));
    r.homeyMock.failLogicUpdateVariableNames = new Set([
      'SmartChargeManualState',
      'SmartChargeAutoStartBlocked',
    ]);
    await run(r, 'runtime-controller', 0, power(0, 0));
    r = restart(r);
    const before = r.homeyMock.devices.plug.commands.length;
    await run(r, 'runtime-controller', 1, power(2600, 1));
    assert.equal(
      r.homeyMock.devices.plug.commands.slice(before).some((x) => x.value),
      false,
    );
  });
  await test('failed final completion write leaves recoverable ERROR without endedAt', async () => {
    let r = make();
    await run(r, 'manual-on', -21600);
    const update = r.homeyMock.api.logic.updateVariable;
    let failed = false;
    r.homeyMock.api.logic.updateVariable = async (request) => {
      if (
        request.id === 'SmartChargeManualState' &&
        JSON.parse(request.variable.value).endedAt &&
        !failed
      ) {
        failed = true;
        throw new Error('Final completion persistence failed');
      }
      return update(request);
    };
    await run(r);
    assert.equal(state(r).status, 'ERROR');
    assert.equal(state(r).endedAt, null);
    r = restart(r);
    await run(r, 'runtime-controller', 1, ready(1));
    assert.ok(state(r).endedAt);
    assert.equal(
      r.homeyMock.devices.plug.commands.some((x) => x.value),
      false,
    );
  });
  for (const status of ['ERROR', 'STOPPING'])
    await test(`${status} recovery and repeated activation cannot resume manual ON`, async () => {
      let r = make();
      await run(r, 'manual-on', -300);
      r.homeyMock.setLogicValues({
        SmartChargeManualState: JSON.stringify({
          ...state(r),
          status,
          stopReason: null,
        }),
        SmartChargeAutoStartBlocked: false,
      });
      r = restart(r);
      await run(r, 'manual-on', 1);
      assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
      assert.ok(state(r).endedAt);
      await run(r, 'runtime-controller', 2, ready(2));
      assert.equal(
        r.homeyMock.devices.plug.commands.some((x) => x.value),
        false,
      );
    });
  for (const status of ['STARTING', 'CHARGING'])
    await test(`partial restored ${status} with both flags false blocks compatibility ON`, async () => {
      const saved = make();
      await run(saved, 'manual-on', -300);
      saved.homeyMock.setLogicValues({
        SmartChargeManualMode: false,
        SmartChargeAutoStartBlocked: false,
        SmartChargeManualState: JSON.stringify({
          ...state(saved),
          status,
          confirmedAt: status === 'CHARGING' ? at(-250) : null,
        }),
      });
      saved.homeyMock.setDeviceState('plug', {
        capabilitiesObj: { onoff: false },
      });
      for (const mode of ['shadow', 'active'])
        for (const entry of entries) {
          const r = restart(saved);
          await run(r, entry, 1, {
            ...ready(1),
            logic: { SmartChargeRuntimeMode: mode },
          });
          assert.equal(
            r.homeyMock.devices.plug.commands.some((x) => x.value),
            false,
          );
        }
    });
  await test('failed OFF persists ERROR until recovery; restart and Auto cannot bypass', async () => {
    let r = make();
    await run(r, 'manual-on', -21600);
    r.homeyMock.devices.plug.failSetCapabilityValue = true;
    await run(r);
    assert.equal(state(r).status, 'ERROR');
    assert.equal(state(r).endedAt, null);
    r = restart(r);
    r.homeyMock.devices.plug.failSetCapabilityValue = true;
    await run(r, 'auto-mode', 1, ready(1));
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
    assert.equal(state(r).endedAt, null);
    r.homeyMock.devices.plug.failSetCapabilityValue = false;
    await run(r, 'runtime-controller', 2);
    assert.ok(state(r).endedAt);
    const before = r.homeyMock.devices.plug.commands.length;
    await run(r, 'runtime-controller', 3, ready(3));
    assert.equal(
      r.homeyMock.devices.plug.commands.slice(before).some((x) => x.value),
      false,
    );
  });
  for (const timestamp of [null, at(-3600), at(100)])
    await test(`Auto rejects unsafe SOC timestamp ${timestamp}`, async () => {
      const r = await finish('LOW_POWER');
      await run(r, 'auto-mode', 1, {
        devices: {
          mercedes: {
            capabilitiesObj: {
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: at(1),
              },
              measure_battery: { value: 20, lastUpdated: timestamp },
            },
          },
        },
      });
      assert.equal(
        r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
        true,
      );
    });
  await test('Auto Mode requires clear lease and verified OFF', async () => {
    const r = await finish('USER_STOP');
    r.homeyMock.setLogicValues({
      SmartChargeRuntimeLock: JSON.stringify({ token: 'inflight', at: at(0) }),
    });
    await run(r, 'auto-mode', 1, ready(1));
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
    r.homeyMock.setLogicValues({ SmartChargeRuntimeLock: 'null' });
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: { onoff: true },
      failSetCapabilityValue: true,
    });
    await run(r, 'auto-mode', 2, ready(2));
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
      true,
    );
  });
  for (const timestamp of [null, at(-3600), at(100)])
    await test(`Auto rejects stale or missing connection evidence ${timestamp}`, async () => {
      const r = await finish('LOW_POWER');
      await run(r, 'auto-mode', 1, {
        devices: {
          mercedes: {
            capabilitiesObj: {
              measure_battery: { value: 20, lastUpdated: at(1) },
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: timestamp,
              },
            },
          },
        },
      });
      assert.equal(
        r.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
        true,
      );
    });
  for (const grant of [
    { at: at(100), stopToken: 'null' },
    { at: 'invalid', stopToken: 'null' },
    { at: at(0), stopToken: 'old-stop' },
  ])
    await test(`invalid restored Auto grant ${JSON.stringify(grant)}`, async () => {
      let r = await finish('USER_STOP');
      r.homeyMock.setLogicValues({
        SmartChargeAutoStartBlocked: false,
        SmartChargeManualState: JSON.stringify({
          ...state(r),
          autoGrant: grant,
        }),
      });
      r = restart(r);
      for (const entry of entries) await run(r, entry, 1, ready(1));
      assert.equal(
        r.homeyMock.devices.plug.commands.some((x) => x.value),
        false,
      );
    });
  console.log(`${count} terminal manual regression cases passed.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
