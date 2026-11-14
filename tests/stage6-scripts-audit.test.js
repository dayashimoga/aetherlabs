'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { AgentOrchestrator } = require('../src/agents/orchestrator');
const { PluginManager } = require('../src/plugins/pluginManager');

describe('Subphase 6.3.1 — Upgrade self-audit.js & verify-subphases.js for 54 Subphases', () => {
  const rootDir = path.join(__dirname, '..');
  const verifyScriptPath = path.join(rootDir, 'scripts', 'verify-subphases.js');
  const selfAuditScriptPath = path.join(rootDir, 'scripts', 'self-audit.js');
  const orchestratorPath = path.join(rootDir, 'src', 'agents', 'orchestrator.js');

  test('1. verify-subphases.js Models Exactly 54 Subphases across 6 Stages and 18 Phases', () => {
    assert.ok(fs.existsSync(verifyScriptPath), 'scripts/verify-subphases.js must exist');
    const content = fs.readFileSync(verifyScriptPath, 'utf8');

    assert.ok(content.includes('54 SUBPHASES'), 'Script header must state 54 SUBPHASES');

    // Verify all 6 stages and 18 phases are declared
    for (let stage = 1; stage <= 6; stage++) {
      assert.ok(content.includes(`Stage ${stage}`), `Script must verify Stage ${stage}`);
      for (let phase = 1; phase <= 3; phase++) {
        assert.ok(content.includes(`Phase ${stage}.${phase}`), `Script must verify Phase ${stage}.${phase}`);
        for (let sub = 1; sub <= 3; sub++) {
          assert.ok(
            content.includes(`Subphase ${stage}.${phase}.${sub}`),
            `Script must verify Subphase ${stage}.${phase}.${sub}`
          );
        }
      }
    }
  });

  test('2. AgentOrchestrator Evaluates 11 Specialized Autonomous Agents & 54 Quality Checks', () => {
    const orch = new AgentOrchestrator({ rootDir });
    const report = orch.runFullAudit();

    assert.equal(report.passed, true, 'runFullAudit must return passed: true');
    assert.equal(report.agents.length, 11, 'Must evaluate exactly 11 specialized engineering agents');

    const expectedAgents = [
      'agent-product',
      'agent-architect',
      'agent-backend',
      'agent-frontend',
      'agent-kubernetes',
      'agent-curriculum',
      'agent-devops',
      'agent-security',
      'agent-qa',
      'agent-documentation',
      'agent-platform'
    ];

    for (const aId of expectedAgents) {
      const a = report.agents.find((ag) => ag.id === aId);
      assert.ok(a, `Orchestrator report must include ${aId}`);
      assert.equal(a.status, 'PASS', `Agent ${aId} status must be PASS`);
    }

    const totalChecks = report.agents.reduce((acc, a) => acc + a.checks.length, 0);
    assert.equal(totalChecks, 54, 'Must evaluate exactly 54 individual quality checks matching 54 subphases');
  });

  test('3. Product & Curriculum Agents Validate 45 Domains & 90 Labs', () => {
    const orch = new AgentOrchestrator({ rootDir });
    const prod = orch.auditProductAgent();
    assert.equal(prod.status, 'PASS');
    const currCheck = prod.checks.find((c) => c.name.includes('45 Cloud-Native'));
    assert.ok(currCheck && currCheck.passed, 'Product agent must pass 45-domain check');

    const curr = orch.auditCurriculumAgent();
    assert.equal(curr.status, 'PASS');
    const labsCheck = curr.checks.find((c) => c.name.includes('90 hands-on interactive labs'));
    assert.ok(labsCheck && labsCheck.passed, 'Curriculum agent must pass 90-lab check');
  });

  test('4. QA Agent Validates Deterministic 90-Lab & 25-Incident Solvers', () => {
    const orch = new AgentOrchestrator({ rootDir });
    const qa = orch.auditQaAgent();
    assert.equal(qa.status, 'PASS');

    const labSolver = qa.checks.find((c) => c.name.includes('90 interactive labs'));
    assert.ok(labSolver && labSolver.passed, 'QA agent must verify all 90 curriculum labs solvable');

    const incSolver = qa.checks.find((c) => c.name.includes('25 production incident simulations'));
    assert.ok(incSolver && incSolver.passed, 'QA agent must verify all 25 chaos incident simulations resolvable');
  });

  test('5. Documentation Agent Validates Key Artifacts including V4 Tracking Ledger', () => {
    const orch = new AgentOrchestrator({ rootDir });
    const doc = orch.auditDocumentationAgent();
    assert.equal(doc.status, 'PASS');

    const ledgerCheck = doc.checks.find((c) => c.name.includes('15-V4-SUBPHASE-TRACKING-LEDGER.md'));
    assert.ok(ledgerCheck && ledgerCheck.passed, 'Documentation agent must verify V4 tracking ledger complete');
  });

  test('6. Platform Agent Validates Low-Resource Budget & Zero-Stub Integrity', () => {
    const orch = new AgentOrchestrator({ rootDir });
    const plat = orch.auditPlatformEngineeringAgent();
    assert.equal(plat.status, 'PASS');

    const rssCheck = plat.checks.find((c) => c.name.includes('Low-resource memory budget'));
    assert.ok(rssCheck && rssCheck.passed, 'Platform agent must verify RSS < 150MB');

    const stubCheck = plat.checks.find((c) => c.name.includes('Zero placeholders, TODOs'));
    assert.ok(stubCheck && stubCheck.passed, 'Platform agent must verify zero forbidden stub markers');
  });
});
