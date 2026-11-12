'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { PromQLEngine, LogQLEngine, SloBurnRateCalculator } = require('../src/core/observabilityEngine');
const {
  HorizontalPodAutoscalerEngine,
  VerticalPodAutoscalerEngine,
  KarpenterEngine,
  IstioMeshController
} = require('../src/core/autoscalingAndMeshEngine');
const { NetworkTracer } = require('../src/core/networkTracer');
const { SecurityPolicyEngine } = require('../src/core/storageAndSecurityEngine');
const { ValidationEngine, getFieldByPath, compareValues } = require('../src/core/validationEngine');

// ---------------------------------------------------------------------------
// Unit tests for Subphase 3.2.3: Deterministic Validation Rule Evaluators
// ---------------------------------------------------------------------------

test('Subphase 3.2.3: getFieldByPath and compareValues with dot-annotated keys and numbers', () => {
  const obj = {
    metadata: {
      name: 'api-server',
      labels: {
        'platform.kubelabs.io/tier': 'production',
        'app.kubernetes.io/name': 'web'
      },
      annotations: {
        'eks.amazonaws.com/role-arn': 'arn:aws:iam::123456789012:role/my-role'
      }
    },
    spec: {
      replicas: 3,
      containers: [{ name: 'nginx', image: 'nginx:1.27' }]
    }
  };

  assert.equal(getFieldByPath(obj, 'metadata.name'), 'api-server');
  assert.equal(getFieldByPath(obj, 'spec.replicas'), 3);
  assert.equal(getFieldByPath(obj, 'spec.containers[0].name'), 'nginx');
  assert.equal(getFieldByPath(obj, 'metadata.labels.platform.kubelabs.io/tier'), 'production');
  assert.equal(getFieldByPath(obj, 'metadata.annotations.eks.amazonaws.com/role-arn'), 'arn:aws:iam::123456789012:role/my-role');

  assert.equal(compareValues(5, '==', 5), true);
  assert.equal(compareValues(10, '>=', 5), true);
  assert.equal(compareValues('500m', '==', 500), true);
  assert.equal(compareValues('1Gi', '>=', '512Mi'), true);
});

test('Subphase 3.2.3: Evaluators 1 & 2 - packet_trace_allowed and packet_trace_blocked', () => {
  const graph = new ResourceGraph();
  const tracer = new NetworkTracer(graph);
  const engine = new ValidationEngine({ graph, tracer });

  // Provision client and server pods
  const clientPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'frontend-pod', namespace: 'prod', labels: { app: 'frontend' }, uid: 'front-1111' },
    status: { phase: 'Running', podIP: '10.244.1.10', nodeName: 'worker-1' }
  };
  const serverPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'backend-pod', namespace: 'prod', labels: { app: 'backend' }, uid: 'back-2222' },
    status: { phase: 'Running', podIP: '10.244.1.20', nodeName: 'worker-1' }
  };
  graph.set(clientPod);
  graph.set(serverPod);

  // NetworkPolicy on backend allowing ingress from app=frontend on port 80
  const netPol = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'allow-frontend', namespace: 'prod' },
    spec: {
      podSelector: { matchLabels: { app: 'backend' } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [{ podSelector: { matchLabels: { app: 'frontend' } } }],
          ports: [{ protocol: 'TCP', port: 80 }]
        }
      ]
    }
  };
  graph.set(netPol);

  // Allowed on port 80
  const allowRule = {
    type: 'packet_trace_allowed',
    srcPod: clientPod,
    dstPod: serverPod,
    port: 80,
    protocol: 'TCP'
  };
  const allowRes = engine.evaluateRule(allowRule, { graph, tracer });
  assert.equal(allowRes.passed, true);

  // Blocked on port 443
  const blockRule = {
    type: 'packet_trace_blocked',
    srcPod: clientPod,
    dstPod: serverPod,
    port: 443,
    protocol: 'TCP'
  };
  const blockRes = engine.evaluateRule(blockRule, { graph, tracer });
  assert.equal(blockRes.passed, true);
});

test('Subphase 3.2.3: Evaluators 3, 6 & 11 - promql_query_result, slo_burn_rate_within_budget & logql_filter_matches', () => {
  const promql = new PromQLEngine();
  promql.recordSample('http_requests_total', { app: 'web', status: '200' }, 1250);
  promql.recordSample('http_requests_total', { app: 'web', status: '500' }, 25);

  const logql = new LogQLEngine();
  const slo = new SloBurnRateCalculator();
  const engine = new ValidationEngine({ promql, logql, slo });

  // 1. PromQL Query Result
  const promqlRule = {
    type: 'promql_query_result',
    query: 'http_requests_total{status="200"}',
    operator: '>=',
    expectedValue: 1000
  };
  const promRes = engine.evaluateRule(promqlRule, { promql });
  assert.equal(promRes.passed, true);

  // 2. SLO Burn Rate Within Budget
  const sloRule = {
    type: 'slo_burn_rate_within_budget',
    targetSlo: 0.99,
    totalEvents: 10000,
    errorEvents: 200,
    windowHours: 1,
    burnRateMax: 10.0,
    expectedAlertSeverity: 'TICKET'
  };
  const sloRes = engine.evaluateRule(sloRule, { slo });
  assert.equal(sloRes.passed, true);

  // 3. LogQL Filter Matches
  const testLogs = [
    { timestamp: Date.now(), labels: { app: 'payment' }, message: '{"status": 500, "error": "db_timeout"}' },
    { timestamp: Date.now(), labels: { app: 'payment' }, message: '{"status": 200, "user": "alice"}' }
  ];
  const logqlRule = {
    type: 'logql_filter_matches',
    query: '{app="payment"} | json | status >= 500',
    minMatches: 1,
    logs: testLogs
  };
  const logRes = engine.evaluateRule(logqlRule, { logql });
  assert.equal(logRes.passed, true);
});

