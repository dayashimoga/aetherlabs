'use strict';

/**
 * Stage 5 Phase 5.1 Subphase 5.1.2 - Offline Engine, Service Worker & Cross-Platform Packaging Tests
 * Tests client-side isomorphic execution, offline parity, service worker caching, and desktop/mobile config.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const oe = require('../public/js/offlineEngine');

test('Subphase 5.1.2: OfflineEngine exports complete isomorphic subsystem', () => {
  assert.ok(oe, 'Must export offline engine');
  assert.equal(oe.version, '3.0.0', 'Version must be 3.0.0');
  assert.ok(oe.vfs, 'Must expose vfs');
  assert.ok(oe.cluster, 'Must expose cluster');
  assert.ok(oe.terminal, 'Must expose terminal');
  assert.ok(oe.validator, 'Must expose validator');
  assert.ok(oe.aiMentor, 'Must expose aiMentor');
  assert.ok(Array.isArray(oe.incidents), 'Must expose incidents list');
  assert.equal(oe.incidents.length, 15, 'Must provide 15 offline incident scenarios');
  assert.ok(Array.isArray(oe.projects), 'Must expose projects list');
  assert.equal(oe.projects.length, 8, 'Must provide 8 offline capstone projects');
});

test('Subphase 5.1.2: BrowserVFS handles POSIX filesystem operations in-memory', () => {
  const vfs = oe.vfs;
  vfs.reset();

  assert.ok(vfs.exists('/etc/hosts'), 'Default hosts file must exist');
  assert.ok(vfs.exists('/home/learner/.kube/config'), 'Default kubeconfig must exist');

  // File write, read, stat, exists
  vfs.writeFile('pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test-pod');
  assert.ok(vfs.exists('/home/learner/pod.yaml'), 'Relative path must normalize to /home/learner');
  assert.equal(vfs.readFile('pod.yaml'), 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test-pod');

  const stat = vfs.stat('pod.yaml');
  assert.equal(stat.isFile, true);
  assert.ok(stat.size > 0);

  // Directory listing & mkdir
  vfs.mkdir('manifests');
  vfs.writeFile('manifests/service.yaml', 'kind: Service');
  const dirContents = vfs.listDir('/home/learner');
  assert.ok(dirContents.includes('pod.yaml'), 'listDir must include pod.yaml');
  assert.ok(dirContents.includes('manifests'), 'listDir must include manifests dir');

  // Copy and removal
  vfs.cp('pod.yaml', 'pod-backup.yaml');
  assert.ok(vfs.exists('pod-backup.yaml'), 'Copied file must exist');
  vfs.rm('pod-backup.yaml');
  assert.equal(vfs.exists('pod-backup.yaml'), false, 'Removed file must no longer exist');
});

test('Subphase 5.1.2: BrowserCluster reconciles Deployments, StatefulSets, Services and PVCs', () => {
  const cluster = oe.cluster;
  cluster.reset();

  // Initial nodes and namespaces
  const nodes = cluster.getResources('Node');
  assert.equal(nodes.length, 3, 'Must bootstrap 3 nodes');
  const namespaces = cluster.getResources('Namespace');
  assert.ok(namespaces.some((n) => n.metadata.name === 'default'));
  assert.ok(namespaces.some((n) => n.metadata.name === 'production'));

  // Deployments reconciliation -> Pod creation & IP assignment
  cluster.applyResource({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web-deploy', namespace: 'production' },
    spec: { replicas: 3, selector: { matchLabels: { app: 'web' } } }
  });

  const pods = cluster.getResources('Pod', 'production');
  assert.equal(pods.length, 3, 'Reconciliation must spawn 3 pods');
  assert.ok(pods[0].status.podIP.startsWith('10.244.1.'), 'Pod must have assigned PodIP');

  // StatefulSet reconciliation -> Ordinal pods
  cluster.applyResource({
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'redis-cluster', namespace: 'production' },
    spec: { replicas: 2, selector: { matchLabels: { app: 'redis' } } }
  });

  const stsPod0 = cluster.getResource('Pod', 'redis-cluster-0', 'production');
  const stsPod1 = cluster.getResource('Pod', 'redis-cluster-1', 'production');
  assert.ok(stsPod0, 'StatefulSet ordinal pod 0 must exist');
  assert.ok(stsPod1, 'StatefulSet ordinal pod 1 must exist');

  // Service reconciliation -> Endpoints matching labels
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'web-service', namespace: 'production' },
    spec: { selector: { app: 'web' } }
  });

  const svc = cluster.getResource('Service', 'web-service', 'production');
  assert.equal(svc.status.endpointCount, 3, 'Service must register 3 endpoints matching web pods');

  // PVC reconciliation -> Auto-bind
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'data-pvc', namespace: 'production' },
    spec: { storageClassName: 'standard', resources: { requests: { storage: '5Gi' } } }
  });
  const pvc = cluster.getResource('PersistentVolumeClaim', 'data-pvc', 'production');
  assert.equal(pvc.status.phase, 'Bound', 'PVC must be reconciled to Bound');
});

test('Subphase 5.1.2: BrowserTerminal executes POSIX, chaining, pipes, redirection and multi-CLIs', () => {
  const terminal = oe.terminal;
  oe.vfs.reset();
  oe.cluster.reset();

  // POSIX commands
  const echoRes = terminal.execute('echo "KubeLabs Offline Engine"');
  assert.equal(echoRes.exitCode, 0);
  assert.equal(echoRes.output, 'KubeLabs Offline Engine');

  // Chaining and Redirection
  const chainRes = terminal.execute('echo "line 1" > test.txt && echo "line 2" >> test.txt');
  assert.equal(chainRes.exitCode, 0);
  assert.ok(oe.vfs.exists('test.txt'), 'VFS file must be created via redirection');
  assert.equal(oe.vfs.readFile('test.txt'), 'line 1\nline 2');

  // Pipelines
  const pipeRes = terminal.execute('cat test.txt | grep "line 2"');
  assert.equal(pipeRes.exitCode, 0);
  assert.equal(pipeRes.output, 'line 2');

  const countRes = terminal.execute('cat test.txt | wc -l');
  assert.equal(countRes.exitCode, 0);
  assert.equal(countRes.output, '2');

  // Kubectl apply and get with JSONPath
  oe.vfs.writeFile('app.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx-test\n  namespace: default\nspec:\n  replicas: 2');
  const applyRes = terminal.execute('kubectl apply -f app.yaml');
  assert.equal(applyRes.exitCode, 0);

  const getRes = terminal.execute('kubectl get deployment nginx-test -o jsonpath={.spec.replicas}');
  assert.equal(getRes.exitCode, 0);
  assert.equal(getRes.output, '2');

  // Ecosystem CLIs
  assert.equal(terminal.execute('helm install my-app bitnami/nginx').exitCode, 0);
  assert.equal(terminal.execute('tofu plan').exitCode, 0);
  assert.equal(terminal.execute('argocd app create prod-app').exitCode, 0);
  assert.equal(terminal.execute('flux check').exitCode, 0);
  assert.equal(terminal.execute('cilium status').exitCode, 0);
  assert.equal(terminal.execute('etcdctl endpoint health').exitCode, 0);
});

test('Subphase 5.1.2: BrowserValidator grades declarative rules across all assertion types', () => {
  oe.cluster.reset();
  oe.vfs.reset();

  oe.cluster.applyResource({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'api-gateway', namespace: 'production' },
    spec: { replicas: 3, selector: { matchLabels: { app: 'api' } } }
  });
  oe.cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'api-service', namespace: 'production' },
    spec: { selector: { app: 'api' } }
  });
  oe.vfs.writeFile('config.json', '{"auth": true}');

  const rules = [
    { type: 'resource_exists', kind: 'Deployment', name: 'api-gateway', namespace: 'production' },
    { type: 'replica_count_min', kind: 'Deployment', name: 'api-gateway', minReplicas: 3, namespace: 'production' },
    { type: 'service_has_endpoints', name: 'api-service', namespace: 'production' },
    { type: 'pod_status_running', name: 'api-gateway', namespace: 'production' },
    { type: 'vfs_file_exists', path: 'config.json' },
    { type: 'vfs_file_contains', path: 'config.json', expectedSubstring: 'auth' }
  ];

  const report = oe.evaluateRules(rules);
  assert.equal(report.passed, true, 'All declarative rules should pass');
  assert.equal(report.score, 100, 'Score should be 100');
  assert.equal(report.passedCount, 6);
  assert.equal(report.totalCount, 6);
});

test('Subphase 5.1.2: Incidents, Projects, AI Mentor and Progress Sync Queue operate offline', async () => {
  oe.resetCluster();
  oe.resetProgress();

  // Incidents
  const inc = oe.startIncident('inc-01-web-503');
  assert.ok(inc, 'Incident inc-01-web-503 must start');
  const initialCheck = oe.validateIncident('inc-01-web-503');
  assert.equal(initialCheck.resolved, false, 'Fault condition must be un-resolved initially');

  oe.executeCommand('kubectl set selector svc frontend-svc -n production app=frontend');
  const resolvedCheck = oe.validateIncident('inc-01-web-503');
  assert.equal(resolvedCheck.resolved, true, 'Remediation command must resolve incident');

  // AI Mentor CIS Benchmark Audit
  const secAudit = oe.getAIMentorAdvice({ mode: 'security-audit' });
  assert.ok(secAudit.response.includes('CIS Kubernetes Benchmark'), 'AI Mentor must run CIS security audit');

  // AI Mentor Debug Error
  const dbg = oe.getAIMentorAdvice({ mode: 'debug-error', lastError: 'Service 503 endpoints missing' });
  assert.ok(dbg.response.includes('selector mismatch'), 'AI mentor must identify selector mismatch');

  // Progress and Sync Queue
  oe.recordProgress({ labId: 'lab-core-01', xpReward: 150 });
  const prog = oe.getProgress();
  assert.ok(prog.completedLabs.includes('lab-core-01'));
  assert.equal(prog.xp, 150);

  const queue = oe.getSyncQueue();
  assert.ok(queue.length > 0, 'Sync queue must record progress updates');

  let syncedCalls = 0;
  const mockApi = {
    post: async () => {
      syncedCalls++;
      return { ok: true };
    }
  };
  const flushResult = await oe.flushSyncQueue(mockApi);
  assert.equal(flushResult.flushed, 1);
  assert.equal(flushResult.remaining, 0);
  assert.equal(syncedCalls, 1);
});

test('Subphase 5.1.2: Service Worker public/sw.js configures kubelabs-offline-v3 and shell caching', () => {
  const swPath = path.join(__dirname, '..', 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');
  const swCode = fs.readFileSync(swPath, 'utf8');

  assert.ok(swCode.includes('kubelabs-offline-v3'), 'Must define kubelabs-offline-v3 cache name');
  assert.ok(swCode.includes('/js/offlineEngine.js'), 'Must pre-cache offlineEngine.js');
  assert.ok(swCode.includes('/css/styles.css'), 'Must pre-cache styles.css');
  assert.ok(swCode.includes('/manifest.json'), 'Must pre-cache manifest.json');
  assert.ok(swCode.includes('req.mode === \'navigate\''), 'Must handle navigation request offline fallback');
  assert.ok(swCode.includes('url.pathname.startsWith(\'/api/\')'), 'Must handle offline API synthetic fallbacks');
});

test('Subphase 5.1.2: Cross-platform packaging configurations (Tauri v2, Electron, Capacitor) are validated', () => {
  const root = path.join(__dirname, '..');

  // 1. Tauri v2 Desktop Configuration
  const tauriPath = path.join(root, 'deploy', 'desktop', 'tauri.conf.json');
  assert.ok(fs.existsSync(tauriPath), 'tauri.conf.json must exist');
  const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
  assert.equal(tauriConf.package.productName, 'KubeLabs');
  assert.equal(tauriConf.package.version, '3.0.0');
  assert.equal(tauriConf.tauri.bundle.identifier, 'io.kubelabs.app');
  assert.ok(tauriConf.tauri.security.csp.includes('default-src'));

  // 2. Electron Main Process Configuration
  const electronPath = path.join(root, 'deploy', 'desktop', 'electron-main.js');
  assert.ok(fs.existsSync(electronPath), 'electron-main.js must exist');
  const electronCode = fs.readFileSync(electronPath, 'utf8');
  assert.ok(electronCode.includes("require('../../src/server')"), 'Must reference correct server relative path');

  // 3. Capacitor Mobile Configuration
  const capPath = path.join(root, 'deploy', 'mobile', 'capacitor.config.json');
  assert.ok(fs.existsSync(capPath), 'capacitor.config.json must exist');
  const capConf = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  assert.equal(capConf.appId, 'io.kubelabs.app');
  assert.equal(capConf.appName, 'KubeLabs');
});
