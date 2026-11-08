// Explicit user activation persists intent before runtime reconciles power.
return await requestManualMode(
  typeof args !== 'undefined' && args[0] === 'toggle' ? 'toggle' : 'start',
);
