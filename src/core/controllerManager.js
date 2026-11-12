'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Kubernetes Controller Manager & Reconcilers
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers (PWA/Mobile), and Desktop WebViews.
 */

const { normalizeKind, isClusterScoped } = require('./resourceGraph');

// Simple isomorphic hash generator for pod templates
function hashTemplate(template) {
  const str = JSON.stringify(template || {});
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

function generateUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class ControllerManager {
  constructor(resourceGraph) {
    if (!resourceGraph) {
      throw new TypeError('ControllerManager requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
    this.ipCounter = 10;
    this.clusterIpCounter = 100;
    this.nodePortCounter = 30000;
    this.isReconciling = false;

    // Auto-subscribe to ResourceGraph events
    this._unsubAdded = this.graph.on('Added', () => this.scheduleReconcile());
    this._unsubModified = this.graph.on('Modified', () => this.scheduleReconcile());
    this._unsubDeleted = this.graph.on('Deleted', () => this.scheduleReconcile());
  }

  destroy() {
    if (this._unsubAdded) this._unsubAdded();
    if (this._unsubModified) this._unsubModified();
    if (this._unsubDeleted) this._unsubDeleted();
  }

  nextPodIP() {
    this.ipCounter++;
    const octet = (this.ipCounter % 240) + 10;
    return `10.244.1.${octet}`;
  }

  nextClusterIP() {
    this.clusterIpCounter++;
    const octet = (this.clusterIpCounter % 240) + 1;
    return `10.96.0.${octet}`;
  }

  nextNodePort() {
    this.nodePortCounter++;
    if (this.nodePortCounter > 32767) this.nodePortCounter = 30000;
    return this.nodePortCounter;
  }

  scheduleReconcile() {
    if (this.isReconciling) return;
    this.reconcile();
  }

  /**
   * Main reconciliation convergence loop
   * Runs controllers until cluster graph reaches steady state (max 10 iterations)
   */
  reconcile() {
    if (this.isReconciling) return;
    this.isReconciling = true;

    try {
      let iterations = 0;
      const maxIterations = 10;

      while (iterations < maxIterations) {
        iterations++;
        const versionBefore = this.graph.versionCounter;

        this.reconcileNodes();
        this.reconcileStorage();
        this.reconcileDeployments();
        this.reconcileReplicaSets();
        this.reconcileStatefulSets();
        this.reconcileDaemonSets();
        this.reconcileJobsAndCronJobs();
        this.reconcilePods();
        this.reconcileServicesAndEndpoints();

        // If no mutations occurred during this pass, cluster graph has converged!
        if (this.graph.versionCounter === versionBefore) {
          break;
        }
      }
    } finally {
      this.isReconciling = false;
    }
  }

  reconcileAll() {
    return this.reconcile();
  }

  // -------------------------------------------------------------
  // 1. Node Lifecycle Controller
  // -------------------------------------------------------------
  reconcileNodes() {
    const nodes = this.graph.list({ kind: 'Node' });
    for (const node of nodes) {
      if (!node.status) node.status = {};
      if (!node.status.phase) node.status.phase = 'Ready';
      if (!node.status.conditions) {
        node.status.conditions = [
          { type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' },
          { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' },
          { type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure' },
          { type: 'PIDPressure', status: 'False', reason: 'KubeletHasSufficientPIDs' }
        ];
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Storage & Dynamic Volume Provisioning Controller
  // -------------------------------------------------------------
  reconcileStorage() {
    const pvcs = this.graph.list({ kind: 'PersistentVolumeClaim' });
    const storageClasses = this.graph.list({ kind: 'StorageClass' });

    for (const pvc of pvcs) {
      if (pvc.metadata.deletionTimestamp) continue;
      const scName = pvc.spec && pvc.spec.storageClassName;

      if (scName && storageClasses.length > 0) {
        const scExists = storageClasses.some((sc) => sc.metadata.name === scName);
        if (!scExists) {
          pvc.status = {
            phase: 'Pending',
            message: `StorageClass "${scName}" not found`
          };
          this.graph.set(pvc, { skipReconcileNotification: true });
          continue;
        }
      }

      if (!pvc.status || pvc.status.phase !== 'Bound') {
        const pvName = `pv-${pvc.metadata.name}`;
        let pv = this.graph.get('PersistentVolume', null, pvName);
        if (!pv) {
          pv = {
            apiVersion: 'v1',
            kind: 'PersistentVolume',
            metadata: { name: pvName },
            spec: {
              storageClassName: scName || 'standard',
              capacity: (pvc.spec && pvc.spec.resources && pvc.spec.resources.requests) || { storage: '10Gi' },
              accessModes: (pvc.spec && pvc.spec.accessModes) || ['ReadWriteOnce'],
              claimRef: {
                name: pvc.metadata.name,
                namespace: pvc.metadata.namespace || 'default',
                uid: pvc.metadata.uid
              }
            },
            status: { phase: 'Bound' }
          };
          this.graph.set(pv, { skipReconcileNotification: true });
        }

        pvc.status = {
          phase: 'Bound',
          volumeName: pvName,
          capacity: pv.spec.capacity
        };
        this.graph.set(pvc, { skipReconcileNotification: true });
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Deployment Controller (Deployments -> ReplicaSets)
  // -------------------------------------------------------------
  reconcileDeployments() {
    const deployments = this.graph.list({ kind: 'Deployment' });

    for (const dep of deployments) {
      if (dep.metadata.deletionTimestamp) continue;

      const ns = dep.metadata.namespace || 'default';
      const desiredReplicas = dep.spec && dep.spec.replicas !== undefined ? Number(dep.spec.replicas) : 1;
      const template = dep.spec && dep.spec.template ? dep.spec.template : {
        metadata: { labels: { app: dep.metadata.name } },
        spec: { containers: [{ name: dep.metadata.name, image: 'nginx:1.27-alpine' }] }
      };

      const templateHash = hashTemplate(template);
      const rsName = `${dep.metadata.name}-${templateHash}`;
      const rsLabels = {
        ...((dep.spec && dep.spec.selector && dep.spec.selector.matchLabels) || {}),
        ...((template.metadata && template.metadata.labels) || {}),
        'pod-template-hash': templateHash
      };

      let currentRs = this.graph.get('ReplicaSet', ns, rsName);
      if (!currentRs) {
        currentRs = {
          apiVersion: 'apps/v1',
          kind: 'ReplicaSet',
          metadata: {
            name: rsName,
            namespace: ns,
            labels: rsLabels,
            ownerReferences: [
              {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                name: dep.metadata.name,
                uid: dep.metadata.uid,
                controller: true
              }
            ]
          },
          spec: {
            replicas: desiredReplicas,
            selector: { matchLabels: rsLabels },
            template: JSON.parse(JSON.stringify(template))
          },
          status: { replicas: 0, readyReplicas: 0, availableReplicas: 0 }
        };
        this.graph.set(currentRs, { skipReconcileNotification: true });
      } else {
        if (currentRs.spec.replicas !== desiredReplicas) {
          currentRs.spec.replicas = desiredReplicas;
          this.graph.set(currentRs, { skipReconcileNotification: true });
        }
      }

      // Rollout revision tracking
      if (!dep.metadata.annotations) dep.metadata.annotations = {};
      const currentRev = Number(dep.metadata.annotations['deployment.kubernetes.io/revision'] || 1);
      dep.metadata.annotations['deployment.kubernetes.io/revision'] = String(currentRev);

      // Aggregate status from child ReplicaSets
      const childRSs = this.graph.getChildren(dep.metadata.uid).filter((c) => c.kind === 'ReplicaSet');
      let totalReplicas = 0;
      let readyReplicas = 0;
      let updatedReplicas = 0;

      for (const rs of childRSs) {
        totalReplicas += (rs.status && rs.status.replicas) || 0;
        readyReplicas += (rs.status && rs.status.readyReplicas) || 0;
        if (rs.metadata.name === rsName) {
          updatedReplicas = (rs.status && rs.status.replicas) || 0;
        }
      }

      dep.status = {
        observedGeneration: dep.metadata.generation,
        replicas: totalReplicas,
        updatedReplicas,
        readyReplicas,
        availableReplicas: readyReplicas,
        conditions: [
          {
            type: 'Available',
            status: readyReplicas >= desiredReplicas ? 'True' : 'False',
            reason: readyReplicas >= desiredReplicas ? 'MinimumReplicasAvailable' : 'ReplicaSetUpdating'
          },
          {
            type: 'Progressing',
            status: 'True',
            reason: 'NewReplicaSetAvailable',
            message: `ReplicaSet "${rsName}" has successfully progressed.`
          }
        ]
      };
      this.graph.set(dep, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 4. ReplicaSet Controller (ReplicaSets -> Pods)
  // -------------------------------------------------------------
  reconcileReplicaSets() {
    const replicaSets = this.graph.list({ kind: 'ReplicaSet' });

    for (const rs of replicaSets) {
      if (rs.metadata.deletionTimestamp) continue;

      const ns = rs.metadata.namespace || 'default';
      const desiredReplicas = rs.spec && rs.spec.replicas !== undefined ? Number(rs.spec.replicas) : 1;
      const template = rs.spec && rs.spec.template ? rs.spec.template : {
        metadata: { labels: { app: rs.metadata.name } },
        spec: { containers: [{ name: 'app', image: 'nginx:1.27-alpine' }] }
      };

      const ownedPods = this.graph.getChildren(rs.metadata.uid).filter((c) => c.kind === 'Pod');

      // Scale down excess pods
      if (ownedPods.length > desiredReplicas) {
        const excess = ownedPods.slice(desiredReplicas);
        for (const p of excess) {
          this.graph.delete(p.metadata.uid);
        }
      }

      // Scale up missing pods
      if (ownedPods.length < desiredReplicas) {
        const needed = desiredReplicas - ownedPods.length;
        for (let i = 0; i < needed; i++) {
          const podSuffix = generateUID().slice(0, 5);
          const podName = `${rs.metadata.name}-${podSuffix}`;
          const podLabels = {
            ...((template.metadata && template.metadata.labels) || {}),
            ...((rs.spec && rs.spec.selector && rs.spec.selector.matchLabels) || {})
          };

          const newPod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: podLabels,
              ownerReferences: [
                {
                  apiVersion: 'apps/v1',
                  kind: 'ReplicaSet',
                  name: rs.metadata.name,
                  uid: rs.metadata.uid,
                  controller: true
                }
              ]
            },
            spec: JSON.parse(JSON.stringify(template.spec || {})),
            status: { phase: 'Pending', podIP: '<none>' }
          };
          this.graph.set(newPod, { skipReconcileNotification: true });
        }
      }

      // Update ReplicaSet status
      const activePods = this.graph.getChildren(rs.metadata.uid).filter((c) => c.kind === 'Pod');
      const readyPods = activePods.filter((p) => p.status && p.status.phase === 'Running' && p.status.ready === '1/1');

      rs.status = {
        observedGeneration: rs.metadata.generation,
        replicas: activePods.length,
        readyReplicas: readyPods.length,
        availableReplicas: readyPods.length
      };
      this.graph.set(rs, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 5. StatefulSet Controller (Ordered Indexing & Volume Claims)
  // -------------------------------------------------------------
  reconcileStatefulSets() {
    const statefulSets = this.graph.list({ kind: 'StatefulSet' });

    for (const sts of statefulSets) {
      if (sts.metadata.deletionTimestamp) continue;

      const ns = sts.metadata.namespace || 'default';
      const desiredReplicas = sts.spec && sts.spec.replicas !== undefined ? Number(sts.spec.replicas) : 1;
      const template = sts.spec && sts.spec.template ? sts.spec.template : {
        metadata: { labels: { app: sts.metadata.name } },
        spec: { containers: [{ name: sts.metadata.name, image: 'nginx:1.27-alpine' }] }
      };

      const existingPods = this.graph.getChildren(sts.metadata.uid).filter((c) => c.kind === 'Pod');
      const podMap = new Map();
      for (const p of existingPods) {
        const parts = p.metadata.name.split('-');
        const ordinal = Number(parts[parts.length - 1]);
        if (!isNaN(ordinal)) podMap.set(ordinal, p);
      }

      // Reconcile VolumeClaimTemplates -> PVCs
      if (Array.isArray(sts.spec && sts.spec.volumeClaimTemplates)) {
        for (let i = 0; i < desiredReplicas; i++) {
          for (const vcTpl of sts.spec.volumeClaimTemplates) {
            const pvcName = `${vcTpl.metadata.name}-${sts.metadata.name}-${i}`;
            if (!this.graph.get('PersistentVolumeClaim', ns, pvcName)) {
              const pvc = {
                apiVersion: 'v1',
                kind: 'PersistentVolumeClaim',
                metadata: {
                  name: pvcName,
                  namespace: ns,
                  labels: { app: sts.metadata.name, 'statefulset.kubernetes.io/pod-name': `${sts.metadata.name}-${i}` }
                },
                spec: JSON.parse(JSON.stringify(vcTpl.spec || {}))
              };
              this.graph.set(pvc, { skipReconcileNotification: true });
            }
          }
        }
      }

      // Ordered pod creation
      for (let i = 0; i < desiredReplicas; i++) {
        if (!podMap.has(i)) {
          const podName = `${sts.metadata.name}-${i}`;
          const podLabels = {
            ...((template.metadata && template.metadata.labels) || {}),
            ...((sts.spec && sts.spec.selector && sts.spec.selector.matchLabels) || {}),
            'statefulset.kubernetes.io/pod-name': podName
          };

          const newPod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: podLabels,
              ownerReferences: [
                {
                  apiVersion: 'apps/v1',
                  kind: 'StatefulSet',
                  name: sts.metadata.name,
                  uid: sts.metadata.uid,
                  controller: true
                }
              ]
            },
            spec: JSON.parse(JSON.stringify(template.spec || {})),
            status: { phase: 'Pending', podIP: '<none>' }
          };
          this.graph.set(newPod, { skipReconcileNotification: true });
        }
      }

      // Ordered pod termination: highest ordinal first
      for (const [ordinal, p] of podMap.entries()) {
        if (ordinal >= desiredReplicas) {
          this.graph.delete(p.metadata.uid);
        }
      }

      const currentPods = this.graph.getChildren(sts.metadata.uid).filter((c) => c.kind === 'Pod');
      const readyPods = currentPods.filter((p) => p.status && p.status.phase === 'Running');

      sts.status = {
        observedGeneration: sts.metadata.generation,
        replicas: currentPods.length,
        readyReplicas: readyPods.length,
        currentReplicas: currentPods.length,
        updatedReplicas: currentPods.length
      };
      this.graph.set(sts, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 6. DaemonSet Controller (1 Pod per matching Node)
  // -------------------------------------------------------------
  reconcileDaemonSets() {
    const daemonSets = this.graph.list({ kind: 'DaemonSet' });
    const allNodes = this.graph.list({ kind: 'Node' });

    for (const ds of daemonSets) {
      if (ds.metadata.deletionTimestamp) continue;

      const ns = ds.metadata.namespace || 'default';
      const template = ds.spec && ds.spec.template ? ds.spec.template : {
        metadata: { labels: { app: ds.metadata.name } },
        spec: { containers: [{ name: ds.metadata.name, image: 'busybox:1.36' }] }
      };

      const tolerations = (template.spec && template.spec.tolerations) || [];
      const nodeSelector = template.spec && template.spec.nodeSelector;

      // Filter matching schedulable nodes
      const eligibleNodes = allNodes.filter((node) => {
        if (node.spec && node.spec.unschedulable) return false;

        // Check nodeSelector
        if (nodeSelector && typeof nodeSelector === 'object') {
          const nLabels = node.metadata.labels || {};
          const matches = Object.entries(nodeSelector).every(([k, v]) => nLabels[k] === String(v));
          if (!matches) return false;
        }

        // Check node taints
        const taints = (node.spec && node.spec.taints) || node.metadata.taints || [];
        for (const taint of taints) {
          const tolerated = tolerations.some(
            (t) => t.key === taint.key || t.operator === 'Exists'
          );
          if (!tolerated && taint.effect === 'NoSchedule') return false;
        }

        return true;
      });

      const existingPods = this.graph.getChildren(ds.metadata.uid).filter((c) => c.kind === 'Pod');
      const podsByNode = new Map();
      for (const p of existingPods) {
        if (p.spec && p.spec.nodeName) {
          podsByNode.set(p.spec.nodeName, p);
        }
      }

      // Ensure 1 pod per eligible node
      for (const node of eligibleNodes) {
        const nodeName = node.metadata.name;
        if (!podsByNode.has(nodeName)) {
          const podName = `${ds.metadata.name}-${nodeName}`;
          const podLabels = {
            ...((template.metadata && template.metadata.labels) || {}),
            ...((ds.spec && ds.spec.selector && ds.spec.selector.matchLabels) || {})
          };

          const newPod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: podLabels,
              ownerReferences: [
                {
                  apiVersion: 'apps/v1',
                  kind: 'DaemonSet',
                  name: ds.metadata.name,
                  uid: ds.metadata.uid,
                  controller: true
                }
              ]
            },
            spec: {
              ...(JSON.parse(JSON.stringify(template.spec || {}))),
              nodeName
            },
            status: { phase: 'Pending', podIP: '<none>' }
          };
          this.graph.set(newPod, { skipReconcileNotification: true });
        }
      }

      // Remove pods from ineligible nodes
      for (const [nodeName, p] of podsByNode.entries()) {
        const stillEligible = eligibleNodes.some((n) => n.metadata.name === nodeName);
        if (!stillEligible) {
          this.graph.delete(p.metadata.uid);
        }
      }

      const currentPods = this.graph.getChildren(ds.metadata.uid).filter((c) => c.kind === 'Pod');
      const readyPods = currentPods.filter((p) => p.status && p.status.phase === 'Running');

      ds.status = {
        desiredNumberScheduled: eligibleNodes.length,
        currentNumberScheduled: currentPods.length,
        numberReady: readyPods.length
      };
      this.graph.set(ds, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 7. Job & CronJob Controller
  // -------------------------------------------------------------
  reconcileJobsAndCronJobs() {
    // 7a. CronJobs
    const cronJobs = this.graph.list({ kind: 'CronJob' });
    for (const cj of cronJobs) {
      if (cj.metadata.deletionTimestamp) continue;
      const ns = cj.metadata.namespace || 'default';
      const jobName = `${cj.metadata.name}-run-1`;

      if (!this.graph.get('Job', ns, jobName)) {
        const jobTpl = (cj.spec && cj.spec.jobTemplate && cj.spec.jobTemplate.spec) || {};
        const job = {
          apiVersion: 'batch/v1',
          kind: 'Job',
          metadata: {
            name: jobName,
            namespace: ns,
            ownerReferences: [
              {
                apiVersion: 'batch/v1',
                kind: 'CronJob',
                name: cj.metadata.name,
                uid: cj.metadata.uid,
                controller: true
              }
            ]
          },
          spec: JSON.parse(JSON.stringify(jobTpl)),
          status: { active: 1, succeeded: 0 }
        };
        this.graph.set(job, { skipReconcileNotification: true });
      }

      cj.status = {
        active: 1,
        lastScheduleTime: new Date().toISOString()
      };
      this.graph.set(cj, { skipReconcileNotification: true });
    }

    // 7b. Jobs
    const jobs = this.graph.list({ kind: 'Job' });
    for (const job of jobs) {
      if (job.metadata.deletionTimestamp) continue;
      const ns = job.metadata.namespace || 'default';
      const completions = (job.spec && job.spec.completions) || 1;
      const template = (job.spec && job.spec.template) || {
        spec: { containers: [{ name: job.metadata.name, image: 'busybox:1.36' }] }
      };

      const childPods = this.graph.getChildren(job.metadata.uid).filter((c) => c.kind === 'Pod');
      if (childPods.length < completions) {
        for (let i = childPods.length; i < completions; i++) {
          const podName = `${job.metadata.name}-pod-${i + 1}`;
          const newPod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: { 'job-name': job.metadata.name },
              ownerReferences: [
                {
                  apiVersion: 'batch/v1',
                  kind: 'Job',
                  name: job.metadata.name,
                  uid: job.metadata.uid,
                  controller: true
                }
              ]
            },
            spec: JSON.parse(JSON.stringify(template.spec || {})),
            status: { phase: 'Running', ready: '1/1' }
          };
          this.graph.set(newPod, { skipReconcileNotification: true });
        }
      }

      job.status = {
        succeeded: completions,
        active: 0,
        conditions: [{ type: 'Complete', status: 'True' }]
      };
      this.graph.set(job, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 8. Pod Health & Scheduling Engine
  // -------------------------------------------------------------
  reconcilePods() {
    const pods = this.graph.list({ kind: 'Pod' });
    const nodes = this.graph.list({ kind: 'Node' });

    for (const pod of pods) {
      if (pod.metadata.deletionTimestamp) continue;

      const health = this._evaluatePodHealth(pod, nodes);
      if (!pod.status) pod.status = {};

      pod.status.phase = health.phase;
      pod.status.reason = health.reason;
      pod.status.ready = health.ready;
      pod.status.restarts = health.restarts;
      pod.status.message = health.message;
      if (health.nodeName) pod.status.nodeName = health.nodeName;

      if (health.phase === 'Running') {
        if (!pod.status.podIP || pod.status.podIP === '<none>') {
          pod.status.podIP = this.nextPodIP();
        }
      } else {
        pod.status.podIP = '<none>';
      }

      this.graph.set(pod, { skipReconcileNotification: true });
    }
  }

  _evaluatePodHealth(pod, nodes) {
    const spec = pod.spec || {};
    const containers = spec.containers || [{ name: 'app', image: 'nginx:1.27-alpine' }];
    const firstContainer = containers[0] || { name: 'app', image: 'nginx:1.27-alpine' };
    const image = String(firstContainer.image || '');
    const ns = (pod.metadata && pod.metadata.namespace) || 'default';

    // 1. Resource capacity / CPU overflow
    const requests = (firstContainer.resources && firstContainer.resources.requests) || {};
    const limits = (firstContainer.resources && firstContainer.resources.limits) || {};
    const cpuReq = String(requests.cpu || '100m');
    const cpuMillis = cpuReq.endsWith('m') ? parseInt(cpuReq, 10) : parseFloat(cpuReq) * 1000;
    if (cpuMillis > 8000) {
      return {
        phase: 'Pending',
        reason: 'Unschedulable',
        ready: '0/1',
        restarts: 0,
        message: '0/3 nodes are available: 3 Insufficient cpu.'
      };
    }

    // 2. GPU request & taint toleration
    const gpuReq = Number(limits['nvidia.com/gpu'] || requests['nvidia.com/gpu'] || 0);
    if (gpuReq > 0) {
      const tolerations = spec.tolerations || [];
      const hasGpuToleration = tolerations.some(
        (t) => t.key === 'nvidia.com/gpu' || t.operator === 'Exists'
      );
      if (!hasGpuToleration) {
        return {
          phase: 'Pending',
          reason: 'Unschedulable',
          ready: '0/1',
          restarts: 0,
          message: '0/3 nodes are available: 1 node(s) had untolerated taint {nvidia.com/gpu: present}, 2 Insufficient nvidia.com/gpu.'
        };
      }
    }

    // 3. Broken images
    if (
      image.includes('broken') ||
      image.includes('invalid') ||
      image.includes('missing') ||
      image.includes('nonexistent')
    ) {
      return {
        phase: 'Pending',
        reason: 'ImagePullBackOff',
        ready: '0/1',
        restarts: 0,
        message: `Back-off pulling image "${image}": manifest for ${image} not found`
      };
    }

    // 4. Missing secret reference
    if (firstContainer.envFromSecret) {
      const sec = this.graph.get('Secret', ns, firstContainer.envFromSecret);
      if (!sec) {
        return {
          phase: 'Running',
          reason: 'CreateContainerConfigError',
          ready: '0/1',
          restarts: 2,
          message: `secret "${firstContainer.envFromSecret}" not found`
        };
      }
    }

    // 5. CrashLoopBackOff triggers
    const cmd = Array.isArray(firstContainer.command)
      ? firstContainer.command.join(' ')
      : String(firstContainer.command || '');
    const envList = Array.isArray(firstContainer.env) ? firstContainer.env : [];
    const hasCrashEnv = envList.some(
      (e) =>
        (e.name === 'CRASH_ON_START' && String(e.value) === 'true') ||
        (e.name === 'DB_PASSWORD' && String(e.value) === 'INVALID_SECRET')
    );

    if (cmd.includes('exit 1') || cmd.includes('/bin/false') || hasCrashEnv) {
      return {
        phase: 'Running',
        reason: 'CrashLoopBackOff',
        ready: '0/1',
        restarts: 5,
        message: 'Back-off 5m0s restarting failed container'
      };
    }

    // 6. OOMKilled trigger
    const memLimit = String(limits.memory || '');
    if (memLimit === '4Mi' || memLimit === '8Mi') {
      return {
        phase: 'Running',
        reason: 'OOMKilled',
        ready: '0/1',
        restarts: 4,
        message: `Container exceeded memory limit (${memLimit}) and was OOMKilled`
      };
    }

    // 7. Severe CPU Throttling
    const cpuLimit = String(limits.cpu || '');
    if (cpuLimit === '5m' || cpuLimit === '10m') {
      return {
        phase: 'Running',
        reason: 'CrashLoopBackOff',
        ready: '0/1',
        restarts: 6,
        message: `Liveness probe failed: HTTP probe timed out due to severe CFS CPU quota throttling (limits.cpu=${cpuLimit})`
      };
    }

    // 8. IRSA IAM Role Requirement
    const requireIrsa = envList.some((e) => e.name === 'REQUIRE_IRSA_ROLE' && String(e.value) === 'true');
    if (requireIrsa) {
      const saName = spec.serviceAccountName || 'default';
      const sa = this.graph.get('ServiceAccount', ns, saName);
      const roleArn = sa && sa.metadata && sa.metadata.annotations && sa.metadata.annotations['eks.amazonaws.com/role-arn'];
      if (!roleArn) {
        return {
          phase: 'Running',
          reason: 'CrashLoopBackOff',
          ready: '0/1',
          restarts: 5,
          message: `AccessDenied: WebIdentityErr: ServiceAccount "${saName}" missing annotation "eks.amazonaws.com/role-arn"`
        };
      }
    }

    // 9. NodeSelector constraints
    const readyNodes = nodes.filter(
      (n) => (!n.spec || !n.spec.unschedulable) && (!n.status || n.status.phase !== 'NotReady')
    );
    if (readyNodes.length === 0) {
      return {
        phase: 'Pending',
        reason: 'Unschedulable',
        ready: '0/1',
        restarts: 0,
        message: '0/3 nodes are available: all nodes are NotReady or cordoned.'
      };
    }

    if (spec.nodeSelector && typeof spec.nodeSelector === 'object') {
      const selectorEntries = Object.entries(spec.nodeSelector);
      const matchingNode = readyNodes.find((n) => {
        const nLabels = (n.metadata && n.metadata.labels) || {};
        return selectorEntries.every(([k, v]) => String(nLabels[k]) === String(v));
      });
      if (!matchingNode) {
        return {
          phase: 'Pending',
          reason: 'Unschedulable',
          ready: '0/1',
          restarts: 0,
          message: `0/${readyNodes.length} nodes are available: node(s) didn't match Pod's nodeSelector.`
        };
      }
    }

    // 10. NodeNotReady check
    if (spec.nodeName) {
      const assigned = this.graph.get('Node', null, spec.nodeName);
      if (assigned && assigned.status && assigned.status.phase === 'NotReady') {
        return {
          phase: 'Pending',
          reason: 'NodeNotReady',
          ready: '0/1',
          restarts: 1,
          nodeName: spec.nodeName,
          message: `Node "${spec.nodeName}" is NotReady (kubelet stopped posting node status)`
        };
      }
    }

    return {
      phase: 'Running',
      reason: 'Running',
      ready: `${containers.length}/${containers.length}`,
      restarts: 0,
      nodeName: gpuReq > 0 ? 'kubelabs-worker-gpu-02' : 'kubelabs-worker-01',
      message: 'All containers ready'
    };
  }

  // -------------------------------------------------------------
  // 9. Service & Endpoints Controller
  // -------------------------------------------------------------
  reconcileServicesAndEndpoints() {
    const services = this.graph.list({ kind: 'Service' });

    for (const svc of services) {
      if (svc.metadata.deletionTimestamp) continue;
      const ns = svc.metadata.namespace || 'default';
      const selector = (svc.spec && svc.spec.selector) || {};
      const selectorKeys = Object.keys(selector);
      const ports = (svc.spec && svc.spec.ports) || [{ port: 80, targetPort: 80 }];
      const targetPort = ports[0] ? (ports[0].targetPort || ports[0].port) : 80;

      // Allocate ClusterIP if absent
      if (!svc.spec) svc.spec = {};
      if (!svc.spec.clusterIP && svc.spec.type !== 'ExternalName') {
        svc.spec.clusterIP = this.nextClusterIP();
      }

      // Allocate NodePort if type is NodePort or LoadBalancer
      if (svc.spec.type === 'NodePort' || svc.spec.type === 'LoadBalancer') {
        for (const p of ports) {
          if (!p.nodePort) p.nodePort = this.nextNodePort();
        }
      }

      // Find ready matching pods
      const matchingPods = this.graph.list({ kind: 'Pod', namespace: ns }).filter((p) => {
        if (!p.status || p.status.phase !== 'Running' || p.status.reason !== 'Running') return false;
        if (selectorKeys.length === 0) return false;
        const pLabels = (p.metadata && p.metadata.labels) || {};
        return selectorKeys.every((k) => pLabels[k] === selector[k]);
      });

      const endpointAddresses = matchingPods.map((p) => ({
        ip: p.status.podIP,
        targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid }
      }));

      // Create or update Endpoints resource
      let ep = this.graph.get('Endpoints', ns, svc.metadata.name);
      if (!ep) {
        ep = {
          apiVersion: 'v1',
          kind: 'Endpoints',
          metadata: {
            name: svc.metadata.name,
            namespace: ns,
            labels: svc.metadata.labels || {},
            ownerReferences: [
              {
                apiVersion: 'v1',
                kind: 'Service',
                name: svc.metadata.name,
                uid: svc.metadata.uid,
                controller: true
              }
            ]
          },
          subsets: [
            {
              addresses: endpointAddresses,
              ports: ports.map((p) => ({ port: p.port, name: p.name || 'http', protocol: p.protocol || 'TCP' }))
            }
          ]
        };
        this.graph.set(ep, { skipReconcileNotification: true });
      } else {
        ep.subsets = [
          {
            addresses: endpointAddresses,
            ports: ports.map((p) => ({ port: p.port, name: p.name || 'http', protocol: p.protocol || 'TCP' }))
          }
        ];
        this.graph.set(ep, { skipReconcileNotification: true });
      }

      // Update Service status
      const endpointsList = endpointAddresses.map((a) => `${a.ip}:${targetPort}`);
      svc.status = {
        loadBalancer: svc.spec.type === 'LoadBalancer' ? { ingress: [{ ip: '192.168.10.200' }] } : {},
        clusterIP: svc.spec.clusterIP,
        endpoints: endpointsList,
        endpointCount: endpointsList.length
      };
      this.graph.set(svc, { skipReconcileNotification: true });
    }
  }

  // -------------------------------------------------------------
  // 10. RBAC Authorization Evaluator
  // -------------------------------------------------------------
  can({ user = 'kubernetes-admin', serviceAccount = null, verb = 'get', resource = 'pods', namespace = 'default' }) {
    if (user === 'kubernetes-admin' || user === 'system:admin') {
      return true;
    }

    const normVerb = verb.toLowerCase();
    const normResource = resource.toLowerCase();

    // Check ClusterRoleBindings
    const clusterRoleBindings = this.graph.list({ kind: 'ClusterRoleBinding' });
    for (const crb of clusterRoleBindings) {
      const subjects = crb.subjects || [];
      const matches = subjects.some((sub) => {
        if (serviceAccount && sub.kind === 'ServiceAccount') {
          return sub.name === serviceAccount && (!sub.namespace || sub.namespace === namespace);
        }
        if (sub.kind === 'User' && sub.name === user) return true;
        if (sub.kind === 'Group' && sub.name === 'system:masters') return true;
        return false;
      });

      if (matches && crb.roleRef) {
        const role = this.graph.get('ClusterRole', null, crb.roleRef.name);
        if (role && this._checkRules(role.rules, normVerb, normResource)) {
          return true;
        }
      }
    }

    // Check RoleBindings in target namespace
    const roleBindings = this.graph.list({ kind: 'RoleBinding', namespace });
    for (const rb of roleBindings) {
      const subjects = rb.subjects || [];
      const matches = subjects.some((sub) => {
        if (serviceAccount && sub.kind === 'ServiceAccount') {
          return sub.name === serviceAccount && (!sub.namespace || sub.namespace === namespace);
        }
        if (sub.kind === 'User' && sub.name === user) return true;
        return false;
      });

      if (matches && rb.roleRef) {
        const role = rb.roleRef.kind === 'ClusterRole'
          ? this.graph.get('ClusterRole', null, rb.roleRef.name)
          : this.graph.get('Role', namespace, rb.roleRef.name);
        if (role && this._checkRules(role.rules, normVerb, normResource)) {
          return true;
        }
      }
    }

    return false;
  }

  _checkRules(rules, verb, resource) {
    if (!Array.isArray(rules)) return false;
    return rules.some((rule) => {
      const verbs = (rule.verbs || []).map((v) => v.toLowerCase());
      const resources = (rule.resources || []).map((r) => r.toLowerCase());
      const verbMatches = verbs.includes('*') || verbs.includes(verb);
      const resMatches = resources.includes('*') || resources.includes(resource);
      return verbMatches && resMatches;
    });
  }
}

// Dual CommonJS & Browser export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ControllerManager, hashTemplate };
}
if (typeof globalThis !== 'undefined') {
  globalThis.ControllerManager = ControllerManager;
  globalThis.hashTemplate = hashTemplate;
}
