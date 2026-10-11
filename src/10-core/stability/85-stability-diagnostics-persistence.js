const STABILITY_DIAGNOSTICS_SCHEMA_VERSION = 1;
const STABILITY_DIAGNOSTIC_DECISIONS = new Set([
  'INITIAL_ACCEPT',
  'CONTINUE',
  'REPLACE',
  'BYPASS',
  'NO_DECISION',
]);

function isNullableType(value, type) {
  return value === null || typeof value === type;
}

function validateStabilityDiagnostics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== STABILITY_DIAGNOSTICS_SCHEMA_VERSION)
    return false;
  if (
    typeof value.loggedAt !== 'string' ||
    !parseStrategyTimestamp(value.loggedAt)
  )
    return false;
  if (!isNullableType(value.sessionId, 'string')) return false;
  if (!isNullableType(value.productionShouldCharge, 'boolean')) return false;
  if (!STABILITY_DIAGNOSTIC_DECISIONS.has(value.stabilityDecision))
    return false;
  if (!isNullableType(value.shadowEffectiveShouldCharge, 'boolean'))
    return false;
  if (!isNullableType(value.transition, 'string')) return false;
  if (!isNullableType(value.acceptedRevision, 'number')) return false;
  if (!isNullableType(value.continuationCostEur, 'number')) return false;
  if (!isNullableType(value.candidateCostEur, 'number')) return false;
  if (!isNullableType(value.savingEur, 'number')) return false;
  if (!isNullableType(value.savingPct, 'number')) return false;
  if (!isNullableType(value.persistenceStatus, 'string')) return false;
  return isNullableType(value.reason, 'string');
}

function parseStabilityDiagnostics(rawValue, currentSessionId = null) {
  if (rawValue === undefined) {
    return { status: 'MISSING', diagnostics: null, sessionMatch: null };
  }
  const serialized = String(rawValue ?? '').trim();
  if (serialized === '' || serialized.toLowerCase() === 'null') {
    return { status: 'EMPTY', diagnostics: null, sessionMatch: null };
  }

  let diagnostics;
  try {
    diagnostics = JSON.parse(serialized);
  } catch (error) {
    return {
      status: `CORRUPT (${error.message})`,
      diagnostics: null,
      sessionMatch: null,
    };
  }
  if (!validateStabilityDiagnostics(diagnostics)) {
    return { status: 'INVALID', diagnostics: null, sessionMatch: null };
  }
  return {
    status: 'RESTORED',
    diagnostics,
    sessionMatch:
      currentSessionId === null || diagnostics.sessionId === null
        ? null
        : diagnostics.sessionId === currentSessionId,
  };
}

function createStabilityDiagnostics(options) {
  const result = options.stabilityResult || {};
  return {
    schemaVersion: STABILITY_DIAGNOSTICS_SCHEMA_VERSION,
    loggedAt: options.now.toISOString(),
    sessionId: options.sessionId ?? null,
    productionShouldCharge: options.productionShouldCharge ?? null,
    stabilityDecision: result.stabilityDecision || 'NO_DECISION',
    shadowEffectiveShouldCharge: result.shadowEffectiveShouldCharge ?? null,
    transition: result.transition ?? null,
    acceptedRevision: result.acceptedStrategyRevision ?? null,
    continuationCostEur: result.currentStrategyRemainingCostEur ?? null,
    candidateCostEur: result.candidateRemainingCostEur ?? null,
    savingEur: result.replacementSavingsEur ?? null,
    savingPct: result.replacementSavingsPct ?? null,
    persistenceStatus: result.persistenceStatus ?? null,
    reason: result.stabilityReasonCode || result.stabilityError || null,
  };
}

async function writeStabilityDiagnostics(options) {
  const diagnostics = createStabilityDiagnostics(options);
  try {
    await updateVariableByName(
      CONFIG.stabilityDiagnosticsVariableName,
      JSON.stringify(diagnostics),
    );
    return { status: 'WRITTEN', error: null, diagnostics };
  } catch (error) {
    return { status: 'WRITE_FAILED', error: error.message, diagnostics };
  }
}
