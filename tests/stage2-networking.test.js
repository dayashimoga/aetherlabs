'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { NetworkingEngine, isIpInCidr, matchesIpBlock } = require('../src/core/networkingEngine');

function bootstrapNetworkCluster(graph) {
  // Nodes
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'node-1', labels: { 'kubernetes.io/hostname': 'node-1' } },
    status: { addresses: [{ type: 'InternalIP', address: '192.168.1.10' }] }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'node-2', labels: { 'kubernetes.io/hostname': 'node-2' } },
    status: { addresses: [{ type: 'InternalIP', address: '192.168.1.11' }] }
  });

  // Namespaces
  graph.set({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'default' } });
  graph.set({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'prod' } });

  // Web Pods on node-1
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'frontend-pod', namespace: 'default', labels: { app: 'frontend' } },
    spec: { nodeName: 'node-1' },
    status: { phase: 'Running', podIP: '10.244.1.15', conditions: [{ type: 'Ready', status: 'True' }] }
  });

  // Backend Pods on node-2
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'backend-pod', namespace: 'prod', labels: { app: 'backend', tier: 'api' } },
    spec: { nodeName: 'node-2' },
    status: { phase: 'Running', podIP: '10.244.2.25', conditions: [{ type: 'Ready', status: 'True' }] }
  });
}

test('Subphase 2.2.2: CIDR and IP block matching', () => {
  assert.equal(isIpInCidr('10.244.1.5', '10.244.0.0/16'), true);
  assert.equal(isIpInCidr('192.168.1.1', '10.244.0.0/16'), false);
  assert.equal(isIpInCidr('10.96.0.1', '10.96.0.0/12'), true);

  // matchesIpBlock with exceptions
  const block = { cidr: '10.0.0.0/8', except: ['10.1.0.0/16'] };
  assert.equal(matchesIpBlock('10.2.3.4', block), true);
  assert.equal(matchesIpBlock('10.1.5.9', block), false);
});

test('Subphase 2.2.2: Service VIP allocation & EndpointSlice synchronization', () => {
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);
  const net = new NetworkingEngine(graph);

  // Create Service in prod targeting backend
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'backend-svc', namespace: 'prod' },
    spec: {
      type: 'ClusterIP',
      selector: { app: 'backend' },
      ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }]
    }
  });

  net.syncServicesAndEndpoints();

  const svc = graph.get('Service', 'prod', 'backend-svc');
  assert.ok(svc.spec.clusterIP.startsWith('10.96.'));

  // EndpointSlice should be synced with backend-pod IP
  const slice = graph.get('EndpointSlice', 'prod', 'backend-svc-slice-1');
  assert.ok(slice);
  assert.equal(slice.endpoints.length, 1);
  assert.equal(slice.endpoints[0].addresses[0], '10.244.2.25');
  assert.equal(slice.ports[0].port, 8080);
});

test('Subphase 2.2.2: CoreDNS resolution & loop detection', () => {
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);
  const net = new NetworkingEngine(graph);

  // Setup Service
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'api-service', namespace: 'default' },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.0.45',
      ports: [{ port: 443 }]
    }
  });

  // 1. Resolve standard service FQDN
  const res1 = net.resolveDNS('api-service.default.svc.cluster.local');
  assert.equal(res1.rcode, 'NOERROR');
  assert.equal(res1.records[0].ip, '10.96.0.45');

  // 2. Resolve short name with namespace
  const res2 = net.resolveDNS('api-service.default');
  assert.equal(res2.rcode, 'NOERROR');
  assert.equal(res2.records[0].ip, '10.96.0.45');

  // 3. Resolve pod IP DNS
  const resPod = net.resolveDNS('10-244-1-15.default.pod.cluster.local');
  assert.equal(resPod.rcode, 'NOERROR');
  assert.equal(resPod.records[0].ip, '10.244.1.15');

  // 4. CoreDNS Loop Detection (incident simulation)
  const loopNet = new NetworkingEngine(graph, { upstreamDns: '127.0.0.53' });
  const loopRes = loopNet.resolveDNS('api-service.default');
  assert.equal(loopRes.rcode, 'SERVFAIL');
  assert.ok(loopRes.error.includes('loop detected'));
});

test('Subphase 2.2.2: Ingress and Gateway API routing', () => {
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);
  const net = new NetworkingEngine(graph);

  // Ingress Rule
  graph.set({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: { name: 'web-ingress', namespace: 'default' },
    spec: {
      rules: [{
        host: 'api.kubelabs.io',
        http: {
          paths: [
            { path: '/v1', pathType: 'Prefix', backend: { service: { name: 'api-v1', port: { number: 8080 } } } },
            { path: '/v2', pathType: 'Prefix', backend: { service: { name: 'api-v2', port: { number: 9090 } } } }
          ]
        }
      }]
    }
  });

  const ingRoute = net.routeIngress('api.kubelabs.io', '/v1/users');
  assert.equal(ingRoute.matched, true);
  assert.equal(ingRoute.serviceName, 'api-v1');
  assert.equal(ingRoute.servicePort, 8080);

  // Gateway API HTTPRoute
  graph.set({
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: { name: 'cart-route', namespace: 'default' },
    spec: {
      hostnames: ['shop.kubelabs.io'],
      rules: [{
        matches: [{ path: { type: 'PathPrefix', value: '/cart' }, method: 'POST' }],
        backendRefs: [{ name: 'cart-service', port: 3000 }]
      }]
    }
  });

  const gwRoute = net.routeGatewayAPI('shop.kubelabs.io', '/cart/checkout', 'POST');
  assert.equal(gwRoute.matched, true);
  assert.equal(gwRoute.serviceName, 'cart-service');
  assert.equal(gwRoute.servicePort, 3000);
});

