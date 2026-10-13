// Manual intent and timers are durable Homey Logic values. No timers sleep inside
// HomeyScript: event/scheduled triggers observe independent provider samples.
let runtimeOwnedLock = null;
async function writeManualState(state) {
  await updateVariableByName(
    CONFIG.manualStateVariableName,
    JSON.stringify(state),
  );
}

async function readRuntimeSafety(now = new Date()) {
  const blocked = await getVariableValue(CONFIG.autoStartBlockedVariableName);
  if (blocked !== true && blocked !== false)
    throw new Error('Invalid auto-start block');
  const stopToken = await getVariableValue(CONFIG.userStopTokenVariableName);
  if (typeof stopToken !== 'string' || !stopToken.trim())
    throw new Error('Invalid user-stop token');
  const manual = runtimeBoolean(
    await getVariableValue(CONFIG.smartChargeManualModeVariableName),
  );
  const state = parseManualState(
    await getVariableValue(CONFIG.manualStateVariableName),
    now,
  );
  const grantValid =
    !manual &&
    ['IDLE', 'COMPLETED', 'STOPPED'].includes(state.status) &&
    state.autoGrant?.stopToken === stopToken;
  const terminalBlocked =
    Boolean(
      isManualRunning(state) ||
      state.stopReason ||
      state.endedAt ||
      ['STOPPING', 'ERROR', 'COMPLETED', 'STOPPED'].includes(state.status),
    ) && !grantValid;
  return {
    blocked: blocked || terminalBlocked || (!manual && !grantValid),
    manual,
    state,
    stopToken,
    manualAllowed:
      manual &&
      !state.stopReason &&
      ['STARTING', 'CHARGING'].includes(state.status) &&
      (state.activationStopToken
        ? state.activationStopToken === stopToken
        : !blocked),
  };
}

async function runtimeEvent(
  eventType,
  reasonCode,
  snapshot,
  state = null,
  message = null,
) {
  const now = new Date();
  const manualBatteryFresh =
    snapshot?.battery &&
    evaluateTelemetryFreshness(snapshot.battery.observedAt, now) ===
      TELEMETRY_FRESHNESS.FRESH &&
    new Date(snapshot.battery.observedAt) <= now &&
    new Date(snapshot.battery.observedAt) >= new Date(state?.startedAt);
  const payload = {
    eventType,
    reasonCode,
    schemaVersion: CONFIG.telemetrySchemaVersion,
    sessionId: state?.id || snapshot?.sessionId || null,
    connectedAt: state ? null : snapshot?.chargeConnectedAt || null,
    loggedAt: new Date(),
    battery:
      state && !manualBatteryFresh ? null : (snapshot?.batteryPct ?? null),
    plugOn: snapshot?.commandAcknowledged
      ? null
      : snapshot?.plug
        ? getCapabilityValue(snapshot.plug, 'onoff')
        : null,
    plugPower:
      !snapshot?.commandAcknowledged && snapshot?.plug
        ? runtimeNumberOrNull(
            getCapabilityValue(snapshot.plug, 'measure_power'),
          )
        : null,
    shouldChargeNow: state
      ? !state.stopReason
      : (snapshot?.plannerShouldCharge ?? false),
    decisionSource: state ? 'manual' : 'lifecycle',
    source: 'smartcharge-runtime-controller',
    engineVersion: BUILD_INFO.fullVersion,
    reason: reasonCode,
    message: message || (state ? JSON.stringify(state) : null),
  };
  log(`Runtime event: ${JSON.stringify(payload)}`);
  try {
    return await SmartChargeLogger.logToGoogleSheets(payload);
  } catch (error) {
    log(`Logger error: ${error.message}; command is not retried by logger`);
    return { written: false, error: error.message };
  }
}

