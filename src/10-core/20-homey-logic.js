/**
 * Finds a Homey Logic variable by name.
 *
 * @param {string} name
 * @returns {Promise<object>}
 */
async function getVariableByName(name) {
  const variables = await Homey.logic.getVariables();
  const variable = Object.values(variables).find((v) => v.name === name);

  if (!variable) {
    throw new Error(`Logic variable not found: ${name}`);
  }

  return variable;
}

/**
 * Reads a Homey Logic variable value by name.
 *
 * @param {string} name
 * @returns {Promise<unknown>}
 */
async function getVariableValue(name) {
  const variable = await getVariableByName(name);
  return variable.value;
}

/**
 * Updates a Homey Logic variable by name.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function updateVariableByName(name, value) {
  const variable = await getVariableByName(name);

  await Homey.logic.updateVariable({
    id: variable.id,
    variable: { value },
  });
}

/**
 * Updates a Homey Logic variable if it exists.
 * Missing optional variables do not break SmartCharge.
 *
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function tryUpdateVariableByName(name, value) {
  try {
    await updateVariableByName(name, value);
  } catch (error) {
    log(`Optional variable not updated: ${name} (${error.message})`);
  }
}
