/**
 * Finds a Homey device by partial name match.
 *
 * @param {string} namePart
 * @returns {Promise<object>}
 */
async function getDeviceByNamePart(namePart) {
  const devices = await Homey.devices.getDevices();
  const normalizedNamePart = normalizeName(namePart);
  const deviceList = Object.values(devices);

  const exactMatches = deviceList.filter((device) =>
    normalizeName(device.name) === normalizedNamePart,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throwMultipleDevicesFound(namePart, exactMatches);
  }

  const partialMatches = deviceList.filter((d) =>
    normalizeName(d.name).includes(normalizedNamePart),
  );

  if (partialMatches.length === 0) {
    throw new Error(`Device not found: ${namePart}`);
  }

  if (partialMatches.length > 1) {
    throwMultipleDevicesFound(namePart, partialMatches);
  }

  return partialMatches[0];
}

function throwMultipleDevicesFound(namePart, devices) {
  throw new Error(
    `Multiple devices found for "${namePart}": ` +
      devices.map((device) => device.name).join(', '),
  );
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
