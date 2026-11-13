'use strict';

/**
 * KubeLabs v3.0 - Unified Autoscaling & Service Mesh Engine
 * 
 * Features:
 *  1. HorizontalPodAutoscalerEngine (HPA v2):
 *     - Target CPU & Memory utilization / averageValue scaling calculation
 *     - Multi-metric resolution (Resource, Pods, Object, External)
 *     - Scale-up and scale-down stabilization windows & rate policies
 *     - Min/Max replica boundary enforcement & status condition reporting
 *  2. VerticalPodAutoscalerEngine (VPA):
 *     - Recommendation calculation: target, lowerBound, upperBound, uncappedTarget
 *     - Container resource policies (minAllowed, maxAllowed, controlledResources)
 *     - Update modes: Off, Initial, Recreate, Auto
 *  3. ClusterAutoscalerEngine & KarpenterEngine:
 *     - Cluster Autoscaler: Pending pod scale-up & unneeded node scale-down
 *     - Karpenter: NodePool & EC2NodeClass controller, optimal instance bin-packing,
 *       WhenEmpty & WhenUnderutilized consolidation, Spot 2-minute interruption handler
 *  4. ServiceMeshEngine (Istio, Linkerd, Consul):
 *     - Istio: VirtualService route matching & canary splits, HTTP fault injection,
 *       DestinationRule subsets, load balancing, circuit breaking & outlier detection,
 *       PeerAuthentication multi-scoped mTLS (STRICT, PERMISSIVE)
 *     - Linkerd: ServiceProfile route classifications, retry budgets, TrafficSplit
 *     - Consul: ServiceSplitter, ServiceRouter, ServiceResolver, ServiceIntentions
 * 
 * Pure ES2024 module with ZERO external runtime dependencies.
 */

// ---------------------------------------------------------------------------
// Resource Parsing & Formatting Utilities (CPU, Memory)
// ---------------------------------------------------------------------------

function parseCpu(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const str = String(raw).trim();
  if (str.endsWith('m')) {
    return parseInt(str.slice(0, -1), 10) || 0;
  }
  const floatVal = parseFloat(str);
  return isNaN(floatVal) ? 0 : Math.round(floatVal * 1000);
}

