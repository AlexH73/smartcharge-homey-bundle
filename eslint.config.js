const eslint = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

const homeyScriptGlobals = {
  Homey: 'readonly',
  args: 'readonly',
  fetch: 'readonly',
  log: 'readonly',
};

const sharedBundleGlobals = {
  BUILD_INFO: 'readonly',
  CONFIG: 'readonly',
  ENGINE_VERSION: 'readonly',
  SmartChargeLogger: 'readonly',
  TIBBER_PRICE_INFO_QUERY: 'readonly',
  addMinutes: 'readonly',
  allocateChargingMinutes: 'readonly',
  buildChargeWindows: 'readonly',
  calculateChargeMinutes: 'readonly',
  calculateChargeSlots: 'readonly',
  calculateHoursAhead: 'readonly',
  clamp: 'readonly',
  collectAvailableSlots: 'readonly',
  createChargePlan: 'readonly',
  createChargeWindow: 'readonly',
  findCheapestContinuousPlan: 'readonly',
  findCheapestMultiWindowPlan: 'readonly',
  fetchTibberPriceInfo: 'readonly',
  formatChargeWindowsText: 'readonly',
  formatLocal: 'readonly',
  getCapabilityValue: 'readonly',
  getDeviceByNamePart: 'readonly',
  getExpiredSessionReason: 'readonly',
  getPlanSlots: 'readonly',
  getTargetDeparture: 'readonly',
  getVariableValue: 'readonly',
  isChargingSessionExpired: 'readonly',
  isNowInsidePlan: 'readonly',
  isSafetyStartRequired: 'readonly',
  isSlotAvailable: 'readonly',
  mergeAdjacentSlots: 'readonly',
  normalizeName: 'readonly',
  normalizeTibberPrices: 'readonly',
  parseDateOrFallback: 'readonly',
  roundUp: 'readonly',
  selectBestChargePlan: 'readonly',
  selectChargePlan: 'readonly',
  selectCheapestSlots: 'readonly',
  serializeChargeWindows: 'readonly',
  setDeviceOff: 'readonly',
  setDeviceOn: 'readonly',
  sortSlotsByTime: 'readonly',
  toNumberValue: 'readonly',
  tryUpdateVariableByName: 'readonly',
  updateVariableByName: 'readonly',
  validateAcceptedStrategyAnchor: 'readonly',
  projectAcceptedStrategy: 'readonly',
  projectCandidatePlan: 'readonly',
  compareProjectedStrategies: 'readonly',
  calculateReplacementEconomics: 'readonly',
  decidePlanStability: 'readonly',
  estimatePlanCosts: 'readonly',
  TELEMETRY_HEALTH: 'readonly',
  TELEMETRY_FRESHNESS: 'readonly',
  RUNTIME_STATES: 'readonly',
  canCreateSession: 'readonly',
  deriveDesiredPlugState: 'readonly',
  deriveRuntimeState: 'readonly',
  evaluateCompletionEvidence: 'readonly',
  evaluateTelemetryHealth: 'readonly',
  evaluateTelemetryFreshness: 'readonly',
  evaluateDisconnectEvidence: 'readonly',
  hasTrustworthyConnectionEvidence: 'readonly',
  isSuspectedDisconnect: 'readonly',
  isVehicleConnectedStatus: 'readonly',
  runRuntimeController: 'readonly',
  runCanonicalDecision: 'readonly',
};

const googleAppsScriptGlobals = {
  ContentService: 'readonly',
  PropertiesService: 'readonly',
  ScriptApp: 'readonly',
  SpreadsheetApp: 'readonly',
  UrlFetchApp: 'readonly',
};

const homeyScriptProcessor = {
  preprocess(text) {
    return [
      text.replace(/\bawait\b/g, (keyword) => ' '.repeat(keyword.length)),
    ];
  },
  postprocess(messageLists) {
    return messageLists.flat();
  },
};

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'backup/**',
      'simulator/logs/**',
      'src/00-config/00-build-info.generated.js',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...homeyScriptGlobals,
        ...sharedBundleGlobals,
      },
      parserOptions: {
        allowAwaitOutsideFunction: true,
        ecmaFeatures: {
          globalReturn: true,
        },
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-shadow': 'error',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/90-flows/**/*.js', 'scripts/homey/**/*.js'],
    processor: homeyScriptProcessor,
    languageOptions: {
      globals: homeyScriptGlobals,
      parserOptions: {
        allowAwaitOutsideFunction: true,
        ecmaFeatures: {
          globalReturn: true,
        },
      },
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    files: ['scripts/google-apps-script/**/*.gs', 'scripts/tibber/**/*.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...googleAppsScriptGlobals,
        console: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-shadow': 'error',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(createTibberTrigger|doPost|setupSmartChargeWorkbook|updateTibberPrices)$',
        },
      ],
    },
  },
  {
    files: [
      'eslint.config.js',
      'scripts/**/*.js',
      'simulator/**/*.js',
      'tests/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-shadow': 'error',
    },
  },
  prettier,
];
