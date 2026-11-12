'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const {
  AutoscalingAndMeshEngine,
  HorizontalPodAutoscalerEngine,
  VerticalPodAutoscalerEngine,
  ClusterAutoscalerEngine,
  KarpenterEngine,
  IstioMeshController,
  LinkerdMeshController,
  ConsulMeshController,
  parseCpu,
  parseMemory,
  formatCpu,
  formatMemory
} = require('../src/core/autoscalingAndMeshEngine');

// ---------------------------------------------------------------------------
// Unit tests for Subphase 3.2.2: Autoscaling & Service Mesh Engine
// ---------------------------------------------------------------------------

test('Subphase 3.2.2: Quantity parsers and formatters (CPU & Memory)', () => {
  assert.equal(parseCpu('500m'), 500);
  assert.equal(parseCpu('2'), 2000);
  assert.equal(parseCpu('1.5'), 1500);
  assert.equal(formatCpu(500), '500m');
  assert.equal(formatCpu(2000), '2');

  assert.equal(parseMemory('128Mi'), 128 * 1024 * 1024);
  assert.equal(parseMemory('1Gi'), 1024 * 1024 * 1024);
  assert.equal(formatMemory(128 * 1024 * 1024), '128Mi');
  assert.equal(formatMemory(1024 * 1024 * 1024), '1Gi');
});

test('Subphase 3.2.2: HPA v2 scale-up based on CPU utilization and boundary caps', () => {
  const graph = new ResourceGraph();
  const hpaEngine = new HorizontalPodAutoscalerEngine(graph);

  // Target Deployment
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'order-api', namespace: 'prod' },
    spec: { replicas: 2 }
  };
  graph.set(deployment);

  // HPA targeting order-api
  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: 'order-api-hpa', namespace: 'prod' },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'order-api' },
      minReplicas: 2,
      maxReplicas: 10,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: { type: 'Utilization', averageUtilization: 50 }
          }
        }
      ]
    }
  };
  graph.set(hpa);

  // Reconcile with 80% CPU utilization (80 / 50 = 1.6 ratio -> ceil(2 * 1.6) = 4 replicas)
  const result = hpaEngine.reconcileHpa(hpa, { cpuUtilization: 80 });

  assert.equal(result.scaled, true);
  assert.equal(result.previousReplicas, 2);
  assert.equal(result.desiredReplicas, 4);

  const updatedDep = graph.get('Deployment', 'prod', 'order-api');
  assert.equal(updatedDep.spec.replicas, 4);

  const updatedHpa = graph.get('HorizontalPodAutoscaler', 'prod', 'order-api-hpa');
  assert.equal(updatedHpa.status.desiredReplicas, 4);
  const scalingActiveCond = updatedHpa.status.conditions.find((c) => c.type === 'ScalingActive');
  assert.equal(scalingActiveCond.status, 'True');
});

test('Subphase 3.2.2: HPA v2 minReplicas capping and multi-metric selection', () => {
  const graph = new ResourceGraph();
  const hpaEngine = new HorizontalPodAutoscalerEngine(graph);

  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web', namespace: 'default' },
    spec: { replicas: 5 }
  };
  graph.set(deployment);

  const hpa = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: 'web-hpa', namespace: 'default' },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
      minReplicas: 3,
      maxReplicas: 8,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: { type: 'Utilization', averageUtilization: 80 }
          }
        },
        {
          type: 'Pods',
          pods: {
            metric: { name: 'http_requests_per_second' },
            target: { type: 'AverageValue', averageValue: '100' }
          }
        }
      ]
    }
  };
  graph.set(hpa);

  // CPU utilization is very low (10%), which would desire 1 replica (ceil(5 * 0.125) = 1)
  // But minReplicas is 3!
  const lowResult = hpaEngine.reconcileHpa(hpa, {
    cpuUtilization: 10,
    custom: { http_requests_per_second: 20 }
  });

  assert.equal(lowResult.scaled, true);
  assert.equal(lowResult.desiredReplicas, 3); // Capped at minReplicas: 3

  const limitedCond = lowResult.hpa.status.conditions.find((c) => c.type === 'ScalingLimited');
  assert.equal(limitedCond.status, 'True');
  assert.equal(limitedCond.reason, 'TooFewReplicas');
});

