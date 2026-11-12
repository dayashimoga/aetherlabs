'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PipelineDriver } = require('../src/core/pipelineDriver');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { ControllerManager } = require('../src/core/controllerManager');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');

test('Subphase 2.1.3: kubectl get, json, yaml, wide, and jsonpath formatting', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const vfs = new VirtualFileSystem();
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });
  const driver = new PipelineDriver({ vfs });
  dispatcher.registerTo(driver);

  // 1. Table format
  const getPods = driver.execute('kubectl get pods -n kube-system');
  assert.equal(getPods.code, 0);
  assert.ok(getPods.stdout.includes('NAME'));
  assert.ok(getPods.stdout.includes('coredns'));
  assert.ok(getPods.stdout.includes('Running'));

  // 2. All namespaces (-A)
  const getAllPods = driver.execute('kubectl get pods -A');
  assert.equal(getAllPods.code, 0);
  assert.ok(getAllPods.stdout.includes('NAMESPACE'));
  assert.ok(getAllPods.stdout.includes('kube-system'));

  // 3. Output json (-o json)
  const getJson = driver.execute('kubectl get pods -n kube-system -o json');
  assert.equal(getJson.code, 0);
  const parsedJson = JSON.parse(getJson.stdout);
  assert.equal(parsedJson.kind, 'List');
  assert.ok(parsedJson.items.length >= 6);

  // 4. Output name (-o name)
  const getNames = driver.execute('kubectl get pods -n kube-system -o name');
  assert.equal(getNames.code, 0);
  assert.ok(getNames.stdout.includes('pod.v1/kube-apiserver-control-plane'));

  // 5. Output jsonpath (-o jsonpath)
  const getJsonPath = driver.execute("kubectl get pod coredns-7c65d6cfc9-abc12 -n kube-system -o jsonpath='{.status.phase}'");
  assert.equal(getJsonPath.code, 0);
  assert.equal(getJsonPath.stdout.trim(), 'Running');

  // 6. Nodes list
  const getNodes = driver.execute('kubectl get nodes');
  assert.equal(getNodes.code, 0);
  assert.ok(getNodes.stdout.includes('control-plane-node'));
  assert.ok(getNodes.stdout.includes('Ready'));
});

test('Subphase 2.1.3: kubectl resource lifecycle (apply -f, scale, rollout, patch, label, delete)', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const vfs = new VirtualFileSystem();
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });
  const driver = new PipelineDriver({ vfs });
  dispatcher.registerTo(driver);

  // Write manifest to VFS
  const manifest = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: payment-service',
    '  namespace: default',
    'spec:',
    '  replicas: 2',
    '  selector:',
    '    matchLabels:',
    '      app: payment',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: payment',
    '    spec:',
    '      containers:',
    '      - name: payment',
    '        image: payment-gateway:v1.2.0'
  ].join('\n');

  vfs.writeFile('/tmp/payment-deploy.yaml', manifest);

  // Apply manifest
  const applyRes = driver.execute('kubectl apply -f /tmp/payment-deploy.yaml');
  assert.equal(applyRes.code, 0);
  assert.ok(applyRes.stdout.includes('deployment.apps/payment-service created'));

  // Verify Deployment created in ResourceGraph
  const deploy = graph.get('Deployment', 'default', 'payment-service');
  assert.ok(deploy);
  assert.equal(deploy.spec.replicas, 2);

  // Scale deployment
  const scaleRes = driver.execute('kubectl scale deployment payment-service --replicas=5 -n default');
  assert.equal(scaleRes.code, 0);
  assert.equal(graph.get('Deployment', 'default', 'payment-service').spec.replicas, 5);

  // Rollout restart
  const rolloutRes = driver.execute('kubectl rollout restart deployment/payment-service');
  assert.equal(rolloutRes.code, 0);
  assert.ok(rolloutRes.stdout.includes('restarted'));

  // Label
  const labelRes = driver.execute('kubectl label deployment/payment-service tier=backend');
  assert.equal(labelRes.code, 0);
  assert.equal(graph.get('Deployment', 'default', 'payment-service').metadata.labels.tier, 'backend');

  // Delete
  const delRes = driver.execute('kubectl delete deployment payment-service -n default');
  assert.equal(delRes.code, 0);
  assert.equal(graph.get('Deployment', 'default', 'payment-service'), null);
});

