async function runPreconditioningRuntime(snapshot, activeMode) {
  let raw;
  let state;
  let safety;
  try {
    raw = await getVariableValue(CONFIG.preconditioningStateVariableName);
    state = parsePreconditioningState(raw, snapshot.now);
    safety = await readRuntimeSafety(snapshot.now);
  } catch (error) {
    return runRecoveryBlocked(error, activeMode);
  }
  async function persist() {
    const nextRaw = JSON.stringify(state);
    if (!activeMode || nextRaw === raw) return;
    try {
      await updateVariableByName(
        CONFIG.preconditioningStateVariableName,
        nextRaw,
      );
    } catch (error) {
      // A failed durable latch cannot leave automatic power energized.
      await updateVariableByName(
        CONFIG.autoStartBlockedVariableName,
        true,
      ).catch((e) => log(e.message));
      await executeRuntimePlugCommand(
        snapshot,
        false,
        'PRECONDITIONING_STATE_FAILED',
        null,
        true,
      );
      throw error;
    }
    raw = nextRaw;
  }
  function result(action, reason, desiredPlugState) {
    return {
      mode: activeMode ? 'active' : 'shadow',
      runtimeState: desiredPlugState
        ? RUNTIME_STATES.PRECONDITIONING
        : RUNTIME_STATES.PAUSED,
      runtimeDecisionReason: reason,
      sessionId: snapshot.sessionId,
      sessionActive: snapshot.sessionActive,
      battery: snapshot.batteryPct,
      desiredPlugState,
      actualPlugState:
        action === 'switched_on'
          ? true
          : action === 'switched_off'
            ? false
            : snapshot.plugOn,
      preconditioningCapability: snapshot.preconditioningCapability,
      preconditioningRawValue: snapshot.preconditioningRawValue,
      preconditioningLastUpdated: snapshot.preconditioningObservedAt,
      preconditioningFreshness: snapshot.preconditioningFreshness,
      preconditioningStopReason: state.reason,
      expectedPowerCutRecovery: snapshot.powerCutRecoveryAllowed === true,
      plannerShouldCharge: snapshot.plannerShouldCharge,
      action,
    };
  }
  async function inhibit(reason) {
    state = {
      ...state,
      status: 'INHIBITED',
      inhibitedAt: state.inhibitedAt || snapshot.now.toISOString(),
      reason,
    };
    await persist();
    const action = activeMode
      ? await executeRuntimePlugCommand(
          snapshot,
          false,
          'PRECONDITIONING_' + reason,
        )
      : snapshot.plugOn
        ? 'would_switch_off'
        : 'none';
    const outcome = result(action, 'PRECONDITIONING_' + reason, false);
    log(`Preconditioning: ${JSON.stringify(outcome)}`);
    return outcome;
  }
  if (state.status === 'INHIBITED') {
    if (
      snapshot.preconditioningRawValue === false &&
      snapshot.preconditioningFreshness === TELEMETRY_FRESHNESS.FRESH &&
      new Date(snapshot.preconditioningObservedAt) >=
        new Date(state.inhibitedAt)
    )
      state.climateOffAt = snapshot.preconditioningObservedAt;
    if (snapshot.plugOn || !canRearmPreconditioning(state, snapshot, safety))
      return inhibit(state.reason);
    state = idlePreconditioningState();
    await persist();
  }
  if (state.status === 'RUNNING') {
    if (
      snapshot.preconditioningRawValue === false &&
      snapshot.preconditioningFreshness === TELEMETRY_FRESHNESS.FRESH
    )
      state.climateOffAt = snapshot.preconditioningObservedAt;
    if (
      hasFreshConnectorDisconnect(snapshot) ||
      isVehicleUnpluggedStatus(snapshot.vehicleStatus)
    )
      return inhibit('DISCONNECTED');
    if (
      state.powerCut?.usedAt &&
      snapshot.plugOn &&
      snapshot.now - new Date(state.powerCut.usedAt) >=
        CONFIG.preconditioningStartGraceSeconds * 1000 &&
      !hasTrustworthyConnectionEvidence(snapshot)
    )
      return inhibit('RECOVERY_UNCONFIRMED');
    if (snapshot.plugOn) {
      const evaluated = evaluatePreconditioningLoad(state, snapshot);
      state = evaluated.state;
      if (evaluated.reason) return inhibit(evaluated.reason);
      await persist();
    } else {
      state = idlePreconditioningState(state.powerCut);
      await persist();
    }
  }
  snapshot.powerCutRecoveryAllowed = canRecoverAutomaticPowerCut(
    state,
    snapshot,
    safety,
  );
  if (!canPowerPreconditioning(snapshot)) return null;
  if (state.status === 'IDLE') {
    state = {
      ...idlePreconditioningState(state.powerCut),
      status: 'RUNNING',
      startedAt: snapshot.now.toISOString(),
      stopToken: safety.stopToken,
    };
    await persist(); // Save the startup deadline before the physical ON request.
  }
  const action = activeMode
    ? await executeRuntimePlugCommand(snapshot, true, 'PRECONDITIONING')
    : snapshot.plugOn
      ? 'none'
      : 'would_switch_on';
  if (action === 'on_blocked' || action === 'switched_off') {
    const latest = parsePreconditioningState(
      await getVariableValue(CONFIG.preconditioningStateVariableName),
      new Date(),
    );
    state = {
      ...latest,
      status: 'INHIBITED',
      inhibitedAt: new Date().toISOString(),
      reason: 'REVALIDATION_BLOCKED',
    };
    await persist();
  }
  const outcome = result(
    action,
    action === 'on_blocked' || action === 'switched_off'
      ? 'PRECONDITIONING_REVALIDATION_BLOCKED'
      : 'PRECONDITIONING',
    action !== 'switched_off' && action !== 'on_blocked',
  );
  log(`Preconditioning: ${JSON.stringify(outcome)}`);
  return outcome;
}

