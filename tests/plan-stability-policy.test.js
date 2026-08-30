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
  'src/10-core/stability/50-stability-policy.js',
  'src/10-core/stability/60-stability-evaluator.js',
];
const sources = sourceFiles.map((file) =>
  fs.readFileSync(path.join(root, file), 'utf8'),
);
const sandbox = { module: { exports: {} } };

vm.runInNewContext(
  `${sources.join('\n')}\nmodule.exports = {
    createAcceptedStrategyAnchor,
    decidePlanStability,
    evaluatePlanStability,
    evaluateReplacementThreshold,
    validateStabilityPolicyConfiguration,
  };`,
  sandbox,
);

const {
  createAcceptedStrategyAnchor,
  decidePlanStability,
  evaluatePlanStability,
  evaluateReplacementThreshold,
  validateStabilityPolicyConfiguration,
} = sandbox.module.exports;

function projection(overrides = {}) {
  return {
    available: true,
    feasible: true,
    shouldChargeNow: false,
    requestedMinutes: 60,
    costEur: 1,
    selectedSlotStarts: ['2026-10-25T01:00:00.000Z'],
    ...overrides,
  };
}

function economics(eur, pct, overrides = {}) {
  return {
    available: true,
    replacementSavingsEur: eur,
    replacementSavingsPct: pct,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return {
    thresholdMode: 'ALL',
    waiting: {
      minReplacementSavingsEur: 0.1,
      minReplacementSavingsPct: 5,
    },
    charging: {
      minReplacementSavingsEur: 0.5,
      minReplacementSavingsPct: 20,
    },
    ...overrides,
  };
}

function decide(overrides = {}) {
  return decidePlanStability({
    hasAcceptedStrategy: true,
    continuationProjection: projection(),
    candidateProjection: projection({
      selectedSlotStarts: ['2026-10-25T03:00:00.000Z'],
    }),
    equivalence: { equivalent: false },
    economics: economics(1, 25),
    context: { activelyCharging: false },
    policyConfiguration: policy(),
    ...overrides,
  });
}

function slot(iso, price = 0.2) {
  return { startTime: new Date(iso), price };
}

function plan(slots) {
  return { windows: [{ slots }] };
}

function anchor(selectedSlotStarts) {
  return createAcceptedStrategyAnchor({
    sessionId: 'session-1',
    plannerVersion: 'planner-v2',
    acceptedAt: '2026-10-24T20:00:00Z',
    revision: 1,
    targetDeparture: '2026-10-25T08:00:00Z',
    selectedSlotStarts,
  });
}

function evaluate(acceptedAnchor, candidatePlan, prices, overrides = {}) {
  return evaluatePlanStability({
    acceptedAnchor,
    candidatePlan,
    prices,
    sessionId: 'session-1',
    now: new Date('2026-10-25T00:00:00Z'),
    remainingChargeMinutes: 60,
    targetDeparture: new Date('2026-10-25T08:00:00Z'),
    chargingPowerKw: 2.6,
    context: { activelyCharging: false },
    policyConfiguration: policy(),
    ...overrides,
  });
}

// 1. A feasible first candidate is accepted without replacement economics.
{
  const result = decide({
    hasAcceptedStrategy: false,
    continuationProjection: undefined,
    economics: undefined,
  });
  assert.equal(result.decision, 'INITIAL_ACCEPT');
  assert.equal(result.reasonCode, 'NO_ACCEPTED_STRATEGY');
}

// No accepted strategy plus an infeasible candidate is an explicit failure.
{
  const result = decide({
    hasAcceptedStrategy: false,
    continuationProjection: undefined,
    candidateProjection: projection({ feasible: false }),
  });
  assert.equal(result.decision, 'NO_DECISION');
  assert.equal(result.reasonCode, 'CANDIDATE_INFEASIBLE');
}

// 2. Equivalent strategies continue without applying thresholds.
{
  const result = decide({
    equivalence: { equivalent: true },
    policyConfiguration: undefined,
  });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'EQUIVALENT_STRATEGY');
}

