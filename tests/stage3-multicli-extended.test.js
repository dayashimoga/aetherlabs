'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');

function bootstrapTestCluster(graph) {
  graph.set({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: 'default' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: 'prod' }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'worker-node-1', labels: { 'kubernetes.io/hostname': 'worker-node-1' } },
    spec: { taints: [] },
    status: { conditions: [{ type: 'Ready', status: 'True' }] }
  });

  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web-app', namespace: 'default' },
    spec: {
      replicas: 2,
      template: {
        metadata: { labels: { app: 'web' } },
        spec: { containers: [{ name: 'nginx', image: 'nginx:1.25' }] }
      }
    },
    status: { readyReplicas: 2 }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-app-pod-1', namespace: 'default', labels: { app: 'web' } },
    spec: { nodeName: 'worker-node-1' },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] }
  });
}

test('Subphase 3.1.2: kubectl autoscale creates HorizontalPodAutoscaler resource', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const term = new TerminalEngine({ graph });

  const res = term.execute('kubectl autoscale deployment web-app --min=2 --max=8 --cpu-percent=75 -n default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /horizontalpodautoscaler\.autoscaling\/web-app autoscaled/);

  const hpa = graph.get('HorizontalPodAutoscaler', 'default', 'web-app');
  assert.ok(hpa);
  assert.equal(hpa.spec.minReplicas, 2);
  assert.equal(hpa.spec.maxReplicas, 8);
  assert.equal(hpa.spec.scaleTargetRef.name, 'web-app');
  assert.equal(hpa.spec.metrics[0].resource.target.averageUtilization, 75);
});

test('Subphase 3.1.2: kubectl diff evaluates live vs target manifest state', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  // 1. Identical manifest produces exit code 0 and no diff
  vfs.writeFile('/home/learner/same.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: default
spec:
  replicas: 2
`);
  let res = term.execute('kubectl diff -f /home/learner/same.yaml');
  assert.equal(res.code, 0);
  assert.equal(res.stdout, '');

  // 2. Modified manifest produces exit code 1 with unified diff
  vfs.writeFile('/home/learner/diff.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: default
spec:
  replicas: 5
`);
  res = term.execute('kubectl diff -f /home/learner/diff.yaml');
  assert.equal(res.code, 1);
  assert.match(res.stdout, /--- \/tmp\/LIVE/);
  assert.match(res.stdout, /\+\+\+ \/tmp\/CONFIG/);
  assert.match(res.stdout, /replicas/);
});

test('Subphase 3.1.2: kubectl wait condition evaluation and timeout handling', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const term = new TerminalEngine({ graph });

  // Condition Ready on existing running pod
  let res = term.execute('kubectl wait --for=condition=Ready pod/web-app-pod-1 -n default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /pod\/web-app-pod-1 condition met/);

  // Non-existent pod produces error
  res = term.execute('kubectl wait --for=condition=Ready pod/ghost-pod -n default');
  assert.equal(res.code, 1);
  assert.match(res.stderr, /ghost-pod not found/);

  // Wait for delete
  res = term.execute('kubectl wait --for=delete pod/ghost-pod -n default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /pod\/ghost-pod condition met/);
});

test('Subphase 3.1.2: kubectl debug creates ephemeral container on target pod', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const term = new TerminalEngine({ graph });

  const res = term.execute('kubectl debug pod/web-app-pod-1 -it --image=busybox:1.36 -n default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Targeting container "debugger"/);

  const pod = graph.get('Pod', 'default', 'web-app-pod-1');
  assert.ok(pod.spec.ephemeralContainers);
  assert.equal(pod.spec.ephemeralContainers[0].image, 'busybox:1.36');
});

test('Subphase 3.1.2: kubectl taint and untaint operations on nodes', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const term = new TerminalEngine({ graph });

  // Add taint
  let res = term.execute('kubectl taint nodes worker-node-1 dedicated=special:NoSchedule');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /node\/worker-node-1 tainted/);

  let node = graph.get('Node', null, 'worker-node-1');
  assert.ok(node.spec.taints.some((t) => t.key === 'dedicated' && t.value === 'special' && t.effect === 'NoSchedule'));

  // Remove taint
  res = term.execute('kubectl taint nodes worker-node-1 dedicated:NoSchedule-');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /node\/worker-node-1 untainted/);

  node = graph.get('Node', null, 'worker-node-1');
  assert.ok(!node.spec.taints.some((t) => t.key === 'dedicated'));
});

test('Subphase 3.1.2: kubectl config management (view, current-context, set-context, use-context, get-contexts)', () => {
  const graph = new ResourceGraph();
  const term = new TerminalEngine({ graph });

  // Current context
  let res = term.execute('kubectl config current-context');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'kubernetes-admin@kubernetes');

  // Set context
  res = term.execute('kubectl config set-context staging --cluster=kubernetes --user=staging-admin --namespace=staging');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Context "staging" modified/);

  // Use context
  res = term.execute('kubectl config use-context staging');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Switched to context "staging"/);

  res = term.execute('kubectl config current-context');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'staging');

  // Get contexts
  res = term.execute('kubectl config get-contexts');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /staging/);
  assert.match(res.stdout, /\*/);

  // Config view
  res = term.execute('kubectl config view');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /current-context: staging/);
});

test('Subphase 3.1.2: kubectl explain OpenAPI documentation and kubectl edit annotation', () => {
  const graph = new ResourceGraph();
  bootstrapTestCluster(graph);
  const term = new TerminalEngine({ graph });

  // kubectl explain
  let res = term.execute('kubectl explain pod');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /KIND:\s+Pod/);
  assert.match(res.stdout, /VERSION:\s+v1/);
  assert.match(res.stdout, /FIELDS:/);

  // kubectl edit
  res = term.execute('kubectl edit deployment web-app -n default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /deployment\/web-app edited/);

  const deploy = graph.get('Deployment', 'default', 'web-app');
  assert.ok(deploy.metadata.annotations['kubectl.kubernetes.io/last-edited']);
});

test('Subphase 3.1.2: Extended Cloud-Native CLIs (flux, velero, vcluster, and aws eks/iam/sts/ec2)', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  // 1. Flux GitOps
  let res = term.execute('flux get kustomizations');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /apps/);

  res = term.execute('flux reconcile kustomization apps');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /reconciled successfully/);

  // 2. Velero Disaster Recovery
  res = term.execute('velero backup create test-backup --include-namespaces default');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Backup request "test-backup" submitted/);

  res = term.execute('velero backup get');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /test-backup/);

  res = term.execute('velero restore create --from-backup=test-backup');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Restore request.*submitted/);

  // 3. vcluster Multi-Tenancy
  res = term.execute('vcluster create tenant-1 -n vcluster-tenant-1');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /vCluster "tenant-1" successfully created/);

  res = term.execute('vcluster list');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /tenant-1/);

  res = term.execute('vcluster connect tenant-1');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Switched context to vcluster_tenant-1/);

  // 4. AWS EKS, STS, IAM, and EC2
  res = term.execute('aws sts get-caller-identity');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /cloud-engineer/);

  res = term.execute('aws eks update-kubeconfig --name production-eks --region us-west-2');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Updated context arn:aws:eks:us-west-2.*in \/home\/learner\/\.kube\/config/);

  res = term.execute('aws eks describe-cluster --name production-eks');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /"status": "ACTIVE"/);

  res = term.execute('aws iam get-role --role-name eks-pod-identity-role');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /eks-pod-identity-role/);

  res = term.execute('aws ec2 describe-instances');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /m6i\.xlarge/);
});
