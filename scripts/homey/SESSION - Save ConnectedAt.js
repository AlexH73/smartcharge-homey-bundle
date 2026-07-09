/**
 * SmartCharge manual helper template.
 *
 * Prefer the generated `dist/SMARTCHARGE - Start Session.js` script for the
 * normal production flow. Use this helper only when you need a tiny standalone
 * HomeyScript that stores the current connection timestamp.
 *
 * Replace all YOUR_* placeholders before using this in Homey.
 */

const CHARGE_CONNECTED_AT_VARIABLE_NAME = 'YOUR_HOMEY_VARIABLE_NAME';
const TIME_ZONE = 'YOUR_TIME_ZONE'; // Example: Europe/Berlin

async function getVariableByName(name) {
  const variables = await Homey.logic.getVariables();
  const variable = Object.values(variables).find((item) => item.name === name);

  if (!variable) {
    throw new Error(`Logic variable not found: ${name}`);
  }

  return variable;
}

async function updateVariableByName(name, value) {
  const variable = await getVariableByName(name);

  await Homey.logic.updateVariable({
    id: variable.id,
    variable: { value },
  });
}

function formatLocal(date) {
  return date.toLocaleString('sv-SE', {
    timeZone: TIME_ZONE,
    hour12: false,
  });
}

const connectedAt = formatLocal(new Date());

await updateVariableByName(CHARGE_CONNECTED_AT_VARIABLE_NAME, connectedAt);

log(`Saved ${CHARGE_CONNECTED_AT_VARIABLE_NAME}: ${connectedAt}`);

return {
  variableName: CHARGE_CONNECTED_AT_VARIABLE_NAME,
  connectedAt,
};
