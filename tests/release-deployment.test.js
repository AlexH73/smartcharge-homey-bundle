const { fixture: createArtifact } = require('./helpers/release-fixture');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  verifyArtifact,
  targets,
  sha256,
} = require('../scripts/release-artifact');
const {
  createReader,
  secureUrl,
  replacementPlan,
  discover,
} = require('../scripts/homey-discovery');

const root = path.resolve(__dirname, '..');
const secureAddress = 'https://192-168-178-79.homey.homeylocal.com';

function buildAt(fakeNow, crlf) {
  const output = new Map();
  const filesystem = {
    ...fs,
    readFileSync(file, encoding) {
      const data = fs.readFileSync(file, encoding);
      return crlf && typeof data === 'string'
        ? data.replace(/\r?\n/g, '\r\n')
        : data;
    },
    mkdirSync() {},
    writeFileSync(file, data) {
      output.set(path.basename(file), data);
    },
  };
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fakeNow]));
    }
  }
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'scripts/build-homey.js'), 'utf8'),
    {
      require: (name) => (name === 'fs' ? filesystem : require(name)),
      process: {
        argv: ['node', 'build-homey.js', 'all', '--reuse-version'],
        cwd: () => root,
      },
      Date: FixedDate,
      console: { log() {} },
    },
  );
  return output;
}

async function main() {
  const first = buildAt('2026-10-11T12:00:00Z', false);
  const second = buildAt('2026-10-12T12:00:00Z', true);
  assert.equal(first.size, 12);
  assert.deepEqual(
    [...first],
    [...second],
    'Reuse build differs by clock or CRLF checkout',
  );
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smartcharge-release-'),
  );
  try {
    // Populate a local test artifact from production builder output, without touching dist.
    const directory = path.join(temporary, 'artifact');
    const manifest = createArtifact(directory);
    assert.deepEqual(verifyArtifact(directory), manifest);
    assert.deepEqual(createArtifact(directory), manifest);
    const file = path.join(directory, manifest.bundles[0].file);
    const original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n// tampered');
    assert.throws(() => verifyArtifact(directory));
    fs.writeFileSync(file, original);
    fs.writeFileSync(path.join(directory, 'extra.js'), 'unexpected');
    assert.throws(() => verifyArtifact(directory));
    fs.unlinkSync(path.join(directory, 'extra.js'));

    for (const address of [
      'http://192.168.178.79',
      'https://example.com',
      'https://user:secret@192-168-178-79.homey.homeylocal.com',
    ]) {
      assert.throws(() => secureUrl(address));
    }
    const requests = [];
    const get = createReader(
      secureAddress,
      'TEST_KEY',
      async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => ({}) };
      },
    );
    await get('/api/app/com.athom.homeyscript/script');
    assert.equal(requests[0].options.method, 'GET');
    assert.equal(requests[0].options.redirect, 'error');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer TEST_KEY');
    await assert.rejects(
      get('/api/app/com.athom.homeyscript/script/example/run'),
    );
    assert.equal(requests.length, 1);
    const denied = createReader(secureAddress, 'TEST_KEY', async () => ({
      ok: false,
      status: 403,
    }));
    await assert.rejects(
      denied('/api/app/com.athom.homeyscript/script'),
      /HTTP 403/,
    );

    const scripts = Object.fromEntries(
      targets().map((target, index) => [
        `id-${index}`,
        {
          id: `id-${index}`,
          name: target.file.replace(/\.js$/, ''),
          version: 2,
          code: fs.readFileSync(path.join(directory, target.file), 'utf8'),
        },
      ]),
    );
    assert.equal(
      replacementPlan(manifest, scripts, directory).filter(
        (entry) => entry.changed,
      ).length,
      0,
    );
    scripts['id-0'].code = '// Version: 0.6.3+build.16\nold';
    assert.equal(
      replacementPlan(manifest, scripts, directory).filter(
        (entry) => entry.changed,
      ).length,
      1,
    );
    const duplicate = {
      ...scripts,
      duplicate: { ...scripts['id-0'], id: 'duplicate' },
    };
    assert.throws(() => replacementPlan(manifest, duplicate, directory));
    const incomplete = { ...scripts };
    delete incomplete['id-0'];
    assert.throws(() => replacementPlan(manifest, incomplete, directory));

    const inventoryRequests = [];
    const report = await discover(
      directory,
      path.join(temporary, 'backup'),
      async (endpoint) => {
        inventoryRequests.push(endpoint);
        if (endpoint === '/api/manager/apps/app/com.athom.homeyscript')
          return { version: '3.6.3' };
        if (endpoint === '/api/app/com.athom.homeyscript/script')
          return scripts;
        if (endpoint.startsWith('/api/app/com.athom.homeyscript/script/'))
          return scripts[endpoint.split('/').at(-1)];
        if (endpoint === '/api/manager/logic/variable')
          return {
            secret: {
              name: 'TIBBER_ACCESS_TOKEN',
              value: 'NEVER_BACK_UP_CREDENTIAL',
            },
            manual: { name: 'SmartChargeManualState', value: '{}' },
          };
        return {};
      },
    );
    assert.equal(report.changedBundles.length, 1);
    assert.equal(report.productionWriteEnabled, false);
    const backupDir = path.join(
      temporary,
      'backup',
      fs.readdirSync(path.join(temporary, 'backup'))[0],
    );
    const backup = fs.readFileSync(path.join(backupDir, 'snapshot.json'));
    assert.equal(backup.toString().includes('NEVER_BACK_UP_CREDENTIAL'), false);
    assert.equal(
      fs.readFileSync(path.join(backupDir, 'snapshot.sha256'), 'utf8').trim(),
      sha256(backup),
    );
    assert.ok(
      inventoryRequests.every((endpoint) => !endpoint.includes('/run')),
    );
    console.log(
      'PASS reproducible release builds, artifact tampering, GET-only discovery, mapping and private backup',
    );
  } finally {
    // Only the exact mkdtemp directory created by this test is removed.
    assert.ok(
      path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
