function isPlanStabilityLiveShadowEnabled(override) {
  if (typeof override === 'boolean') return override;
  if (typeof liveStabilityShadowEnabled !== 'undefined') {
    return liveStabilityShadowEnabled === true;
  }
  return CONFIG.planStabilityLiveShadowEnabled === true;
}

async function readAcceptedStrategyAnchor(options = {}) {
  let rawValue;
  try {
    rawValue = await getVariableValue(CONFIG.acceptedStrategyVariableName);
  } catch (error) {
    return {
      available: false,
      status: 'READ_FAILED',
      error: error.message,
      anchor: null,
      serialized: null,
    };
  }

  if (
    rawValue === null ||
    rawValue === undefined ||
    String(rawValue).trim() === '' ||
    String(rawValue).trim().toLowerCase() === 'null'
  ) {
    return {
      available: false,
      status: 'EMPTY',
      error: null,
      anchor: null,
      serialized: String(rawValue ?? ''),
    };
  }

  let anchor;
  try {
    anchor = JSON.parse(String(rawValue));
  } catch (error) {
    return {
      available: false,
      status: 'INVALID_JSON',
      error: error.message,
      anchor: null,
      serialized: String(rawValue),
    };
  }

  const validation = validateAcceptedStrategyAnchor(anchor);
  if (!validation.valid) {
    return {
      available: false,
      status: 'INVALID_ANCHOR',
      error: validation.errors.join(','),
      validationErrors: validation.errors,
      anchor: null,
      serialized: String(rawValue),
    };
  }

  if (options.sessionId && anchor.sessionId !== options.sessionId) {
    return {
      available: false,
      status: 'SESSION_MISMATCH',
      error: 'SESSION_MISMATCH',
      anchor: null,
      staleAnchor: anchor,
      serialized: String(rawValue),
    };
  }

  return {
    available: true,
    status: 'RESTORED',
    error: null,
    anchor,
    serialized: String(rawValue),
  };
}

async function writeAcceptedStrategyAnchor(anchor, options = {}) {
  const validation = validateAcceptedStrategyAnchor(anchor);
  if (!validation.valid) {
    return {
      success: false,
      status: 'WRITE_REJECTED',
      error: validation.errors.join(','),
      written: false,
    };
  }

  const serialized = JSON.stringify(anchor);
  if (options.currentSerialized === serialized) {
    return {
      success: true,
      status: 'UNCHANGED',
      error: null,
      written: false,
      serialized,
    };
  }

  try {
    await updateVariableByName(CONFIG.acceptedStrategyVariableName, serialized);
    return {
      success: true,
      status: 'WRITTEN',
      error: null,
      written: true,
      serialized,
    };
  } catch (error) {
    return {
      success: false,
      status: 'WRITE_FAILED',
      error: error.message,
      written: false,
      serialized,
    };
  }
}

async function clearAcceptedStrategyAnchor() {
  try {
    const current = await getVariableValue(CONFIG.acceptedStrategyVariableName);
    if (
      current === null ||
      current === undefined ||
      String(current).trim() === '' ||
      String(current).trim().toLowerCase() === 'null'
    ) {
      return {
        success: true,
        status: 'ALREADY_CLEAR',
        error: null,
        written: false,
      };
    }
    await updateVariableByName(CONFIG.acceptedStrategyVariableName, 'null');
    return {
      success: true,
      status: 'CLEARED',
      error: null,
      written: true,
    };
  } catch (error) {
    return {
      success: false,
      status: 'CLEAR_FAILED',
      error: error.message,
      written: false,
    };
  }
}