async function annotateAutomaticPowerCutRecovery(
  snapshot,
  ownedAttempt = false,
) {
  const state = parsePreconditioningState(
    await getVariableValue(CONFIG.preconditioningStateVariableName),
    snapshot.now,
  );
  snapshot.powerCutRecoveryAllowed = canRecoverAutomaticPowerCut(
    state,
    snapshot,
    await readRuntimeSafety(snapshot.now),
    ownedAttempt,
  );
  return state;
}

async function reserveAutomaticPowerCutRecovery(snapshot, reasonCode) {
  if (!runtimeOwnedLock) return false;
  const state = await annotateAutomaticPowerCutRecovery(snapshot);
  if (!snapshot.powerCutRecoveryAllowed || state.powerCut.usedAt) return false;
  const next = {
    ...idlePreconditioningState(state.powerCut),
    status: 'RUNNING',
    startedAt: snapshot.now.toISOString(),
    stopToken: state.powerCut.stopToken,
    powerCut: {
      ...state.powerCut,
      usedAt: snapshot.now.toISOString(),
      lease: runtimeOwnedLock,
    },
  };
  const raw = JSON.stringify(next);
  await updateVariableByName(CONFIG.preconditioningStateVariableName, raw);
  const current = await collectRuntimeSnapshot();
  await annotateAutomaticPowerCutRecovery(current, true);
  const safety = await readRuntimeSafety();
  return (
    !safety.blocked &&
    !safety.manual &&
    safety.stopToken === next.stopToken &&
    canStartAutomaticPower(current, snapshot, reasonCode) &&
    (await getVariableValue(CONFIG.preconditioningStateVariableName)) === raw &&
    (await getVariableValue(CONFIG.runtimeLockVariableName)) ===
      runtimeOwnedLock
  );
}

async function rememberAutomaticPowerCut(snapshot, reasonCode) {
  if (
    reasonCode !== 'AUTOMATIC_RECONCILIATION' ||
    normalizeVehicleStatus(snapshot.vehicleStatus) === 'failure' ||
    !hasTrustworthyConnectionEvidence(snapshot)
  )
    return;
  const now = new Date();
  const completed =
    evaluateCompletionEvidence(snapshot) &&
    evaluateTelemetryFreshness(snapshot.batteryLastChangedAt, now) ===
      TELEMETRY_FRESHNESS.FRESH;
  const consuming =
    snapshot.plugPower &&
    freshManualMeasurement(snapshot.plugPower, now, null) &&
    Number(snapshot.plugPower.value) > CONFIG.preconditioningLowPowerW;
  const expiresAt = snapshot.sessionActive
    ? getTargetDeparture(parseDateOrFallback(snapshot.chargeConnectedAt, now))
    : new Date(now.getTime() + CONFIG.telemetryStaleMinutes * 60000);
  if (expiresAt <= now) return;
  try {
    const state = parsePreconditioningState(
      await getVariableValue(CONFIG.preconditioningStateVariableName),
      now,
    );
    const recentlyConsuming =
      state.status === 'RUNNING' &&
      state.consumed &&
      snapshot.plugPower &&
      freshManualMeasurement(snapshot.plugPower, now, state.startedAt) &&
      (!state.lowPowerSince ||
        now - new Date(state.lowPowerSince) <=
          CONFIG.preconditioningLowPowerSeconds * 1000);
    if (!consuming && !completed && !recentlyConsuming) return;
    const safety = await readRuntimeSafety(now);
    if (safety.blocked || safety.manual) return;
    state.powerCut = {
      at: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      stopToken: safety.stopToken,
      sessionId: snapshot.sessionId,
      usedAt: null,
      lease: null,
    };
    await updateVariableByName(
      CONFIG.preconditioningStateVariableName,
      JSON.stringify(state),
    );
  } catch (error) {
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, true).catch(
      (e) => log(e.message),
    );
    throw error;
  }
}
