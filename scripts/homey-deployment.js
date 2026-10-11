const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  createReader,
  secureUrl,
  discover,
  inventory,
} = require('./homey-discovery');
const { verifyArtifact, sha256 } = require('./release-artifact');
const { auditFlows } = require('./homey-flow-audit');

const app = '/api/manager/apps/app/com.athom.homeyscript';
const scriptsPath = '/api/app/com.athom.homeyscript/script';
const confirmation = 'INSTALL SmartCharge 0.6.4+build.17';
const rollbackConfirmation = 'ROLLBACK SmartCharge 0.6.4+build.17';

function createClient(address, token, fetchImpl = fetch) {
  const origin = secureUrl(address);
  const get = createReader(origin, token, fetchImpl);
  return {
    origin,
    get,
    async putCode(id, code) {
      assert.match(id, /^[a-zA-Z0-9-]+$/, 'Invalid existing Script ID');
      assert.equal(typeof code, 'string');
      let response;
      try {
        response = await fetchImpl(
          `${origin}${scriptsPath}/${encodeURIComponent(id)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
          },
        );
      } catch {
        throw new Error(
          'Homey PUT outcome unknown; stopped without retry; inspect backup and read back',
        );
      }
      if (!response.ok)
        throw new Error(
          `Homey PUT returned HTTP ${response.status}; stopped without retry`,
        );
      // Ignore the response body. GET readback is the authoritative verification.
    },
  };
}

function readChecked(directory, name) {
  const filename = path.join(directory, name + '.json');
  assert.ok(
    fs.lstatSync(filename).isFile() && !fs.lstatSync(filename).isSymbolicLink(),
  );
  const data = fs.readFileSync(filename);
  assert.equal(
    sha256(data),
    fs.readFileSync(path.join(directory, name + '.sha256'), 'utf8').trim(),
    'Backup checksum mismatch',
  );
  return JSON.parse(data.toString('utf8'));
}

function saveChecked(directory, name, value) {
  const data = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  // A crash between these writes deliberately makes this journal invalid and blocks rollback.
  fs.writeFileSync(path.join(directory, name + '.json'), data, { mode: 0o600 });
  fs.writeFileSync(
    path.join(directory, name + '.sha256'),
    sha256(data) + '\n',
    { mode: 0o600 },
  );
}

function verifyBackup(directory) {
  const snapshot = readChecked(directory, 'snapshot');
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.homeyScriptVersion, '3.6.3');
  secureUrl(snapshot.origin);
  assert.ok(
    Array.isArray(snapshot.releasePlan) && snapshot.releasePlan.length === 12,
  );
  const ids = new Set();
  for (const item of snapshot.releasePlan) {
    assert.ok(!ids.has(item.id), 'Duplicate backup Script ID');
    ids.add(item.id);
    const script = snapshot.scripts[item.id];
    assert.ok(
      script &&
        script.id === item.id &&
        script.name === item.name &&
        script.version === item.apiCompatibilityVersion,
      'Backup identity mismatch',
    );
    assert.equal(
      sha256(Buffer.from(script.code)),
      item.currentSha256,
      'Backup script checksum mismatch',
    );
    assert.match(item.artifactSha256, /^[a-f0-9]{64}$/);
  }
  return snapshot;
}

function safeMaintenance(snapshot, proof) {
  assert.equal(proof.origin, snapshot.origin, 'Maintenance Homey mismatch');
  const age = Date.now() - Date.parse(proof.confirmedAt);
  assert.ok(
    age >= 0 && age < 15 * 60 * 1000,
    'Maintenance attestation must be renewed within 15 minutes',
  );
  assert.equal(
    proof.independentStopVerified,
    true,
    'Independent stop must be verified by operator',
  );
  assert.equal(
    proof.pendingExecutionsDrained,
    true,
    'Operator must drain pending/in-flight executions',
  );
  assert.equal(
    proof.externalWritersQuiesced,
    true,
    'Operator must inspect/quiesce external Apps and manual executions',
  );
  const audit = auditFlows(snapshot, proof.plugId);
  assert.equal(
    audit.enabledMaintenanceFlows.length,
    0,
    'Candidate writer/trigger Flows are still enabled or unknown',
  );
  const plug = snapshot.devices[proof.plugId];
  assert.equal(
    plug.capabilitiesObj?.onoff?.value,
    false,
    'Plug must be OFF before script maintenance',
  );
  const logic = (name) => {
    const values = Object.values(snapshot.logic).filter(
      (variable) => variable.name === name,
    );
    assert.equal(
      values.length,
      1,
      'Missing/duplicate safety Logic variable: ' + name,
    );
    return values[0].value;
  };
  assert.equal(logic('SmartChargeManualMode'), false);
  assert.equal(logic('SmartChargeAutoStartBlocked'), true);
  assert.ok(
    [null, 'null', ''].includes(logic('SmartChargeRuntimeLock')),
    'Runtime lock must be empty',
  );
  const state = JSON.parse(logic('SmartChargeManualState'));
  assert.ok(
    ['IDLE', 'STOPPED', 'COMPLETED', 'ERROR'].includes(state.status),
    'Manual lifecycle must be inactive',
  );
  assert.ok(
    state.autoGrant === null || state.autoGrant === undefined,
    'Automatic grant must be absent',
  );
  return audit;
}

async function checkApi(client) {
  assert.equal(
    (await client.get(app)).version,
    '3.6.3',
    'Unsupported installed HomeyScript API version',
  );
}

async function checkScript(client, item, expectedHash) {
  const script = await client.get(
    `${scriptsPath}/${encodeURIComponent(item.id)}`,
  );
  assert.equal(script.id, item.id, 'Script ID changed');
  assert.equal(script.name, item.name, 'Script name changed');
  assert.equal(
    script.version,
    item.apiCompatibilityVersion,
    'API compatibility mode changed',
  );
  assert.equal(
    sha256(Buffer.from(script.code, 'utf8')),
    expectedHash,
    'Installed script checksum mismatch',
  );
}

function safetyValues(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot.logic).map(([id, variable]) => [
      id,
      { name: variable.name, value: variable.value },
    ]),
  );
}

function checkApprovedIds(snapshot, proof) {
  assert.deepEqual(
    proof.scriptIds,
    Object.fromEntries(
      snapshot.releasePlan.map((item) => [item.file, item.id]),
    ),
    'Script IDs differ from operator-approved dry-run plan',
  );
}

function checkInventoryIdentities(live, baseline) {
  assert.deepEqual(
    Object.keys(live.scripts).sort(),
    Object.keys(baseline.scripts).sort(),
    'Script inventory IDs changed',
  );
  const selected = new Set(baseline.releasePlan.map((item) => item.id));
  for (const [id, original] of Object.entries(baseline.scripts)) {
    const current = live.scripts[id];
    assert.equal(current.id, original.id, 'Script ID changed');
    assert.equal(current.name, original.name, 'Script name changed');
    assert.equal(
      current.version,
      original.version,
      'Script compatibility mode changed',
    );
    if (!selected.has(id))
      assert.equal(
        sha256(Buffer.from(current.code)),
        sha256(Buffer.from(original.code)),
        'Unselected script changed',
      );
  }
}

async function writeBatch(
  client,
  snapshot,
  backupDir,
  items,
  codeFor,
  proof,
  mode,
) {
  const journal = {
    schemaVersion: 1,
    mode,
    origin: client.origin,
    snapshotSha256: sha256(
      fs.readFileSync(path.join(backupDir, 'snapshot.json')),
    ),
    state: 'PREPARED',
    attempted: [],
    verified: [],
  };
  // Deployment journal remains intact when a separate rollback operation is attempted.
  const journalName =
    mode === 'deploy' ? 'deployment' : 'rollback-' + randomUUID();
  saveChecked(backupDir, journalName, journal);
  try {
    for (const item of items) {
      await checkApi(client);
      const before = await inventory(client.get);
      safeMaintenance(before, proof);
      checkInventoryIdentities(before, snapshot);
      assert.deepEqual(
        before.flows,
        snapshot.flows,
        'Flows changed during maintenance',
      );
      assert.deepEqual(
        before.advancedFlows,
        snapshot.advancedFlows,
        'Advanced Flows changed during maintenance',
      );
      assert.deepEqual(
        safetyValues(before),
        safetyValues(snapshot),
        'SmartCharge Logic changed during maintenance',
      );
      await checkScript(client, item, item.beforeSha256);
      journal.attempted.push(item.id);
      journal.state = 'WRITING';
      saveChecked(backupDir, journalName, journal);
      await client.putCode(item.id, codeFor(item));
      await checkScript(client, item, item.afterSha256);
      journal.verified.push(item.id);
      saveChecked(backupDir, journalName, journal);
    }
    // Verify the whole selected release, including no-op scripts, and preserved state.
    for (const item of snapshot.releasePlan) {
      const changed = items.find((candidate) => candidate.id === item.id);
      await checkScript(
        client,
        item,
        changed ? changed.afterSha256 : item.currentSha256,
      );
    }
    const after = await inventory(client.get);
    safeMaintenance(after, proof);
    checkInventoryIdentities(after, snapshot);
    assert.deepEqual(
      after.flows,
      snapshot.flows,
      'Post-deployment Flow verification failed',
    );
    assert.deepEqual(
      after.advancedFlows,
      snapshot.advancedFlows,
      'Post-deployment Advanced Flow verification failed',
    );
    assert.deepEqual(
      safetyValues(after),
      safetyValues(snapshot),
      'Post-deployment Logic verification failed',
    );
    journal.state = 'VERIFIED';
    saveChecked(backupDir, journalName, journal);
    return {
      status: 'VERIFIED',
      mode,
      changedScripts: items.map((item) => item.id),
      backupDir,
    };
  } catch {
    journal.state = 'STOPPED_REQUIRES_INSPECTION';
    saveChecked(backupDir, journalName, journal);
    // Do not print provider exceptions, raw code, Flow arguments or credentials.
    throw new Error(
      `Homey ${mode} stopped; ${journal.attempted.length} attempted, ${journal.verified.length} verified. Inspect private backup/journal; no automatic retry or rollback.`,
    );
  }
}

async function deploy(directory, backupRoot, client, proof, approval) {
  assert.equal(
    approval,
    confirmation,
    'Explicit deployment confirmation required',
  );
  const manifest = verifyArtifact(directory);
  assert.equal(manifest.version, '0.6.4+build.17');
  const report = await discover(directory, backupRoot, client.get);
  const snapshot = verifyBackup(report.backupDir);
  assert.equal(snapshot.origin, client.origin);
  checkApprovedIds(snapshot, proof);
  safeMaintenance(snapshot, proof);
  for (const item of snapshot.releasePlan) {
    assert.ok(
      ['0.6.3+build.16', '0.6.4+build.17'].includes(item.installedVersion),
      'Unsupported installed SmartCharge release',
    );
  }
  const items = snapshot.releasePlan
    .filter((item) => item.changed)
    .map((item) => ({
      ...item,
      beforeSha256: item.currentSha256,
      afterSha256: item.artifactSha256,
    }));
  // Cache verified bytes before any PUT; do not re-open mutable artifact files mid-install.
  const codes = new Map(
    items.map((item) => {
      const data = fs.readFileSync(path.join(directory, item.file));
      assert.equal(
        sha256(data),
        item.afterSha256,
        'Artifact changed after verification',
      );
      return [item.id, data.toString('utf8')];
    }),
  );
  return writeBatch(
    client,
    snapshot,
    report.backupDir,
    items,
    (item) => codes.get(item.id),
    proof,
    'deploy',
  );
}

async function preflight(directory, backupRoot, client, proof) {
  const report = await discover(directory, backupRoot, client.get);
  const snapshot = verifyBackup(report.backupDir);
  assert.equal(snapshot.origin, client.origin);
  assert.ok(
    Object.values(snapshot.releasePlan).every((item) =>
      ['0.6.3+build.16', '0.6.4+build.17'].includes(item.installedVersion),
    ),
    'Unexpected installed SmartCharge release',
  );
  checkApprovedIds(snapshot, proof);
  const audit = safeMaintenance(snapshot, proof);
  return {
    status: 'PREFLIGHT_READY_NO_PUT',
    backupDir: report.backupDir,
    replacements: report.changedBundles.length,
    enabledCandidateFlows: audit.enabledMaintenanceFlows.length,
    rollbackBackupVerified: true,
    executionEvidence:
      'Operator attestation; official API has no supported active-execution inventory',
    putPerformed: false,
  };
}

async function rollback(backupDir, backupRoot, client, proof, approval) {
  assert.equal(
    approval,
    rollbackConfirmation,
    'Explicit rollback confirmation required',
  );
  const original = verifyBackup(backupDir);
  checkApprovedIds(original, proof);
  assert.equal(
    original.origin,
    client.origin,
    'Backup belongs to a different Homey',
  );
  const journal = readChecked(backupDir, 'deployment');
  assert.equal(journal.schemaVersion, 1);
  assert.equal(journal.mode, 'deploy');
  assert.equal(journal.origin, client.origin);
  assert.ok(
    Array.isArray(journal.attempted) && Array.isArray(journal.verified),
  );
  assert.equal(
    journal.snapshotSha256,
    sha256(fs.readFileSync(path.join(backupDir, 'snapshot.json'))),
  );
  const live = await inventory(client.get);
  safeMaintenance(live, proof);
  const items = [];
  for (const item of original.releasePlan) {
    const script = live.scripts[item.id];
    assert.ok(
      script &&
        script.id === item.id &&
        script.name === item.name &&
        script.version === item.apiCompatibilityVersion,
      'Rollback identity mismatch',
    );
    const hash = sha256(Buffer.from(script.code));
    assert.ok(
      hash === item.currentSha256 ||
        (journal.attempted.includes(item.id) && hash === item.artifactSha256),
      'Rollback refuses unknown installed code/checksum',
    );
    if (hash !== item.currentSha256)
      items.push({
        ...item,
        beforeSha256: hash,
        afterSha256: item.currentSha256,
      });
  }
  // A fresh recovery snapshot allows inspection of the state immediately before rollback.
  const recoveryDir = path.join(
    path.resolve(backupRoot),
    'pre-rollback-' + randomUUID(),
  );
  fs.mkdirSync(recoveryDir, { recursive: true, mode: 0o700 });
  live.releasePlan = original.releasePlan.map((item) => ({
    ...item,
    currentSha256: sha256(Buffer.from(live.scripts[item.id].code)),
  }));
  saveChecked(recoveryDir, 'snapshot', live);
  // Use current Logic/Flows for verification, with expected final original script hashes.
  const verificationSnapshot = { ...live, releasePlan: original.releasePlan };
  return writeBatch(
    client,
    verificationSnapshot,
    backupDir,
    items,
    (item) => original.scripts[item.id].code,
    proof,
    'rollback',
  );
}

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const mode = process.argv[2];
      assert.ok(
        ['inventory', 'dry-run', 'preflight', 'deploy', 'rollback'].includes(
          mode,
        ),
        'Usage: homey-deployment.js inventory|dry-run|preflight|deploy|rollback [artifact/backup]',
      );
      const client = createClient(
        process.env.HOMEY_URL,
        process.env.HOMEY_API_TOKEN,
      );
      if (mode === 'inventory') {
        const data = await inventory(client.get);
        console.log(
          `Inventory: API ${data.homeyScriptVersion}, ${Object.keys(data.scripts).length} existing scripts; read-only`,
        );
        return;
      }
      const backupRoot = process.env.HOMEY_BACKUP_ROOT || 'backup/homey';
      if (mode === 'dry-run') {
        const report = await discover(
          path.resolve(process.argv[3] || 'dist/release'),
          backupRoot,
          client.get,
        );
        verifyBackup(report.backupDir);
        const audit = auditFlows(
          verifyBackup(report.backupDir),
          process.env.HOMEY_PLUG_ID,
        );
        saveChecked(report.backupDir, 'flow-audit', audit);
        fs.writeFileSync(
          path.join(report.backupDir, 'maintenance-template.json'),
          JSON.stringify(
            {
              origin: client.origin,
              plugId: process.env.HOMEY_PLUG_ID,
              scriptIds: Object.fromEntries(
                report.plan.map((item) => [item.file, item.id]),
              ),
              confirmedAt: null,
              independentStopVerified: false,
              pendingExecutionsDrained: false,
              externalWritersQuiesced: false,
            },
            null,
            2,
          ) + '\n',
          { flag: 'wx', mode: 0o600 },
        );
        console.log(
          `Dry-run: backup checksum valid; ${report.changedBundles.length} replacements; ${audit.enabledMaintenanceFlows.length} candidate Flows need maintenance; no PUT`,
        );
        return;
      }
      assert.ok(
        process.env.HOMEY_MAINTENANCE_FILE,
        'Operator maintenance attestation file required',
      );
      const proof = JSON.parse(
        fs.readFileSync(process.env.HOMEY_MAINTENANCE_FILE, 'utf8'),
      );
      if (mode === 'preflight') {
        const result = await preflight(
          path.resolve(process.argv[3]),
          backupRoot,
          client,
          proof,
        );
        console.log(
          `${result.status}: ${result.replacements} replacements; rollback backup verified; Homey unchanged`,
        );
        return;
      }
      if (mode === 'rollback') {
        assert.ok(
          process.env.HOMEY_ARTIFACT_DIR,
          'Validated artifact directory required for CLI rollback provenance',
        );
        verifyArtifact(process.env.HOMEY_ARTIFACT_DIR);
        assert.equal(
          verifyBackup(path.resolve(process.argv[3])).artifactManifestSha256,
          sha256(
            fs.readFileSync(
              path.join(process.env.HOMEY_ARTIFACT_DIR, 'manifest.json'),
            ),
          ),
          'Rollback artifact does not match original deployment',
        );
      }
      const result =
        mode === 'deploy'
          ? await deploy(
              path.resolve(process.argv[3]),
              backupRoot,
              client,
              proof,
              process.env.SMARTCHARGE_WRITE_CONFIRMATION,
            )
          : await rollback(
              path.resolve(process.argv[3]),
              backupRoot,
              client,
              proof,
              process.env.SMARTCHARGE_WRITE_CONFIRMATION,
            );
      console.log(
        `${result.mode}: ${result.status}, ${result.changedScripts.length} changed scripts; backup/journal saved; Flows were not restored automatically`,
      );
    })
    .catch((error) => {
      // Assertion errors may embed private API values; only safe generic status is logged.
      console.error(
        error.message.startsWith('Homey deploy stopped') ||
          error.message.startsWith('Homey rollback stopped')
          ? error.message
          : 'Deployment client refused operation; check API access/version, artifact/backup, identity, confirmation and maintenance preconditions',
      );
      process.exitCode = 1;
    });
}

module.exports = {
  createClient,
  verifyBackup,
  safeMaintenance,
  deploy,
  rollback,
  confirmation,
  rollbackConfirmation,
  preflight,
};
