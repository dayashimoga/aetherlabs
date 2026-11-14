/**
 * tests/stage3-k8s-networking-storage.test.js
 * Subphase 3.3.2 Verification: Domain 12 (Kubernetes Networking) & Domain 13 (Kubernetes Storage)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * CNI service discovery, ClusterIP vs Headless services, CoreDNS endpoints, NetworkPolicies,
 * Gateway API HTTPRoute, StorageClass volumeBindingMode, PVC dynamic provisioning,
 * and StatefulSets with persistent volumeClaimTemplates.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 3.3.2 — Domain 12 (K8s Networking) & Domain 13 (K8s Storage)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 12 and Domain 13 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain12 = pluginManager.getDomain('k8s-networking');
    assert.ok(domain12, 'Domain 12 (k8s-networking) must exist');
    assert.equal(domain12.category, 'Kubernetes & CNCF');
    assert.equal(domain12.trackId, 'track-k8s-admin');
    assert.equal(domain12.labs.length, 2);
    assert.equal(domain12.assessmentQuestions.length, 2);

    const domain13 = pluginManager.getDomain('k8s-storage');
    assert.ok(domain13, 'Domain 13 (k8s-storage) must exist');
    assert.equal(domain13.category, 'Kubernetes & CNCF');
    assert.equal(domain13.trackId, 'track-k8s-admin');
    assert.equal(domain13.labs.length, 2);
    assert.equal(domain13.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-k8snet-01-cni-services-dns',
      'lab-k8snet-02-networkpolicy-gateway',
      'lab-storage-01-sc-pvc-pv',
      'lab-storage-02-statefulset-volume-claims'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 labs for Subphase 3.3.2');

    for (const lab of subphaseLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;

      const beforeReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        [],
        { vfs, cluster }
      );

      assert.equal(
        beforeReport.passed,
        false,
        `Lab ${lab.id} should fail before solution execution`
      );
      assert.equal(
        beforeReport.score,
        0,
        `Lab ${lab.id} should score exactly 0% before solution execution`
      );
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-k8snet-01-cni-services-dns',
      'lab-k8snet-02-networkpolicy-gateway',
      'lab-storage-01-sc-pvc-pv',
      'lab-storage-02-statefulset-volume-claims'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;
      const term = new TerminalEngine(cluster, vfs);

      for (const cmd of lab.solutionCommands) {
        const res = term.execute(cmd, { manifestText: lab.starterManifest, vfs });
        assert.equal(
          res.exitCode,
          0,
          `Lab ${lab.id} solution command "${cmd}" failed with code ${res.exitCode}: ${res.output || res.stderr}`
        );
      }

      const afterReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        term.commandHistory,
        { vfs, cluster, commandHistory: term.commandHistory }
      );

      assert.equal(
        afterReport.passed,
        true,
        `Lab ${lab.id} should pass after solution execution: ${JSON.stringify(afterReport.results.filter((r) => !r.passed))}`
      );
      assert.equal(
        afterReport.score,
        100,
        `Lab ${lab.id} should score exactly 100% after solution execution`
      );
    }
  });

  it('4. Engine Parity: Domain 12 Kubernetes Networking Services, Headless, and Gateway API', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    term.execute('kubectl create namespace test-net');
    term.execute('kubectl create deployment api-server --image=redis:7-alpine -n test-net --replicas=2');
    term.execute('kubectl expose deployment api-server --port=6379 -n test-net');

    const svc = cluster.getResource('Service', 'api-server', 'test-net');
    assert.ok(svc, 'Service api-server must exist');
    assert.equal(svc.status.endpointCount, 2);

    const ep = cluster.getResource('Endpoints', 'api-server', 'test-net');
    assert.ok(ep, 'Endpoints api-server must exist in cluster');
    assert.equal(ep.subsets[0].addresses.length, 2);

    // Headless Service
    const headlessYaml = [
      'apiVersion: v1',
      'kind: Service',
      'metadata:',
      '  name: api-headless',
      '  namespace: test-net',
      'spec:',
      '  clusterIP: None',
      '  selector:',
      '    app: api-server',
      '  ports:',
      '  - port: 6379'
    ].join('\n');
    vfs.writeFile('/tmp/headless.yaml', headlessYaml);
    term.execute('kubectl apply -f /tmp/headless.yaml');

    const headlessSvc = cluster.getResource('Service', 'api-headless', 'test-net');
    assert.ok(headlessSvc, 'Headless Service must exist');
    assert.equal(headlessSvc.spec.clusterIP, 'None');

    // Gateway API HTTPRoute
    const routeYaml = [
      'apiVersion: gateway.networking.k8s.io/v1',
      'kind: HTTPRoute',
      'metadata:',
      '  name: test-route',
      '  namespace: test-net',
      'spec:',
      '  rules:',
      '  - matches:',
      '    - path:',
      '        type: PathPrefix',
      '        value: /test'
    ].join('\n');
    vfs.writeFile('/tmp/route.yaml', routeYaml);
    term.execute('kubectl apply -f /tmp/route.yaml');

    const route = cluster.getResource('HTTPRoute', 'test-route', 'test-net');
    assert.ok(route, 'HTTPRoute must exist');
  });

  it('5. Engine Parity: Domain 13 Kubernetes Storage StorageClasses, PVCs, and StatefulSets', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // StorageClass
    const scYaml = [
      'apiVersion: storage.k8s.io/v1',
      'kind: StorageClass',
      'metadata:',
      '  name: test-sc',
      'provisioner: kubernetes.io/no-provisioner',
      'volumeBindingMode: WaitForFirstConsumer'
    ].join('\n');
    vfs.writeFile('/tmp/sc.yaml', scYaml);
    term.execute('kubectl apply -f /tmp/sc.yaml');

    const sc = cluster.getResource('StorageClass', 'test-sc');
    assert.ok(sc, 'StorageClass test-sc must exist');
    assert.equal(sc.volumeBindingMode, 'WaitForFirstConsumer');

    // StatefulSet with volumeClaimTemplates
    term.execute('kubectl create namespace test-store');
    const stsYaml = [
      'apiVersion: apps/v1',
      'kind: StatefulSet',
      'metadata:',
      '  name: db-cluster',
      '  namespace: test-store',
      'spec:',
      '  serviceName: db-headless',
      '  replicas: 3',
      '  selector:',
      '    matchLabels:',
      '      app: db-cluster',
      '  template:',
      '    metadata:',
      '      labels:',
      '        app: db-cluster',
      '    spec:',
      '      containers:',
      '      - name: db',
      '        image: redis:7-alpine',
      '  volumeClaimTemplates:',
      '  - metadata:',
      '      name: data',
      '    spec:',
      '      accessModes: [ "ReadWriteOnce" ]',
      '      resources:',
      '        requests:',
      '          storage: 5Gi'
    ].join('\n');
    vfs.writeFile('/tmp/sts.yaml', stsYaml);
    term.execute('kubectl apply -f /tmp/sts.yaml');

    const sts = cluster.getResource('StatefulSet', 'db-cluster', 'test-store');
    assert.ok(sts, 'StatefulSet db-cluster must exist');
    assert.equal(sts.spec.replicas, 3);

    const pods = cluster.getResources('Pod', 'test-store');
    assert.equal(pods.length, 3, 'StatefulSet must reconcile 3 ordinal pods');
    assert.deepEqual(
      pods.map((p) => p.metadata.name).sort(),
      ['db-cluster-0', 'db-cluster-1', 'db-cluster-2']
    );
  });
});
