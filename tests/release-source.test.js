const assert = require('assert/strict');
const { verifySource } = require('../scripts/verify-release-source');
const { mercedesAudit } = require('../scripts/homey-mercedes-audit');
async function main() {
  const repository = 'AlexH73/smartcharge-homey-bundle';
  const sha = 'a'.repeat(40);
  const approved = {
    repository,
    sha,
    tag: 'v0.6.4+build.17',
    manifestSha256: 'b'.repeat(64),
    runId: '123',
    artifactId: '456',
  };
  const responses = {
    [`repos/${repository}`]: { private: false },
    [`repos/${repository}/contents/.smartcharge-build.json?ref=${sha}`]: {
      encoding: 'base64',
      content: Buffer.from(
        JSON.stringify({ major: 0, minor: 6, patch: 4, build: 17 }),
      ).toString('base64'),
    },
    [`repos/${repository}/actions/runs/123`]: {
      workflow_id: 99,
      head_repository: { full_name: repository },
      head_sha: sha,
      conclusion: 'success',
      status: 'completed',
      event: 'push',
      run_attempt: 1,
    },
    [`repos/${repository}/actions/workflows/smartcharge-ci.yml`]: { id: 99 },
    [`repos/${repository}/commits/${encodeURIComponent(approved.tag)}`]: {
      sha,
    },
    [`repos/${repository}/releases/tags/${encodeURIComponent(approved.tag)}`]: {
      id: 10,
      tag_name: approved.tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          id: 11,
          name: 'smartcharge-manifest.json',
          size: 1234,
          browser_download_url: `https://github.com/${repository}/releases/download/${encodeURIComponent(approved.tag)}/smartcharge-manifest.json`,
        },
      ],
    },
    [`repos/${repository}/actions/artifacts/456`]: {
      expired: false,
      workflow_run: { id: 123, head_sha: sha },
      name: `smartcharge-${sha}-123-1`,
      digest: 'sha256:' + 'c'.repeat(64),
    },
  };
  const get = async (endpoint) => {
    assert.ok(responses[endpoint]);
    return responses[endpoint];
  };
  const evidence = await verifySource(get, approved);
  assert.equal(evidence.repository, repository);
  let cases = 1;
  for (const [suffix, field, value] of [
    ['/actions/runs/123', 'event', 'pull_request'],
    ['/actions/runs/123', 'conclusion', 'failure'],
    ['/actions/runs/123', 'head_sha', 'd'.repeat(40)],
    ['/actions/runs/123', 'head_repository', { full_name: 'attacker/fork' }],
    ['/actions/runs/123', 'workflow_id', 100],
    [`/commits/${encodeURIComponent(approved.tag)}`, 'sha', 'd'.repeat(40)],
    [`/releases/tags/${encodeURIComponent(approved.tag)}`, 'draft', true],
    ['/actions/artifacts/456', 'expired', true],
    ['/actions/artifacts/456', 'digest', null],
  ]) {
    const object = responses[`repos/${repository}${suffix}`];
    const old = object[field];
    object[field] = value;
    await assert.rejects(verifySource(get, approved));
    object[field] = old;
    cases++;
  }
  await assert.rejects(
    verifySource(get, { ...approved, repository: 'attacker/fork' }),
  );
  await assert.rejects(verifySource(get, { ...approved, tag: 'latest' }));
  const metadata =
    responses[
      `repos/${repository}/contents/.smartcharge-build.json?ref=${sha}`
    ];
  const savedMetadata = metadata.content;
  metadata.content = Buffer.from(
    JSON.stringify({ major: 0, minor: 7, patch: 0, build: 18 }),
  ).toString('base64');
  await assert.rejects(verifySource(get, approved), /release metadata/);
  metadata.content = savedMetadata;
  const future = { ...approved, tag: 'v0.7.1+build.23' };
  responses[`repos/${repository}/commits/${encodeURIComponent(future.tag)}`] = {
    sha,
  };
  responses[
    `repos/${repository}/releases/tags/${encodeURIComponent(future.tag)}`
  ] = {
    ...responses[
      `repos/${repository}/releases/tags/${encodeURIComponent(approved.tag)}`
    ],
    tag_name: future.tag,
    assets: [
      {
        id: 11,
        name: 'smartcharge-manifest.json',
        size: 1234,
        browser_download_url: `https://github.com/${repository}/releases/download/${encodeURIComponent(future.tag)}/smartcharge-manifest.json`,
      },
    ],
  };
  metadata.content = Buffer.from(
    JSON.stringify({ major: 0, minor: 7, patch: 1, build: 23 }),
  ).toString('base64');
  assert.equal((await verifySource(get, future)).version, '0.7.1+build.23');
  metadata.content = savedMetadata;
  cases += 4;
  const now = Date.now();
  const snapshot = {
    devices: {
      car: {
        capabilitiesObj: {
          measure_battery: { value: 100, lastUpdated: now - 60000 },
          text_charging_status: {
            value: 'Charging ends',
            lastUpdated: now - 3600000,
          },
        },
      },
    },
    advancedFlows: {},
  };
  const audit = mercedesAudit(snapshot, 'car', now);
  assert.equal(audit.soc.freshRuntime30Minutes, true);
  assert.equal(audit.status.freshRuntime30Minutes, false);
  snapshot.devices.car.capabilitiesObj.measure_battery.lastUpdated =
    now + 60000;
  assert.equal(
    mercedesAudit(snapshot, 'car', now).soc.freshRuntime30Minutes,
    false,
  );
  delete snapshot.devices.car.capabilitiesObj.measure_battery.lastUpdated;
  assert.equal(
    mercedesAudit(snapshot, 'car', now).soc.freshRuntime30Minutes,
    false,
  );
  console.log(
    `PASS ${cases} authenticated provenance scenarios and Mercedes timestamp freshness; no external requests`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