test('Subphase 3.2.2: VPA recommendation engine and Auto-mode application', () => {
  const graph = new ResourceGraph();
  const vpaEngine = new VerticalPodAutoscalerEngine(graph);

  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'data-worker', namespace: 'analytics' },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'worker',
              resources: { requests: { cpu: '100m', memory: '128Mi' } }
            }
          ]
        }
      }
    }
  };
  graph.set(deployment);

  const vpa = {
    apiVersion: 'autoscaling.k8s.io/v1',
    kind: 'VerticalPodAutoscaler',
    metadata: { name: 'data-worker-vpa', namespace: 'analytics' },
    spec: {
      targetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'data-worker' },
      updatePolicy: { updateMode: 'Auto' },
      resourcePolicy: {
        containerPolicies: [
          {
            containerName: 'worker',
            minAllowed: { cpu: '200m', memory: '256Mi' },
            maxAllowed: { cpu: '4', memory: '8Gi' }
          }
        ]
      }
    }
  };
  graph.set(vpa);

  const usageData = {
    worker: {
      cpuSamples: ['300m', '450m', '600m', '700m', '900m'],
      memorySamples: ['256Mi', '384Mi', '512Mi', '600Mi']
    }
  };

  const result = vpaEngine.reconcileVpa(vpa, usageData);

  assert.equal(result.applied, true);
  assert.equal(result.recommendations.length, 1);
  const rec = result.recommendations[0];
  assert.equal(rec.containerName, 'worker');
  assert.ok(parseCpu(rec.target.cpu) >= 200);
  assert.ok(parseMemory(rec.target.memory) >= 256 * 1024 * 1024);

  // In Auto mode, target deployment container requests are updated
  const updatedDep = graph.get('Deployment', 'analytics', 'data-worker');
  const workerContainer = updatedDep.spec.template.spec.containers[0];
  assert.equal(workerContainer.resources.requests.cpu, rec.target.cpu);
  assert.equal(workerContainer.resources.requests.memory, rec.target.memory);
});

test('Subphase 3.2.2: Cluster Autoscaler scale-up and scale-down detection', () => {
  const ca = new ClusterAutoscalerEngine();
  ca.registerNodeGroup({
    name: 'gpu-pool',
    minSize: 1,
    maxSize: 5,
    currentSize: 1,
    instanceType: 'm6i.xlarge',
    capacity: { cpu: '4', memory: '16Gi' }
  });

  const pendingPods = [
    {
      metadata: { name: 'heavy-job-1' },
      spec: { containers: [{ resources: { requests: { cpu: '3', memory: '12Gi' } } }] }
    },
    {
      metadata: { name: 'heavy-job-2' },
      spec: { containers: [{ resources: { requests: { cpu: '3', memory: '12Gi' } } }] }
    }
  ];

  const scaleUp = ca.evaluateScaleUp(pendingPods);
  assert.equal(scaleUp.scaleUpRequired, true);
  assert.equal(scaleUp.additions[0].nodeGroup, 'gpu-pool');
  assert.ok(scaleUp.additions[0].addedNodes >= 2);

  // Test scale-down detection
  const scaleDown = ca.evaluateScaleDown(['node-1', 'node-2'], {
    'node-1': 0.85,
    'node-2': 0.20 // 20% utilization
  });
  assert.equal(scaleDown.scaleDownEligible, true);
  assert.equal(scaleDown.candidates.length, 1);
  assert.equal(scaleDown.candidates[0].nodeName, 'node-2');
});

