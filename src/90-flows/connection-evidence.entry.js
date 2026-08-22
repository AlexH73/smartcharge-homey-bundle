/**
 * Event-only entry point for trustworthy external connection evidence.
 * Runtime Controller remains the sole lifecycle and power-control owner.
 */
await updateVariableByName(
  CONFIG.runtimeConnectionEvidenceAtVariableName,
  new Date().toISOString(),
);

return await runRuntimeController();
