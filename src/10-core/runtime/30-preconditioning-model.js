function idlePreconditioningState(powerCut = null) {
  return {
    version: 1,
    status: 'IDLE',
    startedAt: null,
    lastPowerAt: null,
    lowPowerSince: null,
    consumed: false,
    inhibitedAt: null,
    reason: null,
    climateOffAt: null,
    stopToken: null,
    powerCut,
  };
}

function parsePreconditioningState(raw, now) {
  const state = JSON.parse(raw);
  if (state === null) return idlePreconditioningState();
  if (state && state.powerCut === undefined) state.powerCut = null;
  if (
    state.version !== 1 ||
    !['IDLE', 'RUNNING', 'INHIBITED'].includes(state.status) ||
    typeof state.consumed !== 'boolean'
  )
    throw new Error('Invalid preconditioning state');
  for (const key of [
    'startedAt',
    'lastPowerAt',
    'lowPowerSince',
    'inhibitedAt',
    'climateOffAt',
  ]) {
    if (
      state[key] !== null &&
      (!runtimeDateOrNull(state[key]) || new Date(state[key]) > now)
    )
      throw new Error('Invalid preconditioning timestamp: ' + key);
  }
  if (
    state.status !== 'IDLE' &&
    (!state.startedAt || typeof state.stopToken !== 'string')
  )
    throw new Error('Missing preconditioning activation');
  if (
    state.status === 'IDLE' &&
    (state.startedAt !== null ||
      state.lastPowerAt !== null ||
      state.lowPowerSince !== null ||
      state.inhibitedAt !== null ||
      state.climateOffAt !== null ||
      state.stopToken !== null ||
      state.reason !== null ||
      state.consumed)
  )
    throw new Error('Invalid idle preconditioning state');
  if (
    state.status === 'RUNNING' &&
    (state.inhibitedAt !== null || state.reason !== null)
  )
    throw new Error('Invalid running preconditioning state');
  if (state.consumed && !state.lastPowerAt)
    throw new Error('Missing preconditioning power observation');
  if (
    state.status === 'INHIBITED' &&
    (!state.inhibitedAt ||
      ![
        'START_TIMEOUT',
        'LOW_POWER',
        'POWER_UNAVAILABLE',
        'DISCONNECTED',
        'REVALIDATION_BLOCKED',
        'RECOVERY_UNCONFIRMED',
      ].includes(state.reason))
  )
    throw new Error('Missing preconditioning inhibition');
  if (
    state.lowPowerSince &&
    (!state.lastPowerAt ||
      new Date(state.lowPowerSince) > new Date(state.lastPowerAt))
  )
    throw new Error('Invalid preconditioning power interval');
  for (const key of ['lastPowerAt', 'lowPowerSince', 'inhibitedAt']) {
    if (state[key] && new Date(state[key]) < new Date(state.startedAt))
      throw new Error('Preconditioning observation predates activation');
  }
  if (state.powerCut !== null) {
    const cut = state.powerCut;
    if (
      typeof cut !== 'object' ||
      Array.isArray(cut) ||
      !runtimeDateOrNull(cut.at) ||
      new Date(cut.at) > now ||
      !runtimeDateOrNull(cut.expiresAt) ||
      new Date(cut.expiresAt) <= new Date(cut.at) ||
      typeof cut.stopToken !== 'string' ||
      (cut.sessionId !== null && typeof cut.sessionId !== 'string') ||
      (cut.usedAt !== null &&
        (!runtimeDateOrNull(cut.usedAt) ||
          new Date(cut.usedAt) < new Date(cut.at) ||
          new Date(cut.usedAt) > now ||
          typeof cut.lease !== 'string')) ||
      (cut.usedAt === null && cut.lease !== null)
    )
      throw new Error('Invalid expected automatic power cut');
  }
  return state;
}

function canRecoverAutomaticPowerCut(
  state,
  snapshot,
  safety,
  ownedAttempt = false,
) {
  const cut = state.powerCut;
  if (
    !cut ||
    state.status === 'INHIBITED' ||
    normalizeVehicleStatus(snapshot.vehicleStatus) !== 'failure' ||
    snapshot.mercedes?.driverId !==
      'homey:app:com.mercedes.mbapi:mercedes-vehicle' ||
    snapshot.mercedes.available !== true ||
    snapshot.mercedes.warningMessage ||
    evaluateTelemetryFreshness(snapshot.mercedes.lastSeenAt, snapshot.now) !==
      TELEMETRY_FRESHNESS.FRESH ||
    hasFreshConnectorDisconnect(snapshot) ||
    cut.stopToken !== safety.stopToken ||
    new Date(cut.expiresAt) <= snapshot.now ||
    !runtimeDateOrNull(snapshot.vehicleStatusCapabilityLastUpdated) ||
    new Date(snapshot.vehicleStatusCapabilityLastUpdated) < new Date(cut.at) ||
    new Date(snapshot.vehicleStatusCapabilityLastUpdated) > snapshot.now ||
    (snapshot.sessionActive && snapshot.sessionId !== cut.sessionId)
  )
    return false;
  if (!cut.usedAt) return true;
  return Boolean(
    ownedAttempt &&
    runtimeOwnedLock &&
    cut.lease === runtimeOwnedLock &&
    state.status === 'RUNNING' &&
    snapshot.now - new Date(cut.usedAt) <
      CONFIG.preconditioningStartGraceSeconds * 1000,
  );
}