test('Subphase 3.2.2: Karpenter optimal bin-packing, consolidation, and spot interruption', () => {
  const graph = new ResourceGraph();
  const karpenter = new KarpenterEngine(graph);

  karpenter.registerNodePool({
    apiVersion: 'karpenter.sh/v1',
    kind: 'NodePool',
    metadata: { name: 'general' },
    spec: {
      template: {
        spec: {
          requirements: [
            { key: 'karpenter.sh/capacity-type', operator: 'In', values: ['spot'] },
            { key: 'kubernetes.io/arch', operator: 'In', values: ['amd64'] }
          ]
        }
      },
      disruption: {
        consolidationPolicy: 'WhenUnderutilized'
      }
    }
  });

  // Provisioning for pending pods
  const pendingPods = [
    {
      metadata: { name: 'pod-a' },
      spec: { containers: [{ resources: { requests: { cpu: '1500m', memory: '6Gi' } } }] }
    }
  ];

  const provisioned = karpenter.provisionForPendingPods('general', pendingPods);
  assert.equal(provisioned.capacityType, 'spot');
  assert.ok(provisioned.instanceType.startsWith('m6i') || provisioned.instanceType.startsWith('r6i'));
  assert.ok(provisioned.hourlyCost > 0);

  // Verify node manifest in graph
  const node = graph.get('Node', '', provisioned.nodeName);
  assert.ok(node);
  assert.equal(node.metadata.labels['karpenter.sh/capacity-type'], 'spot');

  // Node consolidation test (empty node)
  const consolidation = karpenter.consolidateNodes('general', [provisioned.nodeName], { [provisioned.nodeName]: [] });
  assert.equal(consolidation.actions.length, 1);
  assert.equal(consolidation.actions[0].action, 'terminate');
  assert.ok(consolidation.totalSavingsHourly > 0);

  // Spot interruption test (2-minute warning)
  const spotNotice = karpenter.simulateSpotInterruption(provisioned.nodeName);
  assert.equal(spotNotice.interrupted, true);
  assert.equal(spotNotice.noticeTimeRemainingSeconds, 120);

  const interruptedNode = graph.get('Node', '', provisioned.nodeName);
  const interruptionTaint = interruptedNode.spec.taints.find((t) => t.key === 'karpenter.sh/disruption');
  assert.ok(interruptionTaint);
  assert.equal(interruptionTaint.value, 'interrupted');
});

test('Subphase 3.2.2: Istio VirtualService route matching, weighted splits, and fault injection', () => {
  const graph = new ResourceGraph();
  const istio = new IstioMeshController(graph);

  const vs = {
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'VirtualService',
    metadata: { name: 'reviews-route', namespace: 'default' },
    spec: {
      hosts: ['reviews'],
      http: [
        {
          match: [{ uri: { prefix: '/v2' } }],
          route: [{ destination: { host: 'reviews', subset: 'v2' }, weight: 100 }]
        },
        {
          match: [{ headers: { 'x-canary': { exact: 'always' } } }],
          route: [{ destination: { host: 'reviews', subset: 'v2' }, weight: 100 }]
        },
        {
          fault: { abort: { httpStatus: 503, percentage: { value: 100 } } },
          match: [{ uri: { exact: '/chaos' } }],
          route: [{ destination: { host: 'reviews', subset: 'v1' }, weight: 100 }]
        },
        {
          route: [
            { destination: { host: 'reviews', subset: 'v1' }, weight: 80 },
            { destination: { host: 'reviews', subset: 'v2' }, weight: 20 }
          ]
        }
      ]
    }
  };
  graph.set(vs);

  // Match /v2 prefix
  const r1 = istio.resolveHttpRoute('reviews-route', 'default', { uri: '/v2/items' });
  assert.equal(r1.matched, true);
  assert.equal(r1.destination.subset, 'v2');

  // Match header canary
  const r2 = istio.resolveHttpRoute('reviews-route', 'default', { uri: '/items', headers: { 'x-canary': 'always' } });
  assert.equal(r2.matched, true);
  assert.equal(r2.destination.subset, 'v2');

  // Match chaos fault injection
  const r3 = istio.resolveHttpRoute('reviews-route', 'default', { uri: '/chaos', randomFault: 0.1 });
  assert.equal(r3.matched, true);
  assert.ok(r3.fault);
  assert.equal(r3.fault.httpStatus, 503);

  // Canary traffic split (80/20) with random roll 0.10 -> v1 (80%), random roll 0.90 -> v2 (20%)
  const r4 = istio.resolveHttpRoute('reviews-route', 'default', { uri: '/items', random: 0.10 });
  assert.equal(r4.destination.subset, 'v1');
  const r5 = istio.resolveHttpRoute('reviews-route', 'default', { uri: '/items', random: 0.90 });
  assert.equal(r5.destination.subset, 'v2');
});

