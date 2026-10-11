// Ephemeral source candidates for tests only; never replace the approved release.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createArtifact } = require('../../scripts/release-artifact');
function fixture(directory) {
  const buildDirectory = path.join(
    directory,
    '..',
    path.basename(directory) + '-test-build',
  );
  fs.mkdirSync(buildDirectory, { recursive: true });
  vm.runInNewContext(
    fs.readFileSync(path.resolve('scripts/build-homey.js'), 'utf8'),
    {
      require: (name) =>
        name === 'fs'
          ? {
              ...fs,
              mkdirSync() {},
              writeFileSync(file, data) {
                fs.writeFileSync(
                  path.join(buildDirectory, path.basename(file)),
                  data,
                );
              },
            }
          : require(name),
      process: {
        argv: ['node', 'build-homey.js', 'all', '--reuse-version'],
        cwd: () => process.cwd(),
      },
      console: { log() {} },
    },
  );
  return createArtifact(directory, buildDirectory);
}
module.exports = { fixture };
