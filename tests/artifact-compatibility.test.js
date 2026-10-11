const assert = require('assert/strict');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { verifyArtifact, sha256 } = require('../scripts/release-artifact');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'smartcharge-compat-'));
const root = path.join(temporary, 'artifact');
const { fixture } = require('./helpers/release-fixture');
try {
  fixture(root);
  const baseline = path.join(temporary, 'baseline');
  fs.cpSync(root, baseline, { recursive: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json')),
  );
  const previous = manifest.version;
  manifest.version = '0.7.1+build.23';
  for (const item of manifest.bundles) {
    const file = path.join(root, item.file);
    const data = Buffer.from(
      fs.readFileSync(file, 'utf8').replaceAll(previous, manifest.version),
    );
    fs.writeFileSync(file, data);
    item.bytes = data.length;
    item.sha256 = sha256(data);
  }
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  const sums = [...manifest.bundles.map((b) => b.file), 'manifest.json']
    .sort()
    .map((f) => sha256(fs.readFileSync(path.join(root, f))) + '  ' + f + '\n')
    .join('');
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), sums);
  assert.equal(
    verifyArtifact(root, {
      tag: 'v' + manifest.version,
      manifestSha256: sha256(fs.readFileSync(path.join(root, 'manifest.json'))),
    }).version,
    manifest.version,
  );
  // Private tooling has no access to either checkout's release metadata or sources.
  const vm = require('vm');
  const script = path.resolve('scripts/release-artifact.js');
  const module = { exports: {} };
  const controlledFs = {
    ...fs,
    readFileSync(file, ...args) {
      if (
        path.resolve(file).startsWith(path.resolve('src')) ||
        path.resolve(file) === path.resolve('.smartcharge-build.json') ||
        path.resolve(file) === path.resolve('scripts/build-homey.js')
      )
        throw new Error('Private checkout source must not be read');
      return fs.readFileSync(file, ...args);
    },
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    require: (name) =>
      name === 'assert/strict'
        ? {
            ...assert,
            deepEqual(a, b, message) {
              assert.deepEqual(
                JSON.parse(JSON.stringify(a)),
                JSON.parse(JSON.stringify(b)),
                message,
              );
            },
          }
        : name === 'fs'
          ? controlledFs
          : require(require('module').createRequire(script).resolve(name)),
    __dirname: path.dirname(script),
    module,
    process,
  });
  for (const artifact of [root, baseline])
    assert.equal(module.exports.verifyArtifact(artifact).schemaVersion, 1);
  const file = path.join(root, 'manifest.json');
  const approved = {
    tag: 'v' + manifest.version,
    manifestSha256: sha256(fs.readFileSync(file)),
  };
  assert.throws(
    () => verifyArtifact(root, { ...approved, tag: 'v0.7.2+build.24' }),
    /tag\/version/,
  );
  assert.throws(
    () => verifyArtifact(root, { ...approved, manifestSha256: '0'.repeat(64) }),
    /digest/,
  );
  const saved = fs.readFileSync(file);
  for (const [field, value] of [
    ['schemaVersion', 99],
    ['thresholds', { ...manifest.thresholds, lowPowerW: 6 }],
    ['version', 'latest'],
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...manifest, [field]: value }));
    assert.throws(() => verifyArtifact(root));
    fs.writeFileSync(file, saved);
  }
  const bundle = path.join(root, manifest.bundles[0].file),
    original = fs.readFileSync(bundle);
  fs.appendFileSync(bundle, 'tampered');
  assert.throws(() => verifyArtifact(root, approved));
  fs.writeFileSync(bundle, original);
  fs.appendFileSync(file, ' ');
  assert.throws(() => verifyArtifact(root, approved));
  fs.writeFileSync(file, saved);
  // Older release bytes remain valid even after source changes in this checkout.
  assert.equal(
    verifyArtifact(baseline, {
      tag: 'v0.6.4+build.17',
      manifestSha256: sha256(
        fs.readFileSync(path.join(baseline, 'manifest.json')),
      ),
    }).version,
    '0.6.4+build.17',
  );
  console.log(
    'PASS newer/older artifacts, unsupported schema/format, corruption, changed digest and tag/version',
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