test('Subphase 3.2.2: Istio DestinationRule circuit breaking, outlier detection, and PeerAuthentication mTLS', () => {
  const graph = new ResourceGraph();
  const istio = new IstioMeshController(graph);

  // DestinationRule with outlier detection
  const dr = {
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'DestinationRule',
    metadata: { name: 'inventory-cb', namespace: 'default' },
    spec: {
      host: 'inventory.prod.svc.cluster.local',
      trafficPolicy: {
        outlierDetection: {
          consecutive5xxErrors: 3,
          interval: '5s',
          baseEjectionTime: '15s'
        }
      }
    }
  };
  graph.set(dr);

  // Initial state: not tripped
  let status = istio.evaluateDestinationRule('inventory-cb', 'default');
  assert.equal(status.circuitBreakerTripped, false);

  // Record 3 consecutive 500 errors
  istio.recordEndpointResult('inventory.prod.svc.cluster.local', 'default', 500);
  istio.recordEndpointResult('inventory.prod.svc.cluster.local', 'default', 502);
  istio.recordEndpointResult('inventory.prod.svc.cluster.local', 'default', 503);

  // Circuit breaker trips!
  status = istio.evaluateDestinationRule('inventory-cb', 'default');
  assert.equal(status.circuitBreakerTripped, true);

  // PeerAuthentication mTLS test
  const paStrict = {
    apiVersion: 'security.istio.io/v1beta1',
    kind: 'PeerAuthentication',
    metadata: { name: 'secure-ns', namespace: 'secure' },
    spec: {
      mtls: { mode: 'STRICT' }
    }
  };
  graph.set(paStrict);

  // Plaintext connection rejected
  const plainRes = istio.evaluatePeerAuthentication('secure', {}, false);
  assert.equal(plainRes.allowed, false);
  assert.equal(plainRes.mode, 'STRICT');

  // TLS connection accepted
  const tlsRes = istio.evaluatePeerAuthentication('secure', {}, true);
  assert.equal(tlsRes.allowed, true);
  assert.equal(tlsRes.mode, 'STRICT');
});

test('Subphase 3.2.2: Linkerd ServiceProfile & Consul ServiceSplitter/Intentions', () => {
  const graph = new ResourceGraph();
  const mesh = new AutoscalingAndMeshEngine(graph);

  // Linkerd ServiceProfile
  const sp = {
    apiVersion: 'linkerd.io/v1alpha2',
    kind: 'ServiceProfile',
    metadata: { name: 'authors.default.svc.cluster.local', namespace: 'default' },
    spec: {
      routes: [
        {
          name: 'GET /authors',
          condition: { method: 'GET', pathRegex: '^/authors' },
          isRetryable: true,
          timeout: '500ms'
        }
      ]
    }
  };
  graph.set(sp);

  const lp = mesh.linkerd.evaluateServiceProfile('authors.default.svc.cluster.local', 'default', {
    path: '/authors/123',
    method: 'GET'
  });
  assert.equal(lp.matched, true);
  assert.equal(lp.isRetryable, true);
  assert.equal(lp.timeout, '500ms');

  // Consul ServiceSplitter
  const splitter = {
    apiVersion: 'consul.hashicorp.com/v1alpha1',
    kind: 'ServiceSplitter',
    metadata: { name: 'payment-splitter', namespace: 'default' },
    spec: {
      splits: [
        { service: 'payment', serviceSubset: 'v1', percentage: 90 },
        { service: 'payment', serviceSubset: 'v2', percentage: 10 }
      ]
    }
  };
  graph.set(splitter);

  const split1 = mesh.consul.resolveSplit('payment-splitter', 'default', 0.5);
  assert.equal(split1.subset, 'v1');
  const split2 = mesh.consul.resolveSplit('payment-splitter', 'default', 0.95);
  assert.equal(split2.subset, 'v2');

  // Consul ServiceIntentions
  const intentions = {
    apiVersion: 'consul.hashicorp.com/v1alpha1',
    kind: 'ServiceIntentions',
    metadata: { name: 'db-service', namespace: 'default' },
    spec: {
      sources: [
        { name: 'backend', action: 'allow' },
        { name: 'untrusted-guest', action: 'deny' }
      ]
    }
  };
  graph.set(intentions);

  assert.equal(mesh.consul.checkIntention('backend', 'db-service', 'default').allowed, true);
  assert.equal(mesh.consul.checkIntention('untrusted-guest', 'db-service', 'default').allowed, false);
});

