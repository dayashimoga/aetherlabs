'use strict';

/**
 * KubeLabs v3.0 - Linux Network Namespace & Virtual CNI Packet Tracer
 * Features:
 *  1. Virtual CNI fabric (Linux netns, veth pairs, node bridge devices cbr0, routing)
 *  2. Kubernetes NetworkPolicy evaluation engine (Ingress/Egress, podSelector, namespaceSelector, ipBlock CIDR, ports)
 *  3. Hop-by-hop packet tracer with detailed drop diagnostics
 * Pure ES2024 module with zero external dependencies.
 */

// CIDR & IP Helpers
function ipToInt(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') return 0;
  const parts = ipStr.split('.').map(Number);
  if (parts.length !== 4) return 0;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
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

  // Check except list
  if (Array.isArray(ipBlock.except)) {
    for (const exc of ipBlock.except) {
      if (isIpInCidr(ipStr, exc)) return false;
    }
  }
  return true;
}

class NetworkTracer {
  constructor(resourceGraph) {
    if (!resourceGraph) {
      throw new TypeError('NetworkTracer requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
  }

  /**
   * Resolves a pod parameter (object, name string, or IP string) to a Pod resource
   */
  resolvePod(ref, defaultNamespace = 'default') {
    if (!ref) return null;
    if (typeof ref === 'object') {
      if (ref.kind === 'Pod') return ref;
      if (ref.name) {
        return this.graph.get('Pod', ref.namespace || defaultNamespace, ref.name);
      }
    }
    if (typeof ref === 'string') {
      // Check if IP
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ref)) {
        const pods = this.graph.list({ kind: 'Pod' });
        return pods.find((p) => p.status && p.status.podIP === ref) || null;
      }
      // Check if namespace/name or name
      if (ref.includes('/')) {
        const [ns, name] = ref.split('/');
        return this.graph.get('Pod', ns, name);
      }
      return this.graph.get('Pod', defaultNamespace, ref);
    }
    return null;
  }

  /**
   * Evaluates whether egress traffic from srcPod to dstPod is allowed
   */
  evaluateEgress(srcPod, dstPod, port, protocol) {
    const ns = srcPod.metadata.namespace || 'default';
    const policies = this.graph.list({ kind: 'NetworkPolicy', namespace: ns });

    // Find policies that select srcPod
    const selectingPolicies = policies.filter((p) => {
      const podSelector = (p.spec && p.spec.podSelector) || {};
      return this.graph.matchesLabelSelector(srcPod, podSelector);
    });

    // Check if srcPod is isolated for Egress
    const egressPolicies = selectingPolicies.filter((p) => {
      const types = (p.spec && p.spec.policyTypes) || [];
      return types.includes('Egress') || Boolean(p.spec && p.spec.egress);
    });

    if (egressPolicies.length === 0) {
      return { allowed: true, policyName: null, reason: 'Default-allow (pod is not egress-isolated)' };
    }

    // Check if any policy explicitly allows egress to dstPod on port/protocol
    for (const policy of egressPolicies) {
      const egressRules = (policy.spec && policy.spec.egress) || [];
      // If an egress policy has empty egress: [], it is a default-deny all egress rule!
      for (const rule of egressRules) {
        if (this._matchesRuleEndpoints(rule.to, dstPod, true) && this._matchesRulePorts(rule.ports, port, protocol)) {
          return { allowed: true, policyName: policy.metadata.name, reason: `Allowed by egress rule in "${policy.metadata.name}"` };
        }
      }
    }

    return {
      allowed: false,
      policyName: egressPolicies[0].metadata.name,
      reason: `Egress denied by NetworkPolicy "${egressPolicies[0].metadata.name}" (no matching egress rule)`
    };
  }

  /**
   * Evaluates whether ingress traffic to dstPod from srcPod is allowed
   */
  evaluateIngress(dstPod, srcPod, port, protocol) {
    const ns = dstPod.metadata.namespace || 'default';
    const policies = this.graph.list({ kind: 'NetworkPolicy', namespace: ns });

    // Find policies that select dstPod
    const selectingPolicies = policies.filter((p) => {
      const podSelector = (p.spec && p.spec.podSelector) || {};
      return this.graph.matchesLabelSelector(dstPod, podSelector);
    });

    // Check if dstPod is isolated for Ingress
    const ingressPolicies = selectingPolicies.filter((p) => {
      const types = (p.spec && p.spec.policyTypes) || [];
      return types.includes('Ingress') || (types.length === 0 && Boolean(p.spec && p.spec.ingress)) || types.length === 0;
    });

    if (ingressPolicies.length === 0) {
      return { allowed: true, policyName: null, reason: 'Default-allow (pod is not ingress-isolated)' };
    }

    // Check if any policy explicitly allows ingress from srcPod on port/protocol
    for (const policy of ingressPolicies) {
      const ingressRules = (policy.spec && policy.spec.ingress) || [];
      // Empty ingress: [] means deny all ingress!
      for (const rule of ingressRules) {
        if (this._matchesRuleEndpoints(rule.from, srcPod, false) && this._matchesRulePorts(rule.ports, port, protocol)) {
          return { allowed: true, policyName: policy.metadata.name, reason: `Allowed by ingress rule in "${policy.metadata.name}"` };
        }
      }
    }

    return {
      allowed: false,
      policyName: ingressPolicies[0].metadata.name,
      reason: `Ingress denied by NetworkPolicy "${ingressPolicies[0].metadata.name}" (no matching ingress rule)`
    };
  }

