'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { ControllerManager } = require('../src/core/controllerManager');
const { NetworkingEngine } = require('../src/core/networkingEngine');

test('Subphase 3.1.2: StatefulSet ordinal scaling, PVC volumeClaimTemplates, and headless DNS', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);
  const net = new NetworkingEngine(graph);

  graph.set({
    kind: 'Node',
    metadata: { name: 'node-1' },
    status: { phase: 'Ready' }
  });

  // 1. Create Headless Service for StatefulSet
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'zk-hs', namespace: 'default' },
    spec: {
      clusterIP: 'None',
      selector: { app: 'zk' },
      ports: [{ port: 2181, targetPort: 2181 }]
    }
  });

  // 2. Create StatefulSet with 3 replicas and volumeClaimTemplates
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'zk', namespace: 'default' },
    spec: {
      replicas: 3,
      serviceName: 'zk-hs',
      selector: { matchLabels: { app: 'zk' } },
      template: {
        metadata: { labels: { app: 'zk' } },
        spec: { containers: [{ name: 'zookeeper', image: 'zookeeper:3.9' }] }
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'datadir' },
          spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } } }
        }
      ]
    }
  });

  // Verify ordinal pods 0, 1, 2 exist and are running
  const pod0 = graph.get('Pod', 'default', 'zk-0');
  const pod1 = graph.get('Pod', 'default', 'zk-1');
  const pod2 = graph.get('Pod', 'default', 'zk-2');
  assert.ok(pod0 && pod1 && pod2, 'All 3 ordinal pods must be created');
  assert.equal(pod0.status.phase, 'Running');
  assert.equal(pod1.status.phase, 'Running');
  assert.equal(pod2.status.phase, 'Running');

  // Verify hostname and subdomain set on pod spec
  assert.equal(pod0.spec.hostname, 'zk-0');
  assert.equal(pod0.spec.subdomain, 'zk-hs');

  // Verify PVCs dynamically bound for each ordinal
  const pvc0 = graph.get('PersistentVolumeClaim', 'default', 'datadir-zk-0');
  const pvc1 = graph.get('PersistentVolumeClaim', 'default', 'datadir-zk-1');
  const pvc2 = graph.get('PersistentVolumeClaim', 'default', 'datadir-zk-2');
  assert.ok(pvc0 && pvc1 && pvc2, 'All 3 PVCs must be dynamically provisioned');
  assert.equal(pvc0.status.phase, 'Bound');

  // Verify Headless DNS resolution for individual ordinal pod
  const dnsRes = net.resolveDNS('zk-0.zk-hs.default.svc.cluster.local');
  assert.equal(dnsRes.rcode, 'NOERROR');
  assert.equal(dnsRes.records[0].ip, pod0.status.podIP);

  // Verify Headless DNS resolution for the headless service (returns all pod IPs)
  const hsDnsRes = net.resolveDNS('zk-hs.default.svc.cluster.local');
  assert.equal(hsDnsRes.rcode, 'NOERROR');
  const resolvedIps = hsDnsRes.records.map((r) => r.ip);
  assert.ok(resolvedIps.includes(pod0.status.podIP));
  assert.ok(resolvedIps.includes(pod1.status.podIP));
  assert.ok(resolvedIps.includes(pod2.status.podIP));

  // 3. Ordered Scale Down: replicas = 2 (zk-2 must be terminated, zk-0 and zk-1 remain)
  const sts = graph.get('StatefulSet', 'default', 'zk');
  sts.spec.replicas = 2;
  graph.set(sts);

  assert.ok(graph.get('Pod', 'default', 'zk-0'));
  assert.ok(graph.get('Pod', 'default', 'zk-1'));
  assert.equal(graph.get('Pod', 'default', 'zk-2'), null, 'Highest ordinal pod zk-2 must be deleted');

  // Retain PVCs on scale down (standard K8s state retention)
  assert.ok(graph.get('PersistentVolumeClaim', 'default', 'datadir-zk-2'), 'PVC datadir-zk-2 must be retained');

  cm.destroy();
});

test('Subphase 3.1.2: Job and CronJob lifecycle, completions, backoffLimit, and history pruning', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  // 1. Multi-completion Job with parallelism
  graph.set({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'data-batch', namespace: 'default' },
    spec: {
      completions: 3,
      parallelism: 2,
      template: {
        spec: { containers: [{ name: 'processor', image: 'batch-worker:v1' }] }
      }
    }
  });

  let job = graph.get('Job', 'default', 'data-batch');
  assert.ok(job);
  assert.equal(job.status.succeeded, 3);
  assert.equal(job.status.active, 0);
  assert.ok(job.status.conditions.some((c) => c.type === 'Complete' && c.status === 'True'));

  // 2. Failing Job triggering BackoffLimitExceeded
  graph.set({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'failing-job', namespace: 'default' },
    spec: {
      backoffLimit: 3,
      template: {
        spec: {
          containers: [{
            name: 'worker',
            image: 'busybox:1.36',
            command: ['sh', '-c', 'exit 1']
          }]
        }
      }
    }
  });

  const failingJob = graph.get('Job', 'default', 'failing-job');
  assert.ok(failingJob);
  assert.equal(failingJob.status.failed, 3);
  assert.ok(failingJob.status.conditions.some((c) => c.type === 'Failed' && c.reason === 'BackoffLimitExceeded'));

  // 3. Deadline Exceeded Job
  graph.set({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'timeout-job', namespace: 'default' },
    spec: {
      activeDeadlineSeconds: 0,
      template: {
        spec: { containers: [{ name: 'worker', image: 'busybox:1.36' }] }
      }
    }
  });

  const timeoutJob = graph.get('Job', 'default', 'timeout-job');
  assert.ok(timeoutJob);
  assert.ok(timeoutJob.status.conditions.some((c) => c.type === 'Failed' && c.reason === 'DeadlineExceeded'));

  // 4. CronJob with suspend, concurrencyPolicy and history limit
  graph.set({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: { name: 'report-generator', namespace: 'default' },
    spec: {
      schedule: '*/5 * * * *',
      concurrencyPolicy: 'Forbid',
      successfulJobsHistoryLimit: 2,
      failedJobsHistoryLimit: 1,
      jobTemplate: {
        spec: {
          template: {
            spec: { containers: [{ name: 'report', image: 'report:v1' }] }
          }
        }
      }
    }
  });

  const cj = graph.get('CronJob', 'default', 'report-generator');
  assert.ok(cj);
  assert.ok(cj.status.lastScheduleTime);

  // Suspend CronJob
  cj.spec.suspend = true;
  graph.set(cj);
  const suspendedCj = graph.get('CronJob', 'default', 'report-generator');
  assert.equal(suspendedCj.status.active.length, 0);

  cm.destroy();
});

