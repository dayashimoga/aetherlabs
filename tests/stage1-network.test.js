'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const {
  NetworkTracer,
  isIpInCidr,
  matchesIpBlock
} = require('../src/core/networkTracer');

test('Subphase 1.3.1: CIDR mask checking and IPBlock exception matching', () => {
  // CIDR tests
  assert.equal(isIpInCidr('10.244.1.15', '10.244.0.0/16'), true);
  assert.equal(isIpInCidr('10.244.1.15', '10.244.1.0/24'), true);
  assert.equal(isIpInCidr('10.244.2.15', '10.244.1.0/24'), false);
  assert.equal(isIpInCidr('192.168.1.1', '10.0.0.0/8'), false);

  // IPBlock with exceptions
  const block = {
    cidr: '10.0.0.0/8',
    except: ['10.5.0.0/16']
  };
  assert.equal(matchesIpBlock('10.1.1.1', block), true);
  assert.equal(matchesIpBlock('10.5.1.1', block), false); // in except list
  assert.equal(matchesIpBlock('192.168.1.1', block), false); // not in cidr
});

test('Subphase 1.3.1: Default-allow traffic flows through all 7 virtual CNI hops', () => {
  const graph = new ResourceGraph();
  const tracer = new NetworkTracer(graph);

  // Setup source and destination pods on different nodes
  graph.set({
    kind: 'Pod',
    metadata: { name: 'frontend-pod', namespace: 'default', labels: { app: 'frontend' } },
    status: { phase: 'Running', podIP: '10.244.1.10', nodeName: 'worker-1' }
  });

  graph.set({
    kind: 'Pod',
    metadata: { name: 'backend-pod', namespace: 'default', labels: { app: 'backend' } },
    status: { phase: 'Running', podIP: '10.244.2.20', nodeName: 'worker-2' }
  });

  const trace = tracer.tracePacket({
    src: 'default/frontend-pod',
    dst: 'default/backend-pod',
    port: 8080,
    protocol: 'TCP'
  });

  assert.equal(trace.allowed, true);
  assert.equal(trace.dropReason, null);
  assert.equal(trace.hops.length, 7);

  // Verify stages
  assert.equal(trace.hops[0].stage, 'SOURCE_NETNS');
  assert.equal(trace.hops[1].stage, 'VETH_BRIDGE');
  assert.equal(trace.hops[2].stage, 'EGRESS_POLICY');
  assert.equal(trace.hops[3].stage, 'FABRIC_ROUTING');
  assert.match(trace.hops[3].component, /VXLAN Overlay/); // Cross-node
  assert.equal(trace.hops[4].stage, 'DESTINATION_BRIDGE');
  assert.equal(trace.hops[5].stage, 'INGRESS_POLICY');
  assert.equal(trace.hops[6].stage, 'DESTINATION_NETNS');

  // Verify ASCII formatter
  const formatted = tracer.formatTrace(trace);
  assert.match(formatted, /ALLOWED \(200 OK\)/);
  assert.match(formatted, /FABRIC_ROUTING/);
});

test('Subphase 1.3.1: NetworkPolicy Ingress default-deny blocks unauthorized pods', () => {
  const graph = new ResourceGraph();
  const tracer = new NetworkTracer(graph);

  // Secure Database Pod
  graph.set({
    kind: 'Pod',
    metadata: { name: 'db-pod', namespace: 'production', labels: { app: 'db' } },
    status: { phase: 'Running', podIP: '10.244.1.50', nodeName: 'worker-1' }
  });

  // Client Pod
  graph.set({
    kind: 'Pod',
    metadata: { name: 'client-pod', namespace: 'production', labels: { app: 'client' } },
    status: { phase: 'Running', podIP: '10.244.1.60', nodeName: 'worker-1' }
  });

  // NetworkPolicy on DB pod: isolate Ingress, but with empty ingress rules (default deny all ingress)
  graph.set({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'db-default-deny-ingress', namespace: 'production' },
    spec: {
      podSelector: { matchLabels: { app: 'db' } },
      policyTypes: ['Ingress'],
      ingress: []
    }
  });

  const trace = tracer.tracePacket({
    src: 'production/client-pod',
    dst: 'production/db-pod',
    port: 5432,
    protocol: 'TCP'
  });

  assert.equal(trace.allowed, false);
  assert.match(trace.dropReason, /Ingress denied by NetworkPolicy/);

  // Verify drop occurs at INGRESS_POLICY stage
  const ingressHop = trace.hops.find((h) => h.stage === 'INGRESS_POLICY');
  assert.ok(ingressHop);
  assert.equal(ingressHop.action, 'DROP');
});

test('Subphase 1.3.1: NetworkPolicy permits matching podSelector, namespaceSelector, and ports', () => {
  const graph = new ResourceGraph();
  const tracer = new NetworkTracer(graph);

  // Namespaces
  graph.set({ kind: 'Namespace', metadata: { name: 'production', labels: { env: 'prod' } } });
  graph.set({ kind: 'Namespace', metadata: { name: 'development', labels: { env: 'dev' } } });

  // Database in production
  graph.set({
    kind: 'Pod',
    metadata: { name: 'db', namespace: 'production', labels: { role: 'db' } },
    status: { phase: 'Running', podIP: '10.244.1.100', nodeName: 'worker-1' }
  });

  // Backend in production
  graph.set({
    kind: 'Pod',
    metadata: { name: 'api', namespace: 'production', labels: { role: 'backend' } },
    status: { phase: 'Running', podIP: '10.244.1.101', nodeName: 'worker-1' }
  });

  // Client in development
  graph.set({
    kind: 'Pod',
    metadata: { name: 'dev-client', namespace: 'development', labels: { role: 'backend' } },
    status: { phase: 'Running', podIP: '10.244.1.102', nodeName: 'worker-1' }
  });

  // NetworkPolicy on DB: allow ingress only from pods with role: backend in namespace with env: prod on port 5432
  graph.set({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'allow-prod-backend-to-db', namespace: 'production' },
    spec: {
      podSelector: { matchLabels: { role: 'db' } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [
            {
              namespaceSelector: { matchLabels: { env: 'prod' } },
              podSelector: { matchLabels: { role: 'backend' } }
            }
          ],
          ports: [{ protocol: 'TCP', port: 5432 }]
        }
      ]
    }
  });

  // Prod api -> DB on 5432: ALLOWED
  const trace1 = tracer.tracePacket({
    src: 'production/api',
    dst: 'production/db',
    port: 5432,
    protocol: 'TCP'
  });
  assert.equal(trace1.allowed, true);

  // Prod api -> DB on wrong port 8080: DROPPED
  const trace2 = tracer.tracePacket({
    src: 'production/api',
    dst: 'production/db',
    port: 8080,
    protocol: 'TCP'
  });
  assert.equal(trace2.allowed, false);

  // Dev client -> DB on 5432: DROPPED (wrong namespace)
  const trace3 = tracer.tracePacket({
    src: 'development/dev-client',
    dst: 'production/db',
    port: 5432,
    protocol: 'TCP'
  });
  assert.equal(trace3.allowed, false);
});

