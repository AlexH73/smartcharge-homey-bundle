/**
 * Runtime configuration for SmartCharge HomeyScript.
 *
 * This file contains only constants and naming conventions.
 * It must be loaded before all modules that use CONFIG.
 */
const CONFIG = {
  timeZone: 'Europe/Berlin',

  engineVersion: BUILD_INFO.fullVersion,

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
