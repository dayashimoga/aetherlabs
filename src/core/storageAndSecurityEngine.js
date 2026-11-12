'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Kubernetes CSI Storage & Security Policy Engine
 * Features:
 *   1. StorageCSIEngine: StorageClass, PV, PVC, VolumeSnapshot, WaitForFirstConsumer, RWO vs RWX multi-attach & cross-zone conflicts.
 *   2. SecurityPolicyEngine: RBAC authorization, Pod Security Admission (Privileged, Baseline, Restricted), OPA Gatekeeper, Kyverno validation & mutation.
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
// Storage Quantity Parser (Bytes conversion)
// ---------------------------------------------------------------------------

function parseStorageBytes(raw) {
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
// 1. STORAGE CSI ENGINE
// ---------------------------------------------------------------------------

class StorageCSIEngine {
  constructor(resourceGraph, options = {}) {
    if (!resourceGraph) {
      throw new TypeError('StorageCSIEngine requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
    this.pvCounter = 1;
    this.snapshotCounter = 1;

    this.defaultStorageClass = options.defaultStorageClass || 'standard';
    this._bootstrapDefaultStorageClasses();
  }

  _bootstrapDefaultStorageClasses() {
    if (!this.graph.get('StorageClass', null, 'standard')) {
      this.graph.set({
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: {
          name: 'standard',
          annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' }
        },
        provisioner: 'rancher.io/local-path',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'WaitForFirstConsumer',
        allowVolumeExpansion: true
      });
    }

    if (!this.graph.get('StorageClass', null, 'gp3-immediate')) {
      this.graph.set({
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: { name: 'gp3-immediate' },
        provisioner: 'ebs.csi.aws.com',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'Immediate',
        allowVolumeExpansion: true,
        parameters: { type: 'gp3', iops: '3000' }
      });
    }

    if (!this.graph.get('StorageClass', null, 'efs-rwx')) {
      this.graph.set({
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: { name: 'efs-rwx' },
        provisioner: 'efs.csi.aws.com',
        reclaimPolicy: 'Retain',
        volumeBindingMode: 'Immediate'
      });
    }
  }

  /**
   * Reconciles PVCs and PVs across cluster.
   * Handles WaitForFirstConsumer and dynamic provisioning.
   */
  reconcileStorage() {
    const pvcs = this.graph.list({ kind: 'PersistentVolumeClaim' });
    const pvs = this.graph.list({ kind: 'PersistentVolume' });

    for (const pvc of pvcs) {
      if (pvc.status?.phase === 'Bound' && pvc.spec?.volumeName) {
        continue; // Already bound
      }

      const ns = pvc.metadata.namespace || 'default';
      const scName = pvc.spec?.storageClassName || this.defaultStorageClass;
      const sc = this.graph.get('StorageClass', null, scName);

      const bindingMode = sc?.volumeBindingMode || 'Immediate';
      const reqBytes = parseStorageBytes(pvc.spec?.resources?.requests?.storage || '1Gi');
      const reqModes = pvc.spec?.accessModes || ['ReadWriteOnce'];

      // 1. WaitForFirstConsumer: Wait until a pod referencing this PVC is scheduled to a node
      if (bindingMode === 'WaitForFirstConsumer') {
        const consumingPod = this._findConsumingPod(ns, pvc.metadata.name);
        if (!consumingPod || !consumingPod.spec?.nodeName) {
          pvc.status = { phase: 'Pending', message: 'Waiting for first consumer to be scheduled' };
          this.graph.set(pvc, { skipReconcileNotification: true });
          continue;
        }

        // Pod is scheduled to a node! Identify node's availability zone
        const assignedNode = this.graph.get('Node', null, consumingPod.spec.nodeName);
        const nodeZone = assignedNode?.metadata?.labels?.['topology.kubernetes.io/zone'] || 'us-east-1a';

        // Provision PV constrained to that zone
        this._provisionAndBindPV(pvc, sc, reqBytes, reqModes, nodeZone);
      } else {
        // Immediate Binding: Match existing Available PV or Provision new
        const matchedPV = pvs.find((pv) => {
          if (pv.status?.phase !== 'Available') return false;
          if (pv.spec?.storageClassName && pv.spec.storageClassName !== scName) return false;
          const pvBytes = parseStorageBytes(pv.spec?.capacity?.storage);
          if (pvBytes < reqBytes) return false;
          // Access mode match
          return reqModes.every((m) => (pv.spec?.accessModes || []).includes(m));
        });

        if (matchedPV) {
          this._bindPvandPvc(matchedPV, pvc);
        } else {
          // Dynamically provision PV
          this._provisionAndBindPV(pvc, sc, reqBytes, reqModes, null);
        }
      }
    }
  }

  _findConsumingPod(namespace, pvcName) {
    const pods = this.graph.list({ kind: 'Pod', namespace });
    for (const pod of pods) {
      for (const vol of pod.spec?.volumes || []) {
        if (vol.persistentVolumeClaim?.claimName === pvcName) {
          return pod;
        }
      }
    }
    return null;
  }

  _provisionAndBindPV(pvc, sc, reqBytes, reqModes, zone) {
    const pvName = `pvc-${pvc.metadata.uid || Math.random().toString(16).slice(2, 10)}`;
    const storageStr = pvc.spec?.resources?.requests?.storage || '10Gi';

    const pv = {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: {
        name: pvName,
        labels: zone ? { 'topology.kubernetes.io/zone': zone } : {}
      },
      spec: {
        capacity: { storage: storageStr },
        accessModes: reqModes,
        storageClassName: sc?.metadata?.name || this.defaultStorageClass,
        persistentVolumeReclaimPolicy: sc?.reclaimPolicy || 'Delete',
        claimRef: {
          namespace: pvc.metadata.namespace,
          name: pvc.metadata.name,
          uid: pvc.metadata.uid
        },
        nodeAffinity: zone ? {
          required: {
            nodeSelectorTerms: [{
              matchExpressions: [{
                key: 'topology.kubernetes.io/zone',
                operator: 'In',
                values: [zone]
              }]
            }]
          }
        } : undefined
      },
      status: { phase: 'Bound' }
    };

    this.graph.set(pv, { skipReconcileNotification: true });

    // Update PVC to Bound
    pvc.spec = pvc.spec || {};
    pvc.spec.volumeName = pvName;
    pvc.status = {
      phase: 'Bound',
      accessModes: reqModes,
      capacity: { storage: storageStr }
    };
    this.graph.set(pvc, { skipReconcileNotification: true });
  }

  _bindPvandPvc(pv, pvc) {
    pv.spec = pv.spec || {};
    pv.spec.claimRef = {
      namespace: pvc.metadata.namespace,
      name: pvc.metadata.name,
      uid: pvc.metadata.uid
    };
    pv.status = { phase: 'Bound' };
    this.graph.set(pv, { skipReconcileNotification: true });

    pvc.spec = pvc.spec || {};
    pvc.spec.volumeName = pv.metadata.name;
    pvc.status = {
      phase: 'Bound',
      accessModes: pv.spec.accessModes,
      capacity: pv.spec.capacity
    };
    this.graph.set(pvc, { skipReconcileNotification: true });
  }

  /**
   * Validates volume attachments for a Pod on a target node.
   * Detects RWO Multi-Attach conflicts and Cross-Zone topology errors.
   */
  validatePodVolumeAttachment(pod, targetNodeName) {
    const ns = pod.metadata?.namespace || 'default';
    const targetNode = this.graph.get('Node', null, targetNodeName);
    const targetNodeZone = targetNode?.metadata?.labels?.['topology.kubernetes.io/zone'];

    const volumes = pod.spec?.volumes || [];
    const allPods = this.graph.list({ kind: 'Pod' });

    for (const vol of volumes) {
      if (!vol.persistentVolumeClaim?.claimName) continue;
      const pvcName = vol.persistentVolumeClaim.claimName;
      const pvc = this.graph.get('PersistentVolumeClaim', ns, pvcName);
      if (!pvc) {
        return { allowed: false, error: `PersistentVolumeClaim "${pvcName}" not found in namespace "${ns}"` };
      }

      const pvName = pvc.spec?.volumeName;
      if (!pvName) continue; // PVC not yet bound

      const pv = this.graph.get('PersistentVolume', null, pvName);
      if (!pv) continue;

      // 1. Cross-Zone Topology Check
      const pvZone = pv.metadata?.labels?.['topology.kubernetes.io/zone'];
      if (pvZone && targetNodeZone && pvZone !== targetNodeZone) {
        return {
          allowed: false,
          error: `VolumeScheduling error: PV "${pvName}" is located in zone "${pvZone}", but target node "${targetNodeName}" is in zone "${targetNodeZone}"`
        };
      }

      // 2. Multi-Attach Conflict Check for ReadWriteOnce (RWO)
      const accessModes = pv.spec?.accessModes || [];
      const isRWO = accessModes.includes('ReadWriteOnce') && !accessModes.includes('ReadWriteMany');

      if (isRWO) {
        // Look for other active pods on DIFFERENT nodes currently using this PVC
        for (const otherPod of allPods) {
          if (otherPod.metadata?.uid === pod.metadata?.uid) continue;
          if (otherPod.status?.phase !== 'Running') continue;
          if (!otherPod.spec?.nodeName || otherPod.spec.nodeName === targetNodeName) continue;

          for (const otherVol of otherPod.spec?.volumes || []) {
            if (
              otherVol.persistentVolumeClaim?.claimName === pvcName &&
              (otherPod.metadata?.namespace || 'default') === ns
            ) {
              return {
                allowed: false,
                error: `Multi-Attach error for volume "${pvName}": Volume is already exclusively attached to node "${otherPod.spec.nodeName}" and cannot be attached to node "${targetNodeName}"`
              };
            }
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Creates a VolumeSnapshot of a target PVC
   */
  createSnapshot(snapshotName, namespace, pvcName, snapshotClassName = 'default-snapshotclass') {
    const pvc = this.graph.get('PersistentVolumeClaim', namespace, pvcName);
    if (!pvc) {
      throw new Error(`PVC "${pvcName}" not found in namespace "${namespace}"`);
    }

    const snapshot = {
      apiVersion: 'snapshot.storage.k8s.io/v1',
      kind: 'VolumeSnapshot',
      metadata: {
        name: snapshotName,
        namespace
      },
      spec: {
        volumeSnapshotClassName: snapshotClassName,
        source: { persistentVolumeClaimName: pvcName }
      },
      status: {
        readyToUse: true,
        creationTime: new Date().toISOString(),
        restoreSize: pvc.spec?.resources?.requests?.storage || '10Gi',
        boundVolumeSnapshotContentName: `snapcontent-${snapshotName}`
      }
    };

    this.graph.set(snapshot);
    return snapshot;
  }
}

// ---------------------------------------------------------------------------
// 2. SECURITY POLICY ENGINE (RBAC, PSA, OPA, KYVERNO)
// ---------------------------------------------------------------------------

class SecurityPolicyEngine {
  constructor(resourceGraph) {
    if (!resourceGraph) {
      throw new TypeError('SecurityPolicyEngine requires a valid ResourceGraph instance');
    }
    this.graph = resourceGraph;
  }

  // -------------------------------------------------------------------------
  // A. RBAC AUTHORIZATION
  // -------------------------------------------------------------------------

  /**
   * Checks whether a user or serviceAccount has permission to perform a verb on a resource
   */
  can({ user = 'kubernetes-admin', groups = [], serviceAccount = null, verb = 'get', resource = 'pods', namespace = 'default' }) {
    // Cluster admin superuser bypass
    if (user === 'kubernetes-admin' || user === 'admin' || groups.includes('system:masters')) {
      return { allowed: true, reason: 'Superuser cluster-admin access' };
    }

    const normRes = resource.toLowerCase();
    const normVerb = verb.toLowerCase();

    // 1. Check ClusterRoleBindings
    const clusterRoleBindings = this.graph.list({ kind: 'ClusterRoleBinding' });
    for (const crb of clusterRoleBindings) {
      if (this._matchesSubject(crb.subjects, user, groups, serviceAccount, namespace)) {
        const clusterRole = this.graph.get('ClusterRole', null, crb.roleRef?.name);
        if (clusterRole && this._ruleAllows(clusterRole.rules, normVerb, normRes)) {
          return { allowed: true, reason: `Allowed by ClusterRoleBinding "${crb.metadata.name}" via ClusterRole "${clusterRole.metadata.name}"` };
        }
      }
    }

    // 2. Check RoleBindings in target namespace
    const roleBindings = this.graph.list({ kind: 'RoleBinding', namespace });
    for (const rb of roleBindings) {
      if (this._matchesSubject(rb.subjects, user, groups, serviceAccount, namespace)) {
        let role = null;
        if (rb.roleRef?.kind === 'ClusterRole') {
          role = this.graph.get('ClusterRole', null, rb.roleRef.name);
        } else {
          role = this.graph.get('Role', namespace, rb.roleRef?.name);
        }

        if (role && this._ruleAllows(role.rules, normVerb, normRes)) {
          return { allowed: true, reason: `Allowed by RoleBinding "${rb.metadata.name}" in namespace "${namespace}"` };
        }
      }
    }

    return { allowed: false, reason: `User "${user}" cannot "${verb}" resource "${resource}" in namespace "${namespace}"` };
  }

  _matchesSubject(subjects = [], user, groups, serviceAccount, namespace) {
    for (const s of subjects) {
      if (s.kind === 'User' && s.name === user) return true;
      if (s.kind === 'Group' && groups.includes(s.name)) return true;
      if (s.kind === 'ServiceAccount') {
        const saNs = s.namespace || 'default';
        if (serviceAccount && s.name === serviceAccount && saNs === namespace) return true;
      }
    }
    return false;
  }

  _ruleAllows(rules = [], verb, resource) {
    for (const rule of rules) {
      const verbs = (rule.verbs || []).map((v) => v.toLowerCase());
      const resources = (rule.resources || []).map((r) => r.toLowerCase());

      const verbMatches = verbs.includes('*') || verbs.includes(verb);
      const resMatches = resources.includes('*') || resources.includes(resource);

      if (verbMatches && resMatches) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // B. POD SECURITY ADMISSION (PSA)
  // -------------------------------------------------------------------------

  /**
   * Evaluates Pod Security Admission standards: privileged, baseline, restricted
   */
  evaluatePSA(pod, level = 'baseline') {
    const violations = [];
    const spec = pod.spec || {};
    const containers = [...(spec.containers || []), ...(spec.initContainers || [])];

    if (level === 'privileged') {
      return { allowed: true, level, violations: [] };
    }

    // Baseline Standards
    if (spec.hostNetwork) violations.push('hostNetwork is forbidden in baseline/restricted');
    if (spec.hostPID) violations.push('hostPID is forbidden in baseline/restricted');
    if (spec.hostIPC) violations.push('hostIPC is forbidden in baseline/restricted');

    for (const vol of spec.volumes || []) {
      if (vol.hostPath) violations.push(`hostPath volume "${vol.name}" is forbidden in baseline/restricted`);
    }

    for (const c of containers) {
      const sc = c.securityContext || {};
      if (sc.privileged) violations.push(`privileged container "${c.name}" is forbidden`);
      const caps = sc.capabilities?.add || [];
      const forbiddenCaps = ['SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'ALL'];
      for (const fc of forbiddenCaps) {
        if (caps.includes(fc)) violations.push(`capability "${fc}" on container "${c.name}" is forbidden in baseline`);
      }
    }

    // Restricted Standards (Strict hardening)
    if (level === 'restricted') {
      const podSC = spec.securityContext || {};

      for (const c of containers) {
        const sc = c.securityContext || {};
        if (sc.allowPrivilegeEscalation !== false) {
          violations.push(`container "${c.name}" must set allowPrivilegeEscalation: false`);
        }

        const runAsNonRoot = sc.runAsNonRoot !== undefined ? sc.runAsNonRoot : podSC.runAsNonRoot;
        const runAsUser = sc.runAsUser !== undefined ? sc.runAsUser : podSC.runAsUser;
        if (!runAsNonRoot && (runAsUser === 0 || runAsUser === undefined)) {
          violations.push(`container "${c.name}" must set runAsNonRoot: true or runAsUser > 0`);
        }

        const dropped = sc.capabilities?.drop || [];
        if (!dropped.includes('ALL') && !dropped.includes('all')) {
          violations.push(`container "${c.name}" must drop ALL capabilities (capabilities.drop: ['ALL'])`);
        }
      }
    }

    return {
      allowed: violations.length === 0,
      level,
      violations
    };
  }

  // -------------------------------------------------------------------------
  // C. OPA GATEKEEPER ENGINE
  // -------------------------------------------------------------------------

  /**
   * Validates a resource against active OPA Gatekeeper constraints
   */
  evaluateGatekeeper(resource) {
    const violations = [];
    const constraints = this.graph.list({ kind: 'Constraint' });

    for (const con of constraints) {
      const match = con.spec?.match || {};
      const kinds = match.kinds?.map((k) => k.kinds).flat() || [];
      if (kinds.length > 0 && !kinds.includes(resource.kind)) continue;

      const params = con.spec?.parameters || {};

      // Check required labels constraint
      if (params.labels && Array.isArray(params.labels)) {
        const resLabels = resource.metadata?.labels || {};
        for (const reqLabel of params.labels) {
          if (!(reqLabel in resLabels)) {
            violations.push({
              constraint: con.metadata.name,
              message: `missing required label: "${reqLabel}"`
            });
          }
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations
    };
  }

  // -------------------------------------------------------------------------
  // D. KYVERNO POLICY ENGINE (VALIDATE & MUTATE)
  // -------------------------------------------------------------------------

  /**
   * Applies Kyverno ClusterPolicy mutation and validation rules to a resource
   */
  evaluateKyverno(resource) {
    const policies = this.graph.list({ kind: 'ClusterPolicy' });
    let mutated = structuredClone ? structuredClone(resource) : JSON.parse(JSON.stringify(resource));
    const violations = [];

    for (const policy of policies) {
      for (const rule of policy.spec?.rules || []) {
        const kinds = rule.match?.resources?.kinds || [];
        if (kinds.length > 0 && !kinds.includes(mutated.kind)) continue;

        // Mutation Rule: mutate.patchStrategicMerge
        if (rule.mutate?.patchStrategicMerge) {
          const patch = rule.mutate.patchStrategicMerge;
          mutated = this._deepMerge(mutated, patch);
        }

        // Validation Rule: validate.pattern
        if (rule.validate?.pattern) {
          const pattern = rule.validate.pattern;
          if (!this._matchesPattern(mutated, pattern)) {
            violations.push({
              policy: policy.metadata.name,
              rule: rule.name,
              message: rule.validate.message || 'Kyverno policy validation pattern failed'
            });
          }
        }
      }
    }

    return {
      allowed: violations.length === 0,
      resource: mutated,
      violations
    };
  }

  _matchesPattern(target, pattern) {
    if (typeof pattern !== 'object' || pattern === null) {
      return target === pattern;
    }
    for (const [k, v] of Object.entries(pattern)) {
      if (!(k in target)) return false;
      if (typeof v === 'object' && v !== null) {
        if (!this._matchesPattern(target[k], v)) return false;
      } else if (target[k] !== v) {
        return false;
      }
    }
    return true;
  }

  _deepMerge(target, source) {
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
        target[k] = target[k] || {};
        this._deepMerge(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    }
    return target;
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    StorageCSIEngine,
    SecurityPolicyEngine,
    parseStorageBytes
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.StorageCSIEngine = StorageCSIEngine;
  globalThis.SecurityPolicyEngine = SecurityPolicyEngine;
  globalThis.parseStorageBytes = parseStorageBytes;
}
