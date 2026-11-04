const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const {
  DEFAULT_LOGIC_VARIABLES,
} = require('../simulator/runtime/default-state');
const now = '2026-07-07T20:15:00+02:00';
const old = '2026-07-07T10:00:00+02:00';
const loader = new ScriptLoader(path.resolve(__dirname, '..'));
function make(reason = 'BATTERY_FULL', battery = 69, observedAt = old) {
  const manual = {
    ...JSON.parse(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState),
    status: reason === 'USER_STOP' ? 'STOPPED' : 'COMPLETED',
    id: 'manual:previous',
    startedAt: '2026-07-06T08:00:00+02:00',
    endedAt: '2026-07-06T09:00:00+02:00',
    stopReason: reason,
    autoGrant: null,
  };
  return new SimulatorRuntime({
    scriptLoader: loader,
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
      },
    },
    scenario: {
      name: 'automatic-lifecycle',
      now,
      priceAnchor: '2026-07-07T18:00:00+02:00',
      fixture: 'multi-window-separated',
      initial: {
        logic: {
          SmartChargeRuntimeMode: 'active',
          SmartChargeSessionStatus: 'completed',
          SmartChargeAutoStartBlocked: true,
          SmartChargeManualState: JSON.stringify(manual),
        },
        devices: {
          mercedes: {
            capabilitiesObj: {
              measure_battery: { value: battery, lastUpdated: observedAt },
              text_charging_status: { value: 'Unplugged', lastUpdated: old },
            },
          },
        },
      },
    },
  });
}
async function run(r, flow = 'runtime-controller', set) {
  const out = await r.runStep({ flow, now, set });
  if (out.error) throw out.error;
  return out.result;
}
const fresh = {
  devices: {
    mercedes: {
      capabilitiesObj: {
        measure_battery: { value: 20, lastUpdated: now },
        text_charging_status: { value: 'Charge break', lastUpdated: now },
      },
    },
  },
};
function noOn(r) {
  assert.equal(
    r.homeyMock.devices.plug.commands.some((command) => command.value),
    false,
  );
}
function authorize(r, session = '2026-07-07 18:00:00') {
  r.homeyMock.setLogicValues({
    ChargeConnectedAt: session,
    SmartChargeAutoStartBlocked: false,
    SmartChargeManualState: DEFAULT_LOGIC_VARIABLES.SmartChargeManualState,
    SmartChargeSessionStatus: 'active',
  });
}
async function reviewRegressions() {
  // A tariff response is withheld until the physical safety OFF is observed.
  // The timeout only bounds a broken test; assertions depend on request order.
  for (const scenario of ['no-session', 'disconnect', 'blocked']) {
    const r = make();
    if (scenario !== 'blocked')
      authorize(r, scenario === 'no-session' ? 'null' : undefined);
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: { onoff: true, measure_power: 0 },
    });
    const fetch = r.fetch;
    let release;
    const withheld = new Promise((resolve) => {
      release = resolve;
    });
    let requested;
    const entered = new Promise((resolve) => {
      requested = resolve;
    });
    r.fetch = async (...args) => {
      if (String(args[0]).includes('tibber')) {
        requested();
        await withheld;
      }
      return fetch(...args);
    };
    let settled = false;
    const pending = run(r).finally(() => {
      settled = true;
    });
    let timer;
    try {
      await Promise.race([
        entered,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Tariff request was not reached')),
            2000,
          );
        }),
      ]);
      assert.equal(settled, false);
      assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
      assert.deepEqual(
        r.homeyMock.devices.plug.commands.map((command) => command.value),
        [false],
      );
    } finally {
      clearTimeout(timer);
      release();
      await pending;
    }
  }

  for (const change of ['session', 'auto-state', 'during-publication']) {
    const r = make();
    const confirmed = {
      ChargeConnectedAt: '2026-07-07 20:10:00',
      SmartChargeSessionStatus: 'active',
      SmartChargeAutoStartBlocked: false,
      SmartChargeManualState: DEFAULT_LOGIC_VARIABLES.SmartChargeManualState,
      SmartChargeShouldCharge: true,
      SmartChargePlannedStart: 'confirmed-start',
      SmartChargePlannedEnd: 'confirmed-end',
      SmartChargeTargetDeparture: 'confirmed-departure',
      SmartChargeReason: 'confirmed-plan',
      ChargeMinutes: 123,
      ChargeSlots: 3,
      ChargeQuarters: 3,
    };
    if (change === 'auto-state') {
      r.homeyMock.setLogicValues({
        ChargeConnectedAt: confirmed.ChargeConnectedAt,
      });
    }
    const fetch = r.fetch;
    r.fetch = async (...args) => {
      const response = await fetch(...args);
      if (
        String(args[0]).includes('tibber') &&
        change !== 'during-publication'
      ) {
        r.homeyMock.setLogicValues(confirmed);
      }
      return response;
    };
    if (change === 'during-publication') {
      const update = r.homeyMock.api.logic.updateVariable;
      r.homeyMock.api.logic.updateVariable = async (request) => {
        await update(request);
        if (
          request.id === 'SmartChargeShouldCharge' &&
          request.variable.value === false
        ) {
          r.homeyMock.setLogicValues(confirmed);
        }
      };
    }
    const result = await run(r);
    assert.equal(result.preliminaryPlan.publicationSkipped, true);
    for (const [name, value] of Object.entries(confirmed)) {
      assert.equal(
        r.homeyMock.getLogicValue(name),
        value,
        `${change}: ${name}`,
      );
    }
    noOn(r);
  }

  for (const running of [false, true]) {
    const r = make('BATTERY_FULL', 20, old);
    authorize(r);
    r.homeyMock.setDeviceState('mercedes', fresh.devices.mercedes);
    r.homeyMock.setDeviceState('mercedes', {
      capabilitiesObj: { measure_battery: { value: 20, lastUpdated: old } },
    });
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: { onoff: running, measure_power: running ? 2600 : 0 },
    });
    const result = await run(r);
    assert.equal(result.preliminaryPlan.shouldChargeNow, false);
    assert.equal(result.desiredPlugState, false);
    assert.equal(result.continuingExistingCharge, running);
    assert.equal(result.actualPlugState, running);
    assert.equal(result.action, 'none');
    assert.equal(r.homeyMock.devices.plug.commands.length, 0);
    noOn(r);
  }
  const stopped = make('USER_STOP', 20, old);
  stopped.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { onoff: true, measure_power: 2600 },
  });
  assert.equal((await run(stopped)).action, 'switched_off');
  console.log(
    'PASS Review regressions: safety OFF before hung Tibber, Session/AUTO publication races, stale ON denial and existing-charge continuity',
  );
}
async function preliminaryTimeoutRegressions() {
  for (const phase of ['request', 'body']) {
    const r = make();
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: { onoff: true, measure_power: 0 },
    });
    const fetch = r.fetch;
    let expire;
    let entered;
    let cancelled = false;
    let bodyDestroyed = false;
    let socketDestroyed = false;
    let lateResponse;
    let timeoutMs;
    const requestEntered = new Promise((resolve) => {
      entered = resolve;
    });
    const neverResponding = () =>
      new Promise((resolve, reject) => {
        lateResponse = resolve;
        expire = () => {
          cancelled = true;
          reject(
            Object.assign(new Error('Native transport timeout'), {
              type: `${phase}-timeout`,
            }),
          );
        };
        entered();
      });
    r.fetch = async (url, options) => {
      if (!String(url).includes('tibber')) return fetch(url, options);
      timeoutMs = options.timeout;
      assert.ok(timeoutMs > 0 && 2 * timeoutMs < 60000);
      assert.equal(options.redirect, 'error');
      assert.equal(options.compress, false);
      options.agent.sockets.synthetic = [
        {
          destroy() {
            socketDestroyed = true;
          },
        },
      ];
      if (phase === 'request') return neverResponding();
      return {
        ok: true,
        json: neverResponding,
        body: {
          destroy() {
            bodyDestroyed = true;
          },
        },
      };
    };
    const pending = run(r);
    await requestEntered;
    assert.notEqual(
      r.homeyMock.getLogicValue('SmartChargeRuntimeLock'),
      'null',
    );
    assert.equal(r.homeyMock.devices.plug.capabilitiesObj.onoff.value, false);
    // Advance the mocked transport deadline, without wall-clock sleeping.
    expire();
    const result = await pending;
    assert.equal(cancelled, true);
    assert.equal(bodyDestroyed, phase === 'body');
    assert.equal(socketDestroyed, true);
    assert.equal(result.preliminaryPlan.available, false);
    assert.match(result.preliminaryPlan.reason, /Tibber request timed out/);
    assert.equal(r.homeyMock.getLogicValue('SmartChargeRuntimeLock'), 'null');
    assert.equal(result.preliminaryPlan.plannedStart, null);
    const logic = r.homeyMock.getLogicSnapshot();
    lateResponse({
      ok: true,
      json: async () => {
        throw new Error('Late response must not be read');
      },
    });
    await Promise.resolve();
    assert.deepEqual(r.homeyMock.getLogicSnapshot(), logic);
    r.fetch = fetch;
    const next = await run(r);
    assert.equal(next.preliminaryPlan.available, true);
    assert.equal(next.skipped, undefined);
    assert.equal(r.homeyMock.getLogicValue('SmartChargeRuntimeLock'), 'null');
    noOn(r);
  }
  for (const elapsedMs of [50000, 56000]) {
    const r = make();
    const baseTime = Date.parse(now);
    let clockTime = baseTime;
    class LeaseDate extends Date {
      constructor(...args) {
        super(...(args.length ? args : [clockTime]));
      }
      static now() {
        return clockTime;
      }
    }
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const execute = new AsyncFunction(
      'Homey',
      'fetch',
      'https',
      'log',
      'Date',
      `${loader.sharedCode}\nreturn await runRuntimeController();`,
    );
    r.scriptLoader = {
      executeFlow({ homey, fetch, log }) {
        return execute(homey, fetch, require('https'), log, LeaseDate);
      },
    };
    const getDevices = r.homeyMock.api.devices.getDevices;
    r.homeyMock.api.devices.getDevices = async () => {
      if (r.homeyMock.getLogicValue('SmartChargeRuntimeLock') !== 'null')
        clockTime = baseTime + elapsedMs;
      return getDevices();
    };
    const fetch = r.fetch;
    let requested = false;
    r.fetch = async (url, options) => {
      if (String(url).includes('tibber')) {
        requested = true;
        assert.equal(options.timeout, 2500);
        throw Object.assign(new Error('Native transport timeout'), {
          type: 'request-timeout',
        });
      }
      return fetch(url, options);
    };
    const result = await run(r);
    assert.equal(requested, elapsedMs === 50000);
    assert.equal(result.preliminaryPlan.available, false);
    assert.match(
      result.preliminaryPlan.reason,
      elapsedMs === 50000 ? /timed out/ : /lease budget exhausted/,
    );
    assert.equal(r.homeyMock.getLogicValue('SmartChargeRuntimeLock'), 'null');
  }
  console.log(
    'PASS Preliminary native request/body timeout: OFF priority, cancellation, unavailable result, RuntimeLock release and next watchdog',
  );
}
async function nullSocRegressions() {
  function charging() {
    const r = make('BATTERY_FULL', null, now);
    authorize(r);
    r.homeyMock.setLogicValues({ SmartChargeShouldCharge: true });
    r.homeyMock.setDeviceState('mercedes', {
      capabilitiesObj: {
        text_charging_status: { value: 'Charge break', lastUpdated: now },
      },
    });
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: { onoff: true, measure_power: 2600 },
    });
    return r;
  }
  const r = charging();
  const session = r.homeyMock.getLogicValue('ChargeConnectedAt');
  const result = await run(r);
  assert.equal(result.plannerShouldCharge, true);
  assert.equal(result.desiredPlugState, false);
  assert.equal(result.continuingExistingCharge, true);
  assert.equal(result.actualPlugState, true);
  assert.equal(result.action, 'none');
  assert.equal(result.sessionActive, true);
  assert.equal(result.preliminaryPlan.available, false);
  assert.match(result.preliminaryPlan.reason, /Battery telemetry unavailable/);
  assert.equal(r.homeyMock.getLogicValue('SmartChargeShouldCharge'), true);
  assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), session);
  assert.equal(r.homeyMock.devices.plug.commands.length, 0);
  const recovered = await run(r, 'runtime-controller', fresh);
  assert.equal(recovered.preliminaryPlan, null);
  assert.equal(recovered.plannerShouldCharge, true);
  assert.equal(recovered.action, 'none');
  assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), session);
  noOn(r);

  const off = charging();
  off.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { onoff: false, measure_power: 0 },
  });
  const blockedOn = await run(off);
  assert.equal(blockedOn.desiredPlugState, false);
  assert.equal(blockedOn.continuingExistingCharge, false);
  assert.equal(blockedOn.action, 'none');
  noOn(off);

  for (const safetyCase of [
    'user-stop',
    'durable-block',
    'no-grant',
    'expired',
    'waiting',
    'disconnect',
    'low-power',
  ]) {
    const stopped = charging();
    if (safetyCase === 'user-stop') {
      stopped.homeyMock.setLogicValues({
        SmartChargeManualState: make('USER_STOP').homeyMock.getLogicValue(
          'SmartChargeManualState',
        ),
      });
    } else if (safetyCase === 'durable-block') {
      stopped.homeyMock.setLogicValues({ SmartChargeAutoStartBlocked: true });
    } else if (safetyCase === 'no-grant') {
      stopped.homeyMock.setLogicValues({
        SmartChargeManualState: JSON.stringify({
          ...JSON.parse(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState),
          autoGrant: null,
        }),
      });
    } else if (safetyCase === 'expired') {
      stopped.homeyMock.setLogicValues({
        ChargeConnectedAt: '2026-07-06 18:00:00',
      });
    } else if (safetyCase === 'waiting') {
      stopped.homeyMock.setLogicValues({ SmartChargeShouldCharge: false });
    } else {
      stopped.homeyMock.setDeviceState('plug', {
        capabilitiesObj: { measure_power: 0 },
      });
      if (safetyCase === 'disconnect')
        stopped.homeyMock.setDeviceState('mercedes', {
          capabilitiesObj: {
            text_charging_status: { value: 'Unplugged', lastUpdated: now },
          },
        });
    }
    const denied = await run(stopped);
    assert.equal(denied.action, 'switched_off', safetyCase);
    assert.equal(denied.actualPlugState, false, safetyCase);
    assert.equal(denied.continuingExistingCharge === true, false, safetyCase);
    if (safetyCase === 'expired') {
      assert.equal(denied.sessionActive, false);
      assert.equal(
        stopped.homeyMock.getLogicValue('SmartChargeSessionStatus'),
        'expired',
      );
    }
    noOn(stopped);
  }
  console.log(
    'PASS Transient null SOC: preserve measured charging and Session, resume fresh planning, deny new ON and prioritize stop/expiry/disconnect/waiting',
  );
}
async function disconnectRegressions() {
  const prepare = (session = '2026-07-07 18:00:00') => {
    const r = make('BATTERY_FULL', 23, old);
    authorize(r, session);
    Object.assign(r.homeyMock.devices.mercedes, {
      driverId: 'homey:app:com.mercedes.mbapi:mercedes-vehicle',
      available: true,
      warningMessage: null,
      lastSeenAt: now,
    });
    r.homeyMock.setDeviceState('mercedes', {
      capabilitiesObj: {
        text_charging_status: { value: 'Charge break', lastUpdated: old },
      },
    });
    return r;
  };
  const noSession = prepare('null');
  noSession.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: { onoff_connector: { value: false, lastUpdated: now } },
  });
  const denied = await run(noSession);
  assert.equal(denied.sessionActive, false);
  assert.equal(noSession.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  noOn(noSession);

  const shadow = prepare();
  shadow.homeyMock.setLogicValues({ SmartChargeRuntimeMode: 'shadow' });
  shadow.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: { onoff_connector: { value: false, lastUpdated: now } },
  });
  shadow.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { onoff: true, measure_power: 2600 },
  });
  const shadowLogic = shadow.homeyMock.getLogicSnapshot();
  assert.equal((await run(shadow)).action, 'would_switch_off');
  assert.deepEqual(shadow.homeyMock.getLogicSnapshot(), shadowLogic);
  assert.equal(shadow.homeyMock.devices.plug.commands.length, 0);

  const blockedAuto = prepare('null');
  blockedAuto.homeyMock.setLogicValues({ SmartChargeAutoStartBlocked: true });
  blockedAuto.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: { onoff_connector: { value: false, lastUpdated: now } },
  });
  assert.equal((await run(blockedAuto, 'auto-mode')).autoStartBlocked, true);
  noOn(blockedAuto);
  assert.equal((await run(blockedAuto, 'manual-on')).actualPlugState, true);
  assert.equal(
    blockedAuto.homeyMock.getLogicValue('SmartChargeManualMode'),
    true,
  );

  const disconnectDuringPlan = prepare();
  const fetch = disconnectDuringPlan.fetch;
  disconnectDuringPlan.fetch = async (...args) => {
    const response = await fetch(...args);
    if (String(args[0]).includes('tibber'))
      disconnectDuringPlan.homeyMock.setDeviceState('mercedes', {
        capabilitiesObj: {
          onoff_connector: { value: false, lastUpdated: now },
        },
      });
    return response;
  };
  assert.equal((await run(disconnectDuringPlan)).action, 'on_blocked');
  noOn(disconnectDuringPlan);

  const failedOff = prepare();
  failedOff.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: { onoff_connector: { value: false, lastUpdated: now } },
  });
  failedOff.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { onoff: true, measure_power: 2600 },
    failSetCapabilityValue: true,
  });
  await assert.rejects(run(failedOff), /setCapabilityValue failed/);
  assert.equal(
    failedOff.homeyMock.getLogicValue('ChargeConnectedAt'),
    '2026-07-07 18:00:00',
  );
  assert.equal(
    failedOff.homeyMock.devices.plug.capabilitiesObj.onoff.value,
    true,
  );

  for (const observation of [
    { value: null, lastUpdated: now },
    { value: false },
    { value: false, lastUpdated: old },
    { value: false, lastUpdated: '2026-07-07T20:16:00+02:00' },
  ]) {
    const r = prepare('null');
    r.homeyMock.setDeviceState('mercedes', {
      capabilitiesObj: { onoff_connector: observation },
    });
    assert.equal((await run(r)).sessionActive, true);
  }

  for (const evidence of ['connector', 'stale-charging', 'unknown-charging']) {
    const r = prepare();
    const explicitConnector = evidence === 'connector';
    const timestamp = explicitConnector
      ? now
      : evidence === 'unknown-charging'
        ? null
        : old;
    r.homeyMock.setDeviceState('mercedes', {
      capabilitiesObj: {
        text_charging_status: {
          value: explicitConnector ? 'Charge break' : 'Unplugged',
          lastUpdated: now,
        },
        onoff_connector: {
          value: explicitConnector ? false : null,
          lastUpdated: now,
        },
        onoff_charging: { value: true, lastUpdated: timestamp },
        measure_charge_power: {
          value: 2.6,
          units: 'kW',
          lastUpdated: timestamp,
        },
      },
    });
    r.homeyMock.setDeviceState('plug', {
      capabilitiesObj: {
        onoff: true,
        measure_power: explicitConnector ? 2600 : 0,
      },
    });
    const first = await run(r);
    assert.equal(first.action, 'switched_off', evidence);
    assert.equal(
      first.proposedLifecycleAction,
      'suspected_disconnect',
      evidence,
    );
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeDisconnectObservedAt'),
      new Date(now).toISOString(),
      evidence,
    );
    const later = '2026-07-07T20:31:00+02:00';
    r.homeyMock.devices.mercedes.lastSeenAt = later;
    const completed = await r.runStep({
      flow: 'runtime-controller',
      now: later,
    });
    assert.equal(completed.error, null);
    assert.equal(completed.logic.ChargeConnectedAt, 'null', evidence);
    assert.equal(
      completed.logic.SmartChargeSessionStatus,
      'disconnected',
      evidence,
    );
    assert.equal(completed.devices.plug.capabilitiesObj.onoff.value, false);
    assert.equal(completed.result.continuingExistingCharge, false);
    if (explicitConnector) {
      const reconnectedAt = '2026-07-07T20:32:00+02:00';
      const reconnected = await r.runStep({
        flow: 'connection-evidence',
        now: reconnectedAt,
        set: {
          devices: {
            mercedes: {
              capabilitiesObj: {
                onoff_connector: { value: true, lastUpdated: reconnectedAt },
                text_charging_status: {
                  value: 'Charge break',
                  lastUpdated: reconnectedAt,
                },
                onoff_charging: { value: false, lastUpdated: reconnectedAt },
                measure_charge_power: {
                  value: 0,
                  units: 'kW',
                  lastUpdated: reconnectedAt,
                },
              },
            },
            plug: { capabilitiesObj: { measure_power: 0 } },
          },
        },
      });
      assert.equal(reconnected.error, null);
      assert.equal(reconnected.logic.ChargeConnectedAt, '2026-07-07 20:32:00');
      assert.equal(reconnected.logic.SmartChargeAutoStartBlocked, false);
      assert.equal(reconnected.logic.SmartChargeDisconnectObservedAt, 'null');
    }
  }
  console.log(
    'PASS Disconnect: explicit fresh connector OFF, no phantom Session, stale charging cannot reset confirmation; missing/stale/future connector remains unknown',
  );
}

