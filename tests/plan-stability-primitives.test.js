const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sourceFiles = [
  'src/00-config/10-config.js',
  'src/10-core/10-time.js',
  'src/10-core/planner/10-charge-window.js',
  'src/10-core/planner/30-planner-utils.js',
  'src/10-core/planner/65-estimated-cost.js',
  'src/10-core/stability/10-accepted-strategy-anchor.js',
  'src/10-core/stability/20-strategy-projection.js',
  'src/10-core/stability/30-strategy-equivalence.js',
  'src/10-core/stability/40-replacement-economics.js',
];
const sources = sourceFiles.map((file) =>
  fs.readFileSync(path.join(root, file), 'utf8'),
);
const sandbox = { module: { exports: {} } };

vm.runInNewContext(
  `${sources.join('\n')}\nmodule.exports = {
    createAcceptedStrategyAnchor,
    validateAcceptedStrategyAnchor,
    projectAcceptedStrategy,
    projectCandidatePlan,
    buildProjectedWindows,
    isNowInsideStrategyWindows,
    compareProjectedStrategies,
    calculateReplacementEconomics,
  };`,
  sandbox,
);

const {
  createAcceptedStrategyAnchor,
  validateAcceptedStrategyAnchor,
  projectAcceptedStrategy,
  projectCandidatePlan,
  buildProjectedWindows,
  isNowInsideStrategyWindows,
  compareProjectedStrategies,
  calculateReplacementEconomics,
} = sandbox.module.exports;

function slot(iso, price = 0.2) {
  return { startTime: new Date(iso), price };
}

function plan(slots) {
  return { windows: [{ slots }] };
}

function anchor(selectedSlotStarts, overrides = {}) {
  return createAcceptedStrategyAnchor({
    sessionId: 'session-1',
    plannerVersion: 'planner-v2',
    acceptedAt: '2026-10-24T20:00:00+02:00',
    revision: 1,
    targetDeparture: '2026-10-25T08:00:00+01:00',
    selectedSlotStarts,
    ...overrides,
  });
}

