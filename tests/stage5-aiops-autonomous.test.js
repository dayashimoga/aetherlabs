/**
 * tests/stage5-aiops-autonomous.test.js
 * Subphase 5.3.1 Verification: Domain 45 (Autonomous AI-Ops & GPU Inference Infrastructure)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * k8sgpt AI root-cause analysis diagnostics, NVIDIA GPU scheduling & KServe vLLM inference runtimes,
 * and closed-loop autonomous remediation controllers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { ResourceGraph } = require('../src/core/resourceGraph');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 5.3.1 — Domain 45 (Autonomous AI-Ops & GPU Inference Infrastructure)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 45 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain45 = pluginManager.getDomain('aiops-autonomous');
    assert.ok(domain45, 'Domain 45 (aiops-autonomous) must exist');
    assert.equal(domain45.category, 'AI-Ops & Emerging Tech');
    assert.equal(domain45.trackId, 'track-multicloud-aiops');
    assert.equal(domain45.labs.length, 2);
    assert.equal(domain45.assessmentQuestions.length, 2);

    // Verify Tier 7 registry contains domain 45
    const tiers = catalog.getTiers();
    const tier7 = tiers.find((t) => t.tier === 7);
    assert.ok(tier7, 'Tier 7 must exist in CurriculumCatalog');
    assert.ok(
      tier7.domainIds.includes('aiops-autonomous'),
      'Tier 7 must register domain aiops-autonomous'
    );
  });

  it('2. Deterministic Solver: Both labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-aiops-01-k8sgpt-triage',
      'lab-aiops-02-gpu-kserve-inference'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 2, 'Must find both subphase labs');

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} pre-score must be 0%, but got ${report.score}%. Report: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, false, `Lab ${lab.id} must not pass before solution`);
    }
  });

  it('3. Deterministic Solver: Both labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-aiops-01-k8sgpt-triage',
      'lab-aiops-02-gpu-kserve-inference'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands
      for (const cmd of lab.solutionCommands) {
        terminal.execute(cmd);
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} post-score must be 100%, but got ${report.score}%. Rules: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, true, `Lab ${lab.id} must pass after canonical solution`);
    }
  });

  it('4. Engine Parity: k8sgpt AI Analyzer, GPU Slicing & KServe InferenceService', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });
    const graph = new ResourceGraph();

    terminal.execute('mkdir -p /aiops');
    terminal.execute('kubectl create namespace monitoring');
    terminal.execute('kubectl create namespace ai-workloads');

    // 1. k8sgpt Analyzer Manifest & CLI Execution
    const k8sgptYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: k8sgpt-ai-analyzer-config
  namespace: monitoring
data:
  aiProvider: "local-llm"
  enabledFilters: "Pod,Service,Ingress,PersistentVolumeClaim"
  backendEndpoint: "http://aiops-engine.monitoring.svc:8080/v1"
  autoExplain: "true"`;

    vfs.writeFile('/aiops/k8sgpt-config.yaml', k8sgptYaml);
    terminal.execute('kubectl apply -f /aiops/k8sgpt-config.yaml');
    const aiopsOutput = terminal.execute('aiops analyze');
    assert.equal(aiopsOutput.exitCode, 0);

    const cm = cluster.getResource('ConfigMap', 'k8sgpt-ai-analyzer-config', 'monitoring');
    assert.ok(cm, 'ConfigMap k8sgpt-ai-analyzer-config must exist');
    assert.equal(cm.data.aiProvider, 'local-llm');
    assert.equal(cm.data.autoExplain, 'true');

    // 2. KServe InferenceService & Autonomous Remediation Controller
    const kserveYaml = `apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: llm-inference-gateway
  namespace: ai-workloads
spec:
  predictor:
    model:
      modelFormat:
        name: "vllm"
      resources:
        limits:
          nvidia.com/gpu: "1"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: autonomous-remediation-controller
  namespace: ai-workloads
spec:
  replicas: 2
  selector:
    matchLabels:
      app: autonomous-remediation-controller
  template:
    metadata:
      labels:
        app: autonomous-remediation-controller
    spec:
      containers:
        - name: controller
          image: aiops-controller:v2.4`;

    vfs.writeFile('/aiops/kserve-inference.yaml', kserveYaml);
    terminal.execute('kubectl apply -f /aiops/kserve-inference.yaml');

    const isvc = cluster.getResource('InferenceService', 'llm-inference-gateway', 'ai-workloads');
    assert.ok(isvc, 'InferenceService llm-inference-gateway must exist');
    assert.equal(isvc.spec.predictor.model.modelFormat.name, 'vllm');
    assert.equal(isvc.spec.predictor.model.resources.limits['nvidia.com/gpu'], '1');

    const deploy = cluster.getResource('Deployment', 'autonomous-remediation-controller', 'ai-workloads');
    assert.ok(deploy, 'Deployment autonomous-remediation-controller must exist');
    assert.equal(deploy.spec.replicas, 2);

    // 3. ResourceGraph Kind Alias Normalization (isvc -> InferenceService)
    graph.set(isvc);
    const retrievedIsvc = graph.get('InferenceService', 'ai-workloads', 'llm-inference-gateway');
    assert.ok(retrievedIsvc, 'InferenceService must exist in ResourceGraph');
    assert.equal(retrievedIsvc.kind, 'InferenceService');

    graph.set({
      kind: 'isvc',
      metadata: { name: 'alias-test-model', namespace: 'ai-workloads' }
    });
    const aliasIsvc = graph.get('InferenceService', 'ai-workloads', 'alias-test-model');
    assert.ok(aliasIsvc, 'Alias isvc must normalize to InferenceService in ResourceGraph');
    assert.equal(aliasIsvc.kind, 'InferenceService');
  });
});
