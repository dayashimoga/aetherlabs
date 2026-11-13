'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ControllerManager } = require('../src/core/controllerManager');
const { PipelineDriver } = require('../src/core/pipelineDriver');

test('Subphase 1.2.1: MultiCliDispatcher - kubectl replace, patch, scale, and set', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const cm = new ControllerManager(graph);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. Initial Deployment
  const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: default
  labels:
    app: api-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: gateway
        image: nginx:1.24
`;
  vfs.writeFile('/home/learner/deploy.yaml', manifest);
  const applyRes = dispatcher.executeCommand('kubectl apply -f /home/learner/deploy.yaml');
  assert.equal(applyRes.code, 0);
  assert.ok(applyRes.stdout.includes('deployment.apps/api-gateway created'));

  // 2. kubectl scale
  const scaleRes = dispatcher.executeCommand('kubectl scale deployment api-gateway --replicas=4 -n default');
  assert.equal(scaleRes.code, 0);
  assert.ok(scaleRes.stdout.includes('deployment.apps/api-gateway scaled'));
  const deploy = graph.get('Deployment', 'default', 'api-gateway');
  assert.equal(deploy.spec.replicas, 4);

  // 3. kubectl set image
  const setImageRes = dispatcher.executeCommand('kubectl set image deployment/api-gateway gateway=nginx:1.25 -n default');
  assert.equal(setImageRes.code, 0);
  assert.ok(setImageRes.stdout.includes('api-gateway image updated'));
  assert.equal(deploy.spec.template.spec.containers[0].image, 'nginx:1.25');

  // 4. kubectl set env
  const setEnvRes = dispatcher.executeCommand('kubectl set env deployment/api-gateway ENV=production REGION=us-east-1 -n default');
  assert.equal(setEnvRes.code, 0);
  assert.ok(setEnvRes.stdout.includes('api-gateway env updated'));
  const deployAfterEnv = graph.get('Deployment', 'default', 'api-gateway');
  const envVars = deployAfterEnv.spec.template.spec.containers[0].env;
  assert.ok(envVars.find((e) => e.name === 'ENV' && e.value === 'production'));

  // 5. kubectl set resources
  const setResRes = dispatcher.executeCommand('kubectl set resources deployment/api-gateway --limits=cpu=500m,memory=512Mi --requests=cpu=100m,memory=128Mi -n default');
  assert.equal(setResRes.code, 0);
  assert.ok(setResRes.stdout.includes('resource requirements updated'));
  const deployAfterRes = graph.get('Deployment', 'default', 'api-gateway');
  assert.equal(deployAfterRes.spec.template.spec.containers[0].resources.limits.cpu, '500m');

  // 6. kubectl set selector
  const setSelRes = dispatcher.executeCommand('kubectl set selector deployment/api-gateway tier=frontend -n default');
  assert.equal(setSelRes.code, 0);
  assert.ok(setSelRes.stdout.includes('selector updated'));
  const deployAfterSel = graph.get('Deployment', 'default', 'api-gateway');
  assert.equal(deployAfterSel.spec.selector.matchLabels.tier, 'frontend');

  // 7. kubectl patch
  const patchRes = dispatcher.executeCommand('kubectl patch deployment api-gateway -p {"spec":{"replicas":6}} -n default');
  assert.equal(patchRes.code, 0);
  assert.ok(patchRes.stdout.includes('api-gateway patched'));
  const deployAfterPatch = graph.get('Deployment', 'default', 'api-gateway');
  assert.equal(deployAfterPatch.spec.replicas, 6);

  // 8. kubectl replace (success)
  const replaceManifest = manifest.replace('replicas: 2', 'replicas: 3').replace('nginx:1.24', 'nginx:1.26');
  vfs.writeFile('/home/learner/deploy-replace.yaml', replaceManifest);
  const replaceRes = dispatcher.executeCommand('kubectl replace -f /home/learner/deploy-replace.yaml -n default');
  assert.equal(replaceRes.code, 0);
  assert.ok(replaceRes.stdout.includes('deployment.apps/api-gateway replaced'));

  // 9. kubectl replace (non-existent resource fails with authentic NotFound error)
  const missingManifest = replaceManifest.replace('name: api-gateway', 'name: ghost-app');
  vfs.writeFile('/home/learner/missing.yaml', missingManifest);
  const replaceFail = dispatcher.executeCommand('kubectl replace -f /home/learner/missing.yaml -n default');
  assert.equal(replaceFail.code, 1);
  assert.ok(replaceFail.stderr.includes('Error from server (NotFound)'));
  assert.ok(replaceFail.stderr.includes('ghost-app'));
});

test('Subphase 1.2.1: MultiCliDispatcher - rollout, label, annotate, cordon, drain, taint', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // Create Deployment & Node
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'worker-app', namespace: 'default' },
    spec: { replicas: 2, template: { metadata: { labels: { app: 'worker' } }, spec: { containers: [{ name: 'app', image: 'app:v1' }] } } },
    status: { readyReplicas: 2 }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'worker-node-1', labels: {} },
    spec: {}
  });

  // 1. Rollout status & history & restart & undo
  const statusRes = dispatcher.executeCommand('kubectl rollout status deployment worker-app -n default');
  assert.equal(statusRes.code, 0);
  assert.ok(statusRes.stdout.includes('successfully rolled out'));

  const historyRes = dispatcher.executeCommand('kubectl rollout history deployment worker-app -n default');
  assert.equal(historyRes.code, 0);
  assert.ok(historyRes.stdout.includes('REVISION'));

  const restartRes = dispatcher.executeCommand('kubectl rollout restart deployment/worker-app -n default');
  assert.equal(restartRes.code, 0);
  assert.ok(restartRes.stdout.includes('restarted'));

  const undoRes = dispatcher.executeCommand('kubectl rollout undo deployment/worker-app --to-revision=1 -n default');
  assert.equal(undoRes.code, 0);
  assert.ok(undoRes.stdout.includes('rolled back to revision 1'));

  // 2. Label add & remove
  const labelAdd = dispatcher.executeCommand('kubectl label deployment/worker-app env=prod tier=backend -n default');
  assert.equal(labelAdd.code, 0);
  assert.ok(labelAdd.stdout.includes('labeled'));
  const d = graph.get('Deployment', 'default', 'worker-app');
  assert.equal(d.metadata.labels.env, 'prod');
  assert.equal(d.metadata.labels.tier, 'backend');

  const labelDel = dispatcher.executeCommand('kubectl label deployment/worker-app env- -n default');
  assert.equal(labelDel.code, 0);
  assert.equal(d.metadata.labels.env, undefined);

  // 3. Annotate add & remove
  const annAdd = dispatcher.executeCommand('kubectl annotate deployment/worker-app team=infra contact=pager@example.com -n default');
  assert.equal(annAdd.code, 0);
  assert.ok(annAdd.stdout.includes('annotated'));
  const dAnnotated = graph.get('Deployment', 'default', 'worker-app');
  assert.equal(dAnnotated.metadata.annotations.team, 'infra');

  const annDel = dispatcher.executeCommand('kubectl annotate deployment/worker-app team- -n default');
  assert.equal(annDel.code, 0);
  const dAfterDel = graph.get('Deployment', 'default', 'worker-app');
  assert.equal(dAfterDel.metadata.annotations.team, undefined);

  // 4. Cordon & Uncordon
  const cordonRes = dispatcher.executeCommand('kubectl cordon worker-node-1');
  assert.equal(cordonRes.code, 0);
  assert.ok(cordonRes.stdout.includes('node/worker-node-1 cordoned'));
  assert.equal(graph.get('Node', null, 'worker-node-1').spec.unschedulable, true);

  const uncordonRes = dispatcher.executeCommand('kubectl uncordon worker-node-1');
  assert.equal(uncordonRes.code, 0);
  assert.ok(uncordonRes.stdout.includes('node/worker-node-1 uncordoned'));
  assert.equal(graph.get('Node', null, 'worker-node-1').spec.unschedulable, false);

  // 5. Drain
  const drainRes = dispatcher.executeCommand('kubectl drain worker-node-1 --ignore-daemonsets --force');
  assert.equal(drainRes.code, 0);
  assert.ok(drainRes.stdout.includes('drained'));

  // 6. Taint & Untaint
  const taintRes = dispatcher.executeCommand('kubectl taint nodes worker-node-1 key=val:NoSchedule');
  assert.equal(taintRes.code, 0);
  assert.ok(taintRes.stdout.includes('tainted'));

  const untaintRes = dispatcher.executeCommand('kubectl taint nodes worker-node-1 key:NoSchedule-');
  assert.equal(untaintRes.code, 0);
  assert.ok(untaintRes.stdout.includes('untainted'));
});

test('Subphase 1.2.1: MultiCliDispatcher - logs, exec, debug, top, auth can-i', () => {
  const graph = new ResourceGraph();
  const dispatcher = new MultiCliDispatcher({ graph });

  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'app-server-xyz', namespace: 'prod', labels: { app: 'app-server' } },
    spec: {
      containers: [
        { name: 'app-container', image: 'alpine:3.20', env: [{ name: 'PORT', value: '8080' }] }
      ]
    },
    status: { phase: 'Running', podIP: '10.244.1.45' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'node-alpha' },
    status: { nodeInfo: { kubeletVersion: 'v1.31.0' } }
  });

  // 1. Logs
  const logRes = dispatcher.executeCommand('kubectl logs app-server-xyz -n prod --tail=2');
  assert.equal(logRes.code, 0);
  assert.ok(logRes.stdout.includes('[INFO]'));

  // 2. Exec commands
  const execHost = dispatcher.executeCommand('kubectl exec app-server-xyz -n prod -- hostname');
  assert.equal(execHost.code, 0);
  assert.equal(execHost.stdout.trim(), 'app-server-xyz');

  const execUname = dispatcher.executeCommand('kubectl exec app-server-xyz -n prod -- uname -a');
  assert.equal(execUname.code, 0);
  assert.ok(execUname.stdout.includes('Linux app-server-xyz 6.8.0-cloud-native'));

  const execEnv = dispatcher.executeCommand('kubectl exec app-server-xyz -n prod -- env');
  assert.equal(execEnv.code, 0);
  assert.ok(execEnv.stdout.includes('PORT=8080'));

  // 3. Debug pod
  const debugRes = dispatcher.executeCommand('kubectl debug pod/app-server-xyz -it --image=busybox:1.36 -n prod');
  assert.equal(debugRes.code, 0);
  assert.ok(debugRes.stdout.includes('Targeting container "debugger"'));

  // 4. Top nodes & pods
  const topNodes = dispatcher.executeCommand('kubectl top nodes');
  assert.equal(topNodes.code, 0);
  assert.ok(topNodes.stdout.includes('CPU(cores)'));
  assert.ok(topNodes.stdout.includes('node-alpha'));

  const topPods = dispatcher.executeCommand('kubectl top pods -n prod');
  assert.equal(topPods.code, 0);
  assert.ok(topPods.stdout.includes('app-server-xyz'));

  // 5. Auth can-i
  const authRes = dispatcher.executeCommand('kubectl auth can-i create deployments -n prod');
  assert.equal(authRes.code, 0);
  assert.equal(authRes.stdout.trim(), 'yes');
});

test('Subphase 1.2.1: MultiCliDispatcher & TerminalEngine - kubeadm & etcdctl operations', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // 1. kubeadm init
  const kInit = dispatcher.executeCommand('kubeadm init');
  assert.equal(kInit.code, 0);
  assert.ok(kInit.stdout.includes('Your Kubernetes control-plane has initialized successfully!'));
  assert.ok(vfs.exists('/etc/kubernetes/admin.conf'));
  assert.ok(vfs.exists('/home/learner/.kube/config'));

  // 2. kubeadm join
  const kJoin = dispatcher.executeCommand('kubeadm join 192.168.1.10:6443 --token abcdef.0123456789abcdef');
  assert.equal(kJoin.code, 0);
  assert.ok(kJoin.stdout.includes('This node has joined the cluster:'));

  // 3. kubeadm upgrade plan & apply
  const kPlan = dispatcher.executeCommand('kubeadm upgrade plan');
  assert.equal(kPlan.code, 0);
  assert.ok(kPlan.stdout.includes('kube-apiserver'));

  const kApply = dispatcher.executeCommand('kubeadm upgrade apply v1.32.0');
  assert.equal(kApply.code, 0);
  assert.ok(kApply.stdout.includes('SUCCESS! Your cluster was upgraded to "v1.32.0"'));

  // 4. kubeadm token list & create
  const kTokenList = dispatcher.executeCommand('kubeadm token list');
  assert.equal(kTokenList.code, 0);
  assert.ok(kTokenList.stdout.includes('TOKEN'));

  const kTokenCreate = dispatcher.executeCommand('kubeadm token create --print-join-command');
  assert.equal(kTokenCreate.code, 0);
  assert.ok(kTokenCreate.stdout.includes('kubeadm join 192.168.1.10:6443'));

  // 5. etcdctl endpoint status & health
  const eHealth = dispatcher.executeCommand('etcdctl endpoint health');
  assert.equal(eHealth.code, 0);
  assert.ok(eHealth.stdout.includes('healthy'));

  const eStatus = dispatcher.executeCommand('etcdctl endpoint status');
  assert.equal(eStatus.code, 0);
  assert.ok(eStatus.stdout.includes('ENDPOINT'));
  assert.ok(eStatus.stdout.includes('IS LEADER'));

  // 6. etcdctl member list
  const eMembers = dispatcher.executeCommand('etcdctl member list');
  assert.equal(eMembers.code, 0);
  assert.ok(eMembers.stdout.includes('b07e1c841a029f12'));

  // 7. etcdctl snapshot status
  const eSnapStatus = dispatcher.executeCommand('etcdctl snapshot status /var/lib/etcd/backup.db');
  assert.equal(eSnapStatus.code, 0);
  assert.ok(eSnapStatus.stdout.includes('HASH'));
  assert.ok(eSnapStatus.stdout.includes('41fa2a87'));
});

test('Subphase 1.2.1: TerminalEngine (VirtualCluster backed) - Full Cluster Ops parity', () => {
  const cluster = new VirtualCluster();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const term = new TerminalEngine(cluster, vfs);

  // 1. Create and replace manifest
  const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: default
  labels:
    app: payments
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: pay
        image: payments:v1
`;
  vfs.writeFile('/tmp/payments.yaml', manifest);
  const applyRes = term.execute('kubectl apply -f /tmp/payments.yaml');
  assert.equal(applyRes.exitCode, 0);
  assert.ok(applyRes.output.includes('deployment/payments created'));

  // 2. Replace with updated replicas
  const updatedManifest = manifest.replace('replicas: 1', 'replicas: 3');
  vfs.writeFile('/tmp/payments.yaml', updatedManifest);
  const replaceRes = term.execute('kubectl replace -f /tmp/payments.yaml');
  assert.equal(replaceRes.exitCode, 0);
  assert.ok(replaceRes.output.includes('deployment/payments replaced'));
  assert.equal(cluster.getResource('Deployment', 'payments').spec.replicas, 3);

  // 3. Patch deployment
  const patchRes = term.execute('kubectl patch deployment payments -p {"spec":{"replicas":5}}');
  assert.equal(patchRes.exitCode, 0);
  assert.ok(patchRes.output.includes('deployment/payments patched'));
  assert.equal(cluster.getResource('Deployment', 'payments').spec.replicas, 5);

  // 4. Set selector on service
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'payments-svc', namespace: 'default' },
    spec: { selector: { app: 'old-app' }, ports: [{ port: 80 }] }
  });
  const setSelRes = term.execute('kubectl set selector service payments-svc app=payments');
  assert.equal(setSelRes.exitCode, 0);
  assert.ok(setSelRes.output.includes('service/payments-svc selector updated'));
  assert.equal(cluster.getResource('Service', 'payments-svc').spec.selector.app, 'payments');

  // 5. Rollout history
  const historyRes = term.execute('kubectl rollout history deployment/payments');
  assert.equal(historyRes.exitCode, 0);
  assert.ok(historyRes.output.includes('REVISION'));

  // 6. Exec into pod
  const pod = cluster.getResources('Pod', 'default')[0];
  assert.ok(pod);
  const execHost = term.execute(`kubectl exec ${pod.metadata.name} -- hostname`);
  assert.equal(execHost.exitCode, 0);
  assert.equal(execHost.output, pod.metadata.name);

  // 7. Debug pod
  const debugRes = term.execute(`kubectl debug ${pod.metadata.name} --image=busybox:1.36`);
  assert.equal(debugRes.exitCode, 0);
  assert.ok(debugRes.output.includes('Targeting container "debugger"'));

  // 8. Top pods -A
  const topAll = term.execute('kubectl top pods -A');
  assert.equal(topAll.exitCode, 0);
  assert.ok(topAll.output.includes('NAMESPACE'));
  assert.ok(topAll.output.includes('CPU(cores)'));

  // 9. Node taint and untaint
  const node = cluster.getResources('Node')[0];
  assert.ok(node);
  const taintRes = term.execute(`kubectl taint nodes ${node.metadata.name} role=heavy:NoSchedule`);
  assert.equal(taintRes.exitCode, 0);
  assert.ok(taintRes.output.includes('tainted'));

  const untaintRes = term.execute(`kubectl taint nodes ${node.metadata.name} role:NoSchedule-`);
  assert.equal(untaintRes.exitCode, 0);
  assert.ok(untaintRes.output.includes('untainted'));

  // 10. Kubeadm & Etcdctl
  const kInit = term.execute('kubeadm init');
  assert.equal(kInit.exitCode, 0);
  assert.ok(kInit.output.includes('Your Kubernetes control-plane has initialized successfully!'));

  const eStatus = term.execute('etcdctl endpoint status');
  assert.equal(eStatus.exitCode, 0);
  assert.ok(eStatus.output.includes('ENDPOINT'));
  assert.ok(eStatus.output.includes('IS LEADER'));

  const eMember = term.execute('etcdctl member list');
  assert.equal(eMember.exitCode, 0);
  assert.ok(eMember.output.includes('started'));
});
