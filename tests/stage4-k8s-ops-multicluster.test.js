/**
 * tests/stage4-k8s-ops-multicluster.test.js
 * Subphase 4.3.3 Verification: Domain 35 (Kubernetes Production Operations) & Domain 36 (Multi-Cluster Management)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * API Priority and Fairness (APF) FlowSchema and PriorityLevelConfiguration traffic shaping,
 * offline and online etcd compaction, defragmentation, and endpoint status auditing,
 * Cluster API (CAPI) declarative MachineDeployment worker fleet provisioning,
 * and cross-cluster service discovery with Cilium ClusterMesh and Kubernetes Multi-Cluster Services (MCS) ServiceImport.
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

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.3.3 — Domain 35 (K8s Prod Ops) & Domain 36 (Multi-Cluster Management)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 35 and 36 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain35 = pluginManager.getDomain('k8s-production-operations');
    assert.ok(domain35, 'Domain 35 (k8s-production-operations) must exist');
    assert.equal(domain35.category, 'Platform Operations & Performance');
    assert.equal(domain35.trackId, 'track-platform');
    assert.equal(domain35.labs.length, 2);
    assert.equal(domain35.assessmentQuestions.length, 2);

    const domain36 = pluginManager.getDomain('multi-cluster-management');
    assert.ok(domain36, 'Domain 36 (multi-cluster-management) must exist');
    assert.equal(domain36.category, 'Platform Operations & Performance');
    assert.equal(domain36.trackId, 'track-platform');
    assert.equal(domain36.labs.length, 2);
    assert.equal(domain36.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-k8sops-01-flowschema-apf',
      'lab-k8sops-02-etcd-defrag',
      'lab-mcm-01-capi-machinedeployment',
      'lab-mcm-02-cilium-clustermesh-mcs'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 subphase labs');

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

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-k8sops-01-flowschema-apf',
      'lab-k8sops-02-etcd-defrag',
      'lab-mcm-01-capi-machinedeployment',
      'lab-mcm-02-cilium-clustermesh-mcs'
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

  it('4. Engine Parity: Domain 35 APF FlowSchema, PriorityLevelConfiguration & etcd Defragmentation', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /ops');

    const flowSchemaYaml = `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: FlowSchema
metadata:
  name: batch-workload-flowschema
spec:
  priorityLevelConfiguration:
    name: workload-low
  matchingPrecedence: 500
  rules:
    - subjects:
        - kind: ServiceAccount
          serviceAccount:
            name: "*"
            namespace: batch
      resourceRules:
        - verbs: ["*"]
          apiGroups: ["*"]
          resources: ["*"]`;

    vfs.writeFile('/ops/flowschema-batch.yaml', flowSchemaYaml);
    terminal.execute('kubectl apply -f /ops/flowschema-batch.yaml');

    const fsRes = cluster.getResource('FlowSchema', 'batch-workload-flowschema');
    assert.ok(fsRes, 'FlowSchema batch-workload-flowschema must exist in cluster');
    assert.equal(fsRes.spec.priorityLevelConfiguration.name, 'workload-low');
    assert.equal(fsRes.spec.matchingPrecedence, 500);

    // etcd maintenance commands
    const compactRes = terminal.execute('etcdctl compact 5000');
    assert.equal(compactRes.exitCode, 0);
    assert.ok(compactRes.output.includes('compacted'));

    const defragRes = terminal.execute('etcdctl defrag');
    assert.equal(defragRes.exitCode, 0);
    assert.ok(defragRes.output.includes('Finished defragmenting'));

    const statusRes = terminal.execute('etcdctl endpoint status');
    assert.equal(statusRes.exitCode, 0);
    assert.ok(statusRes.output.includes('ENDPOINT'));
    assert.ok(statusRes.output.includes('3.5.15'));
  });

  it('5. Engine Parity: Domain 36 Cluster API MachineDeployment & Cilium ClusterMesh MCS', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /fleet');
    terminal.execute('kubectl create namespace fleet-system');
    terminal.execute('kubectl create namespace production');

    // 1. CAPI MachineDeployment
    const machineDeploymentYaml = `apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: prod-worker-fleet
  namespace: fleet-system
spec:
  clusterName: prod-cluster
  replicas: 3
  selector:
    matchLabels:
      cluster.x-k8s.io/cluster-name: prod-cluster
  template:
    metadata:
      labels:
        cluster.x-k8s.io/cluster-name: prod-cluster
    spec:
      clusterName: prod-cluster
      version: v1.32.0`;

    vfs.writeFile('/fleet/worker-fleet.yaml', machineDeploymentYaml);
    terminal.execute('kubectl apply -f /fleet/worker-fleet.yaml');

    const md = cluster.getResource('MachineDeployment', 'prod-worker-fleet', 'fleet-system');
    assert.ok(md, 'MachineDeployment prod-worker-fleet must exist');
    assert.equal(md.spec.clusterName, 'prod-cluster');
    assert.equal(md.spec.replicas, 3);

    // 2. Cilium ClusterMesh status
    const meshStatusRes = terminal.execute('cilium clustermesh status');
    assert.equal(meshStatusRes.exitCode, 0);
    assert.ok(meshStatusRes.output.includes('ClusterMesh') || meshStatusRes.output.includes('connected'));

    // 3. MCS ServiceImport
    const serviceImportYaml = `apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ServiceImport
metadata:
  name: checkout-service
  namespace: production
spec:
  type: ClusterSetIP
  ports:
    - port: 8080
      protocol: TCP`;

    vfs.writeFile('/fleet/checkout-service-import.yaml', serviceImportYaml);
    terminal.execute('kubectl apply -f /fleet/checkout-service-import.yaml');

    const si = cluster.getResource('ServiceImport', 'checkout-service', 'production');
    assert.ok(si, 'ServiceImport checkout-service must exist in production namespace');
    assert.equal(si.spec.type, 'ClusterSetIP');
    assert.equal(si.spec.ports[0].port, 8080);
  });
});
