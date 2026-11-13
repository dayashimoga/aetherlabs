'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');

test('Subphase 1.2.3: Dynamic Pod Name Autocompletion from ResourceGraph & VirtualCluster', () => {
  const vc = new VirtualCluster();
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'order-processor-pod-1', namespace: 'production' }
  });
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'order-processor-pod-2', namespace: 'production' }
  });
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-gateway-worker', namespace: 'production' }
  });

  const term = new TerminalEngine(vc);

  // 1. Multiple matching pods -> completes to longest common prefix
  const r1 = term.autocomplete('kubectl get pods ord');
  assert.deepEqual(r1.completions, ['order-processor-pod-1', 'order-processor-pod-2']);
  assert.equal(r1.line, 'kubectl get pods order-processor-pod-');
  assert.equal(r1.cursor, 'kubectl get pods order-processor-pod-'.length);

  // 2. Single matching pod -> completes full name with trailing space
  const r2 = term.autocomplete('kubectl get pods pay');
  assert.deepEqual(r2.completions, ['payment-gateway-worker']);
  assert.equal(r2.line, 'kubectl get pods payment-gateway-worker ');
  assert.equal(r2.cursor, 'kubectl get pods payment-gateway-worker '.length);

  // 3. Tab completion with no prefix -> returns all available pods
  const r3 = term.autocomplete('kubectl get pods ');
  assert.ok(r3.completions.includes('order-processor-pod-1'));
  assert.ok(r3.completions.includes('order-processor-pod-2'));
  assert.ok(r3.completions.includes('payment-gateway-worker'));
});

test('Subphase 1.2.3: Namespace-Scoped Autocompletion (-n and --namespace)', () => {
  const vc = new VirtualCluster();
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'cart-service-prod', namespace: 'production' }
  });
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'cart-service-stage', namespace: 'staging' }
  });

  const term = new TerminalEngine(vc);

  // 1. In production namespace, only cart-service-prod should match
  const rProd = term.autocomplete('kubectl get pods -n production cart');
  assert.deepEqual(rProd.completions, ['cart-service-prod']);
  assert.equal(rProd.line, 'kubectl get pods -n production cart-service-prod ');

  // 2. In staging namespace, only cart-service-stage should match
  const rStage = term.autocomplete('kubectl get pods --namespace staging cart');
  assert.deepEqual(rStage.completions, ['cart-service-stage']);
  assert.equal(rStage.line, 'kubectl get pods --namespace staging cart-service-stage ');

  // 3. Namespace completion after -n
  const rNs = term.autocomplete('kubectl get pods -n prod');
  assert.deepEqual(rNs.completions, ['production']);
  assert.equal(rNs.line, 'kubectl get pods -n production ');

  // 4. Namespace completion after --namespace=
  const rNsEq = term.autocomplete('kubectl get pods --namespace=prod');
  assert.deepEqual(rNsEq.completions, ['--namespace=production']);
  assert.equal(rNsEq.line, 'kubectl get pods --namespace=production ');
});

test('Subphase 1.2.3: Dynamic Deployments, Services, and Nodes Autocompletion', () => {
  const vc = new VirtualCluster();
  vc.applyResource({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'checkout-api', namespace: 'production' }
  });
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'checkout-service', namespace: 'production' }
  });

  const term = new TerminalEngine(vc);

  // 1. Deployment completion
  const rDeploy = term.autocomplete('kubectl get deploy check');
  assert.deepEqual(rDeploy.completions, ['checkout-api']);
  assert.equal(rDeploy.line, 'kubectl get deploy checkout-api ');

  // 2. Service completion
  const rSvc = term.autocomplete('kubectl describe svc check');
  assert.deepEqual(rSvc.completions, ['checkout-service']);
  assert.equal(rSvc.line, 'kubectl describe svc checkout-service ');

  // 3. Node completion across control-plane and worker nodes
  const rNode = term.autocomplete('kubectl describe node kube');
  assert.ok(rNode.completions.includes('kubelabs-control-plane'));
  assert.ok(rNode.completions.includes('kubelabs-worker-01'));
  assert.ok(rNode.completions.includes('kubelabs-worker-gpu-02'));
  assert.equal(rNode.line, 'kubectl describe node kubelabs-');

  // 4. Node completion on cordon
  const rCordon = term.autocomplete('kubectl cordon kubelabs-worker-g');
  assert.deepEqual(rCordon.completions, ['kubelabs-worker-gpu-02']);
  assert.equal(rCordon.line, 'kubectl cordon kubelabs-worker-gpu-02 ');
});

test('Subphase 1.2.3: Autocompletion across logs, exec, scale, and kind/name slash syntax', () => {
  const vc = new VirtualCluster();
  vc.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'nginx-ingress-controller-abc12', namespace: 'kube-system' }
  });
  vc.applyResource({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'auth-service', namespace: 'production' }
  });

  const term = new TerminalEngine(vc);

  // 1. kubectl logs targets pods directly
  const rLogs = term.autocomplete('kubectl logs -n kube-system nginx');
  assert.deepEqual(rLogs.completions, ['nginx-ingress-controller-abc12']);
  assert.equal(rLogs.line, 'kubectl logs -n kube-system nginx-ingress-controller-abc12 ');

  // 2. kubectl exec targets pods directly
  const rExec = term.autocomplete('kubectl exec -it -n kube-system nginx -- /bin/sh');
  // Completing at nginx
  const cursor = 'kubectl exec -it -n kube-system nginx'.length;
  const rExecPartial = term.autocomplete('kubectl exec -it -n kube-system nginx -- /bin/sh', cursor);
  assert.deepEqual(rExecPartial.completions, ['nginx-ingress-controller-abc12']);

  // 3. kind/name slash syntax: pod/nginx
  const rSlash = term.autocomplete('kubectl describe pod/ng');
  assert.deepEqual(rSlash.completions, ['pod/nginx-ingress-controller-abc12']);
  assert.equal(rSlash.line, 'kubectl describe pod/nginx-ingress-controller-abc12 ');

  // 4. kubectl scale deployment
  const rScale = term.autocomplete('kubectl scale deployment auth');
  assert.deepEqual(rScale.completions, ['auth-service']);
  assert.equal(rScale.line, 'kubectl scale deployment auth-service ');
});

test('Subphase 1.2.3: Live lab cluster state dynamic autocompletion (CrashLoopBackOff Lab)', () => {
  const { PluginManager } = require('../src/plugins/pluginManager');
  const pm = new PluginManager();
  pm.loadAllPlugins();
  const lab = pm.getLab('lab-sre-01');

  const vc = new VirtualCluster();
  if (lab.initialClusterState) {
    vc.loadSnapshot(lab.initialClusterState);
  }

  const term = new TerminalEngine(vc);

  // Should autocomplete order-processor pods from live lab state
  const r1 = term.autocomplete('kubectl get pods ord');
  assert.ok(r1.completions.length >= 2);
  assert.ok(r1.completions.every((c) => c.startsWith('order-processor')));
  assert.ok(r1.line.startsWith('kubectl get pods order-processor'));

  // Should autocomplete order-processor deployment
  const r2 = term.autocomplete('kubectl describe deploy ord');
  assert.deepEqual(r2.completions, ['order-processor']);
  assert.equal(r2.line, 'kubectl describe deploy order-processor ');
});

