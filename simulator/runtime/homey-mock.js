const {
  DEFAULT_DEVICES,
  DEFAULT_LOGIC_VARIABLES,
  deepClone,
} = require('./default-state');

function toLogicVariableEntries(values) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        id: name,
        name,
        value,
      },
    ]),
  );
}

class MockDevice {
  constructor(device) {
    this.id = device.id;
    this.name = device.name;
    this.capabilitiesObj = deepClone(device.capabilitiesObj || {});
    this.commands = [];
  }

  async setCapabilityValue(capability, value) {
    this.commands.push({
      capability,
      value,
      calledAt: new Date().toISOString(),
    });

    if (!this.capabilitiesObj[capability]) {
      this.capabilitiesObj[capability] = {};
    }

    this.capabilitiesObj[capability].value = value;
  }
}

class HomeyMock {
  constructor(initialState = {}) {
    const logicValues = {
      ...deepClone(DEFAULT_LOGIC_VARIABLES),
      ...(initialState.logic || {}),
    };

    const deviceOverrides = initialState.devices || {};
    const devices = deepClone(DEFAULT_DEVICES);

    for (const [deviceKey, override] of Object.entries(deviceOverrides)) {
      if (!devices[deviceKey]) {
        devices[deviceKey] = {
          id: `local-${deviceKey}`,
          name: deviceKey,
          capabilitiesObj: {},
        };
      }

      devices[deviceKey] = mergeDevice(devices[deviceKey], override);
    }

    this.logicVariables = toLogicVariableEntries(logicValues);
    this.devices = Object.fromEntries(
      Object.entries(devices).map(([key, device]) => [
        key,
        new MockDevice(device),
      ]),
    );

    this.api = {
      logic: {
        getVariables: async () => this.logicVariables,
        updateVariable: async ({ id, variable }) => {
          if (!this.logicVariables[id]) {
            throw new Error(`Logic variable not found: ${id}`);
          }

          this.logicVariables[id].value = variable.value;
        },
      },
      devices: {
        getDevices: async () => this.devices,
      },
    };
  }

  setLogicValues(values = {}) {
    for (const [name, value] of Object.entries(values)) {
      if (!this.logicVariables[name]) {
        this.logicVariables[name] = {
          id: name,
          name,
          value,
        };
        continue;
      }

      this.logicVariables[name].value = value;
    }
  }

  setDeviceState(deviceKey, patch = {}) {
    const device = this.devices[deviceKey];

    if (!device) {
      throw new Error(`Mock device not found: ${deviceKey}`);
    }

    if (patch.name) {
      device.name = patch.name;
    }

    if (patch.capabilitiesObj) {
      for (const [capability, value] of Object.entries(patch.capabilitiesObj)) {
        device.capabilitiesObj[capability] = normalizeCapabilityValue(value);
      }
    }
  }

  getLogicValue(name) {
    return this.logicVariables[name]?.value;
  }

  getLogicSnapshot() {
    return Object.fromEntries(
      Object.values(this.logicVariables).map((variable) => [
        variable.name,
        variable.value,
      ]),
    );
  }

  getDeviceSnapshot() {
    return Object.fromEntries(
      Object.entries(this.devices).map(([key, device]) => [
        key,
        {
          id: device.id,
          name: device.name,
          capabilitiesObj: deepClone(device.capabilitiesObj),
          commands: deepClone(device.commands),
        },
      ]),
    );
  }
}

function mergeDevice(base, override) {
  const result = {
    ...base,
    ...override,
    capabilitiesObj: {
      ...(base.capabilitiesObj || {}),
    },
  };

  if (override.capabilitiesObj) {
    for (const [capability, value] of Object.entries(override.capabilitiesObj)) {
      result.capabilitiesObj[capability] = normalizeCapabilityValue(value);
    }
  }

  return result;
}

function normalizeCapabilityValue(value) {
  if (
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  ) {
    return deepClone(value);
  }

  return {
    value,
  };
}

module.exports = {
  HomeyMock,
  MockDevice,
};
