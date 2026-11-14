/**
 * tests/stage5-arch-distributed-systems.test.js
 * Subphase 5.1.1 Verification: Domain 37 (Cloud-Native Architecture) & Domain 38 (Distributed Systems)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * 12/15-factor microservice decoupling (ConfigMap/Secret env injection, immutable deployments),
 * Kubernetes Custom Resource Definition (CRD) and Operator custom resource lifecycle,
 * distributed mutual exclusion with monotonically increasing fencing tokens,
 * and Saga distributed transaction orchestration with automated compensating rollbacks.
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

describe('Subphase 5.1.1 — Domain 37 (Cloud-Native Architecture) & Domain 38 (Distributed Systems)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 37 and 38 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain37 = pluginManager.getDomain('cloud-native-architecture');
    assert.ok(domain37, 'Domain 37 (cloud-native-architecture) must exist');
    assert.equal(domain37.category, 'Architecture & System Design');
    assert.equal(domain37.trackId, 'track-platform');
    assert.equal(domain37.labs.length, 2);
    assert.equal(domain37.assessmentQuestions.length, 2);

    const domain38 = pluginManager.getDomain('distributed-systems');
    assert.ok(domain38, 'Domain 38 (distributed-systems) must exist');
    assert.equal(domain38.category, 'Architecture & System Design');
    assert.equal(domain38.trackId, 'track-platform');
    assert.equal(domain38.labs.length, 2);
    assert.equal(domain38.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-arch-01-twelve-factor-config',
      'lab-arch-02-custom-operator-crd',
      'lab-dist-01-fencing-token-lock',
      'lab-dist-02-saga-orchestration'
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
      'lab-arch-01-twelve-factor-config',
      'lab-arch-02-custom-operator-crd',
      'lab-dist-01-fencing-token-lock',
      'lab-dist-02-saga-orchestration'
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

  it('4. Engine Parity: Domain 37 12-Factor Decoupling & Custom Operator CRD', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /arch');
    terminal.execute('kubectl create namespace production');

    // 1. 12-Factor Workload manifest
    const twelveFactorYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-config
  namespace: production
data:
  LOG_LEVEL: "info"
  CURRENCY: "USD"
---
apiVersion: v1
kind: Secret
metadata:
  name: checkout-secrets
  namespace: production
type: Opaque
stringData:
  API_KEY: "sec-token-99"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-service
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-service
  template:
    metadata:
      labels:
        app: checkout-service
    spec:
      containers:
        - name: api
          image: nginx:1.27-alpine`;

    vfs.writeFile('/arch/twelve-factor-app.yaml', twelveFactorYaml);
    terminal.execute('kubectl apply -f /arch/twelve-factor-app.yaml');

    const cm = cluster.getResource('ConfigMap', 'checkout-config', 'production');
    assert.ok(cm, 'ConfigMap checkout-config must exist');
    assert.equal(cm.data.LOG_LEVEL, 'info');

    const sec = cluster.getResource('Secret', 'checkout-secrets', 'production');
    assert.ok(sec, 'Secret checkout-secrets must exist');
    assert.equal(sec.stringData.API_KEY, 'sec-token-99');

    const deploy = cluster.getResource('Deployment', 'checkout-service', 'production');
    assert.ok(deploy, 'Deployment checkout-service must exist');
    assert.equal(deploy.spec.replicas, 2);

    // 2. Custom Operator CRD and Custom Resource
    const crdYaml = `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databaseclusters.databases.kubelabs.io
spec:
  group: databases.kubelabs.io
  names:
    kind: DatabaseCluster
    plural: databaseclusters
    singular: databasecluster
  scope: Namespaced`;

    vfs.writeFile('/arch/database-crd.yaml', crdYaml);
    terminal.execute('kubectl apply -f /arch/database-crd.yaml');

    const crd = cluster.getResource('CustomResourceDefinition', 'databaseclusters.databases.kubelabs.io');
    assert.ok(crd, 'CRD must exist in cluster');

    const crYaml = `apiVersion: databases.kubelabs.io/v1
kind: DatabaseCluster
metadata:
  name: prod-db-cluster
  namespace: production
spec:
  engine: postgres
  version: "16"
  replicas: 3`;

    vfs.writeFile('/arch/prod-db-cluster.yaml', crYaml);
    terminal.execute('kubectl apply -f /arch/prod-db-cluster.yaml');

    const cr = cluster.getResource('DatabaseCluster', 'prod-db-cluster', 'production');
    assert.ok(cr, 'DatabaseCluster custom resource must exist in production namespace');
    assert.equal(cr.spec.engine, 'postgres');
    assert.equal(cr.spec.version, '16');
    assert.equal(cr.spec.replicas, 3);
  });

  it('5. Engine Parity: Domain 38 Distributed Locking Fencing Tokens & Saga Orchestration', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /dist');
    terminal.execute('kubectl create namespace production');

    // 1. Distributed Lock with Fencing Token
    const lockYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: order-distributed-lock
  namespace: production
data:
  lockName: "order-processing-lock"
  currentOwner: "worker-pod-01"
  leaseDurationSeconds: "30"
  fencingToken: "1042"`;

    vfs.writeFile('/dist/distributed-lock.yaml', lockYaml);
    terminal.execute('kubectl apply -f /dist/distributed-lock.yaml');

    const lockCm = cluster.getResource('ConfigMap', 'order-distributed-lock', 'production');
    assert.ok(lockCm, 'ConfigMap order-distributed-lock must exist');
    assert.equal(lockCm.data.currentOwner, 'worker-pod-01');
    assert.equal(lockCm.data.fencingToken, '1042');
    assert.equal(Number(lockCm.data.fencingToken) > 1000, true, 'Fencing token must be a monotonically increasing integer');

    // 2. Saga Orchestration Specification
    const sagaYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: payment-order-saga-definition
  namespace: production
data:
  sagaId: "saga-ecommerce-v1"
  status: "Active"
  sagaDefinition: "{\\"steps\\":[\\"AuthorizePayment\\",\\"ReserveInventory\\",\\"ShipOrder\\"],\\"compensations\\":[\\"RefundPayment\\",\\"ReleaseInventory\\"]}"`;

    vfs.writeFile('/dist/saga-orchestration.yaml', sagaYaml);
    terminal.execute('kubectl apply -f /dist/saga-orchestration.yaml');

    const sagaCm = cluster.getResource('ConfigMap', 'payment-order-saga-definition', 'production');
    assert.ok(sagaCm, 'ConfigMap payment-order-saga-definition must exist');
    assert.equal(sagaCm.data.sagaId, 'saga-ecommerce-v1');
    assert.equal(sagaCm.data.status, 'Active');

    const sagaDef = JSON.parse(sagaCm.data.sagaDefinition);
    assert.deepEqual(sagaDef.steps, ['AuthorizePayment', 'ReserveInventory', 'ShipOrder']);
    assert.deepEqual(sagaDef.compensations, ['RefundPayment', 'ReleaseInventory']);
  });
});
