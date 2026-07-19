// -----------------------------------------------------------------------------
// SmartCharge logger helper for HomeyScript.
// -----------------------------------------------------------------------------

const SmartChargeLogger = (() => {
  const EVENT_TYPES = Object.freeze({
    SESSION_START: 'session_start',
    SESSION_RESET: 'session_reset',
    SESSION_EXPIRED: 'session_expired',

    SMARTCHARGE_DECISION: 'smartcharge_decision',
    SMARTCHARGE_ON: 'smartcharge_on',
    SMARTCHARGE_OFF: 'smartcharge_off',
    MANUAL_OVERRIDE_ENABLED: 'manual_override_enabled',
    MANUAL_OVERRIDE_DISABLED: 'manual_override_disabled',

    BATTERY_FULL: 'battery_full',
    CHARGER_DISCONNECTED: 'charger_disconnected',
    SMARTCHARGE_ERROR: 'smartcharge_error',
  });

  const SUPPORTED_EVENT_TYPES = Object.freeze(Object.values(EVENT_TYPES));

  const CRITICAL_EVENT_TYPES = Object.freeze([
    EVENT_TYPES.SESSION_START,
    EVENT_TYPES.SESSION_RESET,
    EVENT_TYPES.SESSION_EXPIRED,
    EVENT_TYPES.SMARTCHARGE_ON,
    EVENT_TYPES.SMARTCHARGE_OFF,
    EVENT_TYPES.MANUAL_OVERRIDE_ENABLED,
    EVENT_TYPES.MANUAL_OVERRIDE_DISABLED,
    EVENT_TYPES.BATTERY_FULL,
    EVENT_TYPES.CHARGER_DISCONNECTED,
    EVENT_TYPES.SMARTCHARGE_ERROR,
  ]);

  const LOGIC_VARIABLE_NAMES = Object.freeze({
    WEBHOOK_URL: 'SMARTCHARGE_LOG_WEBHOOK_URL',
    LAST_LOG_KEY: 'SmartChargeLastLogKey',
  });

  const LOG_RESULT_REASONS = Object.freeze({
    WRITTEN: 'Log written',
    SKIPPED_UNCHANGED: 'Log key unchanged',
  });

  const DECISION_LOG_KEY_FIELDS = Object.freeze([
    'eventType',
    'battery',
    'currentPrice',
    'connectedAt',
    'targetDeparture',
    'chargeMinutes',
    'chargeSlots',
    'shouldChargeNow',
    'plannedStart',
    'plannedEnd',
    'reason',
    'plugOn',
    'plugPower',
    'totalPrice',
    'averagePrice',
    'estimatedSelectedCostEur',
    'estimatedBaselineCostEur',
    'estimatedSavingsEur',
    'estimatedSavingsPct',
    'allocatedChargeMinutes',
    'baselineAllocatedMinutes',
    'chargingPowerKw',
    'baselineAllocationComplete',
    'baselineIncompleteReason',
    'plannerMode',
    'windowCount',
    'chargeWindowsJson',
  ]);

  const GOOGLE_SHEETS_PAYLOAD_FIELDS = [
    'schemaVersion',
    'eventType',
    'reasonCode',
    'sessionId',
    'loggedAt',

    'battery',
    'targetBattery',
    'missingBatteryPercent',
    'connectedAt',
    'targetDeparture',

    'chargeFactor',
    'chargeReserve',
    'chargeMinutes',
    'chargeSlots',
    'chargeHoursAhead',

    'currentPrice',
    'averagePrice',
    'totalPrice',
    'selectedAveragePrice',
    'selectedTotalPrice',
    'baselineAveragePrice',
    'baselineTotalPrice',
    'estimatedSavingsEur',
    'estimatedSavingsPct',
    'priceCount',

    'plannerMode',
    'plannerVersion',
    'windowCount',
    'plannedStart',
    'plannedEnd',
    'chargeWindowsText',
    'chargeWindowsJson',

    'shouldChargeNow',
    'decisionSource',
    'plugOn',
    'plugPower',
    'reason',

    'source',
    'engineVersion',
    'message',
    'estimatedSelectedCostEur',
    'estimatedBaselineCostEur',
    'allocatedChargeMinutes',
    'baselineAllocatedMinutes',
    'chargingPowerKw',
    'baselineAllocationComplete',
    'baselineIncompleteReason',
  ];

  /**
   * Ensures that a value is an object.
   *
   * @param {unknown} value
   * @param {string} name
   * @returns {void}
   */
  function assertObject(value, name) {
    if (!value || typeof value !== 'object') {
      throw new TypeError(`${name} must be an object`);
    }
  }

  /**
   * Validates SmartCharge event type.
   *
   * @param {string} eventType
   * @returns {void}
   */
  function assertEventType(eventType) {
    if (!SUPPORTED_EVENT_TYPES.includes(eventType)) {
      throw new RangeError(`Unsupported log event type: ${eventType}`);
    }
  }

  /**
   * Extracts and validates event type from string or log event object.
   *
   * @param {string|object} logEventOrType
   * @returns {string}
   */
  function normalizeEventType(logEventOrType) {
    if (typeof logEventOrType === 'string') {
      assertEventType(logEventOrType);
      return logEventOrType;
    }

    assertObject(logEventOrType, 'logEvent');

    const eventType = logEventOrType.eventType || logEventOrType.type;
    assertEventType(eventType);

    return eventType;
  }

  /**
   * Converts Date values to ISO strings.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  function normalizeDateLike(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    return value;
  }

  /**
   * Normalizes values for Google Sheets payload.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  function normalizeValue(value) {
    const normalized = normalizeDateLike(value);

    if (normalized === undefined || normalized === '') {
      return null;
    }

    if (typeof normalized === 'number' && !Number.isFinite(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Normalizes a SmartCharge log event.
   *
   * @param {object} logEvent
   * @returns {object}
   */
  function normalizeLogEvent(logEvent) {
    assertObject(logEvent, 'logEvent');

    const eventType = normalizeEventType(logEvent);

    return {
      ...logEvent,

      schemaVersion: normalizeValue(
        logEvent.schemaVersion || CONFIG.telemetrySchemaVersion,
      ),
      eventType: normalizeValue(eventType),
      reasonCode: normalizeValue(logEvent.reasonCode),
      sessionId: normalizeValue(logEvent.sessionId),
      loggedAt: normalizeValue(logEvent.loggedAt),

      battery: normalizeValue(logEvent.battery),
      targetBattery: normalizeValue(logEvent.targetBattery),
      missingBatteryPercent: normalizeValue(logEvent.missingBatteryPercent),
      connectedAt: normalizeValue(logEvent.connectedAt),
      targetDeparture: normalizeValue(logEvent.targetDeparture),

      chargeFactor: normalizeValue(logEvent.chargeFactor),
      chargeReserve: normalizeValue(logEvent.chargeReserve),
      chargeMinutes: normalizeValue(logEvent.chargeMinutes),
      chargeSlots: normalizeValue(logEvent.chargeSlots),
      chargeHoursAhead: normalizeValue(logEvent.chargeHoursAhead),

      currentPrice: normalizeValue(logEvent.currentPrice),
      averagePrice: normalizeValue(logEvent.averagePrice),
      totalPrice: normalizeValue(logEvent.totalPrice),
      selectedAveragePrice: normalizeValue(logEvent.selectedAveragePrice),
      selectedTotalPrice: normalizeValue(logEvent.selectedTotalPrice),
      baselineAveragePrice: normalizeValue(logEvent.baselineAveragePrice),
      baselineTotalPrice: normalizeValue(logEvent.baselineTotalPrice),
      estimatedSavingsEur: normalizeValue(logEvent.estimatedSavingsEur),
      estimatedSavingsPct: normalizeValue(logEvent.estimatedSavingsPct),
      priceCount: normalizeValue(logEvent.priceCount),

      plannerMode: normalizeValue(logEvent.plannerMode),
      plannerVersion: normalizeValue(logEvent.plannerVersion),
      windowCount: normalizeValue(logEvent.windowCount),
      plannedStart: normalizeValue(logEvent.plannedStart),
      plannedEnd: normalizeValue(logEvent.plannedEnd),
      chargeWindowsText: normalizeValue(logEvent.chargeWindowsText),
      chargeWindowsJson: normalizeValue(logEvent.chargeWindowsJson),

      shouldChargeNow: normalizeValue(logEvent.shouldChargeNow),
      decisionSource: normalizeValue(logEvent.decisionSource),
      plugOn: normalizeValue(logEvent.plugOn),
      plugPower: normalizeValue(logEvent.plugPower),
      reason: normalizeValue(logEvent.reason),

      source: normalizeValue(logEvent.source || 'smartcharge-engine'),
      engineVersion: normalizeValue(logEvent.engineVersion || ENGINE_VERSION),
      message: normalizeValue(logEvent.message),
      estimatedSelectedCostEur: normalizeValue(
        logEvent.estimatedSelectedCostEur,
      ),
      estimatedBaselineCostEur: normalizeValue(
        logEvent.estimatedBaselineCostEur,
      ),
      allocatedChargeMinutes: normalizeValue(
        logEvent.allocatedChargeMinutes,
      ),
      baselineAllocatedMinutes: normalizeValue(
        logEvent.baselineAllocatedMinutes,
      ),
      chargingPowerKw: normalizeValue(logEvent.chargingPowerKw),
      baselineAllocationComplete: normalizeValue(
        logEvent.baselineAllocationComplete,
      ),
      baselineIncompleteReason: normalizeValue(
        logEvent.baselineIncompleteReason,
      ),
    };
  }

  /**
   * Formats a value for log key generation.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function formatKeyValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  }

  /**
   * Builds a stable key used to suppress duplicate decision logs.
   *
   * @param {object} logEvent
   * @returns {string}
   */
  function buildLogKey(logEvent) {
    const event = normalizeLogEvent(logEvent);

    return DECISION_LOG_KEY_FIELDS.map(
      (field) => `${field}=${formatKeyValue(event[field])}`,
    ).join('|');
  }

  /**
   * Checks whether event type is critical and must always be written.
   *
   * @param {string|object} eventType
   * @returns {boolean}
   */
  function isCriticalEvent(eventType) {
    const normalizedEventType = normalizeEventType(eventType);
    return CRITICAL_EVENT_TYPES.includes(normalizedEventType);
  }

  /**
   * Decides whether the log should be written.
   *
   * @param {string|null} previousKey
   * @param {string} currentKey
   * @param {string} eventType
   * @returns {boolean}
   */
  function shouldWriteLog(previousKey, currentKey, eventType) {
    const normalizedEventType = normalizeEventType(eventType);

    if (isCriticalEvent(normalizedEventType)) {
      return true;
    }

    if (normalizedEventType === EVENT_TYPES.SMARTCHARGE_DECISION) {
      return formatKeyValue(previousKey) !== formatKeyValue(currentKey);
    }

    return false;
  }

  /**
   * Resolves loggedAt value.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function toLoggedAt(value) {
    const normalized = normalizeDateLike(value || new Date());

    if (!normalized) {
      return new Date().toISOString();
    }

    return String(normalized);
  }

  /**
   * Creates Google Sheets payload with a stable field order.
   *
   * @param {object} logEvent
   * @param {object} [options]
   * @returns {object}
   */
  function prepareGoogleSheetsPayload(logEvent, options = {}) {
    const event = normalizeLogEvent(logEvent);
    const loggedAt = toLoggedAt(
      options.loggedAt || event.loggedAt || event.timestamp,
    );

    const payload = {
      ...event,
      loggedAt,
      logKey: options.logKey || buildLogKey(event),
    };

    return GOOGLE_SHEETS_PAYLOAD_FIELDS.reduce((result, field) => {
      result[field] = normalizeValue(payload[field]);
      return result;
    }, {});
  }

  function getGlobalFetch() {
    if (typeof fetch === 'function') {
      return fetch;
    }

    return null;
  }

  function resolveFetch(fetchImpl) {
    const resolvedFetch = fetchImpl || getGlobalFetch();

    if (typeof resolvedFetch !== 'function') {
      throw new Error('fetch is not available');
    }

    return resolvedFetch;
  }

  function assertWebhookUrl(webhookUrl) {
    if (
      typeof webhookUrl !== 'string' ||
      webhookUrl.trim().length === 0 ||
      webhookUrl === 'null'
    ) {
      throw new Error('Google Sheets webhook URL is missing');
    }

    return webhookUrl.trim();
  }

  /**
   * Sends prepared payload to Google Sheets webhook.
   *
   * @param {string} webhookUrl
   * @param {object} payload
   * @param {object} [options]
   * @returns {Promise<{ok:boolean,status:number}>}
   */
  async function postGoogleSheetsLog(webhookUrl, payload, options = {}) {
    const resolvedWebhookUrl = assertWebhookUrl(webhookUrl);
    const fetchImpl = resolveFetch(options.fetch);

    const response = await fetchImpl(resolvedWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response || !response.ok) {
      const status = response ? response.status : 'unknown';
      throw new Error(`Google Sheets webhook error: ${status}`);
    }

    return {
      ok: true,
      status: response.status,
    };
  }

  function resolveHomey(options = {}) {
    if (options.homey) {
      return options.homey;
    }

    if (typeof Homey !== 'undefined') {
      return Homey;
    }

    return null;
  }

  async function getHomeyLogicVariable(name, options = {}) {
    const homey = resolveHomey(options);

    if (
      !homey ||
      !homey.logic ||
      typeof homey.logic.getVariables !== 'function'
    ) {
      throw new Error('Homey logic API is not available');
    }

    const variables = await homey.logic.getVariables();
    const variable = Object.values(variables).find(
      (item) => item.name === name,
    );

    if (!variable) {
      throw new Error(`Logic variable not found: ${name}`);
    }

    return {
      homey,
      variable,
    };
  }

  async function getLogicVariableValue(name, options = {}) {
    if (typeof options.getLogicVariableValue === 'function') {
      return options.getLogicVariableValue(name);
    }

    if (
      options.logicVariables &&
      Object.prototype.hasOwnProperty.call(options.logicVariables, name)
    ) {
      return options.logicVariables[name];
    }

    const { variable } = await getHomeyLogicVariable(name, options);
    return variable.value;
  }

  async function updateLogicVariableValue(name, value, options = {}) {
    if (typeof options.updateLogicVariableValue === 'function') {
      await options.updateLogicVariableValue(name, value);
      return value;
    }

    if (
      options.logicVariables &&
      Object.prototype.hasOwnProperty.call(options.logicVariables, name)
    ) {
      options.logicVariables[name] = value;
      return value;
    }

    const { homey, variable } = await getHomeyLogicVariable(name, options);

    await homey.logic.updateVariable({
      id: variable.id,
      variable: { value },
    });

    return value;
  }

  async function getPreviousLogKey(eventType, options = {}) {
    if (options.previousKey !== undefined) {
      return options.previousKey;
    }

    if (eventType !== EVENT_TYPES.SMARTCHARGE_DECISION) {
      return null;
    }

    return getLogicVariableValue(LOGIC_VARIABLE_NAMES.LAST_LOG_KEY, options);
  }

  async function getWebhookUrl(options = {}) {
    if (options.webhookUrl !== undefined) {
      return options.webhookUrl;
    }

    return getLogicVariableValue(LOGIC_VARIABLE_NAMES.WEBHOOK_URL, options);
  }

  /**
   * Main logger entry point.
   *
   * Writes a SmartCharge event to Google Sheets.
   * Decision events are deduplicated by log key.
   * Critical lifecycle events are always written.
   *
   * @param {object} logEvent
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async function logToGoogleSheets(logEvent, options = {}) {
    const eventType = normalizeEventType(logEvent);
    const currentKey = buildLogKey(logEvent);
    const previousKey = await getPreviousLogKey(eventType, options);
    const shouldWrite = shouldWriteLog(previousKey, currentKey, eventType);

    const payload = prepareGoogleSheetsPayload(logEvent, {
      ...options,
      logKey: currentKey,
    });

    if (!shouldWrite) {
      return {
        written: false,
        reason: LOG_RESULT_REASONS.SKIPPED_UNCHANGED,
        previousKey: normalizeValue(previousKey),
        currentKey,
        payload,
      };
    }

    const webhookUrl = await getWebhookUrl(options);

    const postResult =
      typeof options.postGoogleSheetsLog === 'function'
        ? await options.postGoogleSheetsLog(webhookUrl, payload, options)
        : await postGoogleSheetsLog(webhookUrl, payload, options);

    if (eventType === EVENT_TYPES.SMARTCHARGE_DECISION) {
      await updateLogicVariableValue(
        LOGIC_VARIABLE_NAMES.LAST_LOG_KEY,
        currentKey,
        options,
      );
    }

    return {
      written: true,
      reason: LOG_RESULT_REASONS.WRITTEN,
      previousKey: normalizeValue(previousKey),
      currentKey,
      payload,
      postResult,
    };
  }

  /**
   * Writes a lifecycle event to Google Sheets.
   *
   * This helper automatically collects the current SmartCharge runtime state:
   *  - sessionId / connectedAt
   *  - battery
   *  - plug state
   *  - plug power
   *
   * It is intended for:
   *  - session_start
   *  - session_reset
   *  - smartcharge_on
   *  - smartcharge_off
   *  - battery_full
   *  - charger_disconnected
   *
   * @param {object} options
   * @param {string} options.eventType
   * @param {string} options.reason
   * @param {string|null} [options.message]
   * @param {string} [options.source]
   * @param {number|null} [options.currentPrice]
   * @param {boolean|null} [options.shouldChargeNow]
   * @returns {Promise<object>}
   */
  async function logLifecycleEvent({
    eventType,
    reason,
    message = null,
    source = 'smartcharge-runtime',
    currentPrice = null,

    schemaVersion = CONFIG.telemetrySchemaVersion,
    reasonCode = null,
    decisionSource = 'lifecycle',
    shouldChargeNow = null,

    targetBattery = null,
    missingBatteryPercent = null,

    chargeFactor = null,
    chargeReserve = null,

    selectedAveragePrice = null,
    selectedTotalPrice = null,
    baselineAveragePrice = null,
    baselineTotalPrice = null,
    estimatedSavingsEur = null,
    estimatedSavingsPct = null,

    plannerMode = null,
    plannerVersion = null,
    windowCount = null,
    chargeWindowsText = null,
    chargeWindowsJson = null,
  }) {
    const now = new Date();

    const mercedes = await getDeviceByNamePart(
      CONFIG.mercedesDeviceNameIncludes,
    );

    const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);

    const battery = mercedes.capabilitiesObj.measure_battery?.value ?? null;
    const plugOn = plug.capabilitiesObj.onoff?.value ?? null;
    const plugPower = plug.capabilitiesObj.measure_power?.value ?? null;

    const connectedAtRaw = await getVariableValue(
      CONFIG.chargeConnectedAtVariableName,
    );

    const hasActiveSession = connectedAtRaw && connectedAtRaw !== 'null';

    const sessionId = hasActiveSession ? connectedAtRaw : formatLocal(now);

    const connectedAt = hasActiveSession ? connectedAtRaw : null;

    return logToGoogleSheets(
      {
        eventType,

        schemaVersion,
        reasonCode,
        decisionSource,

        sessionId,
        loggedAt: now,

        battery,
        targetBattery,
        missingBatteryPercent,

        currentPrice,
        chargeFactor,
        chargeReserve,

        connectedAt,
        targetDeparture: null,

        chargeMinutes: null,
        chargeSlots: null,
        chargeHoursAhead: null,

        plannedStart: null,
        plannedEnd: null,

        shouldChargeNow,

        plugOn,
        plugPower,

        reason,

        averagePrice: null,
        totalPrice: null,
        selectedAveragePrice,
        selectedTotalPrice,
        baselineAveragePrice,
        baselineTotalPrice,
        estimatedSavingsEur,
        estimatedSavingsPct,
        priceCount: null,

        source,
        engineVersion: BUILD_INFO.fullVersion,

        message,

        plannerMode,
        plannerVersion,
        windowCount,
        chargeWindowsText,
        chargeWindowsJson,
      },
      {
        webhookUrl: await getVariableValue(LOGIC_VARIABLE_NAMES.WEBHOOK_URL),
      },
    );
  }

  return {
    CRITICAL_EVENT_TYPES,
    EVENT_TYPES,
    LOGIC_VARIABLE_NAMES,

    buildLogKey,
    logLifecycleEvent,
    logToGoogleSheets,
    prepareGoogleSheetsPayload,
    postGoogleSheetsLog,
    shouldWriteLog,
  };
})();
