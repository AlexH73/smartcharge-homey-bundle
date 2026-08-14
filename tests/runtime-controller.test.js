const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
for (const file of [
  'src/00-config/10-config.js',
  'src/10-core/runtime/10-runtime-model.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
    filename: file,
  });
}

const call = (expression) => vm.runInContext(expression, context);

assert.equal(
  call(`evaluateTelemetryHealth({
    sessionActive: true, vehicleStatus: 'Unplugged', plugPowerW: 2600
  })`),
  'CONTRADICTED',
);
assert.equal(
  call(`canCreateSession({
    sessionActive: false, vehicleStatus: 'Charge', vehicleTelemetryHealth: 'HEALTHY',
    vehicleTelemetryFreshness: 'UNKNOWN'
  })`),
  false,
);
assert.equal(
  call(`canCreateSession({
    sessionActive: false, vehicleStatus: 'Charge', vehicleTelemetryHealth: 'HEALTHY',
    vehicleTelemetryFreshness: 'FRESH'
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
  true,
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
