/**
 * Prints a read-only snapshot of persistent Plan Stability state.
 *
 * This entrypoint does not run planning or Runtime Controller and never writes
 * Logic variables, telemetry, events, Session state, or actuator state.
 *
 * @returns {Promise<string>}
 */
async function main() {
  let variables = {};
  let logicReadError = null;

  try {
    variables = await Homey.logic.getVariables();
  } catch (error) {
    logicReadError = error.message;
  }

  const valuesByName = new Map(
    Object.values(variables).map((variable) => [variable.name, variable.value]),
  );
  const readValue = (name) =>
    valuesByName.has(name) ? valuesByName.get(name) : undefined;
  const displayValue = (value) => {
    if (value === undefined) return 'MISSING';
    if (value === null) return 'null';
    if (String(value).trim() === '') return 'EMPTY';
    return String(value);
  };

  const connectedAt = readValue(CONFIG.chargeConnectedAtVariableName);
  const sessionId = runtimeActiveSession(connectedAt) ? connectedAt : null;
  const rawAnchor = readValue(CONFIG.acceptedStrategyVariableName);
  let anchor = null;
  let anchorStatus = 'MISSING';

  if (rawAnchor !== undefined) {
    const serialized = String(rawAnchor ?? '').trim();
    if (serialized === '' || serialized.toLowerCase() === 'null') {
      anchorStatus = 'EMPTY';
    } else {
      try {
        const parsed = JSON.parse(serialized);
        const validation = validateAcceptedStrategyAnchor(parsed);
        if (validation.valid) {
          anchor = parsed;
          anchorStatus =
            sessionId && parsed.sessionId !== sessionId
              ? 'VALID_SESSION_MISMATCH'
              : 'RESTORED';
        } else {
          anchorStatus = `INVALID (${validation.errors.join(', ')})`;
        }
      } catch (error) {
        anchorStatus = `CORRUPT_JSON (${error.message})`;
      }
    }
  }

  const rawDiagnostics = readValue(CONFIG.stabilityDiagnosticsVariableName);
  const diagnosticsResult = parseStabilityDiagnostics(
    rawDiagnostics,
    sessionId,
  );
  const diagnostics = diagnosticsResult.diagnostics;
  const diagnosticsSessionMatch =
    diagnosticsResult.sessionMatch === null
      ? 'N/A'
      : diagnosticsResult.sessionMatch
        ? 'YES'
        : 'NO';

  const lines = [
    '=== SmartCharge Stability Debug ===',
    `Build: ${BUILD_INFO.fullVersion}`,
    `Runtime Mode: ${displayValue(readValue(CONFIG.runtimeModeVariableName))}`,
    `Live Shadow: ${CONFIG.planStabilityLiveShadowEnabled ? 'ENABLED' : 'DISABLED'}`,
    ...(logicReadError ? [`Logic Read Error: ${logicReadError}`] : []),
    '',
    'Session:',
    `Connected At: ${displayValue(connectedAt)}`,
    `Session ID: ${displayValue(sessionId)}`,
    '',
    'Accepted Strategy:',
    `Raw: ${displayValue(rawAnchor)}`,
    `Status: ${anchorStatus}`,
    `Schema: ${displayValue(anchor?.schemaVersion)}`,
    `Session: ${displayValue(anchor?.sessionId)}`,
    `Planner: ${displayValue(anchor?.plannerVersion)}`,
    `Accepted At: ${displayValue(anchor?.acceptedAt)}`,
    `Revision: ${displayValue(anchor?.revision)}`,
    `Departure: ${displayValue(anchor?.targetDeparture)}`,
    'Slots:',
    ...(anchor?.selectedSlotStarts?.length
      ? anchor.selectedSlotStarts.map((slotStart) => `- ${slotStart}`)
      : ['- none']),
    '',
    'Current Logic:',
    `Should Charge: ${displayValue(readValue(CONFIG.smartChargeShouldChargeVariableName))}`,
    `Manual Mode: ${displayValue(readValue(CONFIG.smartChargeManualModeVariableName))}`,
    `Disconnect Observed At: ${displayValue(readValue(CONFIG.runtimeDisconnectObservedAtVariableName))}`,
    `Connection Evidence At: ${displayValue(readValue(CONFIG.runtimeConnectionEvidenceAtVariableName))}`,
    '',
    'Last Stability Diagnostics:',
    `Raw: ${displayValue(rawDiagnostics)}`,
    `Status: ${diagnosticsResult.status}`,
    `Session Match: ${diagnosticsSessionMatch}`,
    `Logged At: ${displayValue(diagnostics?.loggedAt)}`,
    `Production Should Charge: ${displayValue(diagnostics?.productionShouldCharge)}`,
    `Stability Decision: ${displayValue(diagnostics?.stabilityDecision)}`,
    `Shadow Effective ShouldCharge: ${displayValue(diagnostics?.shadowEffectiveShouldCharge)}`,
    `Transition: ${displayValue(diagnostics?.transition)}`,
    `Accepted Revision: ${displayValue(diagnostics?.acceptedRevision)}`,
    `Continuation Cost: ${displayValue(diagnostics?.continuationCostEur)}`,
    `Candidate Cost: ${displayValue(diagnostics?.candidateCostEur)}`,
    `Saving EUR: ${displayValue(diagnostics?.savingEur)}`,
    `Saving %: ${displayValue(diagnostics?.savingPct)}`,
    `Persistence Status: ${displayValue(diagnostics?.persistenceStatus)}`,
    `Reason: ${displayValue(diagnostics?.reason)}`,
  ];
  const report = lines.join('\n');

  log(report);
  return report;
}

return await main();
