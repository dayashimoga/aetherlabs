'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const {
  HelmReleaseManager,
  ArgoCDController,
  IstioMeshEngine,
  OpenTofuStateGraph,
  MultiCloudRegistry
} = require('../src/core/cloudExtensions');

test('Subphase 1.3.2: HelmReleaseManager full lifecycle (install, upgrade, rollback, uninstall)', () => {
  const graph = new ResourceGraph();
  const helm = new HelmReleaseManager(graph);

  // 1. Install release v1
  const rel1 = helm.install('web-app', 'bitnami/nginx', { replicaCount: 2 }, { namespace: 'production' });
  assert.equal(rel1.revision, 1);
  assert.equal(rel1.status, 'deployed');

  // Verify resources exist in ResourceGraph
  const dep1 = graph.get('Deployment', 'production', 'web-app');
  assert.ok(dep1);
  assert.equal(dep1.spec.replicas, 2);

  // 2. Upgrade release to v2 with 4 replicas
  const rel2 = helm.upgrade('web-app', 'bitnami/nginx', { replicaCount: 4 }, { namespace: 'production' });
  assert.equal(rel2.revision, 2);
  assert.equal(rel2.status, 'deployed');

  const dep2 = graph.get('Deployment', 'production', 'web-app');
  assert.equal(dep2.spec.replicas, 4);

  // 3. Rollback release back to revision 1 (2 replicas)
  const rel3 = helm.rollback('web-app', 1, { namespace: 'production' });
  assert.equal(rel3.revision, 3);
  assert.equal(rel3.status, 'deployed');

  const dep3 = graph.get('Deployment', 'production', 'web-app');
  assert.equal(dep3.spec.replicas, 2);

  // 4. Uninstall release
  const uninstalled = helm.uninstall('web-app', { namespace: 'production' });
  assert.equal(uninstalled.status, 'uninstalled');
  assert.equal(graph.get('Deployment', 'production', 'web-app'), null);
});

test('Subphase 1.3.2: ArgoCDController GitOps reconciliation, drift detection, and self-heal', () => {
  const graph = new ResourceGraph();
  const argo = new ArgoCDController(graph);

  const appResource = {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Application',
    metadata: { name: 'payment-service', namespace: 'argocd' },
    spec: {
      source: { repoURL: 'https://github.com/org/gitops', path: 'apps/payment', targetRevision: 'main' },
      destination: { namespace: 'production' },
      syncPolicy: { automated: { selfHeal: true } }
    }
  };

  // 1. Initial reconcile: live deployment missing in cluster -> self-heal activates
  const reconciled = argo.reconcile(appResource);
  assert.equal(reconciled.status.sync.status, 'Synced');
  assert.equal(reconciled.status.health.status, 'Healthy');

  // Verify Deployment was created in ResourceGraph via self-heal
  const liveDep = graph.get('Deployment', 'production', 'payment-service');
  assert.ok(liveDep);
  assert.equal(liveDep.metadata.labels['app.kubernetes.io/instance'], 'payment-service');
});

test('Subphase 1.3.2: IstioMeshEngine canary routing, fault injection, and PeerAuthentication mTLS', () => {
  const graph = new ResourceGraph();
  const istio = new IstioMeshEngine(graph);

  // 1. Setup VirtualService with canary split: v1 (80%) vs v2 (20%) and fault injection
  graph.set({
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'VirtualService',
    metadata: { name: 'reviews-route', namespace: 'default' },
    spec: {
      http: [
        {
          match: [{ uri: { prefix: '/v2' } }],
          fault: { abort: { httpStatus: 503 } },
          route: [{ destination: { host: 'reviews', subset: 'v2' } }]
        },
        {
          route: [
            { destination: { host: 'reviews', subset: 'v1' }, weight: 80 },
            { destination: { host: 'reviews', subset: 'v2' }, weight: 20 }
          ]
        }
      ]
    }
  });

  // Test fault injection route
  const faultRoute = istio.resolveRoute('reviews-route', 'default', { uri: '/v2/items' });
  assert.ok(faultRoute.fault);
  assert.equal(faultRoute.fault.httpStatus, 503);

  // Test canary weighted routing (roll = 0.1 -> v1, roll = 0.9 -> v2)
  const routeV1 = istio.resolveRoute('reviews-route', 'default', { uri: '/api/reviews', random: 0.1 });
  assert.equal(routeV1.subset, 'v1');

  const routeV2 = istio.resolveRoute('reviews-route', 'default', { uri: '/api/reviews', random: 0.9 });
  assert.equal(routeV2.subset, 'v2');

  // 2. Setup PeerAuthentication with STRICT mTLS
  graph.set({
    apiVersion: 'security.istio.io/v1beta1',
    kind: 'PeerAuthentication',
    metadata: { name: 'default', namespace: 'default' },
    spec: { mtls: { mode: 'STRICT' } }
  });

  // Plaintext rejected
  const plainCheck = istio.checkMTLS('default', false);
  assert.equal(plainCheck.allowed, false);
  assert.match(plainCheck.reason, /mTLS STRICT rejected/);

  // TLS accepted
  const tlsCheck = istio.checkMTLS('default', true);
  assert.equal(tlsCheck.allowed, true);
});

test('Subphase 1.3.2: OpenTofuStateGraph schema v4, drift detection, and state export', () => {
  const tf = new OpenTofuStateGraph();

  tf.applyResource('aws_vpc', 'main_vpc', 'hashicorp/aws', { cidr_block: '10.0.0.0/16', enable_dns_hostnames: true });
  tf.applyResource('aws_subnet', 'public_subnet_1', 'hashicorp/aws', { cidr_block: '10.0.1.0/24' }, ['aws_vpc.main_vpc']);

  // Detect drift
  const declaredPlan = [
    { type: 'aws_vpc', name: 'main_vpc', attributes: { cidr_block: '10.0.0.0/16', enable_dns_hostnames: false } }
  ];

  const drifts = tf.detectDrift(declaredPlan);
  assert.equal(drifts.length, 1);
  assert.equal(drifts[0].attribute, 'enable_dns_hostnames');
  assert.equal(drifts[0].expected, false);
  assert.equal(drifts[0].actual, true);

  // Export state
  const stateExport = tf.exportState();
  assert.equal(stateExport.version, 4);
  assert.equal(stateExport.resources.length, 2);
});

test('Subphase 1.3.2: MultiCloudRegistry catalog across AWS, Azure, and GCP', () => {
  const registry = new MultiCloudRegistry();

  registry.register('aws', 'aws_eks_cluster', 'prod-eks', { version: '1.30', region: 'us-east-1' });
  registry.register('azure', 'azurerm_kubernetes_cluster', 'prod-aks', { kubernetes_version: '1.30', location: 'eastus' });
  registry.register('gcp', 'google_container_cluster', 'prod-gke', { location: 'us-central1' });

  assert.equal(registry.list('aws').length, 1);
  assert.equal(registry.list('azure').length, 1);
  assert.equal(registry.list('gcp').length, 1);
  assert.equal(registry.list().length, 3);
});