function parseMemory(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const str = String(raw).trim();

  // Binary SI prefixes
  if (str.endsWith('Ki')) return Math.round(parseFloat(str.slice(0, -2)) * 1024);
  if (str.endsWith('Mi')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024);
  if (str.endsWith('Gi')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024 * 1024);
  if (str.endsWith('Ti')) return Math.round(parseFloat(str.slice(0, -2)) * 1024 * 1024 * 1024 * 1024);

  // Decimal SI prefixes
  if (str.endsWith('k') || str.endsWith('K')) return Math.round(parseFloat(str.slice(0, -1)) * 1000);
  if (str.endsWith('M')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000);
  if (str.endsWith('G')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000 * 1000);
  if (str.endsWith('T')) return Math.round(parseFloat(str.slice(0, -1)) * 1000 * 1000 * 1000 * 1000);

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

function formatCpu(millicores) {
  const m = Math.round(millicores);
  if (m % 1000 === 0 && m !== 0) {
    return String(m / 1000);
  }
  return `${m}m`;
}

function formatMemory(bytes) {
  const b = Math.round(bytes);
  if (b >= 1024 * 1024 * 1024 && b % (1024 * 1024 * 1024) === 0) {
    return `${b / (1024 * 1024 * 1024)}Gi`;
  }
  if (b >= 1024 * 1024 && b % (1024 * 1024) === 0) {
    return `${b / (1024 * 1024)}Mi`;
  }
  if (b >= 1024 && b % 1024 === 0) {
    return `${b / 1024}Ki`;
  }
  const mi = Math.round(b / (1024 * 1024));
  return `${mi}Mi`;
}

// ---------------------------------------------------------------------------
// 1. HorizontalPodAutoscaler v2 Engine (HPA)
// ---------------------------------------------------------------------------

class HorizontalPodAutoscalerEngine {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
    this.history = new Map(); // "namespace/name" -> Array<{ timestamp, desiredReplicas }>
  }

  /**
   * Reconciles an HPA resource against current metric snapshots and target workload.
   * @param {Object} hpa HPA resource manifest
   * @param {Object} metricsSnapshot Optional metrics map: { cpuUtilization, memoryUtilization, custom: {} }
   * @param {number} currentTime Current timestamp in ms (for stabilization evaluation)
   */
  reconcileHpa(hpa, metricsSnapshot = {}, currentTime = Date.now()) {
    if (!hpa || (hpa.kind !== 'HorizontalPodAutoscaler' && hpa.kind !== 'HPA')) {
      throw new Error('Invalid HPA resource');
    }

    const namespace = (hpa.metadata && hpa.metadata.namespace) || 'default';
    const name = hpa.metadata && hpa.metadata.name;
    const key = `${namespace}/${name}`;
    const spec = hpa.spec || {};
    const targetRef = spec.scaleTargetRef || {};

    // 1. Locate target resource (Deployment, ReplicaSet, StatefulSet)
    let target = null;
    let currentReplicas = 1;

    if (this.graph && targetRef.kind && targetRef.name) {
      target = this.graph.get(targetRef.kind, namespace, targetRef.name);
      if (target) {
        currentReplicas = (target.spec && target.spec.replicas !== undefined)
          ? target.spec.replicas
          : ((target.status && target.status.replicas) || 1);
      }
    } else if (metricsSnapshot.currentReplicas !== undefined) {
      currentReplicas = metricsSnapshot.currentReplicas;
    }

    const minReplicas = spec.minReplicas !== undefined ? spec.minReplicas : 1;
    const maxReplicas = spec.maxReplicas !== undefined ? spec.maxReplicas : 10;
    const tolerance = spec.tolerance !== undefined ? spec.tolerance : 0.1; // Kubernetes default 10%

    // 2. Evaluate all configured metrics
    const metrics = Array.isArray(spec.metrics) ? spec.metrics : [];
    let calculatedDesiredReplicas = currentReplicas;
    const evaluatedMetrics = [];
    const proposedReplicas = [];

    for (const metric of metrics) {
      const type = metric.type;
      let ratio = 1.0;
      let currentVal = 0;
      let targetVal = 1;
      let metricSummary = { type };

      if (type === 'Resource') {
        const res = metric.resource || {};
        const resName = res.name; // 'cpu' or 'memory'
        const targetType = res.target && res.target.type;

        if (targetType === 'Utilization') {
          targetVal = res.target.averageUtilization || 80;
          const providedVal = (resName === 'cpu') ? metricsSnapshot.cpuUtilization : metricsSnapshot.memoryUtilization;
          currentVal = providedVal !== undefined ? providedVal : targetVal;

          ratio = currentVal / targetVal;
          metricSummary = {
            type: 'Resource',
            resource: {
              name: resName,
              current: { averageUtilization: Math.round(currentVal) }
            }
          };
        } else if (targetType === 'AverageValue') {
          const targetAvgBytes = parseMemory(res.target.averageValue) || parseCpu(res.target.averageValue) || 1;
          const providedAvg = (resName === 'cpu')
            ? (metricsSnapshot.cpuAverageValue !== undefined ? parseCpu(metricsSnapshot.cpuAverageValue) : undefined)
            : (metricsSnapshot.memoryAverageValue !== undefined ? parseMemory(metricsSnapshot.memoryAverageValue) : undefined);
          const currentAvgBytes = providedAvg !== undefined ? providedAvg : targetAvgBytes;

          currentVal = currentAvgBytes;
          targetVal = targetAvgBytes;
          ratio = currentVal / targetVal;
          metricSummary = {
            type: 'Resource',
            resource: {
              name: resName,
              current: { averageValue: resName === 'cpu' ? formatCpu(currentVal) : formatMemory(currentVal) }
            }
          };
        }
      } else if (type === 'Pods') {
        const podMetric = metric.pods || {};
        const metricName = podMetric.metric && podMetric.metric.name;
        targetVal = parseMemory(podMetric.target && podMetric.target.averageValue) || parseFloat(podMetric.target && podMetric.target.averageValue) || 100;
        currentVal = (metricsSnapshot.custom && metricsSnapshot.custom[metricName]) !== undefined
          ? metricsSnapshot.custom[metricName]
          : targetVal;

        ratio = currentVal / targetVal;
        metricSummary = {
          type: 'Pods',
          pods: {
            metric: { name: metricName },
            current: { averageValue: String(currentVal) }
          }
        };
      } else if (type === 'Object' || type === 'External') {
        const ext = metric.external || metric.object || {};
        const metricName = ext.metric && ext.metric.name;
        targetVal = parseFloat(ext.target && (ext.target.value || ext.target.averageValue)) || 100;
        currentVal = (metricsSnapshot.custom && metricsSnapshot.custom[metricName]) !== undefined
          ? metricsSnapshot.custom[metricName]
          : targetVal;

        ratio = currentVal / targetVal;
        metricSummary = {
          type,
          current: { value: String(currentVal) }
        };
      }

      evaluatedMetrics.push(metricSummary);

      // Kubernetes standard scaling formula:
      // desiredReplicas = Math.ceil(currentReplicas * (currentMetricValue / targetMetricValue))
      let desiredForMetric = currentReplicas;
      if (Math.abs(1.0 - ratio) > tolerance) {
        desiredForMetric = Math.ceil(currentReplicas * ratio);
      }
      proposedReplicas.push(desiredForMetric);
    }

    if (proposedReplicas.length > 0) {
      // Kubernetes takes the maximum desired replicas across all evaluated metrics
      calculatedDesiredReplicas = Math.max(...proposedReplicas);
    }

    // 3. Stabilization Window & Scaling Behavior Evaluation
    const behavior = spec.behavior || {};
    let finalDesiredReplicas = calculatedDesiredReplicas;

    // Track history for stabilization window
    if (!this.history.has(key)) {
      this.history.set(key, []);
    }
    const recs = this.history.get(key);
    recs.push({ timestamp: currentTime, desired: calculatedDesiredReplicas });

    // Clean old history > 600s
    while (recs.length > 0 && currentTime - recs[0].timestamp > 600000) {
      recs.shift();
    }

    if (calculatedDesiredReplicas > currentReplicas) {
      // Scale-Up
      const scaleUp = behavior.scaleUp || {};
      const windowSec = scaleUp.stabilizationWindowSeconds !== undefined ? scaleUp.stabilizationWindowSeconds : 0;
      if (windowSec > 0) {
        const windowMs = windowSec * 1000;
        const windowRecs = recs.filter((r) => currentTime - r.timestamp <= windowMs);
        if (windowRecs.length > 0) {
          finalDesiredReplicas = Math.max(...windowRecs.map((r) => r.desired));
        }
      }
      // Apply rate limits / policies if present
      if (Array.isArray(scaleUp.policies) && scaleUp.policies.length > 0) {
        let maxAllowedScaleUp = currentReplicas;
        for (const policy of scaleUp.policies) {
          if (policy.type === 'Pods') {
            maxAllowedScaleUp = Math.max(maxAllowedScaleUp, currentReplicas + (policy.value || 4));
          } else if (policy.type === 'Percent') {
            const added = Math.ceil(currentReplicas * ((policy.value || 100) / 100));
            maxAllowedScaleUp = Math.max(maxAllowedScaleUp, currentReplicas + added);
          }
        }
        finalDesiredReplicas = Math.min(finalDesiredReplicas, maxAllowedScaleUp);
      }
    } else if (calculatedDesiredReplicas < currentReplicas) {
      // Scale-Down
      const scaleDown = behavior.scaleDown || {};
      const windowSec = scaleDown.stabilizationWindowSeconds !== undefined ? scaleDown.stabilizationWindowSeconds : 300;
      if (windowSec > 0) {
        const windowMs = windowSec * 1000;
        const windowRecs = recs.filter((r) => currentTime - r.timestamp <= windowMs);
        if (windowRecs.length > 0) {
          // Stabilization window for scale down takes the maximum of the recommendations within the window
          finalDesiredReplicas = Math.max(...windowRecs.map((r) => r.desired));
        }
      }
      // Apply rate limits / policies if present
      if (Array.isArray(scaleDown.policies) && scaleDown.policies.length > 0) {
        let minAllowedScaleDown = currentReplicas;
        for (const policy of scaleDown.policies) {
          if (policy.type === 'Pods') {
            minAllowedScaleDown = Math.min(minAllowedScaleDown, Math.max(1, currentReplicas - (policy.value || 1)));
          } else if (policy.type === 'Percent') {
            const sub = Math.ceil(currentReplicas * ((policy.value || 10) / 100));
            minAllowedScaleDown = Math.min(minAllowedScaleDown, Math.max(1, currentReplicas - sub));
          }
        }
        finalDesiredReplicas = Math.max(finalDesiredReplicas, minAllowedScaleDown);
      }
    }

    // 4. Boundary enforcement (minReplicas, maxReplicas)
    let scalingLimitedStatus = 'False';
    let scalingLimitedReason = 'DesiredWithinRange';

    if (finalDesiredReplicas < minReplicas) {
      finalDesiredReplicas = minReplicas;
      scalingLimitedStatus = 'True';
      scalingLimitedReason = 'TooFewReplicas';
    } else if (finalDesiredReplicas > maxReplicas) {
      finalDesiredReplicas = maxReplicas;
      scalingLimitedStatus = 'True';
      scalingLimitedReason = 'TooManyReplicas';
    }

    // 5. Apply scale update to target resource if graph available
    let scaled = false;
    if (target && target.spec && target.spec.replicas !== finalDesiredReplicas) {
      target.spec.replicas = finalDesiredReplicas;
      if (target.status) {
        target.status.replicas = finalDesiredReplicas;
      }
      if (this.graph) {
        this.graph.set(target);
      }
      scaled = true;
    }

    // 6. Update HPA status conditions
    const nowIso = new Date(currentTime).toISOString();
    hpa.status = {
      currentReplicas,
      desiredReplicas: finalDesiredReplicas,
      currentMetrics: evaluatedMetrics,
      lastScaleTime: scaled ? nowIso : ((hpa.status && hpa.status.lastScaleTime) || null),
      conditions: [
        {
          type: 'AbleToScale',
          status: 'True',
          lastTransitionTime: nowIso,
          reason: 'ReadyForNewScale',
          message: 'recommended size matches current size'
        },
        {
          type: 'ScalingActive',
          status: 'True',
          lastTransitionTime: nowIso,
          reason: 'ValidMetricFound',
          message: 'the HPA was able to successfully calculate a replica count'
        },
        {
          type: 'ScalingLimited',
          status: scalingLimitedStatus,
          lastTransitionTime: nowIso,
          reason: scalingLimitedReason,
          message: `the desired replica count is ${scalingLimitedReason === 'DesiredWithinRange' ? 'within range' : 'capped'}`
        }
      ]
    };

    if (this.graph) {
      this.graph.set(hpa);
    }

    return {
      hpa,
      scaled,
      previousReplicas: currentReplicas,
      desiredReplicas: finalDesiredReplicas,
      target
    };
  }
}

