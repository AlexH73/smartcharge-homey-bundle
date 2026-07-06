// -----------------------------------------------------------------------------
// Bundled SmartCharge logger helper for HomeyScript.
// -----------------------------------------------------------------------------

const SmartChargeLogger = (() => {
  // Logger event names and write policy.
  const EVENT_TYPES = Object.freeze({
    SESSION_START: 'session_start',
    SMARTCHARGE_DECISION: 'smartcharge_decision',
    SMARTCHARGE_ON: 'smartcharge_on',
    SMARTCHARGE_OFF: 'smartcharge_off',
    BATTERY_FULL: 'battery_full',
    CHARGER_DISCONNECTED: 'charger_disconnected',
    SMARTCHARGE_ERROR: 'smartcharge_error',
  });

  const SUPPORTED_EVENT_TYPES = Object.freeze(Object.values(EVENT_TYPES));
  const CRITICAL_EVENT_TYPES = Object.freeze([
    EVENT_TYPES.SESSION_START,
    EVENT_TYPES.SMARTCHARGE_ON,
    EVENT_TYPES.SMARTCHARGE_OFF,
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

  // Fields that define whether a decision log entry has meaningfully changed.
  const DECISION_LOG_KEY_FIELDS = Object.freeze([
    'eventType',
    'battery',
    'currentPrice',
    'connectedAt',
    'targetDeparture',
    'chargeMinutes',
    'chargeQuarters',
    'chargeSlots',
    'chargeHoursAhead',
    'shouldChargeNow',
    'plannedStart',
    'plannedEnd',
    'reason',
    'totalPrice',
    'averagePrice',
  ]);

  // Stable payload shape expected by the Google Sheets webhook.
  const GOOGLE_SHEETS_PAYLOAD_FIELDS = Object.freeze([
    'eventType',
    'sessionId',
    'loggedAt',

    'battery',
    'currentPrice',

    'chargeMinutes',
    'chargeSlots',
    'chargeHoursAhead',

    'connectedAt',
    'targetDeparture',

    'plannedStart',
    'plannedEnd',

    'shouldChargeNow',

    'plugOn',
    'plugPower',

    'reason',

    'averagePrice',
    'totalPrice',

    'priceCount',

    'source',
    'engineVersion',

    'message',
  ]);

  // Validation and normalization helpers.
  function assertObject(value, name) {
    if (!value || typeof value !== 'object') {
      throw new TypeError(`${name} must be an object`);
    }
  }

  function assertEventType(eventType) {
    if (!SUPPORTED_EVENT_TYPES.includes(eventType)) {
      throw new RangeError(`Unsupported log event type: ${eventType}`);
    }
  }

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

  function normalizeDateLike(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    return value;
  }

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

  function normalizeLogEvent(logEvent) {
    assertObject(logEvent, 'logEvent');

    const eventType = normalizeEventType(logEvent);

    return {
      ...logEvent,
      eventType,
      battery: normalizeValue(logEvent.battery),
      connectedAt: normalizeValue(logEvent.connectedAt),
      currentPrice: normalizeValue(logEvent.currentPrice),
      loggedAt: normalizeValue(logEvent.loggedAt),
      targetDeparture: normalizeValue(logEvent.targetDeparture),
      chargeMinutes: normalizeValue(logEvent.chargeMinutes),
      chargeQuarters: normalizeValue(logEvent.chargeQuarters),
      chargeSlots: normalizeValue(logEvent.chargeSlots),
      chargeHoursAhead: normalizeValue(logEvent.chargeHoursAhead),
      shouldChargeNow: normalizeValue(logEvent.shouldChargeNow),
      plannedStart: normalizeValue(logEvent.plannedStart),
      plannedEnd: normalizeValue(logEvent.plannedEnd),
      reason: normalizeValue(logEvent.reason),
      totalPrice: normalizeValue(logEvent.totalPrice),
      averagePrice: normalizeValue(logEvent.averagePrice),
      priceCount: normalizeValue(logEvent.priceCount),
      source: normalizeValue(logEvent.source || 'smartcharge-engine'),
      message: normalizeValue(logEvent.message),
      sessionId: normalizeValue(logEvent.sessionId),
      currentPrice: normalizeValue(logEvent.currentPrice),
      plugOn: normalizeValue(logEvent.plugOn),
      plugPower: normalizeValue(logEvent.plugPower),
      engineVersion: normalizeValue(logEvent.engineVersion),
    };
  }

  // Log key and write-decision helpers.
  function formatKeyValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  }

  function buildLogKey(logEvent) {
    const event = normalizeLogEvent(logEvent);

    return DECISION_LOG_KEY_FIELDS.map(
      (field) => `${field}=${formatKeyValue(event[field])}`,
    ).join('|');
  }

  function isCriticalEvent(eventType) {
    const normalizedEventType = normalizeEventType(eventType);
    return CRITICAL_EVENT_TYPES.includes(normalizedEventType);
  }

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

  // Google Sheets payload and webhook helpers.
  function toLoggedAt(value) {
    const normalized = normalizeDateLike(value || new Date());

    if (!normalized) {
      return new Date().toISOString();
    }

    return String(normalized);
  }

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

  // Homey logic variable access used by logger integration.
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

  // Public logger entry point.
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

  return {
    CRITICAL_EVENT_TYPES,
    EVENT_TYPES,
    LOGIC_VARIABLE_NAMES,
    buildLogKey,
    logToGoogleSheets,
    prepareGoogleSheetsPayload,
    postGoogleSheetsLog,
    shouldWriteLog,
  };
})();
