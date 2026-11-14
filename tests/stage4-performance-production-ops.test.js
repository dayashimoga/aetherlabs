/**
 * tests/stage4-performance-production-ops.test.js
 * Subphase 4.3.2 Verification: Domain 33 (Performance Engineering & Capacity Planning) & Domain 34 (Production Operations & Velero DR)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Linux CFS CPU quota throttling remediation (eliminating hard CPU limits on latency-critical tiers),
 * KEDA ScaledObject event-driven autoscaling configuration,
 * Velero enterprise backup and restore disaster recovery orchestration,
 * and zero-downtime worker node maintenance lifecycles (cordon, drain with --ignore-daemonsets, uncordon).
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

describe('Subphase 4.3.2 — Domain 33 (Performance Engineering) & Domain 34 (Production Operations)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 33 and 34 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain33 = pluginManager.getDomain('performance-engineering');
    assert.ok(domain33, 'Domain 33 (performance-engineering) must exist');
    assert.equal(domain33.category, 'Platform Operations & Performance');
    assert.equal(domain33.trackId, 'track-sre');
    assert.equal(domain33.labs.length, 2);
    assert.equal(domain33.assessmentQuestions.length, 2);

    const domain34 = pluginManager.getDomain('production-operations');
    assert.ok(domain34, 'Domain 34 (production-operations) must exist');
    assert.equal(domain34.category, 'Platform Operations & Performance');
    assert.equal(domain34.trackId, 'track-sre');
    assert.equal(domain34.labs.length, 2);
    assert.equal(domain34.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-perf-01-cfs-throttling',
      'lab-perf-02-keda-autoscaling',
      'lab-ops-01-velero-backup-restore',
      'lab-ops-02-node-drain-maintenance'
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
      'lab-perf-01-cfs-throttling',
      'lab-perf-02-keda-autoscaling',
      'lab-ops-01-velero-backup-restore',
      'lab-ops-02-node-drain-maintenance'
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

  it('4. Engine Parity: Domain 33 Performance Engineering, CFS Throttling & KEDA ScaledObjects', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /perf');
    terminal.execute('kubectl create namespace production');

    const paymentProcessorYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-processor
  namespace: production
  labels:
    app: payment-processor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payment-processor
  template:
    metadata:
      labels:
        app: payment-processor
    spec:
      containers:
        - name: processor
          image: nginx:1.27-alpine
          resources:
            requests:
              cpu: "500m"
              memory: "256Mi"
            limits:
              memory: "512Mi"`;

    vfs.writeFile('/perf/payment-processor-tuned.yaml', paymentProcessorYaml);
    terminal.execute('kubectl apply -f /perf/payment-processor-tuned.yaml');

    const deploy = cluster.getResource('Deployment', 'payment-processor', 'production');
    assert.ok(deploy, 'Deployment payment-processor must exist');
    assert.equal(deploy.spec.template.spec.containers[0].resources.requests.cpu, '500m');
    assert.equal(deploy.spec.template.spec.containers[0].resources.limits.memory, '512Mi');
    assert.equal(deploy.spec.template.spec.containers[0].resources.limits.cpu, undefined, 'CPU limits must be omitted to avoid CFS throttling');

    const scaledObjectYaml = `apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: orders-scaledobject
  namespace: production
spec:
  scaleTargetRef:
    name: payment-processor
  minReplicaCount: 1
  maxReplicaCount: 10
  cooldownPeriod: 30
  triggers:
    - type: rabbitmq
      metadata:
        queueName: orders-queue
        queueLength: "5"`;

    vfs.writeFile('/perf/orders-scaledobject.yaml', scaledObjectYaml);
    terminal.execute('kubectl apply -f /perf/orders-scaledobject.yaml');

    const so = cluster.getResource('ScaledObject', 'orders-scaledobject', 'production');
    assert.ok(so, 'KEDA ScaledObject must exist in cluster');
    assert.equal(so.spec.scaleTargetRef.name, 'payment-processor');
    assert.equal(so.spec.minReplicaCount, 1);
    assert.equal(so.spec.maxReplicaCount, 10);
    assert.equal(so.spec.triggers[0].type, 'rabbitmq');
  });

  it('5. Engine Parity: Domain 34 Velero Backup/Restore & Node Maintenance Lifecycle', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    // 1. Velero Backup and Restore
    const backupRes = terminal.execute('velero backup create prod-backup');
    assert.equal(backupRes.exitCode, 0);
    assert.ok(backupRes.output.includes('prod-backup') || backupRes.output.includes('submitted'));

    const getRes = terminal.execute('velero backup get');
    assert.equal(getRes.exitCode, 0);

    const restoreRes = terminal.execute('velero restore create --from-backup prod-backup');
    assert.equal(restoreRes.exitCode, 0);

    // 2. Node Cordon, Drain, Uncordon Lifecycle
    const nodeName = 'kubelabs-worker-01';
    const workerNode = cluster.getResource('Node', nodeName);
    assert.ok(workerNode, `Node ${nodeName} should exist in cluster state`);
    assert.equal(!!workerNode.spec?.unschedulable, false, 'Node must initially be schedulable');

    // Cordon
    const cordonRes = terminal.execute(`kubectl cordon ${nodeName}`);
    assert.equal(cordonRes.exitCode, 0);
    assert.ok(cordonRes.output.includes('cordoned'));
    assert.equal(workerNode.spec.unschedulable, true, 'Node must be unschedulable after cordon');

    // Drain
    const drainRes = terminal.execute(`kubectl drain ${nodeName} --ignore-daemonsets`);
    assert.equal(drainRes.exitCode, 0);
    assert.ok(drainRes.output.includes('drained'));

    // Uncordon
    const uncordonRes = terminal.execute(`kubectl uncordon ${nodeName}`);
    assert.equal(uncordonRes.exitCode, 0);
    assert.ok(uncordonRes.output.includes('uncordoned'));
    assert.equal(workerNode.spec.unschedulable, false, 'Node must be schedulable after uncordon');
  });
});
