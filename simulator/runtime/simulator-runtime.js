const { HomeyMock } = require('./homey-mock');
const { createTibberFetch } = require('./tibber-mock');

class SimulatorRuntime {
  constructor({ scenario, scriptLoader, logWriter }) {
    this.scenario = scenario;
    this.scriptLoader = scriptLoader;
    this.logWriter = logWriter;
    this.homeyMock = new HomeyMock(scenario.initial || {});
    this.currentFlow = null;
    this.currentNow = scenario.now;
    this.currentFixture = scenario.fixture || 'normal-day';
    this.priceAnchor = scenario.priceAnchor || scenario.now;
    this.scriptLogs = [];
    this.tibberCalls = 0;

    const tibberFetch = createTibberFetch({
      getFixtureName: () => this.currentFixture,
      getNow: () => this.currentNow,
      getPriceAnchor: () => this.priceAnchor,
    });

    this.fetch = async (url, options = {}) => {
      const tibberResponse = await tibberFetch(url, options);

      if (tibberResponse) {
        this.tibberCalls += 1;
        return tibberResponse;
      }

      return this.handleLocalWebhook(options);
    };
  }

  async runStep(step) {
    this.applyStepState(step);

    const beforeEventCount = this.logWriter.events.length;
    const beforeTibberCalls = this.tibberCalls;
    const result = await this.scriptLoader.executeFlow({
      flow: step.flow,
      homey: this.homeyMock.api,
      fetch: this.fetch,
      log: this.log.bind(this),
      now: this.currentNow,
    });

    const events = this.logWriter.events.slice(beforeEventCount);

    return {
      flow: step.flow,
      now: this.currentNow,
      fixture: this.currentFixture,
      result,
      events,
      eventTypes: events.map((event) => event.eventType),
      tibberCallsDelta: this.tibberCalls - beforeTibberCalls,
      tibberCallsTotal: this.tibberCalls,
      logic: this.homeyMock.getLogicSnapshot(),
      devices: this.homeyMock.getDeviceSnapshot(),
    };
  }

  applyStepState(step) {
    this.currentFlow = step.flow;
    this.currentNow = step.now || this.scenario.now;
    this.currentFixture = step.fixture || this.scenario.fixture || 'normal-day';

    if (step.set?.logic) {
      this.homeyMock.setLogicValues(step.set.logic);
    }

    if (step.set?.devices) {
      for (const [deviceKey, patch] of Object.entries(step.set.devices)) {
        this.homeyMock.setDeviceState(deviceKey, patch);
      }
    }
  }

  handleLocalWebhook(options) {
    const payload = JSON.parse(options.body || '{}');

    this.logWriter.append({
      scenario: this.scenario.name,
      flow: this.currentFlow,
      payload,
    });

    return {
      ok: true,
      status: 200,
    };
  }

  log(...args) {
    this.scriptLogs.push({
      scenario: this.scenario.name,
      flow: this.currentFlow,
      message: args.join(' '),
    });
  }
}

module.exports = {
  SimulatorRuntime,
};
