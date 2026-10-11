const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = [
  'scripts/homey-deployment.js',
  'scripts/homey-discovery.js',
  'scripts/homey-flow-audit.js',
  'scripts/release-artifact.js',
  'scripts/public-safety.js',
  'scripts/verify-release-source.js',
  'scripts/build-homey.js',
  'src/00-config/00-build-info.generated.js',
  'src/00-config/10-config.js',
  '.smartcharge-build.json',
  'package.json',
  'package-lock.json',
];
function prepare(directory) {
  const destination = path.resolve(directory);
  assert.ok(
    destination.startsWith(path.join(root, 'backup') + path.sep),
    'Local staging must be inside ignored backup directory',
  );
  assert.ok(
    !fs.existsSync(destination),
    'Use a new staging directory; preserve existing files',
  );
  const entries = [
    ...files.map((file) => [file, file]),
    [
      'deployment/private-repository/smartcharge-deploy.yml',
      '.github/workflows/smartcharge-deploy.yml',
    ],
    ['.github/actionlint.yaml', '.github/actionlint.yaml'],
  ];
  for (const [source, target] of entries) {
    fs.mkdirSync(path.dirname(path.join(destination, target)), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(root, source),
      path.join(destination, target),
      fs.constants.COPYFILE_EXCL,
    );
  }
  fs.writeFileSync(
    path.join(destination, '.gitignore'),
    'backup/\nverified-artifact/\n.env*\n*.log\nnode_modules/\nmaintenance*.json\n',
  );
  fs.writeFileSync(
    path.join(destination, 'README.md'),
    '# Private SmartCharge deployment\n\nReviewed tooling snapshot for 0.6.4+build.17. No public CI workflows, Homey credentials, backups or Logic snapshots are copied. Configure private Environment approvals and source provenance variables before dispatch. Do not run build-homey.js here; deploy only approved artifact.\n',
  );
  console.log(
    'Private repository scaffold prepared locally; no GitHub repository created, no credentials/backups copied',
  );
}
if (require.main === module) {
  try {
    prepare(process.argv[2]);
  } catch {
    console.error(
      'Private scaffold refused; use a new ignored backup staging directory',
    );
    process.exitCode = 1;
  }
}
module.exports = { prepare };
