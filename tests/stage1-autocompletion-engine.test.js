'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AutocompletionEngine } = require('../src/core/autocompletionEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const ContextAwareQuickKeyEngine = require('../public/js/quickKeyEngine');

test('Subphase 1.3.2: Root command completion across cloud-native binaries', () => {
  const engine = new AutocompletionEngine();

  // Root binary autocompletion
  const rK = engine.autocomplete('kub');
  assert.deepEqual(rK.completions, ['kubeadm', 'kubectl']);
  assert.equal(rK.line, 'kube');

  const rH = engine.autocomplete('he');
  assert.deepEqual(rH.completions, ['helm']);
  assert.equal(rH.line, 'helm ');

  const rD = engine.autocomplete('dock');
  assert.deepEqual(rD.completions, ['docker']);
  assert.equal(rD.line, 'docker ');

  const rA = engine.autocomplete('argo');
  assert.deepEqual(rA.completions, ['argocd']);
  assert.equal(rA.line, 'argocd ');
});

test('Subphase 1.3.2: Multi-CLI Subcommand Autocompletion (helm, docker, argocd, tofu, git, systemctl)', () => {
  const engine = new AutocompletionEngine();

  // Helm subcommands
  const rHelm = engine.autocomplete('helm ');
  assert.ok(rHelm.completions.includes('install'));
  assert.ok(rHelm.completions.includes('upgrade'));
  assert.ok(rHelm.completions.includes('list'));
  assert.ok(rHelm.completions.includes('repo'));

  const rHelmInst = engine.autocomplete('helm inst');
  assert.deepEqual(rHelmInst.completions, ['install']);
  assert.equal(rHelmInst.line, 'helm install ');

  // Docker subcommands
  const rDocker = engine.autocomplete('docker ');
  assert.ok(rDocker.completions.includes('run'));
  assert.ok(rDocker.completions.includes('build'));
  assert.ok(rDocker.completions.includes('ps'));
  assert.ok(rDocker.completions.includes('logs'));

  // ArgoCD subcommands
  const rArgo = engine.autocomplete('argocd ');
  assert.ok(rArgo.completions.includes('app'));
  assert.ok(rArgo.completions.includes('sync'));

  const rArgoApp = engine.autocomplete('argocd app ');
  assert.ok(rArgoApp.completions.includes('get'));
  assert.ok(rArgoApp.completions.includes('list'));
  assert.ok(rArgoApp.completions.includes('sync'));

  // OpenTofu / Terraform
  const rTofu = engine.autocomplete('tofu ');
  assert.ok(rTofu.completions.includes('init'));
  assert.ok(rTofu.completions.includes('plan'));
  assert.ok(rTofu.completions.includes('apply'));

  const rTerraState = engine.autocomplete('terraform state ');
  assert.ok(rTerraState.completions.includes('list'));
  assert.ok(rTerraState.completions.includes('show'));

  // Git
  const rGit = engine.autocomplete('git ');
  assert.ok(rGit.completions.includes('status'));
  assert.ok(rGit.completions.includes('commit'));
  assert.ok(rGit.completions.includes('checkout'));

  const rGitBranch = engine.autocomplete('git checkout ');
  assert.ok(rGitBranch.completions.includes('main'));
  assert.ok(rGitBranch.completions.includes('develop'));

  // Systemctl
  const rSys = engine.autocomplete('systemctl stat');
  assert.deepEqual(rSys.completions, ['status']);
  assert.equal(rSys.line, 'systemctl status ');

  const rSysSvc = engine.autocomplete('systemctl status kube');
  assert.deepEqual(rSysSvc.completions, ['kubelet.service']);
  assert.equal(rSysSvc.line, 'systemctl status kubelet.service ');
});

test('Subphase 1.3.2: CLI Flags and Formats Autocompletion', () => {
  const engine = new AutocompletionEngine();

  // Flags: --all-namespaces
  const rAllNs = engine.autocomplete('kubectl get pods --all');
  assert.deepEqual(rAllNs.completions, ['--all-namespaces']);
  assert.equal(rAllNs.line, 'kubectl get pods --all-namespaces ');

  // Flags: --dry-run
  const rDry = engine.autocomplete('kubectl create deployment web --image=nginx --dry');
  assert.deepEqual(rDry.completions, ['--dry-run=client', '--dry-run=server']);
  assert.equal(rDry.line, 'kubectl create deployment web --image=nginx --dry-run=');

  // Format: -o / --output
  const rOutSpace = engine.autocomplete('kubectl get pods -o ');
  assert.ok(rOutSpace.completions.includes('json'));
  assert.ok(rOutSpace.completions.includes('yaml'));
  assert.ok(rOutSpace.completions.includes('wide'));

  const rOutPrefix = engine.autocomplete('kubectl get pods -o y');
  assert.deepEqual(rOutPrefix.completions, ['yaml']);
  assert.equal(rOutPrefix.line, 'kubectl get pods -o yaml ');

  const rOutEq = engine.autocomplete('kubectl get pods --output=j');
  assert.deepEqual(rOutEq.completions, ['--output=json', '--output=jsonpath=']);
});

