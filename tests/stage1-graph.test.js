'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph, normalizeKind, isClusterScoped } = require('../src/core/resourceGraph');

test('Subphase 1.2.1: ResourceGraph CRUD, immutable versioning, generation and primary indexing', () => {
  const graph = new ResourceGraph();

  const events = [];
  graph.on('Added', (r) => events.push({ event: 'Added', kind: r.kind, name: r.metadata.name }));
  graph.on('Modified', (r) => events.push({ event: 'Modified', kind: r.kind, name: r.metadata.name }));
  graph.on('Deleted', (r) => events.push({ event: 'Deleted', kind: r.kind, name: r.metadata.name }));

  // Create Deployment
  const { resource: deploy, event: ev1 } = graph.set({
    apiVersion: 'apps/v1',
    kind: 'deploy',
    metadata: {
      name: 'api-gateway',
      namespace: 'production',
      labels: { app: 'api-gateway', tier: 'backend' }
    },
    spec: { replicas: 3 }
  });

  assert.equal(ev1, 'Added');
  assert.equal(deploy.kind, 'Deployment');
  assert.equal(deploy.metadata.name, 'api-gateway');
  assert.equal(deploy.metadata.namespace, 'production');
  assert.ok(deploy.metadata.uid);
  assert.ok(deploy.metadata.creationTimestamp);
  assert.equal(deploy.metadata.generation, 1);
  assert.ok(deploy.metadata.resourceVersion);

  // Retrieve by primary key
  const retrieved = graph.get('Deployment', 'production', 'api-gateway');
  assert.equal(retrieved.metadata.uid, deploy.metadata.uid);

  // Modify spec -> generation increments
  const { resource: updatedDeploy, event: ev2 } = graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'api-gateway',
      namespace: 'production',
      labels: { app: 'api-gateway', tier: 'backend' }
    },
    spec: { replicas: 5 }
  });

  assert.equal(ev2, 'Modified');
  assert.equal(updatedDeploy.metadata.uid, deploy.metadata.uid);
  assert.equal(updatedDeploy.metadata.generation, 2);
  assert.equal(updatedDeploy.spec.replicas, 5);

  // Cluster-scoped resource (Namespace)
  const { resource: ns } = graph.set({
    apiVersion: 'v1',
    kind: 'ns',
    metadata: { name: 'production' }
  });
  assert.equal(ns.kind, 'Namespace');
  assert.equal(isClusterScoped(ns.kind), true);
  assert.equal(graph.get('Namespace', null, 'production').metadata.name, 'production');

  assert.equal(events.length, 3);
  assert.equal(events[0].event, 'Added');
  assert.equal(events[1].event, 'Modified');
  assert.equal(events[2].event, 'Added');
});

test('Subphase 1.2.1: ResourceGraph label selector (equality & set-based) and field selector queries', () => {
  const graph = new ResourceGraph();

  graph.set({
    kind: 'Pod',
    metadata: { name: 'pod-1', namespace: 'default', labels: { app: 'web', tier: 'frontend', env: 'prod' } },
    status: { phase: 'Running' }
  });

  graph.set({
    kind: 'Pod',
    metadata: { name: 'pod-2', namespace: 'default', labels: { app: 'api', tier: 'backend', env: 'prod' } },
    status: { phase: 'Running' }
  });

  graph.set({
    kind: 'Pod',
    metadata: { name: 'pod-3', namespace: 'default', labels: { app: 'db', tier: 'backend', env: 'dev' } },
    status: { phase: 'Pending' }
  });

  // Equality label selector
  const webPods = graph.list({ kind: 'Pod', labelSelector: 'app=web' });
  assert.equal(webPods.length, 1);
  assert.equal(webPods[0].metadata.name, 'pod-1');

  // Set-based In selector
  const backends = graph.list({ kind: 'Pod', labelSelector: 'tier in (backend)' });
  assert.equal(backends.length, 2);

  // Multiple selectors with negation
  const prodBackends = graph.list({ kind: 'Pod', labelSelector: 'tier in (backend),env!=dev' });
  assert.equal(prodBackends.length, 1);
  assert.equal(prodBackends[0].metadata.name, 'pod-2');

  // Field selector
  const running = graph.list({ kind: 'Pod', fieldSelector: 'status.phase=Running' });
  assert.equal(running.length, 2);

  const pending = graph.list({ kind: 'Pod', fieldSelector: 'status.phase=Pending,metadata.name=pod-3' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].metadata.name, 'pod-3');
});

