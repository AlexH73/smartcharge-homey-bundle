// Read-only structural audit; never execute Flow cards or installed script code.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { inventory, createReader } = require('./homey-discovery');

function flowCards(flow, advanced) {
  if (advanced) {
    assert.ok(
      flow.cards && typeof flow.cards === 'object',
      'Unknown Advanced Flow shape',
    );
    return Object.entries(flow.cards).map(([key, card]) => ({ key, ...card }));
  }
  assert.ok(
    Array.isArray(flow.actions) && Array.isArray(flow.conditions),
    'Unknown Flow shape',
  );
  return [
    ...(flow.trigger
      ? [{ key: 'trigger', ...flow.trigger, type: 'trigger' }]
      : []),
    ...flow.conditions.map((card, i) => ({
      key: `condition-${i}`,
      ...card,
      type: 'condition',
    })),
    ...flow.actions.map((card, i) => ({
      key: `action-${i}`,
      ...card,
      type: 'action',
    })),
  ];
}

function auditFlows(snapshot, plugId) {
  assert.ok(
    snapshot.devices[plugId],
    'Explicit plug ID not found in inventory',
  );
  const scripts = Object.values(snapshot.scripts).map((script) => {
    const code = script.code || '';
    const entry = code.split('// Source file: src/90-flows/').at(-1);
    return {
      id: script.id,
      name: script.name,
      installedVersion: /^\/\/ Version: (.+)$/m.exec(code)?.[1]?.trim() || null,
      actuatorCandidate:
        /setCapabilityValue|setDeviceOn|setDeviceOff|runRuntimeController|runCanonicalDecision|requestManualMode|executeRuntimePlugCommand/.test(
          entry,
        ),
      dynamicExecutionCandidate:
        /runScript|runFlowCard|Homey\.flow|Homey\.apps|\.fetch\(|\beval\(|new Function|fetch\(/.test(
          entry,
        ),
    };
  });
  const flows = [];
  for (const [kind, collection] of [
    ['flow', snapshot.flows],
    ['advancedflow', snapshot.advancedFlows],
  ]) {
    for (const flow of Object.values(collection)) {
      const cards = flowCards(flow, kind === 'advancedflow');
      const calls = cards.filter((card) =>
        /homey:app:com\.athom\.homeyscript:/.test(card.id || ''),
      );
      const plugCards = cards.filter(
        (card) =>
          card.type === 'action' &&
          (card.id || '').startsWith(`homey:device:${plugId}:`),
      );
      const delegates = cards.filter(
        (card) =>
          card.type === 'action' && /homey:manager:flow:/.test(card.id || ''),
      );
      if (!calls.length && !plugCards.length && !delegates.length) continue;
      flows.push({
        kind,
        id: flow.id,
        name: flow.name,
        enabled: flow.enabled,
        triggers: cards
          .filter((card) => card.type === 'trigger' || card.type === 'start')
          .map((card) => ({
            key: card.key,
            id: card.id || 'start',
            schedule:
              card.id === 'homey:manager:cron:every_nth' ? card.args : null,
          })),
        scripts: calls.map((card) => ({
          key: card.key,
          card: card.id,
          id: card.args?.script?.id || null,
          name: snapshot.scripts[card.args?.script?.id]?.name || null,
        })),
        directPlugCards: plugCards.map((card) => ({
          key: card.key,
          id: card.id,
        })),
        delegatedFlows: delegates.map((card) => ({
          key: card.key,
          id: card.id,
        })),
        // Conservatively include every HomeyScript/inline-code and delegated Flow call.
        maintenanceRequired: true,
      });
    }
  }
  return {
    schemaVersion: 1,
    recordedAt: snapshot.recordedAt,
    plugId,
    scripts,
    flows,
    enabledMaintenanceFlows: flows
      .filter((flow) => flow.enabled !== false)
      .map((flow) => ({ kind: flow.kind, id: flow.id, name: flow.name })),
    limitations:
      'Static candidate inventory: disconnected Advanced Flow cards are included. External Apps, schedules, pending executions and manual script runs require operator inspection. This is not a mutex or proof that every writer is known.',
  };
}

function markdownAudit(audit) {
  const cell = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ');
  const rows = audit.flows.map(
    (flow) =>
      `| ${cell(flow.name)} | ${flow.kind}: ${flow.id} | ${flow.enabled === false ? 'disabled' : 'enabled/unknown'} | ${cell(flow.triggers.map((trigger) => trigger.id + (trigger.schedule ? ' ' + JSON.stringify(trigger.schedule) : '')).join('; '))} | ${cell(flow.scripts.map((script) => `${script.name || 'inline/unknown'} (${script.id || script.card}), card=${script.key}`).join('; '))} | ${cell(flow.directPlugCards.map((card) => `${card.id}, card=${card.key}`).join('; '))} |`,
  );
  return `# Read-only Homey Flow audit\n\nSnapshot: ${audit.recordedAt}. Plug ID: \`${audit.plugId}\`.\n\n| Flow | ID | State | Triggers | HomeyScripts | Direct plug actions |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Scripts: potential writers\n\n${audit.scripts.map((script) => `- ${script.name}: \`${script.id}\`, ${script.installedVersion || 'no release header'}, actuator candidate=${script.actuatorCandidate}, dynamic execution candidate=${script.dynamicExecutionCandidate}`).join('\n')}\n\nAll listed HomeyScript, inline-code and delegated Flow calls conservatively require maintenance. Homey Advanced Flows cards are included even without connected outputs: a card does not prove execution. Inspect external Apps, delayed calls and manual runs separately. No strict mutex is provided.\n`;
}

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const snapshot = await inventory(
        createReader(process.env.HOMEY_URL, process.env.HOMEY_API_TOKEN),
      );
      const audit = auditFlows(snapshot, process.env.HOMEY_PLUG_ID);
      const output = path.resolve(
        process.argv[2] || 'diagnostics/cicd-0.6.4/flow-audit.md',
      );
      fs.writeFileSync(output, markdownAudit(audit));
      console.log(
        `Read-only Flow audit: ${audit.flows.length} candidate Flows; ${audit.enabledMaintenanceFlows.length} enabled/unknown; Homey unchanged`,
      );
    })
    .catch(() => {
      console.error(
        'Flow audit failed; verify API access, version and inventory shape',
      );
      process.exitCode = 1;
    });
}

module.exports = { auditFlows, markdownAudit };
