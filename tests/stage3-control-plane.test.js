'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ControllerManager } = require('../src/core/controllerManager');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');

test('Subphase 3.1.1: Static pod reconciliation from /etc/kubernetes/manifests', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'control-plane-node',
      labels: {
        'node-role.kubernetes.io/control-plane': 'true',
        'kubernetes.io/hostname': 'control-plane-node'
      }
    },
    status: { phase: 'Ready' }
  });

  const cm = new ControllerManager(graph, vfs);

  // Initial scan must mirror standard static pods into kube-system
  const pods = graph.list({ kind: 'Pod', namespace: 'kube-system' });
  const staticPods = pods.filter((p) => p.metadata?.annotations?.['kubernetes.io/config.source'] === 'file');

  assert.ok(staticPods.length >= 4, 'Must have at least 4 static control-plane pods');
  assert.ok(staticPods.some((p) => p.metadata.name === 'kube-apiserver-control-plane-node'));
  assert.ok(staticPods.some((p) => p.metadata.name === 'etcd-control-plane-node'));
  assert.ok(staticPods.some((p) => p.metadata.name === 'kube-controller-manager-control-plane-node'));
  assert.ok(staticPods.some((p) => p.metadata.name === 'kube-scheduler-control-plane-node'));

  const etcdPod = staticPods.find((p) => p.metadata.name === 'etcd-control-plane-node');
  assert.equal(etcdPod.spec.nodeName, 'control-plane-node');
  assert.equal(etcdPod.status.phase, 'Running');
  assert.equal(etcdPod.metadata.labels.tier, 'control-plane');
});

test('Subphase 3.1.1: Live VFS watching for static pod creation, modification and deletion', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'control-plane-node',
      labels: { 'node-role.kubernetes.io/control-plane': 'true' }
    }
  });

  const cm = new ControllerManager(graph, vfs);

  // 1. Create a custom static pod manifest in /etc/kubernetes/manifests
  const customManifest = `apiVersion: v1
kind: Pod
metadata:
  name: node-telemetry
  namespace: kube-system
spec:
  containers:
    - name: agent
      image: telemetry-agent:v1.0
`;
  vfs.writeFile('/etc/kubernetes/manifests/node-telemetry.yaml', customManifest);

  // Kubelet watcher triggers static pod reconciliation
  let customPod = graph.get('Pod', 'kube-system', 'node-telemetry-control-plane-node');
  assert.ok(customPod, 'Static pod must be mirrored into ResourceGraph upon manifest creation');
  assert.equal(customPod.status.phase, 'Running');
  assert.equal(customPod.metadata.annotations['kubernetes.io/config.source'], 'file');

  // 2. Modify static pod manifest with invalid/corrupt flags
  const brokenEtcdManifest = `apiVersion: v1
kind: Pod
metadata:
  name: etcd
  namespace: kube-system
spec:
  containers:
    - name: etcd
      image: registry.k8s.io/etcd:3.5.15-0
      command: ["etcd", "--data-dir=/var/lib/etcd-corrupt"]
`;
  vfs.writeFile('/etc/kubernetes/manifests/etcd.yaml', brokenEtcdManifest, { overwrite: true });

  const brokenEtcd = graph.get('Pod', 'kube-system', 'etcd-control-plane-node');
  assert.ok(brokenEtcd);
  assert.equal(brokenEtcd.status.phase, 'CrashLoopBackOff');
  assert.equal(brokenEtcd.status.ready, '0/1');

  // 3. Remove custom static pod manifest
  vfs.unlink('/etc/kubernetes/manifests/node-telemetry.yaml');
  customPod = graph.get('Pod', 'kube-system', 'node-telemetry-control-plane-node');
  assert.equal(customPod, null, 'Mirror pod must be deleted when static manifest file is unlinked');
});

test('Subphase 3.1.1: Authentic etcd snapshot restore and quorum restoration', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'control-plane-node',
      labels: { 'node-role.kubernetes.io/control-plane': 'true' }
    }
  });

  const cm = new ControllerManager(graph, vfs);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. Initial snapshot check
  const snapCheck = dispatcher.handleEtcdctl({ argv: ['etcdctl', 'snapshot', 'save', '/var/lib/etcd/backup.db'] });
  assert.equal(snapCheck.code, 0);
  assert.ok(snapCheck.stdout.includes('Snapshot saved at /var/lib/etcd/backup.db'));

  // 2. Perform authentic snapshot restore to new data-dir
  const restoreRes = dispatcher.handleEtcdctl({
    argv: ['etcdctl', 'snapshot', 'restore', '/var/lib/etcd/backup.db', '--data-dir=/var/lib/etcd-restored']
  });
  assert.equal(restoreRes.code, 0);
  assert.ok(restoreRes.stdout.includes('restored snapshot /var/lib/etcd/backup.db to /var/lib/etcd-restored'));
  assert.ok(restoreRes.stdout.includes('Quorum restored'));

  // Verify VFS contains the restored database snapshot
  assert.ok(vfs.exists('/var/lib/etcd-restored/member/snap/db'));

  // 3. Point static pod manifest to restored data-dir
  const restoredManifest = `apiVersion: v1
kind: Pod
metadata:
  name: etcd
  namespace: kube-system
spec:
  containers:
    - name: etcd
      image: registry.k8s.io/etcd:3.5.15-0
      command: ["etcd", "--data-dir=/var/lib/etcd-restored"]
`;
  vfs.writeFile('/etc/kubernetes/manifests/etcd.yaml', restoredManifest, { overwrite: true });

  const etcdPod = graph.get('Pod', 'kube-system', 'etcd-control-plane-node');
  assert.ok(etcdPod);
  assert.equal(etcdPod.status.phase, 'Running');
  assert.equal(etcdPod.status.ready, '1/1');
});

test('Subphase 3.1.1: kubeadm certs check-expiration and renew all integration', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // 1. check-expiration
  const checkRes = dispatcher.handleKubeadm({ argv: ['kubeadm', 'certs', 'check-expiration'] });
  assert.equal(checkRes.code, 0);
  assert.ok(checkRes.stdout.includes('CERTIFICATE'));
  assert.ok(checkRes.stdout.includes('apiserver'));
  assert.ok(checkRes.stdout.includes('etcd-server'));

  // 2. renew all
  const renewRes = dispatcher.handleKubeadm({ argv: ['kubeadm', 'certs', 'renew', 'all'] });
  assert.equal(renewRes.code, 0);
  assert.ok(renewRes.stdout.includes("[certs] Certificate 'apiserver' renewed"));
  assert.ok(renewRes.stdout.includes("[certs] Certificate 'etcd-server' renewed"));
  assert.ok(renewRes.stdout.includes('Done renewing certificates'));

  // Verify renewed cert files written to /etc/kubernetes/pki
  assert.ok(vfs.exists('/etc/kubernetes/pki/apiserver.crt'));
  assert.ok(vfs.exists('/etc/kubernetes/pki/etcd-server.crt'));
  const certContent = vfs.readFile('/etc/kubernetes/pki/apiserver.crt');
  assert.ok(certContent.includes('BEGIN CERTIFICATE'));
});