// This is the sole physical-command implementation, including compatibility
// callers. Intent is re-read before ON and after it, so a stop during an awaited
// command is reconciled to OFF. Webhook failure cannot repeat a command.
async function executeRuntimePlugCommand(
  snapshot,
  desiredOn,
  reasonCode,
  state = null,
  forceOff = false,
  pendingEvents = null,
) {
  if (!forceOff && desiredOn === getCapabilityValue(snapshot.plug, 'onoff'))
    return 'none';
  if (!desiredOn && !state && reasonCode === 'AUTOMATIC_RECONCILIATION') {
    const safety = await readRuntimeSafety();
    if (safety.manual || isManualRunning(safety.state)) return 'off_blocked';
  }
  if (
    desiredOn &&
    typeof getCapabilityValue(snapshot.plug, 'onoff') !== 'boolean'
  )
    throw new Error('Plug onoff unavailable; ON prohibited');
  if (desiredOn) {
    let safety;
    try {
      safety = await readRuntimeSafety();
    } catch (error) {
      await updateVariableByName(
        CONFIG.autoStartBlockedVariableName,
        true,
      ).catch((writeError) => log(writeError.message));
      await executeRuntimePlugCommand(
        snapshot,
        false,
        'RECOVERY_BLOCKED',
        state,
      );
      await runtimeEvent(
        SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ERROR,
        'RECOVERY_BLOCKED',
        snapshot,
        state,
        error.message,
      );
      return 'switched_off';
    }
    if (
      (!state && safety.blocked) ||
      (state &&
        (!safety.manualAllowed ||
          safety.state.id !== state.id ||
          safety.state.stopReason)) ||
      (!state && safety.manual)
    )
      return 'on_blocked';
  }
  const requestMessage = JSON.stringify({
    command: desiredOn ? 'ON' : 'OFF',
    phase: 'requested',
    beforePlugOn: getCapabilityValue(snapshot.plug, 'onoff'),
    beforePlugPowerW: runtimeNumberOrNull(
      getCapabilityValue(snapshot.plug, 'measure_power'),
    ),
  });
  log(`Actuator requested: ${requestMessage}; ${reasonCode}`);
  // Never await webhook before an OFF safety command.
  if (desiredOn) {
    const safety = await readRuntimeSafety();
    if (
      (!state && safety.blocked) ||
      (state &&
        (!safety.manualAllowed ||
          safety.state.id !== state.id ||
          safety.state.stopReason)) ||
      (!state && safety.manual)
    )
      return 'on_blocked';
  }
  const ownsEvents = pendingEvents === null;
  const events = pendingEvents || [];
  const emit = async (...args) => {
    events.push(args);
  };
  // Preserve ACK ordering, but never let a webhook delay compensating OFF.
  try {
    try {
      if (
        desiredOn &&
        runtimeOwnedLock &&
        (await getVariableValue(CONFIG.runtimeLockVariableName)) !==
          runtimeOwnedLock
      )
        return 'on_blocked';
      if (desiredOn && !state) {
        const current = await collectRuntimeSnapshot();
        const safety = await readRuntimeSafety();
        if (
          safety.blocked ||
          safety.manual ||
          !current.sessionActive ||
          current.sessionId !==
            (snapshot.chargeConnectedAt || snapshot.sessionId) ||
          current.batteryFreshness !== TELEMETRY_FRESHNESS.FRESH ||
          current.batteryPct === null ||
          current.batteryPct < 0 ||
          current.batteryPct >= current.targetBatteryPct ||
          !hasTrustworthyConnectionEvidence(current) ||
          (runtimeOwnedLock &&
            (await getVariableValue(CONFIG.runtimeLockVariableName)) !==
              runtimeOwnedLock)
        )
          return 'on_blocked';
      }
      if (desiredOn) await setDeviceOn(snapshot.plug);
      else await setDeviceOff(snapshot.plug);
    } catch (error) {
      error.actuatorRequestedOn = desiredOn;
      await emit(
        SmartChargeLogger.EVENT_TYPES.ACTUATOR_REQUEST,
        reasonCode,
        snapshot,
        state,
        requestMessage,
      );
      await emit(
        SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ERROR,
        'COMMAND_FAILED',
        snapshot,
        state,
        JSON.stringify({
          command: desiredOn ? 'ON' : 'OFF',
          error: error.message,
        }),
      );
      // ON may have reached the device even when its ACK is lost. Never trust
      // a pre-command OFF snapshot for the recovery request. Preserve the error.
      if (desiredOn) {
        await updateVariableByName(
          CONFIG.autoStartBlockedVariableName,
          true,
        ).catch((e) => log(e.message));
        try {
          await executeRuntimePlugCommand(
            snapshot,
            false,
            'COMMAND_FAILED',
            state,
            true,
            events,
          );
        } catch (offError) {
          log(`Emergency OFF failed: ${offError.message}`);
          error.compensationError = offError.message;
        }
      }
      throw error;
    }
    // ACK does not refresh the captured capabilities or prove physical power.
    // Subsequent lifecycle events must not publish pre-command values as current.
    snapshot.commandAcknowledged = true;
    await emit(
      SmartChargeLogger.EVENT_TYPES.ACTUATOR_REQUEST,
      reasonCode,
      snapshot,
      state,
      requestMessage,
    );
    await emit(
      desiredOn
        ? SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ON
        : SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_OFF,
      reasonCode,
      snapshot,
      state,
      JSON.stringify({
        command: desiredOn ? 'ON' : 'OFF',
        phase: 'acknowledged',
        physicalStateVerified: false,
      }),
    );
    let compensated = false;
    if (desiredOn) {
      let safety;
      try {
        safety = await readRuntimeSafety();
      } catch (error) {
        safety = { blocked: true };
        await updateVariableByName(
          CONFIG.autoStartBlockedVariableName,
          true,
        ).catch((writeError) => log(writeError.message));
        log(`Post-command recovery blocked: ${error.message}`);
      }
      if (
        (!state && safety.blocked) ||
        (state &&
          (!safety.manualAllowed ||
            safety.state.id !== state.id ||
            safety.state.stopReason)) ||
        (!state && safety.manual)
      ) {
        await executeRuntimePlugCommand(
          snapshot,
          false,
          'USER_STOP',
          state,
          true,
          events,
        );
        compensated = true;
      }
    }
    if (compensated) return 'switched_off';
    return desiredOn ? 'switched_on' : 'switched_off';
  } finally {
    if (ownsEvents)
      for (const args of events) {
        try {
          await runtimeEvent(...args);
        } catch (error) {
          log(
            `Logger error: ${error.message}; command is not retried by logger`,
          );
        }
      }
  }
}

