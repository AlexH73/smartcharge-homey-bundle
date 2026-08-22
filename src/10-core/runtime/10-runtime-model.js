const RUNTIME_STATES = Object.freeze({
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  WAITING: 'WAITING',
  CHARGING: 'CHARGING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  DEGRADED: 'DEGRADED',
});

const TELEMETRY_HEALTH = Object.freeze({
  HEALTHY: 'HEALTHY',
  CONTRADICTED: 'CONTRADICTED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const TELEMETRY_FRESHNESS = Object.freeze({
  FRESH: 'FRESH',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
});

function normalizeVehicleStatus(value) {
  return value === null || value === undefined
    ? null
    : String(value).trim().toLowerCase();
}

function isVehicleConnectedStatus(status) {
  return [
    'charge',
    'charging',
    'charge break',
    'connected',
    'plugged',
    'plugged_in',
  ].includes(normalizeVehicleStatus(status));
}

function isVehicleUnpluggedStatus(status) {
  return ['unplugged', 'disconnected'].includes(normalizeVehicleStatus(status));
}

function evaluateTelemetryFreshness(observedAt, now, config = CONFIG) {
  if (!observedAt) return TELEMETRY_FRESHNESS.UNKNOWN;
  const timestamp =
    observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(timestamp.getTime())) return TELEMETRY_FRESHNESS.UNKNOWN;
  return now.getTime() - timestamp.getTime() <=
    config.telemetryStaleMinutes * 60000
    ? TELEMETRY_FRESHNESS.FRESH
    : TELEMETRY_FRESHNESS.STALE;
}

function evaluateTelemetryHealth(snapshot, config = CONFIG) {
  if (
    !snapshot.vehicleStatus &&
    !snapshot.vehicleCharging &&
    snapshot.vehicleChargingPowerW < config.chargingPowerThresholdW
  )
    return TELEMETRY_HEALTH.UNAVAILABLE;
  if (
    snapshot.sessionActive &&
    isVehicleUnpluggedStatus(snapshot.vehicleStatus) &&
    (snapshot.plugPowerW >= config.chargingPowerThresholdW ||
      snapshot.vehicleChargingPowerW >= config.chargingPowerThresholdW ||
      snapshot.vehicleCharging)
  ) {
    return TELEMETRY_HEALTH.CONTRADICTED;
  }
  return TELEMETRY_HEALTH.HEALTHY;
}

function hasTrustworthyConnectionEvidence(snapshot) {
  return (
    snapshot.vehicleTelemetryHealth === TELEMETRY_HEALTH.HEALTHY &&
    ((snapshot.vehicleTelemetryFreshness === TELEMETRY_FRESHNESS.FRESH &&
      isVehicleConnectedStatus(snapshot.vehicleStatus)) ||
      (snapshot.vehicleCharging &&
        snapshot.vehicleChargingFreshness === TELEMETRY_FRESHNESS.FRESH) ||
      snapshot.vehicleChargingPowerW >= CONFIG.chargingPowerThresholdW)
  );
}

function canCreateSession(snapshot) {
  return !snapshot.sessionActive && hasTrustworthyConnectionEvidence(snapshot);
}

function evaluateCompletionEvidence(snapshot) {
  return (
    snapshot.sessionActive &&
    snapshot.batteryPct !== null &&
    snapshot.batteryPct >= snapshot.targetBatteryPct
  );
}

function isSuspectedDisconnect(snapshot, config = CONFIG) {
  return (
    snapshot.sessionActive &&
    isVehicleUnpluggedStatus(snapshot.vehicleStatus) &&
    !snapshot.vehicleCharging &&
    snapshot.vehicleChargingPowerW <= config.idlePowerThresholdW &&
    snapshot.plugPowerW <= config.idlePowerThresholdW
  );
}

function evaluateDisconnectEvidence(snapshot, config = CONFIG) {
  if (
    !isSuspectedDisconnect(snapshot, config) ||
    !snapshot.disconnectObservedAt
  )
    return false;
  return (
    snapshot.now.getTime() - snapshot.disconnectObservedAt.getTime() >=
    config.disconnectConfirmationMinutes * 60000
  );
}

function deriveDesiredPlugState(snapshot) {
  if (!snapshot.sessionActive)
    return { desiredPlugOn: false, reason: 'No active session' };
  if (evaluateCompletionEvidence(snapshot))
    return { desiredPlugOn: false, reason: 'Target battery reached' };
  if (snapshot.expiredSession)
    return { desiredPlugOn: false, reason: 'Session expired' };
  if (snapshot.suspectedDisconnect || snapshot.confirmedDisconnect) {
    return {
      desiredPlugOn: false,
      reason: snapshot.confirmedDisconnect
        ? 'Disconnect confirmed'
        : 'Disconnect confirmation pending',
    };
  }
  if (snapshot.manualOverride)
    return { desiredPlugOn: true, reason: 'Manual override requests power' };
  if (snapshot.plannerShouldCharge)
    return { desiredPlugOn: true, reason: 'Planner requests charging' };
  if (snapshot.preconditioningActive && snapshot.plugOn)
    return {
      desiredPlugOn: true,
      reason: 'Preconditioning keeps power available',
    };
  return { desiredPlugOn: false, reason: 'Planner requests waiting' };
}

function deriveRuntimeState(snapshot, desiredPlugOn) {
  if (!snapshot.sessionActive) return RUNTIME_STATES.IDLE;
  if (evaluateCompletionEvidence(snapshot)) return RUNTIME_STATES.COMPLETED;
  if (snapshot.expiredSession) return RUNTIME_STATES.COMPLETED;
  if (
    snapshot.vehicleTelemetryHealth !== TELEMETRY_HEALTH.HEALTHY ||
    snapshot.suspectedDisconnect
  )
    return RUNTIME_STATES.DEGRADED;
  if (
    snapshot.vehicleCharging ||
    snapshot.vehicleChargingPowerW >= CONFIG.chargingPowerThresholdW ||
    (snapshot.plugOn && snapshot.plugPowerW >= CONFIG.chargingPowerThresholdW)
  )
    return RUNTIME_STATES.CHARGING;
  if (snapshot.plugOn) return RUNTIME_STATES.PAUSED;
  return desiredPlugOn ? RUNTIME_STATES.ACTIVE : RUNTIME_STATES.WAITING;
}