test('Subphase 3.2.3: Evaluators 4 & 5 - rbac_can_i and pod_security_standard', () => {
  const graph = new ResourceGraph();
  const security = new SecurityPolicyEngine(graph);
  const engine = new ValidationEngine({ graph, security });

  // RBAC ClusterRole and RoleBinding
  const clusterRole = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: { name: 'pod-reader' },
    rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }]
  };
  const roleBinding = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: { name: 'dev-pod-reader', namespace: 'dev' },
    subjects: [{ kind: 'User', name: 'bob' }],
    roleRef: { kind: 'ClusterRole', name: 'pod-reader' }
  };
  graph.set(clusterRole);
  graph.set(roleBinding);

  // bob can get pods in dev
  const rbacRule1 = {
    type: 'rbac_can_i',
    user: 'bob',
    verb: 'get',
    resource: 'pods',
    namespace: 'dev',
    expectedAllowed: true
  };
  assert.equal(engine.evaluateRule(rbacRule1, { graph, security }).passed, true);

  // bob cannot delete pods in dev
  const rbacRule2 = {
    type: 'rbac_can_i',
    user: 'bob',
    verb: 'delete',
    resource: 'pods',
    namespace: 'dev',
    expectedAllowed: false
  };
  assert.equal(engine.evaluateRule(rbacRule2, { graph, security }).passed, true);

  // Pod Security Standards
  const privilegedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'unsafe-pod', namespace: 'dev' },
    spec: {
      hostNetwork: true,
      containers: [{ name: 'agent', securityContext: { privileged: true } }]
    }
  };
  graph.set(privilegedPod);

  const psaRule = {
    type: 'pod_security_standard',
    name: 'unsafe-pod',
    namespace: 'dev',
    level: 'baseline',
    expectedStatus: 'denied'
  };
  assert.equal(engine.evaluateRule(psaRule, { graph, security }).passed, true);
});

test('Subphase 3.2.3: Evaluators 7, 8, 9 & 10 - resource_count, resource_field_equals, resource_exists & service_endpoints_ready', () => {
  const graph = new ResourceGraph();
  const engine = new ValidationEngine({ graph });

  const svc = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'api-service', namespace: 'production', labels: { tier: 'api' } },
    spec: { clusterIP: '10.96.0.45', ports: [{ port: 80 }] },
    status: { endpointCount: 3, endpoints: ['10.244.1.2:80', '10.244.1.3:80', '10.244.1.4:80'] }
  };
  graph.set(svc);

  // 1. resource_exists
  assert.equal(engine.evaluateRule({ type: 'resource_exists', kind: 'Service', name: 'api-service', namespace: 'production' }, { graph }).passed, true);

  // 2. resource_field_equals
  assert.equal(engine.evaluateRule({
    type: 'resource_field_equals',
    kind: 'Service',
    name: 'api-service',
    namespace: 'production',
    fieldPath: 'spec.clusterIP',
    expectedValue: '10.96.0.45'
  }, { graph }).passed, true);

  // 3. resource_count
  assert.equal(engine.evaluateRule({
    type: 'resource_count',
    kind: 'Service',
    namespace: 'production',
    operator: '>=',
    expectedValue: 1
  }, { graph }).passed, true);

  // 4. service_endpoints_ready
  assert.equal(engine.evaluateRule({
    type: 'service_endpoints_ready',
    name: 'api-service',
    namespace: 'production',
    expectedValue: 2
  }, { graph }).passed, true);
});

