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
    this.failSetCapabilityValue = Boolean(device.failSetCapabilityValue);
    this.commands = [];
  }

  async setCapabilityValue(capability, value) {
    if (this.failSetCapabilityValue) {
      throw new Error(`setCapabilityValue failed: ${this.name}.${capability}`);
    }

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
    for (const name of initialState.missingLogicVariables || []) {
      delete this.logicVariables[name];
    }
    this.failLogicUpdateVariableNames = new Set(
      initialState.failLogicUpdateVariableNames || [],
    );
    this.logicUpdateCounts = {};
    this.failLogicGetVariables = Boolean(initialState.failLogicGetVariables);
    this.failGetDevices = Boolean(initialState.failGetDevices);
    this.devices = Object.fromEntries(
      Object.entries(devices).map(([key, device]) => [
        key,
        new MockDevice(device),
      ]),
    );

    this.api = {
      logic: {
        getVariables: async () => {
          if (this.failLogicGetVariables) {
            throw new Error('getVariables failed');
          }
          return this.logicVariables;
        },
        updateVariable: async ({ id, variable }) => {
          if (!this.logicVariables[id]) {
            throw new Error(`Logic variable not found: ${id}`);
          }
          if (this.failLogicUpdateVariableNames.has(id)) {
            throw new Error(`updateVariable failed: ${id}`);
          }

          this.logicVariables[id].value = variable.value;
          this.logicUpdateCounts[id] = (this.logicUpdateCounts[id] || 0) + 1;
        },
      },
      devices: {
        getDevices: async () => {
          if (this.failGetDevices) throw new Error('getDevices failed');
          return this.devices;
        },
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

    if (patch.failSetCapabilityValue !== undefined) {
      device.failSetCapabilityValue = Boolean(patch.failSetCapabilityValue);
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

  getLogicUpdateCounts() {
    return Object.fromEntries(
      Object.keys(this.logicVariables).map((name) => [
        name,
        this.logicUpdateCounts[name] || 0,
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
    for (const [capability, value] of Object.entries(
      override.capabilitiesObj,
    )) {
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
