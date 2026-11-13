'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ValidationEngine } = require('../src/core/validationEngine');

// ---------------------------------------------------------------------------
// Unit tests for Subphase 4.1.1: 18-Topic Kubernetes Curriculum Audit & Expansion
// ---------------------------------------------------------------------------

test('Subphase 4.1.1: PluginManager audits all 26 domains and 52 hands-on labs with zero schema errors', () => {
  const pm = new PluginManager();
  assert.equal(pm.validationErrors.length, 0, `Schema validation errors found: ${JSON.stringify(pm.validationErrors)}`);
  assert.equal(pm.plugins.length, 26);
  assert.equal(pm.labMap.size, 52);

  // Verify all 6 tracks exist and contain valid domains
  const tracks = pm.getRoleTracks();
  assert.equal(tracks.length, 6);
  for (const track of tracks) {
    assert.ok(track.id);
    assert.ok(track.title);
    assert.ok(track.certificationTitle);
    assert.ok(Array.isArray(track.domainIds) && track.domainIds.length >= 3);
    for (const dId of track.domainIds) {
      assert.ok(pm.getPlugin(dId), `Track "${track.id}" references missing domain "${dId}"`);
    }
  }
});

test('Subphase 4.1.1: Audit all 18 Mandatory Kubernetes & Platform Engineering topics', () => {
  const pm = new PluginManager();

  const mandatoryTopics = [
    { topic: 'Core Workloads', domainId: 'kubernetes-core' },
    { topic: 'Control Plane Internals', domainId: 'k8s-control-plane-lifecycle' },
    { topic: 'Advanced Scheduling', domainId: 'kubernetes-core' },
    { topic: 'Networking & CNI', domainId: 'cloud-networking' },
    { topic: 'Storage & CSI', domainId: 'storage-csi-velero-dr' },
    { topic: 'Security & Policy', domainId: 'policy-as-code-kyverno' },
    { topic: 'Observability', domainId: 'observability-stack' },
    { topic: 'Autoscaling', domainId: 'autoscaling-keda-karpenter' },
    { topic: 'API Gateway & Ingress', domainId: 'gateway-api-cilium' },
    { topic: 'Service Mesh', domainId: 'service-mesh' },
    { topic: 'GitOps & Delivery', domainId: 'gitops-delivery' },
    { topic: 'Multi-Cluster & Federation', domainId: 'multitenancy-vcluster-crossplane' },
    { topic: 'AWS EKS Production', domainId: 'cloud-aws' },
    { topic: 'Reliability & Chaos', domainId: 'sre-incident-chaos' },
    { topic: 'Runtime & Supply-Chain Security', domainId: 'devsecops-security' },
    { topic: 'Cost Optimization & FinOps', domainId: 'finops-green-cloud' },
    { topic: 'Disaster Recovery & Backup', domainId: 'storage-csi-velero-dr' },
    { topic: 'Cloud-Native AI/ML & Wasm', domainId: 'cloud-native-aiml-kserve' }
  ];

  for (const item of mandatoryTopics) {
    const plugin = pm.getPlugin(item.domainId);
    assert.ok(plugin, `Mandatory topic "${item.topic}" missing backing domain "${item.domainId}"`);
    assert.ok(Array.isArray(plugin.labs) && plugin.labs.length >= 2, `Domain "${item.domainId}" must have at least 2 labs`);
    assert.ok(Array.isArray(plugin.curriculumModules) && plugin.curriculumModules.length >= 2, `Domain "${item.domainId}" must have modules`);
  }
});

