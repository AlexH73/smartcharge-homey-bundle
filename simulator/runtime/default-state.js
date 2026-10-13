const DEFAULT_LOGIC_VARIABLES = Object.freeze({
  TIBBER_ACCESS_TOKEN: 'local-tibber-token',
  SMARTCHARGE_LOG_WEBHOOK_URL: 'local://smartcharge/events',
  SmartChargeLastLogKey: '',

  ChargeConnectedAt: 'null',
  ChargeFactor: 2,
  ChargeReserve: 20,

  ChargeMinutes: 0,
  ChargeSlots: 0,
  ChargeQuarters: 0,
  ChargeHoursAhead: 0,

  SmartChargePlannedStart: 'null',
  SmartChargePlannedEnd: 'null',
  SmartChargeShouldCharge: false,
  SmartChargeReason: '',
  SmartChargeTargetDeparture: 'null',
  SmartChargeSessionStatus: '',
  SmartChargeManualMode: false,
  SmartChargeManualState: JSON.stringify({
    version: 1,
    status: 'IDLE',
    id: null,
    startedAt: null,
    confirmedAt: null,
    highPowerAt: null,
    lastPowerAt: null,
    lowPowerSince: null,
    endedAt: null,
    stopReason: null,
    error: null,
    activationStopToken: null,
    // Legacy AUTO scenarios start with operator permission; no-grant scenarios
    // override this record explicitly. This is simulator data only.
    autoGrant: { at: '2020-01-01T00:00:00Z', stopToken: 'null' },
  }),
  SmartChargeAutoStartBlocked: false,
  SmartChargeRuntimeLock: 'null',
  SmartChargeUserStopToken: 'null',
  SmartChargeAcceptedStrategy: 'null',
  SmartChargeStabilityDiagnostics: 'null',
  SmartChargeRuntimeMode: 'shadow',
  SmartChargeDisconnectObservedAt: 'null',
  SmartChargeConnectionEvidenceAt: 'null',
});

const DEFAULT_DEVICES = Object.freeze({
  mercedes: {
    id: 'local-mercedes',
    name: 'Mercedes E 300 de',
    capabilitiesObj: {
      measure_battery: {
        value: 70,
      },
      text_charging_status: {
        value: null,
      },
      onoff_charging: {
        value: false,
      },
      measure_charge_power: {
        value: 0,
        units: 'kW',
      },
      onoff_precond: {
        value: false,
      },
      onoff_connector: {
        value: null,
      },
      text_connector_status: {
        value: null,
      },
    },
  },
  plug: {
    id: 'local-smart-plug',
    name: 'Auto Plug In Garage',
    capabilitiesObj: {
      onoff: {
        value: false,
      },
      measure_power: {
        value: 0,
      },
    },
  },
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_DEVICES,
  DEFAULT_LOGIC_VARIABLES,
  deepClone,
};
