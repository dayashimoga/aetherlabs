'use strict';

/**
 * KubeLabs v4.0 Authentic CLI Output Formatting Engine
 * Subphase 1.1.1: Dynamic Column-Padding ASCII Table & Wide Output Renderer
 * Subphase 1.1.2: YAML, JSON, JSONPath & Describe Renderers
 *
 * Provides real kubectl get tabular rendering, -o yaml, -o json, -o jsonpath=<expr>,
 * and authentic multi-section kubectl describe output with live ResourceGraph events.
 */

let yamlParser;
try {
  yamlParser = require('./yamlParser');
} catch {
  yamlParser = (typeof globalThis !== 'undefined' && globalThis.yamlParser) || {};
}

let jsonPathModule;
try {
  jsonPathModule = require('./jsonPath');
} catch {
  jsonPathModule = (typeof globalThis !== 'undefined' && globalThis.jsonPathModule) || {};
}

const KIND_ALIASES = {
  po: 'Pod',
  pod: 'Pod',
  pods: 'Pod',
  deploy: 'Deployment',
  deployment: 'Deployment',
  deployments: 'Deployment',
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
  endpoint: 'Endpoints',
  endpoints: 'Endpoints',
  ing: 'Ingress',
  ingress: 'Ingress',
  ingresses: 'Ingress',
  gw: 'Gateway',
  gtw: 'Gateway',
  gateway: 'Gateway',
  gateways: 'Gateway',
  httproute: 'HTTPRoute',
  httproutes: 'HTTPRoute',
  netpol: 'NetworkPolicy',
  networkpolicy: 'NetworkPolicy',
  networkpolicies: 'NetworkPolicy',
  pv: 'PersistentVolume',
  persistentvolume: 'PersistentVolume',
  persistentvolumes: 'PersistentVolume',
  pvc: 'PersistentVolumeClaim',
  persistentvolumeclaim: 'PersistentVolumeClaim',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  sc: 'StorageClass',
  storageclass: 'StorageClass',
  storageclasses: 'StorageClass',
  sa: 'ServiceAccount',
  serviceaccount: 'ServiceAccount',
  serviceaccounts: 'ServiceAccount',
  role: 'Role',
  roles: 'Role',
  rb: 'RoleBinding',
  rolebinding: 'RoleBinding',
  rolebindings: 'RoleBinding',
  no: 'Node',
  node: 'Node',
  nodes: 'Node',
  ns: 'Namespace',
  namespace: 'Namespace',
  namespaces: 'Namespace',
  ev: 'Event',
  event: 'Event',
  events: 'Event'
};

const CLUSTER_SCOPED_KINDS = new Set([
  'Node',
  'Namespace',
  'PersistentVolume',
  'StorageClass',
  'ClusterRole',
  'ClusterRoleBinding',
  'CustomResourceDefinition',
  'PriorityClass',
  'GatewayClass'
]);

/**
 * Normalizes container specs into an array safely
 */
function normalizeContainers(raw, fallbackName = 'main', fallbackImage = 'nginx:alpine') {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const vals = Object.values(raw);
    if (vals.length > 0) return vals;
  }
  return [{ name: fallbackName, image: fallbackImage }];
}

/**
 * Normalizes a resource kind string or alias to canonical PascalCase.
 * @param {string} input
 * @returns {string}
 */
function normalizeKind(input) {
  if (!input) return 'Pod';
  const lower = String(input).trim().toLowerCase();
  if (KIND_ALIASES[lower]) return KIND_ALIASES[lower];
  return String(input).charAt(0).toUpperCase() + String(input).slice(1);
}

/**
 * Calculates human-readable Kubernetes age (e.g. 15s, 4m, 2h, 5d).
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
function calculateAge(timestamp) {
  if (!timestamp) return '2m';
  const created = new Date(timestamp).getTime();
  if (Number.isNaN(created)) return '2m';
  const diffSec = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

function splitSelectorTerms(selector) {
  const terms = [];
  let current = '';
  let inParen = false;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(') inParen = true;
    else if (ch === ')') inParen = false;

    if (ch === ',' && !inParen) {
      if (current.trim()) terms.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) terms.push(current.trim());
  return terms;
}

/**
 * Matches a resource's labels against a kubectl label selector expression.
 * Supports: `app=web`, `app==web`, `tier!=db`, `key in (v1,v2)`, `key notin (v1,v2)`, `key`, `!key`.
 * @param {Object} labels
 * @param {string} selector
 * @returns {boolean}
 */
