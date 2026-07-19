const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sources = [
  'src/00-config/10-config.js',
  'src/10-core/10-time.js',
  'src/10-core/planner/30-planner-utils.js',
  'src/10-core/planner/65-estimated-cost.js',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
const sandbox = { module: { exports: {} } };

vm.runInNewContext(
  `${sources.join('\n')}\nmodule.exports = {
    calculateIntervalCostEur,
    allocateChargingMinutes,
    estimatePlanCosts,
  };`,
  sandbox,
);

const { calculateIntervalCostEur, allocateChargingMinutes, estimatePlanCosts } =
  sandbox.module.exports;

function slot(iso, price) {
  return { startTime: new Date(iso), price };
}

function planFromSlots(slots, splitAt = []) {
  const windows = [];
  let current = [];

  slots.forEach((item, index) => {
    if (splitAt.includes(index) && current.length) {
      windows.push({ slots: current });
      current = [];
    }
    current.push(item);
  });
  if (current.length) windows.push({ slots: current });

  return { windows };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

close(calculateIntervalCostEur(0.2, 2.6, 60), 0.52);
close(calculateIntervalCostEur(0.2, 2.6, 30), 0.26);

{
  const result = allocateChargingMinutes(
    [
      slot('2026-07-19T14:00:00Z', 0.2),
      slot('2026-07-19T15:00:00Z', 0.3),
      slot('2026-07-19T16:00:00Z', 0.4),
    ],
    {
      chargeMinutes: 150,
      chargingPowerKw: 2.6,
      allocationStart: new Date('2026-07-19T14:00:00Z'),
      targetDeparture: new Date('2026-07-19T18:00:00Z'),
    },
  );
  assert.deepEqual(
    Array.from(result.allocations, (item) => item.allocatedMinutes),
    [60, 60, 30],
  );
  close(result.costEur, 0.2 * 2.6 + 0.3 * 2.6 + 0.4 * 2.6 * 0.5);
}

{
  const result = allocateChargingMinutes(
    [slot('2026-07-19T14:00:00Z', 0.4), slot('2026-07-19T15:00:00Z', 0.2)],
    {
      chargeMinutes: 55,
      chargingPowerKw: 2.6,
      allocationStart: new Date('2026-07-19T14:35:00Z'),
      targetDeparture: new Date('2026-07-19T17:00:00Z'),
    },
  );
  assert.deepEqual(
    Array.from(result.allocations, (item) => item.allocatedMinutes),
    [25, 30],
  );
  close(result.costEur, (0.4 * 2.6 * 25) / 60 + (0.2 * 2.6 * 30) / 60);
}

{
  const prices = [
    slot('2026-07-19T14:00:00Z', 0.4),
    slot('2026-07-19T15:00:00Z', 0.2),
    slot('2026-07-19T16:00:00Z', 0.1),
  ];
  const result = estimatePlanCosts({
    plan: planFromSlots([prices[2]]),
    prices,
    now: new Date('2026-07-19T14:35:00Z'),
    targetDeparture: new Date('2026-07-19T18:00:00Z'),
    chargeMinutes: 55,
    chargingPowerKw: 2.6,
  });
  close(result.estimatedSelectedCostEur, (0.1 * 2.6 * 55) / 60);
  close(
    result.estimatedBaselineCostEur,
    (0.4 * 2.6 * 25) / 60 + (0.2 * 2.6 * 30) / 60,
  );
  close(
    result.estimatedSavingsEur,
    result.estimatedBaselineCostEur - result.estimatedSelectedCostEur,
  );
  close(
    result.estimatedSavingsPct,
    (result.estimatedSavingsEur / result.estimatedBaselineCostEur) * 100,
  );
}

{
  const prices = [slot('2026-07-19T14:00:00Z', 0.2)];
  const result = estimatePlanCosts({
    plan: planFromSlots(prices),
    prices,
    now: new Date('2026-07-19T14:00:00Z'),
    targetDeparture: new Date('2026-07-19T15:00:00Z'),
    chargeMinutes: 60,
    chargingPowerKw: 2.6,
  });
  assert.equal(result.estimatedSavingsEur, 0);
  assert.equal(result.estimatedSavingsPct, 0);
}

{
  const selected = [
    slot('2026-07-19T15:00:00Z', 0.1),
    slot('2026-07-19T17:00:00Z', 0.2),
    slot('2026-07-19T19:00:00Z', 0.3),
  ];
  const result = allocateChargingMinutes(selected, {
    chargeMinutes: 150,
    chargingPowerKw: 2.6,
    allocationStart: new Date('2026-07-19T14:00:00Z'),
    targetDeparture: new Date('2026-07-19T21:00:00Z'),
  });
  assert.deepEqual(
    Array.from(result.allocations, (item) => item.allocatedMinutes),
    [60, 60, 30],
  );
}

{
  const prices = [slot('2026-07-19T14:00:00Z', 0.2)];
  const result = estimatePlanCosts({
    plan: planFromSlots(prices),
    prices,
    now: new Date('2026-07-19T14:30:00Z'),
    targetDeparture: new Date('2026-07-19T15:00:00Z'),
    chargeMinutes: 60,
    chargingPowerKw: 2.6,
  });
  assert.equal(result.baselineAllocationComplete, false);
  assert.equal(result.baselineAllocatedMinutes, 30);
  assert.equal(
    result.baselineIncompleteReason,
    'INSUFFICIENT_USABLE_TIME_BEFORE_DEPARTURE',
  );
  assert.equal(result.estimatedBaselineCostEur, null);
  assert.equal(result.estimatedSavingsEur, null);
}

{
  const prices = [
    slot('2026-07-19T14:00:00Z', 0.4),
    slot('2026-07-19T16:00:00Z', 0.2),
  ];
  const result = estimatePlanCosts({
    plan: planFromSlots([prices[1]]),
    prices,
    now: new Date('2026-07-19T14:35:00Z'),
    targetDeparture: new Date('2026-07-19T18:00:00Z'),
    chargeMinutes: 55,
    chargingPowerKw: 2.6,
  });
  assert.equal(result.baselineAllocationComplete, false);
  assert.equal(result.baselineAllocatedMinutes, 25);
  assert.equal(result.estimatedBaselineCostEur, null);
  assert.equal(result.estimatedSavingsEur, null);
  assert.equal(result.baselineIncompleteReason, 'NON_CONSECUTIVE_PRICE_SLOTS');
}

console.log('Estimated cost engine tests passed');