async function midnightConnectionRegression() {
  const r = make('BATTERY_FULL', 50, old);
  authorize(r, 'null');
  const connectedAt = '2026-07-08T03:00:00+02:00';
  const first = await r.runStep({
    flow: 'connection-evidence',
    now: connectedAt,
    fixture: 'cheap-night',
    set: {
      devices: {
        mercedes: {
          capabilitiesObj: {
            measure_battery: { value: 50, lastUpdated: connectedAt },
            text_charging_status: {
              value: 'Charge break',
              lastUpdated: connectedAt,
            },
          },
        },
      },
    },
  });
  assert.equal(first.error, null);
  assert.equal(first.logic.ChargeConnectedAt, '2026-07-08 03:00:00');
  assert.equal(first.logic.SmartChargeTargetDeparture, '2026-07-08 07:30:00');
  assert.equal(first.result.action, 'switched_on');
  const expired = await r.runStep({
    flow: 'runtime-controller',
    now: '2026-07-08T07:35:00+02:00',
    fixture: 'cheap-night',
  });
  assert.equal(expired.error, null);
  assert.equal(expired.result.terminalState, 'expired');
  assert.equal(expired.result.targetDeparture, '2026-07-08 07:30:00');
  assert.equal(expired.logic.ChargeConnectedAt, 'null');
  assert.equal(expired.devices.plug.capabilitiesObj.onoff.value, false);
  console.log(
    'PASS Midnight connection targets the same morning; expiry does not move an active Session to the next day',
  );
}

