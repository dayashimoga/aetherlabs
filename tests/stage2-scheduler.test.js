'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { SchedulerEngine, parseCpu, parseMemory } = require('../src/core/schedulerEngine');

function bootstrapNodes(graph) {
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-zone-a',
      labels: {
        'topology.kubernetes.io/zone': 'us-east-1a',
        'kubernetes.io/hostname': 'node-zone-a',
        'node-role': 'worker',
        'disktype': 'ssd'
      }
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      allocatable: { cpu: '4000m', memory: '16Gi', pods: '110' }
    }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-zone-b',
      labels: {
        'topology.kubernetes.io/zone': 'us-east-1b',
        'kubernetes.io/hostname': 'node-zone-b',
        'node-role': 'worker',
        'disktype': 'hdd'
      }
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      allocatable: { cpu: '4000m', memory: '16Gi', pods: '110' }
    }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-tainted',
      labels: {
        'topology.kubernetes.io/zone': 'us-east-1a',
        'kubernetes.io/hostname': 'node-tainted',
        'node-role': 'gpu-worker'
      }
    },
    spec: {
      taints: [{ key: 'sku', value: 'gpu', effect: 'NoSchedule' }]
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      allocatable: { cpu: '8000m', memory: '32Gi', pods: '110' }
    }
  });
}

test('Subphase 2.2.1: Quantity parsing (parseCpu, parseMemory)', () => {
  assert.equal(parseCpu('1'), 1000);
  assert.equal(parseCpu('500m'), 500);
  assert.equal(parseCpu('2.5'), 2500);
  assert.equal(parseCpu('0.1'), 100);

  assert.equal(parseMemory('128Mi'), 128 * 1024 * 1024);
  assert.equal(parseMemory('1Gi'), 1024 * 1024 * 1024);
  assert.equal(parseMemory('1G'), 1000 * 1000 * 1000);
  assert.equal(parseMemory('500K'), 500000);
});

test('Subphase 2.2.1: Scheduler nodeSelector and nodeAffinity filtering & scoring', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);
  const scheduler = new SchedulerEngine(graph);

  // 1. Pod with nodeSelector for ssd
  const ssdPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'ssd-app', namespace: 'default' },
    spec: {
      nodeSelector: { disktype: 'ssd' },
      containers: [{ name: 'app', image: 'nginx', resources: { requests: { cpu: '200m' } } }]
    }
  };
  const res1 = scheduler.schedulePod(ssdPod);
  assert.equal(res1.scheduled, true);
  assert.equal(res1.nodeName, 'node-zone-a');

  // 2. Pod with required nodeAffinity for us-east-1b
  const zoneBPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'zone-b-app', namespace: 'default' },
    spec: {
      affinity: {
        nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: {
            nodeSelectorTerms: [{
              matchExpressions: [{ key: 'topology.kubernetes.io/zone', operator: 'In', values: ['us-east-1b'] }]
            }]
          }
        }
      },
      containers: [{ name: 'app', image: 'nginx' }]
    }
  };
  const res2 = scheduler.schedulePod(zoneBPod);
  assert.equal(res2.scheduled, true);
  assert.equal(res2.nodeName, 'node-zone-b');
});

test('Subphase 2.2.1: Scheduler taints and tolerations', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);
  const scheduler = new SchedulerEngine(graph);

  // 1. Pod without toleration trying to target GPU node fails to schedule there
  const untoleratedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'regular-pod', namespace: 'default' },
    spec: {
      nodeSelector: { 'node-role': 'gpu-worker' },
      containers: [{ name: 'app', image: 'nginx' }]
    }
  };
  const res1 = scheduler.schedulePod(untoleratedPod);
  assert.equal(res1.scheduled, false);
  assert.ok(res1.reason.includes('taint'));

  // 2. Pod with matching toleration successfully schedules on tainted node
  const toleratedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'gpu-pod', namespace: 'default' },
    spec: {
      nodeSelector: { 'node-role': 'gpu-worker' },
      tolerations: [{ key: 'sku', operator: 'Equal', value: 'gpu', effect: 'NoSchedule' }],
      containers: [{ name: 'app', image: 'cuda-workload' }]
    }
  };
  const res2 = scheduler.schedulePod(toleratedPod);
  assert.equal(res2.scheduled, true);
  assert.equal(res2.nodeName, 'node-tainted');
});

