async function preparePersistentStabilityShadow(options) {
  if (!isPlanStabilityLiveShadowEnabled(options.enabledOverride)) {
    return { enabled: false, persistenceStatus: 'DISABLED' };
  }

  const readResult = await readAcceptedStrategyAnchor({
    sessionId: options.sessionId,
  });
  if (readResult.status === 'READ_FAILED') {
    return {
      enabled: true,
      evaluable: false,
      persistenceStatus: readResult.status,
      persistenceError: readResult.error,
      readResult,
    };
  }

  return {
    enabled: true,
    evaluable: true,
    persistenceStatus: readResult.status,
    persistenceError: readResult.error,
    readResult,
    shadowInput: {
      enabled: true,
      acceptedAnchor: readResult.anchor,
      policyConfiguration: CONFIG.planStabilityShadowExperimentPolicy,
      context: options.context || {},
    },
  };
}

async function finalizePersistentStabilityShadow(preparation, result) {
  if (!preparation?.enabled) {
    return { status: 'DISABLED', error: null, written: false };
  }
  if (!preparation.evaluable) {
    return {
      status: preparation.persistenceStatus,
      error: preparation.persistenceError,
      written: false,
    };
  }
  if (
    (result?.stabilityDecision === 'INITIAL_ACCEPT' ||
      result?.stabilityDecision === 'REPLACE') &&
    result.stabilityCandidateAnchor
  ) {
    const writeResult = await writeAcceptedStrategyAnchor(
      result.stabilityCandidateAnchor,
      { currentSerialized: preparation.readResult.serialized },
    );
    return {
      status: writeResult.status,
      error: writeResult.error,
      written: writeResult.written,
    };
  }

  return { status: 'PRESERVED', error: null, written: false };
}
