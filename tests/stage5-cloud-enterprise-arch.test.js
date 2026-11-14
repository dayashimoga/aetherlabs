/**
 * tests/stage5-cloud-enterprise-arch.test.js
 * Subphase 5.2.3 Verification: Domain 43 (Cloud Architecture Patterns) & Domain 44 (Enterprise Architecture)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * CQRS event streaming, queue-based load leveling with exponential backoff jitter,
 * C4 enterprise architectural modeling, and multi-account Landing Zone FinOps governance.
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

describe('Subphase 5.2.3 — Domain 43 (Cloud Architecture Patterns) & Domain 44 (Enterprise Architecture)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 43 & 44 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain43 = pluginManager.getDomain('cloud-architecture-patterns');
    assert.ok(domain43, 'Domain 43 (cloud-architecture-patterns) must exist');
    assert.equal(domain43.category, 'Architecture & System Design');
    assert.equal(domain43.trackId, 'track-platform');
    assert.equal(domain43.labs.length, 2);
    assert.equal(domain43.assessmentQuestions.length, 2);

    const domain44 = pluginManager.getDomain('enterprise-architecture');
    assert.ok(domain44, 'Domain 44 (enterprise-architecture) must exist');
    assert.equal(domain44.category, 'Architecture & System Design');
    assert.equal(domain44.trackId, 'track-platform');
    assert.equal(domain44.labs.length, 2);
    assert.equal(domain44.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-cap-01-cqrs-event-sourcing',
      'lab-cap-02-queue-load-leveling-backoff',
      'lab-ea-01-c4-model-enterprise-blueprint',
      'lab-ea-02-landing-zone-finops-guardrails'
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
      'lab-cap-01-cqrs-event-sourcing',
      'lab-cap-02-queue-load-leveling-backoff',
      'lab-ea-01-c4-model-enterprise-blueprint',
      'lab-ea-02-landing-zone-finops-guardrails'
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

  it('4. Engine Parity: Domain 43 CQRS Event Store & Queue Load Leveling', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /arch');
    terminal.execute('kubectl create namespace production');

    // 1. CQRS Manifest
    const cqrsYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: cqrs-event-stream-spec
  namespace: production
data:
  streamName: "order-events-stream"
  partitionKey: "orderId"
  retentionDays: "30"
  projectionStore: "order-summary-read-view"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-command-handler
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: order-command-handler
  template:
    metadata:
      labels:
        app: order-command-handler
    spec:
      containers:
        - name: handler
          image: order-command-service:v1.0`;

    vfs.writeFile('/arch/cqrs-event-stream.yaml', cqrsYaml);
    terminal.execute('kubectl apply -f /arch/cqrs-event-stream.yaml');

    const cmCqrs = cluster.getResource('ConfigMap', 'cqrs-event-stream-spec', 'production');
    assert.ok(cmCqrs, 'ConfigMap cqrs-event-stream-spec must exist');
    assert.equal(cmCqrs.data.streamName, 'order-events-stream');
    assert.equal(cmCqrs.data.projectionStore, 'order-summary-read-view');

    const depCqrs = cluster.getResource('Deployment', 'order-command-handler', 'production');
    assert.ok(depCqrs, 'Deployment order-command-handler must exist');
    assert.equal(depCqrs.spec.replicas, 2);

    // 2. Queue Load Leveling Manifest
    const queueYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: queue-load-leveling-policy
  namespace: production
data:
  queueType: "priority-fifo"
  maxConcurrency: "10"
  retryPolicy: "exponential-backoff-full-jitter"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-leveling-worker
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: load-leveling-worker
  template:
    metadata:
      labels:
        app: load-leveling-worker
    spec:
      containers:
        - name: worker
          image: queue-worker:v2.0
          resources:
            requests:
              cpu: "200m"
              memory: "256Mi"`;

    vfs.writeFile('/arch/queue-load-leveling.yaml', queueYaml);
    terminal.execute('kubectl apply -f /arch/queue-load-leveling.yaml');

    const cmQueue = cluster.getResource('ConfigMap', 'queue-load-leveling-policy', 'production');
    assert.ok(cmQueue, 'ConfigMap queue-load-leveling-policy must exist');
    assert.equal(cmQueue.data.retryPolicy, 'exponential-backoff-full-jitter');

    const depQueue = cluster.getResource('Deployment', 'load-leveling-worker', 'production');
    assert.ok(depQueue, 'Deployment load-leveling-worker must exist');
    assert.equal(depQueue.spec.replicas, 3);
  });

  it('5. Engine Parity: Domain 44 C4 Enterprise Blueprint & Landing Zone FinOps Quotas', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /enterprise');

    // 1. C4 Enterprise Blueprint Manifest
    const c4Yaml = `apiVersion: v1
kind: Namespace
metadata:
  name: enterprise-governance
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: c4-system-context-spec
  namespace: enterprise-governance
data:
  systemName: "core-banking-platform"
  boundaryType: "enterprise"
  c4Level: "Container"
  primaryPersonas: "retail-customer,compliance-officer"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: enterprise-architect-sa
  namespace: enterprise-governance`;

    vfs.writeFile('/enterprise/c4-system-context.yaml', c4Yaml);
    terminal.execute('kubectl apply -f /enterprise/c4-system-context.yaml');

    const ns = cluster.getResource('Namespace', 'enterprise-governance');
    assert.ok(ns, 'Namespace enterprise-governance must exist');

    const cmC4 = cluster.getResource('ConfigMap', 'c4-system-context-spec', 'enterprise-governance');
    assert.ok(cmC4, 'ConfigMap c4-system-context-spec must exist');
    assert.equal(cmC4.data.c4Level, 'Container');
    assert.equal(cmC4.data.systemName, 'core-banking-platform');

    const sa = cluster.getResource('ServiceAccount', 'enterprise-architect-sa', 'enterprise-governance');
    assert.ok(sa, 'ServiceAccount enterprise-architect-sa must exist');

    // 2. Landing Zone FinOps Manifest
    const finopsYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: landing-zone-finops-spec
  namespace: enterprise-governance
data:
  scpEnforcement: "deny-unapproved-regions"
  costCenter: "cc-fintech-9401"
  finopsTier: "tier-1-mission-critical"
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: enterprise-governance-quota
  namespace: enterprise-governance
spec:
  hard:
    requests.cpu: "8000m"
    requests.memory: "16Gi"`;

    vfs.writeFile('/enterprise/landing-zone-finops.yaml', finopsYaml);
    terminal.execute('kubectl apply -f /enterprise/landing-zone-finops.yaml');

    const cmFinops = cluster.getResource('ConfigMap', 'landing-zone-finops-spec', 'enterprise-governance');
    assert.ok(cmFinops, 'ConfigMap landing-zone-finops-spec must exist');
    assert.equal(cmFinops.data.scpEnforcement, 'deny-unapproved-regions');
    assert.equal(cmFinops.data.finopsTier, 'tier-1-mission-critical');

    const quota = cluster.getResource('ResourceQuota', 'enterprise-governance-quota', 'enterprise-governance');
    assert.ok(quota, 'ResourceQuota enterprise-governance-quota must exist');
    assert.equal(quota.spec.hard['requests.cpu'], '8000m');
    assert.equal(quota.spec.hard['requests.memory'], '16Gi');
  });
});
