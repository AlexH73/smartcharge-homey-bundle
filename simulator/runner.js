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
  return fs.readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, file), 'utf8')),
    );
}

function parseArgs(argv) {
  const args = {
    list: false,
    scenarioNames: [],
  };

  for (const arg of argv) {
    if (arg === '--list') {
      args.list = true;
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
    events: logWriter.events.filter((event) => event.scenario === scenario.name),
    finalLogic: runtime.homeyMock.getLogicSnapshot(),
    finalDevices: runtime.homeyMock.getDeviceSnapshot(),
    tibberCalls: runtime.tibberCalls,
    scriptLogs: runtime.scriptLogs,
  };
}

function assertStep(step, stepResult) {
  const expected = step.expect || {};
  const label = `${step.flow} step`;

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

    assert.deepEqual(eventTypes, expected.eventTypes, `${scenario.name} events`);
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
  const { scenario, flow, ...payload } = event;
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
    console.log(`${scenario.name} - ${scenario.description}`);
  }
}

function printScenarioResult(result) {
  console.log(`PASS ${result.name}`);
  console.log(`  ${result.description}`);

  for (const step of result.steps) {
    const summary = summarizeStep(step);
    console.log(`  - ${summary}`);
  }

  const events = result.events.map(
    (event) => `${event.flow}:${event.eventType}`,
  );
  console.log(`  Tibber calls: ${result.tibberCalls}`);
  console.log(`  Log events  : ${events.length > 0 ? events.join(', ') : 'none'}`);
}

function summarizeStep(step) {
  const reason = step.result.reason ? `; reason=${step.result.reason}` : '';
  const charge = step.result.shouldChargeNow !== undefined
    ? `; shouldChargeNow=${step.result.shouldChargeNow}`
    : '';
  const events = step.eventTypes.length > 0
    ? step.eventTypes.join('|')
    : 'none';

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
    const result = await runScenario({
      scenario,
      scriptLoader,
      logWriter,
    });

    results.push(result);
    printScenarioResult(result);
  }

  console.log('');
  console.log(`Scenarios : ${results.length}`);
  console.log(`JSONL log : ${path.relative(ROOT_DIR, logWriter.jsonlPath)}`);
  console.log(`CSV log   : ${path.relative(ROOT_DIR, logWriter.csvPath)}`);
}

main().catch((error) => {
  console.error('');
  console.error('SmartCharge Simulator failed');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
