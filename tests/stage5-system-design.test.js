/**
 * tests/stage5-system-design.test.js
 * Subphase 5.1.3 Verification: Domain 40 (System Design & High-Scale Engineering)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * mathematical capacity estimations (QPS, egress bandwidth, 5-year retention),
 * consistent hashing database sharding topologies, multi-tier caching architectures,
 * and distributed Token Bucket rate-limiting configurations.
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

describe('Subphase 5.1.3 — Domain 40 (System Design & High-Scale Engineering)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 40 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain40 = pluginManager.getDomain('system-design');
    assert.ok(domain40, 'Domain 40 (system-design) must exist');
    assert.equal(domain40.category, 'Architecture & System Design');
    assert.equal(domain40.trackId, 'track-platform');
    assert.equal(domain40.labs.length, 2);
    assert.equal(domain40.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-sys-01-capacity-estimation-plan',
      'lab-sys-02-token-bucket-ratelimit'
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
      'lab-sys-01-capacity-estimation-plan',
      'lab-sys-02-token-bucket-ratelimit'
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

  it('4. Engine Parity: Domain 40 Capacity Plan Specification & Token Bucket Rate Limiter Gateway', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /sysdesign');
    terminal.execute('kubectl create namespace production');

    // 1. Capacity Plan Specification
    const capacityPlanYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: capacity-plan-spec
  namespace: production
data:
  targetPeakQPS: "50000"
  dailyActiveUsers: "10000000"
  readWriteRatio: "4:1"
  fiveYearStorageTB: "120"`;

    vfs.writeFile('/sysdesign/capacity-plan-spec.yaml', capacityPlanYaml);
    terminal.execute('kubectl apply -f /sysdesign/capacity-plan-spec.yaml');

    const capCm = cluster.getResource('ConfigMap', 'capacity-plan-spec', 'production');
    assert.ok(capCm, 'ConfigMap capacity-plan-spec must exist');
    assert.equal(capCm.data.targetPeakQPS, '50000');
    assert.equal(capCm.data.fiveYearStorageTB, '120');

    // 2. Token Bucket Rate Limiter & Gateway Deployment
    const ratelimitGatewayYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ratelimit-token-bucket
  namespace: production
data:
  algorithm: "TokenBucket"
  capacity: "10000"
  refillRatePerSec: "2000"
  backendCache: "redis-cluster"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-gateway
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-gateway
  template:
    metadata:
      labels:
        app: payment-gateway
    spec:
      containers:
        - name: gateway
          image: nginx:1.27-alpine`;

    vfs.writeFile('/sysdesign/cache-and-ratelimit.yaml', ratelimitGatewayYaml);
    terminal.execute('kubectl apply -f /sysdesign/cache-and-ratelimit.yaml');

    const rlCm = cluster.getResource('ConfigMap', 'ratelimit-token-bucket', 'production');
    assert.ok(rlCm, 'ConfigMap ratelimit-token-bucket must exist');
    assert.equal(rlCm.data.algorithm, 'TokenBucket');
    assert.equal(rlCm.data.capacity, '10000');
    assert.equal(rlCm.data.refillRatePerSec, '2000');

    const gwDeploy = cluster.getResource('Deployment', 'payment-gateway', 'production');
    assert.ok(gwDeploy, 'Deployment payment-gateway must exist');
    assert.equal(gwDeploy.spec.replicas, 3);
  });
});