function canStartAutomaticPower(current, requested, reasonCode) {
  if (reasonCode === 'PRECONDITIONING') return canPowerPreconditioning(current);
  return (
    current.sessionActive &&
    current.sessionId ===
      (requested.chargeConnectedAt || requested.sessionId) &&
    current.batteryFreshness === TELEMETRY_FRESHNESS.FRESH &&
    current.batteryPct !== null &&
    current.batteryPct >= 0 &&
    current.batteryPct < current.targetBatteryPct &&
    (hasTrustworthyConnectionEvidence(current) ||
      current.powerCutRecoveryAllowed === true)
  );
}

function freshPreconditioningReconnect(snapshot, since) {
  const newer = (at) => runtimeDateOrNull(at) && new Date(at) > new Date(since);
  return (
    hasTrustworthyConnectionEvidence(snapshot) &&
    ((snapshot.vehicleConnectorConnected === true &&
      snapshot.vehicleConnectorFreshness === TELEMETRY_FRESHNESS.FRESH &&
      newer(snapshot.vehicleConnectorObservedAt)) ||
      (isVehicleConnectedStatus(snapshot.vehicleStatus) &&
        evaluateTelemetryFreshness(
          snapshot.vehicleStatusCapabilityLastUpdated,
          snapshot.now,
        ) === TELEMETRY_FRESHNESS.FRESH &&
        newer(snapshot.vehicleStatusCapabilityLastUpdated)) ||
      (snapshot.connectionEvidenceSource === 'logic_variable' &&
        newer(snapshot.vehicleStatusObservedAt)))
  );
}

function canRearmPreconditioning(state, snapshot, safety) {
  if (
    state.stopToken !== safety.stopToken ||
    new Date(safety.state.autoGrant?.at) > new Date(state.inhibitedAt)
  )
    return true;
  if (freshPreconditioningReconnect(snapshot, state.inhibitedAt)) return true;
  const newClimateCycle =
    state.climateOffAt &&
    snapshot.preconditioningActive &&
    snapshot.preconditioningFreshness === TELEMETRY_FRESHNESS.FRESH &&
    new Date(snapshot.preconditioningObservedAt) >
      new Date(state.climateOffAt) &&
    new Date(snapshot.preconditioningObservedAt) > new Date(state.inhibitedAt);
  // An old true or a falling SOC while driving is not a new connection.
  return (
    state.reason !== 'DISCONNECTED' &&
    newClimateCycle &&
    hasTrustworthyConnectionEvidence(snapshot)
  );
}

function evaluatePreconditioningLoad(state, snapshot) {
  const next = { ...state };
  if (
    hasFreshConnectorDisconnect(snapshot) ||
    isVehicleUnpluggedStatus(snapshot.vehicleStatus)
  )
    return { state: next, reason: 'DISCONNECTED' };
  const sample = snapshot.plugPower;
  if (freshManualMeasurement(sample, snapshot.now, state.startedAt)) {
    const at = new Date(sample.observedAt);
    if (!next.lastPowerAt || at > new Date(next.lastPowerAt)) {
      if (
        next.lastPowerAt &&
        at - new Date(next.lastPowerAt) >
          CONFIG.manualObservationGapSeconds * 1000
      )
        next.lowPowerSince = null;
      next.lastPowerAt = at.toISOString();
      if (Number(sample.value) > CONFIG.preconditioningLowPowerW) {
        next.consumed = true;
        next.lowPowerSince = null;
      } else next.lowPowerSince ||= at.toISOString();
    }
  } else next.lowPowerSince = null;
  if (
    !next.consumed &&
    snapshot.now - new Date(next.startedAt) >=
      CONFIG.preconditioningStartGraceSeconds * 1000
  )
    return { state: next, reason: 'START_TIMEOUT' };
  if (
    next.lowPowerSince &&
    new Date(next.lastPowerAt) - new Date(next.lowPowerSince) >=
      CONFIG.preconditioningLowPowerSeconds * 1000
  )
    return { state: next, reason: 'LOW_POWER' };
  if (
    next.consumed &&
    snapshot.now - new Date(next.lastPowerAt) >
      CONFIG.manualObservationGapSeconds * 1000
  )
    return { state: next, reason: 'POWER_UNAVAILABLE' };
  return { state: next, reason: null };
}