test('Subphase 2.2.1: Pod Anti-Affinity and TopologySpreadConstraints (maxSkew)', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);
  const scheduler = new SchedulerEngine(graph);

  // Schedule Pod A on zone A
  const podA = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'db-master', namespace: 'default', labels: { role: 'database' } },
    spec: {
      nodeSelector: { 'node-role': 'worker' },
      containers: [{ name: 'db', image: 'postgres' }]
    }
  };
  scheduler.schedulePod(podA);

  // Pod B with Anti-Affinity against role=database on hostname
  const podB = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'db-replica', namespace: 'default', labels: { role: 'database' } },
    spec: {
      affinity: {
        podAntiAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: [{
            topologyKey: 'kubernetes.io/hostname',
            labelSelector: 'role=database'
          }]
        }
      },
      containers: [{ name: 'db', image: 'postgres' }]
    }
  };
  const resB = scheduler.schedulePod(podB);
  assert.equal(resB.scheduled, true);
  // Must avoid node-zone-a because podA is there!
  assert.equal(resB.nodeName, 'node-zone-b');

  // TopologySpreadConstraints with maxSkew: 1
  const spreadPod1 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-1', namespace: 'default', labels: { app: 'web' } },
    spec: {
      nodeSelector: { 'node-role': 'worker' },
      topologySpreadConstraints: [{
        maxSkew: 1,
        topologyKey: 'topology.kubernetes.io/zone',
        whenUnsatisfiable: 'DoNotSchedule',
        labelSelector: 'app=web'
      }],
      containers: [{ name: 'web', image: 'nginx' }]
    }
  };
  scheduler.schedulePod(spreadPod1);

  const spreadPod2 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-2', namespace: 'default', labels: { app: 'web' } },
    spec: {
      nodeSelector: { 'node-role': 'worker' },
      topologySpreadConstraints: [{
        maxSkew: 1,
        topologyKey: 'topology.kubernetes.io/zone',
        whenUnsatisfiable: 'DoNotSchedule',
        labelSelector: 'app=web'
      }],
      containers: [{ name: 'web', image: 'nginx' }]
    }
  };
  const resSpread2 = scheduler.schedulePod(spreadPod2);
  assert.equal(resSpread2.scheduled, true);
  // Must be placed in the other zone to satisfy maxSkew 1
  assert.notEqual(resSpread2.nodeName, spreadPod1.spec.nodeName);
});

test('Subphase 2.2.1: PriorityClass preemption of lower-priority pods', () => {
  const graph = new ResourceGraph();
  // Single node with 1000m CPU
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'single-node' },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      allocatable: { cpu: '1000m', memory: '4Gi', pods: '10' }
    }
  });

  const scheduler = new SchedulerEngine(graph);

  // 1. Low priority pod occupying full CPU (1000m)
  const lowPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'batch-worker', namespace: 'default' },
    spec: {
      priority: 100,
      containers: [{ name: 'batch', image: 'batch:v1', resources: { requests: { cpu: '1000m' } } }]
    }
  };
  const lowRes = scheduler.schedulePod(lowPod);
  assert.equal(lowRes.scheduled, true);
  assert.equal(lowPod.spec.nodeName, 'single-node');

  // 2. High priority pod arrives demanding 800m CPU
  const highPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'critical-api', namespace: 'default' },
    spec: {
      priority: 10000,
      containers: [{ name: 'api', image: 'api:v1', resources: { requests: { cpu: '800m' } } }]
    }
  };
  const highRes = scheduler.schedulePod(highPod);
  assert.equal(highRes.scheduled, true);
  assert.equal(highPod.spec.nodeName, 'single-node');

  // Verify lower-priority pod was preempted
  const evictedLow = graph.get('Pod', 'default', 'batch-worker');
  assert.equal(evictedLow.status.phase, 'Failed');
  assert.equal(evictedLow.status.reason, 'Preempted');
});

