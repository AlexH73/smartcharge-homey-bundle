/**
 * Resets SmartCharge session state after charging is finished
 * or after the charger is disconnected.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const now = new Date();

  const connectedAtRaw = await getVariableValue(
    CONFIG.chargeConnectedAtVariableName,
  );

  const connectedAt = parseDateOrFallback(connectedAtRaw, now);
  const sessionId = formatLocal(connectedAt);

  const mercedes = await getDeviceByNamePart(CONFIG.mercedesDeviceNameIncludes);
  const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);

  const battery = mercedes.capabilitiesObj.measure_battery?.value ?? null;
  const plugOn = plug.capabilitiesObj.onoff?.value ?? null;
  const plugPower = plug.capabilitiesObj.measure_power?.value ?? null;

  const reason =
    'Session reset after charging finished or charger disconnected';

  try {
    await SmartChargeLogger.logToGoogleSheets(
      {
        eventType: SmartChargeLogger.EVENT_TYPES.SESSION_RESET,

        sessionId,
        loggedAt: now,

        battery,
        currentPrice: null,

        connectedAt: connectedAtRaw || null,
        targetDeparture: null,

        chargeMinutes: null,
        chargeSlots: null,
        chargeHoursAhead: null,

        plannedStart: null,
        plannedEnd: null,

        shouldChargeNow: false,

        plugOn,
        plugPower,

        reason,

        averagePrice: null,
        totalPrice: null,
        priceCount: null,

        source: 'smartcharge-reset-session',
        engineVersion: BUILD_INFO.fullVersion,

        message: 'Session variables cleared',
      },
      {
        webhookUrl: await getVariableValue('SMARTCHARGE_LOG_WEBHOOK_URL'),
      },
    );
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  await tryUpdateVariableByName(CONFIG.chargeConnectedAtVariableName, 'null');
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedStartVariableName,
    'null',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargePlannedEndVariableName,
    'null',
  );
  await tryUpdateVariableByName(
    CONFIG.smartChargeShouldChargeVariableName,
    false,
  );
  await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);

  log('SmartCharge session reset');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`SessionId        : ${sessionId}`);
  log(`Battery          : ${battery}%`);
  log(`PlugOn           : ${plugOn}`);
  log(`PlugPower        : ${plugPower}`);
  log(`Reason           : ${reason}`);

  return {
    reset: true,
    sessionId,
    battery,
    plugOn,
    plugPower,
    reason,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
