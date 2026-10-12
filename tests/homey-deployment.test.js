const { fixture: createArtifact } = require('./helpers/release-fixture');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { targets, sha256 } = require('../scripts/release-artifact');
const {
  createClient,
  deploy,
  rollback,
  verifyBackup,
  confirmation: installConfirmation,
  rollbackConfirmation: restoreConfirmation,
  preflight,
} = require('../scripts/homey-deployment');
const { discover, inventory } = require('../scripts/homey-discovery');
const { auditFlows } = require('../scripts/homey-flow-audit');

const origin = 'https://192-168-178-79.homey.homeylocal.com';
const scriptPath = '/api/app/com.athom.homeyscript/script';
let releaseApproval;
const clone = (data) => JSON.parse(JSON.stringify(data));
const proof = () => ({
  ...releaseApproval,
  origin,
  scriptIds: Object.fromEntries(
    targets().map((target, i) => [target.file, `id-${i}`]),
  ),
  plugId: 'plug-1',
  confirmedAt: new Date().toISOString(),
  independentStopVerified: true,
  pendingExecutionsDrained: true,
  externalWritersQuiesced: true,
});

function mockApi(options = {}) {
  const state = {
    appVersion: '3.6.3',
    scripts: Object.fromEntries(
      targets().map((target, i) => [
        `id-${i}`,
        {
          id: `id-${i}`,
          name: target.file.replace(/\.js$/, ''),
          version: 2,
          code: `// Version: 0.6.3+build.16\n// installed ${i}\n`,
        },
      ]),
    ),
    flows: {},
    advancedFlows: {},
    devices: {
      'plug-1': {
        id: 'plug-1',
        name: 'Auto Plug In',
        capabilitiesObj: {
          onoff: { value: false },
          measure_power: { value: 0 },
        },
      },
    },
    logic: Object.fromEntries(
      Object.entries({
        SmartChargeManualMode: false,
        SmartChargeAutoStartBlocked: true,
        SmartChargeRuntimeLock: 'null',
        SmartChargeManualState: JSON.stringify({
          status: 'STOPPED',
          autoGrant: null,
        }),
      }).map(([name, value]) => [name, { name, value }]),
    ),
    writes: [],
    requests: [],
  };
  const fetchMock = async (url, request) => {
    const endpoint = new URL(url).pathname;
    state.requests.push({ endpoint, method: request.method });
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, 'Bearer TEST_ONLY_TOKEN');
    assert.ok(!endpoint.endsWith('/run'));
    if (options.unavailable) throw new Error('TEST_ONLY_TOKEN provider error');
    if (options.deniedGet && request.method === 'GET')
      return { ok: false, status: options.deniedGet };
    if (request.method === 'PUT') {
      assert.match(
        endpoint,
        /^\/api\/app\/com\.athom\.homeyscript\/script\/id-\d+$/,
      );
      const id = endpoint.split('/').at(-1);
      const body = JSON.parse(request.body);
      assert.deepEqual(Object.keys(body), ['code']);
      assert.ok(state.scripts[id], 'No create allowed');
      state.writes.push(id);
      if (options.deniedPut) return { ok: false, status: options.deniedPut };
      if (state.writes.length === options.failAt) {
        if (options.applyBeforeTimeout) state.scripts[id].code = body.code;
        throw new Error('TEST_ONLY_TOKEN provider error');
      }
      state.scripts[id].code = body.code;
      if (options.corruptReadback)
        state.scripts[id].code += '// provider corruption';
      if (options.changeId) state.scripts[id].id = 'changed-id';
      if (options.changeName) state.scripts[id].name = 'changed-name';
      if (options.changeMode) state.scripts[id].version = 1;
      if (options.changeLogic)
        state.logic.SmartChargeAutoStartBlocked.value = false;
      if (options.finalCorruption && state.writes.length === 12)
        state.scripts['id-0'].code += '// late corruption';
      return { ok: true };
    }
    assert.equal(request.method, 'GET');
    let result;
    if (endpoint === '/api/manager/apps/app/com.athom.homeyscript')
      result = { version: state.appVersion };
    else if (endpoint === scriptPath)
      result = Object.fromEntries(
        Object.entries(state.scripts).map(([id, script]) => [
          id,
          { ...script, id },
        ]),
      );
    else if (endpoint.startsWith(scriptPath + '/'))
      result = state.scripts[endpoint.split('/').at(-1)];
    else if (endpoint === '/api/manager/flow/flow') result = state.flows;
    else if (endpoint === '/api/manager/flow/advancedflow')
      result = state.advancedFlows;
    else if (endpoint === '/api/manager/devices/device/')
      result = state.devices;
    else if (endpoint === '/api/manager/logic/variable') result = state.logic;
    else if (endpoint === '/api/manager/system/') result = {};
    else assert.fail('Unexpected API endpoint');
    return { ok: true, json: async () => clone(result) };
  };
  return { state, client: createClient(origin, 'TEST_ONLY_TOKEN', fetchMock) };
}

