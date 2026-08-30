/**
 * Logs that the user enabled SmartCharge manual override.
 *
 * This script only records the transition. Advanced Flow remains responsible
 * for changing SmartChargeManualMode and SmartChargeShouldCharge.
 *
 * @returns {Promise<object>}
 */
async function main() {
  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_ENABLED,
      decisionSource: 'manual',
      shouldChargeNow: true,
      reasonCode: 'MANUAL_OVERRIDE_ENABLED',
      reason: 'Manual charging mode enabled by user',
      source: 'smartcharge-manual-override',
      message: 'User temporarily bypassed the planner',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('Manual override enabled logged');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    logged: true,
    eventType: SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_ENABLED,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
