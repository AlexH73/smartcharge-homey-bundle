// GitHub-authenticated provenance, not merely self-reported artifact checksums.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./release-artifact');
const sourceRepository = 'AlexH73/smartcharge-homey-bundle';

async function verifySource(get, approved) {
  assert.equal(approved.repository, sourceRepository);
  assert.match(approved.sha, /^[a-f0-9]{40}$/);
  assert.match(approved.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(approved.tag, /^v?0\.6\.4\+build\.17$/);
  assert.match(String(approved.runId), /^[0-9]+$/);
  assert.match(String(approved.artifactId), /^[0-9]+$/);
  const prefix = `repos/${sourceRepository}`;
  assert.equal(
    (await get(prefix)).private,
    false,
    'Source must be the approved public repository',
  );
  const run = await get(`${prefix}/actions/runs/${approved.runId}`);
  const workflow = await get(`${prefix}/actions/workflows/smartcharge-ci.yml`);
  assert.equal(run.workflow_id, workflow.id);
  assert.equal(run.head_repository.full_name, sourceRepository);
  assert.equal(run.head_sha, approved.sha);
  assert.equal(run.conclusion, 'success');
  assert.equal(run.status, 'completed');
  assert.ok(
    ['push', 'workflow_dispatch'].includes(run.event),
    'PR artifacts cannot deploy',
  );
  const commit = await get(
    `${prefix}/commits/${encodeURIComponent(approved.tag)}`,
  );
  assert.equal(
    commit.sha,
    approved.sha,
    'Release tag must resolve to approved commit, including annotated tags',
  );
  const release = await get(
    `${prefix}/releases/tags/${encodeURIComponent(approved.tag)}`,
  );
  assert.equal(release.tag_name, approved.tag);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  const assets = release.assets.filter(
    (asset) => asset.name === 'smartcharge-manifest.json',
  );
  assert.equal(
    assets.length,
    1,
    'Exactly one published release manifest required',
  );
  const asset = assets[0];
  const expectedUrl = `https://github.com/${sourceRepository}/releases/download/${encodeURIComponent(approved.tag)}/smartcharge-manifest.json`;
  assert.equal(
    decodeURIComponent(asset.browser_download_url),
    decodeURIComponent(expectedUrl),
  );
  assert.ok(asset.size > 0 && asset.size < 1024 * 1024);
  const artifact = await get(
    `${prefix}/actions/artifacts/${approved.artifactId}`,
  );
  assert.equal(artifact.expired, false);
  assert.equal(artifact.workflow_run.id, Number(approved.runId));
  assert.equal(artifact.workflow_run.head_sha, approved.sha);
  assert.equal(
    artifact.name,
    `smartcharge-${approved.sha}-${approved.runId}-${run.run_attempt}`,
  );
  assert.match(
    artifact.digest,
    /^sha256:[a-f0-9]{64}$/,
    'GitHub artifact digest required',
  );
  return {
    schemaVersion: 1,
    ...approved,
    releaseId: release.id,
    manifestAssetId: asset.id,
    manifestAssetUrl: asset.browser_download_url,
    artifactDigest: artifact.digest,
  };
}

function checkManifest(directory, provenance, publishedFile) {
  const manifest = fs.readFileSync(path.join(directory, 'manifest.json'));
  assert.equal(
    sha256(manifest),
    provenance.manifestSha256,
    'Artifact differs from independently approved manifest',
  );
  assert.deepEqual(
    manifest,
    fs.readFileSync(publishedFile),
    'Artifact manifest differs from approved published release',
  );
}

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      if (process.argv[2] === 'manifest') {
        checkManifest(
          process.argv[3],
          JSON.parse(fs.readFileSync(process.argv[4])),
          process.argv[5],
        );
        console.log('PASS approved artifact/release manifests match');
        return;
      }
      const token = process.env.SOURCE_READ_TOKEN;
      assert.ok(token);
      const get = async (endpoint) => {
        const response = await fetch('https://api.github.com/' + endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        assert.ok(response.ok);
        return response.json();
      };
      const result = await verifySource(get, {
        repository: process.env.SOURCE_REPOSITORY,
        sha: process.env.SOURCE_COMMIT_SHA,
        tag: process.env.SOURCE_RELEASE_TAG,
        manifestSha256: process.env.SOURCE_MANIFEST_SHA256,
        runId: process.env.CI_RUN_ID,
        artifactId: process.env.ARTIFACT_ID,
      });
      fs.writeFileSync(
        process.argv[3] || 'provenance.json',
        JSON.stringify(result, null, 2) + '\n',
      );
      if (process.env.GITHUB_OUTPUT)
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `manifest_asset_id=${result.manifestAssetId}\n`,
        );
      console.log(
        'PASS approved public source, CI provenance, release tag and immutable artifact identity',
      );
    })
    .catch(() => {
      console.error('Release source verification refused; no Homey access');
      process.exitCode = 1;
    });
}
module.exports = { verifySource, checkManifest };
