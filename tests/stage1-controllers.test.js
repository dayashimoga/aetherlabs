'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { ControllerManager } = require('../src/core/controllerManager');

test('Subphase 1.2.2: DeploymentController reconciles Deployment -> ReplicaSet -> Pods with status conditions', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  // Add a schedulable node
  graph.set({
    kind: 'Node',
    metadata: { name: 'node-1' },
    status: { phase: 'Ready' }
  });

  // Apply Deployment
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web-service', namespace: 'default' },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: 'web-service' } },
      template: {
        metadata: { labels: { app: 'web-service' } },
        spec: { containers: [{ name: 'nginx', image: 'nginx:1.27-alpine' }] }
      }
    }
  });

  // Verify child ReplicaSet exists
  const replicaSets = graph.list({ kind: 'ReplicaSet', namespace: 'default' });
  assert.equal(replicaSets.length, 1);
  assert.equal(replicaSets[0].spec.replicas, 2);

  // Verify child Pods created
  const pods = graph.list({ kind: 'Pod', namespace: 'default' });
  assert.equal(pods.length, 2);
  for (const p of pods) {
    assert.equal(p.status.phase, 'Running');
    assert.ok(p.status.podIP.startsWith('10.244.'));
  }

  // Verify Deployment status
  const dep = graph.get('Deployment', 'default', 'web-service');
  assert.equal(dep.status.replicas, 2);
  assert.equal(dep.status.readyReplicas, 2);
  assert.equal(dep.status.availableReplicas, 2);
  assert.equal(dep.status.conditions[0].type, 'Available');
  assert.equal(dep.status.conditions[0].status, 'True');

  cm.destroy();
});

test('Subphase 1.2.2: StatefulSetController provisions ordinal pods and volumeClaimTemplates', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  graph.set({
    kind: 'Node',
    metadata: { name: 'node-1' },
    status: { phase: 'Ready' }
  });

  graph.set({
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'db-cluster', namespace: 'default' },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: 'db-cluster' } },
      serviceName: 'db-headless',
      template: {
        metadata: { labels: { app: 'db-cluster' } },
        spec: { containers: [{ name: 'postgres', image: 'postgres:16-alpine' }] }
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'pgdata' },
          spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '20Gi' } } }
        }
      ]
    }
  });

  // Verify PVCs created for each ordinal
  const pvc0 = graph.get('PersistentVolumeClaim', 'default', 'pgdata-db-cluster-0');
  const pvc1 = graph.get('PersistentVolumeClaim', 'default', 'pgdata-db-cluster-1');
  assert.ok(pvc0);
  assert.ok(pvc1);
  assert.equal(pvc0.status.phase, 'Bound');

  // Verify ordinal Pods
  const pod0 = graph.get('Pod', 'default', 'db-cluster-0');
  const pod1 = graph.get('Pod', 'default', 'db-cluster-1');
  assert.ok(pod0);
  assert.ok(pod1);
  assert.equal(pod0.status.phase, 'Running');

  // Scale down to 1
  const sts = graph.get('StatefulSet', 'default', 'db-cluster');
  sts.spec.replicas = 1;
  graph.set(sts);

  // pod1 must be terminated, pod0 remains
  assert.ok(graph.get('Pod', 'default', 'db-cluster-0'));
  assert.equal(graph.get('Pod', 'default', 'db-cluster-1'), null);

  cm.destroy();
});

