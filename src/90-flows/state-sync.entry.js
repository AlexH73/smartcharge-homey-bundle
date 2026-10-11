/**
 * Synchronizes the physical charging plug with SmartChargeShouldCharge.
 *
 * Trigger:
 *   Scheduled Homey Flow, for example every minute.
 *
 * Responsibilities:
 *   - switch the plug off when SmartChargeShouldCharge is false;
 *   - switch the plug on when SmartChargeShouldCharge is true and the session
 *     is active with a battery below full.
 *
 * Does NOT:
 *   - calculate a charging plan;
 *   - call Tibber;
 *   - reset the charging session.
 *
 * @returns {Promise<object>}
 */
async function main() {
  if (
    String(
      await getVariableValue(CONFIG.runtimeModeVariableName),
    ).toLowerCase() === 'active'
  )
    return runRuntimeController();
  const shouldChargeRaw = await getVariableValue(
    CONFIG.smartChargeShouldChargeVariableName,
  );

  const connectedAtRaw = await getVariableValue(
    CONFIG.chargeConnectedAtVariableName,
  );

  const shouldCharge = isTrueValue(shouldChargeRaw);
  const hasActiveSession = isActiveSessionValue(connectedAtRaw);

  const plug = await getDeviceByNamePart(CONFIG.plugDeviceNameIncludes);
  const plugOnBefore = getCapabilityValue(plug, 'onoff') === true;

  let battery = null;
  let action = 'none';
  let reason = 'Plug already matches SmartCharge decision';

  if (!shouldCharge && plugOnBefore) {
    action = await executeRuntimePlugCommand(
      { plug },
      false,
      'AUTOMATIC_RECONCILIATION',
    );

    reason =
      action === 'off_blocked'
        ? 'State sync skipped plug off: manual runtime owns power'
        : 'State sync switched plug off to match SmartCharge decision';
  } else if (shouldCharge && !plugOnBefore) {
    if (!hasActiveSession) {
      reason = 'State sync skipped plug on: no active session';
    } else {
      const mercedes = await getDeviceByNamePart(
        CONFIG.mercedesDeviceNameIncludes,
      );

      battery = numberOrNull(getCapabilityValue(mercedes, 'measure_battery'));

      if (battery === null) {
        reason = 'State sync skipped plug on: battery is unavailable';
      } else if (battery >= CONFIG.batteryFullPercentage) {
        reason = 'State sync skipped plug on: battery is full';
      } else {
        action = await executeRuntimePlugCommand(
          { plug, batteryPct: battery },
          true,
          'AUTOMATIC_RECONCILIATION',
        );
        reason =
          action === 'on_blocked'
            ? 'State sync skipped plug on: runtime safety gate'
            : 'State sync switched plug on to match SmartCharge decision';
      }
    }
  }

  const plugOnAfter = getCapabilityValue(plug, 'onoff') === true;

  log('SmartCharge state synchronized');
  log(`Script version   : ${BUILD_INFO.fullVersion}`);
  log(`Action           : ${action}`);
  log(`Reason           : ${reason}`);
  log(`Should charge    : ${shouldCharge}`);
  log(`Plug before      : ${plugOnBefore}`);
  log(`Plug after       : ${plugOnAfter}`);

  return {
    synced: true,
    action,
    reason,
    shouldCharge,
    hasActiveSession,
    battery,
    plugOnBefore,
    plugOnAfter,
    version: BUILD_INFO.fullVersion,
  };
}

function isTrueValue(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function isActiveSessionValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();

  return (
    normalized !== '' && normalized !== 'null' && normalized !== 'undefined'
  );
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

return await main();
