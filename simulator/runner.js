const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { LocalLogWriter } = require('./runtime/local-log-writer');
const { ScriptLoader } = require('./runtime/script-loader');
const { SimulatorRuntime } = require('./runtime/simulator-runtime');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCENARIO_DIR = path.join(__dirname, 'scenarios');
const EXPECTED_LOG_DIR = path.join(__dirname, 'fixtures', 'expected-logs');
const LOG_DIR = path.join(__dirname, 'logs');
const DYNAMIC_ENGINE_VERSION = '__ENGINE_VERSION__';

function loadScenarios() {
  return fs
    .readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, file), 'utf8')),
    );
}

function parseArgs(argv) {
  const args = {
    list: false,
    trace: false,
    scenarioNames: [],
  };

  for (const arg of argv) {
    if (arg === '--list') {
      args.list = true;
      continue;
    }

    if (arg === '--trace' || arg === '--verbose') {
      args.trace = true;
      continue;
    }

    if (arg === 'all' || arg === '--all') {
      continue;
    }

    args.scenarioNames.push(arg);
  }

  return args;
}

function selectScenarios(allScenarios, names) {
  if (names.length === 0) {
    return allScenarios;
  }

  return names.map((name) => {
    const scenario = allScenarios.find((item) => item.name === name);

    if (!scenario) {
      throw new Error(`Unknown scenario: ${name}`);
    }

    return scenario;
  });
}

async function runScenario({ scenario, scriptLoader, logWriter }) {
  const runtime = new SimulatorRuntime({
    scenario,
    scriptLoader,
    logWriter,
  });

  const stepResults = [];

  for (const step of scenario.steps) {
    const stepResult = await runtime.runStep(step);
    assertStep(step, stepResult);
    stepResults.push(stepResult);
  }

  assertFinalState(scenario, runtime);
  assertExpectedLogFixture(scenario, runtime);

  return {
    name: scenario.name,
    description: scenario.description,
    steps: stepResults,
    events: logWriter.events.filter(
      (event) => event.scenario === scenario.name,
    ),
    finalLogic: runtime.homeyMock.getLogicSnapshot(),
    finalDevices: runtime.homeyMock.getDeviceSnapshot(),
    tibberCalls: runtime.tibberCalls,
    scriptLogs: runtime.scriptLogs,
  };
}

async function runScenarioWithExpectedFailure(args) {
  const { scenario } = args;

  if (!scenario.futureExpectedFailure) {
    return {
      status: 'pass',
      result: await runScenario(args),
    };
  }

  try {
    const result = await runScenario(args);
    const error = new Error(
      `${scenario.name} is marked futureExpectedFailure but passed`,
    );
    error.unexpectedPass = true;
    error.result = result;
    throw error;
  } catch (error) {
    if (error.unexpectedPass || !error.futureExpectation) {
      throw error;
    }

    return {
      status: 'xfail',
      name: scenario.name,
      description: scenario.description,
      reason: error.message,
    };
  }
}

function assertStep(step, stepResult) {
  const label = `${step.flow} step`;
  assertStepExpect(step.expect || {}, stepResult, label);

  if (step.futureExpect) {
    try {
      assertStepExpect(
        step.futureExpect,
        stepResult,
        `${label} future expectation`,
      );
    } catch (error) {
      error.futureExpectation = true;
      throw error;
    }
  }
}

function assertStepExpect(expected, stepResult, label) {
  if (expected.errorIncludes) {
    assert.ok(stepResult.error, `${label} error`);
    assert.match(
      String(stepResult.error.message || ''),
      new RegExp(escapeRegExp(expected.errorIncludes)),
      `${label} error message`,
    );
  } else if (stepResult.error) {
    throw stepResult.error;
  }

  if (expected.result) {
    assertObjectContains(stepResult.result, expected.result, `${label} result`);
  }

  if (expected.reasonIncludes) {
    assert.match(
      String(stepResult.result.reason || ''),
      new RegExp(escapeRegExp(expected.reasonIncludes)),
      `${label} reason`,
    );
  }

  if (expected.events) {
    assert.deepEqual(stepResult.eventTypes, expected.events, `${label} events`);
  }

  if (expected.eventPayload) {
    assertObjectContains(
      stepResult.events[0] || {},
      expected.eventPayload,
      `${label} event payload`,
    );
  }

  if (expected.plugOn !== undefined) {
    assert.equal(
      stepResult.devices.plug.capabilitiesObj.onoff.value,
      expected.plugOn,
      `${label} plug onoff`,
    );
  }

  if (expected.plugCommandCount !== undefined) {
    assert.equal(
      stepResult.devices.plug.commands.length,
      expected.plugCommandCount,
      `${label} plug command count`,
    );
  }

  if (expected.logic) {
    assertObjectContains(stepResult.logic, expected.logic, `${label} logic`);
  }

  if (expected.tibberCallsDelta !== undefined) {
    assert.equal(
      stepResult.tibberCallsDelta,
      expected.tibberCallsDelta,
      `${label} Tibber call delta`,
    );
  }

  if (expected.tibberCallsTotal !== undefined) {
    assert.equal(
      stepResult.tibberCallsTotal,
      expected.tibberCallsTotal,
      `${label} Tibber call total`,
    );
  }
}

