'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Cluster Resource Graph & Directed Acyclic Graph (DAG) State
 * Pure ES2024 module with zero external dependencies.
 * Runs identically inside Node.js 22+, Web Workers (PWA/Mobile), and Desktop WebViews.
 */

const KIND_ALIASES = {
  po: 'Pod',
  pod: 'Pod',
  pods: 'Pod',
  deploy: 'Deployment',
  deployment: 'Deployment',
  deployments: 'Deployment',
  rs: 'ReplicaSet',
  replicaset: 'ReplicaSet',
  replicasets: 'ReplicaSet',
  sts: 'StatefulSet',
  statefulset: 'StatefulSet',
  statefulsets: 'StatefulSet',
  ds: 'DaemonSet',
  daemonset: 'DaemonSet',
  daemonsets: 'DaemonSet',
  svc: 'Service',
  service: 'Service',
  services: 'Service',
  ep: 'Endpoints',
  endpoints: 'Endpoints',
  ing: 'Ingress',
  ingress: 'Ingress',
  ingresses: 'Ingress',
  netpol: 'NetworkPolicy',
  networkpolicy: 'NetworkPolicy',
  networkpolicies: 'NetworkPolicy',
  cm: 'ConfigMap',
  configmap: 'ConfigMap',
  configmaps: 'ConfigMap',
  sec: 'Secret',
  secret: 'Secret',
  secrets: 'Secret',
  pvc: 'PersistentVolumeClaim',
  persistentvolumeclaim: 'PersistentVolumeClaim',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  pv: 'PersistentVolume',
  persistentvolume: 'PersistentVolume',
  persistentvolumes: 'PersistentVolume',
  sa: 'ServiceAccount',
  serviceaccount: 'ServiceAccount',
  serviceaccounts: 'ServiceAccount',
  role: 'Role',
  roles: 'Role',
  rolebinding: 'RoleBinding',
  rolebindings: 'RoleBinding',
  clusterrole: 'ClusterRole',
  clusterroles: 'ClusterRole',
  clusterrolebinding: 'ClusterRoleBinding',
  clusterrolebindings: 'ClusterRoleBinding',
  no: 'Node',
  node: 'Node',
  nodes: 'Node',
  ns: 'Namespace',
  namespace: 'Namespace',
  namespaces: 'Namespace',
  hpa: 'HorizontalPodAutoscaler',
  horizontalpodautoscaler: 'HorizontalPodAutoscaler',
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  vpa: 'VerticalPodAutoscaler',
  verticalpodautoscaler: 'VerticalPodAutoscaler',
  verticalpodautoscalers: 'VerticalPodAutoscaler',
  job: 'Job',
  jobs: 'Job',
  cj: 'CronJob',
  cronjob: 'CronJob',
  cronjobs: 'CronJob',
  pdb: 'PodDisruptionBudget',
  poddisruptionbudget: 'PodDisruptionBudget',
  sc: 'StorageClass',
  storageclass: 'StorageClass',
  pc: 'PriorityClass',
  priorityclass: 'PriorityClass',
  crd: 'CustomResourceDefinition',
  customresourcedefinition: 'CustomResourceDefinition',
  app: 'Application',
  application: 'Application',
  rollout: 'Rollout',
  rollouts: 'Rollout'
};

const CLUSTER_SCOPED_KINDS = new Set([
  'Node',
  'Namespace',
  'ClusterRole',
  'ClusterRoleBinding',
  'NodePool',
  'PersistentVolume',
  'StorageClass',
  'ValidatingWebhookConfiguration',
  'MutatingWebhookConfiguration',
  'RuntimeClass',
  'ClusterPolicy',
  'ClusterSecretStore',
  'CustomResourceDefinition',
  'PriorityClass',
  'GatewayClass'
]);

