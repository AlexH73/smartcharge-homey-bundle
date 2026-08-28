const ACCEPTED_STRATEGY_SCHEMA_VERSION = 1;
const ISO_TIMESTAMP_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseStrategyTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !ISO_TIMESTAMP_WITH_ZONE_PATTERN.test(value)
  ) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function normalizeStrategyTimestamp(value) {
  const timestamp = parseStrategyTimestamp(value);
  return timestamp ? timestamp.toISOString() : null;
}

function validateAcceptedStrategyAnchor(anchor, options = {}) {
  const errors = [];

  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
    return { valid: false, errors: ['ANCHOR_INVALID'] };
  }

  if (anchor.schemaVersion !== ACCEPTED_STRATEGY_SCHEMA_VERSION) {
    errors.push('SCHEMA_VERSION_UNSUPPORTED');
  }
  if (typeof anchor.sessionId !== 'string' || !anchor.sessionId.trim()) {
    errors.push('SESSION_ID_INVALID');
  } else if (
    options.sessionId !== undefined &&
    anchor.sessionId !== options.sessionId
  ) {
    errors.push('SESSION_MISMATCH');
  }
  if (typeof anchor.plannerVersion !== 'string' || !anchor.plannerVersion) {
    errors.push('PLANNER_VERSION_INVALID');
  }
  if (!parseStrategyTimestamp(anchor.acceptedAt)) {
    errors.push('ACCEPTED_AT_INVALID');
  }
  if (!Number.isInteger(anchor.revision) || anchor.revision < 0) {
    errors.push('REVISION_INVALID');
  }
  if (!parseStrategyTimestamp(anchor.targetDeparture)) {
    errors.push('TARGET_DEPARTURE_INVALID');
  }
  if (
    !Array.isArray(anchor.selectedSlotStarts) ||
    anchor.selectedSlotStarts.length === 0
  ) {
    errors.push('SELECTED_SLOT_STARTS_INVALID');
  } else {
    const normalizedStarts = anchor.selectedSlotStarts.map(
      normalizeStrategyTimestamp,
    );
    if (normalizedStarts.some((value) => value === null)) {
      errors.push('SLOT_IDENTITY_INVALID');
    } else if (new Set(normalizedStarts).size !== normalizedStarts.length) {
      errors.push('SLOT_IDENTITY_DUPLICATE');
    }
  }

  return { valid: errors.length === 0, errors };
}

function createAcceptedStrategyAnchor(options) {
  const anchor = {
    schemaVersion: options.schemaVersion ?? ACCEPTED_STRATEGY_SCHEMA_VERSION,
    sessionId: options.sessionId,
    plannerVersion: options.plannerVersion,
    acceptedAt: normalizeStrategyTimestamp(options.acceptedAt),
    revision: options.revision ?? 0,
    targetDeparture: normalizeStrategyTimestamp(options.targetDeparture),
    selectedSlotStarts: Array.isArray(options.selectedSlotStarts)
      ? options.selectedSlotStarts
          .map(normalizeStrategyTimestamp)
          .sort((a, b) => String(a).localeCompare(String(b)))
      : options.selectedSlotStarts,
  };
  const validation = validateAcceptedStrategyAnchor(anchor);

  if (!validation.valid) {
    throw new Error(
      `Invalid AcceptedStrategyAnchor: ${validation.errors.join(', ')}`,
    );
  }

  return anchor;
}
