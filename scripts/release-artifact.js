const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertPublicText } = require('./public-safety');

const root = path.resolve(__dirname, '..');
const canonical = (text) => text.replaceAll('\r\n', '\n');
const read = (file) =>
  canonical(fs.readFileSync(path.join(root, file), 'utf8'));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function targets() {
  const matches = [
    ...read('scripts/build-homey.js').matchAll(
      /(?:'([^']+)':|TARGETS\['([^']+)'\] =)\s*{\s*entry: '([^']+)',\s*out: '([^']+)'/g,
    ),
  ];
  const result = matches.map((match) => ({
    target: match[1] || match[2],
    entry: match[3],
    file: match[4],
  }));
  assert.equal(result.length, 12, 'Expected all 12 HomeyScript targets');
  return result;
}

function releaseInfo() {
  const state = JSON.parse(read('.smartcharge-build.json'));
  const metadata = read('src/00-config/00-build-info.generated.js');
  const version = `${state.major}.${state.minor}.${state.patch}`;
  const fullVersion = `${version}+build.${state.build}`;
  assert.ok(metadata.includes(`fullVersion: '${fullVersion}'`));
  assert.ok(metadata.includes(`version: '${version}'`));
  assert.ok(metadata.includes(`build: ${state.build},`));
  const builtAt = /builtAt: '([^']+)'/.exec(metadata)?.[1];
  assert.ok(Number.isFinite(Date.parse(builtAt)), 'Invalid release timestamp');
  assert.equal(JSON.parse(read('package.json')).version, version);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  const config = new Function(
    read('src/00-config/10-config.js') + '\nreturn CONFIG;',
  )();
  const thresholds = {
    lowPowerW: config.manualLowPowerW,
    observationGapSeconds: config.manualObservationGapSeconds,
    maximumDurationMinutes: config.manualMaximumDurationMinutes,
    powerFreshnessSeconds: config.manualPowerFreshnessSeconds,
    lowPowerSeconds: config.manualLowPowerSeconds,
  };
  assert.deepEqual(thresholds, {
    lowPowerW: 5,
    observationGapSeconds: 360,
    maximumDurationMinutes: 360,
    powerFreshnessSeconds: 60,
    lowPowerSeconds: 180,
  });
  return { version: fullVersion, builtAt, thresholds };
}

function sharedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === '90-flows' ? [] : sharedFiles(file);
    return entry.name.endsWith('.js')
      ? [path.relative(root, file).replaceAll('\\', '/')]
      : [];
  });
}

function validateBuild() {
  const info = releaseInfo();
  const shared = sharedFiles(path.join(root, 'src')).sort();
  const bundles = targets().map((target) => {
    let expected = '// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY IN HOMEY.\n';
    expected += `// Source: smartcharge-homey-bundle\n// Target: ${target.target}\n`;
    expected += `// Version: ${info.version}\n// Built at: ${info.builtAt}\n\n`;
    for (const file of [...shared, target.entry]) {
      expected +=
        '// -----------------------------------------------------------------------------\n';
      expected += `// Source file: ${file}\n`;
      expected +=
        '// -----------------------------------------------------------------------------\n\n' +
        read(file) +
        '\n\n';
    }
    const data = fs.readFileSync(path.join(root, 'dist', target.file));
    assert.equal(
      data.toString('utf8'),
      expected,
      'Source mismatch: ' + target.file,
    );
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    new AsyncFunction('Homey', 'fetch', 'log', expected);
    return {
      target: target.target,
      file: target.file,
      sha256: sha256(data),
      bytes: data.length,
    };
  });
  const sourceFiles = [
    ...new Set([...shared, ...targets().map((target) => target.entry)]),
  ].sort();
  const sourceDigest = sha256(
    sourceFiles.map((file) => file + '\0' + read(file)).join('\0'),
  );
  return { schemaVersion: 1, ...info, sourceDigest, bundles };
}

function checksumFile(directory, manifest) {
  return [...manifest.bundles.map((bundle) => bundle.file), 'manifest.json']
    .sort()
    .map(
      (file) =>
        `${sha256(fs.readFileSync(path.join(directory, file)))}  ${file}\n`,
    )
    .join('');
}

function verifyArtifact(directory) {
  const info = releaseInfo();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.version, info.version);
  assert.equal(manifest.builtAt, info.builtAt);
  assert.deepEqual(manifest.thresholds, info.thresholds);
  assert.match(manifest.sourceDigest, /^[a-f0-9]{64}$/);
  const expected = targets();
  assert.equal(manifest.bundles.length, expected.length);
  assert.deepEqual(
    manifest.bundles.map(({ target, file }) => ({ target, file })),
    expected.map(({ target, file }) => ({ target, file })),
  );
  const expectedFiles = [
    ...expected.map((target) => target.file),
    'manifest.json',
    'SHA256SUMS',
  ].sort();
  for (const name of expectedFiles) {
    const stat = fs.lstatSync(path.join(directory, name));
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink(),
      'Artifact must contain only regular files',
    );
  }
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    expectedFiles,
    'Unexpected artifact files',
  );
  for (const name of expectedFiles)
    assertPublicText(name, fs.readFileSync(path.join(directory, name), 'utf8'));
  for (const bundle of manifest.bundles) {
    const file = path.join(directory, bundle.file);
    assert.ok(
      fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(),
    );
    const data = fs.readFileSync(file);
    assert.equal(data.length, bundle.bytes);
    assert.equal(
      sha256(data),
      bundle.sha256,
      'Checksum mismatch: ' + bundle.file,
    );
    assert.ok(data.toString('utf8').includes(`// Version: ${info.version}\n`));
    assert.ok(data.toString('utf8').includes(`// Target: ${bundle.target}\n`));
  }
  assert.equal(
    fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8'),
    checksumFile(directory, manifest),
  );
  return manifest;
}

function createArtifact(directory) {
  const manifest = validateBuild();
  fs.mkdirSync(directory, { recursive: true });
  const files = manifest.bundles.map((bundle) => ({
    name: bundle.file,
    data: fs.readFileSync(path.join(root, 'dist', bundle.file)),
  }));
  files.push({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
  });
  for (const file of files) {
    const destination = path.join(directory, file.name);
    if (fs.existsSync(destination))
      assert.deepEqual(
        fs.readFileSync(destination),
        file.data,
        'Refusing to replace a different artifact',
      );
    else fs.writeFileSync(destination, file.data, { flag: 'wx' });
  }
  const sums = checksumFile(directory, manifest);
  const sumsFile = path.join(directory, 'SHA256SUMS');
  if (fs.existsSync(sumsFile))
    assert.equal(fs.readFileSync(sumsFile, 'utf8'), sums);
  else fs.writeFileSync(sumsFile, sums, { flag: 'wx' });
  return verifyArtifact(directory);
}

if (require.main === module) {
  try {
    const command = process.argv[2];
    const directory = path.resolve(
      process.argv[3] || path.join(root, 'dist', 'release'),
    );
    const manifest =
      command === 'create'
        ? createArtifact(directory)
        : command === 'verify'
          ? verifyArtifact(directory)
          : command === 'validate-build'
            ? validateBuild()
            : null;
    assert.ok(
      manifest,
      'Usage: node scripts/release-artifact.js create|verify|validate-build [directory]',
    );
    console.log(
      `PASS ${manifest.version}: ${manifest.bundles.length} bundles; SHA-256 and release metadata verified`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  validateBuild,
  createArtifact,
  verifyArtifact,
  targets,
  sha256,
};
