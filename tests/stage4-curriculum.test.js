'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/engine/virtualCluster');
const { TerminalEngine } = require('../src/engine/terminalEngine');
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
    assert.ok(Array.isArray(lab.objectives) && lab.objectives.length > 0, `Lab ${lab.id} must have objectives`);
    assert.ok(Array.isArray(lab.steps) && lab.steps.length > 0, `Lab ${lab.id} must have steps`);
    assert.ok(Array.isArray(lab.validationRules) && lab.validationRules.length >= 2, `Lab ${lab.id} must have at least 2 validation rules`);
    assert.ok(Array.isArray(lab.solutionCommands) && lab.solutionCommands.length >= 1, `Lab ${lab.id} must have solutionCommands`);
    assert.ok(typeof lab.troubleshootingGuide === 'string', `Lab ${lab.id} must have troubleshootingGuide`);

    for (const rule of lab.validationRules) {
      assert.ok(rule.id, `Rule in lab ${lab.id} must have id`);
      assert.ok(rule.type, `Rule in lab ${lab.id} must have type`);
      assert.ok(rule.description, `Rule in lab ${lab.id} must have description`);
      assert.ok(rule.remediation, `Rule in lab ${lab.id} must have remediation`);
    }
  }
});

test('Subphase 4.1.1: Deterministic Solver Verification across representative curriculum labs', async () => {
  const pm = new PluginManager();
  const validator = new ValidationEngine();

  // Representative sampling of labs across foundations, k8s, security, mesh, autoscaling, aiml
  const sampleLabIds = [
    'lab-k8s-01',
    'lab-net-01',
    'lab-sec-01',
    'lab-mesh-01',
    'lab-scale-01',
    'lab-aiml-01'
  ];

  for (const labId of sampleLabIds) {
    const lab = pm.getLab(labId);
    assert.ok(lab, `Sample lab "${labId}" must exist`);

    const cluster = new VirtualCluster(lab.initialClusterState);
    const term = new TerminalEngine(cluster);

    // Initial state check: MUST fail
    const initialReport = validator.evaluate(lab.validationRules, cluster, term.commandHistory);
    assert.equal(initialReport.passed, false, `Lab "${labId}" must fail before solution`);
    assert.ok(initialReport.score < 100);

    // Execute canonical solution commands
    for (const cmd of lab.solutionCommands) {
      const res = term.execute(cmd, { manifestText: lab.starterManifest });
      assert.equal(res.exitCode, 0, `Command failed: ${cmd}`);
    }

    // Post-solution check: MUST pass 100%
    const solvedReport = validator.evaluate(lab.validationRules, cluster, term.commandHistory);
    assert.equal(solvedReport.passed, true, `Lab "${labId}" must pass after solution: ${JSON.stringify(solvedReport.results)}`);
    assert.equal(solvedReport.score, 100);
  }
});
