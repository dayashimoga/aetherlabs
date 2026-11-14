'use strict';

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
  sa: 'ServiceAccount',
  serviceaccount: 'ServiceAccount',
  serviceaccounts: 'ServiceAccount',
  role: 'Role',
  roles: 'Role',
  rolebinding: 'RoleBinding',
  rolebindings: 'RoleBinding',
  quota: 'ResourceQuota',
  resourcequota: 'ResourceQuota',
  resourcequotas: 'ResourceQuota',
  no: 'Node',
  node: 'Node',
  nodes: 'Node',
  ns: 'Namespace',
  namespace: 'Namespace',
  namespaces: 'Namespace',
  hpa: 'HorizontalPodAutoscaler',
  horizontalpodautoscaler: 'HorizontalPodAutoscaler',
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  vs: 'VirtualService',
  virtualservice: 'VirtualService',
  virtualservices: 'VirtualService',
  dr: 'DestinationRule',
  destinationrule: 'DestinationRule',
  destinationrules: 'DestinationRule',
  pa: 'PeerAuthentication',
  peerauthentication: 'PeerAuthentication',
  promrule: 'PrometheusRule',
  prometheusrule: 'PrometheusRule',
  prometheusrules: 'PrometheusRule',
  app: 'Application',
  application: 'Application',
  applications: 'Application',
  rollout: 'Rollout',
  rollouts: 'Rollout',
  postgresinstance: 'PostgresInstance',
  postgresinstances: 'PostgresInstance',
  nodepool: 'NodePool',
  nodepools: 'NodePool',
  webapp: 'WebApp',
  webapps: 'WebApp',
  pv: 'PersistentVolume',
  persistentvolume: 'PersistentVolume',
  persistentvolumes: 'PersistentVolume',
  sc: 'StorageClass',
  storageclass: 'StorageClass',
  storageclasses: 'StorageClass',
  clusterrole: 'ClusterRole',
  clusterroles: 'ClusterRole',
  clusterrolebinding: 'ClusterRoleBinding',
  clusterrolebindings: 'ClusterRoleBinding',
  validatingwebhookconfiguration: 'ValidatingWebhookConfiguration',
  validatingwebhookconfigurations: 'ValidatingWebhookConfiguration',
  mutatingwebhookconfiguration: 'MutatingWebhookConfiguration',
  mutatingwebhookconfigurations: 'MutatingWebhookConfiguration',
  runtimeclass: 'RuntimeClass',
  runtimeclasses: 'RuntimeClass',
  clusterpolicy: 'ClusterPolicy',
  clusterpolicies: 'ClusterPolicy',
  clustersecretstore: 'ClusterSecretStore',
  clustersecretstores: 'ClusterSecretStore',
  crd: 'CustomResourceDefinition',
  crds: 'CustomResourceDefinition',
  customresourcedefinition: 'CustomResourceDefinition',
  pytorchjob: 'PyTorchJob',
  pytorchjobs: 'PyTorchJob',
  inferenceservice: 'InferenceService',
  inferenceservices: 'InferenceService',
  job: 'Job',
  jobs: 'Job',
  cj: 'CronJob',
  cronjob: 'CronJob',
  cronjobs: 'CronJob',
  vpa: 'VerticalPodAutoscaler',
  verticalpodautoscaler: 'VerticalPodAutoscaler',
  verticalpodautoscalers: 'VerticalPodAutoscaler',
  pdb: 'PodDisruptionBudget',
  poddisruptionbudget: 'PodDisruptionBudget',
  poddisruptionbudgets: 'PodDisruptionBudget',
  limits: 'LimitRange',
  limitrange: 'LimitRange',
  limitranges: 'LimitRange',
  pc: 'PriorityClass',
  priorityclass: 'PriorityClass',
  priorityclasses: 'PriorityClass',
  gatewayclass: 'GatewayClass',
  gatewayclasses: 'GatewayClass',
  gw: 'Gateway',
  gateway: 'Gateway',
  gateways: 'Gateway',
  httproute: 'HTTPRoute',
  httproutes: 'HTTPRoute',
  constrainttemplate: 'ConstraintTemplate',
  constrainttemplates: 'ConstraintTemplate',
  ciliumnetworkpolicy: 'CiliumNetworkPolicy',
  ciliumnetworkpolicies: 'CiliumNetworkPolicy',
  cnp: 'CiliumNetworkPolicy'
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
  'GatewayClass',
  'ConstraintTemplate'
]);

function normalizeKind(input) {
  if (!input) return 'Pod';
  const lower = String(input).trim().toLowerCase();
  if (KIND_ALIASES[lower]) return KIND_ALIASES[lower];
  return String(input).charAt(0).toUpperCase() + String(input).slice(1);
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === '[]') return [];
  if (trimmed === '{}') return {};
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseScalar(item));
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      const obj = {};
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return obj;
      for (const pair of inner.split(',')) {
        const idx = pair.indexOf(':');
        if (idx > -1) {
          const k = pair.slice(0, idx).trim().replace(/^['"]|['"]$/g, '');
          const v = parseScalar(pair.slice(idx + 1));
          obj[k] = v;
        }
      }
      return obj;
    }
  }
  return trimmed;
}

function stripYamlComment(rawLine) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rawLine.length; i++) {
    const ch = rawLine[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(rawLine[i - 1])) {
        return rawLine.slice(0, i);
      }
    }
  }
  return rawLine;
}

