/**
 * Single trigger-only entry point for SmartCharge runtime reconciliation.
 * Homey Flows should invoke this script and contain no lifecycle decisions.
 */
return await runRuntimeController();
