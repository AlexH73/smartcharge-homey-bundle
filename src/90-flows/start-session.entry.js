/**
 * Starts a new SmartCharge session.
 *
 * Trigger:
 *   Charging cable was connected.
 *
 * Responsibilities:
 *   - create a new charging session;
 *   - store connection timestamp;
 *   - clear previous charging plan;
 *   - reset SmartCharge runtime state;
 *   - write session_start event to Google Sheets.
 *
 * Does NOT:
 *   - calculate charging plan;
 *   - switch the plug on;
 *   - fetch Tibber prices.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const now = new Date();
  const connectedAt = formatLocal(now);
  const reason = 'Session started';

  await tryUpdateVariableByName(CONFIG.chargeConnectedAtVariableName, connectedAt);
  await tryUpdateVariableByName(CONFIG.smartChargePlannedStartVariableName, 'null');
  await tryUpdateVariableByName(CONFIG.smartChargePlannedEndVariableName, 'null');
  await tryUpdateVariableByName(CONFIG.smartChargeShouldChargeVariableName, false);
  await tryUpdateVariableByName(CONFIG.smartChargeReasonVariableName, reason);

  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.SESSION_START,
      reason,
      source: 'smartcharge-start-session',
      message: 'Charging cable connected',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('SmartCharge session started');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`SessionId        : ${connectedAt}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    started: true,
    sessionId: connectedAt,
    reason,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();