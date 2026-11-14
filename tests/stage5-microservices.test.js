/**
 * tests/stage5-microservices.test.js
 * Subphase 5.1.2 Verification: Domain 39 (Microservices Architecture)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Domain-Driven Design (DDD) bounded contexts, Strangler Fig progressive monolithic migration,
 * and reliable asynchronous event streaming with Transactional Outbox contracts and Bulkhead isolation.
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

describe('Subphase 5.1.2 — Domain 39 (Microservices Architecture)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 39 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain39 = pluginManager.getDomain('microservices-architecture');
    assert.ok(domain39, 'Domain 39 (microservices-architecture) must exist');
    assert.equal(domain39.category, 'Architecture & System Design');
    assert.equal(domain39.trackId, 'track-platform');
    assert.equal(domain39.labs.length, 2);
    assert.equal(domain39.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-micro-01-strangler-fig-routing',
      'lab-micro-02-transactional-outbox'
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
      'lab-micro-01-strangler-fig-routing',
      'lab-micro-02-transactional-outbox'
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

  it('4. Engine Parity: Domain 39 Strangler Fig Ingress & Transactional Outbox Bulkhead Deployment', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /micro');
    terminal.execute('kubectl create namespace production');

    // 1. Strangler Fig Ingress Routing
    const ingressYaml = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monolith-strangler-ingress
  namespace: production
spec:
  rules:
    - http:
        paths:
          - path: /api/v1/orders
            pathType: Prefix
            backend:
              service:
                name: orders-service
                port:
                  number: 8080
          - path: /
            pathType: Prefix
            backend:
              service:
                name: legacy-monolith
                port:
                  number: 80`;

    vfs.writeFile('/micro/strangler-fig-ingress.yaml', ingressYaml);
    terminal.execute('kubectl apply -f /micro/strangler-fig-ingress.yaml');

    const ing = cluster.getResource('Ingress', 'monolith-strangler-ingress', 'production');
    assert.ok(ing, 'Ingress monolith-strangler-ingress must exist');
    assert.equal(ing.spec.rules[0].http.paths[0].path, '/api/v1/orders');
    assert.equal(ing.spec.rules[0].http.paths[0].backend.service.name, 'orders-service');
    assert.equal(ing.spec.rules[0].http.paths[1].path, '/');
    assert.equal(ing.spec.rules[0].http.paths[1].backend.service.name, 'legacy-monolith');

    // 2. Transactional Outbox Contract & Bulkhead Deployment
    const outboxAndOrdersYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: outbox-event-contract
  namespace: production
data:
  eventType: "OrderCreated"
  topic: "orders.events.v1"
  payloadSchema: "JSON"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders-service
  template:
    metadata:
      labels:
        app: orders-service
    spec:
      containers:
        - name: api
          image: nginx:1.27-alpine
          resources:
            requests:
              memory: "256Mi"
            limits:
              memory: "512Mi"`;

    vfs.writeFile('/micro/outbox-and-orders.yaml', outboxAndOrdersYaml);
    terminal.execute('kubectl apply -f /micro/outbox-and-orders.yaml');

    const cm = cluster.getResource('ConfigMap', 'outbox-event-contract', 'production');
    assert.ok(cm, 'ConfigMap outbox-event-contract must exist');
    assert.equal(cm.data.eventType, 'OrderCreated');
    assert.equal(cm.data.topic, 'orders.events.v1');

    const dep = cluster.getResource('Deployment', 'orders-service', 'production');
    assert.ok(dep, 'Deployment orders-service must exist');
    assert.equal(dep.spec.replicas, 3);
    assert.equal(dep.spec.template.spec.containers[0].resources.limits.memory, '512Mi');
  });
});
