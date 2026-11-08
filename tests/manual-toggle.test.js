const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const root = path.resolve(__dirname, '..');
const base = '2026-11-08T15:00:00Z';
const at = (seconds) =>
  new Date(Date.parse(base) + seconds * 1000).toISOString();
function make() {
  return new SimulatorRuntime({
    scriptLoader: new ScriptLoader(root),
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
      },
    },
    scenario: {
      name: 'manual-toggle',
      now: base,
      fixture: 'normal-day',
      initial: {
        logic: {
          SmartChargeRuntimeMode: 'active',
          SmartChargeAutoStartBlocked: true,
          SmartChargeControlStatus: 'STOP',
        },
        devices: {
          mercedes: {
            capabilitiesObj: {
              measure_battery: {
                value: 100,
                lastUpdated: '2026-11-07T15:00:00Z',
              },
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: '2026-11-07T15:00:00Z',
              },
            },
          },
          plug: { capabilitiesObj: { onoff: false, measure_power: 0 } },
        },
      },
    },
  });
}
async function run(
  r,
  seconds,
  flow = 'manual-on',
  set = {},
  args = ['toggle'],
) {
  const result = await r.runStep({ flow, now: at(seconds), args, set });
  if (result.error) throw result.error;
  return result;
}
const commands = (r) => r.homeyMock.devices.plug.commands.map((c) => c.value);
const state = (r) =>
  JSON.parse(r.homeyMock.getLogicValue('SmartChargeManualState'));
async function main() {
  const r = make();
  assert.equal((await run(r, 0)).logic.SmartChargeControlStatus, 'MANUAL');
  assert.deepEqual(commands(r), [true]);
  const id = state(r).id;
  assert.equal((await run(r, 1)).result.skipped, true);
  assert.equal(state(r).id, id);
  r.scriptLoader = new ScriptLoader(root);
  assert.equal((await run(r, 2)).result.skipped, true);
  assert.equal((await run(r, 3)).logic.SmartChargeControlStatus, 'AUTO');
  assert.deepEqual(commands(r), [true, false]);
  assert.ok(state(r).autoGrant);
  assert.equal((await run(r, 4)).result.skipped, true);
  assert.equal((await run(r, 6)).logic.SmartChargeControlStatus, 'MANUAL');
  assert.equal(
    (await run(r, 6.1, 'manual-off')).logic.SmartChargeControlStatus,
    'STOP',
  );
  await run(r, 6.2, 'runtime-controller');
  assert.deepEqual(commands(r), [true, false, true, false]);

  const legacy = make();
  await run(legacy, 0, 'manual-on', {}, []);
  await run(legacy, 4, 'manual-on', {}, []);
  assert.deepEqual(commands(legacy), [true]);
  assert.equal(state(legacy).startedAt, at(0));

  const busy = make();
  const out = await run(busy, 0, 'manual-on', {
    logic: {
      SmartChargeRuntimeLock: JSON.stringify({ token: 'busy', at: base }),
    },
  });
  assert.equal(out.result.skipped, true);
  assert.deepEqual(commands(busy), []);

  const shadow = make();
  const before = shadow.homeyMock.getLogicSnapshot();
  const shadowResult = await run(shadow, 0, 'manual-on', {
    logic: { SmartChargeRuntimeMode: 'shadow' },
  });
  assert.equal(shadowResult.result.skipped, true);
  assert.equal(
    shadowResult.logic.SmartChargeControlStatus,
    before.SmartChargeControlStatus,
  );
  assert.deepEqual(commands(shadow), []);

  const displayFailure = make();
  await run(displayFailure, 0, 'manual-on', {
    failLogicUpdateVariableNames: ['SmartChargeControlStatus'],
  });
  assert.deepEqual(commands(displayFailure), [true]);

  const stoppedDuringReservation = make();
  const update = stoppedDuringReservation.homeyMock.api.logic.updateVariable;
  let stopped = false;
  stoppedDuringReservation.homeyMock.api.logic.updateVariable = async (
    request,
  ) => {
    const result = await update(request);
    if (
      !stopped &&
      request.id === 'SmartChargeManualState' &&
      JSON.parse(request.variable.value).controlToggle
    ) {
      stopped = true;
      stoppedDuringReservation.homeyMock.setLogicValues({
        SmartChargeUserStopToken: 'new-stop',
        SmartChargeAutoStartBlocked: true,
      });
    }
    return result;
  };
  assert.equal((await run(stoppedDuringReservation, 0)).result.skipped, true);
  assert.deepEqual(commands(stoppedDuringReservation), []);
  // Hardware OFF takes time: AUTO permission must be dated after manual end.
  const delayed = make();
  await run(delayed, 0);
  let clock = at(3);
  function MovingDate(...args) {
    return args.length ? new Date(...args) : new Date(clock);
  }
  Object.setPrototypeOf(MovingDate, Date);
  MovingDate.prototype = Date.prototype;
  const originalUpdate = delayed.homeyMock.api.logic.updateVariable;
  delayed.homeyMock.api.logic.updateVariable = async (request) => {
    if (
      request.id === 'SmartChargeManualState' &&
      JSON.parse(request.variable.value).status === 'STOPPING'
    )
      clock = at(4);
    return originalUpdate(request);
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const toggle = new AsyncFunction(
    'Homey',
    'fetch',
    'https',
    'log',
    'Date',
    'args',
    delayed.scriptLoader.sharedCode + '\nreturn requestManualMode("toggle");',
  );
  await toggle(
    delayed.homeyMock.api,
    delayed.fetch,
    require('https'),
    () => {},
    MovingDate,
    ['toggle'],
  );
  assert.equal(
    delayed.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
    false,
  );
  assert.ok(
    new Date(state(delayed).autoGrant.at) >= new Date(state(delayed).endedAt),
  );
  console.log(
    'PASS toggle, durable debounce/restart, STOP priority, legacy start, busy/shadow and display failure',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
