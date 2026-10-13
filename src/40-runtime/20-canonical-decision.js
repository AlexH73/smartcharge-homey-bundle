// A planning horizon is a tariff assumption, never a connection/session event.
async function runPreliminaryPlanning(snapshot = null, publish = false) {
  let result;
  let publicationContext;
  const contextNames = [
    CONFIG.chargeConnectedAtVariableName,
    CONFIG.smartChargeSessionStatusVariableName,
    CONFIG.autoStartBlockedVariableName,
    CONFIG.manualStateVariableName,
    CONFIG.smartChargeManualModeVariableName,
    CONFIG.userStopTokenVariableName,
    CONFIG.runtimeModeVariableName,
    CONFIG.runtimeLockVariableName,
  ];
  const contextOf = (variables) =>
    JSON.stringify(
      contextNames.map(
        (name) =>
          Object.values(variables).find((variable) => variable.name === name)
            ?.value,
      ),
    );
  try {
    if (publish)
      publicationContext = contextOf(await Homey.logic.getVariables());
    snapshot ||= await collectRuntimeSnapshot();
    const battery = snapshot.batteryPct;
    const observedAt = runtimeDateOrNull(snapshot.batteryObservedAt);
    const ageMinutes = observedAt ? (snapshot.now - observedAt) / 60000 : null;
    result = {
      preliminary: true,
      shouldChargeNow: false,
      battery,
      batteryObservedAt: snapshot.batteryObservedAt,
      batteryAgeMinutes: ageMinutes,
      batteryFreshness: snapshot.batteryFreshness,
      confidence:
        snapshot.batteryFreshness === TELEMETRY_FRESHNESS.FRESH
          ? 'fresh_soc'
          : 'last_known_soc',
      plannedStart: null,
      plannedEnd: null,
      plannedWindows: null,
      targetDeparture: null,
    };
    if (battery === null) throw new Error('Battery telemetry unavailable');
    if (battery < 0 || battery > 100)
      throw new Error('Battery telemetry invalid');
    const targetDeparture = getTargetDeparture(snapshot.now);
    result.targetDeparture = formatLocal(targetDeparture);
    const factor = toNumberValue(
      await getVariableValue(CONFIG.chargeFactorVariableName),
      CONFIG.chargeFactorVariableName,
    );
    const reserve = toNumberValue(
      await getVariableValue(CONFIG.chargeReserveVariableName),
      CONFIG.chargeReserveVariableName,
    );
    const chargeMinutes = calculateChargeMinutes(battery, factor, reserve);
    result.chargeMinutes = chargeMinutes;
    result.chargeSlots = calculateChargeSlots(chargeMinutes);
    if (battery >= CONFIG.batteryFullPercentage) {
      result.reason = 'Last-known SOC is at target; no charging required';
    } else {
      const token = await getVariableValue(
        CONFIG.tibberAccessTokenVariableName,
      );
      if (!token || token === 'null')
        throw new Error('Tibber access token is missing');
      const ownedLock = runtimeOwnedLock ? JSON.parse(runtimeOwnedLock) : null;
      // Reserve 5s of the existing 60s lease for publication and lock release.
      // node-fetch has separate header/body timers, so budget both phases.
      const remainingMs = ownedLock
        ? new Date(ownedLock.at).getTime() + 55000 - new Date().getTime()
        : 2 * CONFIG.preliminaryTibberTimeoutMs;
      const timeoutMs = Math.min(
        CONFIG.preliminaryTibberTimeoutMs,
        Math.floor(remainingMs / 2),
      );
      if (timeoutMs <= 0)
        throw new Error(
          'Preliminary Tibber timeout: runtime lease budget exhausted',
        );
      const prices = normalizeTibberPrices(
        await fetchTibberPriceInfo(token, { timeoutMs }),
      );
      const options = {
        now: snapshot.now,
        targetDeparture,
        chargeSlots: result.chargeSlots,
      };
      const plan = selectBestChargePlan(
        findCheapestContinuousPlan(prices, options),
        findCheapestMultiWindowPlan(prices, options),
      );
      if (!plan)
        throw new Error('No tariff plan available before target departure');
      result.plannedStart = formatLocal(plan.plannedStart);
      result.plannedEnd = formatLocal(plan.plannedEnd);
      result.plannedWindows = plan.windows.map((window) => ({
        plannedStart: formatLocal(window.plannedStart),
        plannedEnd: formatLocal(window.plannedEnd),
      }));
      result.reason = 'Tariff plan calculated';
    }
    result.available = true;
  } catch (error) {
    result = {
      ...result,
      preliminary: true,
      available: false,
      shouldChargeNow: false,
      reason: error.message,
    };
  }
  result.reason = `Preliminary (${result.batteryFreshness || 'UNKNOWN'}, SOC age ${result.batteryAgeMinutes ?? 'unknown'} min): ${result.reason}; physical ON requires explicit AUTO and fresh evidence`;
  if (publish) {
    for (const [name, value] of [
      [CONFIG.smartChargeShouldChargeVariableName, false],
      [CONFIG.chargeMinutesVariableName, result.chargeMinutes || 0],
      [CONFIG.chargeSlotsVariableName, result.chargeSlots || 0],
      [CONFIG.legacyChargeQuartersVariableName, result.chargeSlots || 0],
      [
        CONFIG.smartChargePlannedStartVariableName,
        result.plannedStart || 'null',
      ],
      [CONFIG.smartChargePlannedEndVariableName, result.plannedEnd || 'null'],
      [
        CONFIG.smartChargeTargetDepartureVariableName,
        result.targetDeparture || 'null',
      ],
      [CONFIG.smartChargeReasonVariableName, result.reason],
    ]) {
      const variables = await Homey.logic.getVariables();
      const current = Object.values(variables);
      const session = current.find(
        (variable) => variable.name === CONFIG.chargeConnectedAtVariableName,
      )?.value;
      const blocked = current.find(
        (variable) => variable.name === CONFIG.autoStartBlockedVariableName,
      )?.value;
      if (
        !publicationContext ||
        contextOf(variables) !== publicationContext ||
        (runtimeActiveSession(session) && blocked !== true)
      ) {
        result.publicationSkipped = true;
        break;
      }
      const variable = current.find((entry) => entry.name === name);
      if (variable)
        await Homey.logic.updateVariable({
          id: variable.id,
          variable: { value },
        });
    }
  }
  return result;
}