test('Subphase 2.2.1: ResourceQuota admission and LimitRange defaults', () => {
  const graph = new ResourceGraph();
  const scheduler = new SchedulerEngine(graph);

  // Register LimitRange with defaults and max limits
  graph.set({
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: { name: 'cpu-mem-limit-range', namespace: 'tenant-a' },
    spec: {
      limits: [{
        type: 'Container',
        defaultRequest: { cpu: '100m', memory: '128Mi' },
        default: { cpu: '500m', memory: '512Mi' },
        max: { cpu: '2000m', memory: '2Gi' }
      }]
    }
  });

  // Register ResourceQuota
  graph.set({
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: 'compute-quota', namespace: 'tenant-a' },
    spec: {
      hard: {
        pods: '2',
        'requests.cpu': '1000m'
      }
    }
  });

  // 1. Pod inherits default requests and limits from LimitRange
  const barePod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'app-1', namespace: 'tenant-a' },
    spec: { containers: [{ name: 'c1', image: 'nginx' }] }
  };
  const lrCheck = scheduler.evaluateLimitRange(barePod);
  assert.equal(lrCheck.allowed, true);
  assert.equal(lrCheck.pod.spec.containers[0].resources.requests.cpu, '100m');
  assert.equal(lrCheck.pod.spec.containers[0].resources.requests.memory, '128Mi');

  // 2. Pod exceeding LimitRange max is rejected
  const giantPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'giant-app', namespace: 'tenant-a' },
    spec: { containers: [{ name: 'c1', image: 'nginx', resources: { limits: { cpu: '5000m' } } }] }
  };
  const giantCheck = scheduler.evaluateLimitRange(giantPod);
  assert.equal(giantCheck.allowed, false);
  assert.ok(giantCheck.reason.includes('exceeds maximum'));

  // 3. ResourceQuota allows up to 2 pods, then rejects 3rd
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-1', namespace: 'tenant-a' },
    spec: { containers: [{ name: 'c', image: 'nginx', resources: { requests: { cpu: '200m' } } }] },
    status: { phase: 'Running' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-2', namespace: 'tenant-a' },
    spec: { containers: [{ name: 'c', image: 'nginx', resources: { requests: { cpu: '200m' } } }] },
    status: { phase: 'Running' }
  });

  const thirdPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-3', namespace: 'tenant-a' },
    spec: { containers: [{ name: 'c', image: 'nginx' }] }
  };
  const quotaCheck = scheduler.evaluateResourceQuota(thirdPod);
  assert.equal(quotaCheck.allowed, false);
  assert.ok(quotaCheck.reason.includes('exceeded quota'));
});

test('Subphase 2.2.1: PodDisruptionBudget (PDB) and node drain simulation', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);
  const scheduler = new SchedulerEngine(graph);

  // Register PodDisruptionBudget minAvailable: 2
  graph.set({
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: { name: 'payment-pdb', namespace: 'default' },
    spec: {
      minAvailable: 2,
      selector: 'app=payment'
    }
  });

  // Place 2 payment pods on node-zone-a
  const p1 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-1', namespace: 'default', labels: { app: 'payment' } },
    spec: { nodeName: 'node-zone-a', containers: [{ name: 'c', image: 'pay' }] },
    status: { phase: 'Running' }
  };
  const p2 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-2', namespace: 'default', labels: { app: 'payment' } },
    spec: { nodeName: 'node-zone-a', containers: [{ name: 'c', image: 'pay' }] },
    status: { phase: 'Running' }
  };
  graph.set(p1);
  graph.set(p2);

  // Attempting to drain node-zone-a without force violates PDB (2 healthy, minAvailable 2)
  const drainAttempt = scheduler.drainNode('node-zone-a');
  assert.equal(drainAttempt.success, false);
  assert.ok(drainAttempt.error.includes('PodDisruptionBudget'));

  // Adding 3rd replica allows 1 eviction
  const p3 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-3', namespace: 'default', labels: { app: 'payment' } },
    spec: { nodeName: 'node-zone-b', containers: [{ name: 'c', image: 'pay' }] },
    status: { phase: 'Running' }
  };
  graph.set(p3);

  // Evicting with --force works
  const forceDrain = scheduler.drainNode('node-zone-a', { force: true });
  assert.equal(forceDrain.success, true);
  assert.ok(forceDrain.evicted.includes('payment-1'));
  assert.ok(forceDrain.evicted.includes('payment-2'));
});