function assertFinalState(scenario, runtime) {
  const expected = scenario.expect || {};

  if (expected.logic) {
    assertObjectContains(
      runtime.homeyMock.getLogicSnapshot(),
      expected.logic,
      `${scenario.name} final logic`,
    );
  }

  if (expected.plugOn !== undefined) {
    assert.equal(
      runtime.homeyMock.devices.plug.capabilitiesObj.onoff.value,
      expected.plugOn,
      `${scenario.name} final plug onoff`,
    );
  }

  if (expected.plugCommandCount !== undefined) {
    assert.equal(
      runtime.homeyMock.devices.plug.commands.length,
      expected.plugCommandCount,
      `${scenario.name} final plug command count`,
    );
  }

  if (expected.eventTypes) {
    const eventTypes = runtime.logWriter.events
      .filter((event) => event.scenario === scenario.name)
      .map((event) => event.eventType);

    assert.deepEqual(
      eventTypes,
      expected.eventTypes,
      `${scenario.name} events`,
    );
  }

  if (expected.tibberCalls !== undefined) {
    assert.equal(
      runtime.tibberCalls,
      expected.tibberCalls,
      `${scenario.name} Tibber calls`,
    );
  }
}

function assertExpectedLogFixture(scenario, runtime) {
  const fixtureName = scenario.expect?.logFixture;

  if (!fixtureName) {
    return;
  }

  const expectedPath = path.join(EXPECTED_LOG_DIR, fixtureName);
  const actualPath = path.join(LOG_DIR, `${scenario.name}-actual-log.json`);
  const events = runtime.logWriter.events.filter(
    (event) => event.scenario === scenario.name,
  );
  const actualPayloads = events.map(toGoogleSheetsPayload);
  const expectedPayloads = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

  fs.writeFileSync(
    actualPath,
    `${JSON.stringify(actualPayloads, null, 2)}\n`,
    'utf8',
  );

  assert.deepEqual(
    normalizeDynamicLogFields(actualPayloads),
    expectedPayloads,
    `${scenario.name} expected log fixture`,
  );
}

function toGoogleSheetsPayload(event) {
  const payload = { ...event };
  delete payload.receivedAt;
  delete payload.scenario;
  delete payload.flow;
  return payload;
}

function normalizeDynamicLogFields(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeDynamicLogFields);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'engineVersion'
        ? DYNAMIC_ENGINE_VERSION
        : normalizeDynamicLogFields(item),
    ]),
  );
}

function assertObjectContains(actual, expected, label) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    assert.deepEqual(actual[key], expectedValue, `${label}.${key}`);
  }
}

function printScenarioList(scenarios) {
  for (const scenario of scenarios) {
    const marker = scenario.futureExpectedFailure ? ' [future XFAIL]' : '';
    console.log(`${scenario.name}${marker} - ${scenario.description}`);
  }
}

function printScenarioOutcome(outcome, options = {}) {
  if (outcome.status === 'xfail') {
    printExpectedFailureResult(outcome);
    return;
  }

  printScenarioResult(outcome.result, options);
}

function printScenarioResult(result, options = {}) {
  console.log(`PASS ${result.name}`);
  console.log(`  ${result.description}`);

  for (const step of result.steps) {
    const summary = summarizeStep(step);
    console.log(`  - ${summary}`);
    if (options.trace) printStepTrace(step);
  }

  const events = result.events.map(
    (event) => `${event.flow}:${event.eventType}`,
  );
  console.log(`  Tibber calls: ${result.tibberCalls}`);
  console.log(
    `  Log events  : ${events.length > 0 ? events.join(', ') : 'none'}`,
  );
}