  _matchesRuleEndpoints(peers, targetPod, isEgress) {
    if (!peers || !Array.isArray(peers) || peers.length === 0) {
      // If from/to list is empty/omitted, all sources/destinations are allowed!
      return true;
    }

    const targetNs = targetPod.metadata.namespace || 'default';
    const targetIp = (targetPod.status && targetPod.status.podIP) || '';

    return peers.some((peer) => {
      // 1. IPBlock match
      if (peer.ipBlock) {
        if (matchesIpBlock(targetIp, peer.ipBlock)) return true;
      }

      // 2. NamespaceSelector and/or PodSelector
      const hasNsSelector = Boolean(peer.namespaceSelector);
      const hasPodSelector = Boolean(peer.podSelector);

      if (hasNsSelector && hasPodSelector) {
        // Both: target pod must match podSelector AND its namespace must match namespaceSelector
        const nsObj = this.graph.get('Namespace', null, targetNs);
        if (!nsObj || !this.graph.matchesLabelSelector(nsObj, peer.namespaceSelector)) return false;
        return this.graph.matchesLabelSelector(targetPod, peer.podSelector);
      }

      if (hasNsSelector) {
        // NamespaceSelector alone: matches all pods in matching namespaces
        const nsObj = this.graph.get('Namespace', null, targetNs);
        return nsObj && this.graph.matchesLabelSelector(nsObj, peer.namespaceSelector);
      }

      if (hasPodSelector) {
        // PodSelector alone: matches pods in the same namespace
        return this.graph.matchesLabelSelector(targetPod, peer.podSelector);
      }

      return false;
    });
  }

  _matchesRulePorts(rulePorts, port, protocol) {
    if (!rulePorts || !Array.isArray(rulePorts) || rulePorts.length === 0) {
      return true;
    }
    const normProto = String(protocol || 'TCP').toUpperCase();
    const targetPortNum = Number(port || 80);

    return rulePorts.some((rp) => {
      const pProto = String(rp.protocol || 'TCP').toUpperCase();
      if (pProto !== normProto) return false;

      if (rp.port === undefined || rp.port === null) return true;
      if (typeof rp.port === 'number' || /^\d+$/.test(String(rp.port))) {
        return Number(rp.port) === targetPortNum;
      }
      // Named port matching
      return String(rp.port) === String(port);
    });
  }