async function main() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smartcharge-deployment-'),
  );
  let cases = 0;
  const test = async (name, run) => {
    await run();
    cases++;
    console.log('PASS ' + name);
  };
  try {
    const artifact = path.join(temporary, 'artifact');
    const manifest = createArtifact(artifact);
    const confirmation = installConfirmation(manifest.version);
    const rollbackConfirmation = restoreConfirmation(manifest.version);
    releaseApproval = {
      tag: manifest.version,
      manifestSha256: sha256(
        fs.readFileSync(path.join(artifact, 'manifest.json')),
      ),
    };
    const backupRoot = path.join(temporary, 'backup');
    await test('explicit pinned selection resolves duplicate name without touching old script; readback and rollback preserve both IDs', async () => {
      const { state, client } = mockApi();
      const debug = targets().findIndex(
        (target) => target.target === 'stability-debug',
      );
      state.scripts.oldDebug = {
        ...state.scripts[`id-${debug}`],
        id: 'oldDebug',
        code: '// Version: 0.6.1+build.14\n// old debug\n',
      };
      const old = clone(state.scripts.oldDebug);
      const approved = {
        ...proof(),
        scriptSelection: Object.fromEntries(
          targets().map((target, i) => {
            const script = state.scripts[`id-${i}`];
            return [
              target.file,
              {
                id: script.id,
                name: script.name,
                apiCompatibilityVersion: script.version,
                currentSha256: sha256(Buffer.from(script.code)),
              },
            ];
          }),
        ),
      };
      await assert.rejects(
        preflight(artifact, backupRoot, client, proof()),
        /ambiguous/,
      );
      assert.equal(
        (await preflight(artifact, backupRoot, client, approved)).status,
        'PREFLIGHT_READY_NO_PUT',
      );
      const result = await deploy(
        artifact,
        backupRoot,
        client,
        approved,
        confirmation,
      );
      assert.equal(result.status, 'VERIFIED');
      assert.deepEqual(state.scripts.oldDebug, old);
      assert.equal(state.writes.includes('oldDebug'), false);
      await rollback(
        result.backupDir,
        backupRoot,
        client,
        approved,
        rollbackConfirmation,
      );
      assert.deepEqual(state.scripts.oldDebug, old);
    });
    await test('explicit selection preserves unselected duplicate guard during sequential updates', async () => {
      const { state, client } = mockApi();
      const debug = targets().findIndex(
        (target) => target.target === 'stability-debug',
      );
      state.scripts.oldDebug = {
        ...state.scripts[`id-${debug}`],
        id: 'oldDebug',
        code: '// old debug\n',
      };
      const scriptSelection = Object.fromEntries(
        targets().map((target, i) => {
          const script = state.scripts[`id-${i}`];
          return [
            target.file,
            {
              id: script.id,
              name: script.name,
              apiCompatibilityVersion: script.version,
              currentSha256: sha256(Buffer.from(script.code)),
            },
          ];
        }),
      );
      const get = client.get;
      client.get = async (endpoint) => {
        if (state.writes.length)
          state.scripts.oldDebug.code = '// unexpected change\n';
        return get(endpoint);
      };
      client.get.origin = client.origin;
      await assert.rejects(
        deploy(
          artifact,
          backupRoot,
          client,
          { ...proof(), scriptSelection },
          confirmation,
        ),
        /stopped/,
      );
      assert.equal(state.writes.length, 1);
      assert.equal(state.writes.includes('oldDebug'), false);
    });
    await test('explicit selection fails closed on missing IDs, code/name/mode changes and incomplete mapping', async () => {
      for (const field of [
        'id',
        'name',
        'apiCompatibilityVersion',
        'currentSha256',
        'missing',
        'null',
      ]) {
        const { state, client } = mockApi();
        const scriptSelection = Object.fromEntries(
          targets().map((target, i) => {
            const script = state.scripts[`id-${i}`];
            return [
              target.file,
              {
                id: script.id,
                name: script.name,
                apiCompatibilityVersion: script.version,
                currentSha256: sha256(Buffer.from(script.code)),
              },
            ];
          }),
        );
        const file = targets()[0].file;
        if (field === 'missing') delete scriptSelection[file];
        else if (field === 'null') scriptSelection[file] = null;
        else
          scriptSelection[file][field] =
            field === 'currentSha256'
              ? 'a'.repeat(64)
              : field === 'apiCompatibilityVersion'
                ? 1
                : 'changed';
        await assert.rejects(
          deploy(
            artifact,
            backupRoot,
            client,
            { ...proof(), scriptSelection },
            confirmation,
          ),
        );
        assert.equal(state.writes.length, 0);
      }
    });
    await test('WAITING preserves Logic when Flows are disabled but retained AUTO grant refuses PUT', async () => {
      const { state, client } = mockApi();
      state.logic.SmartChargeAutoStartBlocked.value = false;
      state.logic.SmartChargeManualState.value = JSON.stringify({
        status: 'STOPPED',
        autoGrant: { at: new Date().toISOString(), stopToken: 'stop-1' },
      });
      for (const [name, value] of Object.entries({
        ChargeConnectedAt: '2026-07-07 18:00:00',
        SmartChargeSessionStatus: 'active',
        SmartChargeShouldCharge: false,
        SmartChargeReason: 'Waiting for selected charging plan',
        SmartChargePlannedStart: '2026-07-08 02:00:00',
        SmartChargePlannedEnd: '2026-07-08 04:00:00',
      }))
        state.logic[name] = { name, value };
      state.flows.runtime = {
        id: 'runtime',
        name: 'Runtime Controller',
        enabled: true,
        conditions: [],
        actions: [
          {
            id: 'homey:app:com.athom.homeyscript:run',
            args: { script: { id: 'id-1' } },
          },
        ],
      };
      const preserved = clone(state.logic);
      assert.equal(
        auditFlows(await inventory(client.get), 'plug-1')
          .enabledMaintenanceFlows.length,
        1,
      );
      state.flows.runtime.enabled = false; // Mock only; never sends a Flow write.
      assert.equal(
        auditFlows(await inventory(client.get), 'plug-1')
          .enabledMaintenanceFlows.length,
        0,
      );
      await assert.rejects(preflight(artifact, backupRoot, client, proof()));
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
      );
      assert.deepEqual(state.logic, preserved);
      assert.equal(state.writes.length, 0);
      // A block alone is insufficient: retained grant remains forbidden.
      state.logic.SmartChargeAutoStartBlocked.value = true;
      await assert.rejects(
        preflight(artifact, backupRoot, client, proof()),
        /grant must be absent/,
      );
      assert.equal(state.writes.length, 0);
    });
    await test('inactive automatic session and cached plan can survive compliant maintenance without a grant', async () => {
      const { state, client } = mockApi();
      for (const [name, value] of Object.entries({
        ChargeConnectedAt: '2026-07-07 18:00:00',
        SmartChargeSessionStatus: 'active',
        SmartChargeShouldCharge: false,
        SmartChargePlannedStart: '2026-07-08 02:00:00',
        SmartChargePlannedEnd: '2026-07-08 04:00:00',
      }))
        state.logic[name] = { name, value };
      const preserved = clone(state.logic);
      for (const field of [
        'pendingExecutionsDrained',
        'externalWritersQuiesced',
      ]) {
        await assert.rejects(
          preflight(artifact, backupRoot, client, {
            ...proof(),
            [field]: false,
          }),
          /Operator must/,
        );
        assert.equal(state.writes.length, 0);
      }
      const result = await deploy(
        artifact,
        backupRoot,
        client,
        proof(),
        confirmation,
      );
      assert.equal(result.status, 'VERIFIED');
      assert.deepEqual(state.logic, preserved);
      assert.equal(state.writes.length, 12);
      assert.ok(state.requests.every((r) => ['GET', 'PUT'].includes(r.method)));
    });
    await test('successful install preserves IDs/names/API mode; full readback and rollback', async () => {
      const { state, client } = mockApi();
      const original = clone(state.scripts);
      const result = await deploy(
        artifact,
        backupRoot,
        client,
        proof(),
        confirmation,
      );
      assert.equal(result.status, 'VERIFIED');
      assert.equal(state.writes.length, 12);
      assert.equal(verifyBackup(result.backupDir).releasePlan.length, 12);
      for (const [id, script] of Object.entries(state.scripts)) {
        assert.equal(script.id, id);
        assert.equal(script.name, original[id].name);
        assert.equal(script.version, 2);
      }
      const repeat = await deploy(
        artifact,
        backupRoot,
        client,
        proof(),
        confirmation,
      );
      assert.equal(repeat.changedScripts.length, 0);
      const recovered = await rollback(
        result.backupDir,
        backupRoot,
        client,
        proof(),
        rollbackConfirmation,
      );
      assert.equal(recovered.status, 'VERIFIED');
      assert.deepEqual(state.scripts, original);
    });
    await test('separate preflight verifies backup/readiness and never PUTs', async () => {
      const { client, state } = mockApi();
      const result = await preflight(artifact, backupRoot, client, proof());
      assert.equal(result.status, 'PREFLIGHT_READY_NO_PUT');
      assert.equal(result.rollbackBackupVerified, true);
      assert.equal(state.writes.length, 0);
      state.devices['plug-1'].capabilitiesObj.onoff.value = true;
      await assert.rejects(
        preflight(artifact, backupRoot, client, proof()),
        /Plug must be OFF/,
      );
      assert.equal(state.writes.length, 0);
    });
    for (const status of [401, 403]) {
      await test(`GET HTTP ${status} refuses operation without PUT or token disclosure`, async () => {
        const { client, state } = mockApi({ deniedGet: status });
        await assert.rejects(
          deploy(artifact, backupRoot, client, proof(), confirmation),
          (error) =>
            error.message.includes(`HTTP ${status}`) &&
            !error.message.includes('TEST_ONLY_TOKEN'),
        );
        assert.equal(state.writes.length, 0);
      });
      await test(`PUT HTTP ${status} stops first attempt without retry`, async () => {
        const { client, state } = mockApi({ deniedPut: status });
        await assert.rejects(
          deploy(artifact, backupRoot, client, proof(), confirmation),
          /1 attempted, 0 verified/,
        );
        assert.equal(state.writes.length, 1);
      });
    }
    await test('partial install/unknown second PUT outcome; rollback reads actual hashes', async () => {
      const options = { failAt: 2, applyBeforeTimeout: true };
      const { state, client } = mockApi(options);
      const original = clone(state.scripts);
      const report = await discover(artifact, backupRoot, client.get);
      // Deploy creates its own fresh pre-write backup.
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /2 attempted, 1 verified/,
      );
      assert.equal(state.writes.length, 2);
      const backups = fs
        .readdirSync(backupRoot)
        .filter((name) =>
          fs.existsSync(path.join(backupRoot, name, 'deployment.json')),
        );
      const partial = backups
        .map((name) => path.join(backupRoot, name))
        .find(
          (dir) =>
            JSON.parse(fs.readFileSync(path.join(dir, 'deployment.json')))
              .attempted.length === 2,
        );
      assert.ok(partial);
      options.failAt = 0;
      await rollback(
        partial,
        backupRoot,
        client,
        proof(),
        rollbackConfirmation,
      );
      assert.deepEqual(state.scripts, original);
      assert.ok(verifyBackup(report.backupDir));
    });
    await test('damaged backup blocks rollback before PUT', async () => {
      const { client, state } = mockApi();
      const result = await deploy(
        artifact,
        backupRoot,
        client,
        proof(),
        confirmation,
      );
      fs.appendFileSync(
        path.join(result.backupDir, 'snapshot.json'),
        'corrupt',
      );
      await assert.rejects(
        rollback(
          result.backupDir,
          backupRoot,
          client,
          proof(),
          rollbackConfirmation,
        ),
        /checksum mismatch/,
      );
      assert.equal(state.writes.length, 12);
    });
    await test('artifact checksum mismatch blocks before any API request', async () => {
      const { client, state } = mockApi();
      const file = path.join(artifact, targets()[0].file);
      const bytes = fs.readFileSync(file);
      fs.appendFileSync(file, 'corrupt');
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
      );
      assert.equal(state.requests.length, 0);
      fs.writeFileSync(file, bytes);
    });
    await test('Script ID replaced since approved dry-run refuses first PUT', async () => {
      const { client, state } = mockApi();
      state.scripts['id-999'] = { ...state.scripts['id-0'], id: 'id-999' };
      delete state.scripts['id-0'];
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /operator-approved dry-run plan/,
      );
      assert.equal(state.writes.length, 0);
    });
    for (const option of [
      'changeId',
      'changeName',
      'changeMode',
      'corruptReadback',
      'changeLogic',
    ]) {
      await test(`${option}: post-deployment verification stops`, async () => {
        const { client, state } = mockApi({ [option]: true });
        await assert.rejects(
          deploy(artifact, backupRoot, client, proof(), confirmation),
          /Homey deploy stopped/,
        );
        assert.equal(state.writes.length, 1);
      });
    }
    await test('duplicate Stability Debug: all ambiguous name mappings refused', async () => {
      const { client, state } = mockApi();
      const debug = Object.values(state.scripts).find((script) =>
        script.name.endsWith('Stability Debug'),
      );
      state.scripts['old-debug'] = {
        ...debug,
        id: 'old-debug',
        code: '// Version: 0.6.1+build.14\nold',
      };
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /ambiguous/,
      );
      delete state.scripts['old-debug'];
      state.scripts['duplicate-debug'] = { ...debug, id: 'duplicate-debug' };
      const before = state.writes.length;
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /ambiguous/,
      );
      assert.equal(state.writes.length, before);
    });
    await test('Homey unavailable: no writes and no provider token leak', async () => {
      const { client, state } = mockApi({ unavailable: true });
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        (error) =>
          /Local Secure/.test(error.message) &&
          !error.message.includes('TEST_ONLY_TOKEN'),
      );
      assert.equal(state.writes.length, 0);
    });
    await test('final whole-release verification detects earlier script changed after last PUT', async () => {
      const { client, state } = mockApi({ finalCorruption: true });
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /12 attempted, 12 verified/,
      );
      assert.equal(state.writes.length, 12);
    });
    await test('installed HomeyScript API mismatch blocks inventory and deploy', async () => {
      const { client, state } = mockApi();
      state.appVersion = '3.6.4';
      await assert.rejects(inventory(client.get), /Unsupported installed/);
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /Unsupported installed/,
      );
      assert.equal(state.writes.length, 0);
    });
    await test('explicit approval, recent maintenance, OFF/block/quiescence required', async () => {
      const { client, state } = mockApi();
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), ''),
        /confirmation required/,
      );
      await assert.rejects(
        deploy(
          artifact,
          backupRoot,
          client,
          { ...proof(), confirmedAt: '2000-01-01' },
          confirmation,
        ),
        /15 minutes/,
      );
      state.devices['plug-1'].capabilitiesObj.onoff.value = true;
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /Plug must be OFF/,
      );
      state.devices['plug-1'].capabilitiesObj.onoff.value = false;
      await assert.rejects(
        deploy(
          artifact,
          backupRoot,
          client,
          { ...proof(), independentStopVerified: false },
          confirmation,
        ),
        /Independent stop/,
      );
      assert.equal(state.writes.length, 0);
    });
    await test('Flow audit captures Runtime, direct plug cards, inline and delegated flows; enabled blocks PUT', async () => {
      const { client, state } = mockApi();
      state.flows.runtime = {
        id: 'runtime',
        name: 'Runtime Controller',
        enabled: true,
        trigger: {
          id: 'homey:manager:cron:every_nth',
          args: { n: 5, type: 'minute' },
        },
        conditions: [],
        actions: [
          {
            id: 'homey:app:com.athom.homeyscript:run',
            args: { script: { id: 'id-0' } },
          },
          { id: 'homey:device:plug-1:on', args: {} },
        ],
      };
      state.advancedFlows.inline = {
        id: 'inline',
        name: 'Inline',
        enabled: false,
        cards: {
          code: {
            id: 'homey:app:com.athom.homeyscript:runCode',
            type: 'action',
            args: {},
          },
          delegation: {
            id: 'homey:manager:flow:programmatic_trigger',
            type: 'action',
          },
        },
      };
      const audit = auditFlows(await inventory(client.get), 'plug-1');
      assert.equal(audit.flows.length, 2);
      assert.equal(audit.flows[0].directPlugCards.length, 1);
      assert.equal(audit.flows[1].delegatedFlows.length, 1);
      await assert.rejects(
        deploy(artifact, backupRoot, client, proof(), confirmation),
        /Flows are still enabled/,
      );
      assert.equal(state.writes.length, 0);
    });
    await test('rollback refuses unknown installed code, changed IDs, and corrupt journal', async () => {
      const { client, state } = mockApi();
      const result = await deploy(
        artifact,
        backupRoot,
        client,
        proof(),
        confirmation,
      );
      const code = state.scripts['id-0'].code;
      state.scripts['id-0'].code = 'unreviewed';
      await assert.rejects(
        rollback(
          result.backupDir,
          backupRoot,
          client,
          proof(),
          rollbackConfirmation,
        ),
        /unknown installed/,
      );
      state.scripts['id-0'].code = code;
      state.scripts['id-0'].id = 'changed-id';
      await assert.rejects(
        rollback(
          result.backupDir,
          backupRoot,
          client,
          proof(),
          rollbackConfirmation,
        ),
        /Script ID mismatch/,
      );
      state.scripts['id-0'].id = 'id-0';
      fs.appendFileSync(
        path.join(result.backupDir, 'deployment.json'),
        'corrupt',
      );
      await assert.rejects(
        rollback(
          result.backupDir,
          backupRoot,
          client,
          proof(),
          rollbackConfirmation,
        ),
        /checksum mismatch/,
      );
      assert.equal(state.writes.length, 12);
      assert.equal(sha256(Buffer.from(code)).length, 64);
    });
    await test('future release has dynamic install and rollback approval', async () => {
      const futureDir = path.join(temporary, 'future');
      fs.cpSync(artifact, futureDir, { recursive: true });
      const future = JSON.parse(
        fs.readFileSync(path.join(futureDir, 'manifest.json')),
      );
      const oldVersion = future.version;
      future.version = '0.7.1+build.23';
      for (const item of future.bundles) {
        const file = path.join(futureDir, item.file);
        const data = Buffer.from(
          fs.readFileSync(file, 'utf8').replaceAll(oldVersion, future.version),
        );
        fs.writeFileSync(file, data);
        item.bytes = data.length;
        item.sha256 = sha256(data);
      }
      fs.writeFileSync(
        path.join(futureDir, 'manifest.json'),
        JSON.stringify(future, null, 2) + '\n',
      );
      fs.writeFileSync(
        path.join(futureDir, 'SHA256SUMS'),
        [...future.bundles.map((b) => b.file), 'manifest.json']
          .sort()
          .map(
            (file) =>
              sha256(fs.readFileSync(path.join(futureDir, file))) +
              '  ' +
              file +
              '\n',
          )
          .join(''),
      );
      const saved = releaseApproval;
      releaseApproval = {
        tag: future.version,
        manifestSha256: sha256(
          fs.readFileSync(path.join(futureDir, 'manifest.json')),
        ),
      };
      try {
        const { state, client } = mockApi();
        await assert.rejects(
          deploy(futureDir, backupRoot, client, proof(), confirmation),
        );
        assert.equal(state.writes.length, 0);
        const installed = await deploy(
          futureDir,
          backupRoot,
          client,
          proof(),
          installConfirmation(future.version),
        );
        assert.equal(
          (await preflight(futureDir, backupRoot, client, proof())).status,
          'PREFLIGHT_READY_NO_PUT',
        );
        assert.equal(installed.status, 'VERIFIED');
        assert.equal(
          (
            await rollback(
              installed.backupDir,
              backupRoot,
              client,
              proof(),
              restoreConfirmation(future.version),
            )
          ).status,
          'VERIFIED',
        );
      } finally {
        releaseApproval = saved;
      }
    });
    console.log(
      `${cases} deployment mock scenarios passed; no real Homey requests.`,
    );
  } finally {
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
