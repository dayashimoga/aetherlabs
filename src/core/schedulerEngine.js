'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Kubernetes Scheduler Engine
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
// Resource Parsing Utilities (CPU, Memory, Storage)
// ---------------------------------------------------------------------------

/**
 * Parses Kubernetes CPU quantity strings into millicores (integer).
 * Examples: '1' -> 1000, '500m' -> 500, '2.5' -> 2500, '100m' -> 100
 */
function parseCpu(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const str = String(raw).trim();
  if (str.endsWith('m')) {
    return parseInt(str.slice(0, -1), 10) || 0;
  }
  const floatVal = parseFloat(str);
  return isNaN(floatVal) ? 0 : Math.round(floatVal * 1000);
}

/**
 * Parses Kubernetes Memory quantity strings into bytes (integer).
 * Examples: '128Mi' -> 134217728, '1Gi' -> 1073741824, '500M' -> 500000000, '1024Ki' -> 1048576
 */
function parseMemory(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const str = String(raw).trim();

  // Binary SI prefixes (powers of 1024)
  if (str.endsWith('Ki')) return Math.round(parseFloat(str.slice(0, -2)) * 1024);
  if (str.endsWith('Mi')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024);
  if (str.endsWith('Gi')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024 * 1024);
  if (str.endsWith('Ti')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024 * 1024 * 1024);
  if (str.endsWith('Pi')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024 * 1024 * 1024 * 1024);

  // Decimal SI prefixes (powers of 1000)
  if (str.endsWith('k') || str.endsWith('K')) return Math.round(parseFloat(str.slice(0, -1)) * 1000);
  if (str.endsWith('M')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000);
  if (str.endsWith('G')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000 * 1000);
  if (str.endsWith('T')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000 * 1000 * 1000);

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

// ---------------------------------------------------------------------------
// Standard System Priority Classes
// ---------------------------------------------------------------------------

const SYSTEM_PRIORITY_CLASSES = {
  'system-node-critical': 2000001000,
  'system-cluster-critical': 2000000000,
  'high-priority': 10000,
  'medium-priority': 5000,
  'low-priority': 1000,
  'default-priority': 0
};

// ---------------------------------------------------------------------------
// SchedulerEngine Class
// ---------------------------------------------------------------------------

class SchedulerEngine {
  constructor(resourceGraph, options = {}) {
    if (!resourceGraph) {
      throw new TypeError('SchedulerEngine requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
    this.options = options;
    this.isScheduling = false;

    // Default node allocatable resources if not specified on Node
    this.defaultNodeAllocatable = {
      cpu: 4000, // 4000 millicores = 4 CPU cores
      memory: 16 * 1024 * 1024 * 1024, // 16 GiB
      pods: 110
    };

    // Auto-subscribe to resource graph additions
    this._unsubAdded = this.graph.on('Added', (res) => {
      if (res && res.kind === 'Pod') {
        this.schedulePod(res);
      }
    });
  }

  destroy() {
    if (this._unsubAdded) this._unsubAdded();
  }

  // -------------------------------------------------------------------------
  // 1. ADMISSION HOOKS (ResourceQuota & LimitRange)
  // -------------------------------------------------------------------------

  /**
   * Applies LimitRange defaults and verifies container min/max boundaries
   * @param {object} pod
   * @returns {{ allowed: boolean, reason?: string, pod: object }}
   */
  evaluateLimitRange(pod) {
    const ns = pod.metadata?.namespace || 'default';
    const limitRanges = this.graph.list({ kind: 'LimitRange', namespace: ns });

    if (!limitRanges || limitRanges.length === 0) {
      return { allowed: true, pod };
    }

    const mutatedPod = structuredClone ? structuredClone(pod) : JSON.parse(JSON.stringify(pod));
    mutatedPod.spec = mutatedPod.spec || {};
    const containers = mutatedPod.spec.containers || [];

    for (const lr of limitRanges) {
      const limits = lr.spec?.limits || [];
      for (const item of limits) {
        if (item.type === 'Container') {
          for (const c of containers) {
            c.resources = c.resources || {};
            c.resources.requests = c.resources.requests || {};
            c.resources.limits = c.resources.limits || {};

            // Apply default requests if not specified
            if (item.defaultRequest) {
              if (!c.resources.requests.cpu && item.defaultRequest.cpu) {
                c.resources.requests.cpu = item.defaultRequest.cpu;
              }
              if (!c.resources.requests.memory && item.defaultRequest.memory) {
                c.resources.requests.memory = item.defaultRequest.memory;
              }
            }

            // Apply default limits if not specified
            if (item.default) {
              if (!c.resources.limits.cpu && item.default.cpu) {
                c.resources.limits.cpu = item.default.cpu;
              }
              if (!c.resources.limits.memory && item.default.memory) {
                c.resources.limits.memory = item.default.memory;
              }
            }

            // Check min boundaries
            if (item.min) {
              if (item.min.cpu && parseCpu(c.resources.requests.cpu) < parseCpu(item.min.cpu)) {
                return {
                  allowed: false,
                  reason: `container "${c.name}" cpu request (${c.resources.requests.cpu}) is less than minimum (${item.min.cpu})`,
                  pod
                };
              }
              if (item.min.memory && parseMemory(c.resources.requests.memory) < parseMemory(item.min.memory)) {
                return {
                  allowed: false,
                  reason: `container "${c.name}" memory request (${c.resources.requests.memory}) is less than minimum (${item.min.memory})`,
                  pod
                };
              }
            }

            // Check max boundaries
            if (item.max) {
              if (item.max.cpu && parseCpu(c.resources.limits.cpu || c.resources.requests.cpu) > parseCpu(item.max.cpu)) {
                return {
                  allowed: false,
                  reason: `container "${c.name}" cpu exceeds maximum (${item.max.cpu})`,
                  pod
                };
              }
              if (item.max.memory && parseMemory(c.resources.limits.memory || c.resources.requests.memory) > parseMemory(item.max.memory)) {
                return {
                  allowed: false,
                  reason: `container "${c.name}" memory exceeds maximum (${item.max.memory})`,
                  pod
                };
              }
            }
          }
        }
      }
    }

    return { allowed: true, pod: mutatedPod };
  }

  /**
   * Enforces ResourceQuota boundaries for pods, CPU, and memory within namespace
   * @param {object} pod
   * @returns {{ allowed: boolean, reason?: string }}
   */
  evaluateResourceQuota(pod) {
    const ns = pod.metadata?.namespace || 'default';
    const quotas = this.graph.list({ kind: 'ResourceQuota', namespace: ns });

    if (!quotas || quotas.length === 0) {
      return { allowed: true };
    }

    // Calculate current usage of non-terminal pods in namespace (excluding incoming pod if already indexed)
    const existingPods = this.graph.list({ kind: 'Pod', namespace: ns })
      .filter((p) => {
        if (pod.metadata?.uid && p.metadata?.uid === pod.metadata.uid) return false;
        if (pod.metadata?.name && p.metadata?.name === pod.metadata.name) return false;
        return p.status?.phase !== 'Succeeded' && p.status?.phase !== 'Failed';
      });

    let usedPods = existingPods.length;
    let usedCpuReq = 0;
    let usedMemReq = 0;
    let usedCpuLimit = 0;
    let usedMemLimit = 0;

    for (const p of existingPods) {
      for (const c of p.spec?.containers || []) {
        usedCpuReq += parseCpu(c.resources?.requests?.cpu);
        usedMemReq += parseMemory(c.resources?.requests?.memory);
        usedCpuLimit += parseCpu(c.resources?.limits?.cpu);
        usedMemLimit += parseMemory(c.resources?.limits?.memory);
      }
    }

    // Calculate incoming pod requests
    let incomingCpuReq = 0;
    let incomingMemReq = 0;
    let incomingCpuLimit = 0;
    let incomingMemLimit = 0;

    for (const c of pod.spec?.containers || []) {
      incomingCpuReq += parseCpu(c.resources?.requests?.cpu);
      incomingMemReq += parseMemory(c.resources?.requests?.memory);
      incomingCpuLimit += parseCpu(c.resources?.limits?.cpu);
      incomingMemLimit += parseMemory(c.resources?.limits?.memory);
    }

    for (const quota of quotas) {
      const hard = quota.spec?.hard || {};

      // Check pods count quota
      if (hard.pods && (usedPods + 1) > parseInt(hard.pods, 10)) {
        return {
          allowed: false,
          reason: `exceeded quota: ${quota.metadata.name}, requested: pods=1, used: pods=${usedPods}, limited: pods=${hard.pods}`
        };
      }

      // Check requests.cpu
      if (hard['requests.cpu']) {
        const hardCpu = parseCpu(hard['requests.cpu']);
        if ((usedCpuReq + incomingCpuReq) > hardCpu) {
          return {
            allowed: false,
            reason: `exceeded quota: ${quota.metadata.name}, requested: requests.cpu=${incomingCpuReq}m, used: requests.cpu=${usedCpuReq}m, limited: requests.cpu=${hard['requests.cpu']}`
          };
        }
      }

      // Check requests.memory
      if (hard['requests.memory']) {
        const hardMem = parseMemory(hard['requests.memory']);
        if ((usedMemReq + incomingMemReq) > hardMem) {
          return {
            allowed: false,
            reason: `exceeded quota: ${quota.metadata.name}, requested: requests.memory=${incomingMemReq} bytes, used: requests.memory=${usedMemReq} bytes, limited: requests.memory=${hard['requests.memory']}`
          };
        }
      }

      // Update quota status used tracking
      quota.status = quota.status || {};
      quota.status.hard = hard;
      quota.status.used = {
        pods: String(usedPods + 1),
        'requests.cpu': `${usedCpuReq + incomingCpuReq}m`,
        'requests.memory': `${usedMemReq + incomingMemReq}`
      };
      this.graph.set(quota, { skipReconcileNotification: true });
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // 2. POD PRIORITY RESOLUTION & PREEMPTION
  // -------------------------------------------------------------------------

  /**
   * Resolves the integer priority of a pod
   */
  getPodPriority(pod) {
    if (typeof pod.spec?.priority === 'number') {
      return pod.spec.priority;
    }

    const className = pod.spec?.priorityClassName;
    if (className) {
      if (className in SYSTEM_PRIORITY_CLASSES) {
        return SYSTEM_PRIORITY_CLASSES[className];
      }
      const pc = this.graph.get('PriorityClass', null, className);
      if (pc && typeof pc.value === 'number') {
        return pc.value;
      }
    }

    return 0; // Default priority
  }

  // -------------------------------------------------------------------------
  // 3. SCHEDULER FILTERING PREDICATES
  // -------------------------------------------------------------------------

  /**
   * Filter 1: Node Unschedulable & Node Conditions (Ready, DiskPressure, etc.)
   */
  filterNodeConditions(node, pod) {
    // If node is cordoned (unschedulable)
    if (node.spec?.unschedulable) {
      const isDaemonSet = (pod.metadata?.ownerReferences || []).some((o) => o.kind === 'DaemonSet');
      const hasCordonToleration = (pod.spec?.tolerations || []).some(
        (t) => t.key === 'node.kubernetes.io/unschedulable'
      );
      if (!isDaemonSet && !hasCordonToleration) {
        return { pass: false, reason: 'Node is unschedulable (cordoned)' };
      }
    }

    // Node Ready condition
    const conditions = node.status?.conditions || [];
    const readyCond = conditions.find((c) => c.type === 'Ready');
    const isReady = readyCond && readyCond.status === 'True';

    if (!isReady) {
      const toleratesNotReady = (pod.spec?.tolerations || []).some(
        (t) => t.key === 'node.kubernetes.io/not-ready' || t.key === 'node.kubernetes.io/unreachable'
      );
      if (!toleratesNotReady) {
        return { pass: false, reason: 'Node is NotReady' };
      }
    }

    // Node pressure conditions
    const memoryPressure = conditions.find((c) => c.type === 'MemoryPressure' && c.status === 'True');
    if (memoryPressure) {
      const tolerates = (pod.spec?.tolerations || []).some((t) => t.key === 'node.kubernetes.io/memory-pressure');
      if (!tolerates) return { pass: false, reason: 'Node has MemoryPressure' };
    }

    const diskPressure = conditions.find((c) => c.type === 'DiskPressure' && c.status === 'True');
    if (diskPressure) {
      const tolerates = (pod.spec?.tolerations || []).some((t) => t.key === 'node.kubernetes.io/disk-pressure');
      if (!tolerates) return { pass: false, reason: 'Node has DiskPressure' };
    }

    const pidPressure = conditions.find((c) => c.type === 'PIDPressure' && c.status === 'True');
    if (pidPressure) {
      const tolerates = (pod.spec?.tolerations || []).some((t) => t.key === 'node.kubernetes.io/pid-pressure');
      if (!tolerates) return { pass: false, reason: 'Node has PIDPressure' };
    }

    return { pass: true };
  }

  /**
   * Filter 2: nodeSelector Matching
   */
  filterNodeSelector(node, pod) {
    const selector = pod.spec?.nodeSelector;
    if (!selector || Object.keys(selector).length === 0) {
      return { pass: true };
    }

    const nodeLabels = node.metadata?.labels || {};
    for (const [k, v] of Object.entries(selector)) {
      if (nodeLabels[k] !== String(v)) {
        return { pass: false, reason: `Node label "${k}=${nodeLabels[k]}" does not match nodeSelector "${k}=${v}"` };
      }
    }

    return { pass: true };
  }

  /**
   * Filter 3: nodeAffinity (requiredDuringSchedulingIgnoredDuringExecution)
   */
  filterNodeAffinity(node, pod) {
    const affinity = pod.spec?.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
    if (!affinity || !Array.isArray(affinity.nodeSelectorTerms) || affinity.nodeSelectorTerms.length === 0) {
      return { pass: true };
    }

    const nodeLabels = node.metadata?.labels || {};

    // nodeSelectorTerms are ORed
    let anyTermMatched = false;
    for (const term of affinity.nodeSelectorTerms) {
      let allExpressionsMatched = true;

      for (const expr of term.matchExpressions || []) {
        const key = expr.key;
        const op = expr.operator;
        const values = (expr.values || []).map(String);
        const nodeVal = nodeLabels[key];

        if (op === 'In') {
          if (!nodeVal || !values.includes(nodeVal)) allExpressionsMatched = false;
        } else if (op === 'NotIn') {
          if (nodeVal && values.includes(nodeVal)) allExpressionsMatched = false;
        } else if (op === 'Exists') {
          if (!(key in nodeLabels)) allExpressionsMatched = false;
        } else if (op === 'DoesNotExist') {
          if (key in nodeLabels) allExpressionsMatched = false;
        } else if (op === 'Gt') {
          if (!nodeVal || parseFloat(nodeVal) <= parseFloat(values[0])) allExpressionsMatched = false;
        } else if (op === 'Lt') {
          if (!nodeVal || parseFloat(nodeVal) >= parseFloat(values[0])) allExpressionsMatched = false;
        }

        if (!allExpressionsMatched) break;
      }

      if (allExpressionsMatched) {
        anyTermMatched = true;
        break;
      }
    }

    if (!anyTermMatched) {
      return { pass: false, reason: 'Node does not match required nodeAffinity selector terms' };
    }

    return { pass: true };
  }

  /**
   * Filter 4: Taints and Tolerations
   */
  filterTaintsAndTolerations(node, pod) {
    const taints = node.spec?.taints || [];
    if (taints.length === 0) {
      return { pass: true };
    }

    const tolerations = pod.spec?.tolerations || [];

    for (const taint of taints) {
      // Only NoSchedule and NoExecute block pod placement
      if (taint.effect !== 'NoSchedule' && taint.effect !== 'NoExecute') {
        continue;
      }

      let isTolerated = false;
      for (const tol of tolerations) {
        // Toleration matches all taints if empty key and Exists
        if (!tol.key && tol.operator === 'Exists') {
          isTolerated = true;
          break;
        }

        if (tol.key === taint.key) {
          const operator = tol.operator || 'Equal';
          const effectMatches = !tol.effect || tol.effect === taint.effect;

          if (operator === 'Exists' && effectMatches) {
            isTolerated = true;
            break;
          }
          if (operator === 'Equal' && tol.value === taint.value && effectMatches) {
            isTolerated = true;
            break;
          }
        }
      }

      if (!isTolerated) {
        return { pass: false, reason: `Node taint "${taint.key}=${taint.value}:${taint.effect}" not tolerated` };
      }
    }

    return { pass: true };
  }

  /**
   * Filter 5: Pod Affinity & Pod Anti-Affinity (requiredDuringScheduling)
   */
  filterPodAffinityAndAntiAffinity(node, pod, allScheduledPods) {
    const affinity = pod.spec?.affinity;
    if (!affinity) return { pass: true };

    const nodeLabels = node.metadata?.labels || {};

    // 1. Pod Affinity (Required)
    const requiredAffinity = affinity.podAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
    if (requiredAffinity && Array.isArray(requiredAffinity)) {
      for (const term of requiredAffinity) {
        const topKey = term.topologyKey || 'kubernetes.io/hostname';
        const nodeDomainVal = nodeLabels[topKey];
        if (!nodeDomainVal) {
          return { pass: false, reason: `Node lacks topologyKey "${topKey}" for required podAffinity` };
        }

        // Must find at least one matching pod in the same topology domain
        const hasCoLocatedPod = allScheduledPods.some((p) => {
          const pNode = this.graph.get('Node', null, p.spec?.nodeName);
          if (!pNode || pNode.metadata?.labels?.[topKey] !== nodeDomainVal) return false;
          return this._matchesPodSelector(p, term.labelSelector, term.namespaces, pod.metadata?.namespace);
        });

        if (!hasCoLocatedPod) {
          return { pass: false, reason: `Required podAffinity not satisfied in topology domain "${topKey}=${nodeDomainVal}"` };
        }
      }
    }

    // 2. Pod Anti-Affinity (Required)
    const requiredAntiAffinity = affinity.podAntiAffinity?.requiredDuringSchedulingIgnoredDuringExecution;
    if (requiredAntiAffinity && Array.isArray(requiredAntiAffinity)) {
      for (const term of requiredAntiAffinity) {
        const topKey = term.topologyKey || 'kubernetes.io/hostname';
        const nodeDomainVal = nodeLabels[topKey];
        if (!nodeDomainVal) continue;

        // Must NOT find any matching pod in the same topology domain
        const hasCollidingPod = allScheduledPods.some((p) => {
          const pNode = this.graph.get('Node', null, p.spec?.nodeName);
          if (!pNode || pNode.metadata?.labels?.[topKey] !== nodeDomainVal) return false;
          return this._matchesPodSelector(p, term.labelSelector, term.namespaces, pod.metadata?.namespace);
        });

        if (hasCollidingPod) {
          return { pass: false, reason: `Required podAntiAffinity collision in topology domain "${topKey}=${nodeDomainVal}"` };
        }
      }
    }

    return { pass: true };
  }

  _matchesPodSelector(targetPod, selector, namespaces, fallbackNamespace) {
    const targetNs = targetPod.metadata?.namespace || 'default';
    if (namespaces && namespaces.length > 0) {
      if (!namespaces.includes(targetNs)) return false;
    } else if (fallbackNamespace && targetNs !== fallbackNamespace) {
      return false;
    }

    if (!selector) return true;
    return this.graph.matchesLabelSelector(targetPod, selector);
  }

  /**
   * Filter 6: Node Resources (Allocatable CPU & Memory vs Requests)
   */
  filterNodeResources(node, pod, podsOnNode) {
    const alloc = node.status?.allocatable || {};
    const totalCpu = parseCpu(alloc.cpu) || this.defaultNodeAllocatable.cpu;
    const totalMem = parseMemory(alloc.memory) || this.defaultNodeAllocatable.memory;
    const maxPods = parseInt(alloc.pods, 10) || this.defaultNodeAllocatable.pods;

    if (podsOnNode.length + 1 > maxPods) {
      return { pass: false, reason: `Too many pods on node (max: ${maxPods})` };
    }

    let usedCpu = 0;
    let usedMem = 0;
    for (const p of podsOnNode) {
      for (const c of p.spec?.containers || []) {
        usedCpu += parseCpu(c.resources?.requests?.cpu);
        usedMem += parseMemory(c.resources?.requests?.memory);
      }
    }

    let reqCpu = 0;
    let reqMem = 0;
    for (const c of pod.spec?.containers || []) {
      reqCpu += parseCpu(c.resources?.requests?.cpu);
      reqMem += parseMemory(c.resources?.requests?.memory);
    }

    if ((usedCpu + reqCpu) > totalCpu) {
      return { pass: false, reason: `Insufficient cpu: requested ${reqCpu}m, available ${totalCpu - usedCpu}m` };
    }

    if ((usedMem + reqMem) > totalMem) {
      return { pass: false, reason: `Insufficient memory: requested ${reqMem} bytes, available ${totalMem - usedMem} bytes` };
    }

    return { pass: true };
  }

  /**
   * Filter 7: Topology Spread Constraints (whenUnsatisfiable: DoNotSchedule)
   */
  filterTopologySpreadConstraints(node, pod, allScheduledPods, allNodes) {
    const constraints = pod.spec?.topologySpreadConstraints || [];
    const hardConstraints = constraints.filter((c) => c.whenUnsatisfiable === 'DoNotSchedule');

    if (hardConstraints.length === 0) return { pass: true };

    for (const constraint of hardConstraints) {
      const topKey = constraint.topologyKey;
      const maxSkew = constraint.maxSkew || 1;
      const nodeDomain = node.metadata?.labels?.[topKey];
      if (!nodeDomain) return { pass: false, reason: `Node lacks topologyKey "${topKey}"` };

      // Identify all unique domains across available nodes
      const allDomains = new Set();
      for (const n of allNodes) {
        const dom = n.metadata?.labels?.[topKey];
        if (dom) allDomains.add(dom);
      }

      // Count matching pods per domain
      const countsByDomain = new Map();
      for (const dom of allDomains) countsByDomain.set(dom, 0);

      for (const p of allScheduledPods) {
        const pNode = this.graph.get('Node', null, p.spec?.nodeName);
        const dom = pNode?.metadata?.labels?.[topKey];
        if (dom && countsByDomain.has(dom)) {
          if (this.graph.matchesLabelSelector(p, constraint.labelSelector)) {
            countsByDomain.set(dom, countsByDomain.get(dom) + 1);
          }
        }
      }

      // Simulate placing pod in candidate node's domain
      const candidateCount = (countsByDomain.get(nodeDomain) || 0) + 1;
      const minCount = Math.min(...Array.from(countsByDomain.values()));
      const skew = candidateCount - minCount;

      if (skew > maxSkew) {
        return { pass: false, reason: `Topology spread constraint violated for "${topKey}" (skew ${skew} > maxSkew ${maxSkew})` };
      }
    }

    return { pass: true };
  }

  // -------------------------------------------------------------------------
  // 4. SCHEDULER SCORING (Priorities)
  // -------------------------------------------------------------------------

  /**
   * Scores feasible nodes based on preferred affinity, topology spread, and resource balance
   */
  scoreNode(node, pod, podsOnNode, allScheduledPods, allNodes) {
    let score = 50; // Neutral baseline score

    const nodeLabels = node.metadata?.labels || {};

    // 1. Preferred Node Affinity
    const preferredNodeAffinity = pod.spec?.affinity?.nodeAffinity?.preferredDuringSchedulingIgnoredDuringExecution || [];
    for (const term of preferredNodeAffinity) {
      const weight = term.weight || 1;
      let matched = true;
      for (const expr of term.preference?.matchExpressions || []) {
        const val = nodeLabels[expr.key];
        if (expr.operator === 'In' && (!val || !expr.values.includes(val))) matched = false;
        if (expr.operator === 'Exists' && !(expr.key in nodeLabels)) matched = false;
        if (!matched) break;
      }
      if (matched) score += weight;
    }

    // 2. Topology Spread Soft Scoring (ScheduleAnyway)
    const softTopologyConstraints = (pod.spec?.topologySpreadConstraints || []).filter(
      (c) => c.whenUnsatisfiable === 'ScheduleAnyway' || !c.whenUnsatisfiable
    );
    for (const constraint of softTopologyConstraints) {
      const topKey = constraint.topologyKey;
      const nodeDomain = nodeLabels[topKey];
      if (nodeDomain) {
        const countInDomain = allScheduledPods.filter((p) => {
          const pNode = this.graph.get('Node', null, p.spec?.nodeName);
          return pNode?.metadata?.labels?.[topKey] === nodeDomain && this.graph.matchesLabelSelector(p, constraint.labelSelector);
        }).length;
        score += Math.max(0, 30 - (countInDomain * 5));
      }
    }

    // 3. Balanced Resource Utilization
    const alloc = node.status?.allocatable || {};
    const totalCpu = parseCpu(alloc.cpu) || this.defaultNodeAllocatable.cpu;
    const totalMem = parseMemory(alloc.memory) || this.defaultNodeAllocatable.memory;

    let usedCpu = 0;
    let usedMem = 0;
    for (const p of podsOnNode) {
      for (const c of p.spec?.containers || []) {
        usedCpu += parseCpu(c.resources?.requests?.cpu);
        usedMem += parseMemory(c.resources?.requests?.memory);
      }
    }

    const cpuFraction = totalCpu > 0 ? usedCpu / totalCpu : 0;
    const memFraction = totalMem > 0 ? usedMem / totalMem : 0;
    const diff = Math.abs(cpuFraction - memFraction);
    score += Math.round((1 - diff) * 20);

    return score;
  }

  // -------------------------------------------------------------------------
  // 5. PREEMPTION ENGINE
  // -------------------------------------------------------------------------

  /**
   * Attempts preemption of lower-priority pods to make room for a higher-priority pod
   */
  attemptPreemption(pod, allNodes, allScheduledPods) {
    const podPriority = this.getPodPriority(pod);
    if (podPriority <= 0) {
      return null; // Pods with default/zero priority cannot preempt
    }

    for (const node of allNodes) {
      // Basic node check
      if (!this.filterNodeConditions(node, pod).pass) continue;
      if (!this.filterNodeSelector(node, pod).pass) continue;
      if (!this.filterNodeAffinity(node, pod).pass) continue;
      if (!this.filterTaintsAndTolerations(node, pod).pass) continue;

      const nodeName = node.metadata.name;
      const podsOnNode = allScheduledPods.filter((p) => p.spec?.nodeName === nodeName);

      // Identify victim candidates with lower priority
      const victims = podsOnNode
        .filter((p) => this.getPodPriority(p) < podPriority)
        .sort((a, b) => this.getPodPriority(a) - this.getPodPriority(b)); // Lowest priority first

      if (victims.length === 0) continue;

      // Simulate evicting victims until pod fits
      let remainingPods = [...podsOnNode];
      const selectedVictims = [];

      for (const victim of victims) {
        selectedVictims.push(victim);
        remainingPods = remainingPods.filter((p) => p.metadata.uid !== victim.metadata.uid);

        if (this.filterNodeResources(node, pod, remainingPods).pass) {
          // Found feasible preemption candidate!
          // Evict selected victims
          for (const v of selectedVictims) {
            v.status = v.status || {};
            v.status.phase = 'Failed';
            v.status.reason = 'Preempted';
            v.status.message = `Preempted by higher-priority pod ${pod.metadata?.name}`;
            delete v.spec.nodeName;
            this.graph.set(v, { skipReconcileNotification: true });
          }

          return { node, preemptedCount: selectedVictims.length };
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // 6. MAIN SCHEDULING PIPELINE
  // -------------------------------------------------------------------------

  /**
   * Schedules a single pod onto the optimal node
   * @param {object} rawPod
   * @returns {{ scheduled: boolean, nodeName?: string, reason?: string }}
   */
  schedulePod(rawPod) {
    if (!rawPod || rawPod.kind !== 'Pod') return { scheduled: false, reason: 'Not a pod' };
    if (rawPod.spec?.nodeName) {
      return { scheduled: true, nodeName: rawPod.spec.nodeName, reason: 'Already scheduled' };
    }

    // Phase 1: LimitRange Mutation & Validation
    const lrResult = this.evaluateLimitRange(rawPod);
    if (!lrResult.allowed) {
      rawPod.status = { phase: 'Failed', reason: 'LimitRangeExceeded', message: lrResult.reason };
      this.graph.set(rawPod, { skipReconcileNotification: true });
      return { scheduled: false, reason: lrResult.reason };
    }
    const pod = lrResult.pod;

    // Phase 2: ResourceQuota Validation
    const rqResult = this.evaluateResourceQuota(pod);
    if (!rqResult.allowed) {
      pod.status = { phase: 'Failed', reason: 'ResourceQuotaExceeded', message: rqResult.reason };
      this.graph.set(pod, { skipReconcileNotification: true });
      return { scheduled: false, reason: rqResult.reason };
    }

    // Phase 3: Gather Cluster State
    const allNodes = this.graph.list({ kind: 'Node' });
    if (!allNodes || allNodes.length === 0) {
      pod.status = { phase: 'Pending', reason: 'NoNodesAvailable', message: '0/0 nodes available: no nodes in cluster' };
      this.graph.set(pod, { skipReconcileNotification: true });
      return { scheduled: false, reason: 'No nodes in cluster' };
    }

    const allScheduledPods = this.graph.list({ kind: 'Pod' })
      .filter((p) => p.spec?.nodeName && p.status?.phase !== 'Succeeded' && p.status?.phase !== 'Failed');

    // Group pods by node
    const podsByNode = new Map();
    for (const n of allNodes) podsByNode.set(n.metadata.name, []);
    for (const p of allScheduledPods) {
      const arr = podsByNode.get(p.spec.nodeName);
      if (arr) arr.push(p);
    }

    // Phase 4: Filtering (Predicates)
    const feasibleNodes = [];
    const filterFailures = new Map();

    for (const node of allNodes) {
      const nodeName = node.metadata.name;
      const nodePods = podsByNode.get(nodeName) || [];

      const cond = this.filterNodeConditions(node, pod);
      if (!cond.pass) { filterFailures.set(nodeName, cond.reason); continue; }

      const selector = this.filterNodeSelector(node, pod);
      if (!selector.pass) { filterFailures.set(nodeName, selector.reason); continue; }

      const affinity = this.filterNodeAffinity(node, pod);
      if (!affinity.pass) { filterFailures.set(nodeName, affinity.reason); continue; }

      const taints = this.filterTaintsAndTolerations(node, pod);
      if (!taints.pass) { filterFailures.set(nodeName, taints.reason); continue; }

      const podAff = this.filterPodAffinityAndAntiAffinity(node, pod, allScheduledPods);
      if (!podAff.pass) { filterFailures.set(nodeName, podAff.reason); continue; }

      const resources = this.filterNodeResources(node, pod, nodePods);
      if (!resources.pass) { filterFailures.set(nodeName, resources.reason); continue; }

      const spread = this.filterTopologySpreadConstraints(node, pod, allScheduledPods, allNodes);
      if (!spread.pass) { filterFailures.set(nodeName, spread.reason); continue; }

      feasibleNodes.push(node);
    }

    // If 0 nodes feasible, attempt preemption
    if (feasibleNodes.length === 0) {
      const preemption = this.attemptPreemption(pod, allNodes, allScheduledPods);
      if (preemption) {
        feasibleNodes.push(preemption.node);
      } else {
        const reasons = Array.from(filterFailures.entries()).map(([k, v]) => `${k}: ${v}`).join(', ');
        pod.status = {
          phase: 'Pending',
          reason: 'Unschedulable',
          message: `0/${allNodes.length} nodes available: ${reasons || 'all nodes filtered out'}`
        };
        this.graph.set(pod, { skipReconcileNotification: true });
        return { scheduled: false, reason: pod.status.message };
      }
    }

    // Phase 5: Scoring (Priorities)
    let bestNode = feasibleNodes[0];
    let bestScore = -1;

    for (const node of feasibleNodes) {
      const nodePods = podsByNode.get(node.metadata.name) || [];
      const score = this.scoreNode(node, pod, nodePods, allScheduledPods, allNodes);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    // Phase 6: Binding
    pod.spec.nodeName = bestNode.metadata.name;
    pod.status = pod.status || {};
    pod.status.phase = 'Running';
    pod.status.conditions = [
      { type: 'PodScheduled', status: 'True', reason: 'Scheduled', lastTransitionTime: new Date().toISOString() },
      { type: 'Initialized', status: 'True', lastTransitionTime: new Date().toISOString() },
      { type: 'ContainersReady', status: 'True', lastTransitionTime: new Date().toISOString() },
      { type: 'Ready', status: 'True', lastTransitionTime: new Date().toISOString() }
    ];

    this.graph.set(pod);
    return { scheduled: true, nodeName: bestNode.metadata.name, score: bestScore };
  }

  /**
   * Iterates through all Pending pods in the cluster and schedules them
   */
  scheduleAllPending() {
    const pendingPods = this.graph.list({ kind: 'Pod' })
      .filter((p) => !p.spec?.nodeName && (!p.status || p.status.phase === 'Pending'));

    const results = [];
    for (const p of pendingPods) {
      results.push(this.schedulePod(p));
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // 7. POD DISRUPTION BUDGET & NODE DRAIN SIMULATION
  // -------------------------------------------------------------------------

  /**
   * Checks if evicting the given pod violates any PodDisruptionBudget in its namespace
   */
  evaluatePodDisruptionBudget(pod) {
    const ns = pod.metadata?.namespace || 'default';
    const pdbs = this.graph.list({ kind: 'PodDisruptionBudget', namespace: ns });

    if (!pdbs || pdbs.length === 0) {
      return { allowed: true };
    }

    const allPodsInNs = this.graph.list({ kind: 'Pod', namespace: ns });

    for (const pdb of pdbs) {
      const selector = pdb.spec?.selector;
      if (!this.graph.matchesLabelSelector(pod, selector)) continue;

      // Count healthy matching pods in namespace
      const matchingPods = allPodsInNs.filter(
        (p) => this.graph.matchesLabelSelector(p, selector) && p.status?.phase === 'Running'
      );

      const totalHealthy = matchingPods.length;
      let minAvailable = pdb.spec?.minAvailable;
      let maxUnavailable = pdb.spec?.maxUnavailable;

      if (minAvailable !== undefined) {
        const minReq = typeof minAvailable === 'string' && minAvailable.endsWith('%')
          ? Math.ceil((parseInt(minAvailable, 10) / 100) * totalHealthy)
          : parseInt(minAvailable, 10);

        if ((totalHealthy - 1) < minReq) {
          return {
            allowed: false,
            reason: `Cannot evict pod: would violate PodDisruptionBudget "${pdb.metadata.name}" (minAvailable: ${minReq}, healthy: ${totalHealthy})`
          };
        }
      }

      if (maxUnavailable !== undefined) {
        const maxUnavail = typeof maxUnavailable === 'string' && maxUnavailable.endsWith('%')
          ? Math.floor((parseInt(maxUnavailable, 10) / 100) * totalHealthy)
          : parseInt(maxUnavailable, 10);

        // Currently unavailable pods
        const unavailable = allPodsInNs.filter(
          (p) => this.graph.matchesLabelSelector(p, selector) && p.status?.phase !== 'Running'
        ).length;

        if ((unavailable + 1) > maxUnavail) {
          return {
            allowed: false,
            reason: `Cannot evict pod: would violate PodDisruptionBudget "${pdb.metadata.name}" (maxUnavailable: ${maxUnavail}, unavailable: ${unavailable})`
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Simulates `kubectl drain <node>` with PDB validation and DaemonSet exemptions
   * @param {string} nodeName
   * @param {object} options { ignoreDaemonSets = false, force = false }
   */
  drainNode(nodeName, options = {}) {
    const node = this.graph.get('Node', null, nodeName);
    if (!node) {
      throw new Error(`Node "${nodeName}" not found`);
    }

    // Step 1: Cordon the node
    node.spec = node.spec || {};
    node.spec.unschedulable = true;
    this.graph.set(node);

    // Step 2: Identify pods on the node
    const podsOnNode = this.graph.list({ kind: 'Pod' })
      .filter((p) => p.spec?.nodeName === nodeName);

    const evicted = [];
    const skipped = [];

    for (const pod of podsOnNode) {
      const isDaemonSet = (pod.metadata?.ownerReferences || []).some((o) => o.kind === 'DaemonSet');
      if (isDaemonSet) {
        if (!options.ignoreDaemonSets) {
          return {
            success: false,
            error: `Cannot delete DaemonSet-managed Pods (use --ignore-daemonsets): ${pod.metadata.name}`,
            evicted,
            skipped
          };
        }
        skipped.push(pod.metadata.name);
        continue;
      }

      // Step 3: Check PDB unless forced
      if (!options.force) {
        const pdbCheck = this.evaluatePodDisruptionBudget(pod);
        if (!pdbCheck.allowed) {
          return {
            success: false,
            error: pdbCheck.reason,
            evicted,
            skipped
          };
        }
      }

      // Step 4: Evict & Re-schedule pod
      delete pod.spec.nodeName;
      pod.status = { phase: 'Pending', reason: 'EvictedDuringDrain' };
      this.graph.set(pod, { skipReconcileNotification: true });
      this.schedulePod(pod);
      evicted.push(pod.metadata.name);
    }

    return {
      success: true,
      nodeName,
      evicted,
      skipped
    };
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SchedulerEngine,
    parseCpu,
    parseMemory,
    SYSTEM_PRIORITY_CLASSES
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.SchedulerEngine = SchedulerEngine;
  globalThis.parseCpu = parseCpu;
  globalThis.parseMemory = parseMemory;
  globalThis.SYSTEM_PRIORITY_CLASSES = SYSTEM_PRIORITY_CLASSES;
}