test('Subphase 1.2.1: ResourceGraph OwnerReferences DAG and cascading deletion', () => {
  const graph = new ResourceGraph();

  // 1. Create Deployment (Parent)
  const { resource: deploy } = graph.set({
    kind: 'Deployment',
    metadata: { name: 'web-deploy', namespace: 'default' },
    spec: { replicas: 2 }
  });

  // 2. Create ReplicaSet (Child of Deployment)
  const { resource: rs } = graph.set({
    kind: 'ReplicaSet',
    metadata: {
      name: 'web-deploy-67b4f59',
      namespace: 'default',
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: deploy.metadata.name,
          uid: deploy.metadata.uid,
          controller: true
        }
      ]
    }
  });

  // 3. Create Pod (Child of ReplicaSet)
  const { resource: pod } = graph.set({
    kind: 'Pod',
    metadata: {
      name: 'web-deploy-67b4f59-abcde',
      namespace: 'default',
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          kind: 'ReplicaSet',
          name: rs.metadata.name,
          uid: rs.metadata.uid,
          controller: true
        }
      ]
    }
  });

  // Verify DAG edges
  const deployChildren = graph.getChildren(deploy.metadata.uid);
  assert.equal(deployChildren.length, 1);
  assert.equal(deployChildren[0].metadata.uid, rs.metadata.uid);

  const rsOwners = graph.getOwners(rs.metadata.uid);
  assert.equal(rsOwners.length, 1);
  assert.equal(rsOwners[0].metadata.uid, deploy.metadata.uid);

  const rsChildren = graph.getChildren(rs.metadata.uid);
  assert.equal(rsChildren.length, 1);
  assert.equal(rsChildren[0].metadata.uid, pod.metadata.uid);

  // Cascading deletion: deleting Deployment cascadingly deletes ReplicaSet and Pod
  graph.delete('Deployment', 'default', 'web-deploy', { propagationPolicy: 'Background' });

  assert.equal(graph.get('Deployment', 'default', 'web-deploy'), null);
  assert.equal(graph.get('ReplicaSet', 'default', 'web-deploy-67b4f59'), null);
  assert.equal(graph.get('Pod', 'default', 'web-deploy-67b4f59-abcde'), null);
});

test('Subphase 1.2.1: ResourceGraph finalizers prevent immediate deletion until cleared', () => {
  const graph = new ResourceGraph();

  const { resource: pvc } = graph.set({
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: 'data-pvc',
      namespace: 'default',
      finalizers: ['kubernetes.io/pvc-protection']
    }
  });

  // First delete attempt: sets deletionTimestamp, does NOT remove from graph
  const deleted = graph.delete('PersistentVolumeClaim', 'default', 'data-pvc');
  assert.equal(deleted, true);

  const pendingDelete = graph.get('PersistentVolumeClaim', 'default', 'data-pvc');
  assert.ok(pendingDelete);
  assert.ok(pendingDelete.metadata.deletionTimestamp);
  assert.deepEqual(pendingDelete.metadata.finalizers, ['kubernetes.io/pvc-protection']);

  // Remove finalizer: completes deletion
  graph.removeFinalizer(pendingDelete.metadata.uid, 'kubernetes.io/pvc-protection');

  assert.equal(graph.get('PersistentVolumeClaim', 'default', 'data-pvc'), null);
});

test('Subphase 1.2.1: ResourceGraph DAG topological sort and cycle detection', () => {
  const graph = new ResourceGraph();

  const { resource: node } = graph.set({
    kind: 'Node',
    metadata: { name: 'worker-1' }
  });

  const { resource: pod } = graph.set({
    kind: 'Pod',
    metadata: {
      name: 'system-agent',
      namespace: 'kube-system',
      ownerReferences: [{ uid: node.metadata.uid, kind: 'Node', name: 'worker-1' }]
    }
  });

  const sorted = graph.topologicalSort();
  assert.ok(sorted.length >= 2);
  const nodeIndex = sorted.findIndex((r) => r.metadata.uid === node.metadata.uid);
  const podIndex = sorted.findIndex((r) => r.metadata.uid === pod.metadata.uid);
  assert.ok(nodeIndex < podIndex, 'Owner node must appear before dependent pod in topological order');
});

test('Subphase 1.2.1: ResourceGraph exportSnapshot and importSnapshot preservation', () => {
  const g1 = new ResourceGraph();
  g1.set({
    kind: 'ConfigMap',
    metadata: { name: 'game-config', namespace: 'default' },
    data: { lives: '3' }
  });

  const snapshot = g1.exportSnapshot();
  const serialized = JSON.stringify(snapshot);

  const g2 = new ResourceGraph();
  g2.importSnapshot(JSON.parse(serialized));

  const restored = g2.get('ConfigMap', 'default', 'game-config');
  assert.ok(restored);
  assert.equal(restored.data.lives, '3');
});
