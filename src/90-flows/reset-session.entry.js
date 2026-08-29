/**
 * Resets the current SmartCharge session.
 *
 * Trigger:
 *   Charging finished, battery full, charger disconnected,
 *   or manual reset.
 *
 * Responsibilities:
 *   - write session_reset event to Google Sheets;
 *   - clear active session timestamp;
 *   - clear charging plan;
 *   - reset SmartCharge runtime state.
 *
 * Does NOT:
 *   - calculate charging plan;
 *   - switch the plug on or off;
 *   - create a new session.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const reason =
    'Session reset after charging finished or charger disconnected';

  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.SESSION_RESET,
      reason,
      source: 'smartcharge-reset-session',
      message: 'Session variables cleared',
    });
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
  if (isPlanStabilityLiveShadowEnabled()) {
    const stabilityCleanup = await clearAcceptedStrategyAnchor();
    if (!stabilityCleanup.success) {
      log(
        `Plan stability cleanup failed: ${stabilityCleanup.error || stabilityCleanup.status}`,
      );
    }
  }

  log('SmartCharge session reset');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Reason           : ${reason}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    reset: true,
    reason,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
