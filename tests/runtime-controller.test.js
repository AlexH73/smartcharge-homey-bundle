const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
for (const file of [
  'src/00-config/10-config.js',
  'src/10-core/runtime/10-runtime-model.js',
  'src/20-adapters/20-homey-devices.js',
  'src/40-runtime/10-runtime-controller.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
    filename: file,
  });
}

const call = (expression) => vm.runInContext(expression, context);

const observationNow = '2026-11-03T19:00:00Z';
const parkedVehicle = {
  driverId: 'homey:app:com.mercedes.mbapi:mercedes-vehicle',
  available: true,
  warningMessage: null,
  lastSeenAt: observationNow,
  capabilitiesObj: {
    measure_battery: { value: 23, lastUpdated: '2026-11-03T16:00:00Z' },
  },
};
const observe = (device) =>
  call(`readVehicleCapabilityDiagnostic(${JSON.stringify(device)},
    ['measure_battery'], new Date('${observationNow}'))`);
assert.equal(observe(parkedVehicle).source, 'device_last_seen');
assert.equal(observe(parkedVehicle).observedAt, observationNow);
assert.equal(observe(parkedVehicle).lastChangedAt, '2026-11-03T16:00:00Z');
assert.equal(
  observe({ ...parkedVehicle, lastSeenAt: '2026-11-03T18:30:00Z' }).source,
  'device_last_seen',
);
for (const patch of [
  { lastSeenAt: null },
  { lastSeenAt: 'invalid' },
  { lastSeenAt: '2026-11-03T16:00:00Z' },
  { lastSeenAt: '2026-11-03T18:29:59.999Z' },
  { lastSeenAt: '2026-11-03T19:01:00Z' },
  { available: false },
  { warningMessage: 'Vehicle updates unavailable' },
  { driverId: 'another-provider' },
  { capabilitiesObj: { measure_battery: { value: null } } },
  { capabilitiesObj: { measure_battery: { value: 23 } } },
  {
    capabilitiesObj: {
      measure_battery: { value: 23, lastUpdated: '2026-11-03T19:01:00Z' },
    },
  },
]) {
  assert.equal(
    observe({ ...parkedVehicle, ...patch }).source,
    'capability_timestamp',
  );
}

assert.equal(
  call(`evaluateTelemetryHealth({
    sessionActive: true, vehicleStatus: 'Unplugged', plugPowerW: 2600
  })`),
  'CONTRADICTED',
);
assert.equal(
  call(`canCreateSession({
    sessionActive: false, batteryPct: 50, targetBatteryPct: 100,
    vehicleStatus: 'Charge', vehicleTelemetryHealth: 'HEALTHY',
    vehicleTelemetryFreshness: 'UNKNOWN'
  })`),
  false,
);
assert.equal(
  call(`canCreateSession({
    sessionActive: false, batteryPct: 50, targetBatteryPct: 100,
    vehicleStatus: 'Charge', vehicleTelemetryHealth: 'HEALTHY',
    vehicleTelemetryFreshness: 'FRESH'
  })`),
  true,
);
assert.equal(call(`isVehicleConnectedStatus('Charge break')`), true);
for (const freshness of ['FRESH', 'STALE', 'UNKNOWN']) {
  for (const power of [50, 51, 100, 499, 500, 2600]) {
    assert.equal(
      call(`isSuspectedDisconnect({
        sessionActive: true, vehicleStatus: 'Unplugged',
        vehicleCharging: false, vehicleChargingFreshness: '${freshness}',
        vehicleChargingPowerW: ${power}, vehicleChargingPowerFreshness: '${freshness}',
        plugPowerW: 0
      })`),
      freshness !== 'FRESH' || power <= 50,
      `${freshness} vehicle power ${power} W`,
    );
  }
}
assert.equal(
  call(`evaluateTelemetryFreshness(new Date(60000), new Date(0))`),
  'STALE',
);
for (const freshness of ['STALE', 'UNKNOWN']) {
  assert.equal(
    call(`hasTrustworthyConnectionEvidence({
    sessionActive: false, vehicleStatus: 'Charge break', vehicleTelemetryHealth: 'HEALTHY',
    vehicleTelemetryFreshness: 'STALE', vehicleCharging: false,
    vehicleChargingPowerW: 2600, vehicleChargingPowerFreshness: '${freshness}'
  })`),
    false,
  );
}
assert.equal(call(`isVehicleConnectedStatus('Charging ends')`), false);
assert.equal(
  call(`hasTrustworthyConnectionEvidence({
    vehicleTelemetryHealth: 'HEALTHY', vehicleTelemetryFreshness: 'STALE',
    vehicleStatus: 'Charging ends', vehicleCharging: true,
    vehicleChargingFreshness: 'FRESH', vehicleChargingPowerW: 0
  })`),
  true,
);
assert.equal(
  call(`hasTrustworthyConnectionEvidence({
    vehicleTelemetryHealth: 'HEALTHY', vehicleTelemetryFreshness: 'STALE',
    vehicleStatus: 'Charge break', vehicleCharging: false,
    vehicleChargingFreshness: 'UNKNOWN', vehicleChargingPowerW: 2600,
    vehicleChargingPowerFreshness: 'FRESH'
  })`),
  true,
);
assert.equal(
  call(`deriveDesiredPlugState({
    sessionActive: true, batteryPct: 50, targetBatteryPct: 100,
    manualOverride: false, plannerShouldCharge: true,
    preconditioningActive: false, plugOn: false
  }).desiredPlugOn`),
  true,
);
assert.equal(
  call(`deriveDesiredPlugState({
    sessionActive: true, batteryPct: 50, targetBatteryPct: 100,
    manualOverride: false, plannerShouldCharge: false,
    preconditioningActive: true, plugOn: true
  }).desiredPlugOn`),
  false,
);
assert.equal(
  call(`deriveDesiredPlugState({
    sessionActive: true, batteryPct: 50, targetBatteryPct: 100,
    manualOverride: false, plannerShouldCharge: false,
    preconditioningActive: true, plugOn: false
  }).desiredPlugOn`),
  false,
);
assert.equal(
  call(`evaluateCompletionEvidence({
    sessionActive: true, batteryPct: 100, targetBatteryPct: 100
  })`),
  true,
);
assert.equal(
  call(`evaluateDisconnectEvidence({
    sessionActive: true, vehicleStatus: 'Unplugged', plugOn: true,
    plugPowerW: 2600, disconnectObservedAt: new Date(0), now: new Date(9999999)
  })`),
  false,
);
assert.equal(
  call(`deriveDesiredPlugState({
    sessionActive: true, batteryPct: 50, targetBatteryPct: 100,
    expiredSession: true, suspectedDisconnect: false,
    manualOverride: true, plannerShouldCharge: true,
    preconditioningActive: true, plugOn: true
  }).desiredPlugOn`),
  false,
);
assert.equal(
  call(`deriveDesiredPlugState({
    sessionActive: true, batteryPct: 50, targetBatteryPct: 100,
    suspectedDisconnect: true, confirmedDisconnect: false,
    manualOverride: true, plannerShouldCharge: true,
    preconditioningActive: true, plugOn: false
  }).desiredPlugOn`),
  false,
);

console.log('Runtime controller unit tests passed');