test('Subphase 3.2.3: Evaluators 12, 13 & 14 - hpa_target_scale_achieved, vpa_recommendation_present & karpenter_node_consolidated', () => {
  const graph = new ResourceGraph();
  const hpaEngine = new HorizontalPodAutoscalerEngine(graph);
  const vpaEngine = new VerticalPodAutoscalerEngine(graph);
  const karpenter = new KarpenterEngine(graph);
  const engine = new ValidationEngine({ graph, hpa: hpaEngine, vpa: vpaEngine, karpenter });

  // 1. HPA resource
  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: 'checkout-hpa', namespace: 'shop' },
    status: { desiredReplicas: 5, currentReplicas: 2 }
  };
  graph.set(hpa);

  const hpaRule = {
    type: 'hpa_target_scale_achieved',
    name: 'checkout-hpa',
    namespace: 'shop',
    expectedReplicas: 5
  };
  assert.equal(engine.evaluateRule(hpaRule, { graph }).passed, true);

  // 2. VPA resource
  const vpa = {
    apiVersion: 'autoscaling.k8s.io/v1',
    kind: 'VerticalPodAutoscaler',
    metadata: { name: 'db-vpa', namespace: 'shop' },
    status: {
      recommendation: {
        containerRecommendations: [
          { containerName: 'database', target: { cpu: '1500m', memory: '2Gi' } }
        ]
      }
    }
  };
  graph.set(vpa);

  const vpaRule = {
    type: 'vpa_recommendation_present',
    name: 'db-vpa',
    namespace: 'shop',
    containerName: 'database'
  };
  assert.equal(engine.evaluateRule(vpaRule, { graph }).passed, true);

  // 3. Karpenter node
  const karpNode = {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'karpenter-general-abc',
      labels: {
        'karpenter.sh/nodepool': 'general',
        'karpenter.sh/capacity-type': 'spot'
      }
    }
  };
  graph.set(karpNode);

  const karpRule = {
    type: 'karpenter_node_consolidated',
    nodePool: 'general',
    expectedCapacityType: 'spot'
  };
  assert.equal(engine.evaluateRule(karpRule, { graph }).passed, true);
});

test('Subphase 3.2.3: Evaluators 15, 16, 17 & 18 - istio_route_matches, circuit_breaker_tripped, vfs_file_contains & dns_resolution_succeeds', () => {
  const graph = new ResourceGraph();
  const istio = new IstioMeshController(graph);
  const vfs = new VirtualFileSystem();
  const engine = new ValidationEngine({ graph, istio, vfs });

  // 1. Istio VirtualService
  const vs = {
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'VirtualService',
    metadata: { name: 'catalog-route', namespace: 'default' },
    spec: {
      hosts: ['catalog'],
      http: [
        {
          match: [{ uri: { prefix: '/canary' } }],
          route: [{ destination: { host: 'catalog', subset: 'v2' } }]
        }
      ]
    }
  };
  graph.set(vs);

  const vsRule = {
    type: 'istio_route_matches',
    virtualService: 'catalog-route',
    namespace: 'default',
    uri: '/canary/items',
    expectedSubset: 'v2'
  };
  assert.equal(engine.evaluateRule(vsRule, { graph, istio }).passed, true);

  // 2. Circuit Breaker Tripped
  const dr = {
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'DestinationRule',
    metadata: { name: 'catalog-dr', namespace: 'default' },
    spec: {
      host: 'catalog',
      trafficPolicy: { outlierDetection: { consecutive5xxErrors: 1 } }
    }
  };
  graph.set(dr);
  istio.recordEndpointResult('catalog', 'default', 503);

  const cbRule = {
    type: 'circuit_breaker_tripped',
    destinationRule: 'catalog-dr',
    namespace: 'default',
    expectedTripped: true
  };
  assert.equal(engine.evaluateRule(cbRule, { graph, istio }).passed, true);

  // 3. VFS File Contains
  vfs.mkdir('/etc/kubernetes/manifests', { recursive: true });
  vfs.writeFile('/etc/kubernetes/manifests/kube-apiserver.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: kube-apiserver\n');

  const vfsRule = {
    type: 'vfs_file_contains',
    path: '/etc/kubernetes/manifests/kube-apiserver.yaml',
    expectedContent: 'name: kube-apiserver'
  };
  assert.equal(engine.evaluateRule(vfsRule, { vfs }).passed, true);

  // 4. DNS Resolution Succeeds
  const svc = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'core-api', namespace: 'prod' },
    spec: { clusterIP: '10.96.12.34' }
  };
  graph.set(svc);

  const dnsRule = {
    type: 'dns_resolution_succeeds',
    host: 'core-api.prod.svc.cluster.local',
    expectedIp: '10.96.12.34'
  };
  assert.equal(engine.evaluateRule(dnsRule, { graph }).passed, true);
});

test('Subphase 3.2.3: Full evaluate() suite returns passing summary score 100%', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.writeFile('/tmp/done.txt', 'COMPLETED');

  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-1', namespace: 'default' },
    status: { phase: 'Running', reason: 'Running' }
  };
  graph.set(pod);

  const engine = new ValidationEngine({ graph, vfs });

  const rules = [
    { id: 'r1', type: 'resource_exists', kind: 'Pod', name: 'web-1', namespace: 'default' },
    { id: 'r2', type: 'vfs_file_contains', path: '/tmp/done.txt', expectedContent: 'COMPLETED' },
    { id: 'r3', type: 'pod_status_running', name: 'web-1', namespace: 'default' }
  ];

  const report = engine.evaluate(rules, { graph, vfs });
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.passedCount, 3);
  assert.equal(report.totalCount, 3);
});
