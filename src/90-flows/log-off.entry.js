/**
 * Logs SmartCharge charging stop.
 *
 * Trigger:
 *   SmartCharge has turned the charging plug OFF.
 *
 * Responsibilities:
 *   - write smartcharge_off event to Google Sheets.
 *
 * Does NOT:
 *   - reset the charging session;
 *   - calculate charging plan;
 *   - control the charging plug.
 *
 * @returns {Promise<object>}
 */
async function main() {
  const reason = 'Charging stopped';

  let logResult = null;

  try {
    logResult = await SmartChargeLogger.logLifecycleEvent({
      eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_OFF,
      reason,
      source: 'smartcharge-off',
      message: 'Charging plug turned off',
    });
  } catch (error) {
    log(`Logger error     : ${error.message}`);
  }

  log('SmartCharge OFF logged');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Logger written   : ${logResult ? logResult.written : false}`);

  return {
    logged: true,
    eventType: SmartChargeLogger.EVENT_TYPES.SMARTCHARGE_OFF,
    loggerWritten: logResult ? logResult.written : false,
    version: BUILD_INFO.fullVersion,
  };
}

return await main();
