const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve('src');
const OUT_FILE = path.resolve('dist/SMARTCHARGE - Run Decision.js');
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
  state.build += 1;
  state.patch += 1;

  const now = new Date();
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

  return { version, fullVersion, build: state.build, builtAt: now };
}

function collectJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectJsFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      return [fullPath];
    }

    return [];
  });
}

const buildInfo = writeBuildInfo();
const files = collectJsFiles(SRC_DIR).sort();

let output = '';

output += '// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY IN HOMEY.\n';
output += '// Source: smartcharge-homey-bundle\n';
output += `// Version: ${buildInfo.fullVersion}\n`;
output += `// Built at: ${buildInfo.builtAt.toISOString()}\n\n`;

for (const file of files) {
  const relativePath = path.relative(process.cwd(), file).replaceAll('\\', '/');

  output +=
    '// -----------------------------------------------------------------------------\n';
  output += `// Source file: ${relativePath}\n`;
  output +=
    '// -----------------------------------------------------------------------------\n\n';
  output += fs.readFileSync(file, 'utf8');
  output += '\n\n';
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, output, 'utf8');

console.log('SmartCharge Homey Builder');
console.log('-------------------------');
console.log(`Version : ${buildInfo.fullVersion}`);
console.log(`Files   : ${files.length}`);
console.log(`Output  : ${path.relative(process.cwd(), OUT_FILE)}`);
console.log('');
console.log('Built files:');

for (const file of files) {
  console.log(`- ${path.relative(process.cwd(), file)}`);
}
