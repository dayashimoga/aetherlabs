'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { createKubeLabsApp } = require('../src/server');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { PluginManager } = require('../src/plugins/pluginManager');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ProjectEngine } = require('../src/core/projectEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');

describe('Subphase 6.3.2 — Performance & Memory Footprint Verification', () => {
  const rootDir = path.join(__dirname, '..');
  const curriculumDir = path.join(rootDir, 'src', 'curriculum', 'domains');

  test('1. Cold Server Startup Latency is Under 250ms', () => {
    const t0 = performance.now();
    const app = createKubeLabsApp({ dbFilePath: ':memory:' });
    const startupTimeMs = performance.now() - t0;

    assert.ok(
      startupTimeMs < 250,
      `Cold server startup time (${startupTimeMs.toFixed(2)}ms) must be under 250ms budget`
    );

    app.database.close();
  });

  test('2. Idle Process Memory Footprint (RSS) is Under 65MB', () => {
    const rssMB = process.memoryUsage().rss / (1024 * 1024);
    assert.ok(
      rssMB < 65,
      `Process memory RSS (${rssMB.toFixed(2)}MB) must be under 65MB idle budget`
    );
  });

  test('3. Full 45-Domain & 90-Lab In-Memory Catalog Footprint is Under 150MB RSS', () => {
    const t0 = performance.now();
    const pm = new PluginManager(curriculumDir);
    const domains = pm.getAllDomains();
    const labs = pm.getAllLabs();

    const valEngine = new ValidationEngine();
    const incEngine = new IncidentEngine(valEngine);
    const warRoom = incEngine.getWarRoomScenarios();
    const projEngine = new ProjectEngine(valEngine);
    const certEngine = new CertificationEngine(pm, null, { validationEngine: valEngine });
    const certExams = certEngine.listPerformanceExams();

    const loadTimeMs = performance.now() - t0;
    const rssMB = process.memoryUsage().rss / (1024 * 1024);

    assert.equal(domains.length, 45, 'Must load all 45 domains');
    assert.equal(labs.length, 90, 'Must load all 90 labs');
    assert.equal(warRoom.length, 25, 'Must load all 25 war room incidents');
    assert.equal(projEngine.projects.length, 8, 'Must load all 8 capstone projects');
    assert.equal(certExams.length, 6, 'Must load all 6 performance certification exams');

    assert.ok(
      loadTimeMs < 150,
      `Full catalog in-memory load time (${loadTimeMs.toFixed(2)}ms) must be under 150ms`
    );
    assert.ok(
      rssMB < 150,
      `Process RSS under full catalog load (${rssMB.toFixed(2)}MB) must be under 150MB budget`
    );
  });

  test('4. Terminal Multi-CLI Execution Latency (P99) is Under 15ms', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const term = new TerminalEngine({ cluster, vfs });
    term.execute('git init');

    const commands = [
      'kubectl get nodes',
      'kubectl get pods -A',
      'kubectl get svc',
      'docker ps',
      'tofu plan',
      'helm list',
      'istioctl analyze',
      'trivy version',
      'ip addr',
      'git status'
    ];

    const latencies = [];
    for (let i = 0; i < 50; i++) {
      const cmd = commands[i % commands.length];
      const t0 = performance.now();
      term.execute(cmd);
      latencies.push(performance.now() - t0);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    assert.ok(
      p99 < 15,
      `P99 Terminal execution latency (${p99.toFixed(2)}ms) must be under 15ms budget`
    );
  });

  test('5. Multi-Assertion Validation Evaluation Latency (P99) is Under 25ms', () => {
    const pm = new PluginManager(curriculumDir);
    const labs = pm.getAllLabs();
    const valEngine = new ValidationEngine();

    const latencies = [];
    for (const lab of labs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const context = { cluster, vfs, commandHistory: [] };
      const t0 = performance.now();
      valEngine.evaluate(lab.validationRules, context, []);
      latencies.push(performance.now() - t0);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    assert.ok(
      p99 < 25,
      `P99 Validation evaluation latency (${p99.toFixed(2)}ms) must be under 25ms budget`
    );
  });

  test('6. Control Plane Scale Reconciliation (100 Pods, 10 Deployments, 10 Services) is Under 50ms', () => {
    const cluster = new VirtualCluster();
    const t0 = performance.now();

    for (let i = 0; i < 10; i++) {
      cluster.applyResource({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: `perf-deploy-${i}`, namespace: 'perf-test' },
        spec: {
          replicas: 10,
          selector: { matchLabels: { app: `perf-app-${i}` } },
          template: {
            metadata: { labels: { app: `perf-app-${i}` } },
            spec: { containers: [{ name: 'nginx', image: 'nginx:alpine' }] }
          }
        }
      });
      cluster.applyResource({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: `perf-svc-${i}`, namespace: 'perf-test' },
        spec: {
          type: 'ClusterIP',
          selector: { app: `perf-app-${i}` },
          ports: [{ port: 80, targetPort: 80 }]
        }
      });
    }

    const elapsedMs = performance.now() - t0;
    const pods = cluster.getResources('Pod', 'perf-test');
    const endpoints = cluster.getResources('Endpoints', 'perf-test');

    assert.equal(pods.length, 100, 'Must reconcile 100 pods');
    assert.equal(endpoints.length, 10, 'Must reconcile 10 endpoints');
    assert.ok(
      elapsedMs < 50,
      `Reconciliation time (${elapsedMs.toFixed(2)}ms) must be under 50ms budget`
    );
  });

  test('7. Offline Isomorphic Engine UMD Bundle Size is Under 1000 KB', () => {
    const bundlePath = path.join(rootDir, 'public', 'js', 'offlineEngine.js');
    assert.ok(fs.existsSync(bundlePath), 'public/js/offlineEngine.js must exist');
    const sizeKB = fs.statSync(bundlePath).size / 1024;

    assert.ok(sizeKB > 700, `Bundle size (${sizeKB.toFixed(1)} KB) must be > 700 KB for complete v4 curriculum`);
    assert.ok(sizeKB < 1000, `Bundle size (${sizeKB.toFixed(1)} KB) must be under 1000 KB budget`);
  });
});
