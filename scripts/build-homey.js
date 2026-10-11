const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'run-decision';
const releaseArgumentIndex = process.argv.indexOf('--release');
const releaseVersion =
  releaseArgumentIndex >= 0 ? process.argv[releaseArgumentIndex + 1] : null;
const reuseVersion = process.argv.includes('--reuse-version');

if (releaseVersion && reuseVersion) {
  throw new Error('--release and --reuse-version cannot be used together');
}

const SRC_DIR = path.resolve('src');
const DIST_DIR = path.resolve('dist');

const TARGETS = {
  'connection-evidence': {
    entry: 'src/90-flows/connection-evidence.entry.js',
    out: 'SMARTCHARGE - Connection Evidence.js',
  },
  'runtime-controller': {
    entry: 'src/90-flows/runtime-controller.entry.js',
    out: 'SMARTCHARGE - Runtime Controller.js',
  },
  'run-decision': {
    entry: 'src/90-flows/run-decision.entry.js',
    out: 'SMARTCHARGE - Run Decision.js',
  },
  'reset-session': {
    entry: 'src/90-flows/reset-session.entry.js',
    out: 'SMARTCHARGE - Reset Session.js',
  },
  'start-session': {
    entry: 'src/90-flows/start-session.entry.js',
    out: 'SMARTCHARGE - Start Session.js',
  },
  'log-on-session': {
    entry: 'src/90-flows/log-on.entry.js',
    out: 'SMARTCHARGE - Log On.js',
  },
  'log-off-session': {
    entry: 'src/90-flows/log-off.entry.js',
    out: 'SMARTCHARGE - Log Off.js',
  },
  'state-sync': {
    entry: 'src/90-flows/state-sync.entry.js',
    out: 'SMARTCHARGE - State Sync.js',
  },
  'manual-on': {
    entry: 'src/90-flows/manual-on.entry.js',
    out: 'SMARTCHARGE - Manual Override On.js',
  },
  'manual-off': {
    entry: 'src/90-flows/manual-off.entry.js',
    out: 'SMARTCHARGE - Manual Override Off.js',
  },
  'stability-debug': {
    entry: 'src/90-flows/stability-debug.entry.js',
    out: 'SMARTCHARGE - Stability Debug.js',
  },
};

const BUILD_ALL_TARGET = 'all';
TARGETS['auto-mode'] = {
  entry: 'src/90-flows/auto-mode.entry.js',
  out: 'SMARTCHARGE - Auto Mode.js',
};
const DEFAULT_BUILD_ORDER = [
  'connection-evidence',
  'runtime-controller',
  'run-decision',
  'reset-session',
  'start-session',
  'log-on-session',
  'log-off-session',
  'state-sync',
  'manual-on',
  'manual-off',
  'auto-mode',
  'stability-debug',
];

if (target !== BUILD_ALL_TARGET && !TARGETS[target]) {
  throw new Error(`Unknown build target: ${target}`);
}

const VERSION_FILE = path.resolve('.smartcharge-build.json');
const BUILD_INFO_FILE = path.resolve(
  'src/00-config/00-build-info.generated.js',
);

function readBuildState() {
  if (!fs.existsSync(VERSION_FILE)) {
    return { major: 0, minor: 3, patch: 0, build: 0 };
  }
  return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
}

function writeBuildInfo() {
  const state = readBuildState();
  const now = new Date();

  if (reuseVersion) {
    const version = `${state.major}.${state.minor}.${state.patch}`;

    return {
      version,
      fullVersion: `${version}+build.${state.build}`,
      builtAt: now,
    };
  }

  state.build += 1;

  if (releaseVersion) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(releaseVersion);

    if (!match) {
      throw new Error(`Invalid release version: ${releaseVersion}`);
    }

    state.major = Number(match[1]);
    state.minor = Number(match[2]);
    state.patch = Number(match[3]);
  } else {
    state.patch += 1;
  }

  const version = `${state.major}.${state.minor}.${state.patch}`;
  const fullVersion = `${version}+build.${state.build}`;

  fs.writeFileSync(VERSION_FILE, JSON.stringify(state, null, 2), 'utf8');

  fs.writeFileSync(
    BUILD_INFO_FILE,
    `/**
 * Auto-generated build information.
 * Do not edit manually.
 */
const BUILD_INFO = Object.freeze({
  version: '${version}',
  fullVersion: '${fullVersion}',
  build: ${state.build},
  builtAt: '${now.toISOString()}',
});
`,
    'utf8',
  );

  return { version, fullVersion, builtAt: now };
}

function collectSharedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '90-flows') return [];
      return collectSharedFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      return [fullPath];
    }

    return [];
  });
}

function buildTarget(targetName, buildInfo) {
  const targetConfig = TARGETS[targetName];

  const files = [
    ...collectSharedFiles(SRC_DIR).sort(),
    path.resolve(targetConfig.entry),
  ];

  const outFile = path.join(DIST_DIR, targetConfig.out);

  let output = '';

  output += '// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY IN HOMEY.\n';
  output += '// Source: smartcharge-homey-bundle\n';
  output += `// Target: ${targetName}\n`;
  output += `// Version: ${buildInfo.fullVersion}\n`;
  output += `// Built at: ${buildInfo.builtAt.toISOString()}\n\n`;

  for (const file of files) {
    const relativePath = path
      .relative(process.cwd(), file)
      .replaceAll('\\', '/');

    output +=
      '// -----------------------------------------------------------------------------\n';
    output += `// Source file: ${relativePath}\n`;
    output +=
      '// -----------------------------------------------------------------------------\n\n';
    output += fs.readFileSync(file, 'utf8');
    output += '\n\n';
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(outFile, output, 'utf8');

  console.log(`Target  : ${targetName}`);
  console.log(`Files   : ${files.length}`);
  console.log(`Output  : ${path.relative(process.cwd(), outFile)}`);
}

const buildInfo = writeBuildInfo();
const targetsToBuild =
  target === BUILD_ALL_TARGET ? DEFAULT_BUILD_ORDER : [target];

console.log('SmartCharge Homey Builder');
console.log('-------------------------');
console.log(`Version : ${buildInfo.fullVersion}`);

for (const targetName of targetsToBuild) {
  buildTarget(targetName, buildInfo);
}