function printStepTrace(step) {
  const beforePlug = step.devicesBefore.plug;
  const beforeVehicle = step.devicesBefore.mercedes;
  const afterPlug = step.devices.plug;
  const result = step.result || {};
  const changedLogic = diffValues(step.logicBefore, step.logic);
  const newCommands = afterPlug.commands.slice(beforePlug.commands.length);

  console.log('    INPUT');
  console.log(
    `      sessionId: ${formatTraceValue(step.logicBefore.ChargeConnectedAt)}`,
  );
  console.log(
    `      vehicleStatus: ${formatTraceValue(readFirstCapability(beforeVehicle, ['text_charging_status', 'charging_status', 'charge_status', 'ladestatus']))}`,
  );
  console.log(
    `      charging: ${formatTraceValue(readFirstCapability(beforeVehicle, ['onoff_charging']))}`,
  );
  console.log(
    `      vehicleChargePower: ${formatTraceValue(readCapabilityDiagnostic(beforeVehicle, 'measure_charge_power'))}`,
  );
  console.log(
    `      preconditioning: ${formatTraceValue(readFirstCapability(beforeVehicle, ['onoff_precond', 'preconditioning', 'preconditioning_active']))}`,
  );
  console.log(
    `      batteryPct: ${formatTraceValue(readCapability(beforeVehicle, 'measure_battery'))}`,
  );
  console.log(
    `      plug: on=${formatTraceValue(readCapability(beforePlug, 'onoff'))}, powerW=${formatTraceValue(readCapability(beforePlug, 'measure_power'))}`,
  );
  console.log('    DECISION');
  console.log(
    `      telemetry: ${formatTraceValue(result.vehicleTelemetryHealth)}/${formatTraceValue(result.vehicleTelemetryFreshness)}`,
  );
  console.log(
    `      vehicleChargingPowerW: ${formatTraceValue(result.vehicleChargingPowerW)}`,
  );
  console.log(`      runtimeState: ${formatTraceValue(result.runtimeState)}`);
  console.log(
    `      plannerShouldCharge: ${formatTraceValue(result.plannerShouldCharge)}`,
  );
  console.log(
    `      desiredPlugState: ${formatTraceValue(result.desiredPlugState)}`,
  );
  console.log(
    `      lifecycleAction: ${formatTraceValue(result.proposedLifecycleAction)}`,
  );
  console.log(
    `      reason: ${formatTraceValue(result.runtimeDecisionReason)}`,
  );
  console.log('    OUTPUT');
  console.log(`      action: ${formatTraceValue(result.action)}`);
  console.log(
    `      actualPlugState: ${formatTraceValue(result.actualPlugState)}`,
  );
  console.log(
    `      plugCommands: ${newCommands.length ? newCommands.map((command) => `${command.capability}=${command.value}`).join(', ') : 'none'}`,
  );
  console.log(
    `      events: ${step.eventTypes.length ? step.eventTypes.join(', ') : 'none'}`,
  );
  console.log(
    `      logicChanges: ${
      Object.keys(changedLogic).length
        ? Object.entries(changedLogic)
            .map(
              ([key, value]) =>
                `${key}: ${formatTraceValue(value.before)} -> ${formatTraceValue(value.after)}`,
            )
            .join('; ')
        : 'none'
    }`,
  );
  if (step.error) console.log(`      error: ${step.error.message}`);
}

function readCapability(device, name) {
  return device?.capabilitiesObj?.[name]?.value ?? null;
}

function readCapabilityDiagnostic(device, name) {
  const capability = device?.capabilitiesObj?.[name];
  if (!capability) return null;
  const units = capability.units || capability.unit || null;
  return `${name}=${capability.value}${units ? ` ${units}` : ''}`;
}

function readFirstCapability(device, names) {
  for (const name of names) {
    const value = readCapability(device, name);
    if (value !== null && value !== undefined && value !== '')
      return `${name}=${value}`;
  }
  return null;
}

function diffValues(before, after) {
  const result = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!Object.is(before[key], after[key]))
      result[key] = { before: before[key], after: after[key] };
  }
  return result;
}

function formatTraceValue(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return String(value);
}

function printExpectedFailureResult(result) {
  console.log(`XFAIL ${result.name}`);
  console.log(`  ${result.description}`);
  console.log(`  Future expectation: ${result.reason}`);
}

function summarizeStep(step) {
  if (step.error) {
    return (
      `${step.flow} @ ${step.now}; error=${step.error.message}; ` +
      `tibber+${step.tibberCallsDelta}`
    );
  }

  const reason = step.result.reason ? `; reason=${step.result.reason}` : '';
  const charge =
    step.result.shouldChargeNow !== undefined
      ? `; shouldChargeNow=${step.result.shouldChargeNow}`
      : '';
  const events =
    step.eventTypes.length > 0 ? step.eventTypes.join('|') : 'none';

  return (
    `${step.flow} @ ${step.now}; events=${events}; ` +
    `tibber+${step.tibberCallsDelta}${charge}${reason}`
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const allScenarios = loadScenarios();
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    printScenarioList(allScenarios);
    return;
  }

  const selectedScenarios = selectScenarios(allScenarios, args.scenarioNames);
  const scriptLoader = new ScriptLoader(ROOT_DIR);
  const logWriter = new LocalLogWriter(LOG_DIR);
  logWriter.reset();

  console.log('SmartCharge Simulator');
  console.log('---------------------');

  const results = [];

  for (const scenario of selectedScenarios) {
    const result = await runScenarioWithExpectedFailure({
      scenario,
      scriptLoader,
      logWriter,
    });

    results.push(result);
    printScenarioOutcome(result, { trace: args.trace });
  }

  const expectedFailures = results.filter(
    (result) => result.status === 'xfail',
  );

  console.log('');
  console.log(`Scenarios : ${results.length}`);
  if (expectedFailures.length > 0) {
    console.log(`XFAIL     : ${expectedFailures.length}`);
  }
  console.log(`JSONL log : ${path.relative(ROOT_DIR, logWriter.jsonlPath)}`);
  console.log(`CSV log   : ${path.relative(ROOT_DIR, logWriter.csvPath)}`);
  console.log(`HTML log  : ${path.relative(ROOT_DIR, logWriter.htmlPath)}`);
}

main().catch((error) => {
  console.error('');
  console.error('SmartCharge Simulator failed');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
