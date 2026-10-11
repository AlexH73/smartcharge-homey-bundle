const assert = require('assert/strict');
const fs = require('fs');
const { createReader, inventory } = require('./homey-discovery');

function mercedesAudit(snapshot, deviceId, now = Date.now()) {
  const device = snapshot.devices[deviceId];
  assert.ok(device, 'Explicit Mercedes ID required');
  const capability = (names) => {
    const name = names.find(
      (key) =>
        device.capabilitiesObj?.[key]?.value !== null &&
        device.capabilitiesObj?.[key]?.value !== undefined,
    );
    const data = device.capabilitiesObj?.[name];
    const raw = data?.lastUpdated || data?.updatedAt || null;
    const timestamp =
      typeof raw === 'number' ? raw : raw ? Date.parse(raw) : NaN;
    const ageSeconds = Number.isFinite(timestamp)
      ? (now - timestamp) / 1000
      : null;
    return {
      capability: name || null,
      value: data?.value ?? null,
      timestamp: Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null,
      ageSeconds,
      freshRuntime30Minutes:
        ageSeconds !== null && ageSeconds >= 0 && ageSeconds <= 1800,
    };
  };
  const connectionFlows = Object.values(snapshot.advancedFlows)
    .filter((flow) => /Connection Evidence/.test(flow.name || ''))
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      enabled: flow.enabled,
      cards: Object.entries(flow.cards).map(([key, card]) => ({
        key,
        type: card.type,
        id: card.id || null,
        scriptId: card.args?.script?.id || null,
        outputs: ['outputSuccess', 'outputTrue', 'outputFalse'].flatMap(
          (field) => card[field] || [],
        ),
        schedule: card.id === 'homey:manager:cron:every_nth' ? card.args : null,
      })),
    }));
  return {
    recordedAt: new Date(now).toISOString(),
    soc: capability(['measure_battery']),
    status: capability([
      'text_charging_status',
      'charging_status',
      'charge_status',
      'ladestatus',
    ]),
    charging: capability(['onoff_charging']),
    connectionFlows,
    note: 'Read-only cached capability timestamps. Fresh SOC/status does not establish a connector event or prove event delivery; no refresh/run invoked.',
  };
}

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const snapshot = await inventory(
        createReader(process.env.HOMEY_URL, process.env.HOMEY_API_TOKEN),
      );
      const result = mercedesAudit(snapshot, process.env.HOMEY_MERCEDES_ID);
      fs.writeFileSync(
        process.argv[2] || 'backup/homey/mercedes-audit.json',
        JSON.stringify(result, null, 2) + '\n',
        { mode: 0o600 },
      );
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(() => {
      console.error('Read-only Mercedes audit failed');
      process.exitCode = 1;
    });
}
module.exports = { mercedesAudit };
