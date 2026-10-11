const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Intentionally targeted rules: hashes and synthetic simulator IDs are not secrets.
function inspectText(text, knownToken = process.env.HOMEY_API_TOKEN) {
  const rules = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    [
      'github-token',
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    ],
    ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/],
    [
      'credential-literal',
      /(?:HOMEY_API_TOKEN|TIBBER_TOKEN|apiToken|access_token)\s*["']?\s*[:=]\s*["'][A-Za-z0-9._-]{24,}["']/,
    ],
  ];
  const findings = rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  if (knownToken && knownToken.length >= 12 && text.includes(knownToken))
    findings.push('environment-token');
  return findings;
}

function prohibitedPath(file) {
  return (
    /^(?:backup|reports|local-output|verified-artifact|approved-provenance|review|patches)\//i.test(
      file,
    ) ||
    /^diagnostics\/(?!fixtures\/|tests\/|README\.md$)/i.test(file) ||
    (/^(?:maintenance.*\.json|provenance\.json|smartcharge-(?:manifest\.json|release\.zip)|[^/]+\.(?:patch|diff)|\.env(?:\..*)?)$/i.test(
      file,
    ) &&
      file !== '.env.example') ||
    /(?:^|\/)(?:snapshot\.json|flow-audit\.json|deployment-report(?:\.ru)?\.md)$/.test(
      file,
    )
  );
}

function assertPublicText(file, text) {
  const findings = inspectText(text);
  if (findings.length)
    throw new Error(`Public safety refused ${file}: ${findings.join(', ')}`);
}

function checkRepository(root = path.resolve(__dirname, '..')) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    if (prohibitedPath(file))
      throw new Error(`Private/temporary tracked path: ${file}`);
    // Check both the index and working copy: staged secrets must not escape review.
    assertPublicText(
      file,
      execFileSync('git', ['show', ':' + file], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
      }).toString(),
    );
    if (fs.existsSync(path.join(root, file)))
      assertPublicText(file, fs.readFileSync(path.join(root, file)).toString());
  }
  console.log(
    `PASS public safety: ${files.length} tracked files (index and working copy)`,
  );
}

if (require.main === module) {
  try {
    checkRepository();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {
  inspectText,
  prohibitedPath,
  assertPublicText,
  checkRepository,
};