// ---------------------------------------------------------------------------
// 2. VerticalPodAutoscaler Engine (VPA)
// ---------------------------------------------------------------------------

class VerticalPodAutoscalerEngine {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
  }

  /**
   * Generates VPA recommendations based on historical usage metrics and applies them if mode is Auto/Recreate.
   * @param {Object} vpa VPA resource manifest
   * @param {Object} usageData Map of containerName -> { cpuSamples: number[], memorySamples: number[] }
   */
  reconcileVpa(vpa, usageData = {}) {
    if (!vpa || (vpa.kind !== 'VerticalPodAutoscaler' && vpa.kind !== 'VPA')) {
      throw new Error('Invalid VPA resource');
    }

    const namespace = (vpa.metadata && vpa.metadata.namespace) || 'default';
    const spec = vpa.spec || {};
    const targetRef = spec.targetRef || {};
    const updateMode = (spec.updatePolicy && spec.updatePolicy.updateMode) || 'Auto';
    const containerPolicies = (spec.resourcePolicy && spec.resourcePolicy.containerPolicies) || [];

    // Locate target workload if graph is available
    let target = null;
    if (this.graph && targetRef.kind && targetRef.name) {
      target = this.graph.get(targetRef.kind, namespace, targetRef.name);
    }

    // Default container names to inspect
    let containerNames = Object.keys(usageData);
    if (containerNames.length === 0) {
      if (target && target.spec && target.spec.template && target.spec.template.spec && Array.isArray(target.spec.template.spec.containers)) {
        containerNames = target.spec.template.spec.containers.map((c) => c.name);
      } else {
        containerNames = ['app'];
      }
    }

    const recommendations = [];
    let updatedWorkload = false;

    for (const containerName of containerNames) {
      // Find matching container policy (or wildcard '*')
      const policy = containerPolicies.find((p) => p.containerName === containerName)
        || containerPolicies.find((p) => p.containerName === '*')
        || {};

      if (policy.mode === 'Off') {
        continue;
      }

      const minCpu = parseCpu(policy.minAllowed && policy.minAllowed.cpu) || 50; // 50m
      const maxCpu = parseCpu(policy.maxAllowed && policy.maxAllowed.cpu) || 32000; // 32 cores
      const minMem = parseMemory(policy.minAllowed && policy.minAllowed.memory) || 32 * 1024 * 1024; // 32Mi
      const maxMem = parseMemory(policy.maxAllowed && policy.maxAllowed.memory) || 64 * 1024 * 1024 * 1024; // 64Gi

      // Usage samples
      const cUsage = usageData[containerName] || {};
      const cpuSamples = Array.isArray(cUsage.cpuSamples) && cUsage.cpuSamples.length > 0
        ? cUsage.cpuSamples.map(parseCpu)
        : [200, 300, 450, 500, 750]; // default samples in millicores
      const memSamples = Array.isArray(cUsage.memorySamples) && cUsage.memorySamples.length > 0
        ? cUsage.memorySamples.map(parseMemory)
        : [128 * 1024 * 1024, 180 * 1024 * 1024, 256 * 1024 * 1024];

      // Percentile calculations
      const sortedCpu = [...cpuSamples].sort((a, b) => a - b);
      const sortedMem = [...memSamples].sort((a, b) => a - b);

      const p50Cpu = sortedCpu[Math.floor(sortedCpu.length * 0.5)];
      const p95Cpu = sortedCpu[Math.floor(sortedCpu.length * 0.95)] || sortedCpu[sortedCpu.length - 1];
      const p99Cpu = sortedCpu[Math.floor(sortedCpu.length * 0.99)] || sortedCpu[sortedCpu.length - 1];

      const p50Mem = sortedMem[Math.floor(sortedMem.length * 0.5)];
      const p95Mem = sortedMem[Math.floor(sortedMem.length * 0.95)] || sortedMem[sortedMem.length - 1];
      const p99Mem = sortedMem[Math.floor(sortedMem.length * 0.99)] || sortedMem[sortedMem.length - 1];

      // Recommendations with safety margins:
      // Target: P95 + 15% headroom
      const uncappedCpuTarget = Math.round(p95Cpu * 1.15);
      const uncappedMemTarget = Math.round(p95Mem * 1.15);

      // LowerBound: P50 * 0.85
      const lowerBoundCpu = Math.max(minCpu, Math.round(p50Cpu * 0.85));
      const lowerBoundMem = Math.max(minMem, Math.round(p50Mem * 0.85));

      // UpperBound: P99 * 1.25
      const upperBoundCpu = Math.min(maxCpu, Math.round(p99Cpu * 1.25));
      const upperBoundMem = Math.min(maxMem, Math.round(p99Mem * 1.25));

      // Capped Target:
      const targetCpu = Math.max(minCpu, Math.min(maxCpu, uncappedCpuTarget));
      const targetMem = Math.max(minMem, Math.min(maxMem, uncappedMemTarget));

      recommendations.push({
        containerName,
        target: { cpu: formatCpu(targetCpu), memory: formatMemory(targetMem) },
        lowerBound: { cpu: formatCpu(lowerBoundCpu), memory: formatMemory(lowerBoundMem) },
        upperBound: { cpu: formatCpu(upperBoundCpu), memory: formatMemory(upperBoundMem) },
        uncappedTarget: { cpu: formatCpu(uncappedCpuTarget), memory: formatMemory(uncappedMemTarget) }
      });

      // Apply to target workload if in Auto or Recreate mode
      if ((updateMode === 'Auto' || updateMode === 'Recreate') && target && target.spec) {
        const podSpec = (target.spec.template && target.spec.template.spec) || target.spec;
        if (Array.isArray(podSpec.containers)) {
          const container = podSpec.containers.find((c) => c.name === containerName);
          if (container) {
            container.resources = container.resources || {};
            container.resources.requests = container.resources.requests || {};
            container.resources.requests.cpu = formatCpu(targetCpu);
            container.resources.requests.memory = formatMemory(targetMem);
            updatedWorkload = true;
          }
        }
      }
    }

    if (updatedWorkload && this.graph && target) {
      this.graph.set(target);
    }

    const nowIso = new Date().toISOString();
    vpa.status = {
      recommendation: {
        containerRecommendations: recommendations
      },
      conditions: [
        {
          type: 'RecommendationProvided',
          status: 'True',
          lastTransitionTime: nowIso,
          reason: 'CalculatedFromMetrics',
          message: 'VPA generated recommendations successfully'
        }
      ]
    };

    if (this.graph) {
      this.graph.set(vpa);
    }

    return {
      vpa,
      applied: updatedWorkload,
      recommendations,
      target
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Cluster Autoscaler & Karpenter Simulator
// ---------------------------------------------------------------------------

// Comprehensive AWS EC2 Instance Catalog for Bin-Packing
const DEFAULT_INSTANCE_CATALOG = [
  { type: 'c6i.large', cpu: 2000, memory: 4 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.085, spotPrice: 0.034 },
  { type: 'c6i.xlarge', cpu: 4000, memory: 8 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.170, spotPrice: 0.068 },
  { type: 'm6i.large', cpu: 2000, memory: 8 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.096, spotPrice: 0.038 },
  { type: 'm6i.xlarge', cpu: 4000, memory: 16 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.192, spotPrice: 0.076 },
  { type: 'm6i.2xlarge', cpu: 8000, memory: 32 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.384, spotPrice: 0.152 },
  { type: 'r6i.large', cpu: 2000, memory: 16 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.126, spotPrice: 0.050 },
  { type: 'r6i.xlarge', cpu: 4000, memory: 32 * 1024 * 1024 * 1024, arch: 'amd64', onDemandPrice: 0.252, spotPrice: 0.100 },
  { type: 't4g.medium', cpu: 2000, memory: 4 * 1024 * 1024 * 1024, arch: 'arm64', onDemandPrice: 0.0336, spotPrice: 0.0134 },
  { type: 't4g.large', cpu: 2000, memory: 8 * 1024 * 1024 * 1024, arch: 'arm64', onDemandPrice: 0.0672, spotPrice: 0.0268 },
  { type: 't4g.xlarge', cpu: 4000, memory: 16 * 1024 * 1024 * 1024, arch: 'arm64', onDemandPrice: 0.1344, spotPrice: 0.0537 }
];

class ClusterAutoscalerEngine {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
    this.nodeGroups = new Map(); // name -> NodeGroup config
  }

  registerNodeGroup(config) {
    const name = config.name || 'default-asg';
    const ng = {
      name,
      minSize: config.minSize !== undefined ? config.minSize : 1,
      maxSize: config.maxSize !== undefined ? config.maxSize : 10,
      currentSize: config.currentSize !== undefined ? config.currentSize : 2,
      instanceType: config.instanceType || 'm6i.xlarge',
      capacity: {
        cpu: config.capacity && config.capacity.cpu ? parseCpu(config.capacity.cpu) : 4000,
        memory: config.capacity && config.capacity.memory ? parseMemory(config.capacity.memory) : 16 * 1024 * 1024 * 1024
      },
      labels: config.labels || { 'node.kubernetes.io/instance-type': config.instanceType || 'm6i.xlarge' },
      taints: config.taints || []
    };
    this.nodeGroups.set(name, ng);
    return ng;
  }

  /**
   * Evaluates pending pods and triggers node group scale-up if required.
   */
  evaluateScaleUp(pendingPods = []) {
    if (pendingPods.length === 0) {
      return { scaleUpRequired: false, additions: [] };
    }

    let requiredCpu = 0;
    let requiredMem = 0;

    for (const pod of pendingPods) {
      const spec = pod.spec || {};
      for (const container of (spec.containers || [])) {
        const req = container.resources && container.resources.requests;
        if (req) {
          requiredCpu += parseCpu(req.cpu);
          requiredMem += parseMemory(req.memory);
        }
      }
    }

    const additions = [];

    for (const [name, ng] of this.nodeGroups.entries()) {
      if (ng.currentSize >= ng.maxSize) continue;

      const nodesNeededCpu = Math.ceil(requiredCpu / ng.capacity.cpu);
      const nodesNeededMem = Math.ceil(requiredMem / ng.capacity.memory);
      const neededNodes = Math.max(1, Math.max(nodesNeededCpu, nodesNeededMem));

      const newSize = Math.min(ng.maxSize, ng.currentSize + neededNodes);
      const added = newSize - ng.currentSize;

      if (added > 0) {
        ng.currentSize = newSize;
        additions.push({
          nodeGroup: name,
          addedNodes: added,
          newSize,
          instanceType: ng.instanceType
        });
        break; // Satisfied by primary matching node group
      }
    }

    return {
      scaleUpRequired: additions.length > 0,
      requiredCpu: formatCpu(requiredCpu),
      requiredMemory: formatMemory(requiredMem),
      additions
    };
  }

  /**
   * Evaluates node utilization and detects scale-down candidates.
   */
  evaluateScaleDown(activeNodes = [], nodeUtilizations = {}) {
    const candidates = [];

    for (const node of activeNodes) {
      const nodeName = typeof node === 'string' ? node : (node.metadata && node.metadata.name);
      const util = nodeUtilizations[nodeName] !== undefined ? nodeUtilizations[nodeName] : 0.8;

      if (util < 0.5) { // under 50% utilization threshold
        candidates.push({
          nodeName,
          utilization: util,
          action: 'drain-and-terminate'
        });
      }
    }

    return {
      scaleDownEligible: candidates.length > 0,
      candidates
    };
  }
}

class KarpenterEngine {
  constructor(resourceGraph = null, instanceCatalog = DEFAULT_INSTANCE_CATALOG) {
    this.graph = resourceGraph;
    this.catalog = instanceCatalog;
    this.nodePools = new Map();
    this.nodeClasses = new Map();
    this.provisionedNodes = new Map();
  }

  registerNodePool(nodePoolManifest) {
    const name = (nodePoolManifest.metadata && nodePoolManifest.metadata.name) || 'default';
    this.nodePools.set(name, nodePoolManifest);
    if (this.graph) {
      this.graph.set(nodePoolManifest);
    }
    return nodePoolManifest;
  }

  registerNodeClass(nodeClassManifest) {
    const name = (nodeClassManifest.metadata && nodeClassManifest.metadata.name) || 'default';
    this.nodeClasses.set(name, nodeClassManifest);
    if (this.graph) {
      this.graph.set(nodeClassManifest);
    }
    return nodeClassManifest;
  }

  /**
   * Evaluates pending pods against NodePool requirements and calculates optimal instance bin-packing.
   */
  provisionForPendingPods(nodePoolName, pendingPods = []) {
    const nodePool = this.nodePools.get(nodePoolName);
    if (!nodePool) {
      throw new Error(`NodePool "${nodePoolName}" not found`);
    }

    const templateSpec = (nodePool.spec && nodePool.spec.template && nodePool.spec.template.spec) || {};
    const requirements = templateSpec.requirements || [];

    // Parse requirements
    let allowedArchs = ['amd64'];
    let allowedCapacityTypes = ['on-demand', 'spot'];
    let allowedInstanceTypes = [];

    for (const req of requirements) {
      if (req.key === 'kubernetes.io/arch' && Array.isArray(req.values)) {
        allowedArchs = req.values;
      } else if (req.key === 'karpenter.sh/capacity-type' && Array.isArray(req.values)) {
        allowedCapacityTypes = req.values;
      } else if (req.key === 'node.kubernetes.io/instance-type' && Array.isArray(req.values)) {
        allowedInstanceTypes = req.values;
      }
    }

    // Filter instance catalog
    let candidates = this.catalog.filter((inst) => allowedArchs.includes(inst.arch));
    if (allowedInstanceTypes.length > 0) {
      candidates = candidates.filter((inst) => allowedInstanceTypes.includes(inst.type));
    }
    if (candidates.length === 0) {
      candidates = this.catalog;
    }

    // Aggregate pending pod resource requests
    let totalCpu = 0;
    let totalMem = 0;
    const scheduledPodNames = [];

    for (const pod of pendingPods) {
      const spec = pod.spec || {};
      for (const container of (spec.containers || [])) {
        const req = container.resources && container.resources.requests;
        if (req) {
          totalCpu += parseCpu(req.cpu);
          totalMem += parseMemory(req.memory);
        }
      }
      scheduledPodNames.push(pod.metadata && pod.metadata.name);
    }

    // Select cheapest instance type satisfying capacity
    const preferSpot = allowedCapacityTypes.includes('spot');
    const sorted = [...candidates].sort((a, b) => {
      const priceA = preferSpot ? a.spotPrice : a.onDemandPrice;
      const priceB = preferSpot ? b.spotPrice : b.onDemandPrice;
      return priceA - priceB;
    });

    const chosenInstance = sorted.find((inst) => inst.cpu >= totalCpu && inst.memory >= totalMem)
      || sorted[sorted.length - 1]; // or largest available

    const capacityType = preferSpot ? 'spot' : 'on-demand';
    const hourlyCost = capacityType === 'spot' ? chosenInstance.spotPrice : chosenInstance.onDemandPrice;
    const nodeName = `karpenter-${nodePoolName}-${Math.random().toString(36).slice(2, 7)}`;

    const newNode = {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: nodeName,
        labels: {
          'karpenter.sh/nodepool': nodePoolName,
          'karpenter.sh/capacity-type': capacityType,
          'node.kubernetes.io/instance-type': chosenInstance.type,
          'kubernetes.io/arch': chosenInstance.arch,
          'node.kubernetes.io/os': 'linux'
        },
        annotations: {
          'karpenter.sh/managed-by': 'karpenter'
        }
      },
      status: {
        capacity: {
          cpu: formatCpu(chosenInstance.cpu),
          memory: formatMemory(chosenInstance.memory),
          pods: '110'
        },
        allocatable: {
          cpu: formatCpu(Math.round(chosenInstance.cpu * 0.9)),
          memory: formatMemory(Math.round(chosenInstance.memory * 0.9)),
          pods: '110'
        },
        conditions: [
          { type: 'Ready', status: 'True', lastHeartbeatTime: new Date().toISOString() }
        ]
      }
    };

    this.provisionedNodes.set(nodeName, {
      manifest: newNode,
      instance: chosenInstance,
      capacityType,
      hourlyCost,
      scheduledPods: scheduledPodNames
    });

    if (this.graph) {
      this.graph.set(newNode);
    }

    return {
      nodeName,
      instanceType: chosenInstance.type,
      capacityType,
      hourlyCost,
      scheduledPods: scheduledPodNames,
      node: newNode
    };
  }

  /**
   * Consolidates underutilized or empty nodes based on disruption policy (WhenEmpty, WhenUnderutilized).
   */
  consolidateNodes(nodePoolName, nodes = [], podAllocations = {}) {
    const nodePool = this.nodePools.get(nodePoolName);
    const policy = (nodePool && nodePool.spec && nodePool.spec.disruption && nodePool.spec.disruption.consolidationPolicy)
      || 'WhenUnderutilized';

    const actions = [];
    let totalSavingsHourly = 0;

    for (const node of nodes) {
      const nodeName = typeof node === 'string' ? node : (node.metadata && node.metadata.name);
      const allocatedPods = podAllocations[nodeName] || [];

      if (allocatedPods.length === 0) {
        // Node is empty -> terminate
        actions.push({
          action: 'terminate',
          nodeName,
          reason: 'empty-node-consolidation'
        });
        const info = this.provisionedNodes.get(nodeName);
        if (info) totalSavingsHourly += info.hourlyCost;
      } else if (policy === 'WhenUnderutilized') {
        // Check if multiple underutilized nodes can be combined
        const info = this.provisionedNodes.get(nodeName);
        if (info && allocatedPods.length <= 2 && info.instance.type.includes('xlarge')) {
          // Can be replaced by a smaller instance
          actions.push({
            action: 'replace',
            nodeName,
            replacementInstanceType: 'm6i.large',
            reason: 'underutilized-consolidation'
          });
          totalSavingsHourly += (info.hourlyCost - 0.038); // difference
        }
      }
    }

    return {
      policy,
      actions,
      totalSavingsHourly: Math.max(0, parseFloat(totalSavingsHourly.toFixed(4)))
    };
  }

  /**
   * Simulates AWS 2-minute Spot Interruption notice and initiates proactive pod drain.
   */
  simulateSpotInterruption(nodeName) {
    const info = this.provisionedNodes.get(nodeName);
    const node = info ? info.manifest : (this.graph && this.graph.get('Node', '', nodeName));

    if (!node) {
      throw new Error(`Node "${nodeName}" not found for spot interruption`);
    }

    // Add Karpenter disruption taint & condition
    node.spec = node.spec || {};
    node.spec.taints = node.spec.taints || [];
    node.spec.taints.push({
      key: 'karpenter.sh/disruption',
      value: 'interrupted',
      effect: 'NoSchedule'
    });

    node.status = node.status || {};
    node.status.conditions = node.status.conditions || [];
    node.status.conditions.push({
      type: 'DisruptionTarget',
      status: 'True',
      reason: 'SpotInterrupted',
      message: 'Node received AWS EC2 2-minute spot interruption notice'
    });

    if (this.graph) {
      this.graph.set(node);
    }

    const drainedPods = (info && info.scheduledPods) || [];

    return {
      nodeName,
      interrupted: true,
      noticeTimeRemainingSeconds: 120,
      replacementTriggered: true,
      drainedPods
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Service Mesh Engine (Istio, Linkerd, Consul)
// ---------------------------------------------------------------------------

class IstioMeshController {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
    this.endpointStats = new Map(); // "host/subset" -> { consecutiveErrors: number, ejectedUntil: number }
  }

  /**
   * Evaluates Istio VirtualService HTTP routing rules, weighted splits, fault injection, and retries.
   */
  resolveHttpRoute(virtualServiceName, namespace = 'default', request = { uri: '/', headers: {}, method: 'GET' }) {
    let vs = null;
    if (this.graph) {
      vs = this.graph.get('VirtualService', namespace, virtualServiceName);
    }

    if (!vs || !vs.spec || !Array.isArray(vs.spec.http)) {
      return { matched: false, destination: null, fault: null };
    }

    for (const rule of vs.spec.http) {
      // 1. Check match criteria
      let matches = true;
      if (Array.isArray(rule.match) && rule.match.length > 0) {
        matches = rule.match.some((m) => {
          if (m.uri) {
            if (m.uri.exact && request.uri !== m.uri.exact) return false;
            if (m.uri.prefix && !request.uri.startsWith(m.uri.prefix)) return false;
            if (m.uri.regex && !new RegExp(m.uri.regex).test(request.uri)) return false;
          }
          if (m.method) {
            const reqMethod = (request.method || 'GET').toUpperCase();
            if (m.method.exact && reqMethod !== m.method.exact.toUpperCase()) return false;
          }
          if (m.headers) {
            for (const [k, v] of Object.entries(m.headers)) {
              const reqVal = request.headers ? request.headers[k.toLowerCase()] : null;
              if (v.exact && reqVal !== v.exact) return false;
              if (v.prefix && (!reqVal || !reqVal.startsWith(v.prefix))) return false;
            }
          }
          return true;
        });
      }

      if (!matches) continue;

      // 2. Fault Injection
      let fault = null;
      if (rule.fault) {
        if (rule.fault.abort) {
          const pct = (rule.fault.abort.percentage && rule.fault.abort.percentage.value !== undefined)
            ? rule.fault.abort.percentage.value
            : 100;
          const roll = (request.randomFault !== undefined ? request.randomFault : Math.random()) * 100;
          if (roll <= pct) {
            fault = {
              type: 'abort',
              httpStatus: rule.fault.abort.httpStatus || 500,
              message: 'Fault injected by Istio VirtualService'
            };
          }
        } else if (rule.fault.delay) {
          const pct = (rule.fault.delay.percentage && rule.fault.delay.percentage.value !== undefined)
            ? rule.fault.delay.percentage.value
            : 100;
          const roll = (request.randomFault !== undefined ? request.randomFault : Math.random()) * 100;
          if (roll <= pct) {
            fault = {
              type: 'delay',
              duration: rule.fault.delay.fixedDelay || '5s'
            };
          }
        }
      }

      // 3. Weighted Route Destination
      const routes = rule.route || [];
      if (routes.length === 0) continue;

      let totalWeight = routes.reduce((sum, r) => sum + (r.weight !== undefined ? r.weight : 0), 0);
      if (totalWeight === 0) totalWeight = 100;

      const randomRoll = (request.random !== undefined ? request.random : 0.5) * totalWeight;
      let cumulative = 0;
      let selectedRoute = routes[0];

      for (const r of routes) {
        cumulative += (r.weight !== undefined ? r.weight : totalWeight);
        if (randomRoll <= cumulative) {
          selectedRoute = r;
          break;
        }
      }

      return {
        matched: true,
        destination: {
          host: selectedRoute.destination && selectedRoute.destination.host,
          subset: selectedRoute.destination && selectedRoute.destination.subset,
          port: selectedRoute.destination && selectedRoute.destination.port && selectedRoute.destination.port.number
        },
        weight: selectedRoute.weight || 100,
        fault,
        timeout: rule.timeout || null,
        retries: rule.retries || null
      };
    }

    return { matched: false, destination: null, fault: null };
  }

  /**
   * Evaluates DestinationRule circuit breaker & outlier detection status.
   */
  evaluateDestinationRule(destinationRuleName, namespace = 'default', subsetName = null, currentTime = Date.now()) {
    let dr = null;
    if (this.graph) {
      dr = this.graph.get('DestinationRule', namespace, destinationRuleName);
    }

    if (!dr || !dr.spec) {
      return { found: false, circuitBreakerTripped: false };
    }

    const host = dr.spec.host;
    let trafficPolicy = dr.spec.trafficPolicy || {};

    // Check subset-specific override
    if (subsetName && Array.isArray(dr.spec.subsets)) {
      const sub = dr.spec.subsets.find((s) => s.name === subsetName);
      if (sub && sub.trafficPolicy) {
        trafficPolicy = { ...trafficPolicy, ...sub.trafficPolicy };
      }
    }

    const outlier = trafficPolicy.outlierDetection || {};
    const connectionPool = trafficPolicy.connectionPool || {};
    const key = `${host}/${subsetName || 'default'}`;
    const stats = this.endpointStats.get(key) || { consecutiveErrors: 0, ejectedUntil: 0 };

    const consecutive5xx = outlier.consecutive5xxErrors !== undefined ? outlier.consecutive5xxErrors : 5;
    const isEjected = stats.ejectedUntil > currentTime;
    const isTripped = isEjected || stats.consecutiveErrors >= consecutive5xx;

    return {
      found: true,
      host,
      subset: subsetName,
      circuitBreakerTripped: isTripped,
      outlierDetectionConfig: {
        consecutive5xxErrors: consecutive5xx,
        interval: outlier.interval || '10s',
        baseEjectionTime: outlier.baseEjectionTime || '30s',
        maxEjectionPercent: outlier.maxEjectionPercent || 10
      },
      connectionPoolConfig: {
        maxConnections: connectionPool.tcp && connectionPool.tcp.maxConnections,
        http1MaxPendingRequests: connectionPool.http && connectionPool.http.http1MaxPendingRequests,
        maxRequestsPerConnection: connectionPool.http && connectionPool.http.maxRequestsPerConnection
      },
      consecutiveErrors: stats.consecutiveErrors,
      ejectedUntil: stats.ejectedUntil
    };
  }

  /**
   * Records endpoint response for circuit breaking / outlier detection.
   */
  recordEndpointResult(host, subsetName, statusCode, currentTime = Date.now()) {
    const key = `${host}/${subsetName || 'default'}`;
    if (!this.endpointStats.has(key)) {
      this.endpointStats.set(key, { consecutiveErrors: 0, ejectedUntil: 0 });
    }
    const stats = this.endpointStats.get(key);

    if (statusCode >= 500) {
      stats.consecutiveErrors++;
      if (stats.consecutiveErrors >= 5) {
        // Eject for 30 seconds
        stats.ejectedUntil = currentTime + 30000;
      }
    } else {
      stats.consecutiveErrors = 0;
    }
    return stats;
  }

  /**
   * Evaluates PeerAuthentication mTLS enforcement across mesh, namespace, and workload scopes.
   */
  evaluatePeerAuthentication(namespace = 'default', podLabels = {}, hasClientTls = false) {
    if (!this.graph) {
      return { allowed: true, mode: 'PERMISSIVE' };
    }

    // 1. Workload-specific PeerAuthentication in target namespace
    const nsPas = this.graph.list({ kind: 'PeerAuthentication', namespace });
    let selectedPa = null;

    for (const pa of nsPas) {
      const selector = pa.spec && pa.spec.selector && pa.spec.selector.matchLabels;
      if (selector) {
        const matches = Object.entries(selector).every(([k, v]) => podLabels[k] === v);
        if (matches) {
          selectedPa = pa;
          break;
        }
      } else if (!selectedPa) {
        selectedPa = pa; // Namespace default (without selector)
      }
    }

    // 2. Mesh-wide PeerAuthentication in root namespace (istio-system)
    if (!selectedPa) {
      const rootPas = this.graph.list({ kind: 'PeerAuthentication', namespace: 'istio-system' });
      if (rootPas.length > 0) {
        selectedPa = rootPas[0];
      }
    }

    const mode = (selectedPa && selectedPa.spec && selectedPa.spec.mtls && selectedPa.spec.mtls.mode) || 'PERMISSIVE';

    if (mode === 'STRICT' && !hasClientTls) {
      return {
        allowed: false,
        mode: 'STRICT',
        reason: 'mTLS STRICT rejected plaintext connection'
      };
    }

    return {
      allowed: true,
      mode,
      policyName: selectedPa ? (selectedPa.metadata && selectedPa.metadata.name) : 'default-implicit'
    };
  }
}

class LinkerdMeshController {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
  }

  /**
   * Evaluates Linkerd ServiceProfile routes and retry budgets.
   */
  evaluateServiceProfile(serviceProfileName, namespace = 'default', request = { path: '/', method: 'GET' }) {
    let sp = null;
    if (this.graph) {
      sp = this.graph.get('ServiceProfile', namespace, serviceProfileName);
    }

    if (!sp || !sp.spec || !Array.isArray(sp.spec.routes)) {
      return { matched: false, isRetryable: false };
    }

    for (const route of sp.spec.routes) {
      const cond = route.condition || {};
      let pathMatches = true;
      if (cond.pathRegex) {
        pathMatches = new RegExp(cond.pathRegex).test(request.path);
      }
      let methodMatches = true;
      if (cond.method) {
        methodMatches = (request.method || 'GET').toUpperCase() === cond.method.toUpperCase();
      }

      if (pathMatches && methodMatches) {
        return {
          matched: true,
          routeName: route.name,
          isRetryable: !!route.isRetryable,
          timeout: route.timeout || null,
          responseClasses: route.responseClasses || []
        };
      }
    }

    return { matched: false, isRetryable: false };
  }

  /**
   * Evaluates SMI / Linkerd TrafficSplit weights.
   */
  resolveTrafficSplit(trafficSplitName, namespace = 'default', randomValue = 0.5) {
    let ts = null;
    if (this.graph) {
      ts = this.graph.get('TrafficSplit', namespace, trafficSplitName);
    }

    if (!ts || !ts.spec || !Array.isArray(ts.spec.backends)) {
      return { service: null, weight: 100 };
    }

    const backends = ts.spec.backends;
    const totalWeight = backends.reduce((s, b) => s + (b.weight || 0), 0) || 100;
    const roll = randomValue * totalWeight;

    let cumulative = 0;
    for (const b of backends) {
      cumulative += (b.weight || 0);
      if (roll <= cumulative) {
        return { service: b.service, weight: b.weight };
      }
    }

    return { service: backends[0].service, weight: backends[0].weight };
  }
}

class ConsulMeshController {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
  }

  /**
   * Evaluates Consul ServiceSplitter traffic splits.
   */
  resolveSplit(serviceSplitterName, namespace = 'default', randomValue = 0.5) {
    let ss = null;
    if (this.graph) {
      ss = this.graph.get('ServiceSplitter', namespace, serviceSplitterName);
    }

    if (!ss || !ss.spec || !Array.isArray(ss.spec.splits)) {
      return { service: serviceSplitterName, subset: 'default', percentage: 100 };
    }

    const splits = ss.spec.splits;
    const roll = randomValue * 100;
    let cumulative = 0;

    for (const s of splits) {
      cumulative += (s.percentage || 0);
      if (roll <= cumulative) {
        return {
          service: s.service || serviceSplitterName,
          subset: s.serviceSubset || 'default',
          percentage: s.percentage
        };
      }
    }

    return { service: splits[0].service, subset: splits[0].serviceSubset, percentage: splits[0].percentage };
  }

  /**
   * Evaluates Consul ServiceIntentions L4/L7 authorization rules.
   */
  checkIntention(sourceService, destinationService, namespace = 'default') {
    let si = null;
    if (this.graph) {
      si = this.graph.get('ServiceIntentions', namespace, destinationService);
    }

    if (!si || !si.spec || !Array.isArray(si.spec.sources)) {
      return { allowed: true, action: 'allow', reason: 'Default-allow implicit intention' };
    }

    const sourceRule = si.spec.sources.find((s) => s.name === sourceService || s.name === '*');
    if (!sourceRule) {
      return { allowed: true, action: 'allow', reason: 'No matching intention found' };
    }

    const action = sourceRule.action || 'allow';
    return {
      allowed: action === 'allow',
      action,
      reason: `Intention explicitly set to ${action}`
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Unified Autoscaling & Service Mesh Engine Facade
// ---------------------------------------------------------------------------

class AutoscalingAndMeshEngine {
  constructor(resourceGraph = null) {
    this.graph = resourceGraph;
    this.hpa = new HorizontalPodAutoscalerEngine(resourceGraph);
    this.vpa = new VerticalPodAutoscalerEngine(resourceGraph);
    this.clusterAutoscaler = new ClusterAutoscalerEngine(resourceGraph);
    this.karpenter = new KarpenterEngine(resourceGraph);
    this.istio = new IstioMeshController(resourceGraph);
    this.linkerd = new LinkerdMeshController(resourceGraph);
    this.consul = new ConsulMeshController(resourceGraph);
  }
}

module.exports = {
  AutoscalingAndMeshEngine,
  HorizontalPodAutoscalerEngine,
  VerticalPodAutoscalerEngine,
  ClusterAutoscalerEngine,
  KarpenterEngine,
  IstioMeshController,
  LinkerdMeshController,
  ConsulMeshController,
  DEFAULT_INSTANCE_CATALOG,
  parseCpu,
  parseMemory,
  formatCpu,
  formatMemory
};

