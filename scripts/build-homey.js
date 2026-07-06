const fs = require('fs');
const path = require('path');

const files = [
  'src/logger/smartcharge-logger.js',
  'src/config/config.js',
  'src/core/utils.js',
  'src/core/time.js',
  'src/core/homey-logic.js',
  'src/core/charging.js',
  'src/adapters/tibber.js',
  'src/core/planner.js',
  'src/adapters/homey-devices.js',
  'src/flows/run-decision.entry.js',
];

const outFile = 'dist/SMARTCHARGE - Run Decision.js';

let output = '';

output += '// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY IN HOMEY.\n';
output += '// Source: smartcharge-homey-bundle\n\n';

for (const file of files) {
  const fullPath = path.resolve(file);

  output += `// -----------------------------------------------------------------------------\n`;
  output += `// Source file: ${file}\n`;
  output += `// -----------------------------------------------------------------------------\n\n`;
  output += fs.readFileSync(fullPath, 'utf8');
  output += '\n\n';
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output, 'utf8');

console.log(`Built: ${outFile}`);