// 3. Fresh SOC shrink remains continuation through the orchestration helper.
{
  const prices = [1, 2, 3].map((hour) => slot(`2026-10-25T0${hour}:00:00Z`));
  const result = evaluate(
    anchor(prices.map((item) => item.startTime.toISOString())),
    plan([prices[0]]),
    prices,
  );
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.equivalence.equivalent, true);
}

// 4. Elapsed multi-window progression remains continuation.
{
  const prices = [slot('2026-10-25T01:00:00Z'), slot('2026-10-25T04:00:00Z')];
  const result = evaluate(
    anchor(prices.map((item) => item.startTime.toISOString())),
    plan([prices[1]]),
    prices,
    { now: new Date('2026-10-25T03:00:00Z') },
  );
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.equivalence.equivalent, true);
}

// 5 and 13. A feasible candidate replaces an infeasible accepted strategy.
{
  const result = decide({
    continuationProjection: projection({ feasible: false }),
  });
  assert.equal(result.decision, 'REPLACE');
  assert.equal(result.reasonCode, 'CURRENT_STRATEGY_INFEASIBLE');
}

// Missing accepted price data is also explicit infeasibility, never zero cost.
{
  const acceptedSlot = slot('2026-10-25T01:00:00Z');
  const candidateSlot = slot('2026-10-25T03:00:00Z');
  const result = evaluate(
    anchor([acceptedSlot.startTime.toISOString()]),
    plan([candidateSlot]),
    [candidateSlot],
  );
  assert.equal(result.decision, 'REPLACE');
  assert.equal(result.economics.available, false);
}

// 6. A tiny saving cannot interrupt active charging under stronger thresholds.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: true }),
    candidateProjection: projection({ shouldChargeNow: false }),
    economics: economics(0.1, 5),
    context: { activelyCharging: true },
  });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.policyProfile, 'charging');
}

// 7. Material economics can justify a charging interruption.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: true }),
    candidateProjection: projection({ shouldChargeNow: false }),
    economics: economics(0.5, 20),
    context: { activelyCharging: true },
  });
  assert.equal(result.decision, 'REPLACE');
  assert.equal(result.disruptiveTransition, true);
}

// 8. A compatible active strategy does not cause a disruptive replacement.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: true }),
    candidateProjection: projection({ shouldChargeNow: true }),
    equivalence: { equivalent: true },
    context: { activelyCharging: true },
  });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.transition, 'ON_TO_ON');
  assert.equal(result.disruptiveTransition, false);
}

// 9. Waiting uses its injected policy profile.
{
  const result = decide({ economics: economics(0.1, 5) });
  assert.equal(result.decision, 'REPLACE');
  assert.equal(result.policyProfile, 'waiting');
}

// 10-11. Negative and zero savings never replace a feasible continuation.
for (const saving of [-0.01, 0]) {
  const result = decide({ economics: economics(saving, saving) });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'REPLACEMENT_NOT_BENEFICIAL');
}

// Tiny positive savings can remain below an explicit threshold.
{
  const result = decide({ economics: economics(0.001, 0.01) });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'REPLACEMENT_BENEFIT_INSUFFICIENT');
}

// ANY accepts either a large absolute or large relative saving; ALL requires both.
{
  const anyPolicy = policy({ thresholdMode: 'ANY' });
  assert.equal(
    decide({
      economics: economics(1, 1),
      policyConfiguration: anyPolicy,
    }).decision,
    'REPLACE',
  );
  assert.equal(
    decide({
      economics: economics(0.01, 10),
      policyConfiguration: anyPolicy,
    }).decision,
    'REPLACE',
  );
  assert.equal(decide({ economics: economics(1, 1) }).decision, 'CONTINUE');
}

