if (
  String(
    await getVariableValue(CONFIG.runtimeModeVariableName),
  ).toLowerCase() === 'active'
)
  return await runRuntimeController();

return await runCanonicalDecision({
  stabilityShadow:
    typeof stabilityShadow === 'undefined' ? null : stabilityShadow,
});
