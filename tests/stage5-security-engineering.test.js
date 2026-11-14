/**
 * tests/stage5-security-engineering.test.js
 * Subphase 5.2.2 Verification: Domain 42 (Security Engineering & Zero-Trust Architecture)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * cryptographic SPIFFE/SPIRE workload identity federation, AWS IRSA ServiceAccount integration,
 * and kernel-level Cilium Tetragon eBPF TracingPolicy runtime enforcement.
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

describe('Subphase 5.2.2 — Domain 42 (Security Engineering & Zero-Trust Architecture)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 42 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain42 = pluginManager.getDomain('security-engineering');
    assert.ok(domain42, 'Domain 42 (security-engineering) must exist');
    assert.equal(domain42.category, 'Platform Engineering & Security');
    assert.equal(domain42.trackId, 'track-devsecops');
    assert.equal(domain42.difficulty, 'Advanced');
    assert.equal(domain42.labs.length, 2);
    assert.equal(domain42.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-seceng-01-spiffe-identity-federation',
      'lab-seceng-02-tetragon-ebpf-policy'
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
      'lab-seceng-01-spiffe-identity-federation',
      'lab-seceng-02-tetragon-ebpf-policy'
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

  it('4. Engine Parity: SPIFFE/IRSA Identity Federation & Tetragon TracingPolicy', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });
    const graph = new ResourceGraph();

    terminal.execute('mkdir -p /security');
    terminal.execute('kubectl create namespace production');

    // 1. SPIFFE & AWS IRSA ServiceAccount Manifest
    const spiffeYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: spiffe-workload-identity
  namespace: production
data:
  trustDomain: "prod.kubelabs.io"
  spiffeId: "spiffe://prod.kubelabs.io/ns/production/sa/payment-service-sa"
  svidTtlMinutes: "60"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: payment-service-sa
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/payment-workload-role"`;

    vfs.writeFile('/security/spiffe-workload-identity.yaml', spiffeYaml);
    terminal.execute('kubectl apply -f /security/spiffe-workload-identity.yaml');

    const cm = cluster.getResource('ConfigMap', 'spiffe-workload-identity', 'production');
    assert.ok(cm, 'ConfigMap spiffe-workload-identity must exist');
    assert.equal(cm.data.trustDomain, 'prod.kubelabs.io');
    assert.equal(cm.data.spiffeId, 'spiffe://prod.kubelabs.io/ns/production/sa/payment-service-sa');

    const sa = cluster.getResource('ServiceAccount', 'payment-service-sa', 'production');
    assert.ok(sa, 'ServiceAccount payment-service-sa must exist');
    assert.equal(
      sa.metadata.annotations['eks.amazonaws.com/role-arn'],
      'arn:aws:iam::123456789012:role/payment-workload-role'
    );

    // 2. Tetragon eBPF TracingPolicy & Deployment
    const tetragonYaml = `apiVersion: cilium.io/v1alpha1
kind: TracingPolicy
metadata:
  name: block-unauthorized-binaries
  namespace: production
spec:
  kprobes:
    - call: "sys_execve"
      syscall: true
      args:
        - index: 0
          type: "string"
      selectors:
        - matchArgs:
            - index: 0
              operator: "In"
              values:
                - "/bin/netcat"
                - "/usr/bin/nc"
          matchActions:
            - action: "Sigkill"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-vault-client
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: secure-vault-client
  template:
    metadata:
      labels:
        app: secure-vault-client
    spec:
      containers:
        - name: client
          image: vault-client:v1.0`;

    vfs.writeFile('/security/tetragon-policy.yaml', tetragonYaml);
    terminal.execute('kubectl apply -f /security/tetragon-policy.yaml');

    const tp = cluster.getResource('TracingPolicy', 'block-unauthorized-binaries', 'production');
    assert.ok(tp, 'TracingPolicy block-unauthorized-binaries must exist in VirtualCluster');
    assert.equal(tp.spec.kprobes[0].call, 'sys_execve');
    assert.equal(tp.spec.kprobes[0].selectors[0].matchActions[0].action, 'Sigkill');

    const deploy = cluster.getResource('Deployment', 'secure-vault-client', 'production');
    assert.ok(deploy, 'Deployment secure-vault-client must exist');
    assert.equal(deploy.spec.replicas, 2);

    // 3. ResourceGraph TracingPolicy Kind Alias Verification
    graph.set(tp);
    const retrievedTp = graph.get('TracingPolicy', 'production', 'block-unauthorized-binaries');
    assert.ok(retrievedTp, 'TracingPolicy resource must exist in ResourceGraph');
    assert.equal(retrievedTp.kind, 'TracingPolicy');

    // Test alias normalization in ResourceGraph
    graph.set({
      kind: 'tp',
      metadata: { name: 'alias-test-policy', namespace: 'production' }
    });
    const aliasTp = graph.get('TracingPolicy', 'production', 'alias-test-policy');
    assert.ok(aliasTp, 'Alias tp must normalize to TracingPolicy');
    assert.equal(aliasTp.kind, 'TracingPolicy');
  });
});