async function collectManualSnapshot() {
  const now = new Date();
  const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);
  const on = getCapabilityValue(plug, 'onoff');
  let battery = { value: null, observedAt: null };
  try {
    const vehicle = await getDeviceByNamePart(
      CONFIG.mercedesDeviceNameIncludes,
    );
    battery = readCapabilityDiagnostic(vehicle, ['measure_battery']);
  } catch (error) {
    log(`Manual SOC unavailable: ${error.message}`);
  }
  const automaticSessionId = await getVariableValue(
    CONFIG.chargeConnectedAtVariableName,
  ).catch(() => null);
  return {
    now,
    plug,
    plugOn: on === true,
    battery,
    batteryPct: runtimeNumberOrNull(battery.value),
    automaticSessionId,
    power: readCapabilityDiagnostic(plug, ['measure_power']),
  };
}

async function runManualRuntime(safety, activeMode) {
  let state = { ...safety.state };
  let snapshot;
  try {
    snapshot = await collectManualSnapshot();
    if (!safety.manual && isManualRunning(state))
      state.stopReason ||= 'USER_STOP';
    if (safety.manual && !safety.manualAllowed)
      state.stopReason ||= 'COMMAND_FAILED';
    const evaluation = evaluateManualCharging(state, snapshot);
    state = evaluation.state;
    state.stopReason = evaluation.stopReason;
    let desired = !state.stopReason;
    if (state.stopReason) state.status = 'STOPPING';
    if (activeMode) {
      const latest = await readRuntimeSafety(snapshot.now);
      if (
        latest.state.id !== state.id ||
        (latest.state.stopReason && !state.stopReason) ||
        (!latest.manual && safety.manual)
      )
        return runRuntimeController();
      // Persist the stop before OFF: failed commands/restarts cannot resume ON.
      if (state.stopReason) {
        // Invalidate the activation before other writes: partial persistence
        // cannot make a saved STARTING record eligible for another manual ON.
        await updateVariableByName(
          CONFIG.userStopTokenVariableName,
          `${snapshot.now.toISOString()}:${Math.random()}`,
        );
        await updateVariableByName(CONFIG.autoStartBlockedVariableName, true);
        state.autoGrant = null;
        await updateVariableByName(
          CONFIG.smartChargeManualModeVariableName,
          false,
        );
      }
      await writeManualState(state);
    }
    const action = activeMode
      ? await executeRuntimePlugCommand(
          snapshot,
          desired,
          state.stopReason || 'MANUAL_START',
          state,
        )
      : desired === snapshot.plugOn
        ? 'none'
        : desired
          ? 'would_switch_on'
          : 'would_switch_off';
    if (activeMode) {
      const afterCommand = await readRuntimeSafety();
      if (afterCommand.state.id !== state.id) return runRuntimeController();
      if (afterCommand.state.stopReason && !state.stopReason) {
        state = afterCommand.state;
        desired = false;
      }
    }
    if (activeMode && state.stopReason && !safety.pendingRuntime) {
      state.status = [
        'USER_STOP',
        'MAX_DURATION_REACHED',
        'COMMAND_FAILED',
      ].includes(state.stopReason)
        ? 'STOPPED'
        : 'COMPLETED';
      state.endedAt = snapshot.now.toISOString();
      state.error = null;
      await writeManualState(state);
      await runtimeEvent(
        SmartChargeLogger.EVENT_TYPES.MANUAL_CHARGING_COMPLETED,
        state.stopReason,
        snapshot,
        state,
      );
      await runtimeEvent(
        SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_DISABLED,
        state.stopReason,
        snapshot,
        state,
      );
    } else if (activeMode && evaluation.startConfirmed) {
      await runtimeEvent(
        SmartChargeLogger.EVENT_TYPES.MANUAL_CHARGING_STARTED,
        'MANUAL_START',
        snapshot,
        state,
      );
    }
    return {
      mode: activeMode ? 'active' : 'shadow',
      runtimeState: state.status,
      manualState: state,
      manualOverride: activeMode ? !state.stopReason : safety.manual,
      desiredPlugState: desired,
      actualPlugState: getCapabilityValue(snapshot.plug, 'onoff'),
      action,
      sessionActive: runtimeActiveSession(snapshot.automaticSessionId),
      sessionId: runtimeActiveSession(snapshot.automaticSessionId)
        ? snapshot.automaticSessionId
        : null,
      proposedLifecycleAction: state.stopReason
        ? 'would_complete_manual'
        : 'none',
      runtimeDecisionReason:
        state.stopReason || 'Manual charging requests power',
      plugPowerHealth: evaluation.powerHealth || 'NOT_EVALUATED',
      batteryFreshness: evaluation.batteryFresh ? 'FRESH' : 'STALE_OR_UNKNOWN',
      batteryRawValue: snapshot.battery.value,
      batteryLastUpdated: snapshot.battery.observedAt,
      autoStartBlocked: safety.blocked || Boolean(state.stopReason),
    };
  } catch (error) {
    if (activeMode) {
      await updateVariableByName(
        CONFIG.userStopTokenVariableName,
        `${new Date().toISOString()}:${Math.random()}`,
      ).catch((writeError) =>
        log(`Stop token persistence error: ${writeError.message}`),
      );
      await updateVariableByName(
        CONFIG.autoStartBlockedVariableName,
        true,
      ).catch((writeError) =>
        log(`Automatic block persistence error: ${writeError.message}`),
      );
      if (
        snapshot?.plug &&
        getCapabilityValue(snapshot.plug, 'onoff') !== false &&
        error.actuatorRequestedOn !== false
      ) {
        try {
          await executeRuntimePlugCommand(
            snapshot,
            false,
            'COMMAND_FAILED',
            state,
          );
        } catch (offError) {
          log(`Emergency OFF failed: ${offError.message}`);
        }
      }
      state.status = 'ERROR';
      state.endedAt = null;
      state.autoGrant = null;
      state.error = error.message;
      state.stopReason ||= 'COMMAND_FAILED';
      await writeManualState(state).catch((writeError) =>
        log(`Manual persistence error: ${writeError.message}`),
      );
      await runtimeEvent(
        SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ERROR,
        'COMMAND_FAILED',
        snapshot,
        state,
        error.message,
      );
    }
    return {
      mode: activeMode ? 'active' : 'shadow',
      runtimeState: 'ERROR',
      manualState: state,
      manualOverride: safety.manual,
      desiredPlugState: false,
      actualPlugState: snapshot?.plug
        ? getCapabilityValue(snapshot.plug, 'onoff')
        : null,
      action: 'command_failed',
      runtimeDecisionReason: 'COMMAND_FAILED',
      error: error.message,
    };
  }
}

