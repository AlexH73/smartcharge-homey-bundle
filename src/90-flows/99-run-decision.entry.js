/**
 * Main SmartCharge decision runner.
 *
 * This is the only executable part of the HomeyScript bundle.
 * All helper modules must be concatenated before this file.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const now = new Date();

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

  const connectedAt = parseDateOrFallback(
    await getVariableValue(CONFIG.chargeConnectedAtVariableName),
    now,
  );

  const targetDeparture = getTargetDeparture(connectedAt);

  if (isChargingSessionExpired(now, targetDeparture, battery)) {
    const reason = getExpiredSessionReason();

    await tryUpdateVariableByName(
      CONFIG.smartChargeShouldChargeVariableName,
      false,
    );

    await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);

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
    };
  }

  const chargeMinutes = calculateChargeMinutes(battery, factor, reserve);
  const chargeSlots = calculateChargeSlots(chargeMinutes);
  const chargeHoursAhead = calculateHoursAhead(targetDeparture, now);

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

  const priceInfo = await fetchTibberPriceInfo(tibberAccessToken);
  const prices = normalizeTibberPrices(priceInfo);
  const currentPrice = priceInfo.current?.total ?? null;

  const plan = findCheapestContinuousPlan(prices, {
    now,
    targetDeparture,
    chargeSlots,
  });

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

  await tryUpdateVariableByName(
    CONFIG.smartChargeShouldChargeVariableName,
    shouldChargeNow,
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedStartVariableName,
    plan ? formatLocal(plan.plannedStart) : 'null',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedEndVariableName,
    plan ? formatLocal(plan.plannedEnd) : 'null',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargeTargetDepartureVariableName,
    formatLocal(targetDeparture),
  );

  let logResult = {
    written: false,
    reason: 'Logger skipped',
  };

  const sessionId = formatLocal(connectedAt);
  const plugOn = plug.capabilitiesObj.onoff?.value ?? null;
  const plugPower = plug.capabilitiesObj.measure_power?.value ?? null;

  try {
    logResult = await SmartChargeLogger.logToGoogleSheets(
      {
        eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_DECISION,

        sessionId,
        loggedAt: now,

        battery,
        currentPrice,

        connectedAt: formatLocal(connectedAt),
        targetDeparture: formatLocal(targetDeparture),

        chargeMinutes,
        chargeSlots,
        chargeHoursAhead,

        plannedStart: plan ? formatLocal(plan.plannedStart) : null,
        plannedEnd: plan ? formatLocal(plan.plannedEnd) : null,

        shouldChargeNow,

        plugOn,
        plugPower,

        reason,

        averagePrice: plan ? Number(plan.averagePrice.toFixed(4)) : null,
        totalPrice: plan ? Number(plan.totalPrice.toFixed(4)) : null,
        priceCount: prices.length,

        source: 'smartcharge-run-decision',
        engineVersion: BUILD_INFO.fullVersion,

        message: null,
      },
      {
        webhookUrl: await getVariableValue('SMARTCHARGE_LOG_WEBHOOK_URL'),
      },
    );
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);

  if (
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
  };
}

return await main();
