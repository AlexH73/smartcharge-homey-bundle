// GET-only discovery. There is deliberately no script/Flow/device write transport.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { verifyArtifact, sha256 } = require('./release-artifact');

const appId = 'com.athom.homeyscript';
const appPath = `/api/app/${appId}/script`;
const readPaths = new Set([
  `/api/manager/apps/app/${appId}`,
  '/api/manager/system/',
  '/api/manager/devices/device/',
  '/api/manager/flow/flow',
  '/api/manager/flow/advancedflow',
  '/api/manager/logic/variable',
  appPath,
]);

function secureUrl(address) {
  const url = new URL(address);
  assert.equal(url.protocol, 'https:', 'Local Secure HTTPS is required');
  assert.match(
    url.hostname,
    /^\d{1,3}(?:-\d{1,3}){3}\.homey\.homeylocal\.com$/,
  );
  assert.ok(
    url.hostname
      .split('.')[0]
      .split('-')
      .every((part) => Number(part) <= 255),
  );
  assert.equal(url.port, '');
  assert.equal(url.pathname, '/');
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.notEqual(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    '0',
    'TLS verification must remain enabled',
  );
  return url.origin;
}

function createReader(address, token, fetchImpl = fetch) {
  const origin = secureUrl(address);
  assert.ok(
    typeof token === 'string' && token.trim(),
    'HOMEY_API_TOKEN is not set; use the documented masked local setup',
  );
  const get = async function (endpoint) {
    assert.ok(
      readPaths.has(endpoint) ||
        /^\/api\/app\/com\.athom\.homeyscript\/script\/[^/]+$/.test(endpoint),
      'Endpoint is not in the read-only inventory',
    );
    let response;
    try {
      response = await fetchImpl(origin + endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      // Never expose provider errors, response bodies or credential-bearing objects.
      throw new Error(
        'Local Secure request failed; check connectivity and TLS',
      );
    }
    if (!response.ok)
      throw new Error(`Homey read-only API returned HTTP ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error('Homey API returned invalid JSON');
    }
  };
  get.origin = origin;
  return get;
}

function selectScript(scripts, expectedName) {
  const matches = Object.values(scripts).filter(
    (script) =>
      script.name === expectedName || script.name === expectedName + '.js',
  );
  assert.equal(
    matches.length,
    1,
    'Missing or ambiguous existing HomeyScript: ' + expectedName,
  );
  return matches[0];
}

function replacementPlan(manifest, scripts, directory, approvedScripts = null) {
  const values = Object.values(scripts);
  if (approvedScripts !== null)
    assert.deepEqual(
      Object.keys(approvedScripts).sort(),
      manifest.bundles.map((bundle) => bundle.file).sort(),
      'Explicit selection must cover exactly the release bundle set',
    );
  const ids = new Set();
  return manifest.bundles.map((bundle) => {
    const expectedName = bundle.file.replace(/\.js$/, '');
    const approved = approvedScripts?.[bundle.file];
    if (approvedScripts !== null)
      assert.ok(
        approved && typeof approved.id === 'string' && approved.id,
        'Missing explicit Script selection',
      );
    const script = approved
      ? scripts[approved.id]
      : selectScript(values, expectedName);
    if (approved) {
      assert.ok(script, 'Approved Script ID not found');
      assert.equal(script.id, approved.id, 'Approved Script ID mismatch');
      assert.ok(
        [expectedName, expectedName + '.js'].includes(script.name),
        'Approved Script name does not match bundle',
      );
      assert.equal(script.name, approved.name, 'Approved Script name changed');
      assert.equal(
        script.version,
        approved.apiCompatibilityVersion,
        'Approved compatibility mode changed',
      );
      assert.match(approved.currentSha256, /^[a-f0-9]{64}$/);
      assert.equal(
        sha256(Buffer.from(script.code)),
        approved.currentSha256,
        'Approved installed code changed',
      );
    }
    assert.ok(
      typeof script.id === 'string' && script.id && !ids.has(script.id),
    );
    ids.add(script.id);
    assert.equal(typeof script.code, 'string', 'Script code is unavailable');
    assert.ok(
      script.version === 1 || script.version === 2,
      'Unknown HomeyScript compatibility mode',
    );
    const currentHash = sha256(Buffer.from(script.code, 'utf8'));
    const newHash = sha256(fs.readFileSync(path.join(directory, bundle.file)));
    return {
      releaseVersion: manifest.version,
      file: bundle.file,
      id: script.id,
      name: script.name,
      apiCompatibilityVersion: script.version,
      installedVersion:
        /^\/\/ Version: (.+)$/m.exec(script.code)?.[1]?.trim() || null,
      currentSha256: currentHash,
      artifactSha256: newHash,
      changed: currentHash !== newHash,
    };
  });
}

async function inventory(get) {
  const app = await get(`/api/manager/apps/app/${appId}`);
  assert.equal(
    app.version,
    '3.6.3',
    'Unsupported installed HomeyScript API version',
  );
  const list = await get(appPath);
  const scripts = {};
  for (const candidate of Object.values(list)) {
    const id = candidate.id;
    assert.ok(typeof id === 'string' && id.trim());
    const script = await get(appPath + '/' + encodeURIComponent(id));
    assert.equal(script.id, id, 'Script ID mismatch');
    assert.equal(
      script.name,
      candidate.name,
      'Script changed during inventory',
    );
    scripts[id] = script;
  }
  // Sequential reads keep load low. Any denied safety inventory blocks completion.
  const system = await get('/api/manager/system/');
  const flows = await get('/api/manager/flow/flow');
  const advancedFlows = await get('/api/manager/flow/advancedflow');
  const logic = await get('/api/manager/logic/variable');
  const devices = await get('/api/manager/devices/device/');
  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    homeyScriptVersion: app.version,
    origin: get.origin || null,
    scripts,
    system,
    flows,
    advancedFlows,
    // Never copy Tibber or other credential Logic values into the backup.
    logic: Object.fromEntries(
      Object.entries(logic).filter(([, variable]) =>
        /^(SmartCharge|ChargeConnectedAt)/.test(variable.name || ''),
      ),
    ),
    devices: Object.fromEntries(
      Object.entries(devices).map(([id, device]) => [
        id,
        {
          id,
          name: device.name,
          capabilitiesObj: device.capabilitiesObj,
        },
      ]),
    ),
  };
}

async function discover(directory, backupRoot, get, approvedScripts = null) {
  const manifest = verifyArtifact(directory);
  const snapshot = await inventory(get);
  const plan = replacementPlan(
    manifest,
    snapshot.scripts,
    directory,
    approvedScripts,
  );
  snapshot.releasePlan = plan;
  snapshot.artifactManifestSha256 = sha256(
    fs.readFileSync(path.join(directory, 'manifest.json')),
  );
  const backupDir = path.join(
    path.resolve(backupRoot),
    new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID(),
  );
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupData = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  fs.writeFileSync(path.join(backupDir, 'snapshot.json'), backupData, {
    flag: 'wx',
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(backupDir, 'snapshot.sha256'),
    sha256(backupData) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const report = {
    status: 'READ_ONLY_DISCOVERY_COMPLETE',
    version: manifest.version,
    installedHomeyScriptVersion: snapshot.homeyScriptVersion,
    backupDir,
    plan,
    changedBundles: plan
      .filter((item) => item.changed)
      .map((item) => item.file),
    backupSaved: true,
    rollbackWriteVerified: false,
    productionWriteEnabled: false,
    safety:
      'Operator audit of writers, Flows, permissions and current charging is required. A snapshot is not a mutex.',
  };
  fs.writeFileSync(
    path.join(backupDir, 'dry-run.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Read-only discovery: ${plan.length} scripts, ${report.changedBundles.length} replacements; backup saved; Homey unchanged`,
  );
  return report;
}

if (require.main === module) {
  const directory = path.resolve(process.argv[2] || 'dist/release');
  const backupRoot = process.argv[3] || path.join('backup', 'homey');
  Promise.resolve()
    .then(() =>
      discover(
        directory,
        backupRoot,
        createReader(process.env.HOMEY_URL, process.env.HOMEY_API_TOKEN),
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  createReader,
  secureUrl,
  replacementPlan,
  inventory,
  discover,
};
