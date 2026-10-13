let runtimeControllerRunning = false;

function readCapabilityDiagnostic(device, names) {
  let firstPresent = null;
  for (const name of names) {
    if (
      !Object.prototype.hasOwnProperty.call(device.capabilitiesObj || {}, name)
    )
      continue;
    const capability = device.capabilitiesObj[name];
    const diagnostic = {
      name,
      value: getCapabilityValue(device, name),
      units:
        capability && typeof capability === 'object'
          ? capability.units || capability.unit || null
          : null,
      observedAt:
        capability && typeof capability === 'object'
          ? capability.lastUpdated || capability.updatedAt || null
          : null,
    };
    firstPresent ||= diagnostic;
    if (
      diagnostic.value !== null &&
      diagnostic.value !== undefined &&
      diagnostic.value !== ''
    )
      return diagnostic;
  }
  return (
    firstPresent || { name: null, value: null, units: null, observedAt: null }
  );
}

function runtimeNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '')
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function runtimeBoolean(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function normalizeVehicleChargingPowerToWatts(value, units) {
  const numericValue = runtimeNumberOrNull(value);
  if (numericValue === null) return null;
  if (numericValue === 0) return 0;
  const normalizedUnits = String(units ?? '')
    .trim()
    .toLowerCase();
  if (normalizedUnits === 'w') return numericValue;
  if (normalizedUnits === 'kw') return numericValue * 1000;
  return null;
}

function runtimeActiveSession(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return (
    normalized !== '' && normalized !== 'null' && normalized !== 'undefined'
  );
}

function runtimeDateOrNull(value) {
  if (!runtimeActiveSession(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function selectConnectionEvidence(statusObservedAt, logicEvidenceAt) {
  const statusDate = runtimeDateOrNull(statusObservedAt);
  const logicDate = runtimeDateOrNull(logicEvidenceAt);
  if (
    logicDate &&
    (!statusDate || logicDate.getTime() >= statusDate.getTime())
  ) {
    return { observedAt: logicEvidenceAt, source: 'logic_variable' };
  }
  if (statusDate) {
    return { observedAt: statusObservedAt, source: 'capability_timestamp' };
  }
  return { observedAt: null, source: null };
}

async function collectRuntimeSnapshot() {
  const now = new Date();
  let mercedes;
  try {
    mercedes = await getDeviceByNamePart(CONFIG.mercedesDeviceNameIncludes);
  } catch (error) {
    mercedes = { capabilitiesObj: {} };
    log(`Vehicle unavailable: ${error.message}`);
  }
  const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);
  const chargeConnectedAt = await getVariableValue(
    CONFIG.chargeConnectedAtVariableName,
  );
  const connectionEvidenceAt = await getVariableValue(
    CONFIG.runtimeConnectionEvidenceAtVariableName,
  );
  const disconnectObservedRaw = await getVariableValue(
    CONFIG.runtimeDisconnectObservedAtVariableName,
  );
  const status = readCapabilityDiagnostic(
    mercedes,
    CONFIG.vehicleStatusCapabilityNames,
  );
  const preconditioning = readCapabilityDiagnostic(
    mercedes,
    CONFIG.preconditioningCapabilityNames,
  );
  const charging = readCapabilityDiagnostic(
    mercedes,
    CONFIG.vehicleChargingCapabilityNames,
  );
  const chargingPower = readCapabilityDiagnostic(
    mercedes,
    CONFIG.vehicleChargingPowerCapabilityNames,
  );
  const battery = readCapabilityDiagnostic(mercedes, ['measure_battery']);
  const connectionEvidence = selectConnectionEvidence(
    status.observedAt,
    connectionEvidenceAt,
  );
  const evidenceObservedAt = connectionEvidence.observedAt;
  const snapshot = {
    now,
    mercedes,
    plug,
    sessionId: runtimeActiveSession(chargeConnectedAt)
      ? chargeConnectedAt
      : null,
    chargeConnectedAt: runtimeActiveSession(chargeConnectedAt)
      ? chargeConnectedAt
      : null,
    sessionActive: runtimeActiveSession(chargeConnectedAt),
    batteryPct: runtimeNumberOrNull(
      getCapabilityValue(mercedes, 'measure_battery'),
    ),
    batteryObservedAt: battery.observedAt,
    batteryFreshness: evaluateTelemetryFreshness(battery.observedAt, now),
    targetBatteryPct: CONFIG.batteryFullPercentage,
    vehicleStatus: status.value,
    vehicleStatusCapability: status.name,
    vehicleStatusObservedAt: evidenceObservedAt,
    vehicleStatusCapabilityLastUpdated: status.observedAt,
    connectionEvidenceSource: connectionEvidence.source,
    vehicleConnectedSignal: isVehicleConnectedStatus(status.value),
    vehicleCharging: runtimeBoolean(charging.value),
    vehicleChargingCapability: charging.name,
    vehicleChargingRawValue: charging.value,
    vehicleChargingObservedAt: charging.observedAt,
    vehicleChargingFreshness: evaluateTelemetryFreshness(
      charging.observedAt,
      now,
    ),
    vehicleChargingPowerW: normalizeVehicleChargingPowerToWatts(
      chargingPower.value,
      chargingPower.units,
    ),
    vehicleChargingPowerCapability: chargingPower.name,
    vehicleChargingPowerRawValue: chargingPower.value,
    vehicleChargingPowerUnits: chargingPower.units,
    vehicleChargingPowerObservedAt: chargingPower.observedAt,
    vehicleChargingPowerFreshness: evaluateTelemetryFreshness(
      chargingPower.observedAt,
      now,
    ),
    manualOverride: runtimeBoolean(
      await getVariableValue(CONFIG.smartChargeManualModeVariableName),
    ),
    preconditioningActive: runtimeBoolean(preconditioning.value),
    preconditioningCapability: preconditioning.name,
    preconditioningRawValue: preconditioning.value,
    preconditioningObservedAt: preconditioning.observedAt,
    plannerShouldCharge: runtimeBoolean(
      await getVariableValue(CONFIG.smartChargeShouldChargeVariableName),
    ),
    plannerDecision: null,
    plugOn: getCapabilityValue(plug, 'onoff') === true,
    plugPowerW:
      runtimeNumberOrNull(getCapabilityValue(plug, 'measure_power')) ?? 0,
    disconnectObservedAt: runtimeDateOrNull(disconnectObservedRaw),
  };
  snapshot.vehicleTelemetryFreshness = evaluateTelemetryFreshness(
    evidenceObservedAt,
    now,
  );
  snapshot.vehicleTelemetryHealth = evaluateTelemetryHealth(snapshot);
  snapshot.suspectedDisconnect = isSuspectedDisconnect(snapshot);
  snapshot.confirmedDisconnect = evaluateDisconnectEvidence(snapshot);
  return snapshot;
}

async function reconcileDisconnectObservation(snapshot, activeMode) {
  const recovered =
    hasTrustworthyConnectionEvidence(snapshot) ||
    snapshot.vehicleCharging ||
    snapshot.vehicleChargingPowerW >= CONFIG.chargingPowerThresholdW ||
    snapshot.plugPowerW >= CONFIG.chargingPowerThresholdW;
  if (recovered && snapshot.disconnectObservedAt) {
    if (activeMode)
      await tryUpdateVariableByName(
        CONFIG.runtimeDisconnectObservedAtVariableName,
        'null',
      );
    return {
      ...snapshot,
      disconnectObservedAt: null,
      suspectedDisconnect: false,
      confirmedDisconnect: false,
    };
  }
  if (!snapshot.suspectedDisconnect || snapshot.disconnectObservedAt)
    return snapshot;
  if (activeMode) {
    await tryUpdateVariableByName(
      CONFIG.runtimeDisconnectObservedAtVariableName,
      snapshot.now.toISOString(),
    );
  }
  return { ...snapshot, disconnectObservedAt: snapshot.now };
}

async function createRuntimeSession(snapshot) {
  const current = await getVariableValue(CONFIG.chargeConnectedAtVariableName);
  if (runtimeActiveSession(current))
    return {
      ...snapshot,
      sessionActive: true,
      sessionId: current,
      chargeConnectedAt: current,
    };
  const sessionId = formatLocal(snapshot.now);
  await tryUpdateVariableByName(
    CONFIG.chargeConnectedAtVariableName,
    sessionId,
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargeSessionStatusVariableName,
    'active',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargeShouldChargeVariableName,
    false,
  );
  if (snapshot.connectionEvidenceSource === 'logic_variable') {
    await tryUpdateVariableByName(
      CONFIG.runtimeConnectionEvidenceAtVariableName,
      'null',
    );
  }
  await SmartChargeLogger.logLifecycleEvent({
    eventType: SmartChargeLogger.EVENT_TYPES.SESSION_START,
    reason: 'Runtime confirmed fresh vehicle connection',
    source: 'smartcharge-runtime-controller',
  });
  return {
    ...snapshot,
    sessionActive: true,
    sessionId,
    chargeConnectedAt: sessionId,
    plannerShouldCharge: false,
  };
}

async function resetRuntimeSession(
  snapshot,
  eventType,
  reason,
  status,
  emitLifecycle = true,
) {
  await tryUpdateVariableByName(
    CONFIG.smartChargeSessionStatusVariableName,
    status,
  );
  if (emitLifecycle) {
    await SmartChargeLogger.logLifecycleEvent({
      eventType,
      reason,
      source: 'smartcharge-runtime-controller',
      shouldChargeNow: false,
    });
  }
  await tryUpdateVariableByName(CONFIG.chargeConnectedAtVariableName, 'null');
  await tryUpdateVariableByName(
    CONFIG.smartChargeShouldChargeVariableName,
    false,
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedStartVariableName,
    'null',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedEndVariableName,
    'null',
  );
  await tryUpdateVariableByName(
    CONFIG.runtimeDisconnectObservedAtVariableName,
    'null',
  );
  await tryUpdateVariableByName(
    CONFIG.runtimeConnectionEvidenceAtVariableName,
    'null',
  );
  if (isPlanStabilityLiveShadowEnabled()) {
    const stabilityCleanup = await clearAcceptedStrategyAnchor();
    if (!stabilityCleanup.success) {
      log(
        `Plan stability cleanup failed: ${stabilityCleanup.error || stabilityCleanup.status}`,
      );
    }
  }
  return true;
}

async function applyRuntimeActions(snapshot, desiredPlugOn, activeMode) {
  if (desiredPlugOn === snapshot.plugOn) return 'none';
  if (!activeMode)
    return desiredPlugOn ? 'would_switch_on' : 'would_switch_off';
  return executeRuntimePlugCommand(
    snapshot,
    desiredPlugOn,
    'AUTOMATIC_RECONCILIATION',
  );
}

function proposedLifecycleAction(snapshot) {
  if (evaluateCompletionEvidence(snapshot)) return 'would_complete_session';
  if (snapshot.expiredSession) return 'would_expire_session';
  if (snapshot.confirmedDisconnect) return 'would_confirm_disconnect';
  if (snapshot.suspectedDisconnect) return 'suspected_disconnect';
  if (canCreateSession(snapshot)) return 'would_create_session';
  if (snapshot.vehicleTelemetryHealth === TELEMETRY_HEALTH.CONTRADICTED)
    return 'telemetry_contradiction';
  return 'none';
}

async function runAutomaticRuntimeController() {
  if (runtimeControllerRunning)
    return { skipped: true, reason: 'Runtime controller already running' };
  runtimeControllerRunning = true;
  try {
    let snapshot = await collectRuntimeSnapshot();
    const configuredMode = String(
      (await getVariableValue(CONFIG.runtimeModeVariableName)) ||
        CONFIG.runtimeControllerDefaultMode,
    ).toLowerCase();
    const activeMode = configuredMode === 'active';
    let lifecycleProposal = proposedLifecycleAction(snapshot);
    if (activeMode && canCreateSession(snapshot))
      snapshot = await createRuntimeSession(snapshot);
    snapshot = await reconcileDisconnectObservation(snapshot, activeMode);

    if (
      snapshot.sessionActive &&
      snapshot.batteryPct !== null &&
      !snapshot.suspectedDisconnect &&
      !snapshot.confirmedDisconnect &&
      !evaluateCompletionEvidence(snapshot)
    ) {
      snapshot.plannerDecision = await runCanonicalDecision({
        mutateDecisionState: activeMode,
        controlPlug: false,
        emitTelemetry: activeMode,
        emitTerminalTelemetry: false,
        stabilityContext: {
          stabilityAllowed: true,
          activelyCharging: snapshot.plugOn,
          manualOverrideActive: snapshot.manualOverride,
          disconnectSafetyActive:
            snapshot.suspectedDisconnect || snapshot.confirmedDisconnect,
          lifecycleBypassActive: false,
        },
      });
      snapshot.plannerShouldCharge = snapshot.plannerDecision.shouldChargeNow;
      snapshot.expiredSession =
        snapshot.plannerDecision.terminalState === 'expired';
    }
    let preliminaryPlan = snapshot.plannerDecision
      ? snapshot.batteryFreshness === TELEMETRY_FRESHNESS.FRESH
        ? null
        : {
            ...snapshot.plannerDecision,
            preliminary: true,
            shouldChargeNow: false,
            batteryFreshness: snapshot.batteryFreshness,
            batteryObservedAt: snapshot.batteryObservedAt,
            batteryAgeMinutes: runtimeDateOrNull(snapshot.batteryObservedAt)
              ? (snapshot.now - new Date(snapshot.batteryObservedAt)) / 60000
              : null,
          }
      : null;
    if (preliminaryPlan && snapshot.plannerDecision) {
      preliminaryPlan.reason = `Preliminary (${preliminaryPlan.batteryFreshness}, SOC age ${preliminaryPlan.batteryAgeMinutes ?? 'unknown'} min): ${preliminaryPlan.reason}; physical ON requires fresh evidence`;
    }
    if (!snapshot.plannerDecision) {
      if (snapshot.sessionActive && snapshot.batteryPct === null) {
        // A transient SOC gap preserves the previous tariff decision, never
        // permission for a new ON. The Session deadline still applies.
        snapshot.expiredSession =
          getTargetDeparture(
            parseDateOrFallback(snapshot.chargeConnectedAt, snapshot.now),
          ) < snapshot.now;
      } else snapshot.plannerShouldCharge = false;
    }
    lifecycleProposal = proposedLifecycleAction(snapshot);
    let desired = deriveDesiredPlugState(snapshot);
    const freshOnEvidence =
      snapshot.batteryPct !== null &&
      snapshot.batteryFreshness === TELEMETRY_FRESHNESS.FRESH &&
      hasTrustworthyConnectionEvidence(snapshot);
    const continuingExistingCharge =
      desired.desiredPlugOn &&
      !freshOnEvidence &&
      snapshot.plugOn &&
      snapshot.plugPowerW >= CONFIG.chargingPowerThresholdW;
    if (desired.desiredPlugOn && !freshOnEvidence) {
      desired = {
        desiredPlugOn: false,
        reason: continuingExistingCharge
          ? 'Fresh evidence required for ON; preserving existing charging'
          : 'Fresh evidence required for automatic ON',
      };
    }
    const action = continuingExistingCharge
      ? 'none'
      : await applyRuntimeActions(snapshot, desired.desiredPlugOn, activeMode);
    let lifecycleApplied = false;
    if (activeMode && evaluateCompletionEvidence(snapshot)) {
      lifecycleApplied = await resetRuntimeSession(
        snapshot,
        SmartChargeLogger.EVENT_TYPES.BATTERY_FULL,
        'Target battery reached',
        'completed',
      );
    } else if (activeMode && snapshot.expiredSession) {
      lifecycleApplied = await resetRuntimeSession(
        snapshot,
        SmartChargeLogger.EVENT_TYPES.SESSION_EXPIRED,
        'Session expired: target departure is in the past',
        'expired',
        true,
      );
    } else if (activeMode && snapshot.confirmedDisconnect) {
      lifecycleApplied = await resetRuntimeSession(
        snapshot,
        SmartChargeLogger.EVENT_TYPES.CHARGER_DISCONNECTED,
        'Disconnect confirmed after observation period',
        'disconnected',
      );
    }
    // Physical safety reconciliation and terminal cleanup precede any optional
    // tariff request, which may never resolve.
    if (!snapshot.plannerDecision)
      preliminaryPlan = await runPreliminaryPlanning(null, activeMode);
    const result = {
      ...(snapshot.plannerDecision || {}),
      ...(snapshot.plannerDecision || {}),
      mode: activeMode ? 'active' : 'shadow',
      runtimeState: deriveRuntimeState(snapshot, desired.desiredPlugOn),
      sessionId: snapshot.sessionId,
      sessionActive: lifecycleApplied ? false : snapshot.sessionActive,
      desiredPlugState: desired.desiredPlugOn,
      actualPlugState:
        action === 'switched_on'
          ? true
          : action === 'switched_off'
            ? false
            : snapshot.plugOn,
      vehicleTelemetryHealth: snapshot.vehicleTelemetryHealth,
      vehicleTelemetryFreshness: snapshot.vehicleTelemetryFreshness,
      vehicleStatusCapability: snapshot.vehicleStatusCapability,
      vehicleStatusRawValue: snapshot.vehicleStatus,
      vehicleStatusLastUpdated: snapshot.vehicleStatusCapabilityLastUpdated,
      vehicleChargingCapability: snapshot.vehicleChargingCapability,
      vehicleChargingRawValue: snapshot.vehicleChargingRawValue,
      vehicleChargingLastUpdated: snapshot.vehicleChargingObservedAt,
      vehicleChargingPowerCapability: snapshot.vehicleChargingPowerCapability,
      vehicleChargingPowerRawValue: snapshot.vehicleChargingPowerRawValue,
      vehicleChargingPowerUnits: snapshot.vehicleChargingPowerUnits,
      vehicleChargingPowerW: snapshot.vehicleChargingPowerW,
      vehicleChargingPowerLastUpdated: snapshot.vehicleChargingPowerObservedAt,
      preconditioningCapability: snapshot.preconditioningCapability,
      preconditioningRawValue: snapshot.preconditioningRawValue,
      preconditioningLastUpdated: snapshot.preconditioningObservedAt,
      runtimeDecisionReason: desired.reason,
      preliminaryPlan,
      continuingExistingCharge,
      proposedLifecycleAction: lifecycleProposal,
      action,
      plannerShouldCharge: snapshot.plannerShouldCharge,
      manualOverride: snapshot.manualOverride,
      ...(snapshot.plannerDecision?.stabilityMode === 'shadow'
        ? {
            stabilityMode: snapshot.plannerDecision.stabilityMode,
            stabilityDecision: snapshot.plannerDecision.stabilityDecision,
            stabilityReasonCode: snapshot.plannerDecision.stabilityReasonCode,
            stabilityError: snapshot.plannerDecision.stabilityError || null,
            acceptedStrategyRevision:
              snapshot.plannerDecision.acceptedStrategyRevision,
            strategyEquivalent: snapshot.plannerDecision.strategyEquivalent,
            continuationFeasible: snapshot.plannerDecision.continuationFeasible,
            candidateFeasible: snapshot.plannerDecision.candidateFeasible,
            currentStrategyRemainingCostEur:
              snapshot.plannerDecision.currentStrategyRemainingCostEur,
            candidateRemainingCostEur:
              snapshot.plannerDecision.candidateRemainingCostEur,
            replacementSavingsEur:
              snapshot.plannerDecision.replacementSavingsEur,
            replacementSavingsPct:
              snapshot.plannerDecision.replacementSavingsPct,
            transition: snapshot.plannerDecision.transition,
            disruptiveTransition: snapshot.plannerDecision.disruptiveTransition,
            candidateShouldCharge:
              snapshot.plannerDecision.candidateShouldCharge,
            shadowEffectiveShouldCharge:
              snapshot.plannerDecision.shadowEffectiveShouldCharge,
            persistenceStatus:
              snapshot.plannerDecision.persistenceStatus || null,
            persistenceError: snapshot.plannerDecision.persistenceError || null,
            diagnosticsPersistenceStatus:
              snapshot.plannerDecision.diagnosticsPersistenceStatus || null,
            diagnosticsPersistenceError:
              snapshot.plannerDecision.diagnosticsPersistenceError || null,
          }
        : {}),
    };
    log(`Runtime mode      : ${result.mode}`);
    log(
      `Vehicle status   : ${result.vehicleStatusCapability}=${result.vehicleStatusRawValue}`,
    );
    log(`Status updated   : ${result.vehicleStatusLastUpdated}`);
    log(
      `Charging         : ${result.vehicleChargingCapability}=${result.vehicleChargingRawValue}`,
    );
    log(`Charging updated : ${result.vehicleChargingLastUpdated}`);
    log(
      `Charge power     : ${result.vehicleChargingPowerCapability}=${result.vehicleChargingPowerRawValue} ${result.vehicleChargingPowerUnits || '(units unavailable)'}; normalized=${result.vehicleChargingPowerW} W; updated=${result.vehicleChargingPowerLastUpdated}`,
    );
    log(
      `Preconditioning  : ${result.preconditioningCapability}=${result.preconditioningRawValue}`,
    );
    log(
      `Telemetry        : ${result.vehicleTelemetryHealth}/${result.vehicleTelemetryFreshness}`,
    );
    log(
      `Proposal         : ${result.proposedLifecycleAction}; ${result.action}`,
    );
    return result;
  } finally {
    runtimeControllerRunning = false;
  }
}
