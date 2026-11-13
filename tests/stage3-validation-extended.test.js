'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ValidationEngine } = require('../src/core/validationEngine');
const { SessionManager } = require('../src/core/sessionManager');
const { IstioMeshController } = require('../src/core/autoscalingAndMeshEngine');

// ---------------------------------------------------------------------------
// Integration tests for Subphase 3.2.3:
// ValidationEngine 18 Evaluators Extended Integration & Session Binding
// ---------------------------------------------------------------------------

test('Subphase 3.2.3: VirtualCluster auto-bridging in ValidationEngine._buildContext', () => {
  const cluster = new VirtualCluster();
  // Apply a custom deployment manifest to VirtualCluster
  cluster.applyManifest(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-engine
  namespace: finance
spec:
  replicas: 3
  selector:
    matchLabels:
      app: billing
  template:
    metadata:
      labels:
        app: billing
    spec:
      containers:
        - name: billing
          image: billing:v3
`);

  const engine = new ValidationEngine();
  const rules = [
    { id: 'v1', type: 'resource_exists', kind: 'Deployment', name: 'billing-engine', namespace: 'finance' },
    { id: 'v2', type: 'resource_field_equals', kind: 'Deployment', name: 'billing-engine', namespace: 'finance', fieldPath: 'spec.replicas', expectedValue: 3 },
    { id: 'v3', type: 'resource_count', kind: 'Deployment', namespace: 'finance', operator: '==', expectedValue: 1 }
  ];

  // Evaluate directly against VirtualCluster instance (tests automatic bridging into ResourceGraph)
  const report = engine.evaluate(rules, cluster, []);
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.passedCount, 3);
});

test('Subphase 3.2.3: EndpointSlice resolution in service_endpoints_ready and CoreDNS resolution in dns_resolution_succeeds', () => {
  const graph = new ResourceGraph();
  const engine = new ValidationEngine({ graph });

  // 1. Service with EndpointSlice
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'payment-service', namespace: 'default' },
    spec: { clusterIP: '10.96.88.99', ports: [{ port: 443 }] }
  });

  graph.set({
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: {
      name: 'payment-service-slice-1',
      namespace: 'default',
      labels: { 'kubernetes.io/service-name': 'payment-service' }
    },
    endpoints: [
      { addresses: ['10.244.1.5'], conditions: { ready: true } },
      { addresses: ['10.244.1.6'], conditions: { ready: true } },
      { addresses: ['10.244.1.7'], conditions: { ready: false } }
    ]
  });

  const epRule = {
    type: 'service_endpoints_ready',
    name: 'payment-service',
    namespace: 'default',
    expectedValue: 2
  };
  const epRes = engine.evaluateRule(epRule, { graph });
  assert.equal(epRes.passed, true);
  assert.ok(epRes.actual.includes('2 ready endpoint(s)'));

  // 2. DNS resolution succeeds with NetworkingEngine fallback
  const dnsRule = {
    type: 'dns_resolution_succeeds',
    host: 'payment-service.default.svc.cluster.local',
    expectedIp: '10.96.88.99'
  };
  const dnsRes = engine.evaluateRule(dnsRule, { graph });
  assert.equal(dnsRes.passed, true);
});

test('Subphase 3.2.3: PromQL inline samples, circuit breaker error codes, and VFS regex pattern', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const istio = new IstioMeshController(graph);
  const engine = new ValidationEngine({ graph, vfs, istio });

  // 1. PromQL Query with inline samples declaration
  const promqlRule = {
    type: 'promql_query_result',
    query: 'grpc_requests_total{service="auth"}',
    operator: '>=',
    expectedValue: 100,
    samples: [
      { metricName: 'grpc_requests_total', labels: { service: 'auth' }, value: 300 }
    ]
  };
  const promRes = engine.evaluateRule(promqlRule, { graph });
  assert.equal(promRes.passed, true);

  // 2. DestinationRule Circuit Breaker with errorCodes declaration
  graph.set({
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'DestinationRule',
    metadata: { name: 'auth-dr', namespace: 'default' },
    spec: {
      host: 'auth-svc',
      trafficPolicy: { outlierDetection: { consecutive5xxErrors: 3 } }
    }
  });

  const cbRule = {
    type: 'circuit_breaker_tripped',
    destinationRule: 'auth-dr',
    host: 'auth-svc',
    namespace: 'default',
    errorCodes: [500, 502, 503], // 3 consecutive 5xx errors trips it
    expectedTripped: true
  };
  const cbRes = engine.evaluateRule(cbRule, { graph, istio });
  assert.equal(cbRes.passed, true);

  // 3. VFS file with regex pattern matching
  vfs.writeFile('/var/log/audit.log', '2026-11-13T09:00:00Z [SECURITY] User admin logged in from 10.0.0.1');
  const vfsRule = {
    type: 'vfs_file_contains',
    path: '/var/log/audit.log',
    expectedContent: '\\[SECURITY\\].*admin logged in',
    isRegex: true
  };
  const vfsRes = engine.evaluateRule(vfsRule, { vfs });
  assert.equal(vfsRes.passed, true);
});

test('Subphase 3.2.3: End-to-end evaluation lifecycle with SessionManager.bindLab and setValidationReport', () => {
  const sessionManager = new SessionManager();
  const session = sessionManager.getSession('test-session');

  const lab = {
    id: 'lab-net-05',
    title: 'NetworkPolicy Security Isolation',
    domainId: 'domain-03-networking',
    validationRules: [
      { id: 'rule-pod-running', type: 'pod_status_running', name: 'secure-api', namespace: 'default' },
      { id: 'rule-file-exists', type: 'vfs_file_contains', path: '/etc/kubernetes/policy.yaml', expectedContent: 'kind: NetworkPolicy' }
    ]
  };

  // Bind lab to session
  sessionManager.bindLab(session.sessionId, lab);
  assert.equal(session.activeLabId, 'lab-net-05');

  // Populate session state
  session.cluster.applyManifest(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-api
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secure-api
  template:
    metadata:
      labels:
        app: secure-api
    spec:
      containers:
        - name: app
          image: nginx:1.27
`);
  session.cluster.reconcile();

  session.vfs.writeFile('/etc/kubernetes/policy.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny\n');

  const engine = new ValidationEngine();
  const report = engine.evaluate(lab.validationRules, session.cluster, session.terminal.commandHistory, { labId: lab.id });

  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.passedCount, 2);

  // Save report into session manager
  sessionManager.setValidationReport(session.sessionId, report);
  assert.equal(session.lastValidationReport.passed, true);
  assert.equal(session.lastValidationReport.labId, 'lab-net-05');
});