test('Subphase 3.1.2: Pod Lifecycle: initContainers gate, ephemeralContainers, and container probe states', () => {
  const graph = new ResourceGraph();
  const cm = new ControllerManager(graph);

  graph.set({
    kind: 'Node',
    metadata: { name: 'node-1' },
    status: { phase: 'Ready' }
  });

  // 1. Pod with failing initContainer (must block app containers)
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-broken-init', namespace: 'default' },
    spec: {
      initContainers: [
        { name: 'wait-for-db', image: 'busybox:1.36', command: ['sh', '-c', 'exit 1'] }
      ],
      containers: [
        { name: 'app', image: 'nginx:1.27-alpine' }
      ]
    }
  });

  let brokenInitPod = graph.get('Pod', 'default', 'pod-broken-init');
  assert.ok(brokenInitPod);
  assert.equal(brokenInitPod.status.phase, 'Pending');
  assert.equal(brokenInitPod.status.reason, 'Init:CrashLoopBackOff');
  assert.equal(brokenInitPod.status.ready, '0/1');
  assert.ok(brokenInitPod.status.conditions.some((c) => c.type === 'Initialized' && c.status === 'False'));

  // 2. Pod with successful initContainer and ephemeral debug container
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-with-init', namespace: 'default' },
    spec: {
      initContainers: [
        { name: 'init-schema', image: 'busybox:1.36', command: ['echo', 'ready'] }
      ],
      containers: [
        { name: 'app', image: 'nginx:1.27-alpine' }
      ],
      ephemeralContainers: [
        { name: 'debugger', image: 'busybox:latest' }
      ]
    }
  });

  let initPod = graph.get('Pod', 'default', 'pod-with-init');
  assert.ok(initPod);
  assert.equal(initPod.status.phase, 'Running');
  assert.equal(initPod.status.ready, '1/1');
  assert.ok(initPod.status.conditions.some((c) => c.type === 'Initialized' && c.status === 'True'));
  assert.equal(initPod.status.initContainerStatuses[0].state.terminated.reason, 'Completed');
  assert.equal(initPod.status.ephemeralContainerStatuses[0].name, 'debugger');

  // 3. Pod with failing readinessProbe -> Excluded from Service Endpoints!
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-unready', namespace: 'default', labels: { app: 'web-probe' } },
    spec: {
      containers: [
        {
          name: 'web',
          image: 'nginx:1.27-alpine',
          readinessProbe: {
            httpGet: { path: '/healthz-fail', port: 80 }
          }
        }
      ]
    }
  });

  // Ready Pod in same service
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'web-ready', namespace: 'default', labels: { app: 'web-probe' } },
    spec: {
      containers: [
        {
          name: 'web',
          image: 'nginx:1.27-alpine',
          readinessProbe: {
            httpGet: { path: '/healthz', port: 80 }
          }
        }
      ]
    }
  });

  // Service selecting both
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'web-probe-svc', namespace: 'default' },
    spec: {
      selector: { app: 'web-probe' },
      ports: [{ port: 80, targetPort: 80 }]
    }
  });

  const unreadyPod = graph.get('Pod', 'default', 'web-unready');
  assert.ok(unreadyPod);
  assert.equal(unreadyPod.status.phase, 'Running');
  assert.equal(unreadyPod.status.ready, '0/1');
  assert.ok(unreadyPod.status.conditions.some((c) => c.type === 'Ready' && c.status === 'False'));

  const readyPod = graph.get('Pod', 'default', 'web-ready');
  assert.ok(readyPod);
  assert.equal(readyPod.status.phase, 'Running');
  assert.equal(readyPod.status.ready, '1/1');
  assert.ok(readyPod.status.conditions.some((c) => c.type === 'Ready' && c.status === 'True'));

  // Endpoints MUST only contain the ready pod!
  const ep = graph.get('Endpoints', 'default', 'web-probe-svc');
  assert.ok(ep);
  assert.equal(ep.subsets[0].addresses.length, 1);
  assert.equal(ep.subsets[0].addresses[0].targetRef.name, 'web-ready');
  assert.equal(ep.subsets[0].notReadyAddresses.length, 1);
  assert.equal(ep.subsets[0].notReadyAddresses[0].targetRef.name, 'web-unready');

  // Service endpointCount must be 1
  const svc = graph.get('Service', 'default', 'web-probe-svc');
  assert.equal(svc.status.endpointCount, 1);

  cm.destroy();
});