  /**
   * Traces an end-to-end packet through the virtual CNI network fabric
   * @param {object} options { src, dst, port = 80, protocol = 'TCP' }
   * @returns {{ allowed: boolean, dropReason?: string, hops: Array<object> }}
   */
  tracePacket({ src, dst, port = 80, protocol = 'TCP' }) {
    const srcPod = this.resolvePod(src);
    const dstPod = this.resolvePod(dst);
    const hops = [];

    if (!srcPod) {
      return {
        allowed: false,
        dropReason: 'Source pod not found in cluster graph',
        hops: [{ stage: 'SRC_RESOLVE', component: 'DNS/Cluster', action: 'DROP', reason: 'Source pod not found' }]
      };
    }
    if (!dstPod) {
      return {
        allowed: false,
        dropReason: 'Destination pod not found in cluster graph',
        hops: [{ stage: 'DST_RESOLVE', component: 'DNS/Cluster', action: 'DROP', reason: 'Destination pod not found' }]
      };
    }

    const srcUidShort = (srcPod.metadata.uid || '0000').slice(0, 6);
    const dstUidShort = (dstPod.metadata.uid || '0000').slice(0, 6);
    const srcNode = srcPod.status && srcPod.status.nodeName ? srcPod.status.nodeName : 'kubelabs-worker-01';
    const dstNode = dstPod.status && dstPod.status.nodeName ? dstPod.status.nodeName : 'kubelabs-worker-01';
    const isCrossNode = srcNode !== dstNode;

    // Hop 1: Source Pod Network Namespace
    hops.push({
      stage: 'SOURCE_NETNS',
      component: `cni-${srcUidShort}/eth0`,
      action: 'ALLOW',
      reason: `Packet emitted from ${srcPod.status.podIP} via default gateway`
    });

    // Hop 2: Source Node veth Pair & Bridge
    hops.push({
      stage: 'VETH_BRIDGE',
      component: `${srcNode}:veth${srcUidShort} -> cbr0`,
      action: 'ALLOW',
      reason: 'Frame forwarded across virtual ethernet pair to node bridge'
    });

    // Hop 3: Egress NetworkPolicy Filter
    const egressVerdict = this.evaluateEgress(srcPod, dstPod, port, protocol);
    hops.push({
      stage: 'EGRESS_POLICY',
      component: `${srcPod.metadata.namespace}/${srcPod.metadata.name}`,
      action: egressVerdict.allowed ? 'ALLOW' : 'DROP',
      reason: egressVerdict.reason
    });

    if (!egressVerdict.allowed) {
      return {
        allowed: false,
        dropReason: egressVerdict.reason,
        hops
      };
    }

    // Hop 4: Fabric Routing (Intra-node vs Overlay VXLAN tunnel)
    if (isCrossNode) {
      hops.push({
        stage: 'FABRIC_ROUTING',
        component: `VXLAN Overlay: ${srcNode} -> ${dstNode}`,
        action: 'ALLOW',
        reason: 'Inter-node overlay encapsulated UDP packet routed to target host'
      });
    } else {
      hops.push({
        stage: 'FABRIC_ROUTING',
        component: `Local Bridge: ${srcNode}:cbr0`,
        action: 'ALLOW',
        reason: 'Intra-node bridge switching directly to local destination veth'
      });
    }

    // Hop 5: Destination Node Bridge & veth Pair
    hops.push({
      stage: 'DESTINATION_BRIDGE',
      component: `${dstNode}:cbr0 -> veth${dstUidShort}`,
      action: 'ALLOW',
      reason: `Frame received on bridge and delivered to veth${dstUidShort}`
    });

    // Hop 6: Ingress NetworkPolicy Filter
    const ingressVerdict = this.evaluateIngress(dstPod, srcPod, port, protocol);
    hops.push({
      stage: 'INGRESS_POLICY',
      component: `${dstPod.metadata.namespace}/${dstPod.metadata.name}`,
      action: ingressVerdict.allowed ? 'ALLOW' : 'DROP',
      reason: ingressVerdict.reason
    });

    if (!ingressVerdict.allowed) {
      return {
        allowed: false,
        dropReason: ingressVerdict.reason,
        hops
      };
    }

    // Hop 7: Destination Pod NetNS
    hops.push({
      stage: 'DESTINATION_NETNS',
      component: `cni-${dstUidShort}/eth0`,
      action: 'ALLOW',
      reason: `Packet accepted by listener on port ${port}/${protocol}`
    });

    return {
      allowed: true,
      dropReason: null,
      hops
    };
  }

  /**
   * Formats trace hops into clear ASCII diagnostic representation
   */
  formatTrace(traceResult) {
    if (!traceResult || !Array.isArray(traceResult.hops)) return '';
    const lines = [];
    lines.push('================================================================================');
    lines.push(` KUBELABS CNI PACKET TRACER VERDICT: ${traceResult.allowed ? 'ALLOWED (200 OK)' : 'DROPPED (BLOCKED)'}`);
    if (traceResult.dropReason) {
      lines.push(` DROP REASON: ${traceResult.dropReason}`);
    }
    lines.push('--------------------------------------------------------------------------------');
    lines.push(' HOP | STAGE              | ACTION | COMPONENT                      | DETAILS');
    lines.push('--------------------------------------------------------------------------------');

    traceResult.hops.forEach((h, idx) => {
      const hopNum = String(idx + 1).padStart(3, ' ');
      const stage = h.stage.padEnd(18, ' ');
      const action = h.action.padEnd(6, ' ');
      const comp = h.component.slice(0, 30).padEnd(30, ' ');
      lines.push(` ${hopNum} | ${stage} | ${action} | ${comp} | ${h.reason}`);
    });
    lines.push('================================================================================');
    return lines.join('\n');
  }
}

// Dual CommonJS & Browser export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NetworkTracer,
    ipToInt,
    isIpInCidr,
    matchesIpBlock
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.NetworkTracer = NetworkTracer;
  globalThis.ipToInt = ipToInt;
  globalThis.isIpInCidr = isIpInCidr;
  globalThis.matchesIpBlock = matchesIpBlock;
}
