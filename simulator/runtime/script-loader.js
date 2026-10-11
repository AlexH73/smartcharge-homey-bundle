const fs = require('fs');
const path = require('path');
const { createFixedDate } = require('./fixed-date');

const FLOW_ENTRIES = Object.freeze({
  'connection-evidence': 'src/90-flows/connection-evidence.entry.js',
  'runtime-controller': 'src/90-flows/runtime-controller.entry.js',
  'start-session': 'src/90-flows/start-session.entry.js',
  'run-decision': 'src/90-flows/run-decision.entry.js',
  'reset-session': 'src/90-flows/reset-session.entry.js',
  'state-sync': 'src/90-flows/state-sync.entry.js',
  'log-on': 'src/90-flows/log-on.entry.js',
  'log-off': 'src/90-flows/log-off.entry.js',
  'manual-on': 'src/90-flows/manual-on.entry.js',
  'manual-off': 'src/90-flows/manual-off.entry.js',
  'auto-mode': 'src/90-flows/auto-mode.entry.js',
  'stability-debug': 'src/90-flows/stability-debug.entry.js',
});

class ScriptLoader {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.srcDir = path.join(rootDir, 'src');
    this.sharedCode = this.collectSharedCode();
  }

  async executeFlow({
    flow,
    homey,
    fetch,
    log,
    now,
    stabilityShadow,
    liveStabilityShadowEnabled,
    stabilityShadowFailure,
  }) {
    const entryPath = FLOW_ENTRIES[flow];

    if (!entryPath) {
      throw new Error(`Unknown flow: ${flow}`);
    }

    const entryCode = fs.readFileSync(
      path.join(this.rootDir, entryPath),
      'utf8',
    );
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction(
      'Homey',
      'fetch',
      'log',
      'Date',
      'stabilityShadow',
      'liveStabilityShadowEnabled',
      'stabilityShadowFailure',
      `${this.sharedCode}\n\n${entryCode}`,
    );

    return fn(
      homey,
      fetch,
      log,
      createFixedDate(now),
      stabilityShadow,
      liveStabilityShadowEnabled,
      stabilityShadowFailure,
    );
  }

  collectSharedCode() {
    return collectSharedFiles(this.srcDir)
      .sort()
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n\n');
  }
}

function collectSharedFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '90-flows') return [];
      return collectSharedFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      return [fullPath];
    }

    return [];
  });
}

module.exports = {
  FLOW_ENTRIES,
  ScriptLoader,
};