function matchesSelector(labels = {}, selector = '') {
  if (!selector || typeof selector !== 'string' || !selector.trim()) {
    return true;
  }
  const safeLabels = labels || {};
  const terms = splitSelectorTerms(selector);

  for (const term of terms) {
    if (term.includes(' notin ')) {
      const match = term.match(/^([a-zA-Z0-9_./-]+)\s+notin\s*\(([^)]+)\)$/);
      if (match) {
        const key = match[1].trim();
        const vals = match[2].split(',').map((v) => v.trim());
        const actual = safeLabels[key];
        if (actual && vals.includes(actual)) return false;
        continue;
      }
    }
    if (term.includes(' in ')) {
      const match = term.match(/^([a-zA-Z0-9_./-]+)\s+in\s*\(([^)]+)\)$/);
      if (match) {
        const key = match[1].trim();
        const vals = match[2].split(',').map((v) => v.trim());
        const actual = safeLabels[key];
        if (!actual || !vals.includes(actual)) return false;
        continue;
      }
    }
    if (term.includes('!=')) {
      const [k, v] = term.split('!=').map((s) => s.trim());
      if (safeLabels[k] === v) return false;
      continue;
    }
    if (term.includes('==')) {
      const [k, v] = term.split('==').map((s) => s.trim());
      if (safeLabels[k] !== v) return false;
      continue;
    }
    if (term.includes('=')) {
      const [k, v] = term.split('=').map((s) => s.trim());
      if (safeLabels[k] !== v) return false;
      continue;
    }
    if (term.startsWith('!')) {
      const k = term.slice(1).trim();
      if (k in safeLabels) return false;
      continue;
    }
    // Simple key existence check
    if (!(term in safeLabels)) return false;
  }
  return true;
}

/**
 * Formats a 2D array or object table with dynamic column width padding.
 * Ensures authentic column alignment with 2-space gutters.
 * @param {Array<string>} headers
 * @param {Array<Array<string>>} rows
 * @returns {string}
 */
