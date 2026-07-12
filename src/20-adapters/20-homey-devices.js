/**
 * Finds a Homey device by partial name match.
 *
 * @param {string} namePart
 * @returns {Promise<object>}
 */
async function getDeviceByNamePart(namePart) {
  const devices = await Homey.devices.getDevices();
  const normalizedNamePart = normalizeName(namePart);

  const device = Object.values(devices).find((d) =>
    normalizeName(d.name).includes(normalizedNamePart),
  );

  if (!device) {
    throw new Error(`Device not found: ${namePart}`);
  }

  return device;
}

/**
 * Switches a Homey device on.
 *
 * @param {object} device
 * @returns {Promise<void>}
 */
async function setDeviceOn(device) {
  await device.setCapabilityValue('onoff', true);
}

/**
 * Switches a Homey device off.
 *
 * @param {object} device
 * @returns {Promise<void>}
 */
async function setDeviceOff(device) {
  await device.setCapabilityValue('onoff', false);
}

/**
 * Reads a Homey capability value from either Homey capability object shape or
 * a primitive simulator/test value.
 *
 * @param {object} device
 * @param {string} capabilityName
 * @returns {unknown}
 */
function getCapabilityValue(device, capabilityName) {
  const capability = device.capabilitiesObj?.[capabilityName];

  if (
    capability &&
    typeof capability === 'object' &&
    Object.prototype.hasOwnProperty.call(capability, 'value')
  ) {
    return capability.value;
  }

  return capability;
}