function normalizeKind(inputKind) {
  if (!inputKind) return 'Pod';
  const raw = String(inputKind).trim();
  const lower = raw.toLowerCase();
  if (KIND_ALIASES[lower]) return KIND_ALIASES[lower];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isClusterScoped(kind) {
  const norm = normalizeKind(kind);
  return CLUSTER_SCOPED_KINDS.has(norm);
}

function generateUID() {
  // Pure isomorphic UUIDv4 generator
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Pure ES2024 Isomorphic Resource Graph
 */
class ResourceGraph {
  constructor() {
    this.resources = new Map(); // uid -> resource
    this.primaryIndex = new Map(); // "kind:namespace:name" -> uid
    this.kindIndex = new Map(); // kind -> Set<uid>
    this.namespaceIndex = new Map(); // namespace -> Set<uid>

    // OwnerReferences DAG
    this.ownerToChildren = new Map(); // ownerUid -> Set<childUid>
    this.childToOwners = new Map(); // childUid -> Set<ownerUid>

    // Monotonic resource versioning
    this.versionCounter = 1000;

    // Isomorphic Event Listeners
    this.listeners = new Map(); // event -> Set<callback>
  }

  _makePrimaryKey(kind, namespace, name) {
    const normKind = normalizeKind(kind);
    const ns = isClusterScoped(normKind) ? '' : (namespace || 'default');
    return `${normKind}:${ns}:${name}`;
  }

  /**
   * Event emitter helpers
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const bucket = this.listeners.get(event);
    bucket.add(callback);
    return () => bucket.delete(callback);
  }

  emit(event, ...args) {
    if (!this.listeners.has(event)) return;
    for (const cb of this.listeners.get(event)) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in ResourceGraph listener for '${event}':`, err);
      }
    }
  }

  /**
   * Upserts a resource into the graph
   * Handles metadata generation, immutable versioning, ownerReference indexing, and change detection.
   * @param {object} rawResource 
   * @param {object} options { skipReconcileNotification = false }
   * @returns {{ resource: object, event: 'Added'|'Modified' }}
   */
  set(rawResource, options = {}) {
    if (!rawResource || typeof rawResource !== 'object') {
      throw new TypeError('Resource must be a non-null object');
    }
    if (!rawResource.kind || !rawResource.metadata || !rawResource.metadata.name) {
      throw new Error("Resource must contain 'kind', 'metadata', and 'metadata.name'");
    }

    const kind = normalizeKind(rawResource.kind);
    const name = String(rawResource.metadata.name).trim();
    const namespace = isClusterScoped(kind) ? '' : (rawResource.metadata.namespace || 'default');
    const primaryKey = this._makePrimaryKey(kind, namespace, name);

    const existingUid = this.primaryIndex.get(primaryKey);
    const existing = existingUid ? this.resources.get(existingUid) : null;

    const resource = structuredClone ? structuredClone(rawResource) : JSON.parse(JSON.stringify(rawResource));
    resource.kind = kind;
    resource.metadata.name = name;
    if (!isClusterScoped(kind)) {
      resource.metadata.namespace = namespace;
    } else {
      delete resource.metadata.namespace;
    }

    this.versionCounter++;
    resource.metadata.resourceVersion = String(this.versionCounter);

    let eventType = 'Added';

    if (existing) {
      eventType = 'Modified';
      resource.metadata.uid = existing.metadata.uid;
      resource.metadata.creationTimestamp = existing.metadata.creationTimestamp;

      // Increment generation if spec or labels changed
      const specChanged = JSON.stringify(existing.spec || {}) !== JSON.stringify(resource.spec || {});
      const labelsChanged = JSON.stringify(existing.metadata.labels || {}) !== JSON.stringify(resource.metadata.labels || {});
      if (specChanged || labelsChanged) {
        resource.metadata.generation = (existing.metadata.generation || 1) + 1;
      } else {
        resource.metadata.generation = existing.metadata.generation || 1;
      }

      // Preserve existing finalizers if not explicitly overridden
      if (!resource.metadata.finalizers && existing.metadata.finalizers) {
        resource.metadata.finalizers = [...existing.metadata.finalizers];
      }
      if (existing.metadata.deletionTimestamp && !resource.metadata.deletionTimestamp) {
        resource.metadata.deletionTimestamp = existing.metadata.deletionTimestamp;
      }

      // Update in-memory references
      this._updateOwnerReferences(resource.metadata.uid, resource.metadata.ownerReferences);
      this.resources.set(resource.metadata.uid, resource);
      if (!options.skipReconcileNotification) {
        this.emit('Modified', resource, existing);
      }
    } else {
      // New resource
      if (!resource.metadata.uid) {
        resource.metadata.uid = generateUID();
      }
      if (!resource.metadata.creationTimestamp) {
        resource.metadata.creationTimestamp = new Date().toISOString();
      }
      if (resource.metadata.generation === undefined) {
        resource.metadata.generation = 1;
      }
      if (!resource.metadata.finalizers) {
        resource.metadata.finalizers = [];
      }

      const uid = resource.metadata.uid;
      this.resources.set(uid, resource);
      this.primaryIndex.set(primaryKey, uid);

      // Index kind
      if (!this.kindIndex.has(kind)) {
        this.kindIndex.set(kind, new Set());
      }
      this.kindIndex.get(kind).add(uid);

      // Index namespace
      if (!isClusterScoped(kind)) {
        if (!this.namespaceIndex.has(namespace)) {
          this.namespaceIndex.set(namespace, new Set());
        }
        this.namespaceIndex.get(namespace).add(uid);
      }

      this._updateOwnerReferences(uid, resource.metadata.ownerReferences);
      if (!options.skipReconcileNotification) {
        this.emit('Added', resource);
      }
    }

    return { resource, event: eventType };
  }

  /**
   * Retrieves a resource by Primary Key (kind, namespace, name)
   */
  get(kind, namespace, name) {
    if (!name && kind && !namespace) {
      // Allow passing UID directly: graph.get(uid)
      return this.resources.get(kind) || null;
    }
    const key = this._makePrimaryKey(kind, namespace, name);
    const uid = this.primaryIndex.get(key);
    return uid ? this.resources.get(uid) || null : null;
  }

  /**
   * Retrieves a resource directly by its UID
   */
  getByUID(uid) {
    return this.resources.get(uid) || null;
  }

  /**
   * Updates ownerReferences DAG
   */
  _updateOwnerReferences(childUid, ownerReferences) {
    // Clear old owner links for this child
    const currentOwners = this.childToOwners.get(childUid);
    if (currentOwners) {
      for (const ownerUid of currentOwners) {
        const children = this.ownerToChildren.get(ownerUid);
        if (children) children.delete(childUid);
      }
      this.childToOwners.delete(childUid);
    }

    if (!Array.isArray(ownerReferences) || ownerReferences.length === 0) return;

    if (!this.childToOwners.has(childUid)) {
      this.childToOwners.set(childUid, new Set());
    }
    const childOwnerSet = this.childToOwners.get(childUid);

    for (const ref of ownerReferences) {
      if (ref && ref.uid) {
        childOwnerSet.add(ref.uid);
        if (!this.ownerToChildren.has(ref.uid)) {
          this.ownerToChildren.set(ref.uid, new Set());
        }
        this.ownerToChildren.get(ref.uid).add(childUid);
      }
    }
  }

  /**
   * Returns children owned by the given owner UID
   */
  getChildren(ownerUid) {
    const childUids = this.ownerToChildren.get(ownerUid);
    if (!childUids || childUids.size === 0) return [];
    const results = [];
    for (const uid of childUids) {
      const res = this.resources.get(uid);
      if (res) results.push(res);
    }
    return results;
  }

  /**
   * Returns owners of the given child UID
   */
  getOwners(childUid) {
    const ownerUids = this.childToOwners.get(childUid);
    if (!ownerUids || ownerUids.size === 0) return [];
    const results = [];
    for (const uid of ownerUids) {
      const res = this.resources.get(uid);
      if (res) results.push(res);
    }
    return results;
  }

  /**
   * Adds a finalizer to a resource
   */
  addFinalizer(uid, finalizerName) {
    const resource = this.getByUID(uid);
    if (!resource) return false;
    if (!resource.metadata.finalizers) resource.metadata.finalizers = [];
    if (!resource.metadata.finalizers.includes(finalizerName)) {
      resource.metadata.finalizers.push(finalizerName);
      this.emit('Modified', resource, resource);
    }
    return true;
  }

  /**
   * Removes a finalizer from a resource.
   * If deletionTimestamp is set and finalizers becomes empty, completes deletion.
   */
  removeFinalizer(uid, finalizerName) {
    const resource = this.getByUID(uid);
    if (!resource || !resource.metadata.finalizers) return false;
    const idx = resource.metadata.finalizers.indexOf(finalizerName);
    if (idx !== -1) {
      resource.metadata.finalizers.splice(idx, 1);
      if (resource.metadata.deletionTimestamp && resource.metadata.finalizers.length === 0) {
        // Complete deferred deletion
        this._purgeResource(uid);
      } else {
        this.emit('Modified', resource, resource);
      }
      return true;
    }
    return false;
  }

  /**
   * Deletes a resource from the graph.
   * If finalizers exist, sets deletionTimestamp and retains in graph until finalizers cleared.
   * Supports cascading deletion policies: Foreground, Background, Orphan.
   * @param {string} kind 
   * @param {string} namespace 
   * @param {string} name 
   * @param {object} options { propagationPolicy = 'Background' }
   * @returns {boolean}
   */
  delete(kind, namespace, name, options = {}) {
    let resource = null;
    if (!name && kind && !namespace) {
      resource = this.getByUID(kind);
    } else {
      resource = this.get(kind, namespace, name);
    }

    if (!resource) return false;

    const uid = resource.metadata.uid;
    const propagationPolicy = options.propagationPolicy || 'Background';

    // Check finalizers
    if (Array.isArray(resource.metadata.finalizers) && resource.metadata.finalizers.length > 0) {
      resource.metadata.deletionTimestamp = new Date().toISOString();
      this.versionCounter++;
      resource.metadata.resourceVersion = String(this.versionCounter);
      this.emit('Modified', resource, resource);
      return true;
    }

    // Handle cascading delete
    const children = this.getChildren(uid);

    if (propagationPolicy === 'Orphan') {
      // Remove ownerReferences from children, keep children
      for (const child of children) {
        if (child.metadata.ownerReferences) {
          child.metadata.ownerReferences = child.metadata.ownerReferences.filter((ref) => ref.uid !== uid);
          this._updateOwnerReferences(child.metadata.uid, child.metadata.ownerReferences);
        }
      }
    } else {
      // Background or Foreground: delete dependent children
      for (const child of children) {
        this.delete(child.metadata.uid, null, null, options);
      }
    }

    this._purgeResource(uid);
    return true;
  }

  _purgeResource(uid) {
    const resource = this.resources.get(uid);
    if (!resource) return;

    const kind = resource.kind;
    const namespace = resource.metadata.namespace || '';
    const primaryKey = this._makePrimaryKey(kind, namespace, resource.metadata.name);

    // Clean indices
    this.primaryIndex.delete(primaryKey);
    if (this.kindIndex.has(kind)) {
      this.kindIndex.get(kind).delete(uid);
    }
    if (this.namespaceIndex.has(namespace)) {
      this.namespaceIndex.get(namespace).delete(uid);
    }

    // Clean DAG edges
    this.ownerToChildren.delete(uid);
    const parents = this.childToOwners.get(uid);
    if (parents) {
      for (const pUid of parents) {
        const cSet = this.ownerToChildren.get(pUid);
        if (cSet) cSet.delete(uid);
      }
      this.childToOwners.delete(uid);
    }

    this.resources.delete(uid);
    this.emit('Deleted', resource);
  }

  patch(kind, namespace, name, patchObj) {
    const resource = this.get(kind, namespace, name);
    if (!resource) return null;

    function deepMerge(target, source) {
      for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = {};
          }
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
      return target;
    }

    deepMerge(resource, patchObj);
    return this.set(resource).resource;
  }

  create(rawResource, options = {}) {
    return this.set(rawResource, options).resource;
  }

  update(rawResource, options = {}) {
    return this.set(rawResource, options).resource;
  }

  /**
   * Queries resources by kind, namespace, labelSelector, and fieldSelector
   * Supports either list({ kind, namespace, labelSelector }) or list(kind, namespace, selector)
   * @param {object|string} queryOrKind
   * @param {string|null} namespace
   * @param {string|null} selector
   * @returns {Array<object>}
   */
  list(queryOrKind = {}, namespace = null, selector = null) {
    let query = queryOrKind;
    if (typeof queryOrKind === 'string') {
      query = { kind: queryOrKind };
      if (namespace) query.namespace = namespace;
      if (selector) query.labelSelector = selector;
    }
    let candidateUids = null;

    // 1. Filter by Kind
    if (query.kind) {
      const normKind = normalizeKind(query.kind);
      const uidsForKind = this.kindIndex.get(normKind);
      if (!uidsForKind || uidsForKind.size === 0) return [];
      candidateUids = new Set(uidsForKind);
    }

    // 2. Filter by Namespace (if not cluster-scoped)
    if (query.namespace && query.namespace !== '*') {
      const uidsForNs = this.namespaceIndex.get(query.namespace);
      if (!uidsForNs || uidsForNs.size === 0) return [];
      if (candidateUids) {
        const intersection = new Set();
        for (const uid of candidateUids) {
          if (uidsForNs.has(uid)) intersection.add(uid);
        }
        candidateUids = intersection;
      } else {
        candidateUids = new Set(uidsForNs);
      }
    }

    let results = [];
    if (candidateUids) {
      for (const uid of candidateUids) {
        const res = this.resources.get(uid);
        if (res) results.push(res);
      }
    } else {
      results = Array.from(this.resources.values());
    }

    // 3. Filter by Label Selector
    if (query.labelSelector) {
      results = results.filter((r) => this.matchesLabelSelector(r, query.labelSelector));
    }

    // 4. Filter by Field Selector
    if (query.fieldSelector) {
      results = results.filter((r) => this.matchesFieldSelector(r, query.fieldSelector));
    }

    return results;
  }

  /**
   * Matches equality-based and set-based label selectors
   */
  matchesLabelSelector(resource, selector) {
    if (!selector) return true;
    const labels = (resource && resource.metadata && resource.metadata.labels) || {};

    // Object selector syntax: { matchLabels, matchExpressions }
    if (typeof selector === 'object') {
      if (selector.matchLabels) {
        for (const [k, v] of Object.entries(selector.matchLabels)) {
          if (labels[k] !== String(v)) return false;
        }
      }
      if (Array.isArray(selector.matchExpressions)) {
        for (const expr of selector.matchExpressions) {
          const { key, operator, values } = expr;
          const val = labels[key];
          const valList = Array.isArray(values) ? values.map(String) : [];

          if (operator === 'In') {
            if (!val || !valList.includes(val)) return false;
          } else if (operator === 'NotIn') {
            if (val && valList.includes(val)) return false;
          } else if (operator === 'Exists') {
            if (!(key in labels)) return false;
          } else if (operator === 'DoesNotExist') {
            if (key in labels) return false;
          }
        }
      }
      return true;
    }

    // String selector syntax: "app=frontend,tier in (web, api),!canary,env"
    const terms = String(selector).split(',').map((t) => t.trim()).filter(Boolean);
    for (const term of terms) {
      if (term.includes(' in ') || term.includes(' In ')) {
        const match = term.match(/^([^\s]+)\s+[iI]n\s+\((.*?)\)$/);
        if (match) {
          const k = match[1].trim();
          const allowed = match[2].split(',').map((s) => s.trim());
          if (!labels[k] || !allowed.includes(labels[k])) return false;
          continue;
        }
      }
      if (term.includes(' notin ') || term.includes(' NotIn ')) {
        const match = term.match(/^([^\s]+)\s+[nN]ot[iI]n\s+\((.*?)\)$/);
        if (match) {
          const k = match[1].trim();
          const disallowed = match[2].split(',').map((s) => s.trim());
          if (labels[k] && disallowed.includes(labels[k])) return false;
          continue;
        }
      }
      if (term.includes('!=')) {
        const [k, v] = term.split('!=').map((s) => s.trim());
        if (labels[k] === v) return false;
        continue;
      }
      if (term.includes('==') || term.includes('=')) {
        const sep = term.includes('==') ? '==' : '=';
        const [k, v] = term.split(sep).map((s) => s.trim());
        if (labels[k] !== v) return false;
        continue;
      }
      if (term.startsWith('!')) {
        const k = term.slice(1).trim();
        if (k in labels) return false;
        continue;
      }
      // Single key existence
      if (!(term in labels)) return false;
    }

    return true;
  }

  /**
   * Matches field selectors (e.g. metadata.name=my-pod, status.phase=Running)
   */
  matchesFieldSelector(resource, selector) {
    if (!selector) return true;
    const terms = String(selector).split(',').map((t) => t.trim()).filter(Boolean);

    for (const term of terms) {
      const isNotEqual = term.includes('!=');
      const sep = isNotEqual ? '!=' : (term.includes('==') ? '==' : '=');
      const [path, expected] = term.split(sep).map((s) => s.trim());

      const actual = this._getFieldValue(resource, path);
      if (isNotEqual) {
        if (String(actual) === expected) return false;
      } else {
        if (String(actual) !== expected) return false;
      }
    }
    return true;
  }

  _getFieldValue(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Directed Acyclic Graph (DAG) Topological Sort
   * Returns list of resources ordered such that owners appear before dependents.
   */
  topologicalSort() {
    const visited = new Set();
    const temp = new Set();
    const order = [];

    const visit = (uid) => {
      if (temp.has(uid)) {
        throw new Error(`Cycle detected in ownerReferences DAG involving UID: ${uid}`);
      }
      if (!visited.has(uid)) {
        temp.add(uid);
        const children = this.ownerToChildren.get(uid);
        if (children) {
          for (const childUid of children) {
            visit(childUid);
          }
        }
        temp.delete(uid);
        visited.add(uid);
        const res = this.resources.get(uid);
        if (res) order.unshift(res);
      }
    };

    for (const uid of this.resources.keys()) {
      if (!visited.has(uid)) {
        visit(uid);
      }
    }

    return order;
  }

  /**
   * Returns full snapshot for serialization
   */
  exportSnapshot() {
    return {
      versionCounter: this.versionCounter,
      resources: Array.from(this.resources.values()).map((r) =>
        structuredClone ? structuredClone(r) : JSON.parse(JSON.stringify(r))
      )
    };
  }

  /**
   * Restores graph from snapshot and rebuilds all indices
   */
  importSnapshot(snapshot) {
    this.clear();
    if (!snapshot || !Array.isArray(snapshot.resources)) return;

    this.versionCounter = snapshot.versionCounter || 1000;
    for (const r of snapshot.resources) {
      this.set(r, { skipReconcileNotification: true });
    }
  }

  clear() {
    this.resources.clear();
    this.primaryIndex.clear();
    this.kindIndex.clear();
    this.namespaceIndex.clear();
    this.ownerToChildren.clear();
    this.childToOwners.clear();
    this.listeners.clear();
  }
}

// Dual ESM and CommonJS export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ResourceGraph,
    normalizeKind,
    isClusterScoped,
    KIND_ALIASES,
    CLUSTER_SCOPED_KINDS
  };
}
export {
  ResourceGraph,
  normalizeKind,
  isClusterScoped,
  KIND_ALIASES,
  CLUSTER_SCOPED_KINDS
};

