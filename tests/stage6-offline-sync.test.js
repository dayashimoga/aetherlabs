'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const oe = require('../public/js/offlineEngine');

test('Subphase 6.2.1 — Offline Engine & Service Worker v4 Sync', async (t) => {
  const rootDir = path.join(__dirname, '..');
  const swPath = path.join(rootDir, 'public', 'sw.js');

  await t.test('1. Catalog Completeness: All 45 Domains, 90 Labs, 6 Tracks, 25 Incidents, 8 Projects & 6 Exams Offline', () => {
    assert.ok(oe, 'Offline engine must be exported');
    assert.ok(Array.isArray(oe.domains), 'Must export domains array');
    assert.equal(oe.domains.length, 45, 'Must bundle all 45 curriculum domains');

    assert.ok(Array.isArray(oe.labs), 'Must export labs array');
    assert.equal(oe.labs.length, 90, 'Must bundle all 90 curriculum labs');

    assert.ok(Array.isArray(oe.tracks), 'Must export tracks array');
    assert.equal(oe.tracks.length, 6, 'Must bundle all 6 learning tracks');

    assert.ok(Array.isArray(oe.warRoomScenarios), 'Must export warRoomScenarios array');
    assert.equal(oe.warRoomScenarios.length, 25, 'Must bundle all 25 Chaos War Room scenarios');
    assert.equal(typeof oe.getWarRoomScenarios, 'function');
    assert.equal(oe.getWarRoomScenarios().length, 25);

    assert.ok(Array.isArray(oe.projects), 'Must export projects array');
    assert.equal(oe.projects.length, 8, 'Must bundle all 8 enterprise capstone projects');

    assert.ok(Array.isArray(oe.performanceExams), 'Must export performanceExams array');
    assert.equal(oe.performanceExams.length, 6, 'Must bundle all 6 performance certification exams');
    assert.equal(typeof oe.listPerformanceExams, 'function');
    assert.equal(oe.listPerformanceExams().length, 6);

    // Verify first and last domains
    assert.equal(oe.domains[0].id, 'linux-fundamentals');
    assert.equal(oe.domains[44].id, 'aiops-autonomous');

    // Verify lab structure
    for (const lab of oe.labs) {
      assert.ok(lab.id, 'Every offline lab must have an id');
      assert.ok(lab.title, 'Every offline lab must have a title');
      assert.ok(Array.isArray(lab.validationRules), 'Every offline lab must have validationRules');
      assert.ok(Array.isArray(lab.solutionCommands), 'Every offline lab must have solutionCommands');
    }
  });

  await t.test('2. Dynamic CLI Formatter Parity in Offline Engine', () => {
    assert.ok(oe.cliFormatter, 'Must expose cliFormatter subsystem');
    assert.equal(typeof oe.cliFormatter.formatTable, 'function');
    assert.equal(typeof oe.cliFormatter.formatResourceTable, 'function');
    assert.equal(typeof oe.cliFormatter.normalizeKind, 'function');

    // Test dynamic table formatting
    const sampleHeaders = ['NAME', 'READY', 'STATUS', 'AGE'];
    const sampleRows = [
      ['coredns-7d686f89fc-c8k2p', '1/1', 'Running', '2m'],
      ['cilium-ebpf-agent-m7m3q', '1/1', 'Running', '2m']
    ];
    const tableOutput = oe.cliFormatter.formatTable(sampleHeaders, sampleRows);
    assert.ok(tableOutput.includes('NAME'), 'Table must contain headers');
    assert.ok(tableOutput.includes('coredns-7d686f89fc-c8k2p'), 'Table must contain row 1');
    assert.ok(tableOutput.includes('cilium-ebpf-agent-m7m3q'), 'Table must contain row 2');

    // Test terminal execution using dynamic formatting
    oe.cluster.reset();
    const nodeRes = oe.terminal.execute('kubectl get nodes');
    assert.equal(nodeRes.exitCode, 0);
    assert.ok(nodeRes.output.includes('NAME'), 'Output must contain column header NAME');
    assert.ok(nodeRes.output.includes('kubelabs-control-plane'), 'Output must contain control-plane node');

    const podsAllRes = oe.terminal.execute('kubectl get pods -A');
    assert.equal(podsAllRes.exitCode, 0);
    assert.ok(podsAllRes.output.includes('NAMESPACE'), 'All-namespaces query must include NAMESPACE header');
    assert.ok(podsAllRes.output.includes('kube-system'), 'Must include kube-system pods');
  });

  await t.test('3. Offline Cluster Reconciliation & Declarative Evaluation Parity', () => {
    oe.cluster.reset();
    oe.vfs.reset();

    // Apply deployment and verify pod generation
    oe.cluster.applyResource({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'offline-api', namespace: 'production' },
      spec: { replicas: 2, selector: { matchLabels: { app: 'api' } } }
    });

    const pods = oe.cluster.getResources('Pod', 'production');
    assert.equal(pods.length, 2, 'Must reconcile deployment into 2 pods');

    // Evaluate rules
    const rules = [
      { type: 'resource_exists', kind: 'Deployment', name: 'offline-api', namespace: 'production' },
      { type: 'replica_count_min', kind: 'Deployment', name: 'offline-api', minReplicas: 2, namespace: 'production' }
    ];
    const report = oe.evaluateRules(rules);
    assert.equal(report.passed, true);
    assert.equal(report.score, 100);
  });

  await t.test('4. Service Worker v4 Configuration, Cache Name & Shell Pre-Caching', () => {
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');
    const swCode = fs.readFileSync(swPath, 'utf8');

    // Cache Name
    assert.ok(swCode.includes('kubelabs-offline-v4'), 'Must define kubelabs-offline-v4 cache name');
    assert.ok(swCode.includes('kubelabs-offline-v3'), 'Must retain kubelabs-offline-v3 compatibility marker');

    // Pre-cached assets
    const requiredAssets = [
      '/',
      '/index.html',
      '/css/styles.css',
      '/js/autocompletionEngine.js',
      '/js/terminalEmulator.js',
      '/js/syncCoordinator.js',
      '/js/offlineEngine.js',
      '/js/quickKeyEngine.js',
      '/js/terminalView.js',
      '/js/app.js',
      '/manifest.json',
      '/api/overview',
      '/api/tracks',
      '/api/curriculum',
      '/api/domains',
      '/api/war-room/scenarios',
      '/api/projects',
      '/api/certifications'
    ];

    for (const asset of requiredAssets) {
      assert.ok(swCode.includes(asset), `Service Worker must pre-cache asset: ${asset}`);
    }

    // Synthetic API Fallbacks
    assert.ok(swCode.includes('/api/overview'), 'Must have synthetic fallback for /api/overview');
    assert.ok(swCode.includes('/api/tracks'), 'Must have synthetic fallback for /api/tracks');
    assert.ok(swCode.includes('/api/war-room/scenarios'), 'Must have synthetic fallback for /api/war-room/scenarios');
    assert.ok(swCode.includes('/api/projects'), 'Must have synthetic fallback for /api/projects');
    assert.ok(swCode.includes('/api/certifications'), 'Must have synthetic fallback for /api/certifications');
  });

  await t.test('5. Offline Sync Queue & Hybrid Logical Clock (HLC) Parity', async () => {
    oe.resetProgress();
    assert.equal(oe.getSyncQueue().length, 0);

    oe.recordProgress({ labId: 'lab-cloud-arch-01', xpReward: 200 });
    const queue = oe.getSyncQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].labId, 'lab-cloud-arch-01');
    assert.equal(queue[0].xpReward, 200);
    assert.ok(queue[0].hlc, 'Must record HLC timestamp');

    let postedData = null;
    const mockApiClient = {
      post: async (endpoint, data) => {
        postedData = { endpoint, data };
        return { success: true };
      }
    };

    const flushRes = await oe.flushSyncQueue(mockApiClient);
    assert.equal(flushRes.flushed, 1);
    assert.equal(flushRes.remaining, 0);
    assert.equal(postedData.endpoint, '/api/sync');
    assert.equal(oe.getSyncQueue().length, 0);
  });
});