test('Subphase 1.2.2: DaemonSetController schedules exactly 1 pod per eligible matching node', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  // Node 1: Normal worker
  graph.set({
    kind: 'Node',
    metadata: { name: 'worker-1', labels: { 'node-role': 'worker' } }
  });

  // Node 2: Worker with GPU taint
  graph.set({
    kind: 'Node',
    metadata: { name: 'worker-gpu-2', labels: { 'node-role': 'worker' } },
    spec: { taints: [{ key: 'nvidia.com/gpu', value: 'present', effect: 'NoSchedule' }] }
  });

  // DaemonSet without GPU toleration
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: { name: 'fluentd', namespace: 'kube-system' },
    spec: {
      template: {
        metadata: { labels: { app: 'fluentd' } },
        spec: { containers: [{ name: 'fluentd', image: 'fluentd:v1' }] }
      }
    }
  });

  // Only worker-1 should get a pod
  const dsPods = graph.list({ kind: 'Pod', namespace: 'kube-system' });
  assert.equal(dsPods.length, 1);
  assert.equal(dsPods[0].spec.nodeName, 'worker-1');

  // Update DaemonSet to tolerate GPU taint
  const ds = graph.get('DaemonSet', 'kube-system', 'fluentd');
  ds.spec.template.spec.tolerations = [{ key: 'nvidia.com/gpu', operator: 'Exists' }];
  graph.set(ds);

  // Now both nodes should have a pod!
  const updatedPods = graph.list({ kind: 'Pod', namespace: 'kube-system' });
  assert.equal(updatedPods.length, 2);

  cm.destroy();
});

test('Subphase 1.2.2: ServiceController & EndpointController binds Ready Pods into Endpoints', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  graph.set({
    kind: 'Node',
    metadata: { name: 'node-1' }
  });

  // Create 2 matching pods
  graph.set({
    kind: 'Pod',
    metadata: { name: 'web-1', namespace: 'default', labels: { app: 'web' } },
    spec: { containers: [{ name: 'web', image: 'nginx:1.27-alpine' }] }
  });

  graph.set({
    kind: 'Pod',
    metadata: { name: 'web-2', namespace: 'default', labels: { app: 'web' } },
    spec: { containers: [{ name: 'web', image: 'nginx:1.27-alpine' }] }
  });

  // Create Service
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'web-service', namespace: 'default' },
    spec: {
      selector: { app: 'web' },
      ports: [{ port: 80, targetPort: 8080 }]
    }
  });

  // Verify Endpoints resource was created and bound
  const ep = graph.get('Endpoints', 'default', 'web-service');
  assert.ok(ep);
  assert.equal(ep.subsets.length, 1);
  assert.equal(ep.subsets[0].addresses.length, 2);
  assert.equal(ep.subsets[0].ports[0].port, 80);

  // Verify Service status has endpoints
  const svc = graph.get('Service', 'default', 'web-service');
  assert.equal(svc.status.endpointCount, 2);
  assert.ok(svc.spec.clusterIP.startsWith('10.96.'));

  cm.destroy();
});

test('Subphase 1.2.2: RBAC authorization evaluator can() evaluates cluster and role bindings', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  // ClusterRole with read-only pods
  graph.set({
    kind: 'ClusterRole',
    metadata: { name: 'pod-reader' },
    rules: [{ verbs: ['get', 'list'], resources: ['pods'] }]
  });

  // RoleBinding in default namespace binding user 'alice' to 'pod-reader'
  graph.set({
    kind: 'RoleBinding',
    metadata: { name: 'alice-read-pods', namespace: 'default' },
    roleRef: { kind: 'ClusterRole', name: 'pod-reader' },
    subjects: [{ kind: 'User', name: 'alice' }]
  });

  // Admin user can do anything
  assert.equal(cm.can({ user: 'kubernetes-admin', verb: 'delete', resource: 'deployments' }), true);

  // Alice can get pods in default
  assert.equal(cm.can({ user: 'alice', verb: 'get', resource: 'pods', namespace: 'default' }), true);
  assert.equal(cm.can({ user: 'alice', verb: 'list', resource: 'pods', namespace: 'default' }), true);

  // Alice CANNOT delete pods in default
  assert.equal(cm.can({ user: 'alice', verb: 'delete', resource: 'pods', namespace: 'default' }), false);

  // Alice CANNOT get pods in kube-system (RoleBinding was only for 'default')
  assert.equal(cm.can({ user: 'alice', verb: 'get', resource: 'pods', namespace: 'kube-system' }), false);

  cm.destroy();
});