function parseSimpleYamlDocument(docText) {
  const trimmed = docText.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const rawLines = docText.split(/\r?\n/);
  const lines = [];
  for (const rawLine of rawLines) {
    const withoutComment = stripYamlComment(rawLine);
    if (!withoutComment.trim() || withoutComment.trim().startsWith('#')) continue;
    const indent = withoutComment.match(/^ */)[0].length;
    lines.push({ indent, text: withoutComment.trim() });
  }

  if (lines.length === 0) return null;

  function parseBlock(startIndex, minIndent) {
    if (startIndex >= lines.length) return [{}, startIndex];
    const first = lines[startIndex];
    if (first.indent < minIndent) return [{}, startIndex];

    if (first.text.startsWith('- ') || first.text === '-') {
      const arr = [];
      let i = startIndex;
      const listIndent = first.indent;
      while (i < lines.length && lines[i].indent === listIndent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
        const afterDash = lines[i].text.slice(1).trim();
        i++;
        if (!afterDash) {
          const [nested, nextIdx] = parseBlock(i, listIndent + 1);
          arr.push(nested);
          i = nextIdx;
        } else if (afterDash.includes(':')) {
          const colonIdx = afterDash.indexOf(':');
          const key = afterDash.slice(0, colonIdx).trim();
          const valPart = afterDash.slice(colonIdx + 1).trim();
          const itemObj = {};
          if (valPart === '') {
            const [nestedVal, nextIdx] = parseBlock(i, listIndent + 1);
            itemObj[key] = nestedVal;
            i = nextIdx;
          } else {
            itemObj[key] = parseScalar(valPart);
          }
          while (i < lines.length && lines[i].indent > listIndent && !lines[i].text.startsWith('- ')) {
            const subLine = lines[i];
            const subColon = subLine.text.indexOf(':');
            if (subColon > -1) {
              const sk = subLine.text.slice(0, subColon).trim();
              const sv = subLine.text.slice(subColon + 1).trim();
              i++;
              if (sv === '') {
                const [subNested, nextIdx] = parseBlock(i, subLine.indent + 1);
                itemObj[sk] = subNested;
                i = nextIdx;
              } else {
                itemObj[sk] = parseScalar(sv);
              }
            } else {
              i++;
            }
          }
          arr.push(itemObj);
        } else {
          arr.push(parseScalar(afterDash));
        }
      }
      return [arr, i];
    }

    const obj = {};
    let i = startIndex;
    const blockIndent = first.indent;
    while (i < lines.length && lines[i].indent >= blockIndent) {
      const line = lines[i];
      if (line.indent > blockIndent) {
        break;
      }
      if (line.text.startsWith('- ') || line.text === '-') {
        break;
      }
      const colonIdx = line.text.indexOf(':');
      if (colonIdx === -1) {
        i++;
        continue;
      }
      const key = line.text.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      const valPart = line.text.slice(colonIdx + 1).trim();
      i++;
      if (valPart === '' || valPart.startsWith('|') || valPart.startsWith('>')) {
        if (valPart.startsWith('|') || valPart.startsWith('>')) {
          const isFolded = valPart.startsWith('>');
          const strLines = [];
          while (i < lines.length && lines[i].indent > blockIndent) {
            strLines.push(lines[i].text);
            i++;
          }
          obj[key] = isFolded ? strLines.join(' ') : strLines.join('\n');
        } else {
          const [nested, nextIdx] = parseBlock(i, blockIndent + 1);
          obj[key] = nested;
          i = nextIdx;
        }
      } else {
        obj[key] = parseScalar(valPart);
      }
    }
    return [obj, i];
  }

  const [parsed] = parseBlock(0, 0);
  return parsed;
}

function evaluateJsonPath(obj, expr) {
  if (!obj || !expr) return '';
  let pathStr = String(expr).trim();
  if (pathStr.startsWith('{') && pathStr.endsWith('}')) {
    pathStr = pathStr.slice(1, -1).trim();
  }
  if (pathStr.startsWith('.')) pathStr = pathStr.slice(1);
  if (!pathStr) return JSON.stringify(obj);

  function resolveSegments(current, segments) {
    if (segments.length === 0 || current === undefined || current === null) {
      return [current];
    }
    const [seg, ...rest] = segments;
    if (seg.includes('[*]')) {
      const prop = seg.replace(/\[\*\]/g, '');
      const arr = prop ? current[prop] : current;
      if (!Array.isArray(arr)) return [];
      const results = [];
      for (const item of arr) {
        results.push(...resolveSegments(item, rest));
      }
      return results;
    }
    const matchIndexed = seg.match(/^([^\[\]]+)\[(\d+)\]$/);
    if (matchIndexed) {
      const prop = matchIndexed[1];
      const idx = Number(matchIndexed[2]);
      const val = current[prop] ? current[prop][idx] : undefined;
      return resolveSegments(val, rest);
    }
    return resolveSegments(current[seg], rest);
  }

  const segments = pathStr.split('.');
  const results = resolveSegments(obj, segments).filter((v) => v !== undefined && v !== null);
  if (results.length === 0) return '';
  return results.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(' ');
}

let parseYamlFn = null;
try {
  const yp = require('./yamlParser');
  parseYamlFn = yp.parseYaml;
} catch (_) {}

function parseManifests(manifestText) {
  if (!manifestText || !String(manifestText).trim()) return [];
  const text = String(manifestText).trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const docs = text.split(/^---+\s*$/m);
  const results = [];
  for (const doc of docs) {
    if (!doc.trim()) continue;
    let obj = null;
    if (parseYamlFn) {
      try {
        obj = parseYamlFn(doc);
      } catch (_) {}
    }
    if (!obj || !obj.kind) {
      obj = parseSimpleYamlDocument(doc);
    }
    if (obj && typeof obj === 'object' && obj.kind) {
      results.push(obj);
    }
  }
  return results;
}

