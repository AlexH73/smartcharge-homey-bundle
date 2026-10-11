function idleManualState() {
  return {
    version: 1,
    status: 'IDLE',
    id: null,
    startedAt: null,
    confirmedAt: null,
    highPowerAt: null,
    lastPowerAt: null,
    lowPowerSince: null,
    endedAt: null,
    stopReason: null,
    error: null,
    activationStopToken: null,
    autoGrant: null,
  };
}

function parseManualState(raw, now) {
  const state = JSON.parse(raw);
  if (
    !state ||
    state.version !== 1 ||
    ![
      'IDLE',
      'STARTING',
      'CHARGING',
      'STOPPING',
      'COMPLETED',
      'STOPPED',
      'ERROR',
    ].includes(state.status)
  )
    throw new Error('Invalid manual state');
  if (state.status !== 'IDLE') {
    if (
      !state.id ||
      !runtimeDateOrNull(state.startedAt) ||
      new Date(state.startedAt) > now
    )
      throw new Error('Invalid manual activation timestamp');
  }
  for (const key of [
    'confirmedAt',
    'highPowerAt',
    'lastPowerAt',
    'lowPowerSince',
    'endedAt',
  ]) {
    if (
      state[key] !== null &&
      (!runtimeDateOrNull(state[key]) ||
        new Date(state[key]) > now ||
        new Date(state[key]) < new Date(state.startedAt))
    )
      throw new Error(`Invalid manual timestamp: ${key}`);
  }
  if (state.lowPowerSince && !state.confirmedAt)
    throw new Error('Low power before start confirmation');
  if (state.status === 'CHARGING' && !state.confirmedAt)
    throw new Error('Missing start confirmation');
  if (
    ['COMPLETED', 'STOPPED'].includes(state.status) &&
    (!state.endedAt || !state.stopReason)
  )
    throw new Error('Incomplete terminal manual record');
  if (state.autoGrant) {
    const grantedAt = runtimeDateOrNull(state.autoGrant.at);
    if (
      !grantedAt ||
      grantedAt > now ||
      (state.endedAt && grantedAt < new Date(state.endedAt)) ||
      typeof state.autoGrant.stopToken !== 'string'
    )
      throw new Error('Invalid automatic permission');
  }
  return state;
}

function isManualRunning(state) {
  return (
    ['STARTING', 'CHARGING', 'STOPPING', 'ERROR'].includes(state.status) &&
    !state.endedAt
  );
}

function freshManualMeasurement(diagnostic, now, since) {
  const at = runtimeDateOrNull(diagnostic.observedAt);
  const value = runtimeNumberOrNull(diagnostic.value);
  return (
    value !== null &&
    value >= 0 &&
    at &&
    at <= now &&
    (!since || at >= new Date(since)) &&
    now - at <= CONFIG.manualPowerFreshnessSeconds * 1000
  );
}

function evaluateManualCharging(state, input) {
  const next = { ...state };
  const now = input.now;
  if (next.stopReason) return { state: next, stopReason: next.stopReason };
  if (
    now - new Date(next.startedAt) >=
    CONFIG.manualMaximumDurationMinutes * 60000
  )
    return { state: next, stopReason: 'MAX_DURATION_REACHED' };
  const batteryFresh =
    evaluateTelemetryFreshness(input.battery.observedAt, now) ===
      TELEMETRY_FRESHNESS.FRESH &&
    new Date(input.battery.observedAt) <= now &&
    new Date(input.battery.observedAt) >= new Date(next.startedAt);
  if (
    batteryFresh &&
    runtimeNumberOrNull(input.battery.value) >= CONFIG.batteryFullPercentage &&
    runtimeNumberOrNull(input.battery.value) !== null
  )
    return { state: next, stopReason: 'BATTERY_FULL', batteryFresh: true };
  const powerFresh =
    input.plugOn && freshManualMeasurement(input.power, now, next.startedAt);
  if (
    !next.lastPowerAt ||
    now - new Date(next.lastPowerAt) > CONFIG.manualObservationGapSeconds * 1000
  ) {
    next.lowPowerSince = null;
    next.highPowerAt = null;
  }
  if (!powerFresh) {
    next.lowPowerSince = null;
    next.highPowerAt = null;
    return {
      state: next,
      stopReason: null,
      powerHealth: 'UNAVAILABLE_OR_STALE',
      batteryFresh,
    };
  }
  const at = new Date(input.power.observedAt);
  const power = Number(input.power.value);
  if (power > CONFIG.manualLowPowerW) next.lowPowerSince = null;
  if (!next.confirmedAt && power <= CONFIG.chargingPowerThresholdW)
    next.highPowerAt = null;
  if (next.lastPowerAt && at <= new Date(next.lastPowerAt)) {
    return {
      state: next,
      stopReason: null,
      powerHealth: 'NO_NEW_SAMPLE',
      batteryFresh,
    };
  }
  if (
    next.lastPowerAt &&
    at - new Date(next.lastPowerAt) > CONFIG.manualObservationGapSeconds * 1000
  ) {
    next.lowPowerSince = null;
    next.highPowerAt = null;
  }
  next.lastPowerAt = at.toISOString();
  let startConfirmed = false;
  if (!next.confirmedAt) {
    if (power > CONFIG.chargingPowerThresholdW) {
      if (!next.highPowerAt) next.highPowerAt = at.toISOString();
      else if (
        at - new Date(next.highPowerAt) >=
        CONFIG.manualStartConfirmationSeconds * 1000
      ) {
        next.confirmedAt = at.toISOString();
        next.status = 'CHARGING';
        startConfirmed = true;
      }
    } else next.highPowerAt = null;
  } else if (power <= CONFIG.manualLowPowerW) {
    next.lowPowerSince ||= at.toISOString();
    if (
      at - new Date(next.lowPowerSince) >=
      CONFIG.manualLowPowerSeconds * 1000
    )
      return {
        state: next,
        stopReason: 'LOW_POWER',
        powerHealth: 'FRESH',
        batteryFresh,
      };
  } else next.lowPowerSince = null;
  return {
    state: next,
    stopReason: null,
    startConfirmed,
    powerHealth: 'FRESH',
    batteryFresh,
  };
}
