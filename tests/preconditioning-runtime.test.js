const assert = require('assert/strict');
const path = require('path');
const { ScriptLoader } = require('../simulator/runtime/script-loader');
const { SimulatorRuntime } = require('../simulator/runtime/simulator-runtime');
const {
  DEFAULT_LOGIC_VARIABLES,
} = require('../simulator/runtime/default-state');
const loader = new ScriptLoader(path.resolve(__dirname, '..'));
const now = '2026-07-07T18:05:00+02:00';
function make(battery = 100, session = false) {
  return new SimulatorRuntime({
    scriptLoader: loader,
    logWriter: {
      events: [],
      append({ payload }) {
        this.events.push(payload);
      },
    },
    scenario: {
      name: 'preconditioning',
      now,
      fixture: 'normal-day',
      initial: {
        logic: {
          SmartChargeRuntimeMode: 'active',
          ChargeConnectedAt: session ? '2026-07-07 17:00:00' : 'null',
          SmartChargeSessionStatus: session ? 'active' : 'completed',
        },
        devices: {
          mercedes: {
            capabilitiesObj: {
              measure_battery: { value: battery, lastUpdated: now },
              text_charging_status: { value: 'Charge break', lastUpdated: now },
              onoff_precond: { value: true, lastUpdated: now },
            },
          },
        },
      },
    },
  });
}
async function run(r, options = {}) {
  const out = await r.runStep({ flow: 'runtime-controller', now, ...options });
  if (out.error) throw out.error;
  return out;
}
const power = (r) => r.homeyMock.devices.plug.capabilitiesObj.onoff.value;
const commands = (r) => r.homeyMock.devices.plug.commands.map((c) => c.value);
const patch = (capabilitiesObj) => ({
  devices: { mercedes: { capabilitiesObj } },
});
async function powerCutRecoveryRegressions() {
  const at = (minute) =>
    `2026-07-07T18:${String(minute).padStart(2, '0')}:00+02:00`;
  const getState = (r) =>
    JSON.parse(r.homeyMock.getLogicSnapshot().SmartChargePreconditioningState);
  function provider(r, seenAt) {
    Object.assign(r.homeyMock.devices.mercedes, {
      driverId: 'homey:app:com.mercedes.mbapi:mercedes-vehicle',
      available: true,
      lastSeenAt: seenAt,
    });
  }
  async function cutFixture(battery = 50, session = true, load = 600) {
    const r = make(battery, session);
    provider(r, now);
    await run(r);
    await run(r, {
      now: at(6),
      set: {
        devices: {
          mercedes: {
            capabilitiesObj: {
              onoff_precond: { value: false, lastUpdated: at(6) },
              text_charging_status: {
                value: 'Charge break',
                lastUpdated: at(6),
              },
            },
          },
          plug: {
            capabilitiesObj: {
              measure_power: { value: load, lastUpdated: at(6) },
            },
          },
        },
      },
    });
    assert.equal(power(r), false);
    assert.ok(
      getState(r).powerCut,
      'Successful ordinary OFF with fresh connection/load must retain cut evidence',
    );
    return r;
  }
  const failure = (timestamp, climate = true) =>
    patch({
      text_charging_status: { value: 'Failure', lastUpdated: timestamp },
      onoff_charging: { value: false, lastUpdated: timestamp },
      measure_charge_power: { value: 0, units: 'kW', lastUpdated: timestamp },
      onoff_precond: { value: climate, lastUpdated: timestamp },
    });
  const climate = await cutFixture(100, true, 0);
  provider(climate, at(7));
  const resumed = await run(climate, { now: at(7), set: failure(at(7)) });
  assert.equal(resumed.result.runtimeState, 'PRECONDITIONING');
  assert.equal(
    power(climate),
    true,
    'Own OFF-induced Failure must permit a bounded climate restart at 100%',
  );
  const unknownFailure = make(50, true);
  provider(unknownFailure, now);
  await run(unknownFailure, {
    set: patch({
      text_charging_status: { value: 'Failure', lastUpdated: now },
      onoff_charging: { value: true, lastUpdated: now },
    }),
  });
  assert.equal(
    power(unknownFailure),
    false,
    'Retained charging true must not bypass an unknown Failure',
  );
  assert.ok(
    getState(climate).powerCut.usedAt,
    'Spend the recovery before issuing ON',
  );
  const notConfirmed = await run(climate, { now: at(12) });
  assert.equal(power(climate), false);
  assert.equal(
    notConfirmed.result.preconditioningStopReason,
    'RECOVERY_UNCONFIRMED',
  );
  await run(climate, { now: at(17) });
  assert.equal(
    power(climate),
    false,
    'Unconfirmed recovery cannot retry on retained Failure/true',
  );

  const planned = await cutFixture();
  const night = '2026-07-08T02:05:00+02:00';
  provider(planned, night);
  const plan = await run(planned, { now: night, set: failure(night, false) });
  assert.equal(plan.result.plannerShouldCharge, true);
  assert.equal(
    power(planned),
    true,
    'Own OFF-induced Failure must not deadlock the next tariff window',
  );

  const idleAfterHeat = make(100, false);
  provider(idleAfterHeat, now);
  await run(idleAfterHeat);
  await run(idleAfterHeat, {
    now: at(6),
    set: {
      devices: {
        plug: {
          capabilitiesObj: {
            measure_power: { value: 600, lastUpdated: at(6) },
          },
        },
      },
    },
  });
  await run(idleAfterHeat, {
    now: at(7),
    set: {
      devices: {
        mercedes: {
          capabilitiesObj: {
            onoff_precond: { value: false, lastUpdated: at(7) },
          },
        },
        plug: {
          capabilitiesObj: { measure_power: { value: 0, lastUpdated: at(7) } },
        },
      },
    },
  });
  assert.ok(
    getState(idleAfterHeat).powerCut,
    'A recently observed heater load can reach zero before ordinary OFF',
  );
  provider(idleAfterHeat, at(8));
  await run(idleAfterHeat, { now: at(8), set: failure(at(8)) });
  assert.equal(power(idleAfterHeat), true);
  assert.equal(
    getState(planned).status,
    'RUNNING',
    'A tariff recovery also needs startup/load protection',
  );
  const confirmedAt = '2026-07-08T02:10:00+02:00';
  provider(planned, confirmedAt);
  await run(planned, {
    now: confirmedAt,
    set: {
      devices: {
        mercedes: {
          capabilitiesObj: {
            text_charging_status: {
              value: 'Charging',
              lastUpdated: confirmedAt,
            },
            onoff_charging: { value: true, lastUpdated: confirmedAt },
          },
        },
        plug: {
          capabilitiesObj: {
            measure_power: { value: 2600, lastUpdated: confirmedAt },
          },
        },
      },
    },
  });
  assert.equal(
    power(planned),
    true,
    'Confirmed vehicle charging continues normally',
  );

  for (const change of [
    'no-proof',
    'expired',
    'disconnect',
    'warning',
    'stale-heartbeat',
    'other-session',
    'pre-existing-failure',
  ]) {
    const r = await cutFixture(
      change === 'expired' ? 100 : 50,
      change !== 'expired',
    );
    let timestamp = at(7);
    if (change === 'expired') timestamp = at(40);
    provider(r, timestamp);
    if (change === 'no-proof') {
      const state = getState(r);
      state.powerCut = null;
      r.homeyMock.setLogicValues({
        SmartChargePreconditioningState: JSON.stringify(state),
      });
    }
    if (change === 'warning')
      r.homeyMock.devices.mercedes.warningMessage = 'provider warning';
    if (change === 'stale-heartbeat')
      r.homeyMock.devices.mercedes.lastSeenAt = '2026-07-07T16:00:00+02:00';
    if (change === 'other-session')
      r.homeyMock.setLogicValues({ ChargeConnectedAt: '2026-07-07 17:10:00' });
    const set = failure(timestamp);
    if (change === 'pre-existing-failure')
      set.devices.mercedes.capabilitiesObj.text_charging_status.lastUpdated =
        at(5);
    if (change === 'disconnect')
      set.devices.mercedes.capabilitiesObj.onoff_connector = {
        value: false,
        lastUpdated: timestamp,
      };
    await run(r, { now: timestamp, set });
    assert.equal(power(r), false, 'Failure recovery must reject ' + change);
  }

  const shadow = await cutFixture();
  provider(shadow, at(7));
  const projected = failure(at(7));
  projected.logic = { SmartChargeRuntimeMode: 'shadow' };
  const shadowResult = await run(shadow, { now: at(7), set: projected });
  assert.equal(shadowResult.result.action, 'would_switch_on');
  assert.deepEqual(
    shadowResult.logic,
    shadowResult.logicBefore,
    'Shadow cannot spend expected-cut permission',
  );

  const stoppedDuringReservation = await cutFixture();
  provider(stoppedDuringReservation, at(7));
  const update = stoppedDuringReservation.homeyMock.api.logic.updateVariable;
  stoppedDuringReservation.homeyMock.api.logic.updateVariable = async (
    args,
  ) => {
    const result = await update(args);
    if (
      args.id === 'SmartChargePreconditioningState' &&
      JSON.parse(args.variable.value).powerCut?.usedAt
    )
      stoppedDuringReservation.homeyMock.setLogicValues({
        SmartChargeAutoStartBlocked: true,
        SmartChargeUserStopToken: 'new-stop',
      });
    return result;
  };
  const beforeCommands = commands(stoppedDuringReservation).length;
  await run(stoppedDuringReservation, { now: at(7), set: failure(at(7)) });
  assert.equal(power(stoppedDuringReservation), false);
  assert.equal(
    commands(stoppedDuringReservation).length,
    beforeCommands,
    'Stop during reservation must block ON before the command',
  );

  const ack = make(50, true);
  provider(ack, now);
  await run(ack);
  const setCapability = ack.homeyMock.devices.plug.setCapabilityValue.bind(
    ack.homeyMock.devices.plug,
  );
  ack.homeyMock.devices.plug.setCapabilityValue = async (capability, value) => {
    await setCapability(capability, value);
    if (!value)
      ack.homeyMock.failLogicUpdateVariableNames.add(
        'SmartChargePreconditioningState',
      );
  };
  await assert.rejects(
    () =>
      run(ack, {
        now: at(6),
        set: {
          devices: {
            mercedes: {
              capabilitiesObj: {
                onoff_precond: { value: false, lastUpdated: at(6) },
                text_charging_status: {
                  value: 'Charge break',
                  lastUpdated: at(6),
                },
              },
            },
            plug: {
              capabilitiesObj: {
                measure_power: { value: 600, lastUpdated: at(6) },
              },
            },
          },
        },
      }),
    /updateVariable failed/,
  );
  assert.equal(power(ack), false);
  const eventTypes = ack.logWriter.events.map((e) => e.eventType);
  assert.notEqual(eventTypes.lastIndexOf('smartcharge_off'), -1);
  assert.ok(
    eventTypes.lastIndexOf('smartcharge_off') <
      eventTypes.lastIndexOf('smartcharge_error'),
    'Preserve OFF ACK before state-write error',
  );
  assert.equal(
    ack.homeyMock.getLogicSnapshot().SmartChargeAutoStartBlocked,
    true,
  );
  console.log(
    'PASS expected-cut recovery: next climate/tariff ON, one bounded attempt, native charging confirmation, and denial without valid cut/context',
  );
}
async function idlePowerRegressions() {
  const at = (minute) =>
    `2026-07-07T18:${String(minute).padStart(2, '0')}:00+02:00`;
  const sample = (minute, value) => ({
    now: at(minute),
    set: {
      devices: {
        plug: {
          capabilitiesObj: {
            measure_power: { value, lastUpdated: at(minute) },
          },
        },
      },
    },
  });
  const state = (r) =>
    JSON.parse(r.homeyMock.getLogicSnapshot().SmartChargePreconditioningState);
  const r = make();
  await run(r);
  await run(r, sample(10, 600));
  assert.equal(state(r).consumed, true);
  await run(r, sample(15, 5));
  assert.equal(power(r), true, 'One idle sample must not stop immediately');
  const stopped = await run(r, sample(20, 2));
  assert.equal(
    power(r),
    false,
    'Unplugged car with retained climate/status must leave the socket OFF',
  );
  assert.equal(stopped.result.preconditioningStopReason, 'LOW_POWER');
  assert.equal(state(r).status, 'INHIBITED');
  const count = commands(r).length;
  await run(r, {
    now: at(25),
    set: patch({ measure_battery: { value: 99, lastUpdated: at(25) } }),
  });
  assert.equal(
    power(r),
    false,
    'SOC decrease alone cannot re-energize an empty socket',
  );
  assert.equal(
    commands(r).length,
    count,
    'Repeated script scope must preserve the inhibit',
  );
  await run(r, {
    now: at(26),
    set: patch({
      text_charging_status: { value: 'Unplugged', lastUpdated: at(26) },
      measure_battery: { value: 90, lastUpdated: at(26) },
    }),
  });
  assert.equal(
    power(r),
    false,
    'Falling SOC during departure is not a reconnect',
  );
  await run(r, {
    now: at(27),
    set: patch({
      text_charging_status: { value: 'Charge break', lastUpdated: at(27) },
    }),
  });
  assert.equal(
    power(r),
    true,
    'Fresh reconnect permits climate power with SOC below 100',
  );

  const neverStarted = make(50, true);
  await run(neverStarted);
  const timedOut = await run(neverStarted, sample(10, 0));
  assert.equal(power(neverStarted), false);
  assert.equal(timedOut.result.preconditioningStopReason, 'START_TIMEOUT');
  await run(neverStarted, { now: at(15) });
  assert.equal(
    power(neverStarted),
    false,
    'No endless retry on the same climate true',
  );
  const explicitAuto = await run(neverStarted, {
    flow: 'auto-mode',
    now: at(16),
  });
  assert.equal(
    power(neverStarted),
    true,
    'Explicit AUTO can authorize a new attempt',
  );
  assert.equal(explicitAuto.result.runtimeState, 'PRECONDITIONING');

  const cycle = make();
  await run(cycle);
  await run(cycle, sample(10, 0));
  await run(cycle, {
    now: at(11),
    set: patch({ onoff_precond: { value: false, lastUpdated: at(11) } }),
  });
  await run(cycle, {
    now: at(12),
    set: patch({ onoff_precond: { value: true, lastUpdated: at(12) } }),
  });
  assert.equal(
    power(cycle),
    true,
    'A new OFF/ON climate cycle permits a bounded new attempt',
  );

  const unavailable = make();
  await run(unavailable);
  await run(unavailable, sample(10, 600));
  const lost = await run(unavailable, { now: at(20) });
  assert.equal(lost.result.preconditioningStopReason, 'POWER_UNAVAILABLE');
  assert.equal(
    power(unavailable),
    false,
    'Missing power telemetry cannot leave climate power on forever',
  );

  const failed = make();
  await run(failed);
  await run(failed, sample(10, 600));
  await run(failed, sample(15, 0));
  failed.homeyMock.devices.plug.failSetCapabilityValue = true;
  await assert.rejects(
    () => run(failed, sample(20, 0)),
    /setCapabilityValue failed/,
  );
  assert.equal(power(failed), true);
  assert.equal(
    state(failed).status,
    'INHIBITED',
    'Failed OFF must keep ON inhibited',
  );
  failed.homeyMock.devices.plug.failSetCapabilityValue = false;
  await run(failed, { now: at(25) });
  assert.equal(
    power(failed),
    false,
    'Next watchdog retries OFF instead of creating a new activation',
  );

  const brokenState = make();
  const broken = await run(brokenState, {
    set: { logic: { SmartChargePreconditioningState: '{broken' } },
  });
  assert.equal(broken.result.autoStartBlocked, true);
  assert.equal(power(brokenState), false);
  const missingState = make();
  delete missingState.homeyMock.logicVariables.SmartChargePreconditioningState;
  const missing = await run(missingState);
  assert.equal(missing.result.autoStartBlocked, true);
  assert.equal(power(missingState), false);

  const failedPersistence = make();
  failedPersistence.homeyMock.failLogicUpdateVariableNames.add(
    'SmartChargePreconditioningState',
  );
  await assert.rejects(() => run(failedPersistence), /updateVariable failed/);
  assert.equal(power(failedPersistence), false);
  assert.equal(
    failedPersistence.homeyMock.getLogicSnapshot().SmartChargeAutoStartBlocked,
    true,
  );

  const disconnectedSession = make(50, true);
  await run(disconnectedSession);
  await run(disconnectedSession, {
    now: at(10),
    set: patch({
      text_charging_status: { value: 'Unplugged', lastUpdated: at(10) },
    }),
  });
  assert.equal(power(disconnectedSession), false);
  const closed = await run(disconnectedSession, { now: at(25) });
  assert.equal(closed.logic.ChargeConnectedAt, 'null');
  assert.equal(
    closed.logic.SmartChargeSessionStatus,
    'disconnected',
    'Power inhibition must preserve 15-minute Session cleanup',
  );

  const shadowInhibited = make();
  const rawInhibited = JSON.stringify(state(failed));
  const shadowResult = await run(shadowInhibited, {
    now: at(26),
    set: {
      logic: {
        SmartChargeRuntimeMode: 'shadow',
        SmartChargePreconditioningState: rawInhibited,
      },
      devices: {
        mercedes: {
          capabilitiesObj: {
            onoff_precond: { value: false, lastUpdated: at(26) },
          },
        },
      },
    },
  });
  assert.deepEqual(
    shadowResult.logic,
    shadowResult.logicBefore,
    'Shadow cannot save OFF/cycle/timer observations',
  );
  assert.deepEqual(commands(shadowInhibited), []);

  const stateWriteFailedWhileOn = make();
  await run(stateWriteFailedWhileOn);
  stateWriteFailedWhileOn.homeyMock.failLogicUpdateVariableNames.add(
    'SmartChargePreconditioningState',
  );
  await assert.rejects(
    () => run(stateWriteFailedWhileOn, sample(10, 600)),
    /updateVariable failed/,
  );
  assert.equal(
    power(stateWriteFailedWhileOn),
    false,
    'Lost durable state while ON must fail OFF',
  );
  assert.equal(
    stateWriteFailedWhileOn.homeyMock.getLogicSnapshot()
      .SmartChargeAutoStartBlocked,
    true,
  );
  console.log(
    'PASS idle climate power: delayed Mercedes unplug, durable OFF latch, startup timeout, new connection/cycle/AUTO, stale power, failed OFF and persistence',
  );
}
(async () => {
  for (const battery of [50, 100, null]) {
    const r = make(battery);
    const fetch = r.fetch;
    r.fetch = async (url, options) => {
      if (String(url).includes('tibber.com'))
        throw new Error('Preconditioning must not call Tibber');
      return fetch(url, options);
    };
    const out = await run(r);
    assert.equal(
      power(r),
      true,
      'Fresh Mercedes preconditioning should power the socket',
    );
    assert.equal(out.result.runtimeState, 'PRECONDITIONING');
    assert.equal(out.result.runtimeDecisionReason, 'PRECONDITIONING');
    assert.equal(out.logic.ChargeConnectedAt, 'null');
    assert.equal(out.tibberCallsDelta, 0);
    await run(r);
    assert.deepEqual(commands(r), [true], 'Repeated tick must not repeat ON');
  }

  const active = make(50, true);
  const before = active.homeyMock.getLogicSnapshot();
  const on = await run(active);
  for (const name of [
    'ChargeConnectedAt',
    'SmartChargeSessionStatus',
    'SmartChargePlannedStart',
    'SmartChargePlannedEnd',
    'SmartChargeShouldCharge',
    'SmartChargeAcceptedStrategy',
  ])
    assert.equal(on.logic[name], before[name], name + ' must be preserved');
  const ended = await run(active, { set: patch({ onoff_precond: false }) });
  assert.equal(ended.result.plannerShouldCharge, false);
  assert.equal(power(active), false);
  assert.equal(ended.logic.ChargeConnectedAt, before.ChargeConnectedAt);

  const planned = make(50, true);
  await run(planned, {
    now: '2026-07-08T02:04:00+02:00',
    set: patch({
      onoff_precond: { value: true, lastUpdated: '2026-07-08T02:04:00+02:00' },
      text_charging_status: {
        value: 'Charge break',
        lastUpdated: '2026-07-08T02:04:00+02:00',
      },
    }),
  });
  const backToPlan = await run(planned, {
    now: '2026-07-08T02:05:00+02:00',
    set: patch({
      onoff_precond: false,
      measure_battery: { value: 50, lastUpdated: '2026-07-08T02:05:00+02:00' },
      text_charging_status: {
        value: 'Charge break',
        lastUpdated: '2026-07-08T02:05:00+02:00',
      },
    }),
  });
  assert.equal(backToPlan.result.plannerShouldCharge, true);
  assert.equal(
    power(planned),
    true,
    'Tariff charging keeps power after climate ends',
  );
  assert.deepEqual(commands(planned), [true]);

  const full = make();
  await run(full);
  const fullEnd = await run(full, { set: patch({ onoff_precond: false }) });
  assert.equal(power(full), false);
  assert.equal(fullEnd.logic.ChargeConnectedAt, 'null');
  assert.equal(
    fullEnd.eventTypes.includes('session_start'),
    false,
    'No phantom charging Session at 100%',
  );

  for (const [capabilities, expectedOn] of [
    [
      {
        climate_active: { value: true, lastUpdated: now },
        onoff_precond: {
          value: false,
          lastUpdated: '2026-07-07T17:00:00+02:00',
        },
      },
      true,
    ],
    [
      {
        climate_active: { value: false, lastUpdated: now },
        onoff_precond: {
          value: true,
          lastUpdated: '2026-07-07T18:04:00+02:00',
        },
      },
      false,
    ],
    [{ climate_active: { value: false, lastUpdated: now } }, false],
    [{ onoff_precond: { value: 'true', lastUpdated: now } }, false],
  ]) {
    const r = make();
    await run(r, { set: patch(capabilities) });
    assert.equal(
      power(r),
      expectedOn,
      'Latest Boolean observation wins, with OFF on ties',
    );
  }

  for (const observedAt of [
    null,
    'invalid',
    '2026-07-07T17:34:59+02:00',
    '2026-07-07T18:06:00+02:00',
  ]) {
    const r = make(50, true);
    await run(r, {
      set: patch({ onoff_precond: { value: true, lastUpdated: observedAt } }),
    });
    assert.equal(
      power(r),
      false,
      'Unknown/stale/future preconditioning cannot request power',
    );
  }
  const stale = make();
  await run(stale);
  await run(stale, { now: '2026-07-07T18:35:00.001+02:00' });
  assert.equal(
    power(stale),
    false,
    'Old true must not keep the socket energized',
  );

  for (const capabilities of [
    { onoff_connector: { value: false, lastUpdated: now } },
    { text_charging_status: { value: 'Unplugged', lastUpdated: now } },
    {
      text_charging_status: {
        value: 'Charge break',
        lastUpdated: '2026-07-07T16:00:00+02:00',
      },
    },
  ]) {
    const r = make();
    await run(r, { set: patch(capabilities) });
    assert.equal(
      power(r),
      false,
      'Preconditioning requires fresh connection evidence',
    );
  }

  const blocked = make();
  await run(blocked, { set: { logic: { SmartChargeAutoStartBlocked: true } } });
  assert.equal(power(blocked), false);
  const noGrant = make();
  const state = JSON.parse(DEFAULT_LOGIC_VARIABLES.SmartChargeManualState);
  state.autoGrant = null;
  await run(noGrant, {
    set: { logic: { SmartChargeManualState: JSON.stringify(state) } },
  });
  assert.equal(power(noGrant), false);

  const shadow = make();
  const shadowOut = await run(shadow, {
    set: { logic: { SmartChargeRuntimeMode: 'shadow' } },
  });
  assert.equal(shadowOut.result.action, 'would_switch_on');
  assert.deepEqual(shadowOut.logic, shadowOut.logicBefore);
  assert.deepEqual(commands(shadow), []);

  const failedOn = make();
  failedOn.homeyMock.devices.plug.failSetCapabilityValue = true;
  await assert.rejects(() => run(failedOn), /setCapabilityValue failed/);
  assert.equal(
    failedOn.homeyMock.getLogicSnapshot().SmartChargeAutoStartBlocked,
    true,
  );
  assert.equal(
    failedOn.homeyMock.getLogicSnapshot().SmartChargeRuntimeLock,
    'null',
  );

  const failedOff = make();
  await run(failedOff);
  failedOff.homeyMock.devices.plug.failSetCapabilityValue = true;
  await assert.rejects(
    () => run(failedOff, { set: patch({ onoff_precond: false }) }),
    /setCapabilityValue failed/,
  );
  assert.equal(
    failedOff.homeyMock.getLogicSnapshot().SmartChargeRuntimeLock,
    'null',
  );

  const restart = make();
  await run(restart);
  const again = await run(restart, { now: '2026-07-07T18:06:00+02:00' });
  assert.equal(again.result.action, 'none');
  await run(restart, { now: '2026-07-07T18:35:00.001+02:00' });
  assert.equal(
    power(restart),
    false,
    'Fresh script scopes cannot extend the climate timestamp',
  );

  const changedBeforeOn = make();
  const getDevices = changedBeforeOn.homeyMock.api.devices.getDevices;
  let deviceReads = 0;
  changedBeforeOn.homeyMock.api.devices.getDevices = async (...args) => {
    if (++deviceReads === 3)
      changedBeforeOn.homeyMock.setDeviceState('mercedes', {
        capabilitiesObj: { onoff_precond: false },
      });
    return getDevices(...args);
  };
  const refused = await run(changedBeforeOn);
  assert.equal(refused.result.action, 'on_blocked');
  assert.deepEqual(commands(changedBeforeOn), []);

  const unplugged = make();
  await run(unplugged);
  unplugged.homeyMock.setDeviceState('plug', {
    capabilitiesObj: { measure_power: 2600 },
  });
  await run(unplugged, {
    set: patch({
      text_charging_status: { value: 'Unplugged', lastUpdated: now },
    }),
  });
  assert.equal(
    power(unplugged),
    false,
    'No Session: unplugging stops climate power even under load',
  );

  const expired = make(50, true);
  const morning = '2026-07-08T07:35:00+02:00';
  const climateAfterDeparture = await run(expired, {
    now: morning,
    set: patch({
      onoff_precond: { value: true, lastUpdated: morning },
      text_charging_status: { value: 'Charge break', lastUpdated: morning },
    }),
  });
  assert.equal(power(expired), true);
  assert.equal(
    climateAfterDeparture.logic.ChargeConnectedAt,
    '2026-07-07 17:00:00',
  );
  const expiredEnd = await run(expired, {
    now: morning,
    set: patch({ onoff_precond: false }),
  });
  assert.equal(power(expired), false);
  assert.equal(expiredEnd.logic.SmartChargeSessionStatus, 'expired');

  for (const change of ['stop', 'climate-off', 'disconnect']) {
    const r = make();
    const device = r.homeyMock.devices.plug;
    const original = device.setCapabilityValue.bind(device);
    device.setCapabilityValue = async (capability, value) => {
      await original(capability, value);
      if (value) {
        if (change === 'stop')
          r.homeyMock.setLogicValues({
            SmartChargeAutoStartBlocked: true,
            SmartChargeUserStopToken: 'new-stop',
          });
        else
          r.homeyMock.setDeviceState('mercedes', {
            capabilitiesObj:
              change === 'climate-off'
                ? { onoff_precond: false }
                : { onoff_connector: { value: false, lastUpdated: now } },
          });
      }
    };
    await run(r);
    assert.equal(
      power(r),
      false,
      'Changed intent/evidence during ON must compensate OFF: ' + change,
    );
    assert.deepEqual(commands(r), [true, false]);
  }
  const stopped = make();
  await run(stopped);
  const off = await run(stopped, { flow: 'manual-off' });
  assert.equal(power(stopped), false);
  await run(stopped);
  assert.equal(power(stopped), false);
  assert.equal(off.logic.SmartChargeAutoStartBlocked, true);
  const resumed = await run(stopped, { flow: 'auto-mode' });
  assert.equal(resumed.logic.SmartChargeAutoStartBlocked, false);
  assert.equal(
    power(stopped),
    true,
    'Explicit AUTO can authorize active preconditioning at 100%',
  );

  for (const change of [
    { available: false },
    { warningMessage: 'provider unavailable' },
  ]) {
    const r = make();
    Object.assign(r.homeyMock.devices.mercedes, change);
    await run(r);
    assert.equal(
      power(r),
      false,
      'Unavailable or warning provider cannot request climate power',
    );
  }

  const heartbeat = make();
  Object.assign(heartbeat.homeyMock.devices.mercedes, {
    driverId: 'homey:app:com.mercedes.mbapi:mercedes-vehicle',
    available: true,
    lastSeenAt: now,
  });
  await run(heartbeat, {
    set: patch({
      onoff_precond: { value: true, lastUpdated: '2026-07-07T16:00:00+02:00' },
    }),
  });
  assert.equal(
    power(heartbeat),
    false,
    'A provider heartbeat cannot refresh stale climate intent',
  );
  await idlePowerRegressions();
  await powerCutRecoveryRegressions();
  const waitingAuto = make();
  waitingAuto.homeyMock.setDeviceState('mercedes', {
    capabilitiesObj: {
      measure_battery: { value: 100, lastUpdated: '2026-07-06T18:00:00+02:00' },
      onoff_precond: { value: false, lastUpdated: now },
    },
  });
  await run(waitingAuto, { flow: 'manual-off' });
  const armed = await run(waitingAuto, { flow: 'auto-mode' });
  assert.equal(armed.logic.SmartChargeAutoStartBlocked, false);
  assert.equal(power(waitingAuto), false);
  assert.equal(armed.logic.ChargeConnectedAt, 'null');
  const climateAt = '2026-07-07T18:10:00+02:00';
  const heated = await run(waitingAuto, {
    now: climateAt,
    set: patch({
      onoff_precond: { value: true, lastUpdated: climateAt },
      text_charging_status: { value: 'Charge break', lastUpdated: climateAt },
    }),
  });
  assert.equal(power(waitingAuto), true);
  assert.equal(heated.result.runtimeState, 'PRECONDITIONING');
  assert.equal(heated.logic.ChargeConnectedAt, 'null');
  console.log(
    'PASS preconditioning runtime: full/missing SOC, independent Session, freshness, connection, grant, shadow and in-flight stop',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
