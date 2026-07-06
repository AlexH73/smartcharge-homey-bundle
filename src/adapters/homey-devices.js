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