async function runRecoveryBlocked(error, activeMode) {
  const snapshot = await collectManualSnapshot().catch(() => null);
  let action = 'none';
  if (activeMode) {
    await updateVariableByName(
      CONFIG.userStopTokenVariableName,
      `${new Date().toISOString()}:${Math.random()}`,
    ).catch((writeError) => log(writeError.message));
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, true).catch(
      (writeError) => log(writeError.message),
    );
    await updateVariableByName(
      CONFIG.smartChargeManualModeVariableName,
      false,
    ).catch((writeError) => log(writeError.message));
    try {
      const saved = parseManualState(
        await getVariableValue(CONFIG.manualStateVariableName),
        new Date(),
      );
      await writeManualState({
        ...saved,
        autoGrant: null,
        ...(isManualRunning(saved)
          ? {
              status: 'ERROR',
              stopReason: saved.stopReason || 'COMMAND_FAILED',
              error: error.message,
            }
          : {}),
      });
    } catch (writeError) {
      log(`Recovery record persistence error: ${writeError.message}`);
    }
    if (snapshot) {
      try {
        action = await executeRuntimePlugCommand(
          snapshot,
          false,
          'RECOVERY_BLOCKED',
        );
      } catch (commandError) {
        action = 'command_failed';
        log(commandError.message);
      }
    }
    await runtimeEvent(
      SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ERROR,
      'RECOVERY_BLOCKED',
      snapshot,
      null,
      error.message,
    );
  }
  return {
    runtimeState: 'ERROR',
    desiredPlugState: false,
    actualPlugState: snapshot?.plug
      ? getCapabilityValue(snapshot.plug, 'onoff')
      : null,
    action,
    runtimeDecisionReason: 'RECOVERY_BLOCKED',
    error: error.message,
    autoStartBlocked: true,
  };
}

