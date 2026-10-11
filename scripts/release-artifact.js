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

// Schema 1 is an explicit supported artifact format, independent of checkout targets.
const artifactTargets = [
  {
    target: 'connection-evidence',
    file: 'SMARTCHARGE - Connection Evidence.js',
  },
  {
    target: 'runtime-controller',
    file: 'SMARTCHARGE - Runtime Controller.js',
  },
  {
    target: 'run-decision',
    file: 'SMARTCHARGE - Run Decision.js',
  },
  {
    target: 'reset-session',
    file: 'SMARTCHARGE - Reset Session.js',
  },
  {
    target: 'start-session',
    file: 'SMARTCHARGE - Start Session.js',
  },
  {
    target: 'log-on-session',
    file: 'SMARTCHARGE - Log On.js',
  },
  {
    target: 'log-off-session',
    file: 'SMARTCHARGE - Log Off.js',
  },
  {
    target: 'state-sync',
    file: 'SMARTCHARGE - State Sync.js',
  },
  {
    target: 'manual-on',
    file: 'SMARTCHARGE - Manual Override On.js',
  },
  {
    target: 'manual-off',
    file: 'SMARTCHARGE - Manual Override Off.js',
  },
  {
    target: 'stability-debug',
    file: 'SMARTCHARGE - Stability Debug.js',
  },
  {
    target: 'auto-mode',
    file: 'SMARTCHARGE - Auto Mode.js',
  },
];
function releaseVersion(tag) {
  assert.equal(typeof tag, 'string');
  assert.match(
    tag,
    /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\+build\.(?:[1-9]\d*)$/,
  );
  return tag.replace(/^v/, '');
}
function checkApproval(manifestData, approved) {
  assert.ok(
    approved,
    'Independently approved manifest digest and tag required',
  );
  assert.match(approved.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    sha256(manifestData),
    approved.manifestSha256,
    'Approved manifest digest mismatch',
  );
  const manifest = JSON.parse(manifestData.toString('utf8'));
  assert.equal(
    manifest.version,
    releaseVersion(approved.tag),
    'Approved release tag/version mismatch',
  );
}

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

function validateBuild(directory = path.join(root, 'dist')) {
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
    const data = fs.readFileSync(path.join(directory, target.file));
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

function verifyArtifact(directory, approved = null) {
  const manifestFile = path.join(directory, 'manifest.json');
  assert.ok(
    fs.lstatSync(manifestFile).isFile() &&
      !fs.lstatSync(manifestFile).isSymbolicLink(),
  );
  const manifestData = fs.readFileSync(manifestFile);
  if (approved) checkApproval(manifestData, approved);
  const manifest = JSON.parse(manifestData.toString('utf8'));
  const info = manifest;
  assert.equal(releaseVersion(manifest.version), manifest.version);
  assert.ok(
    Number.isFinite(Date.parse(manifest.builtAt)),
    'Invalid artifact timestamp',
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.thresholds, {
    lowPowerW: 5,
    observationGapSeconds: 360,
    maximumDurationMinutes: 360,
    powerFreshnessSeconds: 60,
    lowPowerSeconds: 180,
  });
  assert.match(manifest.sourceDigest, /^[a-f0-9]{64}$/);
  const expected = artifactTargets;
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
    assert.match(bundle.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(bundle.bytes) && bundle.bytes > 0);
    const data = fs.readFileSync(file);
    assert.equal(data.length, bundle.bytes);
    assert.equal(
      sha256(data),
      bundle.sha256,
      'Checksum mismatch: ' + bundle.file,
    );
    assert.ok(data.toString('utf8').includes(`// Version: ${info.version}\n`));
    assert.ok(data.toString('utf8').includes(`// Target: ${bundle.target}\n`));
    assert.ok(
      data.toString('utf8').includes(`// Built at: ${manifest.builtAt}\n`),
    );
  }
  assert.equal(
    fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8'),
    checksumFile(directory, manifest),
  );
  return manifest;
}

function createArtifact(directory, buildDirectory = path.join(root, 'dist')) {
  const manifest = validateBuild(buildDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const files = manifest.bundles.map((bundle) => ({
    name: bundle.file,
    data: fs.readFileSync(path.join(buildDirectory, bundle.file)),
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
          ? verifyArtifact(directory, {
              manifestSha256: process.argv[4],
              tag: process.argv[5],
            })
          : command === 'inspect'
            ? verifyArtifact(directory)
            : command === 'validate-build'
              ? validateBuild()
              : null;
    assert.ok(
      manifest,
      'Usage: node scripts/release-artifact.js create|inspect|verify|validate-build [directory] [approved-manifest-sha256] [approved-tag]',
    );
    console.log(
      `PASS ${manifest.version}: ${manifest.bundles.length} bundles; ${command === 'inspect' ? 'integrity only; source not authenticated' : 'SHA-256 and release metadata verified'}`,
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
  releaseVersion,
  checkApproval,
};