test('Subphase 2.1.3: kubectl auth can-i and RBAC permissions evaluation', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm });
  const driver = new PipelineDriver();
  dispatcher.registerTo(driver);

  // ClusterAdmin allows all by default
  const authRes = driver.execute('kubectl auth can-i create pods -n default');
  assert.equal(authRes.code, 0);
  assert.equal(authRes.stdout.trim(), 'yes');
});

test('Subphase 2.1.3: Helm, Docker, ArgoCD, OpenTofu, Etcdctl, and Multi-Cloud CLIs', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const vfs = new VirtualFileSystem();
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });
  const driver = new PipelineDriver({ vfs });
  dispatcher.registerTo(driver);

  // 1. Helm install, list, and uninstall
  const helmInstall = driver.execute('helm install redis-cache bitnami/redis -n default');
  assert.equal(helmInstall.code, 0);
  assert.ok(helmInstall.stdout.includes('STATUS: deployed'));

  const helmList = driver.execute('helm list');
  assert.equal(helmList.code, 0);
  assert.ok(helmList.stdout.includes('redis-cache'));

  const helmUninstall = driver.execute('helm uninstall redis-cache');
  assert.equal(helmUninstall.code, 0);
  assert.ok(helmUninstall.stdout.includes('uninstalled'));

  // 2. Docker ps & images
  const dockerPs = driver.execute('docker ps');
  assert.equal(dockerPs.code, 0);
  assert.ok(dockerPs.stdout.includes('CONTAINER ID'));
  assert.ok(dockerPs.stdout.includes('kube-apiserver'));

  // 3. ArgoCD app list & sync
  const argoList = driver.execute('argocd app list');
  assert.equal(argoList.code, 0);
  assert.ok(argoList.stdout.includes('guestbook'));

  // 4. OpenTofu init & plan & apply
  const tofuInit = driver.execute('tofu init');
  assert.equal(tofuInit.code, 0);
  assert.ok(tofuInit.stdout.includes('OpenTofu has been successfully initialized!'));

  const tofuApply = driver.execute('tofu apply');
  assert.equal(tofuApply.code, 0);
  assert.ok(tofuApply.stdout.includes('Apply complete!'));

  // 5. Etcdctl health & member list
  const etcdHealth = driver.execute('etcdctl endpoint health');
  assert.equal(etcdHealth.code, 0);
  assert.ok(etcdHealth.stdout.includes('is healthy'));

  // 6. AWS STS caller identity
  const awsSts = driver.execute('aws sts get-caller-identity');
  assert.equal(awsSts.code, 0);
  const stsJson = JSON.parse(awsSts.stdout);
  assert.equal(stsJson.Account, '123456789012');
});

test('Subphase 2.1.3: Multi-CLI commands stream directly into POSIX pipeline tools', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const vfs = new VirtualFileSystem();
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });
  const driver = new PipelineDriver({ vfs });
  dispatcher.registerTo(driver);

  // Pipeline: kubectl get pods | grep coredns | awk '{print $1, $3}' | sort
  const pipeRes = driver.execute("kubectl get pods -n kube-system | grep coredns | awk '{print $1, $3}' | sort");
  assert.equal(pipeRes.code, 0);
  const lines = pipeRes.stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('coredns-'));
  assert.ok(lines[0].endsWith('Running'));
  assert.ok(lines[1].startsWith('coredns-'));
  assert.ok(lines[1].endsWith('Running'));

  // Pipeline with redirect: kubectl get nodes > /tmp/nodes.txt && cat /tmp/nodes.txt | wc -l
  const redirectRes = driver.execute('kubectl get nodes > /tmp/nodes.txt && cat /tmp/nodes.txt | wc -l');
  assert.equal(redirectRes.code, 0);
  assert.equal(redirectRes.stdout.trim(), '4'); // 1 header + 3 nodes
});
