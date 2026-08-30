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
    await setDeviceOn(plug);
    log('SmartCharge action: plug turned ON');
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