test('Subphase 1.3.2: VFS File and Directory Path Autocompletion', () => {
  const vfs = new VirtualFileSystem();
  vfs.mkdir('/manifests/apps', { recursive: true });
  vfs.writeFile('/manifests/apps/frontend.yaml', 'apiVersion: apps/v1\nkind: Deployment\n');
  vfs.writeFile('/manifests/apps/backend.yaml', 'apiVersion: apps/v1\nkind: Deployment\n');
  vfs.writeFile('/manifests/ingress.yaml', 'apiVersion: networking.k8s.io/v1\nkind: Ingress\n');

  const engine = new AutocompletionEngine({ vfs, cwd: '/home/learner' });

  // Path completion with -f
  const rFile = engine.autocomplete('kubectl apply -f /manifests/');
  assert.ok(rFile.completions.includes('/manifests/apps/'));
  assert.ok(rFile.completions.includes('/manifests/ingress.yaml'));

  // Subdirectory path completion
  const rApp = engine.autocomplete('kubectl apply -f /manifests/apps/');
  assert.ok(rApp.completions.includes('/manifests/apps/frontend.yaml'));
  assert.ok(rApp.completions.includes('/manifests/apps/backend.yaml'));

  // Relative path completion
  vfs.mkdir('/home/learner/project', { recursive: true });
  vfs.writeFile('/home/learner/project/app.js', 'console.log("hello");');
  const rRel = engine.autocomplete('cat proj');
  assert.deepEqual(rRel.completions, ['project/']);
  assert.equal(rRel.line, 'cat project/');
});

test('Subphase 1.3.2: Dynamic Resource Graph and Virtual Cluster Autocompletion', () => {
  const graph = new ResourceGraph();
  const cluster = new VirtualCluster();

  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'catalog-service', namespace: 'ecommerce' }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: 'ecommerce' }
  });

  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'catalog-worker-abc', namespace: 'ecommerce' }
  });

  const engine = new AutocompletionEngine({ graph, cluster });

  // Namespaces autocompletion
  const rNs = engine.autocomplete('kubectl get pods -n ecom');
  assert.deepEqual(rNs.completions, ['ecommerce']);
  assert.equal(rNs.line, 'kubectl get pods -n ecommerce ');

  // Pods autocompletion scoped to namespace
  const rPod = engine.autocomplete('kubectl logs -n ecommerce cat');
  assert.deepEqual(rPod.completions, ['catalog-worker-abc']);
  assert.equal(rPod.line, 'kubectl logs -n ecommerce catalog-worker-abc ');

  // Deployment autocompletion
  const rDeploy = engine.autocomplete('kubectl describe deployment -n ecommerce cat');
  assert.deepEqual(rDeploy.completions, ['catalog-service']);
  assert.equal(rDeploy.line, 'kubectl describe deployment -n ecommerce catalog-service ');

  // Kind/name slash syntax
  const rSlash = engine.autocomplete('kubectl describe deployment/cat');
  assert.deepEqual(rSlash.completions, ['deployment/catalog-service']);
  assert.equal(rSlash.line, 'kubectl describe deployment/catalog-service ');
});

test('Subphase 1.3.2: QuickKeyEngine Syntax-Aware Token Insertion Integration', () => {
  // Empty line -> prepend binary for verbs
  assert.deepEqual(ContextAwareQuickKeyEngine.insertToken('', 0, 'kubectl'), {
    line: 'kubectl ',
    cursorPos: 8
  });

  assert.deepEqual(ContextAwareQuickKeyEngine.insertToken('', 0, 'get'), {
    line: 'kubectl get ',
    cursorPos: 12
  });

  // Verb replacement (prevent "kubectl get describe")
  assert.deepEqual(ContextAwareQuickKeyEngine.insertToken('kubectl get ', 12, 'describe'), {
    line: 'kubectl describe ',
    cursorPos: 17
  });

  // Resource chaining: pods + svc -> pods,svc
  assert.deepEqual(ContextAwareQuickKeyEngine.insertToken('kubectl get pods ', 17, 'svc'), {
    line: 'kubectl get pods,svc ',
    cursorPos: 21
  });

  // Pipe insertion
  assert.deepEqual(ContextAwareQuickKeyEngine.insertToken('kubectl get pods ', 17, 'grep'), {
    line: 'kubectl get pods | grep ',
    cursorPos: 24
  });
});

test('Subphase 1.3.2: TerminalEngine Autocompletion Engine Delegation', () => {
  const cluster = new VirtualCluster();
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'metrics-server-unique-abc12', namespace: 'kube-system' }
  });

  const term = new TerminalEngine(cluster);
  assert.ok(term.autocompletionEngine instanceof AutocompletionEngine);

  // Tab completion via terminal engine
  const r = term.autocomplete('kubectl get pods -n kube-system metrics-');
  assert.deepEqual(r.completions, ['metrics-server-unique-abc12']);
  assert.equal(r.line, 'kubectl get pods -n kube-system metrics-server-unique-abc12 ');
});