test('Subphase 4.1.1: Every single lab has starter manifests, 2+ validation rules, and canonical solution', () => {
  const pm = new PluginManager();
  const allLabs = pm.getAllLabs();

  assert.equal(allLabs.length, 52);

  for (const lab of allLabs) {
    assert.ok(lab.id, 'Lab must have id');
    assert.ok(lab.title, `Lab ${lab.id} must have title`);
    assert.ok(lab.scenario, `Lab ${lab.id} must have scenario`);
    assert.ok(Array.isArray(lab.objectives) && lab.objectives.length >= 2, `Lab ${lab.id} must have at least 2 objectives`);
    assert.ok(Array.isArray(lab.steps) && lab.steps.length >= 2, `Lab ${lab.id} must have at least 2 steps`);
    assert.ok(Array.isArray(lab.validationRules) && lab.validationRules.length >= 2, `Lab ${lab.id} must have at least 2 validation rules`);
    assert.ok(Array.isArray(lab.solutionCommands) && lab.solutionCommands.length >= 1, `Lab ${lab.id} must have solutionCommands`);
    assert.ok(typeof lab.troubleshootingGuide === 'string', `Lab ${lab.id} must have troubleshootingGuide`);
    assert.ok(typeof lab.productionContext === 'string', `Lab ${lab.id} must have productionContext`);

    for (const rule of lab.validationRules) {
      assert.ok(rule.id, `Rule in lab ${lab.id} must have id`);
      assert.ok(rule.type, `Rule in lab ${lab.id} must have type`);
      assert.ok(rule.description, `Rule in lab ${lab.id} must have description`);
      assert.ok(rule.remediation, `Rule in lab ${lab.id} must have remediation`);
    }

    for (const step of lab.steps) {
      assert.ok(typeof step.stepNumber === 'number', `Step in lab ${lab.id} must have stepNumber`);
      assert.ok(step.title, `Step in lab ${lab.id} must have title`);
      assert.ok(step.instruction, `Step in lab ${lab.id} must have instruction`);
      assert.ok(step.commandHint, `Step in lab ${lab.id} must have commandHint`);
    }
  }
});

test('Subphase 4.1.1: Audit all 52 curriculum modules and 52 assessment questions across 26 domains', () => {
  const pm = new PluginManager();
  let moduleCount = 0;
  let questionCount = 0;

  for (const domain of pm.getAllDomains()) {
    assert.ok(domain.curriculumModules.length >= 2, `Domain ${domain.id} must have >= 2 curriculum modules`);
    for (const mod of domain.curriculumModules) {
      moduleCount++;
      assert.ok(mod.id, `Module in ${domain.id} must have id`);
      assert.ok(mod.title, `Module in ${domain.id} must have title`);
      assert.ok(mod.conceptSummary, `Module in ${domain.id} must have conceptSummary`);
      assert.ok(mod.productionArchitecturePattern, `Module in ${domain.id} must have productionArchitecturePattern`);
      assert.ok(Array.isArray(mod.keyCommands) && mod.keyCommands.length > 0, `Module in ${domain.id} must have keyCommands`);
    }

    assert.ok(domain.assessmentQuestions.length >= 2, `Domain ${domain.id} must have >= 2 assessment questions`);
    for (const q of domain.assessmentQuestions) {
      questionCount++;
      assert.ok(q.id, `Question in ${domain.id} must have id`);
      assert.ok(q.question, `Question in ${domain.id} must have question text`);
      assert.ok(Array.isArray(q.options) && q.options.length === 4, `Question in ${domain.id} must have exactly 4 options`);
      assert.ok(typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3, `Question in ${domain.id} must have correctIndex 0-3`);
      assert.ok(q.explanation, `Question in ${domain.id} must have explanation`);
    }
  }

  assert.equal(moduleCount, 52);
  assert.equal(questionCount, 52);
});

test('Subphase 4.1.1: Deterministic Solver Verification across all 52 curriculum hands-on labs', () => {
  const pm = new PluginManager();
  const validator = new ValidationEngine();
  const allLabs = pm.getAllLabs();

  assert.equal(allLabs.length, 52);

  for (const lab of allLabs) {
    const cluster = new VirtualCluster(lab.initialClusterState);
    const vfs = new VirtualFileSystem();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // 1. Initial state check: MUST fail validation (zero false positives)
    const initialReport = validator.evaluate(lab.validationRules, cluster, term.commandHistory);
    assert.equal(initialReport.passed, false, `Lab "${lab.id}" must fail before solution`);
    assert.ok(initialReport.score < 100, `Lab "${lab.id}" initial score must be < 100`);

    // 2. Execute canonical solution commands
    for (const cmd of lab.solutionCommands) {
      const res = term.execute(cmd, { manifestText: lab.starterManifest });
      assert.equal(res.exitCode, 0, `Command failed in lab "${lab.id}": "${cmd}" => ${res.output}`);
    }

    // 3. Post-solution check: MUST pass 100%
    const solvedReport = validator.evaluate(lab.validationRules, cluster, term.commandHistory);
    assert.equal(
      solvedReport.passed,
      true,
      `Lab "${lab.id}" failed after solutionCommands: ${JSON.stringify(solvedReport.results)}`
    );
    assert.equal(solvedReport.score, 100, `Lab "${lab.id}" score must be 100%`);
  }
});
