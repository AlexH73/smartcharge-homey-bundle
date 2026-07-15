/**
 * Logs that the user disabled SmartCharge manual override.
 *
 * This script only records the transition. Advanced Flow remains responsible
 * for changing SmartChargeManualMode and running the next decision.
 *
 * @returns {Promise<object>}
 */
async function main() {
  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_DISABLED,
      decisionSource: 'manual',
      reasonCode: 'MANUAL_OVERRIDE_DISABLED',
      reason: 'Automatic charging mode restored',
      source: 'smartcharge-manual-override',
      message: 'Control returned to the SmartCharge planner',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('Manual override disabled logged');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    logged: true,
    eventType: SmartChargeLogger.EVENT_TYPES.MANUAL_OVERRIDE_DISABLED,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