/**
 * Main SmartCharge decision runner.
 *
 * This is the only executable part of the HomeyScript bundle.
 * All helper modules must be concatenated before this file.
 *
 * @returns {Promise<object>}
 */
async function runCanonicalDecision(options = {}) {
  const mutateDecisionState = options.mutateDecisionState !== false;
  const controlPlug = options.controlPlug !== false;
  const emitTelemetry = options.emitTelemetry !== false;
  const emitTerminalTelemetry =
    options.emitTerminalTelemetry !== false && emitTelemetry;
  const now = new Date();
  const stabilityShadow = options.stabilityShadow || null;
  const liveStabilityEnabled = isPlanStabilityLiveShadowEnabled(
    options.liveStabilityShadowEnabled,
  );

  const tibberAccessToken = await getVariableValue(
    CONFIG.tibberAccessTokenVariableName,
  );

  if (!tibberAccessToken || tibberAccessToken === 'null') {
    throw new Error('Tibber access token is missing');
  }

  const mercedes = await getDeviceByNamePart(CONFIG.mercedesDeviceNameIncludes);
  const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);

  const battery = mercedes.capabilitiesObj.measure_battery.value;

  const factor = toNumberValue(
    await getVariableValue(CONFIG.chargeFactorVariableName),
    CONFIG.chargeFactorVariableName,
  );

  const reserve = toNumberValue(
    await getVariableValue(CONFIG.chargeReserveVariableName),
    CONFIG.chargeReserveVariableName,
  );

  const connectedAtRaw = await getVariableValue(
    CONFIG.chargeConnectedAtVariableName,
  );

  if (!connectedAtRaw || connectedAtRaw === 'null') {
    const reason = 'No active session';

    if (mutateDecisionState) {
      await tryUpdateVariableByName(
        CONFIG.smartChargeShouldChargeVariableName,
        false,
      );
      await tryUpdateVariableByName(
        CONFIG.smartChargeReasonVariableName,
        reason,
      );
    }

    log('SmartCharge action: no action');
    log(`Script version   : ${BUILD_INFO.fullVersion}`);
    log(`Battery          : ${battery}%`);
    log(`Reason           : ${reason}`);

    return {
      battery,
      chargeMinutes: 0,
      chargeSlots: 0,
      chargeHoursAhead: 0,
      targetDeparture: null,
      plannedStart: null,
      plannedEnd: null,
      shouldChargeNow: false,
      reason,
      terminalState: null,
      ...createCanonicalStabilityBypass(stabilityShadow, 'NO_ACTIVE_SESSION'),
      ...(liveStabilityEnabled
        ? {
            stabilityMode: 'shadow',
            stabilityDecision: 'BYPASS',
            stabilityReasonCode: 'NO_ACTIVE_SESSION',
            persistenceStatus: 'PRESERVED',
            stabilityError: null,
          }
        : {}),
    };
  }

  const connectedAt = parseDateOrFallback(connectedAtRaw, now);

  const targetDeparture = getTargetDeparture(connectedAt);

  if (isChargingSessionExpired(now, targetDeparture, battery)) {
    const reason = getExpiredSessionReason();

    if (mutateDecisionState) {
      await tryUpdateVariableByName(
        CONFIG.smartChargeShouldChargeVariableName,
        false,
      );
      await tryUpdateVariableByName(
        CONFIG.smartChargeReasonVariableName,
        reason,
      );
    }

    if (emitTerminalTelemetry) {
      try {
        await SmartChargeLogger.logToGoogleSheets(
          {
            eventType: SmartChargeLogger.EVENT_TYPES.SESSION_EXPIRED,
            sessionId: formatLocal(connectedAt),
            loggedAt: now,

            battery,
            currentPrice: null,

            connectedAt: formatLocal(connectedAt),
            targetDeparture: formatLocal(targetDeparture),

            chargeMinutes: 0,
            chargeSlots: 0,
            chargeHoursAhead: 0,

            plannedStart: null,
            plannedEnd: null,

            shouldChargeNow: false,

            plugOn: null,
            plugPower: null,

            reason,

            averagePrice: null,
            totalPrice: null,
            priceCount: null,

            source: 'smartcharge-run-decision',
            engineVersion: BUILD_INFO.fullVersion,

            message: 'Expired session blocked safety fallback',
          },
          {
            webhookUrl: await getVariableValue('SMARTCHARGE_LOG_WEBHOOK_URL'),
          },
        );
      } catch (error) {
        log(`Logger error     : ${error.message}`);
      }
    }

    log('SmartCharge action: no action');
    log(`TimeZone         : ${CONFIG.timeZone}`);
    log(`Script version   : ${BUILD_INFO.fullVersion}`);
    log(`Battery          : ${battery}%`);
    log(`ConnectedAt      : ${formatLocal(connectedAt)}`);
    log(`TargetDeparture  : ${formatLocal(targetDeparture)}`);
    log(`Reason           : ${reason}`);

    return {
      battery,
      chargeMinutes: 0,
      chargeSlots: 0,
      chargeHoursAhead: 0,
      targetDeparture: formatLocal(targetDeparture),
      plannedStart: null,
      plannedEnd: null,
      shouldChargeNow: false,
      reason,
      terminalState: 'expired',
      ...createCanonicalStabilityBypass(stabilityShadow, 'TERMINAL_LIFECYCLE'),
      ...(liveStabilityEnabled
        ? {
            stabilityMode: 'shadow',
            stabilityDecision: 'BYPASS',
            stabilityReasonCode: 'TERMINAL_LIFECYCLE',
            persistenceStatus: 'PRESERVED',
            stabilityError: null,
          }
        : {}),
    };
  }

  const chargeMinutes = calculateChargeMinutes(battery, factor, reserve);
  const chargeSlots = calculateChargeSlots(chargeMinutes);
  const chargeHoursAhead = calculateHoursAhead(targetDeparture, now);

  if (mutateDecisionState) {
    await updateVariableByName(CONFIG.chargeMinutesVariableName, chargeMinutes);
    await tryUpdateVariableByName(CONFIG.chargeSlotsVariableName, chargeSlots);
    await tryUpdateVariableByName(
      CONFIG.legacyChargeQuartersVariableName,
      chargeSlots,
    );
    await updateVariableByName(
      CONFIG.chargeHoursAheadVariableName,
      chargeHoursAhead,
    );
  }

  const priceInfo = await fetchTibberPriceInfo(tibberAccessToken);
  const prices = normalizeTibberPrices(priceInfo);
  const currentPrice = priceInfo.current?.total ?? null;

  const continuousPlan = findCheapestContinuousPlan(prices, {
    now,
    targetDeparture,
    chargeSlots,
  });

  const multiWindowPlan = findCheapestMultiWindowPlan(prices, {
    now,
    targetDeparture,
    chargeSlots,
  });

  const plan = selectBestChargePlan(continuousPlan, multiWindowPlan);
  const costEstimate = plan
    ? estimatePlanCosts({
        plan,
        prices,
        now,
        targetDeparture,
        chargeMinutes,
        chargingPowerKw: CONFIG.chargingPowerKw,
      })
    : null;

  const estimatedCostOutput = formatEstimatedCostOutput(
    costEstimate,
    CONFIG.chargingPowerKw,
  );
  const tariffOutput = formatTariffOutput(plan, continuousPlan);

  const safetyStartRequired = isSafetyStartRequired(
    now,
    targetDeparture,
    chargeMinutes,
    battery,
  );

  const insidePlan = isNowInsidePlan(now, plan);

  const planStartsTooLate =
    Boolean(plan) &&
    plan.plannedStart > addMinutes(targetDeparture, -chargeMinutes);

  const shouldChargeNow =
    insidePlan || safetyStartRequired || planStartsTooLate;

  const sessionId = formatLocal(connectedAt);
  let stabilityResult = null;
  let persistencePreparation = null;
  let effectiveStabilityShadow = stabilityShadow;

  try {
    if (!effectiveStabilityShadow && liveStabilityEnabled) {
      let liveStabilityContext = options.stabilityContext || null;
      if (!liveStabilityContext) {
        let manualOverrideActive = false;
        try {
          const manualValue = await getVariableValue(
            CONFIG.smartChargeManualModeVariableName,
          );
          manualOverrideActive =
            manualValue === true ||
            String(manualValue).trim().toLowerCase() === 'true';
        } catch (error) {
          log(`Plan stability context warning: ${error.message}`);
        }
        liveStabilityContext = {
          stabilityAllowed: true,
          activelyCharging: plug.capabilitiesObj.onoff?.value === true,
          manualOverrideActive,
        };
      }
      persistencePreparation = await preparePersistentStabilityShadow({
        sessionId,
        enabledOverride: true,
        context: liveStabilityContext,
      });
      if (!persistencePreparation.evaluable) {
        stabilityResult = createCanonicalStabilityError(
          persistencePreparation.persistenceError,
          persistencePreparation.persistenceStatus,
        );
      } else {
        effectiveStabilityShadow = persistencePreparation.shadowInput;
      }
    }

    if (effectiveStabilityShadow) {
      if (
        typeof stabilityShadowFailure !== 'undefined' &&
        stabilityShadowFailure === 'evaluator'
      ) {
        throw new Error('Injected stability evaluator failure');
      }
      stabilityResult = evaluateCanonicalStabilityShadow({
        shadowInput: effectiveStabilityShadow,
        candidatePlan: plan,
        prices,
        sessionId,
        now,
        remainingChargeMinutes: chargeMinutes,
        targetDeparture,
        chargingPowerKw: CONFIG.chargingPowerKw,
        safetyRequiresCandidate: safetyStartRequired || planStartsTooLate,
        productionShouldChargeNow: shouldChargeNow,
      });
    }

    if (persistencePreparation?.evaluable && stabilityResult) {
      stabilityResult.persistenceReadStatus =
        persistencePreparation.persistenceStatus;
      stabilityResult.persistenceReadError =
        persistencePreparation.persistenceError;
      const persistenceResult = await finalizePersistentStabilityShadow(
        persistencePreparation,
        stabilityResult,
      );
      stabilityResult.persistenceStatus = persistenceResult.status;
      stabilityResult.persistenceError = persistenceResult.error;
      if (
        persistenceResult.status === 'WRITTEN' &&
        stabilityResult.stabilityCandidateAnchor
      ) {
        stabilityResult.acceptedStrategyRevision =
          stabilityResult.stabilityCandidateAnchor.revision;
      }
    }
  } catch (error) {
    stabilityResult = createCanonicalStabilityError(error, 'EVALUATION_FAILED');
  }

  if (liveStabilityEnabled && stabilityResult) {
    const diagnosticsWrite = await writeStabilityDiagnostics({
      now,
      sessionId,
      productionShouldCharge: shouldChargeNow,
      stabilityResult,
    });
    stabilityResult.diagnosticsPersistenceStatus = diagnosticsWrite.status;
    stabilityResult.diagnosticsPersistenceError = diagnosticsWrite.error;
  }

  if (liveStabilityEnabled && stabilityResult) {
    log(
      `Plan stability   : ${stabilityResult.stabilityDecision || 'ERROR'}/${stabilityResult.stabilityReasonCode || stabilityResult.stabilityError || 'UNKNOWN'}; revision=${stabilityResult.acceptedStrategyRevision ?? 'null'}; persistence=${stabilityResult.persistenceStatus || 'none'}`,
    );
  }

  let reason = 'No charging plan found';

  if (chargeMinutes <= 0 || chargeSlots <= 0) {
    reason = 'Battery is already full';
  } else if (insidePlan) {
    reason = 'Current time is inside selected charging plan';
  } else if (planStartsTooLate) {
    reason = 'Safety fallback: selected plan starts too late';
  } else if (safetyStartRequired) {
    reason = plan
      ? 'Safety fallback: latest safe start reached'
      : 'Safety fallback: latest safe start reached and no plan found';
  } else if (plan) {
    reason = 'Waiting for selected charging plan';
  }

  if (mutateDecisionState)
    await tryUpdateVariableByName(
      CONFIG.smartChargeShouldChargeVariableName,
      shouldChargeNow,
    );
  if (mutateDecisionState)
    await tryUpdateVariableByName(
      CONFIG.smartChargePlannedStartVariableName,
      plan ? formatLocal(plan.plannedStart) : 'null',
    );
  if (mutateDecisionState)
    await tryUpdateVariableByName(
      CONFIG.smartChargePlannedEndVariableName,
      plan ? formatLocal(plan.plannedEnd) : 'null',
    );
  if (mutateDecisionState) {
    await tryUpdateVariableByName(
      CONFIG.smartChargeTargetDepartureVariableName,
      formatLocal(targetDeparture),
    );
  }

  let logResult = {
    written: false,
    reason: 'Logger skipped',
  };

  const plugOn = plug.capabilitiesObj.onoff?.value ?? null;
  const plugPower = plug.capabilitiesObj.measure_power?.value ?? null;

  const targetBattery = CONFIG.targetBattery ?? 100;
  const missingBatteryPercent = Math.max(0, targetBattery - battery);
  const reasonCode = getReasonCode(reason);
  const decisionSource = getDecisionSource(reasonCode);

  try {
    if (!emitTelemetry) throw new Error('Telemetry disabled');
    logResult = await SmartChargeLogger.logToGoogleSheets(
      {
        eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_DECISION,

        schemaVersion: CONFIG.telemetrySchemaVersion,
        reasonCode,
        decisionSource,

        sessionId,
        loggedAt: now,

        battery,
        targetBattery,
        missingBatteryPercent,

        currentPrice,

        connectedAt: formatLocal(connectedAt),
        targetDeparture: formatLocal(targetDeparture),

        chargeMinutes,
        chargeSlots,
        chargeHoursAhead,

        chargeFactor: factor,
        chargeReserve: reserve,

        plannedStart: plan ? formatLocal(plan.plannedStart) : null,
        plannedEnd: plan ? formatLocal(plan.plannedEnd) : null,

        shouldChargeNow,

        plugOn,
        plugPower,

        reason,

        ...tariffOutput,
        ...estimatedCostOutput,
        priceCount: prices.length,

        source: 'smartcharge-run-decision',
        engineVersion: BUILD_INFO.fullVersion,

        message: null,

        plannerMode: plan ? plan.plannerMode : null,
        plannerVersion: plan ? CONFIG.plannerVersion : null,
        windowCount: plan ? plan.windowCount : null,
        chargeWindowsText: plan
          ? plan.windows
              .map(
                (window) =>
                  `${formatLocal(window.plannedStart)}-${formatLocal(window.plannedEnd)}`,
              )
              .join(' | ')
          : null,
        chargeWindowsJson: plan
          ? JSON.stringify(
              plan.windows.map((window) => ({
                plannedStart: formatLocal(window.plannedStart),
                plannedEnd: formatLocal(window.plannedEnd),
                slotCount: window.slotCount,
                averagePrice: window.averagePrice,
                totalPrice: window.totalPrice,
              })),
            )
          : null,
      },
      {
        webhookUrl: await getVariableValue('SMARTCHARGE_LOG_WEBHOOK_URL'),
      },
    );
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  if (mutateDecisionState) {
    await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);
  }

  if (
    controlPlug &&
    shouldChargeNow &&
    chargeMinutes > 0 &&
    chargeSlots > 0 &&
    battery < CONFIG.batteryFullPercentage
  ) {
    const actuatorAction = await executeRuntimePlugCommand(
      {
        plug,
        batteryPct: battery,
        sessionId,
        chargeConnectedAt: connectedAtRaw,
        plannerShouldCharge: shouldChargeNow,
      },
      true,
      'AUTOMATIC_RECONCILIATION',
    );
    log(`SmartCharge action: ${actuatorAction}`);
  } else {
    log('SmartCharge action: no action');
  }

  const availablePrices = prices.filter(
    (price) => isSlotAvailable(price, now) && price.startTime < targetDeparture,
  );

  log(`TimeZone         : ${CONFIG.timeZone}`);
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Available count  : ${availablePrices.length}`);
  log(
    `Available first  : ${availablePrices[0] ? formatLocal(availablePrices[0].startTime) : 'null'}`,
  );
  log(
    `Available last   : ${availablePrices[availablePrices.length - 1] ? formatLocal(availablePrices[availablePrices.length - 1].startTime) : 'null'}`,
  );
  log(`Need slots       : ${chargeSlots}`);
  log(`Battery          : ${battery}%`);
  log(`CurrentPrice     : ${currentPrice}`);
  log(`ConnectedAt      : ${formatLocal(connectedAt)}`);
  log(`TargetDeparture  : ${formatLocal(targetDeparture)}`);
  log(`PlanStart        : ${plan ? formatLocal(plan.plannedStart) : 'null'}`);
  log(`PlanEnd          : ${plan ? formatLocal(plan.plannedEnd) : 'null'}`);
  log(`ChargeMinutes    : ${chargeMinutes}`);
  log(`ChargeSlots      : ${chargeSlots}`);
  log(`ChargeHoursAhead : ${chargeHoursAhead}`);
  log(`AveragePrice     : ${plan ? plan.averagePrice.toFixed(4) : 'null'}`);
  log(`ShouldChargeNow  : ${shouldChargeNow}`);
  log(`Reason           : ${reason}`);
  log(`Prices count     : ${prices.length}`);
  log(
    `First price      : ${prices[0] ? formatLocal(prices[0].startTime) : 'null'}`,
  );
  log(
    `Last price       : ${prices[prices.length - 1] ? formatLocal(prices[prices.length - 1].startTime) : 'null'}`,
  );
  log(`Logger written   : ${logResult.written}`);
  log(`Logger reason    : ${logResult.reason}`);

  return {
    battery,
    chargeMinutes,
    chargeSlots,
    chargeHoursAhead,
    targetDeparture: formatLocal(targetDeparture),
    plannedStart: plan ? formatLocal(plan.plannedStart) : null,
    plannedEnd: plan ? formatLocal(plan.plannedEnd) : null,
    shouldChargeNow,
    reason,
    terminalState: null,
    plannedWindows: plan
      ? plan.windows.map((window) => ({
          plannedStart: formatLocal(window.plannedStart),
          plannedEnd: formatLocal(window.plannedEnd),
        }))
      : null,
    ...estimatedCostOutput,
    ...(stabilityResult || {}),
  };
}

function roundNullable(value, decimalPlaces) {
  return value === null || value === undefined
    ? null
    : Number(value.toFixed(decimalPlaces));
}

function formatEstimatedCostOutput(costEstimate, chargingPowerKw) {
  return {
    estimatedSelectedCostEur: roundNullable(
      costEstimate?.estimatedSelectedCostEur,
      4,
    ),
    estimatedBaselineCostEur: roundNullable(
      costEstimate?.estimatedBaselineCostEur,
      4,
    ),
    estimatedSavingsEur: roundNullable(costEstimate?.estimatedSavingsEur, 4),
    estimatedSavingsPct: roundNullable(costEstimate?.estimatedSavingsPct, 2),
    allocatedChargeMinutes: costEstimate?.allocatedChargeMinutes ?? null,
    baselineAllocatedMinutes: costEstimate?.baselineAllocatedMinutes ?? null,
    chargingPowerKw,
    baselineAllocationComplete:
      costEstimate?.baselineAllocationComplete ?? null,
    baselineIncompleteReason: costEstimate?.baselineIncompleteReason ?? null,
  };
}

function formatTariffOutput(plan, baselinePlan) {
  const selectedAveragePrice = roundNullable(plan?.averagePrice, 4);
  const selectedTotalPrice = roundNullable(plan?.totalPrice, 4);

  return {
    averagePrice: selectedAveragePrice,
    totalPrice: selectedTotalPrice,
    selectedAveragePrice,
    selectedTotalPrice,
    baselineAveragePrice: roundNullable(baselinePlan?.averagePrice, 4),
    baselineTotalPrice: roundNullable(baselinePlan?.totalPrice, 4),
  };
}

function getReasonCode(reason) {
  if (reason === 'Battery is already full') return 'BATTERY_FULL';
  if (reason === 'Current time is inside selected charging plan')
    return 'CURRENT_SLOT';
  if (reason === 'Waiting for selected charging plan')
    return 'WAITING_FOR_PLAN';
  if (reason === 'Safety fallback: selected plan starts too late')
    return 'SAFETY_FALLBACK_PLAN_TOO_LATE';
  if (reason === 'Safety fallback: latest safe start reached')
    return 'SAFETY_FALLBACK_LATEST_SAFE_START';
  if (reason === 'Safety fallback: latest safe start reached and no plan found')
    return 'SAFETY_FALLBACK_NO_PLAN';
  if (reason === 'Session expired: target departure is in the past')
    return 'SESSION_EXPIRED';
  if (reason === 'No active session') return 'NO_ACTIVE_SESSION';

  return 'UNKNOWN';
}

function getDecisionSource(reasonCode) {
  if (reasonCode.startsWith('SAFETY_FALLBACK')) return 'safety-fallback';
  if (reasonCode === 'BATTERY_FULL') return 'battery';
  if (reasonCode === 'SESSION_EXPIRED') return 'session';
  if (reasonCode === 'NO_ACTIVE_SESSION') return 'session';

  return 'planner';
}
