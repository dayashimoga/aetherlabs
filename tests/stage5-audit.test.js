'use strict';

/**
 * Stage 5 Phase 5.2 Subphase 5.2.2 - Self-Audit Gate, Subphase Ledger & Runbooks Verification Tests
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AgentOrchestrator } = require('../src/agents/orchestrator');
const { PluginManager } = require('../src/plugins/pluginManager');

const rootDir = path.join(__dirname, '..');
const pluginManager = new PluginManager(
  path.join(rootDir, 'plugins'),
  path.join(rootDir, 'schemas', 'plugin.schema.json')
);
const orchestrator = new AgentOrchestrator({ rootDir, pluginManager });

test('Subphase 5.2.2: 11-Agent Self-Audit Gate passes 100% across all 53 checks', () => {
  const report = orchestrator.runFullAudit();
  assert.equal(report.passed, true, 'All 11 agents must pass');
  assert.equal(report.agents.length, 11, 'Must evaluate 11 autonomous agents');
  assert.ok(report.memoryRssMB < 150, `Memory RSS (${report.memoryRssMB}MB) must be below 150MB envelope`);

  for (const agent of report.agents) {
    assert.equal(agent.status, 'PASS', `Agent ${agent.id} must pass`);
    for (const check of agent.checks) {
      assert.equal(check.passed, true, `Check "${check.name}" in agent ${agent.id} must pass`);
    }
  }
});

test('Subphase 5.2.2: Strict Zero External Dependencies Invariant is maintained', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies, {}, 'package.json dependencies must be strictly empty');
  assert.equal(pkg.version, '3.0.0', 'KubeLabs version must be 3.0.0');
});

test('Subphase 5.2.2: Zero placeholders or forbidden markers exist in production source code', () => {
  const forbidden = ['TODO:', 'FIXME:', 'PLACEHOLDER_IMPLEMENTATION', 'COMING_SOON_STUB'];
  const dirs = [
    path.join(rootDir, 'src', 'core'),
    path.join(rootDir, 'src', 'db'),
    path.join(rootDir, 'src', 'api'),
    path.join(rootDir, 'public', 'js')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith('.js')) {
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        for (const marker of forbidden) {
          assert.equal(
            content.includes(marker),
            false,
            `File ${f} in ${dir} contains forbidden marker "${marker}"`
          );
        }
      }
    }
  }
});

test('Subphase 5.2.2: Operations Runbooks docs/08-OPERATIONS-AND-RUNBOOKS.md is complete and authoritative', () => {
  const runbookPath = path.join(rootDir, 'docs', '08-OPERATIONS-AND-RUNBOOKS.md');
  assert.ok(fs.existsSync(runbookPath), 'docs/08-OPERATIONS-AND-RUNBOOKS.md must exist');
  const text = fs.readFileSync(runbookPath, 'utf8');

  assert.ok(text.includes('Version**: 3.0.0'), 'Must document version 3.0.0');
  assert.ok(text.includes('Runbook RB-01'), 'Must include RB-01 (Resetting Learner State)');
  assert.ok(text.includes('Runbook RB-02'), 'Must include RB-02 (Adding New Domain Plugin)');
  assert.ok(text.includes('Runbook RB-03'), 'Must include RB-03 (Ed25519 & HMAC-SHA256 Verification)');
  assert.ok(text.includes('Runbook RB-04'), 'Must include RB-04 (Offline Sync & CRDT)');
  assert.ok(text.includes('Runbook RB-05'), 'Must include RB-05 (Desktop Packaging)');
  assert.ok(text.includes('Runbook RB-06'), 'Must include RB-06 (Mobile Packaging)');
  assert.ok(text.includes('Runbook RB-07'), 'Must include RB-07 (Incident Commander & MTTR)');
  assert.ok(text.includes('Runbook RB-08'), 'Must include RB-08 (Zero-Downtime Deployment & Graceful Drain)');
  assert.ok(text.includes('Master Test Plan & Quality Gates'), 'Must include test plan matrix');
  assert.ok(text.includes('Production Readiness Checklist'), 'Must include production checklist');
});
