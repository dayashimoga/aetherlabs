'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Kubernetes Networking & CNI Engine
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let ResourceGraph;
try {
  ResourceGraph = require('./resourceGraph').ResourceGraph;
} catch {
  ResourceGraph = (typeof globalThis !== 'undefined' && globalThis.ResourceGraph);
}

// ---------------------------------------------------------------------------
// IP & CIDR Manipulation Helpers
// ---------------------------------------------------------------------------

function ipToInt(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') return 0;
  const parts = ipStr.split('.').map(Number);
  if (parts.length !== 4) return 0;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(intVal) {
  return [
    (intVal >>> 24) & 255,
    (intVal >>> 16) & 255,
    (intVal >>> 8) & 255,
    intVal & 255
  ].join('.');
}

function isIpInCidr(ipStr, cidrStr) {
  if (!ipStr || !cidrStr) return false;
  const [baseIp, maskStr] = cidrStr.split('/');
  const maskBits = maskStr !== undefined ? Number(maskStr) : 32;
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;

  const mask = maskBits === 0 ? 0 : ((0xFFFFFFFF << (32 - maskBits)) >>> 0);
  const targetInt = ipToInt(ipStr);
  const baseInt = ipToInt(baseIp);

  return (targetInt & mask) === (baseInt & mask);
}

function matchesIpBlock(ipStr, ipBlock) {
  if (!ipBlock || !ipBlock.cidr) return false;
  if (!isIpInCidr(ipStr, ipBlock.cidr)) return false;

  if (Array.isArray(ipBlock.except)) {
    for (const exc of ipBlock.except) {
      if (isIpInCidr(ipStr, exc)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// NetworkingEngine Class
// ---------------------------------------------------------------------------

class NetworkingEngine {
  constructor(resourceGraph, options = {}) {
    if (!resourceGraph) {
      throw new TypeError('NetworkingEngine requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
    this.cni = options.cni || 'calico'; // 'calico' | 'cilium' | 'flannel' | 'weave'
    this.clusterDns = options.clusterDns || '10.96.0.10';
    this.clusterDomain = options.clusterDomain || 'cluster.local';
    this.clusterIpPool = options.clusterIpPool || '10.96.0.0/12';
    this.podIpPool = options.podIpPool || '10.244.0.0/16';

    this.clusterIpCounter = 100;
    this.nodePortCounter = 30000;
    this.podIpCounter = 10;

    // Upstream DNS configuration & simulated external internet resolution
    this.upstreamDns = options.upstreamDns || '8.8.8.8';
    this.dnsStubDomains = options.dnsStubDomains || {}; // domain -> nameserver
    this.dnsSearchList = options.dnsSearchList || ['svc.cluster.local', 'cluster.local'];
    this.ndots = options.ndots !== undefined ? options.ndots : 5;

    // CNI IPPools and Subnet configurations
    this._initCniConfig();
  }

  _initCniConfig() {
    // Calico IPPool defaults
    this.calicoIpPools = [
      { name: 'default-ipv4-ippool', cidr: '10.244.0.0/16', encapsulation: 'VXLAN', blockSize: 26 }
    ];

    // Flannel Subnet Leases per Node
    this.flannelSubnets = new Map();

    // Cilium eBPF map tables (simulated)
    this.ciliumBpfEndpoints = new Map(); // ip -> { id, identity, secLabel }
  }

  // -------------------------------------------------------------------------
  // 1. IP ALLOCATION & CNI SUB-NETTING
  // -------------------------------------------------------------------------

  allocateClusterIP() {
    this.clusterIpCounter++;
    const octet = (this.clusterIpCounter % 240) + 1;
    const sub = Math.floor(this.clusterIpCounter / 240);
    return `10.96.${sub}.${octet}`;
  }

  allocateNodePort() {
    this.nodePortCounter++;
    if (this.nodePortCounter > 32767) this.nodePortCounter = 30000;
    return this.nodePortCounter;
  }

  allocatePodIP(nodeName = 'default-node') {
    this.podIpCounter++;
    const nodeIndex = nodeName.includes('2') ? 2 : nodeName.includes('1') ? 1 : 0;
    const octet = (this.podIpCounter % 240) + 5;
    return `10.244.${nodeIndex}.${octet}`;
  }

  // -------------------------------------------------------------------------
  // 2. SERVICE & ENDPOINT / ENDPOINTSLICE RECONCILIATION
  // -------------------------------------------------------------------------

  /**
   * Reconciles all Services, allocating VIPs/NodePorts and syncing EndpointSlices
   */
  syncServicesAndEndpoints() {
    const services = this.graph.list({ kind: 'Service' });
    const allPods = this.graph.list({ kind: 'Pod' });

    for (const svc of services) {
      const ns = svc.metadata?.namespace || 'default';
      const name = svc.metadata?.name;
      const type = svc.spec?.type || 'ClusterIP';

      // 1. ClusterIP Allocation
      if (type !== 'ExternalName') {
        if (!svc.spec.clusterIP && svc.spec.clusterIP !== 'None') {
          svc.spec.clusterIP = this.allocateClusterIP();
          this.graph.set(svc, { skipReconcileNotification: true });
        }
      }

      // 2. NodePort Allocation
      if (type === 'NodePort' || type === 'LoadBalancer') {
        let changed = false;
        for (const p of svc.spec?.ports || []) {
          if (!p.nodePort) {
            p.nodePort = this.allocateNodePort();
            changed = true;
          }
        }
        if (changed) this.graph.set(svc, { skipReconcileNotification: true });
      }

      // 3. LoadBalancer Ingress VIP
      if (type === 'LoadBalancer') {
        svc.status = svc.status || {};
        svc.status.loadBalancer = svc.status.loadBalancer || {};
        if (!svc.status.loadBalancer.ingress || svc.status.loadBalancer.ingress.length === 0) {
          svc.status.loadBalancer.ingress = [{ ip: `35.200.${(this.clusterIpCounter % 200) + 10}.1` }];
          this.graph.set(svc, { skipReconcileNotification: true });
        }
      }

      // 4. Match Pods for Endpoints & EndpointSlice
      if (!svc.spec?.selector || Object.keys(svc.spec.selector).length === 0) {
        continue; // Headless or selectorless service
      }

      const matchingPods = allPods.filter((p) => {
        if ((p.metadata?.namespace || 'default') !== ns) return false;
        return this.graph.matchesLabelSelector(p, svc.spec.selector);
      });

      const readyPods = matchingPods.filter((p) => {
        const isRunning = p.status?.phase === 'Running';
        const readyCond = (p.status?.conditions || []).find((c) => c.type === 'Ready');
        return isRunning && (!readyCond || readyCond.status === 'True') && p.status?.podIP && p.status.podIP !== '<none>';
      });

      // Construct Endpoints resource (legacy)
      const epSubsets = [];
      if (readyPods.length > 0) {
        const addresses = readyPods.map((p) => ({
          ip: p.status.podIP,
          nodeName: p.spec?.nodeName,
          targetRef: { kind: 'Pod', namespace: ns, name: p.metadata.name }
        }));

        const ports = (svc.spec.ports || []).map((p) => ({
          name: p.name || 'default',
          port: typeof p.targetPort === 'number' ? p.targetPort : (parseInt(p.targetPort, 10) || p.port),
          protocol: p.protocol || 'TCP'
        }));

        epSubsets.push({ addresses, ports });
      }

      const epResource = {
        apiVersion: 'v1',
        kind: 'Endpoints',
        metadata: {
          name,
          namespace: ns,
          labels: { 'kubernetes.io/service-name': name }
        },
        subsets: epSubsets
      };
      this.graph.set(epResource, { skipReconcileNotification: true });

      // Construct EndpointSlice resource (modern Kubernetes)
      const sliceEndpoints = readyPods.map((p) => ({
        addresses: [p.status.podIP],
        conditions: { ready: true, serving: true, terminating: false },
        nodeName: p.spec?.nodeName,
        targetRef: { kind: 'Pod', namespace: ns, name: p.metadata.name }
      }));

      const slicePorts = (svc.spec.ports || []).map((p) => ({
        name: p.name || 'default',
        port: typeof p.targetPort === 'number' ? p.targetPort : (parseInt(p.targetPort, 10) || p.port),
        protocol: p.protocol || 'TCP'
      }));

      const sliceResource = {
        apiVersion: 'discovery.k8s.io/v1',
        kind: 'EndpointSlice',
        metadata: {
          name: `${name}-slice-1`,
          namespace: ns,
          labels: { 'kubernetes.io/service-name': name }
        },
        addressType: 'IPv4',
        ports: slicePorts,
        endpoints: sliceEndpoints
      };
      this.graph.set(sliceResource, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------------------
  // 3. COREDNS RESOLVER ENGINE & LOOP DETECTION
  // -------------------------------------------------------------------------

  /**
   * Resolves DNS query names according to Kubernetes CoreDNS rules.
   * Detects CoreDNS loops (forward loop back to localhost or self)
   * @param {string} query Hostname to resolve
   * @param {object} options { namespace = 'default', ndots = 5 }
   * @returns {{ records: Array<{ ip: string, type: string, cname?: string }>, error?: string, rcode: string }}
   */
  resolveDNS(query, options = {}) {
    if (!query || typeof query !== 'string') {
      return { records: [], error: 'empty query', rcode: 'FORMERR' };
    }

    const ns = options.namespace || 'default';
    const cleanQuery = query.toLowerCase().trim().replace(/\.$/, '');

    // 1. Loop Detection Check
    if (
      this.upstreamDns === '127.0.0.1' ||
      this.upstreamDns === '127.0.0.53' ||
      this.upstreamDns === '::1' ||
      this.upstreamDns === this.clusterDns
    ) {
      return {
        records: [],
        error: `CoreDNS loop detected: forward loop between cluster DNS (${this.clusterDns}) and upstream nameserver (${this.upstreamDns}). Runbook: remove loopback entry from /etc/resolv.conf.`,
        rcode: 'SERVFAIL'
      };
    }

    // 2. Direct Pod IP DNS: 10-244-1-5.default.pod.cluster.local
    const podDnsMatch = cleanQuery.match(/^(\d+)-(\d+)-(\d+)-(\d+)\.([^.]+)\.pod(?:\.cluster\.local)?$/);
    if (podDnsMatch) {
      const ip = `${podDnsMatch[1]}.${podDnsMatch[2]}.${podDnsMatch[3]}.${podDnsMatch[4]}`;
      return { records: [{ ip, type: 'A' }], rcode: 'NOERROR' };
    }

    // 3. Service Lookup: <svc>.<ns>.svc.cluster.local or <svc>.<ns> or <svc>
    const svcSuffix = `.svc.${this.clusterDomain}`;
    let targetSvcName = cleanQuery;
    let targetSvcNs = ns;

    if (cleanQuery.endsWith(svcSuffix)) {
      const parts = cleanQuery.slice(0, -svcSuffix.length).split('.');
      targetSvcName = parts[0];
      targetSvcNs = parts[1] || ns;
    } else if (cleanQuery.includes('.')) {
      const parts = cleanQuery.split('.');
      targetSvcName = parts[0];
      targetSvcNs = parts[1] || ns;
    }

    const svc = this.graph.get('Service', targetSvcNs, targetSvcName);
    if (svc) {
      // ExternalName service
      if (svc.spec?.type === 'ExternalName') {
        const cname = svc.spec.externalName || 'external.domain.com';
        return {
          records: [{ ip: '198.51.100.1', type: 'CNAME', cname }],
          rcode: 'NOERROR'
        };
      }

      // Headless service: return all matching Pod IPs
      if (svc.spec?.clusterIP === 'None') {
        const slice = this.graph.get('EndpointSlice', targetSvcNs, `${targetSvcName}-slice-1`);
        const ips = (slice?.endpoints || []).map((e) => e.addresses?.[0]).filter(Boolean);
        if (ips.length > 0) {
          return {
            records: ips.map((ip) => ({ ip, type: 'A' })),
            rcode: 'NOERROR'
          };
        }
      }

      // Regular ClusterIP
      if (svc.spec?.clusterIP) {
        return {
          records: [{ ip: svc.spec.clusterIP, type: 'A' }],
          rcode: 'NOERROR'
        };
      }
    }

    // 4. External DNS Resolution via simulated upstream (8.8.8.8)
    if (cleanQuery.includes('.com') || cleanQuery.includes('.org') || cleanQuery.includes('.net') || cleanQuery.includes('.io')) {
      const mockDnsTable = {
        'kubernetes.io': '147.75.40.148',
        'github.com': '140.82.121.4',
        'registry.k8s.io': '34.96.91.89',
        'docker.io': '44.205.64.79'
      };
      const resolved = mockDnsTable[cleanQuery] || '93.184.216.34';
      return { records: [{ ip: resolved, type: 'A' }], rcode: 'NOERROR' };
    }

    return { records: [], rcode: 'NXDOMAIN' };
  }

  // -------------------------------------------------------------------------
  // 4. INGRESS & GATEWAY API (HTTPRoute / GRPCRoute) ROUTING
  // -------------------------------------------------------------------------

  /**
   * Evaluates Ingress routing rules for incoming HTTP request
   */
  routeIngress(host, path, headers = {}) {
    const ingresses = this.graph.list({ kind: 'Ingress' });

    for (const ing of ingresses) {
      const ns = ing.metadata?.namespace || 'default';
      const rules = ing.spec?.rules || [];

      for (const rule of rules) {
        // Host check (exact or wildcard)
        if (rule.host && rule.host !== host) {
          if (!rule.host.startsWith('*.') || !host.endsWith(rule.host.slice(1))) {
            continue;
          }
        }

        for (const p of rule.http?.paths || []) {
          const rulePath = p.path || '/';
          const pathType = p.pathType || 'Prefix';

          let matches = false;
          if (pathType === 'Exact') {
            matches = path === rulePath;
          } else {
            // Prefix
            matches = path.startsWith(rulePath);
          }

          if (matches) {
            const svcName = p.backend?.service?.name;
            const portNum = p.backend?.service?.port?.number || 80;
            const svc = this.graph.get('Service', ns, svcName);
            return {
              matched: true,
              ingress: ing.metadata.name,
              serviceName: svcName,
              servicePort: portNum,
              clusterIP: svc?.spec?.clusterIP || null
            };
          }
        }
      }
    }

    return { matched: false };
  }

  /**
   * Evaluates Gateway API HTTPRoute rules
   */
  routeGatewayAPI(host, path, method = 'GET', headers = {}) {
    const routes = this.graph.list({ kind: 'HTTPRoute' });

    for (const route of routes) {
      const ns = route.metadata?.namespace || 'default';
      const hostnames = route.spec?.hostnames || [];

      if (hostnames.length > 0 && !hostnames.includes(host)) {
        continue;
      }

      for (const rule of route.spec?.rules || []) {
        let ruleMatched = true;

        for (const match of rule.matches || []) {
          // Path match
          if (match.path) {
            const pType = match.path.type || 'PathPrefix';
            const val = match.path.value || '/';
            if (pType === 'Exact' && path !== val) ruleMatched = false;
            if (pType === 'PathPrefix' && !path.startsWith(val)) ruleMatched = false;
          }

          // Method match
          if (match.method && match.method.toUpperCase() !== method.toUpperCase()) {
            ruleMatched = false;
          }

          if (!ruleMatched) break;
        }

        if (ruleMatched) {
          const backend = rule.backendRefs?.[0];
          const svcName = backend?.name;
          const svcPort = backend?.port || 80;
          return {
            matched: true,
            route: route.metadata.name,
            serviceName: svcName,
            servicePort: svcPort
          };
        }
      }
    }

    return { matched: false };
  }

  // -------------------------------------------------------------------------
  // 5. CILIUM & NETWORKPOLICY L3/L4/L7 SECURITY EVALUATION
  // -------------------------------------------------------------------------

  /**
   * Evaluates standard Kubernetes NetworkPolicy for Ingress and Egress
   */
  evaluateNetworkPolicy(srcPod, dstPod, port, protocol, direction = 'Ingress') {
    if (!srcPod || !dstPod) return { allowed: true };

    const targetPod = direction === 'Ingress' ? dstPod : srcPod;
    const peerPod = direction === 'Ingress' ? srcPod : dstPod;
    const targetNs = targetPod.metadata?.namespace || 'default';
    const peerNs = peerPod.metadata?.namespace || 'default';

    const policies = this.graph.list({ kind: 'NetworkPolicy', namespace: targetNs });

    // Find policies selecting targetPod
    const selectingPolicies = policies.filter((p) => {
      const sel = p.spec?.podSelector || {};
      return this.graph.matchesLabelSelector(targetPod, sel);
    });

    // Check if targetPod is isolated for this direction
    const activePolicies = selectingPolicies.filter((p) => {
      const types = p.spec?.policyTypes || [];
      if (direction === 'Ingress') {
        return types.includes('Ingress') || Boolean(p.spec?.ingress);
      } else {
        return types.includes('Egress') || Boolean(p.spec?.egress);
      }
    });

    // Default Allow if not isolated
    if (activePolicies.length === 0) {
      return { allowed: true, reason: `No ${direction} NetworkPolicy selecting pod` };
    }

    // Default Deny is active: at least one rule must explicitly allow
    let explicitlyAllowed = false;
    let policyName = '';

    for (const p of activePolicies) {
      const rules = direction === 'Ingress' ? (p.spec?.ingress || []) : (p.spec?.egress || []);

      // If policy defines ingress: [] or egress: [] (empty array), it is an absolute default-deny!
      if (rules.length === 0) continue;

      for (const rule of rules) {
        const peers = direction === 'Ingress' ? (rule.from || []) : (rule.to || []);
        const ports = rule.ports || [];

        // Check Port Matching
        let portMatches = ports.length === 0;
        if (!portMatches) {
          portMatches = ports.some((prt) => {
            const pNum = typeof prt.port === 'number' ? prt.port : parseInt(prt.port, 10);
            const pProto = prt.protocol || 'TCP';
            return (!pNum || pNum === port) && (!pProto || pProto.toUpperCase() === protocol.toUpperCase());
          });
        }
        if (!portMatches) continue;

        // Check Peer Matching (podSelector / namespaceSelector / ipBlock)
        let peerMatches = peers.length === 0;
        if (!peerMatches) {
          peerMatches = peers.some((peer) => {
            let pMatch = true;

            // namespaceSelector
            if (peer.namespaceSelector) {
              const nsObj = this.graph.get('Namespace', null, peerNs);
              if (!nsObj || !this.graph.matchesLabelSelector(nsObj, peer.namespaceSelector)) {
                pMatch = false;
              }
            } else if (peer.podSelector && targetNs !== peerNs) {
              // podSelector without namespaceSelector applies ONLY within target namespace
              pMatch = false;
            }

            // podSelector
            if (pMatch && peer.podSelector) {
              if (!this.graph.matchesLabelSelector(peerPod, peer.podSelector)) {
                pMatch = false;
              }
            }

            // ipBlock
            if (peer.ipBlock) {
              const peerIp = peerPod.status?.podIP;
              if (peerIp && matchesIpBlock(peerIp, peer.ipBlock)) {
                return true;
              }
            }

            return pMatch;
          });
        }

        if (portMatches && peerMatches) {
          explicitlyAllowed = true;
          policyName = p.metadata.name;
          break;
        }
      }

      if (explicitlyAllowed) break;
    }

    if (explicitlyAllowed) {
      return { allowed: true, reason: `Allowed by ${direction} NetworkPolicy "${policyName}"` };
    }

    return {
      allowed: false,
      reason: `Blocked by ${direction} Default-Deny isolation on pod "${targetPod.metadata.name}" in namespace "${targetNs}"`
    };
  }

  /**
   * Evaluates CiliumNetworkPolicy L3/L4/L7 rules
   */
  evaluateCiliumPolicy(srcPod, dstPod, port, protocol, httpPath = null, httpMethod = null) {
    const ciliumPolicies = this.graph.list({ kind: 'CiliumNetworkPolicy', namespace: dstPod.metadata.namespace });
    if (!ciliumPolicies || ciliumPolicies.length === 0) {
      return { allowed: true };
    }

    for (const cp of ciliumPolicies) {
      const epSelector = cp.spec?.endpointSelector || {};
      if (!this.graph.matchesLabelSelector(dstPod, epSelector)) continue;

      for (const ing of cp.spec?.ingress || []) {
        // L7 HTTP rules inspection
        for (const prt of ing.toPorts || []) {
          for (const rule of prt.rules?.http || []) {
            if (httpPath && rule.path && !new RegExp(rule.path).test(httpPath)) {
              return { allowed: false, reason: `Cilium L7 HTTP path filter rejected: ${httpPath} does not match ${rule.path}` };
            }
            if (httpMethod && rule.method && rule.method.toUpperCase() !== httpMethod.toUpperCase()) {
              return { allowed: false, reason: `Cilium L7 HTTP method filter rejected: ${httpMethod} != ${rule.method}` };
            }
          }
        }
      }
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // 6. 7-STAGE DETERMINISTIC PACKET TRACER
  // -------------------------------------------------------------------------

  /**
   * Traces packet flow from source pod through virtual CNI fabric to destination
   * @param {object|string} src Source Pod or IP
   * @param {object|string} dst Destination Pod, Service, or IP
   * @param {number} port Destination Port
   * @param {string} proto Protocol ('TCP' | 'UDP')
   * @param {object} options { httpPath, httpMethod }
   * @returns {{ allowed: boolean, dropReason: string|null, hops: Array<{ stage: number, name: string, status: string, details: string }> }}
   */
  tracePacket(src, dst, port = 80, proto = 'TCP', options = {}) {
    const hops = [];
    const recordHop = (stage, name, status, details) => {
      hops.push({ stage, name, status, details });
    };

    // 1. Resolve Source Pod
    let srcPod = null;
    if (typeof src === 'object' && src.kind === 'Pod') srcPod = src;
    else if (typeof src === 'string') {
      srcPod = this.graph.list({ kind: 'Pod' }).find((p) => p.metadata.name === src || p.status?.podIP === src);
    }

    if (!srcPod) {
      recordHop(1, 'Source Netns', 'DROP', `Source pod "${src}" could not be resolved`);
      return { allowed: false, dropReason: 'Source pod not found', hops };
    }

    const srcIp = srcPod.status?.podIP || '10.244.0.10';
    const srcNode = srcPod.spec?.nodeName || 'control-plane-node';
    recordHop(1, 'Source Netns', 'PASS', `Packet generated in netns eth0 (${srcPod.metadata.namespace}/${srcPod.metadata.name}, IP: ${srcIp})`);

    // 2. DNS Resolution if Destination is Hostname
    let resolvedDstIp = typeof dst === 'string' ? dst : dst?.status?.podIP || dst?.spec?.clusterIP;
    if (typeof dst === 'string' && !/^\d+\.\d+\.\d+\.\d+$/.test(dst)) {
      const directPod = this.graph.list({ kind: 'Pod' }).find(
        (p) => p.metadata.name === dst || `${p.metadata.namespace}/${p.metadata.name}` === dst
      );
      if (directPod && directPod.status?.podIP) {
        resolvedDstIp = directPod.status.podIP;
        recordHop(2, 'Name Resolution', 'PASS', `Resolved pod "${dst}" -> ${resolvedDstIp}`);
      } else {
        const dnsRes = this.resolveDNS(dst, { namespace: srcPod.metadata.namespace });
        if (dnsRes.rcode !== 'NOERROR' || dnsRes.records.length === 0) {
          recordHop(2, 'CoreDNS Resolution', 'DROP', `DNS query failed for "${dst}": ${dnsRes.error || dnsRes.rcode}`);
          return { allowed: false, dropReason: `CoreDNS NXDOMAIN/SERVFAIL for ${dst}`, hops };
        }
        resolvedDstIp = dnsRes.records[0].ip;
        recordHop(2, 'CoreDNS Resolution', 'PASS', `Resolved "${dst}" -> ${resolvedDstIp} (${dnsRes.records[0].type})`);
      }
    }

    // 3. Egress NetworkPolicy Evaluation
    // Find destination pod if IP belongs to a pod
    let dstPod = this.graph.list({ kind: 'Pod' }).find((p) => p.status?.podIP === resolvedDstIp);

    // If destination is a ClusterIP Service, evaluate Service NAT
    let isService = false;
    let targetSvc = null;
    if (!dstPod) {
      targetSvc = this.graph.list({ kind: 'Service' }).find((s) => s.spec?.clusterIP === resolvedDstIp);
      if (targetSvc) {
        isService = true;
        // Lookup healthy endpoint pod
        const slice = this.graph.get('EndpointSlice', targetSvc.metadata.namespace, `${targetSvc.metadata.name}-slice-1`);
        const epIp = slice?.endpoints?.[0]?.addresses?.[0];
        if (epIp) {
          dstPod = this.graph.list({ kind: 'Pod' }).find((p) => p.status?.podIP === epIp);
        }
      }
    }

    const egressCheck = this.evaluateNetworkPolicy(srcPod, dstPod || { status: { podIP: resolvedDstIp } }, port, proto, 'Egress');
    if (!egressCheck.allowed) {
      recordHop(3, 'Egress NetworkPolicy', 'DROP', egressCheck.reason);
      return { allowed: false, dropReason: egressCheck.reason, hops };
    }
    recordHop(3, 'Egress NetworkPolicy', 'PASS', egressCheck.reason);

    // 4. Node Bridge & Virtual Ethernet (veth pair)
    recordHop(4, 'Node Bridge (cbr0)', 'PASS', `Traversed veth${Math.floor(Math.random() * 9000 + 1000)} to bridge cbr0 on node "${srcNode}"`);

    // 5. Service DNAT & Kube-Proxy / eBPF translation
    let finalDstIp = resolvedDstIp;
    let finalPort = port;
    if (isService && targetSvc) {
      if (!dstPod) {
        recordHop(5, 'Service DNAT', 'DROP', `Service "${targetSvc.metadata.name}" has 0 active endpoints`);
        return { allowed: false, dropReason: 'Service has no endpoints', hops };
      }
      finalDstIp = dstPod.status?.podIP;
      const svcPortObj = (targetSvc.spec?.ports || []).find((p) => p.port === port);
      finalPort = svcPortObj?.targetPort || port;
      recordHop(5, 'Service DNAT', 'PASS', `Kube-Proxy/eBPF DNAT translated VIP ${targetSvc.spec.clusterIP}:${port} -> Endpoint ${finalDstIp}:${finalPort}`);
    } else {
      recordHop(5, 'Routing Decision', 'PASS', `Direct routing to destination IP ${finalDstIp}:${finalPort}`);
    }

    // 6. CNI Encapsulation & Inter-Node Fabric
    const dstNode = dstPod?.spec?.nodeName || srcNode;
    if (srcNode === dstNode) {
      recordHop(6, 'CNI Fabric', 'PASS', `Local intra-node routing on ${srcNode} via cbr0`);
    } else {
      const mode = this.cni === 'cilium' ? 'Cilium eBPF VXLAN' : this.cni === 'flannel' ? 'Flannel vxlan (UDP 8472)' : 'Calico VXLAN/BGP';
      recordHop(6, 'CNI Fabric', 'PASS', `${mode} encapsulated packet from "${srcNode}" to "${dstNode}"`);
    }

    // 7. Destination Node Bridge & Ingress NetworkPolicy
    if (dstPod) {
      const ingressCheck = this.evaluateNetworkPolicy(srcPod, dstPod, finalPort, proto, 'Ingress');
      if (!ingressCheck.allowed) {
        recordHop(7, 'Ingress NetworkPolicy', 'DROP', ingressCheck.reason);
        return { allowed: false, dropReason: ingressCheck.reason, hops };
      }
      recordHop(7, 'Ingress NetworkPolicy', 'PASS', ingressCheck.reason);

      // Cilium L7 Inspection
      if (this.cni === 'cilium' && (options.httpPath || options.httpMethod)) {
        const l7Check = this.evaluateCiliumPolicy(srcPod, dstPod, finalPort, proto, options.httpPath, options.httpMethod);
        if (!l7Check.allowed) {
          recordHop(8, 'Cilium L7 Filter', 'DROP', l7Check.reason);
          return { allowed: false, dropReason: l7Check.reason, hops };
        }
        recordHop(8, 'Cilium L7 Filter', 'PASS', 'Cilium eBPF L7 HTTP policy passed');
      }

      recordHop(9, 'Destination Delivery', 'PASS', `Delivered packet to container socket in ${dstPod.metadata.namespace}/${dstPod.metadata.name} on ${finalDstIp}:${finalPort}`);
    } else {
      recordHop(7, 'External Delivery', 'PASS', `Delivered packet to external destination ${finalDstIp}:${finalPort}`);
    }

    return {
      allowed: true,
      dropReason: null,
      hops
    };
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Module Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NetworkingEngine,
    ipToInt,
    intToIp,
    isIpInCidr,
    matchesIpBlock
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.NetworkingEngine = NetworkingEngine;
  globalThis.ipToInt = ipToInt;
  globalThis.intToIp = intToIp;
  globalThis.isIpInCidr = isIpInCidr;
  globalThis.matchesIpBlock = matchesIpBlock;
}

