/**
 * SmartCharge manual helper template.
 *
 * Legacy compatibility helper; do not run alongside active Runtime Controller.
 * Normal active setup uses trustworthy event -> Connection Evidence and runtime,
 * not synthetic connection timestamps. Use this helper only for reviewed legacy
 * setup when you need a tiny standalone
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