// Zero thresholds are valid, but zero savings still count as non-beneficial.
{
  const zeroPolicy = policy({
    waiting: {
      minReplacementSavingsEur: 0,
      minReplacementSavingsPct: 0,
    },
  });
  assert.equal(validateStabilityPolicyConfiguration(zeroPolicy).valid, true);
  assert.equal(
    decide({
      economics: economics(0, 0),
      policyConfiguration: zeroPolicy,
    }).decision,
    'CONTINUE',
  );
}

// Missing and invalid configuration is observable instead of defaulted.
{
  const missing = decide({ policyConfiguration: undefined });
  assert.equal(missing.decision, 'NO_DECISION');
  assert.equal(missing.reasonCode, 'POLICY_CONFIGURATION_INVALID');
  assert.equal(
    validateStabilityPolicyConfiguration(
      policy({
        waiting: {
          minReplacementSavingsEur: -1,
          minReplacementSavingsPct: null,
        },
      }),
    ).valid,
    false,
  );
}

// 12. Unavailable economics conservatively keeps feasible active charging.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: true }),
    candidateProjection: projection({ shouldChargeNow: false }),
    economics: { available: false },
    context: { activelyCharging: true },
  });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'ECONOMICS_UNAVAILABLE');
}

// Waiting is also conservative when economics cannot prove a benefit.
{
  assert.equal(
    decide({ economics: { available: false } }).decision,
    'CONTINUE',
  );
}

// 14-15. Safety and manual control bypass stability policy.
{
  assert.equal(
    decide({ context: { safetyRequiresCandidate: true } }).reasonCode,
    'SAFETY_OVERRIDE',
  );
  assert.equal(
    decide({ context: { manualOverrideActive: true } }).reasonCode,
    'MANUAL_OVERRIDE',
  );
  assert.equal(
    decide({ context: { lifecycleBypassActive: true } }).decision,
    'BYPASS',
  );
  assert.equal(
    decide({ context: { disconnectSafetyActive: true } }).decision,
    'BYPASS',
  );
}

// 16. An infeasible candidate cannot replace a feasible accepted strategy.
{
  const result = decide({
    candidateProjection: projection({ feasible: false }),
  });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'CANDIDATE_INFEASIBLE');
}

// 17. A beneficial OFF -> ON transition follows waiting policy.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: false }),
    candidateProjection: projection({ shouldChargeNow: true }),
  });
  assert.equal(result.decision, 'REPLACE');
  assert.equal(result.transition, 'OFF_TO_ON');
}

// 18. ON -> OFF is explicitly visible even when replacement is rejected.
{
  const result = decide({
    continuationProjection: projection({ shouldChargeNow: true }),
    candidateProjection: projection({ shouldChargeNow: false }),
    economics: economics(0.01, 1),
    context: { activelyCharging: true },
  });
  assert.equal(result.transition, 'ON_TO_OFF');
  assert.equal(result.disruptiveTransition, true);
}

// 19. A multi-window gap uses actual projected membership.
{
  const prices = [slot('2026-10-25T01:00:00Z'), slot('2026-10-25T04:00:00Z')];
  const result = evaluate(
    anchor(prices.map((item) => item.startTime.toISOString())),
    plan(prices),
    prices,
    {
      now: new Date('2026-10-25T03:00:00Z'),
      remainingChargeMinutes: 120,
    },
  );
  assert.equal(result.currentShouldCharge, false);
  assert.equal(result.candidateShouldCharge, false);
  assert.equal(result.transition, 'OFF_TO_OFF');
}

// 20. Undefined percentage at zero continuation cost is never treated as zero.
{
  const threshold = evaluateReplacementThreshold(
    economics(0.1, null),
    { minReplacementSavingsEur: 0.1, minReplacementSavingsPct: 1 },
    'ALL',
  );
  assert.equal(threshold.evaluable, false);
  const result = decide({ economics: economics(0.1, null) });
  assert.equal(result.decision, 'CONTINUE');
  assert.equal(result.reasonCode, 'ECONOMICS_UNAVAILABLE');
}

console.log('Plan stability policy tests passed');
