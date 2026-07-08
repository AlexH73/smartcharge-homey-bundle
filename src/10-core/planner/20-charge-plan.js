/**
 * Creates a ChargePlan model.
 *
 * ChargePlan represents the selected charging strategy result.
 * The object keeps current compatibility fields flat for HomeyScript,
 * Google Sheets and existing simulator expectations.
 *
 * @param {Object} options
 * @returns {Object}
 */
function createChargePlan(options = {}) {
  const windows = Array.isArray(options.windows) ? options.windows : [];

  const chargeWindowsText =
    options.chargeWindowsText ?? formatChargeWindowsText(windows);

  const chargeWindowsJson =
    options.chargeWindowsJson ?? serializeChargeWindows(windows);

  return {
    sessionId: options.sessionId ?? null,
    planRevision: options.planRevision ?? 0,

    plannerMode: options.plannerMode ?? 'continuous',
    optimizationStrategy: options.optimizationStrategy ?? 'lowest-cost',

    createdAt: options.createdAt ?? null,
    engineVersion: options.engineVersion ?? null,

    connectedAt: options.connectedAt ?? null,
    targetDeparture: options.targetDeparture ?? null,

    reason: options.reason ?? null,

    plannedStart: options.plannedStart ?? null,
    plannedEnd: options.plannedEnd ?? null,

    averagePrice: options.averagePrice ?? null,
    totalPrice: options.totalPrice ?? null,

    chargeMinutes: options.chargeMinutes ?? null,
    chargeSlots: options.chargeSlots ?? null,

    shouldChargeNow: Boolean(options.shouldChargeNow),

    estimatedFinish: options.estimatedFinish ?? options.plannedEnd ?? null,

    windowCount: options.windowCount ?? windows.length,
    totalSlotCount: options.totalSlotCount ?? options.chargeSlots ?? null,

    latestSafeStart: options.latestSafeStart ?? null,

    continuousPlanPrice: options.continuousPlanPrice ?? null,
    multiWindowPlanPrice: options.multiWindowPlanPrice ?? null,
    selectedPlanSavings: options.selectedPlanSavings ?? null,

    planChanged: Boolean(options.planChanged),

    windows,
    chargeWindowsText,
    chargeWindowsJson,
  };
}
