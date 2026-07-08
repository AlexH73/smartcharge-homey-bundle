/**
 * Selects the preferred ChargePlan.
 *
 * Current implementation compares only total charging cost.
 * Additional comparison rules will be added in future revisions.
 *
 * @param {Object|null} continuousPlan
 * @param {Object|null} multiWindowPlan
 * @returns {Object|null}
 */
function selectBestChargePlan(continuousPlan, multiWindowPlan) {
  if (!continuousPlan) {
    return multiWindowPlan;
  }

  if (!multiWindowPlan) {
    return continuousPlan;
  }

  if (multiWindowPlan.totalPrice < continuousPlan.totalPrice) {
    return multiWindowPlan;
  }

  return continuousPlan;
}