async function main() {
  // A stationary car can keep reporting unchanged SOC/status. Homey retains
  // their change timestamps while updating the responding device's heartbeat.
  const parked = make('BATTERY_FULL', 23, old);
  const parkedDevice = parked.homeyMock.devices.mercedes;
  Object.assign(parkedDevice, {
    driverId: 'homey:app:com.mercedes.mbapi:mercedes-vehicle',
    available: true,
    warningMessage: null,
    lastSeenAt: now,
  });
  parked.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: {
      text_charging_status: { value: 'Charge break', lastUpdated: old },
    },
  });
  const parkedResult = await run(parked, 'auto-mode');
  assert.equal(parkedResult.sessionActive, true);
  assert.equal(parkedResult.action, 'switched_on');
  assert.equal(parkedDevice.capabilitiesObj.measure_battery.lastUpdated, old);
  parked.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { onoff: false, measure_power: 0 },
  });
  parkedDevice.lastSeenAt = old;
  const unresponsive = await run(parked);
  assert.equal(unresponsive.desiredPlugState, false);
  assert.equal(unresponsive.action, 'none');
  assert.equal(parked.homeyMock.devices.plug.commands.length, 1);

  for (const reason of ['BATTERY_FULL', 'USER_STOP']) {
    const r = make(reason);
    const saved = r.homeyMock.getLogicValue('SmartChargeManualState');
    const result = await run(r);
    assert.equal(result.preliminaryPlan.available, true);
    assert.equal(result.preliminaryPlan.battery, 69);
    assert.equal(result.preliminaryPlan.batteryFreshness, 'STALE');
    assert.equal(result.preliminaryPlan.batteryAgeMinutes, 615);
    assert.ok(result.preliminaryPlan.plannedStart);
    assert.equal(result.preliminaryPlan.shouldChargeNow, false);
    assert.equal(r.homeyMock.getLogicValue('SmartChargeShouldCharge'), false);
    assert.equal(r.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeSessionStatus'),
      'completed',
    );
    assert.equal(r.homeyMock.getLogicValue('SmartChargeManualState'), saved);
    assert.equal(
      r.homeyMock.getLogicValue('SmartChargeConnectionEvidenceAt'),
      'null',
    );
    assert.match(
      r.homeyMock.getLogicValue('SmartChargeReason'),
      /Preliminary.*STALE/,
    );
    await Promise.all([run(r), run(r)]);
    noOn(r);
  }
  const absent = make(null, 20, now);
  absent.homeyMock.setLogicValues({
    SmartChargeAutoStartBlocked: false,
    SmartChargeManualState: JSON.stringify({
      ...JSON.parse(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState),
      autoGrant: null,
    }),
  });
  const noGrant = await run(absent, 'runtime-controller', fresh);
  assert.equal(noGrant.autoStartBlocked, true);
  assert.equal(noGrant.preliminaryPlan.available, true);
  noOn(absent);

  const unavailable = make('BATTERY_FULL', null);
  assert.match(
    (await run(unavailable)).preliminaryPlan.reason,
    /Battery telemetry unavailable/,
  );
  const noTariff = make();
  noTariff.homeyMock.setLogicValues({ TIBBER_ACCESS_TOKEN: 'null' });
  assert.match(
    (await run(noTariff)).preliminaryPlan.reason,
    /Tibber access token is missing/,
  );
  await run(noTariff, 'manual-on');
  assert.equal(
    noTariff.homeyMock.devices.plug.capabilitiesObj.onoff.value,
    true,
  );

  const stale = make();
  await run(stale, 'auto-mode');
  assert.equal(
    stale.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
    true,
  );
  noOn(stale);
  const socOnly = make();
  await run(socOnly, 'auto-mode', {
    devices: {
      mercedes: {
        capabilitiesObj: {
          measure_battery: { value: 20, lastUpdated: now },
        },
      },
    },
  });
  assert.equal(socOnly.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  noOn(socOnly);

  // No connection-evidence Flow: a real fresh provider status is sufficient.
  const normal = make();
  const auto = await run(normal, 'auto-mode', fresh);
  assert.equal(
    normal.homeyMock.getLogicValue('SmartChargeAutoStartBlocked'),
    false,
  );
  assert.notEqual(normal.homeyMock.getLogicValue('ChargeConnectedAt'), 'null');
  assert.equal(auto.sessionActive, true);
  assert.equal(auto.action, 'switched_on');
  assert.equal(
    JSON.parse(normal.homeyMock.getLogicValue('SmartChargeManualState'))
      .stopReason,
    'BATTERY_FULL',
  );

  // Re-read provider evidence after planning, before a physical ON.
  const changed = make();
  const fetch = changed.fetch;
  changed.fetch = async (...args) => {
    const response = await fetch(...args);
    if (changed.tibberCalls)
      changed.homeyMock.setDeviceState('mercedes', {
        capabilitiesObj: { measure_battery: { value: 20, lastUpdated: old } },
      });
    return response;
  };
  assert.equal((await run(changed, 'auto-mode', fresh)).action, 'on_blocked');
  noOn(changed);
  await reviewRegressions();
  await preliminaryTimeoutRegressions();
  await nullSocRegressions();
  await disconnectRegressions();
  await midnightConnectionRegression();
  console.log(
    'PASS Automatic lifecycle: preliminary plans, missing inputs, no grant, stale SOC, USER_STOP, provider-only AUTO and pre-ON revalidation',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
