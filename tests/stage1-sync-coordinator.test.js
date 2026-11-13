'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SyncCoordinator = require('../src/core/syncCoordinator');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { ValidationEngine } = require('../src/core/validationEngine');
const { SessionManager } = require('../src/core/sessionManager');

test('Subphase 1.3.3: Editor -> VFS Synchronization with Debounced Writes (< 50ms)', async () => {
  const vfs = new VirtualFileSystem();
  const coordinator = new SyncCoordinator({
    vfs,
    activeFilePath: '/home/learner/workspace/manifest.yaml',
    debounceMs: 15
  });

  const yamlContent = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-frontend
  namespace: production
spec:
  replicas: 3
`;

  let changeEmitted = false;
  let emittedPayload = null;
  coordinator.on('vfs:change', (payload) => {
    changeEmitted = true;
    emittedPayload = payload;
  });

  // User types in editor
  coordinator.onEditorInput(yamlContent);

  // Wait for debounce flush (< 50ms)
  await new Promise((r) => setTimeout(r, 35));

  // Assert VFS file was written
  assert.ok(vfs.exists('/home/learner/workspace/manifest.yaml'));
  assert.equal(vfs.readFile('/home/learner/workspace/manifest.yaml'), yamlContent);

  // Assert alias /home/learner/manifest.yaml was also synchronized
  assert.ok(vfs.exists('/home/learner/manifest.yaml'));
  assert.equal(vfs.readFile('/home/learner/manifest.yaml'), yamlContent);

  // Assert event emission
  assert.ok(changeEmitted);
  assert.equal(emittedPayload.source, 'editor');
  assert.equal(emittedPayload.path, '/home/learner/workspace/manifest.yaml');

  coordinator.destroy();
});

test('Subphase 1.3.3: VFS / CLI -> Editor Synchronization (External File Modifications)', () => {
  const vfs = new VirtualFileSystem();
  const coordinator = new SyncCoordinator({
    vfs,
    activeFilePath: '/home/learner/workspace/manifest.yaml'
  });

  let editorSynced = false;
  let receivedContent = null;
  coordinator.on('editor:sync', (payload) => {
    editorSynced = true;
    receivedContent = payload.content;
  });

  // CLI command modifies manifest (e.g. cat <<EOF > /home/learner/workspace/manifest.yaml)
  const cliUpdatedYaml = `apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  ports:
    - port: 80
`;

  vfs.writeFile('/home/learner/workspace/manifest.yaml', cliUpdatedYaml);

  // Editor should receive external sync event immediately
  assert.ok(editorSynced);
  assert.equal(receivedContent, cliUpdatedYaml);
  assert.equal(coordinator.lastEditorContent, cliUpdatedYaml);

  coordinator.destroy();
});

test('Subphase 1.3.3: Cluster State Mutations Trigger Topology Sync with Exact Delta (< 100ms)', () => {
  const cluster = new VirtualCluster();
  const coordinator = new SyncCoordinator({
    cluster
  });

  let topologySyncCount = 0;
  let lastDelta = null;
  let lastSvg = null;

  coordinator.on('topology:sync', (payload) => {
    topologySyncCount++;
    lastDelta = payload.delta;
    lastSvg = payload.svg;
  });

  // 1. Add Pod
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-api-pod', namespace: 'default' },
    spec: { containers: [{ name: 'api', image: 'nginx:1.24' }] }
  });

  assert.equal(topologySyncCount, 1);
  assert.equal(lastDelta.added.length, 1);
  assert.equal(lastDelta.added[0].metadata.name, 'payment-api-pod');
  assert.ok(lastSvg.includes('payment-api-pod'));

  // 2. Modify Pod spec & labels
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-api-pod', namespace: 'default', labels: { version: 'v2' } },
    spec: { containers: [{ name: 'api', image: 'nginx:1.25' }] }
  });

  assert.equal(topologySyncCount, 2);
  assert.equal(lastDelta.modified.length, 1);
  assert.equal(lastDelta.modified[0].metadata.name, 'payment-api-pod');

  // 3. Delete Pod
  cluster.deleteResource('Pod', 'payment-api-pod', 'default');
  assert.equal(topologySyncCount, 3);
  assert.equal(lastDelta.deleted.length, 1);
  assert.equal(lastDelta.deleted[0].metadata.name, 'payment-api-pod');

  coordinator.destroy();
});

test('Subphase 1.3.3: Dynamic SVG Topology Generator with Zero Text Clipping & Status Colors', () => {
  const coordinator = new SyncCoordinator();
  const clusterState = {
    resources: [
      {
        kind: 'Ingress',
        metadata: { name: 'ecommerce-production-gateway', namespace: 'prod' }
      },
      {
        kind: 'Service',
        metadata: { name: 'checkout-service', namespace: 'prod' },
        status: { endpointCount: 3 }
      },
      {
        kind: 'Pod',
        metadata: { name: 'checkout-worker-pod-0', namespace: 'prod' },
        status: { phase: 'Running' }
      },
      {
        kind: 'Pod',
        metadata: { name: 'auth-crash-pod', namespace: 'prod' },
        status: { phase: 'CrashLoopBackOff' }
      },
      {
        kind: 'Node',
        metadata: { name: 'worker-node-primary' }
      }
    ]
  };

  const svg = coordinator.renderTopologySvg(clusterState);

  // Columns & Markers present
  assert.ok(svg.includes('INGRESS'));
  assert.ok(svg.includes('SERVICE'));
  assert.ok(svg.includes('PODS'));
  assert.ok(svg.includes('HOST / PVC'));
  assert.ok(svg.includes('id="arrow"'));

  // Color coding
  assert.ok(svg.includes('#10b981')); // Running / healthy endpoints
  assert.ok(svg.includes('#ef4444')); // CrashLoopBackOff error
  assert.ok(svg.includes('#38bdf8')); // Ingress cyan
  assert.ok(svg.includes('#a855f7')); // Node purple

  // Unclipped resource names rendered
  assert.ok(svg.includes('ecommerce-production-gateway'));
  assert.ok(svg.includes('checkout-service'));
  assert.ok(svg.includes('checkout-worker-pod-0'));
  assert.ok(svg.includes('auth-crash-pod'));
  assert.ok(svg.includes('worker-node-primary'));
});

test('Subphase 1.3.3: Real-Time YAML Schema Linting & Syntax Diagnostics', () => {
  const coordinator = new SyncCoordinator();

  let lintPayload = null;
  coordinator.on('schema:lint', (payload) => {
    lintPayload = payload;
  });

  // 1. Valid Manifest
  const validYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-processor
`;
  const r1 = coordinator.lintSchema(validYaml);
  assert.ok(r1.valid);
  assert.equal(r1.errors.length, 0);

  // 2. Missing kind
  const missingKind = `apiVersion: v1
metadata:
  name: unnamed-object
`;
  const r2 = coordinator.lintSchema(missingKind);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.message.includes("'kind'")));

  // 3. Missing metadata.name
  const missingName = `apiVersion: v1
kind: ConfigMap
metadata:
  namespace: kube-system
`;
  const r3 = coordinator.lintSchema(missingName);
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e) => e.message.includes("'metadata.name'")));
});