test('Subphase 2.2.2: Deterministic 7-Stage Packet Tracer with NetworkPolicy and Cilium L7 evaluation', () => {
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);
  const net = new NetworkingEngine(graph, { cni: 'cilium' });

  // Setup target Service and sync endpoints
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'backend-svc', namespace: 'prod' },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.1.50',
      selector: { app: 'backend' },
      ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }]
    }
  });
  net.syncServicesAndEndpoints();

  // Test 1: Traffic flows through all hops without NetworkPolicy
  const trace1 = net.tracePacket('frontend-pod', 'backend-svc.prod.svc.cluster.local', 80, 'TCP');
  assert.equal(trace1.allowed, true);
  assert.equal(trace1.dropReason, null);
  assert.ok(trace1.hops.length >= 7);
  assert.equal(trace1.hops[0].status, 'PASS'); // Source Netns
  assert.equal(trace1.hops[1].status, 'PASS'); // CoreDNS Resolution
  assert.ok(trace1.hops.some((h) => h.name === 'Service DNAT' && h.status === 'PASS'));

  // Test 2: Add Ingress NetworkPolicy on prod backend pod blocking frontend
  graph.set({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'deny-ingress-backend', namespace: 'prod' },
    spec: {
      podSelector: { matchLabels: { app: 'backend' } },
      policyTypes: ['Ingress'],
      ingress: [] // Default Deny
    }
  });

  const traceBlocked = net.tracePacket('frontend-pod', 'backend-svc.prod.svc.cluster.local', 80, 'TCP');
  assert.equal(traceBlocked.allowed, false);
  assert.ok(traceBlocked.dropReason.includes('Blocked by Ingress Default-Deny'));
  assert.ok(traceBlocked.hops.some((h) => h.name === 'Ingress NetworkPolicy' && h.status === 'DROP'));
});

test('Subphase 2.2.2: CLI dig, nslookup and CoreDNS resolution integration', () => {
  const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);

  // Setup service
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'auth-svc', namespace: 'default' },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.2.88',
      ports: [{ port: 80 }]
    }
  });

  const dispatcher = new MultiCliDispatcher({ graph });

  // 1. dig resolves auth-svc
  const digRes = dispatcher.handleDig({ argv: ['dig', 'auth-svc.default.svc.cluster.local'] });
  assert.equal(digRes.code, 0);
  assert.ok(digRes.stdout.includes('10.96.2.88'));
  assert.ok(digRes.stdout.includes('status: NOERROR'));

  // 2. nslookup resolves auth-svc
  const nsRes = dispatcher.handleNslookup({ argv: ['nslookup', 'auth-svc.default'] });
  assert.equal(nsRes.code, 0);
  assert.ok(nsRes.stdout.includes('Address: 10.96.2.88'));

  // 3. Loop detection produces SERVFAIL
  graph.set({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'coredns', namespace: 'kube-system' },
    data: {
      Corefile: '.:53 {\n  forward . 127.0.0.1:53\n  loop\n}'
    }
  });

  const loopDig = dispatcher.handleDig({ argv: ['dig', 'auth-svc.default'] });
  assert.equal(loopDig.code, 1);
  assert.ok(loopDig.stdout.includes('SERVFAIL'));

  const loopNs = dispatcher.handleNslookup({ argv: ['nslookup', 'auth-svc.default'] });
  assert.equal(loopNs.code, 1);
  assert.ok(loopNs.stdout.includes('SERVFAIL'));
});

test('Subphase 2.2.2: CLI cilium connectivity test and traceroute packet tracing', () => {
  const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
  const graph = new ResourceGraph();
  bootstrapNetworkCluster(graph);

  const dispatcher = new MultiCliDispatcher({ graph });

  // 1. cilium connectivity test allows traffic
  const connRes = dispatcher.handleCilium({ argv: ['cilium', 'connectivity', 'test'] });
  assert.equal(connRes.code, 0);
  assert.ok(connRes.stdout.includes('Connectivity test using src:'));
  assert.ok(connRes.stdout.includes('All connectivity checks successful'));

  // 2. traceroute CLI command
  const traceRes = dispatcher.handleTraceroute({ argv: ['traceroute', 'backend-pod'] });
  assert.equal(traceRes.code, 0);
  assert.ok(traceRes.stdout.includes('traceroute to backend-pod'));
  assert.ok(traceRes.stdout.includes('Source Netns'));
});