function formatTable(headers, rows) {
  if (!headers || headers.length === 0) return '';
  if (!rows || rows.length === 0) return headers.join('  ');

  // Compute maximum content width for each column
  const colWidths = headers.map((header, colIdx) => {
    let max = String(header || '').length;
    for (const row of rows) {
      const val = row && row[colIdx] !== undefined ? String(row[colIdx]) : '';
      if (val.length > max) {
        max = val.length;
      }
    }
    return max;
  });

  const gutter = '   '; // 3 spaces gutter (standard kubectl table spacing)

  const formatLine = (row) =>
    row
      .map((cell, idx) => {
        const str = String(cell !== undefined && cell !== null ? cell : '');
        // Do not pad the very last column
        if (idx === row.length - 1) return str;
        return str.padEnd(colWidths[idx], ' ');
      })
      .join(gutter);

  const headerLine = formatLine(headers);
  const dataLines = rows.map((r) => formatLine(r));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Formats labels object into a key=val,key=val string or '<none>'.
 * @param {Object} labels
 * @returns {string}
 */
function formatLabels(labels) {
  if (!labels || typeof labels !== 'object') return '<none>';
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '<none>';
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

/**
 * Main Resource Table Renderer for `kubectl get`
 * @param {string} rawKind
 * @param {Array<Object>} resources
 * @param {Object} options - { allNamespaces, wide, showLabels, selector, namespace }
 * @returns {string}
 */
function formatResourceTable(rawKind, resources = [], options = {}) {
  const kind = normalizeKind(rawKind);
  const isClusterScoped = CLUSTER_SCOPED_KINDS.has(kind);
  const showNamespace = Boolean(options.allNamespaces && !isClusterScoped);
  const isWide = Boolean(options.wide || options.output === 'wide');
  const showLabels = Boolean(options.showLabels);

  // Filter by selector if provided
  let filtered = (resources || []).filter((r) => {
    if (!r) return false;
    const rKind = normalizeKind(r.kind || kind);
    if (rKind !== kind) return false;
    return matchesSelector(r.metadata?.labels, options.selector);
  });

  // Handle empty results
  if (filtered.length === 0) {
    if (options.allNamespaces) {
      return 'No resources found';
    }
    return `No resources found in ${options.namespace || 'default'} namespace.`;
  }

  let headers = [];
  let rows = [];

  switch (kind) {
    case 'Pod': {
      headers = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'];
      if (isWide) {
        headers.push('IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES');
      }
      rows = filtered.map((p) => {
        const meta = p.metadata || {};
        const status = p.status || {};
        const spec = p.spec || {};
        const containers = normalizeContainers(spec.containers, meta.name || 'main');
        const containerStatuses = status.containerStatuses || [];

        let readyStr = '1/1';
        if (status.ready) {
          readyStr = String(status.ready);
        } else if (containerStatuses && containerStatuses.length > 0) {
          const readyCount = containerStatuses.filter((c) => c && c.ready).length;
          readyStr = `${readyCount}/${containerStatuses.length}`;
        } else {
          const total = containers.length || 1;
          const readyCount = status.phase === 'Running' ? total : 0;
          readyStr = `${readyCount}/${total}`;
        }

        const phase = status.reason || status.phase || 'Running';
        const restarts = status.restartCount !== undefined
          ? String(status.restartCount)
          : status.restarts !== undefined
          ? String(status.restarts)
          : '0';
        const age = calculateAge(meta.creationTimestamp);

        const row = [meta.name, readyStr, phase, restarts, age];
        if (isWide) {
          const ip = status.podIP || '<none>';
          const node = status.nodeName || spec.nodeName || '<none>';
          const nominatedNode = status.nominatedNodeName || '<none>';
          const readinessGates = status.readinessGates ? status.readinessGates.join(',') : '<none>';
          row.push(ip, node, nominatedNode, readinessGates);
        }
        return row;
      });
      break;
    }

    case 'Deployment': {
      headers = ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'];
      if (isWide) {
        headers.push('CONTAINERS', 'IMAGES', 'SELECTOR');
      }
      rows = filtered.map((d) => {
        const meta = d.metadata || {};
        const spec = d.spec || {};
        const status = d.status || {};
        const desired = spec.replicas !== undefined ? spec.replicas : 1;
        const ready = status.readyReplicas !== undefined ? status.readyReplicas : desired;
        const upToDate = status.updatedReplicas !== undefined ? status.updatedReplicas : desired;
        const available = status.availableReplicas !== undefined ? status.availableReplicas : ready;
        const age = calculateAge(meta.creationTimestamp);

        const row = [meta.name, `${ready}/${desired}`, String(upToDate), String(available), age];
        if (isWide) {
          const containers = normalizeContainers(spec.template?.spec?.containers, meta.name || 'main');
          const cNames = containers.map((c) => c.name).join(',') || '<none>';
          const cImages = containers.map((c) => c.image).join(',') || '<none>';
          const sel = formatLabels(spec.selector?.matchLabels);
          row.push(cNames, cImages, sel);
        }
        return row;
      });
      break;
    }

    case 'StatefulSet': {
      headers = ['NAME', 'READY', 'AGE'];
      if (isWide) {
        headers.push('CONTAINERS', 'IMAGES');
      }
      rows = filtered.map((s) => {
        const meta = s.metadata || {};
        const spec = s.spec || {};
        const status = s.status || {};
        const desired = spec.replicas !== undefined ? spec.replicas : 1;
        const ready = status.readyReplicas !== undefined ? status.readyReplicas : desired;
        const age = calculateAge(meta.creationTimestamp);

        const row = [meta.name, `${ready}/${desired}`, age];
        if (isWide) {
          const containers = normalizeContainers(spec.template?.spec?.containers, meta.name || 'main');
          const cNames = containers.map((c) => c.name).join(',') || '<none>';
          const cImages = containers.map((c) => c.image).join(',') || '<none>';
          row.push(cNames, cImages);
        }
        return row;
      });
      break;
    }

    case 'DaemonSet': {
      headers = ['NAME', 'DESIRED', 'CURRENT', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'NODE SELECTOR', 'AGE'];
      if (isWide) {
        headers.push('CONTAINERS', 'IMAGES', 'SELECTOR');
      }
      rows = filtered.map((ds) => {
        const meta = ds.metadata || {};
        const spec = ds.spec || {};
        const status = ds.status || {};
        const desired = status.desiredNumberScheduled !== undefined ? status.desiredNumberScheduled : 3;
        const current = status.currentNumberScheduled !== undefined ? status.currentNumberScheduled : desired;
        const ready = status.numberReady !== undefined ? status.numberReady : current;
        const upToDate = status.updatedNumberScheduled !== undefined ? status.updatedNumberScheduled : desired;
        const available = status.numberAvailable !== undefined ? status.numberAvailable : ready;
        const nodeSel = formatLabels(spec.template?.spec?.nodeSelector);
        const age = calculateAge(meta.creationTimestamp);

        const row = [
          meta.name,
          String(desired),
          String(current),
          String(ready),
          String(upToDate),
          String(available),
          nodeSel,
          age
        ];
        if (isWide) {
          const containers = normalizeContainers(spec.template?.spec?.containers, meta.name || 'main');
          const cNames = containers.map((c) => c.name).join(',') || '<none>';
          const cImages = containers.map((c) => c.image).join(',') || '<none>';
          const sel = formatLabels(spec.selector?.matchLabels);
          row.push(cNames, cImages, sel);
        }
        return row;
      });
      break;
    }

    case 'Service': {
      headers = ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'];
      if (isWide) {
        headers.push('SELECTOR');
      }
      rows = filtered.map((svc) => {
        const meta = svc.metadata || {};
        const spec = svc.spec || {};
        const status = svc.status || {};
        const type = spec.type || 'ClusterIP';
        const clusterIP = status.clusterIP || spec.clusterIP || 'None';
        let externalIP = '<none>';
        if (status.loadBalancer?.ingress?.length) {
          externalIP = status.loadBalancer.ingress.map((i) => i.ip || i.hostname).join(',');
        } else if (Array.isArray(spec.externalIPs) && spec.externalIPs.length) {
          externalIP = spec.externalIPs.join(',');
        }

        let rawPorts = spec.ports || [];
        if (!Array.isArray(rawPorts)) {
          rawPorts = typeof rawPorts === 'object' && rawPorts !== null ? Object.values(rawPorts) : [];
        }
        const ports = rawPorts
          .map((p) => {
            if (typeof p === 'number' || typeof p === 'string') return `${p}/TCP`;
            const proto = p.protocol || 'TCP';
            if (p.nodePort) {
              return `${p.port}:${p.nodePort}/${proto}`;
            }
            return `${p.port || 80}/${proto}`;
          })
          .join(',') || '<none>';
        const age = calculateAge(meta.creationTimestamp);

        const row = [meta.name, type, clusterIP, externalIP, ports, age];
        if (isWide) {
          row.push(formatLabels(spec.selector));
        }
        return row;
      });
      break;
    }

    case 'Endpoints': {
      headers = ['NAME', 'ENDPOINTS', 'AGE'];
      rows = filtered.map((ep) => {
        const meta = ep.metadata || {};
        const subsets = ep.subsets || [];
        let epList = [];
        if (Array.isArray(ep.status?.endpoints)) {
          epList = ep.status.endpoints;
        } else if (Array.isArray(subsets)) {
          for (const sub of subsets) {
            const addrs = (sub.addresses || []).map((a) => a.ip);
            const ports = (sub.ports || []).map((p) => p.port);
            for (const ip of addrs) {
              for (const port of ports) {
                epList.push(`${ip}:${port}`);
              }
            }
          }
        }
        const epStr = epList.length > 0 ? epList.join(',') : '<none>';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, epStr, age];
      });
      break;
    }

    case 'Ingress': {
      headers = ['NAME', 'CLASS', 'HOSTS', 'ADDRESS', 'PORTS', 'AGE'];
      rows = filtered.map((ing) => {
        const meta = ing.metadata || {};
        const spec = ing.spec || {};
        const status = ing.status || {};
        const cls = spec.ingressClassName || '<none>';
        const hosts = (spec.rules || []).map((r) => r.host).filter(Boolean).join(',') || '*';
        let addr = '<none>';
        if (status.loadBalancer?.ingress?.length) {
          addr = status.loadBalancer.ingress.map((i) => i.ip || i.hostname).join(',');
        }
        const ports = spec.tls && spec.tls.length > 0 ? '80, 443' : '80';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, cls, hosts, addr, ports, age];
      });
      break;
    }

    case 'Gateway': {
      headers = ['NAME', 'CLASS', 'ADDRESSES', 'READY', 'AGE'];
      rows = filtered.map((gw) => {
        const meta = gw.metadata || {};
        const spec = gw.spec || {};
        const status = gw.status || {};
        const cls = spec.gatewayClassName || 'istio';
        const addresses = (status.addresses || []).map((a) => a.value).join(',') || '<none>';
        const isReady = (status.conditions || []).some((c) => c.type === 'Ready' && c.status === 'True') ? 'True' : 'True';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, cls, addresses, isReady, age];
      });
      break;
    }

    case 'HTTPRoute': {
      headers = ['NAME', 'HOSTNAMES', 'AGE'];
      rows = filtered.map((hr) => {
        const meta = hr.metadata || {};
        const spec = hr.spec || {};
        const hosts = (spec.hostnames || []).join(',') || '*';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, hosts, age];
      });
      break;
    }

    case 'NetworkPolicy': {
      headers = ['NAME', 'POD-SELECTOR', 'AGE'];
      rows = filtered.map((np) => {
        const meta = np.metadata || {};
        const spec = np.spec || {};
        const podSel = formatLabels(spec.podSelector?.matchLabels);
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, podSel, age];
      });
      break;
    }

    case 'PersistentVolume': {
      headers = ['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM POLICY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'REASON', 'AGE'];
      rows = filtered.map((pv) => {
        const meta = pv.metadata || {};
        const spec = pv.spec || {};
        const status = pv.status || {};
        const capacity = spec.capacity?.storage || '10Gi';
        const modes = (spec.accessModes || ['RWO']).join(',');
        const policy = spec.persistentVolumeReclaimPolicy || 'Retain';
        const phase = status.phase || 'Bound';
        const claim = spec.claimRef ? `${spec.claimRef.namespace}/${spec.claimRef.name}` : '<none>';
        const sc = spec.storageClassName || 'standard';
        const reason = status.reason || '';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, capacity, modes, policy, phase, claim, sc, reason, age];
      });
      break;
    }

    case 'PersistentVolumeClaim': {
      headers = ['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'AGE'];
      rows = filtered.map((pvc) => {
        const meta = pvc.metadata || {};
        const spec = pvc.spec || {};
        const status = pvc.status || {};
        const phase = status.phase || 'Bound';
        const volume = spec.volumeName || (phase === 'Bound' ? `pvc-${meta.name}` : '');
        const capacity = spec.resources?.requests?.storage || '10Gi';
        const modes = (spec.accessModes || ['RWO']).join(',');
        const sc = spec.storageClassName || 'standard';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, phase, volume, capacity, modes, sc, age];
      });
      break;
    }

    case 'StorageClass': {
      headers = ['NAME', 'PROVISIONER', 'RECLAIMPOLICY', 'VOLUMEBINDINGMODE', 'ALLOWVOLUMEEXPANSION', 'AGE'];
      rows = filtered.map((sc) => {
        const meta = sc.metadata || {};
        const provisioner = sc.provisioner || 'kubernetes.io/no-provisioner';
        const reclaimPolicy = sc.reclaimPolicy || 'Delete';
        const bindingMode = sc.volumeBindingMode || 'Immediate';
        const allowExpansion = sc.allowVolumeExpansion ? 'true' : 'false';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, provisioner, reclaimPolicy, bindingMode, allowExpansion, age];
      });
      break;
    }

    case 'ServiceAccount': {
      headers = ['NAME', 'SECRETS', 'AGE'];
      rows = filtered.map((sa) => {
        const meta = sa.metadata || {};
        const secrets = String((sa.secrets || []).length || 0);
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, secrets, age];
      });
      break;
    }

    case 'Role': {
      headers = ['NAME', 'CREATED AT'];
      rows = filtered.map((r) => {
        const meta = r.metadata || {};
        const createdAt = meta.creationTimestamp || new Date().toISOString();
        return [meta.name, createdAt];
      });
      break;
    }

    case 'RoleBinding': {
      headers = ['NAME', 'ROLE', 'AGE'];
      rows = filtered.map((rb) => {
        const meta = rb.metadata || {};
        const role = rb.roleRef?.name ? `${rb.roleRef.kind || 'Role'}/${rb.roleRef.name}` : '<none>';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, role, age];
      });
      break;
    }

    case 'Node': {
      headers = ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'];
      if (isWide) {
        headers.push('INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME');
      }
      rows = filtered.map((n) => {
        const meta = n.metadata || {};
        const status = n.status || {};
        const labels = meta.labels || {};
        const role = 'node-role.kubernetes.io/control-plane' in labels
          ? 'control-plane'
          : 'node-role.kubernetes.io/master' in labels
          ? 'control-plane'
          : 'worker';
        const phase = status.phase || 'Ready';
        const version = status.kubeletVersion || status.nodeInfo?.kubeletVersion || 'v1.32.0';
        const age = calculateAge(meta.creationTimestamp);

        const row = [meta.name, phase, role, age, version];
        if (isWide) {
          const internalIP = status.internalIP || '192.168.1.10';
          const externalIP = status.externalIP || '<none>';
          const osImage = status.nodeInfo?.osImage || 'Ubuntu 24.04 LTS';
          const kernel = status.nodeInfo?.kernelVersion || '6.8.0-45-generic';
          const runtime = status.nodeInfo?.containerRuntimeVersion || 'containerd://1.7.13';
          row.push(internalIP, externalIP, osImage, kernel, runtime);
        }
        return row;
      });
      break;
    }

    case 'Namespace': {
      headers = ['NAME', 'STATUS', 'AGE'];
      rows = filtered.map((ns) => {
        const meta = ns.metadata || {};
        const status = ns.status || {};
        const phase = status.phase || 'Active';
        const age = calculateAge(meta.creationTimestamp);
        return [meta.name, phase, age];
      });
      break;
    }

    case 'Event': {
      headers = ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'];
      rows = filtered.map((ev) => {
        const meta = ev.metadata || {};
        const lastSeen = calculateAge(ev.lastTimestamp || meta.creationTimestamp);
        const type = ev.type || 'Normal';
        const reason = ev.reason || 'Scheduled';
        const obj = ev.involvedObject ? `${ev.involvedObject.kind || 'Pod'}/${ev.involvedObject.name || ''}` : meta.name;
        const msg = ev.message || '';
        return [lastSeen, type, reason, obj, msg];
      });
      break;
    }

    default: {
      headers = ['NAME', 'AGE'];
      rows = filtered.map((r) => {
        const meta = r.metadata || {};
        return [meta.name || '<unnamed>', calculateAge(meta.creationTimestamp)];
      });
      break;
    }
  }

  // Prepend NAMESPACE column if -A / --all-namespaces
  if (showNamespace) {
    headers.unshift('NAMESPACE');
    rows.forEach((row, idx) => {
      const res = filtered[idx];
      const ns = res.metadata?.namespace || 'default';
      row.unshift(ns);
    });
  }

  // Append LABELS column if --show-labels
  if (showLabels) {
    headers.push('LABELS');
    rows.forEach((row, idx) => {
      const res = filtered[idx];
      const lbls = formatLabels(res.metadata?.labels);
      row.push(lbls);
    });
  }

  return formatTable(headers, rows);
}

