'use strict';

/**
 * KubeLabs v4.0 Authentic CLI Output Formatting Engine
 * Subphase 1.1.1: Dynamic Column-Padding ASCII Table & Wide Output Renderer
 *
 * Provides real kubectl get tabular rendering across 19 Kubernetes resource kinds
 * with dynamic width calculation, -A / --all-namespaces, -o wide, --show-labels,
 * and label selector filtering (-l).
 */

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
        const containers = spec.containers || [];
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
          const containers = spec.template?.spec?.containers || [];
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
          const containers = spec.template?.spec?.containers || [];
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
          const containers = spec.template?.spec?.containers || [];
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

module.exports = {
  KIND_ALIASES,
  CLUSTER_SCOPED_KINDS,
  normalizeKind,
  calculateAge,
  matchesSelector,
  formatTable,
  formatLabels,
  formatResourceTable
};