test('Subphase 2.2.1: PreferNoSchedule taint soft scoring and toleration', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);

  // Add PreferNoSchedule taint to node-zone-a
  const nodeA = graph.get('Node', null, 'node-zone-a');
  nodeA.spec = { taints: [{ key: 'workload', value: 'special', effect: 'PreferNoSchedule' }] };
  graph.set(nodeA);

  const scheduler = new SchedulerEngine(graph);

  // Pod without toleration should prefer node-zone-b
  const regularPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'regular-web', namespace: 'default' },
    spec: {
      nodeSelector: { 'node-role': 'worker' },
      containers: [{ name: 'web', image: 'nginx' }]
    }
  };
  const res = scheduler.schedulePod(regularPod);
  assert.equal(res.scheduled, true);
  assert.equal(res.nodeName, 'node-zone-b');

  // Pod with toleration for PreferNoSchedule can schedule on either; if preferred nodeAffinity points to zone-a, it chooses zone-a
  const toleratedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'tolerated-web', namespace: 'default' },
    spec: {
      tolerations: [{ key: 'workload', operator: 'Equal', value: 'special', effect: 'PreferNoSchedule' }],
      affinity: {
        nodeAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [{
            weight: 50,
            preference: {
              matchExpressions: [{ key: 'topology.kubernetes.io/zone', operator: 'In', values: ['us-east-1a'] }]
            }
          }]
        }
      },
      containers: [{ name: 'web', image: 'nginx' }]
    }
  };
  const resTolerated = scheduler.schedulePod(toleratedPod);
  assert.equal(resTolerated.scheduled, true);
  assert.equal(resTolerated.nodeName, 'node-zone-a');
});

test('Subphase 2.2.1: Preferred podAffinity and podAntiAffinity co-location scoring', () => {
  const graph = new ResourceGraph();
  bootstrapNodes(graph);
  const scheduler = new SchedulerEngine(graph);

  // Place a redis cache pod on node-zone-b
  const cachePod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'redis-cache', namespace: 'default', labels: { app: 'redis' } },
    spec: { nodeName: 'node-zone-b', containers: [{ name: 'redis', image: 'redis' }] },
    status: { phase: 'Running' }
  };
  graph.set(cachePod);

  // Web pod has preferred podAffinity to be co-located with app=redis
  const webPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-frontend', namespace: 'default' },
    spec: {
      nodeSelector: { 'node-role': 'worker' },
      affinity: {
        podAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [{
            weight: 40,
            podAffinityTerm: {
              topologyKey: 'kubernetes.io/hostname',
              labelSelector: 'app=redis'
            }
          }]
        }
      },
      containers: [{ name: 'web', image: 'nginx' }]
    }
  };

  const res = scheduler.schedulePod(webPod);
  assert.equal(res.scheduled, true);
  assert.equal(res.nodeName, 'node-zone-b');
});

test('Subphase 2.2.1: PodDisruptionBudget maxUnavailable evaluation and kubectl drain CLI integration', async () => {
  const { VirtualCluster } = require('../src/core/virtualCluster');
  const { TerminalEngine } = require('../src/core/terminalEngine');

  const cluster = new VirtualCluster();
  cluster.reset();

  // Create PDB with minAvailable: 2
  cluster.applyResource({
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: { name: 'api-pdb', namespace: 'production' },
    spec: {
      minAvailable: 2,
      selector: 'app=api'
    }
  });

  // Create 2 api pods running on kubelabs-worker-01
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'api-1', namespace: 'production', labels: { app: 'api' } },
    spec: { nodeName: 'kubelabs-worker-01', containers: [{ name: 'api', image: 'api:v1' }] },
    status: { phase: 'Running', nodeName: 'kubelabs-worker-01' }
  });
  cluster.applyResource({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'api-2', namespace: 'production', labels: { app: 'api' } },
    spec: { nodeName: 'kubelabs-worker-01', containers: [{ name: 'api', image: 'api:v1' }] },
    status: { phase: 'Running', nodeName: 'kubelabs-worker-01' }
  });

  const terminal = new TerminalEngine({ cluster });

  // 1. Drain without force fails due to PDB
  const drainRes = await terminal.execute('kubectl drain kubelabs-worker-01');
  assert.equal(drainRes.exitCode, 1);
  assert.ok(drainRes.output.includes('PodDisruptionBudget'));

  // 2. Drain with --force succeeds
  const forceRes = await terminal.execute('kubectl drain kubelabs-worker-01 --force');
  assert.equal(forceRes.exitCode, 0);
  assert.ok(forceRes.output.includes('drained'));
});