async function runRuntimeController() {
  const activeMode =
    String(
      await getVariableValue(CONFIG.runtimeModeVariableName),
    ).toLowerCase() === 'active';
  let safety;
  try {
    safety = await readRuntimeSafety();
  } catch (error) {
    return runRecoveryBlocked(error, activeMode);
  }
  // A raw restored flag cannot create a new activation or extend its deadline.
  if (
    safety.manual &&
    (!isManualRunning(safety.state) || !safety.state.startedAt)
  )
    return runRecoveryBlocked(
      new Error('Manual intent has no recoverable activation'),
      activeMode,
    );
  if (!activeMode) {
    if (safety.manual || isManualRunning(safety.state))
      return runManualRuntime(safety, false);
    if (safety.blocked)
      return {
        preliminaryPlan: await runPreliminaryPlanning(null, false),
        desiredPlugState: false,
        action: 'none',
        autoStartBlocked: true,
        runtimeDecisionReason: safety.state.stopReason || 'AUTOMATIC_BLOCKED',
      };
    return runAutomaticRuntimeController();
  }
  let rawLock;
  try {
    rawLock = await getVariableValue(CONFIG.runtimeLockVariableName);
  } catch (error) {
    return runRecoveryBlocked(error, true);
  }
  if (rawLock !== 'null') {
    let lock;
    try {
      lock = JSON.parse(rawLock);
    } catch {
      lock = null;
    }
    if (
      !lock?.at ||
      !runtimeDateOrNull(lock.at) ||
      new Date(lock.at) > new Date() ||
      new Date() - new Date(lock.at) > 60000
    )
      return runRecoveryBlocked(
        new Error('Unrecoverable runtime lock; explicit user action required'),
        true,
      );
    return { skipped: true, reason: 'Runtime controller already running' };
  }
  const token = `${new Date().toISOString()}:${Math.random()}`;
  const ownedLock = JSON.stringify({ token, at: new Date().toISOString() });
  await updateVariableByName(CONFIG.runtimeLockVariableName, ownedLock);
  if ((await getVariableValue(CONFIG.runtimeLockVariableName)) !== ownedLock)
    return { skipped: true, reason: 'Concurrent runtime acquired ownership' };
  runtimeOwnedLock = ownedLock;
  try {
    safety = await readRuntimeSafety();
    if (safety.manual || isManualRunning(safety.state))
      return await runManualRuntime(safety, true);
    if (safety.blocked) {
      await updateVariableByName(
        CONFIG.autoStartBlockedVariableName,
        true,
      ).catch((error) =>
        log(`Automatic block repair failed: ${error.message}`),
      );
      const snapshot = await collectManualSnapshot();
      const action = await executeRuntimePlugCommand(
        snapshot,
        false,
        safety.state.stopReason || 'AUTOMATIC_BLOCKED',
      );
      const preliminaryPlan = await runPreliminaryPlanning(null, true);
      return {
        preliminaryPlan,
        runtimeState: 'STOPPED',
        desiredPlugState: false,
        actualPlugState: getCapabilityValue(snapshot.plug, 'onoff'),
        manualOverride: false,
        action,
        autoStartBlocked: true,
        runtimeDecisionReason: safety.state.stopReason || 'AUTOMATIC_BLOCKED',
      };
    }
    return await runAutomaticRuntimeController();
  } finally {
    runtimeOwnedLock = null;
    if ((await getVariableValue(CONFIG.runtimeLockVariableName)) === ownedLock)
      await updateVariableByName(CONFIG.runtimeLockVariableName, 'null');
  }
}

