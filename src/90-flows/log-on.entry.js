/**
 * Logs SmartCharge charging start.
 *
 * Trigger:
 *   SmartCharge has turned the charging plug ON.
 *
 * Responsibilities:
 *   - write smartcharge_on event to Google Sheets.
 *
 * Does NOT:
 *   - create a session;
 *   - calculate charging plan;
 *   - control the charging plug.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const reason = 'Charging started';

  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ON,
      reason,
      source: 'smartcharge-on',
      message: 'Charging plug turned on',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('SmartCharge ON logged');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    logged: true,
    eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_ON,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
