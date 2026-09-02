/**
 * Runtime configuration for SmartCharge HomeyScript.
 *
 * This file contains only constants and naming conventions.
 * It must be loaded before all modules that use CONFIG.
 */
const CONFIG = {
  timeZone: 'Europe/Berlin',

  tibberAccessTokenVariableName: 'TIBBER_ACCESS_TOKEN',

  mercedesDeviceNameIncludes: 'E 300',
  plugDeviceNameIncludes: 'Auto Plug In',

  chargeConnectedAtVariableName: 'ChargeConnectedAt',
  chargeFactorVariableName: 'ChargeFactor',
  chargeReserveVariableName: 'ChargeReserve',

  chargeMinutesVariableName: 'ChargeMinutes',
  chargeSlotsVariableName: 'ChargeSlots',
  legacyChargeQuartersVariableName: 'ChargeQuarters',
  chargeHoursAheadVariableName: 'ChargeHoursAhead',

  smartChargePlannedStartVariableName: 'SmartChargePlannedStart',
  smartChargePlannedEndVariableName: 'SmartChargePlannedEnd',
  smartChargeShouldChargeVariableName: 'SmartChargeShouldCharge',
  smartChargeReasonVariableName: 'SmartChargeReason',
  smartChargeTargetDepartureVariableName: 'SmartChargeTargetDeparture',
  smartChargeSessionStatusVariableName: 'SmartChargeSessionStatus',
  smartChargeManualModeVariableName: 'SmartChargeManualMode',
  acceptedStrategyVariableName: 'SmartChargeAcceptedStrategy',
  stabilityDiagnosticsVariableName: 'SmartChargeStabilityDiagnostics',
  runtimeModeVariableName: 'SmartChargeRuntimeMode',
  runtimeDisconnectObservedAtVariableName: 'SmartChargeDisconnectObservedAt',
  runtimeConnectionEvidenceAtVariableName: 'SmartChargeConnectionEvidenceAt',
  runtimeControllerDefaultMode: 'shadow',

  chargingPowerThresholdW: 500,
  idlePowerThresholdW: 50,
  disconnectConfirmationMinutes: 15,
  telemetryStaleMinutes: 30,
  vehicleStatusCapabilityNames: [
    'text_charging_status',
    'charging_status',
    'charge_status',
    'ladestatus',
  ],
  vehicleChargingCapabilityNames: ['onoff_charging'],
  vehicleChargingPowerCapabilityNames: ['measure_charge_power'],
  preconditioningCapabilityNames: [
    'onoff_precond',
    'preconditioning',
    'preconditioning_active',
  ],

  workdayDepartureHour: 7,
  workdayDepartureMinute: 30,
  weekendDepartureHour: 13,
  weekendDepartureMinute: 0,

  roundToMinutes: 5,
  minChargeMinutes: 30,
  maxChargeMinutes: 300,
  minHoursAhead: 1,
  maxHoursAhead: 24,

  batteryFullPercentage: 100,
  priceSlotMinutes: 60,
  // Nominal charging power used only for estimated energy costs.
  chargingPowerKw: 2.6,
  plannerVersion: 'planner-v2',
  telemetrySchemaVersion: 2,

  // Experimental observation only. Never affects canonical/actuator decisions.
  planStabilityLiveShadowEnabled: true,
  planStabilityShadowExperimentPolicy: {
    thresholdMode: 'ALL',
    waiting: {
      minReplacementSavingsEur: 0.05,
      minReplacementSavingsPct: 5,
    },
    charging: {
      minReplacementSavingsEur: 0.5,
      minReplacementSavingsPct: 20,
    },
  },

  tibberApiUrl: 'https://api.tibber.com/v1-beta/gql',
};

/**
 * Tibber GraphQL query for current, today and tomorrow prices.
 */
const TIBBER_PRICE_INFO_QUERY = `
{
  viewer {
    homes {
      currentSubscription {
        priceInfo {
          current {
            total
            startsAt
          }
          today {
            total
            startsAt
          }
          tomorrow {
            total
            startsAt
          }
        }
      }
    }
  }
}
`;