test('Subphase 1.3.3: applyEditorManifest Pipeline (Editor -> VFS -> VirtualCluster -> Topology)', () => {
  const vfs = new VirtualFileSystem();
  const cluster = new VirtualCluster();
  const graph = new ResourceGraph();

  const coordinator = new SyncCoordinator({
    vfs,
    cluster,
    graph,
    activeFilePath: '/home/learner/workspace/manifest.yaml'
  });

  const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: default
spec:
  replicas: 2
`;

  let topoUpdated = false;
  coordinator.on('topology:sync', () => {
    topoUpdated = true;
  });

  // Apply manifest from editor
  const res = coordinator.applyEditorManifest(manifest);

  assert.ok(res.applied.length >= 1);
  assert.ok(vfs.exists('/home/learner/workspace/manifest.yaml'));
  assert.equal(vfs.readFile('/home/learner/workspace/manifest.yaml'), manifest);
  assert.ok(topoUpdated);

  // Assert resource in cluster
  const deploy = cluster.getResource('Deployment', 'orders-api', 'default');
  assert.ok(deploy);
  assert.equal(deploy.metadata.name, 'orders-api');

  // Assert resource in graph
  const gDocs = graph.list({ kind: 'Deployment' });
  assert.ok(gDocs.some((d) => d.metadata.name === 'orders-api'));

  coordinator.destroy();
});

test('Subphase 1.3.3: SessionManager Integration with SyncCoordinator', () => {
  const sm = new SessionManager();
  const session = sm.getSession('test-sync-session');

  assert.ok(session.syncCoordinator instanceof SyncCoordinator);
  assert.equal(session.syncCoordinator.vfs, session.vfs);
  assert.equal(session.syncCoordinator.cluster, session.cluster);

  // Bind lab seeds /home/learner/workspace/manifest.yaml
  const lab = {
    id: 'lab-k8s-test',
    starterManifest: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: starter-pod\n'
  };

  sm.bindLab('test-sync-session', lab);

  assert.ok(session.vfs.exists('/home/learner/workspace/manifest.yaml'));
  assert.equal(session.vfs.readFile('/home/learner/workspace/manifest.yaml'), lab.starterManifest);
  assert.ok(session.vfs.exists('/home/learner/manifest.yaml'));
});
