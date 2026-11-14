/**
 * tests/stage4-service-mesh.test.js
 * Subphase 4.2.1 Verification: Domain 23 (Service Mesh Core), Domain 24 (Istio Service Mesh) & Domain 25 (Linkerd Service Mesh)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Envoy xDS configuration, namespace sidecar injection, istioctl analyze audits,
 * Istio VirtualService canary routing, DestinationRules, STRICT PeerAuthentication mTLS,
 * and Linkerd ServiceProfile retry budgets, LinkerdMeshController evaluation, and Linkerd Viz telemetry.
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
const { ResourceGraph } = require('../src/core/resourceGraph');
const { IstioMeshController, LinkerdMeshController } = require('../src/core/autoscalingAndMeshEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.2.1 — Domain 23 (Service Mesh Core), Domain 24 (Istio Mesh) & Domain 25 (Linkerd Mesh)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 23, 24, and 25 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain23 = pluginManager.getDomain('service-mesh-core');
    assert.ok(domain23, 'Domain 23 (service-mesh-core) must exist');
    assert.equal(domain23.category, 'Service Mesh & Networking');
    assert.equal(domain23.trackId, 'track-devsecops');
    assert.equal(domain23.labs.length, 2);
    assert.equal(domain23.assessmentQuestions.length, 2);

    const domain24 = pluginManager.getDomain('istio-service-mesh');
    assert.ok(domain24, 'Domain 24 (istio-service-mesh) must exist');
    assert.equal(domain24.category, 'Service Mesh & Networking');
    assert.equal(domain24.trackId, 'track-devsecops');
    assert.equal(domain24.labs.length, 2);
    assert.equal(domain24.assessmentQuestions.length, 2);

    const domain25 = pluginManager.getDomain('linkerd-service-mesh');
    assert.ok(domain25, 'Domain 25 (linkerd-service-mesh) must exist');
    assert.equal(domain25.category, 'Service Mesh & Networking');
    assert.equal(domain25.trackId, 'track-devsecops');
    assert.equal(domain25.labs.length, 2);
    assert.equal(domain25.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 6 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-mesh-01-sidecar-injection',
      'lab-mesh-02-mesh-diagnostics',
      'lab-istio-01-canary-routing',
      'lab-istio-02-peer-authentication-mtls',
      'lab-linkerd-01-service-profile',
      'lab-linkerd-02-viz-telemetry'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 6, 'Must find all 6 subphase labs');

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} pre-score must be 0%, but got ${report.score}%. Report: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, false, `Lab ${lab.id} must not pass before solution`);
    }
  });

  it('3. Deterministic Solver: All 6 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-mesh-01-sidecar-injection',
      'lab-mesh-02-mesh-diagnostics',
      'lab-istio-01-canary-routing',
      'lab-istio-02-peer-authentication-mtls',
      'lab-linkerd-01-service-profile',
      'lab-linkerd-02-viz-telemetry'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands
      for (const cmd of lab.solutionCommands) {
        terminal.execute(cmd);
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} post-score must be 100%, but got ${report.score}%. Rules: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, true, `Lab ${lab.id} must pass after canonical solution`);
    }
  });

  it('4. Engine Parity: Domain 23 Service Mesh Core & Envoy diagnostics', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('kubectl create namespace mesh-apps');
    terminal.execute('kubectl label namespace mesh-apps istio-injection=enabled');

    const ns = cluster.getResource('Namespace', 'mesh-apps');
    assert.ok(ns, 'Namespace mesh-apps must exist');
    assert.equal(ns.metadata.labels['istio-injection'], 'enabled');

    const psRes = terminal.execute('istioctl proxy-status');
    assert.equal(psRes.exitCode, 0);
    assert.ok(psRes.output.includes('SYNCED'));

    const analyzeRes = terminal.execute('istioctl analyze -n production');
    assert.equal(analyzeRes.exitCode, 0);
    assert.ok(analyzeRes.output.includes('No validation issues found'));
  });

  it('5. Engine Parity: Domain 24 Istio VirtualService Canary Routing & STRICT mTLS', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /mesh');
    const vsYaml = `cat << 'EOF' > /mesh/checkout-mesh.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: checkout-dr
  namespace: default
spec:
  host: checkout-service
  subsets:
    - name: v1
      labels:
        version: v1
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: checkout-vs
  namespace: default
spec:
  hosts:
    - checkout.kubelabs.io
  http:
    - match:
        - uri:
            prefix: /checkout
      route:
        - destination:
            host: checkout-service
            subset: v1
EOF`;
    terminal.execute(vsYaml);
    terminal.execute('kubectl apply -f /mesh/checkout-mesh.yaml');

    const dr = cluster.getResource('DestinationRule', 'checkout-dr', 'default');
    assert.ok(dr, 'DestinationRule checkout-dr must exist');
    assert.equal(dr.spec.subsets[0].name, 'v1');

    const vs = cluster.getResource('VirtualService', 'checkout-vs', 'default');
    assert.ok(vs, 'VirtualService checkout-vs must exist');

    // Test IstioMeshController evaluation
    const graph = new ResourceGraph();
    graph.set(vs);
    graph.set(dr);

    const istioController = new IstioMeshController(graph);
    const routeRes = istioController.resolveHttpRoute('checkout-vs', 'default', { uri: '/checkout/pay' });
    assert.equal(routeRes.matched, true);
    assert.equal(routeRes.destination.host, 'checkout-service');
    assert.equal(routeRes.destination.subset, 'v1');

    // Test STRICT mTLS
    terminal.execute('kubectl create namespace istio-system');
    terminal.execute(`cat << 'EOF' > /mesh/strict-mtls.yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
EOF`);
    terminal.execute('kubectl apply -f /mesh/strict-mtls.yaml');

    const peerAuth = cluster.getResource('PeerAuthentication', 'default', 'istio-system');
    assert.ok(peerAuth, 'PeerAuthentication default must exist in istio-system');
    assert.equal(peerAuth.spec.mtls.mode, 'STRICT');
  });

  it('6. Engine Parity: Domain 25 Linkerd ServiceProfile & Linkerd Viz Telemetry', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /mesh');
    const spYaml = `cat << 'EOF' > /mesh/payment-serviceprofile.yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: payment-service.default.svc.cluster.local
  namespace: default
spec:
  retryBudget:
    retryRatio: 0.2
    minRetriesPerSecond: 10
    ttl: 10s
  routes:
    - name: GetPayment
      condition:
        method: GET
        pathRegex: /api/v1/payments.*
      isRetryable: true
EOF`;
    terminal.execute(spYaml);
    terminal.execute('kubectl apply -f /mesh/payment-serviceprofile.yaml');

    const sp = cluster.getResource('ServiceProfile', 'payment-service.default.svc.cluster.local', 'default');
    assert.ok(sp, 'ServiceProfile must exist in default namespace');
    assert.equal(sp.spec.retryBudget.retryRatio, 0.2);
    assert.equal(sp.spec.routes[0].name, 'GetPayment');

    // Test LinkerdMeshController evaluation
    const graph = new ResourceGraph();
    graph.set(sp);

    const linkerdController = new LinkerdMeshController(graph);
    const evalRes = linkerdController.evaluateServiceProfile(
      'payment-service.default.svc.cluster.local',
      'default',
      { path: '/api/v1/payments/tx-9941', method: 'GET' }
    );
    assert.equal(evalRes.matched, true);
    assert.equal(evalRes.routeName, 'GetPayment');
    assert.equal(evalRes.isRetryable, true);

    // Test non-retryable route mismatch
    const evalPost = linkerdController.evaluateServiceProfile(
      'payment-service.default.svc.cluster.local',
      'default',
      { path: '/api/v1/payments/tx-9941', method: 'POST' }
    );
    assert.equal(evalPost.matched, false);

    // Test Linkerd CLI execution
    const checkRes = terminal.execute('linkerd check');
    assert.equal(checkRes.exitCode, 0);
    assert.ok(checkRes.output.includes('Status check succeeded'));

    const vizStatRes = terminal.execute('linkerd viz stat');
    assert.equal(vizStatRes.exitCode, 0);
    assert.ok(vizStatRes.output.includes('NAME'));
    assert.ok(vizStatRes.output.includes('LATENCY_P99'));
  });
});