async function requestManualMode(action) {
  try {
    return await requestManualModeSafely(action);
  } catch (error) {
    return runRecoveryBlocked(error, true);
  }
}

async function requestManualModeSafely(action) {
  const now = new Date();
  const activeMode =
    String(
      await getVariableValue(CONFIG.runtimeModeVariableName),
    ).toLowerCase() === 'active';
  if (!activeMode && action !== 'stop')
    return {
      skipped: true,
      reason: 'Manual controls require active runtime mode',
    };
  let stopToken;
  try {
    stopToken = await getVariableValue(CONFIG.userStopTokenVariableName);
  } catch (error) {
    return runRecoveryBlocked(error, true);
  }
  let safety;
  try {
    safety = await readRuntimeSafety(now);
  } catch (error) {
    if (action !== 'stop') return runRecoveryBlocked(error, true);
    // USER_STOP must work even when the manual record is corrupt.
    safety = {
      manual: false,
      blocked: true,
      state: {
        ...idleManualState(),
        id: `manual:${now.toISOString()}`,
        startedAt: now.toISOString(),
        status: 'STOPPING',
      },
    };
  }
  if (action === 'start') {
    if (isManualRunning(safety.state)) return runRuntimeController();
    stopToken = `${now.toISOString()}:${Math.random()}`;
    await updateVariableByName(CONFIG.userStopTokenVariableName, stopToken);
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, true);
    const state = {
      ...idleManualState(),
      status: 'STARTING',
      id: `manual:${now.toISOString()}`,
      startedAt: now.toISOString(),
      activationStopToken: stopToken,
    };
    await writeManualState(state);
    if (
      (await getVariableValue(CONFIG.userStopTokenVariableName)) !== stopToken
    )
      return requestManualMode('stop');
    await updateVariableByName(CONFIG.smartChargeManualModeVariableName, true);
    if (
      (await getVariableValue(CONFIG.userStopTokenVariableName)) !== stopToken
    )
      return requestManualMode('stop');
    await runtimeEvent(
      SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_ENABLED,
      'MANUAL_START',
      null,
      state,
    );
    return runRuntimeController();
  }
  if (action === 'auto') {
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, true);
    // Stop the old manual actuator path before granting auto permission.
    if (isManualRunning(safety.state)) {
      await requestManualMode('stop');
      stopToken = await getVariableValue(CONFIG.userStopTokenVariableName);
    }
    const current = await readRuntimeSafety(now);
    if (
      isManualRunning(current.state) ||
      ['ERROR', 'STOPPING'].includes(current.state.status) ||
      (await getVariableValue(CONFIG.runtimeLockVariableName)) !== 'null'
    )
      return { runtimeState: 'ERROR', runtimeDecisionReason: 'COMMAND_FAILED' };
    await updateVariableByName(CONFIG.smartChargeManualModeVariableName, false);
    // Old automatic session timestamps are not fresh connection evidence.
    const snapshot = await collectRuntimeSnapshot();
    if (getCapabilityValue(snapshot.plug, 'onoff') !== false) {
      await executeRuntimePlugCommand(snapshot, false, 'AUTO_MODE_PREPARE');
      if (getCapabilityValue(snapshot.plug, 'onoff') !== false)
        throw new Error('Auto Mode requires verified OFF');
    }
    const battery = readCapabilityDiagnostic(snapshot.mercedes, [
      'measure_battery',
    ]);
    if (
      (await getVariableValue(CONFIG.userStopTokenVariableName)) !== stopToken
    )
      return requestManualMode('stop');
    if (
      !hasTrustworthyConnectionEvidence(snapshot) ||
      evaluateTelemetryFreshness(battery.observedAt, now) !==
        TELEMETRY_FRESHNESS.FRESH ||
      snapshot.batteryPct === null ||
      snapshot.batteryPct < 0 ||
      snapshot.batteryPct >= CONFIG.batteryFullPercentage
    ) {
      await updateVariableByName(CONFIG.autoStartBlockedVariableName, true);
      return {
        desiredPlugState: false,
        autoStartBlocked: true,
        runtimeDecisionReason: 'RECOVERY_BLOCKED',
      };
    }
    const latest = await readRuntimeSafety(now);
    if (
      latest.state.id !== current.state.id ||
      latest.manual ||
      isManualRunning(latest.state)
    )
      return {
        desiredPlugState: false,
        autoStartBlocked: true,
        runtimeDecisionReason: 'RECOVERY_BLOCKED',
      };
    await writeManualState({
      ...latest.state,
      autoGrant: { at: now.toISOString(), stopToken },
    });
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, false);
    if (
      (await getVariableValue(CONFIG.userStopTokenVariableName)) !== stopToken
    )
      return requestManualMode('stop');
    return runRuntimeController();
  }
  try {
    await updateVariableByName(
      CONFIG.userStopTokenVariableName,
      `${now.toISOString()}:${Math.random()}`,
    );
    await updateVariableByName(CONFIG.autoStartBlockedVariableName, true);
    await updateVariableByName(CONFIG.smartChargeManualModeVariableName, false);
  } catch (error) {
    return runRecoveryBlocked(error, true);
  }
  if (!isManualRunning(safety.state) && safety.state.endedAt)
    return runRuntimeController();
  const state = isManualRunning(safety.state)
    ? { ...safety.state }
    : {
        ...idleManualState(),
        id: `manual:${now.toISOString()}`,
        startedAt: now.toISOString(),
      };
  state.status = 'STOPPING';
  state.stopReason = 'USER_STOP';
  try {
    await writeManualState(state);
  } catch (error) {
    return runRecoveryBlocked(error, true);
  }
  // Stop bypasses a busy reconciliation lease; it never requests ON.
  const pendingRuntime =
    (await getVariableValue(CONFIG.runtimeLockVariableName)) !== 'null';
  return runManualRuntime(
    { manual: false, blocked: true, state, pendingRuntime },
    true,
  );
}