/**
 * Formats a resource or resource list as authentic YAML.
 * @param {Object|Array} payload
 * @returns {string}
 */
function formatYaml(payload) {
  let doc = payload;
  if (Array.isArray(payload)) {
    doc = {
      apiVersion: 'v1',
      items: payload,
      kind: 'List',
      metadata: {
        resourceVersion: ''
      }
    };
  }
  if (yamlParser.stringifyYaml) {
    return yamlParser.stringifyYaml(doc);
  }
  return JSON.stringify(doc, null, 2);
}

/**
 * Formats a resource or resource list as authentic JSON.
 * @param {Object|Array} payload
 * @returns {string}
 */
function formatJson(payload) {
  let doc = payload;
  if (Array.isArray(payload)) {
    doc = {
      apiVersion: 'v1',
      items: payload,
      kind: 'List',
      metadata: {
        resourceVersion: ''
      }
    };
  }
  return JSON.stringify(doc, null, 2);
}

/**
 * Evaluates a JSONPath query against a resource or list.
 * @param {Object|Array} payload
 * @param {string} expr
 * @returns {string}
 */
function formatJsonPath(payload, expr = '') {
  let doc = payload;
  if (Array.isArray(payload)) {
    doc = {
      apiVersion: 'v1',
      items: payload,
      kind: 'List',
      metadata: {
        resourceVersion: ''
      }
    };
  }
  const cleanExpr = String(expr || '').trim().replace(/^['"]|['"]$/g, '');
  if (!cleanExpr) return '';

  if (jsonPathModule.formatJsonPath) {
    const wrapped = cleanExpr.startsWith('{') ? cleanExpr : `{${cleanExpr}}`;
    const res = jsonPathModule.formatJsonPath(doc, wrapped);
    if (res !== undefined && res !== '') return res;
  }

  if (jsonPathModule.jsonPath) {
    const query = cleanExpr.replace(/^\{|\}$/g, '');
    const jsonPathExpr = query.startsWith('$') ? query : `$.${query.replace(/^\./, '')}`;
    const raw = jsonPathModule.jsonPath(doc, jsonPathExpr);
    if (Array.isArray(raw)) {
      return raw.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(' ');
    }
    return String(raw !== undefined && raw !== null ? raw : '');
  }

  return '';
}

/**
 * Helper to format labels/annotations multiline matching standard kubectl describe
 */
function formatLabelsMultiline(labels, indent = '                  ') {
  if (!labels || typeof labels !== 'object') return '<none>';
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '<none>';
  return keys.map((k, i) => (i === 0 ? `${k}=${labels[k]}` : `${indent}${k}=${labels[k]}`)).join('\n');
}

/**
 * Helper to render events table in kubectl describe
 */
function formatEventsSection(resource, events = []) {
  const meta = resource.metadata || {};
  const kind = resource.kind || 'Pod';
  const name = meta.name;
  const namespace = meta.namespace;

  // Filter events relevant to this resource
  const matched = (events || []).filter((e) => {
    if (!e) return false;
    if (e.name === name || e.involvedObject?.name === name) {
      if (namespace && e.namespace && e.namespace !== namespace) return false;
      return true;
    }
    return false;
  });

  if (matched.length === 0) {
    return 'Events:  <none>';
  }

  const headers = ['Type', 'Reason', 'Age', 'From', 'Message'];
  const rows = matched.map((e) => {
    const type = e.type || 'Normal';
    const reason = e.reason || 'Scheduled';
    const age = calculateAge(e.timestamp || e.lastTimestamp);
    const from = e.from || (type === 'Warning' ? 'kubelet' : 'default-scheduler');
    const msg = e.message || '';
    return [type, reason, age, from, msg];
  });

  // Calculate widths for event columns
  const colWidths = headers.map((h, colIdx) => {
    let max = h.length;
    for (const r of rows) {
      const len = String(r[colIdx] || '').length;
      if (len > max) max = len;
    }
    return max;
  });

  const lines = ['Events:'];
  const headerLine = '  ' + headers.map((h, i) => (i === headers.length - 1 ? h : h.padEnd(colWidths[i] + 2, ' '))).join('');
  const dividerLine = '  ' + headers.map((h, i) => (i === headers.length - 1 ? '-------' : '-'.repeat(Math.max(4, h.length)).padEnd(colWidths[i] + 2, ' '))).join('');
  lines.push(headerLine);
  lines.push(dividerLine);

  for (const r of rows) {
    const rowLine = '  ' + r.map((c, i) => (i === r.length - 1 ? c : String(c).padEnd(colWidths[i] + 2, ' '))).join('');
    lines.push(rowLine);
  }

  return lines.join('\n');
}

/**
 * Authentic multi-section kubectl describe output generator
 * @param {Object} resource
 * @param {Array<Object>} events
 * @param {Object} options
 * @returns {string}
 */
function formatDescribe(resource, events = [], options = {}) {
  if (!resource || typeof resource !== 'object') return '';
  const kind = normalizeKind(resource.kind);
  const meta = resource.metadata || {};
  const spec = resource.spec || {};
  const status = resource.status || {};
  const lines = [];

  switch (kind) {
    case 'Pod': {
      lines.push(`Name:             ${meta.name}`);
      lines.push(`Namespace:        ${meta.namespace || 'default'}`);
      lines.push(`Priority:         ${spec.priority || 0}`);
      lines.push(`Service Account:  ${spec.serviceAccountName || spec.serviceAccount || 'default'}`);
      const nodeName = status.nodeName || spec.nodeName || 'kubelabs-worker-01';
      lines.push(`Node:             ${nodeName}/192.168.1.10`);
      lines.push(`Start Time:       ${status.startTime || meta.creationTimestamp || 'Fri, 13 Nov 2026 12:00:00 +0000'}`);
      lines.push(`Labels:           ${formatLabelsMultiline(meta.labels)}`);
      lines.push(`Annotations:      ${formatLabelsMultiline(meta.annotations)}`);
      lines.push(`Status:           ${status.phase || 'Running'}`);
      lines.push(`IP:               ${status.podIP || '10.244.1.21'}`);
      lines.push('IPs:');
      lines.push(`  IP:  ${status.podIP || '10.244.1.21'}`);
      const controlledBy = meta.ownerReferences
        ? meta.ownerReferences.map((o) => `${o.kind}/${o.name}`).join(',')
        : meta.ownerDeployment
        ? `Deployment/${meta.ownerDeployment}`
        : 'ReplicaSet/' + (meta.name.replace(/-[a-z0-9]+$/, '') || 'web');
      lines.push(`Controlled By:    ${controlledBy}`);

      lines.push('Containers:');
      const containers = normalizeContainers(spec.containers, meta.name || 'main');
      for (const c of containers) {
        lines.push(`  ${c.name}:`);
        lines.push(`    Container ID:   containerd://b9a8f4c3d2e1`);
        lines.push(`    Image:          ${c.image || 'nginx:alpine'}`);
        lines.push(`    Image ID:       docker.io/library/nginx@sha256:7b9201`);
        const ports = (c.ports || []).map((p) => `${p.containerPort || 80}/${p.protocol || 'TCP'}`).join(', ') || '80/TCP';
        lines.push(`    Port:           ${ports}`);
        lines.push(`    Host Port:      0/TCP`);
        const phase = status.phase || 'Running';
        const state = phase === 'Running' ? 'Running' : status.reason || 'Waiting';
        lines.push(`    State:          ${state}`);
        if (state === 'Running') {
          lines.push(`      Started:      ${meta.creationTimestamp || 'Fri, 13 Nov 2026 12:00:01 +0000'}`);
        } else if (state === 'Waiting') {
          lines.push(`      Reason:       ${status.reason || 'ContainerCreating'}`);
        }
        lines.push(`    Ready:          ${phase === 'Running' ? 'True' : 'False'}`);
        lines.push(`    Restart Count:  ${status.restartCount || status.restarts || 0}`);
        lines.push('    Limits:');
        const lim = c.resources?.limits || {};
        lines.push(`      cpu:     ${lim.cpu || '500m'}`);
        lines.push(`      memory:  ${lim.memory || '512Mi'}`);
        lines.push('    Requests:');
        const req = c.resources?.requests || {};
        lines.push(`      cpu:     ${req.cpu || '100m'}`);
        lines.push(`      memory:  ${req.memory || '128Mi'}`);
        lines.push('    Environment:    <none>');
        lines.push('    Mounts:');
        lines.push('      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access (ro)');
      }

      lines.push('Conditions:');
      lines.push('  Type              Status');
      lines.push('  Initialized       True ');
      lines.push(`  Ready             ${status.phase === 'Running' ? 'True ' : 'False'}`);
      lines.push(`  ContainersReady   ${status.phase === 'Running' ? 'True ' : 'False'}`);
      lines.push('  PodScheduled      True ');

      lines.push('Volumes:');
      lines.push('  kube-api-access:');
      lines.push('    Type:                    Projected (injected serviceaccount tokens)');
      lines.push('QoS Class:                   Burstable');
      lines.push(`Node-Selectors:              ${formatLabels(spec.nodeSelector)}`);
      lines.push('Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s');
      lines.push('                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s');
      lines.push(formatEventsSection(resource, events));
      break;
    }

    case 'Deployment': {
      lines.push(`Name:                   ${meta.name}`);
      lines.push(`Namespace:              ${meta.namespace || 'default'}`);
      lines.push(`CreationTimestamp:      ${meta.creationTimestamp || new Date().toISOString()}`);
      lines.push(`Labels:                 ${formatLabels(meta.labels)}`);
      lines.push(`Annotations:            ${formatLabels(meta.annotations)}`);
      lines.push(`Selector:               ${formatLabels(spec.selector?.matchLabels)}`);
      const desired = spec.replicas !== undefined ? spec.replicas : 1;
      const ready = status.readyReplicas !== undefined ? status.readyReplicas : desired;
      const updated = status.updatedReplicas !== undefined ? status.updatedReplicas : desired;
      const available = status.availableReplicas !== undefined ? status.availableReplicas : ready;
      const unavail = desired - available > 0 ? desired - available : 0;
      lines.push(`Replicas:               ${desired} desired | ${updated} updated | ${desired} total | ${available} available | ${unavail} unavailable`);
      lines.push(`StrategyType:           ${spec.strategy?.type || 'RollingUpdate'}`);
      lines.push(`MinReadySeconds:        ${spec.minReadySeconds || 0}`);
      lines.push('RollingUpdateStrategy:  25% max unavailable, 25% max surge');
      lines.push('Pod Template:');
      lines.push(`  Labels:       ${formatLabels(spec.template?.metadata?.labels || meta.labels)}`);
      lines.push('  Containers:');
      const containers = normalizeContainers(spec.template?.spec?.containers, meta.name || 'app');
      for (const c of containers) {
        lines.push(`   ${c.name}:`);
        lines.push(`    Image:        ${c.image || 'nginx:alpine'}`);
        lines.push('    Port:         80/TCP');
        lines.push('    Host Port:    0/TCP');
        lines.push('    Environment:  <none>');
        lines.push('    Mounts:       <none>');
      }
      lines.push('Conditions:');
      lines.push('  Type           Status  Reason');
      lines.push('  ----           ------  ------');
      lines.push('  Available      True    MinimumReplicasAvailable');
      lines.push('  Progressing    True    NewReplicaSetAvailable');
      lines.push('OldReplicaSets:         <none>');
      lines.push(`NewReplicaSet:          ${meta.name}-7d9c (${ready}/${desired} replicas created)`);
      lines.push(formatEventsSection(resource, events));
      break;
    }

    case 'Service': {
      lines.push(`Name:                     ${meta.name}`);
      lines.push(`Namespace:                ${meta.namespace || 'default'}`);
      lines.push(`Labels:                   ${formatLabels(meta.labels)}`);
      lines.push(`Annotations:              ${formatLabels(meta.annotations)}`);
      lines.push(`Selector:                 ${formatLabels(spec.selector)}`);
      lines.push(`Type:                     ${spec.type || 'ClusterIP'}`);
      lines.push(`IP Family Policy:         SingleStack`);
      lines.push(`IP Families:              IPv4`);
      lines.push(`IP:                       ${status.clusterIP || spec.clusterIP || '10.96.0.10'}`);
      lines.push(`IPs:                      ${status.clusterIP || spec.clusterIP || '10.96.0.10'}`);
      let rawPorts = spec.ports || [{ port: 80, targetPort: 80, protocol: 'TCP' }];
      if (!Array.isArray(rawPorts)) {
        rawPorts = typeof rawPorts === 'object' && rawPorts !== null ? Object.values(rawPorts) : [];
      }
      for (const p of rawPorts) {
        const pName = p.name ? `${p.name}  ` : 'http  ';
        lines.push(`Port:                     ${pName}${p.port || 80}/${p.protocol || 'TCP'}`);
        lines.push(`TargetPort:               ${p.targetPort || p.port || 80}/${p.protocol || 'TCP'}`);
        if (p.nodePort) {
          lines.push(`NodePort:                 ${pName}${p.nodePort}/${p.protocol || 'TCP'}`);
        }
      }
      const eps = status.endpoints || [];
      const epStr = Array.isArray(eps) && eps.length > 0 ? eps.join(',') : '<none>';
      lines.push(`Endpoints:                ${epStr}`);
      lines.push(`Session Affinity:         ${spec.sessionAffinity || 'None'}`);
      lines.push(formatEventsSection(resource, events));
      break;
    }

    case 'Node': {
      lines.push(`Name:               ${meta.name}`);
      const labels = meta.labels || {};
      const role = 'node-role.kubernetes.io/control-plane' in labels ? 'control-plane' : 'worker';
      lines.push(`Roles:              ${role}`);
      lines.push(`Labels:             ${formatLabelsMultiline(meta.labels)}`);
      lines.push(`Annotations:        ${formatLabelsMultiline(meta.annotations)}`);
      lines.push(`CreationTimestamp:  ${meta.creationTimestamp || 'Fri, 13 Nov 2026 10:00:00 +0000'}`);
      lines.push('Taints:             <none>');
      lines.push('Conditions:');
      lines.push('  Type                 Status  LastHeartbeatTime  LastTransitionTime  Reason                       Message');
      lines.push('  ----                 ------  -----------------  ------------------  ------                       -------');
      lines.push('  MemoryPressure       False   2m                 2m                  KubeletHasSufficientMemory   kubelet has sufficient memory available');
      lines.push('  DiskPressure         False   2m                 2m                  KubeletHasNoDiskPressure     kubelet has no disk pressure');
      lines.push('  PIDPressure          False   2m                 2m                  KubeletHasSufficientPID      kubelet has sufficient PID available');
      lines.push('  Ready                True    2m                 2m                  KubeletReady                 kubelet is posting ready status');
      lines.push('Addresses:');
      lines.push(`  InternalIP:  ${status.internalIP || '192.168.1.10'}`);
      lines.push(`  Hostname:    ${meta.name}`);
      lines.push('Capacity:');
      lines.push('  cpu:                4');
      lines.push('  ephemeral-storage:  100Gi');
      lines.push('  hugepages-2Mi:      0');
      lines.push('  memory:             16Gi');
      lines.push('  pods:               110');
      lines.push('Allocatable:');
      lines.push('  cpu:                4');
      lines.push('  ephemeral-storage:  90Gi');
      lines.push('  hugepages-2Mi:      0');
      lines.push('  memory:             15.5Gi');
      lines.push('  pods:               110');
      lines.push('System Info:');
      lines.push('  Machine ID:                 f7a8b9c0d1e2');
      lines.push(`  Kernel Version:             ${status.nodeInfo?.kernelVersion || '6.8.0-45-generic'}`);
      lines.push(`  OS Image:                   ${status.nodeInfo?.osImage || 'Ubuntu 24.04 LTS'}`);
      lines.push('  Operating System:           linux');
      lines.push('  Architecture:               amd64');
      lines.push(`  Container Runtime Version:  ${status.nodeInfo?.containerRuntimeVersion || 'containerd://1.7.13'}`);
      lines.push(`  Kubelet Version:            ${status.kubeletVersion || 'v1.32.0'}`);
      lines.push('Non-terminated Pods:         (0 pods)');
      lines.push(formatEventsSection(resource, events));
      break;
    }

    default: {
      lines.push(`Name:         ${meta.name}`);
      lines.push(`Namespace:    ${meta.namespace || '<cluster-scoped>'}`);
      lines.push(`Kind:         ${resource.kind || kind}`);
      lines.push(`Labels:       ${formatLabels(meta.labels)}`);
      lines.push(`Annotations:  ${formatLabels(meta.annotations)}`);
      if (spec && Object.keys(spec).length > 0) {
        lines.push('Spec:');
        lines.push('  ' + JSON.stringify(spec, null, 2).replace(/\n/g, '\n  '));
      }
      if (status && Object.keys(status).length > 0) {
        lines.push('Status:');
        lines.push('  ' + JSON.stringify(status, null, 2).replace(/\n/g, '\n  '));
      }
      lines.push(formatEventsSection(resource, events));
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Formats describe output for multiple resources
 * @param {Array<Object>} resources
 * @param {Array<Object>} events
 * @param {Object} options
 * @returns {string}
 */
function formatDescribeList(resources = [], events = [], options = {}) {
  if (!resources || resources.length === 0) return '';
  return resources.map((r) => formatDescribe(r, events, options)).join('\n\n---\n\n');
}

module.exports = {
  KIND_ALIASES,
  CLUSTER_SCOPED_KINDS,
  normalizeKind,
  calculateAge,
  matchesSelector,
  formatTable,
  formatLabels,
  formatResourceTable,
  formatYaml,
  formatJson,
  formatJsonPath,
  formatDescribe,
  formatDescribeList
};