function projectionOptions(prices, overrides = {}) {
  return {
    sessionId: 'session-1',
    prices,
    now: new Date('2026-10-25T00:00:00Z'),
    remainingChargeMinutes: 60,
    targetDeparture: new Date('2026-10-25T08:00:00Z'),
    chargingPowerKw: 2.6,
    ...overrides,
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

// 1. Fresh anchor validation and UTC normalization.
{
  const result = anchor([
    '2026-10-25T03:00:00+01:00',
    '2026-10-25T01:00:00+02:00',
  ]);
  assert.deepEqual(Array.from(result.selectedSlotStarts), [
    '2026-10-24T23:00:00.000Z',
    '2026-10-25T02:00:00.000Z',
  ]);
  assert.equal(validateAcceptedStrategyAnchor(result).valid, true);
}

// 2. Corrupt schema.
{
  const result = validateAcceptedStrategyAnchor({
    ...anchor(['2026-10-25T01:00:00Z']),
    schemaVersion: 99,
  });
  assert.equal(result.valid, false);
  assert.ok(Array.from(result.errors).includes('SCHEMA_VERSION_UNSUPPORTED'));
}

// 3. Session mismatch.
{
  const result = validateAcceptedStrategyAnchor(
    anchor(['2026-10-25T01:00:00Z']),
    { sessionId: 'session-2' },
  );
  assert.equal(result.valid, false);
  assert.ok(Array.from(result.errors).includes('SESSION_MISMATCH'));
}

// 4. Elapsed slots are removed.
{
  const prices = [slot('2026-10-25T01:00:00Z'), slot('2026-10-25T04:00:00Z')];
  const result = projectAcceptedStrategy(
    anchor(prices.map((item) => item.startTime.toISOString())),
    projectionOptions(prices, { now: new Date('2026-10-25T03:00:00Z') }),
  );
  assert.equal(result.feasible, true);
  assert.equal(result.elapsedSlotCount, 1);
  assert.deepEqual(Array.from(result.selectedSlotStarts), [
    '2026-10-25T04:00:00.000Z',
  ]);
}

// 5. Fresh SOC-derived requirement shrinks an originally longer strategy.
{
  const prices = [1, 2, 3].map((hour) => slot(`2026-10-25T0${hour}:00:00Z`));
  const result = projectAcceptedStrategy(
    anchor(prices.map((item) => item.startTime.toISOString())),
    projectionOptions(prices, { remainingChargeMinutes: 60 }),
  );
  assert.equal(result.allocatedMinutes, 60);
  assert.equal(result.selectedSlotStarts.length, 1);
}

// A missing late slot is irrelevant after the fresh requirement shrinks.
{
  const requiredSlot = slot('2026-10-25T01:00:00Z');
  const result = projectAcceptedStrategy(
    anchor([
      requiredSlot.startTime.toISOString(),
      '2026-10-25T02:00:00Z',
      '2026-10-25T03:00:00Z',
    ]),
    projectionOptions([requiredSlot], { remainingChargeMinutes: 60 }),
  );
  assert.equal(result.available, true);
  assert.equal(result.feasible, true);
}

// 6. Adjacent allocations merge into one projected window.
{
  const allocations = [
    {
      slotStartTime: new Date('2026-10-25T01:00:00Z'),
      startTime: new Date('2026-10-25T01:00:00Z'),
      endTime: new Date('2026-10-25T02:00:00Z'),
      allocatedMinutes: 60,
      costEur: 0.52,
    },
    {
      slotStartTime: new Date('2026-10-25T02:00:00Z'),
      startTime: new Date('2026-10-25T02:00:00Z'),
      endTime: new Date('2026-10-25T03:00:00Z'),
      allocatedMinutes: 60,
      costEur: 0.52,
    },
  ];
  assert.equal(buildProjectedWindows(allocations).length, 1);
}

// 7. Separated allocations remain separate.
{
  const allocations = [
    {
      slotStartTime: new Date('2026-10-25T01:00:00Z'),
      startTime: new Date('2026-10-25T01:00:00Z'),
      endTime: new Date('2026-10-25T02:00:00Z'),
      allocatedMinutes: 60,
      costEur: 0.52,
    },
    {
      slotStartTime: new Date('2026-10-25T04:00:00Z'),
      startTime: new Date('2026-10-25T04:00:00Z'),
      endTime: new Date('2026-10-25T05:00:00Z'),
      allocatedMinutes: 60,
      costEur: 0.52,
    },
  ];
  assert.equal(buildProjectedWindows(allocations).length, 2);
}

// 8-9. Membership uses actual windows, not their overall envelope.
{
  const windows = [
    {
      plannedStart: new Date('2026-10-25T01:00:00Z'),
      plannedEnd: new Date('2026-10-25T02:00:00Z'),
    },
    {
      plannedStart: new Date('2026-10-25T04:00:00Z'),
      plannedEnd: new Date('2026-10-25T05:00:00Z'),
    },
  ];
  assert.equal(
    isNowInsideStrategyWindows(new Date('2026-10-25T01:30:00Z'), windows),
    true,
  );
  assert.equal(
    isNowInsideStrategyWindows(new Date('2026-10-25T03:00:00Z'), windows),
    false,
  );
}

// 10. Continuous strategy shrink is continuation after normalization.
{
  const prices = [1, 2, 3, 4].map((hour) => slot(`2026-10-25T0${hour}:00:00Z`));
  const options = projectionOptions(prices, { remainingChargeMinutes: 180 });
  const accepted = projectAcceptedStrategy(
    anchor(prices.map((item) => item.startTime.toISOString())),
    options,
  );
  const candidate = projectCandidatePlan(plan(prices.slice(0, 3)), options);
  assert.equal(
    compareProjectedStrategies(accepted, candidate).classification,
    'CONTINUATION',
  );
}

// 11. Elapsed multi-window progression is continuation.
{
  const prices = [slot('2026-10-25T01:00:00Z'), slot('2026-10-25T04:00:00Z')];
  const options = projectionOptions(prices, {
    now: new Date('2026-10-25T03:00:00Z'),
  });
  const accepted = projectAcceptedStrategy(
    anchor(prices.map((item) => item.startTime.toISOString())),
    options,
  );
  const candidate = projectCandidatePlan(plan([prices[1]]), options);
  assert.equal(
    compareProjectedStrategies(accepted, candidate).classification,
    'CONTINUATION',
  );
}

// 12. A distant candidate is a replacement.
{
  const acceptedSlot = slot('2026-10-25T01:00:00Z');
  const candidateSlot = slot('2026-10-25T10:00:00Z');
  const prices = [acceptedSlot, candidateSlot];
  const options = projectionOptions(prices, {
    targetDeparture: new Date('2026-10-25T12:00:00Z'),
  });
  const accepted = projectAcceptedStrategy(
    anchor([acceptedSlot.startTime.toISOString()]),
    options,
  );
  const candidate = projectCandidatePlan(plan([candidateSlot]), options);
  assert.equal(
    compareProjectedStrategies(accepted, candidate).classification,
    'REPLACEMENT',
  );
}

// 13. Adding a gap changes topology and is a replacement.
{
  const prices = [1, 2, 3, 4, 5].map((hour) =>
    slot(`2026-10-25T0${hour}:00:00Z`),
  );
  const options = projectionOptions(prices, { remainingChargeMinutes: 180 });
  const accepted = projectAcceptedStrategy(
    anchor(prices.slice(0, 4).map((item) => item.startTime.toISOString())),
    options,
  );
  const candidate = projectCandidatePlan(
    plan([prices[0], prices[1], prices[4]]),
    options,
  );
  assert.equal(
    compareProjectedStrategies(accepted, candidate).classification,
    'REPLACEMENT',
  );
}

// 14. Economics compare equal fresh remaining minutes.
{
  const continuationSlot = slot('2026-10-25T01:00:00Z', 0.3);
  const candidateSlot = slot('2026-10-25T02:00:00Z', 0.2);
  const prices = [continuationSlot, candidateSlot];
  const options = projectionOptions(prices);
  const continuation = projectAcceptedStrategy(
    anchor([continuationSlot.startTime.toISOString()]),
    options,
  );
  const candidate = projectCandidatePlan(plan([candidateSlot]), options);
  const result = calculateReplacementEconomics(continuation, candidate);
  assert.equal(result.comparedRemainingMinutes, 60);
  close(result.replacementSavingsEur, 0.26);
  close(result.replacementSavingsPct, 100 / 3);
}

// 15. Partial current slot allocation uses only fresh remaining minutes.
{
  const current = slot('2026-10-25T01:00:00Z', 0.4);
  const options = projectionOptions([current], {
    now: new Date('2026-10-25T01:30:00Z'),
    remainingChargeMinutes: 30,
  });
  const result = projectAcceptedStrategy(
    anchor([current.startTime.toISOString()]),
    options,
  );
  assert.equal(result.feasible, true);
  assert.equal(result.windows[0].durationMinutes, 30);
  close(result.costEur, 0.52);
}

// 16. Missing fresh price is explicit and never interpreted as zero.
{
  const result = projectAcceptedStrategy(
    anchor(['2026-10-25T01:00:00Z']),
    projectionOptions([]),
  );
  assert.equal(result.available, false);
  assert.equal(result.reasonCode, 'ACCEPTED_PRICE_SLOT_UNAVAILABLE');
  assert.equal(result.costEur, undefined);
}

// 17. Accepted strategy can be available but insufficient.
{
  const onlySlot = slot('2026-10-25T01:00:00Z');
  const result = projectAcceptedStrategy(
    anchor([onlySlot.startTime.toISOString()]),
    projectionOptions([onlySlot], { remainingChargeMinutes: 120 }),
  );
  assert.equal(result.available, true);
  assert.equal(result.feasible, false);
  assert.equal(result.reasonCode, 'ACCEPTED_STRATEGY_INSUFFICIENT');
  assert.equal(result.costEur, null);
}

// 18. Offset-equivalent DST identities normalize to the same UTC instant.
{
  const first = anchor(['2026-10-25T02:00:00+02:00']);
  const second = anchor(['2026-10-25T01:00:00+01:00']);
  assert.equal(first.selectedSlotStarts[0], second.selectedSlotStarts[0]);
}

console.log('Plan stability primitive tests passed');