function getFieldByPath(obj, fieldPath) {
  if (!obj || !fieldPath) return undefined;
  const cleanPath = String(fieldPath).replace(/^\./, '');
  const parts = cleanPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined) return undefined;
    const remainingKey = parts.slice(i).join('.');
    if (typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, remainingKey)) {
      return current[remainingKey];
    }
    const part = parts[i];
    const arrayMatch = part.match(/^([^\[\]]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const idx = Number(arrayMatch[2]);
      current = current[prop] ? current[prop][idx] : undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

class VirtualCluster {
  constructor(initialState) {
    this.ipCounter = 10;
    this.listeners = new Map();
    this.reset(initialState);
  }

  on(event, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this.listeners) this.listeners = new Map();
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const bucket = this.listeners.get(event);
    bucket.add(callback);
    return () => bucket.delete(callback);
  }

  emit(event, ...args) {
    if (!this.listeners || !this.listeners.has(event)) return;
    for (const cb of this.listeners.get(event)) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in VirtualCluster listener for '${event}':`, err);
      }
    }
  }

  createBaseClusterState() {
    return {
      resources: [
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-control-plane',
            labels: {
              'kubernetes.io/hostname': 'kubelabs-control-plane',
              'node-role.kubernetes.io/control-plane': 'true',
              'topology.kubernetes.io/zone': 'us-east-1a'
            }
          },
          spec: { capacity: { cpu: '4000m', memory: '8Gi' } },
          status: { phase: 'Ready', kubeletVersion: 'v1.32.0', internalIP: '192.168.10.10' }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-worker-01',
            labels: {
              'kubernetes.io/hostname': 'kubelabs-worker-01',
              'node-role.kubernetes.io/worker': 'true',
              'topology.kubernetes.io/zone': 'us-east-1b',
              'workload-tier': 'general'
            }
          },
          spec: { capacity: { cpu: '8000m', memory: '16Gi' } },
          status: { phase: 'Ready', kubeletVersion: 'v1.32.0', internalIP: '192.168.10.11' }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-worker-gpu-02',
            labels: {
              'kubernetes.io/hostname': 'kubelabs-worker-gpu-02',
              'node-role.kubernetes.io/worker': 'true',
              'topology.kubernetes.io/zone': 'us-east-1c',
              'accelerator': 'nvidia-a100'
            },
            taints: [{ key: 'nvidia.com/gpu', value: 'present', effect: 'NoSchedule' }]
          },
          spec: { capacity: { cpu: '8000m', memory: '32Gi', 'nvidia.com/gpu': 2 } },
          status: { phase: 'Ready', kubeletVersion: 'v1.32.0', internalIP: '192.168.10.12' }
        },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'default' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kube-system' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'production' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'monitoring' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'argocd' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'istio-system' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'security' }, status: { phase: 'Active' } },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'coredns-7db6d8ff4d-x9k2p', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } },
          spec: { containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.11.3' }] },
          status: { phase: 'Running', ready: '1/1', restarts: 0, podIP: '10.244.0.2', nodeName: 'kubelabs-control-plane' }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'cilium-ebpf-agent-m4n9q', namespace: 'kube-system', labels: { 'k8s-app': 'cilium' } },
          spec: { containers: [{ name: 'cilium-agent', image: 'quay.io/cilium/cilium:v1.16.4' }] },
          status: { phase: 'Running', ready: '1/1', restarts: 0, podIP: '10.244.0.3', nodeName: 'kubelabs-worker-01' }
        }
      ],
      helmReleases: [],
      argoApps: [],
      cloudResources: [],
      terraformState: { initialized: false, resources: [], outputs: {} },
      systemdUnits: {
        kubelet: { active: 'active', enabled: true, description: 'Kubernetes Kubelet Agent' },
        containerd: { active: 'active', enabled: true, description: 'containerd container runtime' },
        sshd: { active: 'active', enabled: true, description: 'OpenBSD Secure Shell server' }
      },
      sysctls: {
        'net.ipv4.ip_forward': '1',
        'net.bridge.bridge-nf-call-iptables': '1',
        'fs.inotify.max_user_watches': '524288'
      },
      containers: [
        {
          id: 'c8f92a1b4d01',
          name: 'registry-mirror',
          image: 'registry:2.8',
          status: 'Up 4 hours',
          ports: '5000/tcp',
          rootless: true
        }
      ],
      events: []
    };
  }

  reset(customInitialState) {
    const base = this.createBaseClusterState();
    this.state = JSON.parse(JSON.stringify(base));
    this.ipCounter = 10;

    if (customInitialState && typeof customInitialState === 'object') {
      if (Array.isArray(customInitialState.resources)) {
        for (const r of customInitialState.resources) {
          this.applyResource(JSON.parse(JSON.stringify(r)), { skipReconcile: true });
        }
      }
      if (Array.isArray(customInitialState.helmReleases)) {
        this.state.helmReleases = JSON.parse(JSON.stringify(customInitialState.helmReleases));
      }
      if (Array.isArray(customInitialState.argoApps)) {
        this.state.argoApps = JSON.parse(JSON.stringify(customInitialState.argoApps));
      }
      if (Array.isArray(customInitialState.cloudResources)) {
        this.state.cloudResources = JSON.parse(JSON.stringify(customInitialState.cloudResources));
      }
      if (customInitialState.terraformState) {
        this.state.terraformState = JSON.parse(JSON.stringify(customInitialState.terraformState));
      }
      if (customInitialState.systemdUnits) {
        Object.assign(this.state.systemdUnits, JSON.parse(JSON.stringify(customInitialState.systemdUnits)));
      }
      if (customInitialState.sysctls) {
        Object.assign(this.state.sysctls, JSON.parse(JSON.stringify(customInitialState.sysctls)));
      }
      if (Array.isArray(customInitialState.containers)) {
        this.state.containers = JSON.parse(JSON.stringify(customInitialState.containers));
      }
    }

    this.reconcile();
    this.emit('reset', this.state);
    this.emit('change', { type: 'reset', state: this.state });
    return this.state;
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    if (data && Array.isArray(data.resources)) {
      this.state = data;
      this.reconcile();
      this.emit('snapshot:load', this.state);
      this.emit('change', { type: 'snapshot:load', state: this.state });
    }
  }

  importSnapshot(snapshot) {
    return this.loadSnapshot(snapshot);
  }

  exportSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  nextPodIP() {
    this.ipCounter += 1;
    const octet = (this.ipCounter % 240) + 10;
    return `10.244.1.${octet}`;
  }

  ensureNamespace(ns) {
    if (!ns) return;
    const exists = this.state.resources.some(
      (r) => r.kind === 'Namespace' && r.metadata && r.metadata.name === ns
    );
    if (!exists) {
      this.state.resources.push({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: ns },
        status: { phase: 'Active' }
      });
    }
  }

  getResources(kind, namespace, labelSelector) {
    const normKind = kind ? normalizeKind(kind) : null;
    return this.state.resources.filter((r) => {
      if (normKind && r.kind !== normKind) return false;
      if (namespace && namespace !== 'all' && !CLUSTER_SCOPED_KINDS.has(r.kind)) {
        const resNs = (r.metadata && r.metadata.namespace) || 'default';
        if (resNs !== namespace) return false;
      }
      if (labelSelector) {
        const labels = (r.metadata && r.metadata.labels) || {};
        const pairs = String(labelSelector).split(',');
        for (const pair of pairs) {
          const [k, v] = pair.split('=').map((s) => s.trim());
          if (k && labels[k] !== v) return false;
        }
      }
      return true;
    });
  }

  getResource(kind, name, namespace = 'default') {
    const normKind = normalizeKind(kind);
    return (
      this.state.resources.find((r) => {
        if (r.kind !== normKind) return false;
        if (!r.metadata || r.metadata.name !== name) return false;
        if (CLUSTER_SCOPED_KINDS.has(normKind)) return true;
        return (r.metadata.namespace || 'default') === (namespace || 'default');
      }) || null
    );
  }

  applyResource(resourceObj, options = {}) {
    if (!resourceObj || !resourceObj.kind || !resourceObj.metadata || !resourceObj.metadata.name) {
      throw new Error('Invalid resource manifest: kind and metadata.name are required');
    }

    const kind = normalizeKind(resourceObj.kind);
    resourceObj.kind = kind;
    resourceObj.apiVersion = resourceObj.apiVersion || 'v1';
    if (!CLUSTER_SCOPED_KINDS.has(kind)) {
      resourceObj.metadata.namespace = resourceObj.metadata.namespace || 'default';
      this.ensureNamespace(resourceObj.metadata.namespace);
    }

    const existingIdx = this.state.resources.findIndex((r) => {
      if (r.kind !== kind) return false;
      if (r.metadata.name !== resourceObj.metadata.name) return false;
      if (CLUSTER_SCOPED_KINDS.has(kind)) return true;
      return (r.metadata.namespace || 'default') === resourceObj.metadata.namespace;
    });

    let action = 'created';
    if (existingIdx > -1) {
      const existing = this.state.resources[existingIdx];
      this.state.resources[existingIdx] = {
        ...existing,
        ...resourceObj,
        metadata: {
          ...existing.metadata,
          ...resourceObj.metadata,
          labels: {
            ...(existing.metadata.labels || {}),
            ...(resourceObj.metadata.labels || {})
          },
          annotations: {
            ...(existing.metadata.annotations || {}),
            ...(resourceObj.metadata.annotations || {})
          }
        },
        spec: {
          ...(existing.spec || {}),
          ...(resourceObj.spec || {})
        }
      };
      action = 'configured';
    } else {
      this.state.resources.push(resourceObj);
    }

    this.recordEvent(
      kind,
      resourceObj.metadata.name,
      resourceObj.metadata.namespace || 'default',
      'Normal',
      action === 'created' ? 'Created' : 'Configured',
      `${kind}/${resourceObj.metadata.name} ${action}`
    );

    if (!options.skipReconcile) {
      this.reconcile();
    }

    const applied = this.getResource(kind, resourceObj.metadata.name, resourceObj.metadata.namespace);
    this.emit('resource:apply', applied || resourceObj);
    this.emit('change', { type: action, resource: applied || resourceObj, state: this.state });

    return { resource: applied, action };
  }

  applyManifest(manifestText) {
    const docs = parseManifests(manifestText);
    if (docs.length === 0) {
      throw new Error('No valid Kubernetes/Cloud-Native resources found in manifest');
    }
    const results = [];
    for (const doc of docs) {
      const res = this.applyResource(doc, { skipReconcile: true });
      results.push(res);
    }
    this.reconcile();
    this.emit('manifest:apply', { results, state: this.state });
    this.emit('change', { type: 'manifest:apply', results, state: this.state });
    return results;
  }

  deleteResource(kind, name, namespace = 'default') {
    const normKind = normalizeKind(kind);
    const before = this.state.resources.length;
    this.state.resources = this.state.resources.filter((r) => {
      if (r.kind !== normKind) return true;
      if (r.metadata.name !== name) return true;
      if (CLUSTER_SCOPED_KINDS.has(normKind)) return false;
      return (r.metadata.namespace || 'default') !== (namespace || 'default');
    });

    if (normKind === 'Deployment' || normKind === 'StatefulSet') {
      this.state.resources = this.state.resources.filter((r) => {
        if (r.kind !== 'Pod' && r.kind !== 'ReplicaSet') return true;
        if ((r.metadata.namespace || 'default') !== (namespace || 'default')) return true;
        return !(r.metadata.ownerDeployment === name);
      });
    }

    const deleted = this.state.resources.length < before;
    this.reconcile();
    if (deleted) {
      this.emit('resource:delete', { kind: normKind, name, namespace });
      this.emit('change', { type: 'delete', resource: { kind: normKind, name, namespace }, state: this.state });
    }
    return deleted;
  }

  scaleResource(kind, name, replicas, namespace = 'default') {
    const res = this.getResource(kind, name, namespace);
    if (!res) {
      throw new Error(`${normalizeKind(kind)} "${name}" not found in namespace "${namespace}"`);
    }
    res.spec = res.spec || {};
    res.spec.replicas = Number(replicas);
    this.reconcile();
    return res;
  }

  setImage(kind, name, containerName, newImage, namespace = 'default') {
    const res = this.getResource(kind, name, namespace);
    if (!res) {
      throw new Error(`${normalizeKind(kind)} "${name}" not found in namespace "${namespace}"`);
    }
    if (res.kind === 'Pod') {
      const containers = (res.spec && res.spec.containers) || [];
      for (const c of containers) {
        if (!containerName || containerName === '*' || c.name === containerName) {
          c.image = newImage;
        }
      }
    } else if (res.spec && res.spec.template && res.spec.template.spec) {
      const containers = res.spec.template.spec.containers || [];
      for (const c of containers) {
        if (!containerName || containerName === '*' || c.name === containerName) {
          c.image = newImage;
        }
      }
    }
    this.reconcile();
    return res;
  }

  evaluatePodHealth(pod) {
    const spec = pod.spec || {};
    const containers = spec.containers || [{ name: 'app', image: 'nginx:1.27-alpine' }];
    const firstContainer = containers[0] || { name: 'app', image: 'nginx:1.27-alpine' };
    const image = String(firstContainer.image || '');
    const ns = (pod.metadata && pod.metadata.namespace) || 'default';

    // Check resource requests & GPU scheduling
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

    // Check broken image tags
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

    // Check missing secret reference
    if (firstContainer.envFromSecret) {
      const sec = this.getResource('Secret', firstContainer.envFromSecret, ns);
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

    // Check CrashLoopBackOff triggers
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

    // Check OOMKilled trigger
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

    // Check Severe CPU Throttling / Slow App trigger
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

    // Check IAM / IRSA ServiceAccount annotation requirement
    const requireIrsa = envList.some((e) => e.name === 'REQUIRE_IRSA_ROLE' && String(e.value) === 'true');
    if (requireIrsa) {
      const saName = spec.serviceAccountName || 'default';
      const sa = this.getResource('ServiceAccount', saName, ns);
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

    // Check NodeSelector & NodeAffinity scheduling constraints
    const readyNodes = this.state.resources.filter(
      (r) => r.kind === 'Node' && (!r.spec || !r.spec.unschedulable) && (!r.status || r.status.phase !== 'NotReady')
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
          message: `0/${readyNodes.length} nodes are available: node(s) didn't match Pod's nodeSelector ${JSON.stringify(spec.nodeSelector)}.`
        };
      }
    }

    // Check if explicitly assigned node is NotReady
    if (spec.nodeName) {
      const assignedNode = this.getResource('Node', spec.nodeName);
      if (assignedNode && assignedNode.status && assignedNode.status.phase === 'NotReady') {
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

    // Check CoreDNS upstream loop
    if (pod.metadata && pod.metadata.name && pod.metadata.name.includes('coredns')) {
      const cm = this.getResource('ConfigMap', 'coredns', 'kube-system');
      if (cm && cm.data && cm.data.Corefile && cm.data.Corefile.includes('127.0.0.1')) {
        return {
          phase: 'Running',
          reason: 'CrashLoopBackOff',
          ready: '0/1',
          restarts: 12,
          message: 'plugin/loop: Loop (127.0.0.1:53 -> :53) detected in upstream nameserver'
        };
      }
    }

    // Check etcd member unhealthy
    if (pod.metadata && pod.metadata.labels && pod.metadata.labels['component'] === 'etcd' && pod.metadata.labels['etcd-unhealthy'] === 'true') {
      return {
        phase: 'Running',
        reason: 'CrashLoopBackOff',
        ready: '0/1',
        restarts: 8,
        message: 'etcdserver: member 2 quorum loss / corrupt database snapshot'
      };
    }

    // Check volume claim pending
    if (spec.volumes && Array.isArray(spec.volumes)) {
      for (const vol of spec.volumes) {
        if (vol.persistentVolumeClaim && vol.persistentVolumeClaim.claimName) {
          const pvc = this.getResource('PersistentVolumeClaim', vol.persistentVolumeClaim.claimName, ns);
          if (!pvc || (pvc.status && pvc.status.phase === 'Pending')) {
            return {
              phase: 'Pending',
              reason: 'ContainerCreating',
              ready: '0/1',
              restarts: 0,
              message: `0/3 nodes are available: persistentvolumeclaim "${vol.persistentVolumeClaim.claimName}" is pending binding`
            };
          }
        }
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

  reconcile() {
    // 1. Reconcile ArgoCD Application resources inside state.resources and state.argoApps
    for (const r of this.state.resources) {
      if (r.kind === 'Application') {
        const existingApp = this.state.argoApps.find((a) => a.name === r.metadata.name);
        const syncStatus = (r.status && r.status.syncStatus) || 'Synced';
        const healthStatus = (r.status && r.status.healthStatus) || 'Healthy';
        if (!existingApp) {
          this.state.argoApps.push({
            name: r.metadata.name,
            namespace: r.metadata.namespace || 'argocd',
            destNamespace: (r.spec && r.spec.destination && r.spec.destination.namespace) || 'production',
            repoURL: (r.spec && r.spec.source && r.spec.source.repoURL) || 'https://github.com/kubelabs-io/gitops-fleet',
            path: (r.spec && r.spec.source && r.spec.source.path) || 'envs/production',
            targetRevision: (r.spec && r.spec.source && r.spec.source.targetRevision) || 'main',
            syncStatus,
            healthStatus
          });
        }
      }
    }

    // 2. Reconcile Crossplane Composite Claims (PostgresInstance)
    const claims = this.state.resources.filter((r) => r.kind === 'PostgresInstance');
    for (const claim of claims) {
      const ns = claim.metadata.namespace || 'default';
      const dbSvcName = `${claim.metadata.name}-db`;
      claim.status = { synced: 'True', ready: 'True', endpoint: `${dbSvcName}.${ns}.svc.cluster.local:5432` };
      const existingSvc = this.getResource('Service', dbSvcName, ns);
      if (!existingSvc) {
        this.state.resources.push({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: dbSvcName, namespace: ns, labels: { 'crossplane.io/claim-name': claim.metadata.name } },
          spec: { selector: { app: dbSvcName }, ports: [{ port: 5432, targetPort: 5432 }] }
        });
      }
      const existingPod = this.getResource('Pod', `${dbSvcName}-0`, ns);
      if (!existingPod) {
        this.state.resources.push({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: `${dbSvcName}-0`, namespace: ns, labels: { app: dbSvcName } },
          spec: { containers: [{ name: 'postgres', image: 'postgres:16-alpine' }] }
        });
      }
    }

    // 2b. Reconcile DaemonSets -> Pods per eligible Node
    const daemonSets = this.state.resources.filter((r) => r.kind === 'DaemonSet');
    const schedulableNodes = this.state.resources.filter(
      (r) => r.kind === 'Node' && (!r.spec || !r.spec.unschedulable)
    );
    for (const ds of daemonSets) {
      const ns = (ds.metadata && ds.metadata.namespace) || 'default';
      const name = ds.metadata.name;
      const template = (ds.spec && ds.spec.template) || {
        metadata: { labels: { app: name } },
        spec: { containers: [{ name, image: 'busybox:1.36' }] }
      };
      for (const node of schedulableNodes) {
        const podName = `${name}-${node.metadata.name}`;
        const existingPod = this.getResource('Pod', podName, ns);
        if (!existingPod) {
          this.state.resources.push({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: { ...(template.metadata && template.metadata.labels ? template.metadata.labels : { app: name }) },
              ownerDaemonSet: name
            },
            spec: JSON.parse(JSON.stringify(template.spec)),
            status: {
              phase: 'Running',
              reason: 'Running',
              podIP: this.nextPodIP(),
              nodeName: node.metadata.name
            }
          });
        }
      }
    }

    // 2c. Reconcile PersistentVolumeClaims -> PersistentVolumes
    const pvcs = this.state.resources.filter((r) => r.kind === 'PersistentVolumeClaim');
    const storageClasses = this.state.resources.filter((r) => r.kind === 'StorageClass');
    for (const pvc of pvcs) {
      const requestedSc = pvc.spec && pvc.spec.storageClassName;
      if (requestedSc && storageClasses.length > 0) {
        const scExists = storageClasses.some((sc) => sc.metadata && sc.metadata.name === requestedSc);
        if (!scExists) {
          pvc.status = {
            phase: 'Pending',
            message: `waiting for a volume to be created, either by external provisioner or manually created for StorageClass "${requestedSc}"`
          };
          continue;
        }
      }
      if (!pvc.status || pvc.status.phase !== 'Bound') {
        const scName = requestedSc || 'standard';
        const pvName = `pv-${pvc.metadata.name}`;
        let pv = this.getResource('PersistentVolume', pvName);
        if (!pv) {
          pv = {
            apiVersion: 'v1',
            kind: 'PersistentVolume',
            metadata: { name: pvName },
            spec: {
              storageClassName: scName,
              capacity: (pvc.spec && pvc.spec.resources && pvc.spec.resources.requests) || { storage: '10Gi' },
              accessModes: (pvc.spec && pvc.spec.accessModes) || ['ReadWriteOnce'],
              claimRef: { name: pvc.metadata.name, namespace: pvc.metadata.namespace || 'default' }
            },
            status: { phase: 'Bound' }
          };
          this.state.resources.push(pv);
        }
        pvc.status = { phase: 'Bound', volumeName: pvName, capacity: pv.spec.capacity };
      }
    }

    // 2d. Reconcile CronJobs -> Jobs, and Jobs -> Pods
    const cronJobs = this.state.resources.filter((r) => r.kind === 'CronJob');
    for (const cj of cronJobs) {
      const ns = (cj.metadata && cj.metadata.namespace) || 'default';
      const jobName = `${cj.metadata.name}-run-1`;
      if (!this.getResource('Job', jobName, ns)) {
        const jobSpec = (cj.spec && cj.spec.jobTemplate && cj.spec.jobTemplate.spec) || {};
        this.state.resources.push({
          apiVersion: 'batch/v1',
          kind: 'Job',
          metadata: { name: jobName, namespace: ns, ownerCronJob: cj.metadata.name },
          spec: jobSpec,
          status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] }
        });
      }
      cj.status = { active: 0, lastScheduleTime: new Date().toISOString() };
    }

    const jobs = this.state.resources.filter((r) => r.kind === 'Job');
    for (const job of jobs) {
      const ns = (job.metadata && job.metadata.namespace) || 'default';
      const completions = (job.spec && job.spec.completions) || 1;
      const podName = `${job.metadata.name}-pod-1`;
      if (!this.getResource('Pod', podName, ns)) {
        const template = (job.spec && job.spec.template) || {
          spec: { containers: [{ name: job.metadata.name, image: 'busybox:1.36' }] }
        };
        this.state.resources.push({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: podName, namespace: ns, labels: { 'job-name': job.metadata.name }, ownerJob: job.metadata.name },
          spec: JSON.parse(JSON.stringify(template.spec || { containers: [{ name: job.metadata.name, image: 'busybox:1.36' }] })),
          status: { phase: 'Running', reason: 'Running', podIP: this.nextPodIP() }
        });
      }
      job.status = { succeeded: completions, ready: completions, conditions: [{ type: 'Complete', status: 'True' }] };
    }

    // 3. Reconcile Deployments, StatefulSets, Rollouts -> ReplicaSets & Pods
    const workloads = this.state.resources.filter(
      (r) => r.kind === 'Deployment' || r.kind === 'StatefulSet' || r.kind === 'Rollout'
    );

    for (const wl of workloads) {
      const ns = (wl.metadata && wl.metadata.namespace) || 'default';
      const name = wl.metadata.name;
      const desiredReplicas =
        wl.spec && wl.spec.replicas !== undefined ? Number(wl.spec.replicas) : 1;
      const template = (wl.spec && wl.spec.template) || {
        metadata: { labels: { app: name } },
        spec: { containers: [{ name, image: 'nginx:1.27-alpine' }] }
      };
      const podLabels = {
        ...((wl.spec && wl.spec.selector && wl.spec.selector.matchLabels) || {}),
        ...((template.metadata && template.metadata.labels) || { app: name })
      };

      if (wl.kind === 'Deployment') {
        const rsName = `${name}-7d9f8b`;
        let rs = this.getResource('ReplicaSet', rsName, ns);
        if (!rs) {
          rs = {
            apiVersion: 'apps/v1',
            kind: 'ReplicaSet',
            metadata: { name: rsName, namespace: ns, labels: { ...podLabels }, ownerDeployment: name },
            spec: { replicas: desiredReplicas, selector: { matchLabels: { ...podLabels } }, template },
            status: { replicas: desiredReplicas, readyReplicas: desiredReplicas, availableReplicas: desiredReplicas }
          };
          this.state.resources.push(rs);
        } else {
          rs.spec.replicas = desiredReplicas;
          rs.status = { replicas: desiredReplicas, readyReplicas: desiredReplicas, availableReplicas: desiredReplicas };
        }
      }

      // Remove existing owned pods for this workload and recreate/update to match desiredReplicas & template
      const existingPods = this.state.resources.filter(
        (r) =>
          r.kind === 'Pod' &&
          (r.metadata.namespace || 'default') === ns &&
          r.metadata.ownerDeployment === name
      );

      // Adjust pod count
      if (existingPods.length > desiredReplicas) {
        const toRemove = existingPods.slice(desiredReplicas).map((p) => p.metadata.name);
        this.state.resources = this.state.resources.filter(
          (r) => !(r.kind === 'Pod' && (r.metadata.namespace || 'default') === ns && toRemove.includes(r.metadata.name))
        );
      }

      for (let i = 0; i < desiredReplicas; i++) {
        const podSuffix = wl.kind === 'StatefulSet' ? `${i}` : `pod-${i + 1}`;
        const podName = `${name}-${podSuffix}`;
        const existingPod = this.getResource('Pod', podName, ns);
        const podSpec = JSON.parse(
          JSON.stringify(
            template.spec || { containers: [{ name, image: 'nginx:1.27-alpine' }] }
          )
        );

        if (existingPod) {
          existingPod.metadata.labels = { ...podLabels };
          existingPod. metadata.ownerDeployment = name;
          existingPod.spec = podSpec;
        } else {
          this.state.resources.push({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: podName,
              namespace: ns,
              labels: { ...podLabels },
              ownerDeployment: name
            },
            spec: podSpec,
            status: {
              podIP: this.nextPodIP()
            }
          });
        }
      }
    }

    // 4. Evaluate health of all Pods
    const allPods = this.state.resources.filter((r) => r.kind === 'Pod');
    for (const pod of allPods) {
      const health = this.evaluatePodHealth(pod);
      pod.status = {
        ...(pod.status || {}),
        phase: health.phase,
        reason: health.reason,
        ready: health.ready,
        restarts: health.restarts,
        message: health.message,
        nodeName: health.nodeName || (pod.status && pod.status.nodeName) || 'kubelabs-worker-01',
        podIP: health.phase === 'Running' ? (pod.status && pod.status.podIP) || this.nextPodIP() : '<none>'
      };
    }

    // 5. Update Deployment/StatefulSet/Rollout status counts
    for (const wl of workloads) {
      const ns = (wl.metadata && wl.metadata.namespace) || 'default';
      const name = wl.metadata.name;
      const desired = wl.spec && wl.spec.replicas !== undefined ? Number(wl.spec.replicas) : 1;
      const ownedPods = this.state.resources.filter(
        (r) =>
          r.kind === 'Pod' &&
          (r.metadata.namespace || 'default') === ns &&
          r.metadata.ownerDeployment === name
      );
      const readyCount = ownedPods.filter(
        (p) => p.status && p.status.phase === 'Running' && p.status.reason === 'Running'
      ).length;
      wl.status = {
        replicas: ownedPods.length,
        readyReplicas: readyCount,
        availableReplicas: readyCount,
        updatedReplicas: ownedPods.length,
         desiredReplicas: desired
      };
    }

    // 6. Reconcile Services -> Endpoints
    const services = this.state.resources.filter((r) => r.kind === 'Service');
    for (const svc of services) {
      const ns = (svc.metadata && svc.metadata.namespace) || 'default';
      const selector = (svc.spec && svc.spec.selector) || {};
      const selectorKeys = Object.keys(selector);
      const ports = (svc.spec && svc.spec.ports) || [{ port: 80, targetPort: 80 }];
      const targetPort = ports[0] ? ports[0].targetPort || ports[0].port : 80;

      const matchingPods = this.state.resources.filter((r) => {
        if (r.kind !== 'Pod') return false;
        if ((r.metadata.namespace || 'default') !== ns) return false;
        if (!r.status || r.status.phase !== 'Running' || r.status.reason !== 'Running') return false;
        if (selectorKeys.length === 0) return false;
        const pLabels = (r.metadata && r.metadata.labels) || {};
        return selectorKeys.every((k) => pLabels[k] === selector[k]);
      });

      const endpoints = matchingPods.map((p) => `${p.status.podIP}:${targetPort}`);
      svc.status = {
        ...(svc.status || {}),
        clusterIP: (svc.spec && svc.spec.clusterIP) || '10.96.42.100',
        endpoints,
        endpointCount: endpoints.length
      };

      if (selectorKeys.length > 0) {
        let epResource = this.getResource('Endpoints', svc.metadata.name, ns);
        if (!epResource) {
          epResource = {
            apiVersion: 'v1',
            kind: 'Endpoints',
            metadata: {
              name: svc.metadata.name,
              namespace: ns,
              labels: { ...(svc.metadata.labels || {}) }
            },
            subsets: []
          };
          this.state.resources.push(epResource);
        }
        epResource.subsets = [
          {
            addresses: matchingPods.map((p) => ({
              ip: p.status.podIP,
              targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns }
            })),
            ports: ports.map((p) => ({ port: p.port, name: p.name || 'http' }))
          }
        ];
      }
    }
  }

  evaluateRBAC({ user = 'kubernetes-admin', serviceAccount = null, verb = 'get', resource = 'pods', namespace = 'default' }) {
    if (user === 'kubernetes-admin' || user === 'system:admin') {
      return true;
    }

    const normResource = resource.toLowerCase();
    const normVerb = verb.toLowerCase();

    // 1. Check ClusterRoleBindings
    const clusterRoleBindings = this.state.resources.filter((r) => r.kind === 'ClusterRoleBinding');
    for (const crb of clusterRoleBindings) {
      const subjects = crb.subjects || [];
      const matchesSubject = subjects.some((sub) => {
        if (serviceAccount && sub.kind === 'ServiceAccount') {
          return sub.name === serviceAccount && (!sub.namespace || sub.namespace === namespace);
        }
        if (sub.kind === 'User' && sub.name === user) return true;
        if (sub.kind === 'Group' && sub.name === 'system:masters') return true;
        return false;
      });

      if (matchesSubject && crb.roleRef) {
        const role = this.getResource('ClusterRole', crb.roleRef.name);
        if (role && this.checkRoleRules(role.rules, normVerb, normResource)) {
          return true;
        }
      }
    }

    // 2. Check RoleBindings in target namespace
    const roleBindings = this.state.resources.filter(
      (r) => r.kind === 'RoleBinding' && (r.metadata.namespace || 'default') === namespace
    );
    for (const rb of roleBindings) {
      const subjects = rb.subjects || [];
      const matchesSubject = subjects.some((sub) => {
        if (serviceAccount && sub.kind === 'ServiceAccount') {
          return sub.name === serviceAccount && (!sub.namespace || sub.namespace === namespace);
        }
        if (sub.kind === 'User' && sub.name === user) return true;
        return false;
      });

      if (matchesSubject && rb.roleRef) {
        const role =
          rb.roleRef.kind === 'ClusterRole'
            ? this.getResource('ClusterRole', rb.roleRef.name)
            : this.getResource('Role', rb.roleRef.name, namespace);
        if (role && this.checkRoleRules(role.rules, normVerb, normResource)) {
          return true;
        }
      }
    }

    return false;
  }

  checkRoleRules(rules, verb, resource) {
    if (!Array.isArray(rules)) return false;
    return rules.some((rule) => {
      const verbs = (rule.verbs || []).map((v) => v.toLowerCase());
      const resList = (rule.resources || []).map((r) => r.toLowerCase());
      const hasVerb = verbs.includes('*') || verbs.includes(verb);
      const hasRes = resList.includes('*') || resList.includes(resource);
      return hasVerb && hasRes;
    });
  }

  cordonNode(nodeName) {
    const node = this.getResource('Node', nodeName);
    if (!node) throw new Error(`node "${nodeName}" not found`);
    node.spec = node.spec || {};
    node.spec.unschedulable = true;
    this.reconcile();
    return node;
  }

  uncordonNode(nodeName) {
    const node = this.getResource('Node', nodeName);
    if (!node) throw new Error(`node "${nodeName}" not found`);
    node.spec = node.spec || {};
    node.spec.unschedulable = false;
    this.reconcile();
    return node;
  }

  drainNode(nodeName, options = {}) {
    const node = this.cordonNode(nodeName);
    const pdbs = this.state.resources.filter((r) => r.kind === 'PodDisruptionBudget');
    const podsOnNode = this.state.resources.filter(
      (r) => r.kind === 'Pod' && r.status && r.status.nodeName === nodeName && !r.metadata?.ownerDaemonSet
    );

    if (pdbs.length > 0 && !options.force) {
      for (const pod of podsOnNode) {
        const ns = (pod.metadata && pod.metadata.namespace) || 'default';
        for (const pdb of pdbs) {
          if (((pdb.metadata && pdb.metadata.namespace) || 'default') !== ns) continue;
          const selector = pdb.spec?.selector;
          const podLabels = (pod.metadata && pod.metadata.labels) || {};
          let matches = true;
          if (typeof selector === 'string') {
            for (const pair of selector.split(',')) {
              const [k, v] = pair.split('=').map((s) => s.trim());
              if (k && podLabels[k] !== v) { matches = false; break; }
            }
          } else if (selector && selector.matchLabels) {
            for (const [k, v] of Object.entries(selector.matchLabels)) {
              if (podLabels[k] !== String(v)) { matches = false; break; }
            }
          }
          if (!matches) continue;

          // Count healthy matching pods
          const matchingHealthy = this.state.resources.filter((r) => {
            if (r.kind !== 'Pod' || ((r.metadata && r.metadata.namespace) || 'default') !== ns || r.status?.phase !== 'Running') return false;
            const rLabels = (r.metadata && r.metadata.labels) || {};
            if (typeof selector === 'string') {
              for (const pair of selector.split(',')) {
                const [k, v] = pair.split('=').map((s) => s.trim());
                if (k && rLabels[k] !== v) return false;
              }
            } else if (selector && selector.matchLabels) {
              for (const [k, v] of Object.entries(selector.matchLabels)) {
                if (rLabels[k] !== String(v)) return false;
              }
            }
            return true;
          }).length;

          if (pdb.spec?.minAvailable !== undefined) {
            const minAvail = parseInt(pdb.spec.minAvailable, 10);
            if ((matchingHealthy - 1) < minAvail) {
              throw new Error(`Cannot evict pod: would violate PodDisruptionBudget "${pdb.metadata.name}" (minAvailable: ${minAvail}, healthy: ${matchingHealthy})`);
            }
          }
        }
      }
    }

    this.state.resources = this.state.resources.filter((r) => {
      if (r.kind !== 'Pod') return true;
      if (r.status && r.status.nodeName === nodeName && !r.metadata.ownerDaemonSet) {
        return false;
      }
      return true;
    });
    this.reconcile();
    return node;
  }

  taintNode(nodeName, key, value, effect = 'NoSchedule') {
    const node = this.getResource('Node', nodeName);
    if (!node) throw new Error(`node "${nodeName}" not found`);
    node.spec = node.spec || {};
    node.spec.taints = node.spec.taints || [];
    node.spec.taints = node.spec.taints.filter((t) => t.key !== key);
    if (effect !== '-') {
      node.spec.taints.push({ key, value, effect });
    }
    this.reconcile();
    return node;
  }

  labelResource(kind, name, labels, namespace = 'default') {
    const res = this.getResource(kind, name, namespace);
    if (!res) throw new Error(`${normalizeKind(kind)} "${name}" not found`);
    res.metadata = res.metadata || {};
    res.metadata.labels = res.metadata.labels || {};
    for (const [k, v] of Object.entries(labels)) {
      if (v === null || v === '-') {
        delete res.metadata.labels[k];
      } else {
        res.metadata.labels[k] = String(v);
      }
    }
    this.reconcile();
    return res;
  }

  annotateResource(kind, name, annotations, namespace = 'default') {
    const res = this.getResource(kind, name, namespace);
    if (!res) throw new Error(`${normalizeKind(kind)} "${name}" not found`);
    res.metadata = res.metadata || {};
    res.metadata.annotations = res.metadata.annotations || {};
    for (const [k, v] of Object.entries(annotations)) {
      if (v === null || v === '-') {
        delete res.metadata.annotations[k];
      } else {
        res.metadata.annotations[k] = String(v);
      }
    }
    this.reconcile();
    return res;
  }

  recordEvent(kind, name, namespace, type, reason, message) {
    this.state.events.push({
      timestamp: new Date().toISOString(),
      kind,
      name,
      namespace,
      type,
      reason,
      message
    });
    if (this.state.events.length > 100) {
      this.state.events.shift();
    }
  }
}

module.exports = {
  VirtualCluster,
  parseManifests,
  parseSimpleYamlDocument,
  evaluateJsonPath,
  normalizeKind,
  getFieldByPath,
  CLUSTER_SCOPED_KINDS
};
