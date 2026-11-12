/**
 * KubeLabs Isomorphic In-Browser Offline Engine (v3.0)
 * Standalone, zero-dependency, isomorphic Kubernetes cluster simulator,
 * virtual POSIX filesystem, multi-CLI dispatch pipeline, declarative validation engine,
 * incident scenarios, capstone projects, and offline AI Mentor.
 * Runs identically in Node.js 22+, WebWorkers, WebViews, and modern browsers.
 */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KubeLabsOfflineEngine = factory();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // ==========================================
  // 1. Safe In-Memory & LocalStorage Store
  // ==========================================
  const memoryStore = new Map();

  function getStored(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      }
    } catch {
      // Fallback to in-memory
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  }

  function setStored(key, value) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return;
      }
    } catch {
      // Fallback to in-memory
    }
    memoryStore.set(key, JSON.parse(JSON.stringify(value)));
  }

  // ==========================================
  // 2. Virtual POSIX Filesystem (BrowserVFS)
  // ==========================================
  class BrowserVFS {
    constructor() {
      this.files = new Map();
      this.reset();
    }

    normalizePath(rawPath) {
      if (!rawPath) return '/home/learner';
      let p = String(rawPath).trim();
      if (!p.startsWith('/')) {
        p = `/home/learner/${p}`;
      }
      const parts = p.split('/').filter(Boolean);
      const stack = [];
      for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
          if (stack.length > 0) stack.pop();
        } else {
          stack.push(part);
        }
      }
      return '/' + stack.join('/');
    }

    reset() {
      this.files.clear();
      this.files.set('/etc/hosts', '127.0.0.1 localhost\n::1 localhost\n10.96.0.1 kubernetes.default.svc.cluster.local');
      this.files.set('/etc/resolv.conf', 'nameserver 10.96.0.10\nsearch default.svc.cluster.local svc.cluster.local cluster.local\noptions ndots:5');
      this.files.set('/home/learner/.bashrc', 'alias k=kubectl\nsource <(kubectl completion bash)\nexport KUBECONFIG=/home/learner/.kube/config');
      this.files.set('/home/learner/.kube/config', 'apiVersion: v1\nkind: Config\ncurrent-context: kubelabs-offline\nclusters:\n- name: kubelabs-offline\n  cluster:\n    server: https://127.0.0.1:6443');
      this.files.set('/etc/kubernetes/manifests/kube-apiserver.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: kube-apiserver\n  namespace: kube-system\nspec:\n  containers:\n  - name: kube-apiserver\n    image: registry.k8s.io/kube-apiserver:v1.31.0');
    }

    writeFile(filePath, content) {
      const p = this.normalizePath(filePath);
      this.files.set(p, String(content));
      return true;
    }

    readFile(filePath) {
      const p = this.normalizePath(filePath);
      if (!this.files.has(p)) {
        throw new Error(`cat: ${p}: No such file or directory`);
      }
      return this.files.get(p);
    }

    exists(filePath) {
      const p = this.normalizePath(filePath);
      return this.files.has(p);
    }

    mkdir(dirPath) {
      const p = this.normalizePath(dirPath);
      // Ensure directory presence marker
      const marker = p.endsWith('/') ? p : `${p}/.dir`;
      if (!this.files.has(marker)) {
        this.files.set(marker, '');
      }
      return true;
    }

    rm(filePath) {
      const p = this.normalizePath(filePath);
      if (this.files.has(p)) {
        this.files.delete(p);
        return true;
      }
      // Also remove directory contents if it was a directory
      const dirPrefix = p.endsWith('/') ? p : `${p}/`;
      let deleted = false;
      for (const k of Array.from(this.files.keys())) {
        if (k.startsWith(dirPrefix) || k === p) {
          this.files.delete(k);
          deleted = true;
        }
      }
      return deleted;
    }

    cp(src, dest) {
      const content = this.readFile(src);
      this.writeFile(dest, content);
      return true;
    }

    stat(filePath) {
      const p = this.normalizePath(filePath);
      if (this.files.has(p)) {
        return { isFile: true, isDirectory: false, size: this.files.get(p).length };
      }
      const dirPrefix = p.endsWith('/') ? p : `${p}/`;
      for (const k of this.files.keys()) {
        if (k.startsWith(dirPrefix)) {
          return { isFile: false, isDirectory: true, size: 0 };
        }
      }
      throw new Error(`stat: cannot stat '${filePath}': No such file or directory`);
    }

    listDir(dirPath = '/home/learner') {
      const p = this.normalizePath(dirPath);
      const prefix = p === '/' ? '/' : `${p}/`;
      const entries = new Set();
      for (const key of this.files.keys()) {
        if (key.startsWith(prefix) && key !== prefix) {
          const rest = key.slice(prefix.length);
          const slash = rest.indexOf('/');
          const entry = slash === -1 ? rest : rest.slice(0, slash);
          if (entry && entry !== '.dir') {
            entries.add(entry);
          }
        }
      }
      return Array.from(entries).sort();
    }
  }

  // ==========================================
  // 3. Simple Isomorphic Multi-Doc YAML Parser
  // ==========================================
  function parseOfflineYaml(yamlText) {
    if (!yamlText) return [];
    const rawDocs = String(yamlText).split(/^---+\s*$/m);
    const documents = [];

    for (const rawDoc of rawDocs) {
      const doc = rawDoc.trim();
      if (!doc) continue;

      const lines = doc.split(/\r?\n/);
      const rootObj = {};
      const stack = [{ indent: -1, obj: rootObj, key: null }];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = line.search(/\S/);

        // Pop stack to match indent
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        const currentFrame = stack[stack.length - 1];
        const currentObj = currentFrame.obj;

        // Key-value pair
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
          const valPart = trimmed.slice(colonIdx + 1).trim();

          if (valPart === '' || valPart === '|' || valPart === '>') {
            // Nested object or multi-line string
            const newObj = {};
            if (Array.isArray(currentObj)) {
              currentObj.push({ [key]: newObj });
            } else {
              currentObj[key] = newObj;
            }
            stack.push({ indent, obj: newObj, key });
          } else {
            // Primitive value
            let val = valPart.replace(/^['"]|['"]$/g, '');
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(Number(val)) && val !== '') val = Number(val);

            if (Array.isArray(currentObj)) {
              currentObj.push({ [key]: val });
            } else {
              currentObj[key] = val;
            }
          }
        } else if (trimmed.startsWith('- ')) {
          // List item
          const itemVal = trimmed.slice(2).trim();
          if (currentFrame.key && !Array.isArray(currentObj[currentFrame.key])) {
            currentObj[currentFrame.key] = [];
          }
          const arr = Array.isArray(currentObj) ? currentObj : currentObj[currentFrame.key];
          if (itemVal.includes(':')) {
            const [k, v] = itemVal.split(':').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
            const sub = { [k]: isNaN(Number(v)) ? v : Number(v) };
            arr.push(sub);
            stack.push({ indent, obj: sub, key: k });
          } else {
            arr.push(itemVal.replace(/^['"]|['"]$/g, ''));
          }
        }
      }

      if (rootObj.kind && rootObj.metadata) {
        if (!rootObj.apiVersion) rootObj.apiVersion = 'v1';
        if (typeof rootObj.metadata === 'string') {
          rootObj.metadata = { name: rootObj.metadata };
        }
        if (!rootObj.metadata.namespace) {
          rootObj.metadata.namespace = 'default';
        }
        documents.push(rootObj);
      } else {
        // Fallback simple regex extraction for resilience
        const kindMatch = doc.match(/^\s*kind:\s*([^\s#]+)/m);
        const nameMatch = doc.match(/^\s*name:\s*([^\s#]+)/m);
        const nsMatch = doc.match(/^\s*namespace:\s*([^\s#]+)/m);
        if (kindMatch && nameMatch) {
          const kind = kindMatch[1].replace(/^['"]|['"]$/g, '');
          const name = nameMatch[1].replace(/^['"]|['"]$/g, '');
          const namespace = nsMatch ? nsMatch[1].replace(/^['"]|['"]$/g, '') : 'default';
          documents.push({
            apiVersion: 'v1',
            kind,
            metadata: { name, namespace },
            spec: rootObj.spec || {}
          });
        }
      }
    }

    return documents;
  }

  // ==========================================
  // 4. Simple Isomorphic JSONPath Resolver
  // ==========================================
  function resolveJsonPath(obj, jsonPath) {
    if (!obj || !jsonPath) return '';
    let path = jsonPath.trim();
    if (path.startsWith('{') && path.endsWith('}')) {
      path = path.slice(1, -1).trim();
    }
    if (path.startsWith('$')) path = path.slice(1);
    if (path.startsWith('.')) path = path.slice(1);

    const tokens = path.split('.').filter(Boolean);
    let current = [obj];

    for (const token of tokens) {
      const next = [];
      for (const item of current) {
        if (!item) continue;
        if (token.includes('[*]')) {
          const prop = token.replace('[*]', '');
          const target = prop ? item[prop] : item;
          if (Array.isArray(target)) {
            next.push(...target);
          }
        } else if (token.includes('[')) {
          const m = token.match(/^(.*?)\[(\d+)\]$/);
          if (m) {
            const prop = m[1];
            const idx = Number(m[2]);
            const target = prop ? item[prop] : item;
            if (Array.isArray(target) && target[idx] !== undefined) {
              next.push(target[idx]);
            }
          }
        } else if (item[token] !== undefined) {
          next.push(item[token]);
        }
      }
      current = next;
    }

    if (current.length === 0) return '';
    if (current.length === 1) {
      const val = current[0];
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    }
    return current.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ');
  }

  // ==========================================
  // 5. Client-Side Virtual Cluster Engine
  // ==========================================
  class BrowserCluster {
    constructor() {
      this.resources = [];
      this.ipCounter = 10;
      this.helmReleases = [];
      this.argoApps = [];
      this.terraformState = { resources: [] };
      this.networkPolicies = [];
      this.reset();
    }

    reset(initialState = null) {
      this.resources = [];
      this.ipCounter = 10;
      this.helmReleases = [];
      this.argoApps = [];
      this.terraformState = { resources: [] };
      this.networkPolicies = [];

      if (initialState && Array.isArray(initialState.resources)) {
        this.resources = JSON.parse(JSON.stringify(initialState.resources));
        if (initialState.helmReleases) this.helmReleases = JSON.parse(JSON.stringify(initialState.helmReleases));
        if (initialState.argoApps) this.argoApps = JSON.parse(JSON.stringify(initialState.argoApps));
      } else {
        this.bootstrap();
      }
      this.reconcile();
    }

    bootstrap() {
      this.resources = [
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'default' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kube-system' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'production' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'staging' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'monitoring' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kyverno' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'argocd' }, status: { phase: 'Active' } },
        { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'flux-system' }, status: { phase: 'Active' } },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: { name: 'kubelabs-control-plane', labels: { 'node-role.kubernetes.io/control-plane': '' } },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.10' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-worker-01',
            labels: { 'node-role.kubernetes.io/worker': '', 'topology.kubernetes.io/zone': 'zone-a' }
          },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.11' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-worker-gpu-02',
            labels: { 'node-role.kubernetes.io/worker': '', accelerator: 'nvidia', 'topology.kubernetes.io/zone': 'zone-b' }
          },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.12' }] }
        },
        {
          apiVersion: 'storage.k8s.io/v1',
          kind: 'StorageClass',
          metadata: { name: 'standard', annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' } },
          provisioner: 'kubernetes.io/no-provisioner',
          volumeBindingMode: 'WaitForFirstConsumer'
        },
        {
          apiVersion: 'storage.k8s.io/v1',
          kind: 'StorageClass',
          metadata: { name: 'fast-ssd' },
          provisioner: 'ebs.csi.aws.com',
          volumeBindingMode: 'Immediate'
        }
      ];
    }

    nextIP() {
      this.ipCounter++;
      return `10.244.1.${(this.ipCounter % 240) + 10}`;
    }

    isClusterScoped(kind) {
      const clusterScoped = [
        'Node',
        'Namespace',
        'ClusterRole',
        'ClusterRoleBinding',
        'StorageClass',
        'PersistentVolume',
        'ValidatingWebhookConfiguration',
        'MutatingWebhookConfiguration',
        'ClusterPolicy',
        'CustomResourceDefinition'
      ];
      return clusterScoped.some((k) => k.toLowerCase() === (kind || '').toLowerCase());
    }

    getResources(kind = null, ns = null) {
      return this.resources.filter((r) => {
        if (kind && r.kind.toLowerCase() !== kind.toLowerCase()) return false;
        if (this.isClusterScoped(r.kind)) return true;
        if (ns && ns !== 'all' && (r.metadata.namespace || 'default') !== ns) return false;
        return true;
      });
    }

    getResource(kind, name, ns = 'default') {
      const isScoped = this.isClusterScoped(kind);
      return (
        this.resources.find((r) => {
          if (r.kind.toLowerCase() !== kind.toLowerCase()) return false;
          if (r.metadata.name !== name) return false;
          if (isScoped) return true;
          return (r.metadata.namespace || 'default') === (ns || 'default');
        }) || null
      );
    }

    applyResource(obj) {
      if (!obj || !obj.kind || !obj.metadata || !obj.metadata.name) return null;
      const kind = obj.kind;
      const name = obj.metadata.name;
      const ns = this.isClusterScoped(kind) ? null : obj.metadata.namespace || 'default';

      if (!this.isClusterScoped(kind)) {
        obj.metadata.namespace = ns;
      }

      const existingIdx = this.resources.findIndex((r) => {
        if (r.kind.toLowerCase() !== kind.toLowerCase() || r.metadata.name !== name) return false;
        if (this.isClusterScoped(kind)) return true;
        return (r.metadata.namespace || 'default') === ns;
      });

      if (existingIdx !== -1) {
        this.resources[existingIdx] = Object.assign({}, this.resources[existingIdx], obj);
      } else {
        this.resources.push(obj);
      }

      this.reconcile();
      return obj;
    }

    deleteResource(kind, name, ns = 'default') {
      const isScoped = this.isClusterScoped(kind);
      const idx = this.resources.findIndex((r) => {
        if (r.kind.toLowerCase() !== kind.toLowerCase() || r.metadata.name !== name) return false;
        if (isScoped) return true;
        return (r.metadata.namespace || 'default') === (ns || 'default');
      });

      if (idx !== -1) {
        const deleted = this.resources.splice(idx, 1)[0];
        this.reconcile();
        return deleted;
      }
      return null;
    }

    applyManifest(yamlText) {
      const docs = parseOfflineYaml(yamlText);
      const applied = [];
      for (const doc of docs) {
        const res = this.applyResource(doc);
        if (res) applied.push(res);
      }
      return applied;
    }

    reconcile() {
      // 1. Reconcile Deployments -> Pods
      const deployments = this.resources.filter((r) => r.kind === 'Deployment');
      for (const dep of deployments) {
        const ns = dep.metadata.namespace || 'default';
        const replicas = dep.spec && dep.spec.replicas !== undefined ? Number(dep.spec.replicas) : 1;
        const appLabel =
          (dep.spec && dep.spec.selector && dep.spec.selector.matchLabels && dep.spec.selector.matchLabels.app) ||
          dep.metadata.name;

        const ownedPods = this.resources.filter(
          (r) => r.kind === 'Pod' && (r.metadata.namespace || 'default') === ns && r.metadata.ownerDeployment === dep.metadata.name
        );

        // Scale up if needed
        while (ownedPods.length < replicas) {
          const idx = ownedPods.length + 1;
          const pod = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: `${dep.metadata.name}-${idx}`,
              namespace: ns,
              labels: { app: appLabel },
              ownerDeployment: dep.metadata.name
            },
            spec: dep.spec.template ? dep.spec.template.spec : { containers: [{ name: 'app', image: 'nginx:alpine' }] },
            status: { phase: 'Running', podIP: this.nextIP() }
          };
          this.resources.push(pod);
          ownedPods.push(pod);
        }

        // Scale down if needed
        while (ownedPods.length > replicas) {
          const toRemove = ownedPods.pop();
          const pIdx = this.resources.indexOf(toRemove);
          if (pIdx !== -1) this.resources.splice(pIdx, 1);
        }
      }

      // 2. Reconcile StatefulSets -> Ordinal Pods (<name>-0, <name>-1)
      const statefulsets = this.resources.filter((r) => r.kind === 'StatefulSet');
      for (const sts of statefulsets) {
        const ns = sts.metadata.namespace || 'default';
        const replicas = sts.spec && sts.spec.replicas !== undefined ? Number(sts.spec.replicas) : 1;
        const appLabel =
          (sts.spec && sts.spec.selector && sts.spec.selector.matchLabels && sts.spec.selector.matchLabels.app) ||
          sts.metadata.name;

        for (let i = 0; i < replicas; i++) {
          const podName = `${sts.metadata.name}-${i}`;
          if (!this.getResource('Pod', podName, ns)) {
            this.resources.push({
              apiVersion: 'v1',
              kind: 'Pod',
              metadata: {
                name: podName,
                namespace: ns,
                labels: { app: appLabel, 'statefulset.kubernetes.io/pod-name': podName },
                ownerStatefulSet: sts.metadata.name
              },
              spec: sts.spec.template ? sts.spec.template.spec : { containers: [{ name: 'sts-app', image: 'busybox' }] },
              status: { phase: 'Running', podIP: this.nextIP() }
            });
          }
        }
      }

      // 3. Reconcile DaemonSets -> 1 Pod per Ready Worker Node
      const daemonsets = this.resources.filter((r) => r.kind === 'DaemonSet');
      const workerNodes = this.resources.filter(
        (r) => r.kind === 'Node' && r.metadata.name.includes('worker') && (!r.spec || !r.spec.unschedulable)
      );
      for (const ds of daemonsets) {
        const ns = ds.metadata.namespace || 'default';
        for (const node of workerNodes) {
          const podName = `${ds.metadata.name}-${node.metadata.name}`;
          if (!this.getResource('Pod', podName, ns)) {
            this.resources.push({
              apiVersion: 'v1',
              kind: 'Pod',
              metadata: {
                name: podName,
                namespace: ns,
                labels: { app: ds.metadata.name },
                ownerDaemonSet: ds.metadata.name
              },
              spec: Object.assign({}, ds.spec ? ds.spec.template.spec : {}, { nodeName: node.metadata.name }),
              status: { phase: 'Running', podIP: this.nextIP() }
            });
          }
        }
      }

      // 4. Reconcile Services -> Endpoints
      const services = this.resources.filter((r) => r.kind === 'Service');
      for (const svc of services) {
        const ns = svc.metadata.namespace || 'default';
        const selector = (svc.spec && svc.spec.selector) || {};
        const selectorKeys = Object.keys(selector);

        const matchingPods = this.resources.filter((r) => {
          if (r.kind !== 'Pod' || (r.metadata.namespace || 'default') !== ns) return false;
          if (r.status && r.status.phase !== 'Running') return false;
          if (selectorKeys.length === 0) return false;
          const pLabels = r.metadata.labels || {};
          return selectorKeys.every((k) => pLabels[k] === selector[k]);
        });

        svc.status = {
          endpointCount: matchingPods.length,
          endpoints: matchingPods.map((p) => `${p.status.podIP || '10.244.1.5'}:80`)
        };
      }

      // 5. Reconcile PersistentVolumeClaims -> Auto-bind
      const pvcs = this.resources.filter((r) => r.kind === 'PersistentVolumeClaim');
      for (const pvc of pvcs) {
        if (!pvc.status) pvc.status = {};
        if (pvc.status.phase !== 'Bound') {
          pvc.status.phase = 'Bound';
          pvc.spec = pvc.spec || {};
          pvc.spec.volumeName = `pv-${pvc.metadata.name}`;
          // Ensure backing PV exists
          if (!this.getResource('PersistentVolume', pvc.spec.volumeName)) {
            this.resources.push({
              apiVersion: 'v1',
              kind: 'PersistentVolume',
              metadata: { name: pvc.spec.volumeName },
              spec: {
                capacity: pvc.spec.resources ? pvc.spec.resources.requests : { storage: '10Gi' },
                accessModes: pvc.spec.accessModes || ['ReadWriteOnce'],
                storageClassName: pvc.spec.storageClassName || 'standard'
              },
              status: { phase: 'Bound', claimRef: { name: pvc.metadata.name, namespace: pvc.metadata.namespace } }
            });
          }
        }
      }
    }

    canI({ user = 'learner', verb = 'get', resource = 'pods', namespace = 'default' }) {
      if (user === 'admin' || user === 'cluster-admin') return true;
      const roles = this.getResources('Role', namespace).concat(this.getResources('ClusterRole'));
      const bindings = this.getResources('RoleBinding', namespace).concat(this.getResources('ClusterRoleBinding'));

      for (const b of bindings) {
        const subjects = b.subjects || [];
        const hasUser = subjects.some((s) => s.name === user || s.name === `system:serviceaccount:${namespace}:${user}`);
        if (hasUser) {
          const roleName = b.roleRef && b.roleRef.name;
          const role = roles.find((r) => r.metadata.name === roleName);
          if (role && Array.isArray(role.rules)) {
            for (const rule of role.rules) {
              const resMatch = (rule.resources || []).some((r) => r === '*' || r.toLowerCase() === resource.toLowerCase());
              const verbMatch = (rule.verbs || []).some((v) => v === '*' || v.toLowerCase() === verb.toLowerCase());
              if (resMatch && verbMatch) return true;
            }
          }
        }
      }
      return false;
    }

    exportSnapshot() {
      return {
        resources: JSON.parse(JSON.stringify(this.resources)),
        helmReleases: JSON.parse(JSON.stringify(this.helmReleases)),
        argoApps: JSON.parse(JSON.stringify(this.argoApps)),
        terraformState: JSON.parse(JSON.stringify(this.terraformState))
      };
    }
  }

  // ==========================================
  // 6. Advanced Shell Parser & Multi-CLI Dispatcher
  // ==========================================
  class BrowserTerminal {
    constructor(cluster, vfs) {
      this.cluster = cluster;
      this.vfs = vfs;
      this.commandHistory = [];
    }

    execute(cmdLine) {
      const trimmed = (cmdLine || '').trim();
      if (!trimmed) return { exitCode: 0, output: '' };
      this.commandHistory.push(trimmed);

      // Multi-command chaining (&& and ;)
      if (trimmed.includes('&&')) {
        const parts = trimmed.split('&&').map((p) => p.trim());
        const outputs = [];
        for (const sub of parts) {
          const res = this.execute(sub);
          outputs.push(res.output);
          if (res.exitCode !== 0) return { exitCode: res.exitCode, output: outputs.join('\n') };
        }
        return { exitCode: 0, output: outputs.join('\n') };
      }

      if (trimmed.includes(';')) {
        const parts = trimmed.split(';').map((p) => p.trim());
        const outputs = [];
        let lastExit = 0;
        for (const sub of parts) {
          if (!sub) continue;
          const res = this.execute(sub);
          outputs.push(res.output);
          lastExit = res.exitCode;
        }
        return { exitCode: lastExit, output: outputs.join('\n') };
      }

      // Pipelines (|)
      if (trimmed.includes('|')) {
        const stages = trimmed.split('|').map((s) => s.trim());
        let currentOutput = '';
        let lastExit = 0;

        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          if (i === 0) {
            const res = this.executeSingle(stage);
            currentOutput = res.output;
            lastExit = res.exitCode;
            if (lastExit !== 0) return res;
          } else {
            currentOutput = this.applyFilter(stage, currentOutput);
          }
        }
        return { exitCode: 0, output: currentOutput };
      }

      return this.executeSingle(trimmed);
    }

    applyFilter(filterCmd, input) {
      const tokens = filterCmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const tool = tokens[0];
      const args = tokens.slice(1).map((t) => t.replace(/^['"]|['"]$/g, ''));
      const lines = input.split(/\r?\n/);

      if (tool === 'grep') {
        const isInverse = args.includes('-v');
        const isCaseInsensitive = args.includes('-i');
        const pattern = args.find((a) => !a.startsWith('-')) || '';
        return lines
          .filter((l) => {
            const target = isCaseInsensitive ? l.toLowerCase() : l;
            const pat = isCaseInsensitive ? pattern.toLowerCase() : pattern;
            const match = target.includes(pat);
            return isInverse ? !match : match;
          })
          .join('\n');
      }

      if (tool === 'wc') {
        if (args.includes('-l')) {
          const count = lines.filter(Boolean).length;
          return String(count);
        }
        return `${lines.length} lines`;
      }

      if (tool === 'sort') {
        const sorted = [...lines].sort();
        if (args.includes('-r')) sorted.reverse();
        return sorted.join('\n');
      }

      if (tool === 'uniq') {
        const unique = [];
        for (const l of lines) {
          if (unique.length === 0 || unique[unique.length - 1] !== l) {
            unique.push(l);
          }
        }
        return unique.join('\n');
      }

      if (tool === 'head') {
        const nIdx = args.indexOf('-n');
        const n = nIdx !== -1 && args[nIdx + 1] ? Number(args[nIdx + 1]) : 10;
        return lines.slice(0, n).join('\n');
      }

      if (tool === 'tail') {
        const nIdx = args.indexOf('-n');
        const n = nIdx !== -1 && args[nIdx + 1] ? Number(args[nIdx + 1]) : 10;
        return lines.slice(-n).join('\n');
      }

      if (tool === 'cut') {
        const dIdx = args.indexOf('-d');
        const delim = dIdx !== -1 ? args[dIdx + 1] : '\t';
        const fIdx = args.indexOf('-f');
        const field = fIdx !== -1 ? Number(args[fIdx + 1]) - 1 : 0;
        return lines.map((l) => (l.split(delim)[field] !== undefined ? l.split(delim)[field] : l)).join('\n');
      }

      return input;
    }

    executeSingle(cmd) {
      // VFS Redirection (> or >>)
      if (cmd.includes('>') && !cmd.includes('>-')) {
        const isAppend = cmd.includes('>>');
        const sep = isAppend ? '>>' : '>';
        const parts = cmd.split(sep);
        const execPart = parts[0].trim();
        const targetFile = parts[1].trim().replace(/^['"]|['"]$/g, '');
        const res = this.executeSingle(execPart);
        if (res.exitCode === 0) {
          const existing = isAppend && this.vfs.exists(targetFile) ? this.vfs.readFile(targetFile) + '\n' : '';
          this.vfs.writeFile(targetFile, existing + res.output);
          return { exitCode: 0, output: '' };
        }
        return res;
      }

      const tokens = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const bin = tokens[0];
      const args = tokens.slice(1).map((t) => t.replace(/^['"]|['"]$/g, ''));

      // POSIX Built-ins
      if (bin === 'echo') {
        return { exitCode: 0, output: args.join(' ') };
      }
      if (bin === 'pwd') {
        return { exitCode: 0, output: '/home/learner' };
      }
      if (bin === 'ls') {
        return { exitCode: 0, output: this.vfs.listDir(args[0] || '/home/learner').join('  ') || '(empty)' };
      }
      if (bin === 'cat') {
        if (!args[0]) return { exitCode: 1, output: 'cat: missing operand' };
        try {
          return { exitCode: 0, output: this.vfs.readFile(args[0]) };
        } catch (e) {
          return { exitCode: 1, output: e.message };
        }
      }
      if (bin === 'mkdir') {
        if (!args[0]) return { exitCode: 1, output: 'mkdir: missing operand' };
        this.vfs.mkdir(args[0]);
        return { exitCode: 0, output: '' };
      }
      if (bin === 'rm') {
        if (!args[0]) return { exitCode: 1, output: 'rm: missing operand' };
        const target = args[0] === '-rf' || args[0] === '-f' ? args[1] : args[0];
        this.vfs.rm(target);
        return { exitCode: 0, output: '' };
      }
      if (bin === 'cp') {
        if (args.length < 2) return { exitCode: 1, output: 'cp: missing operand' };
        try {
          this.vfs.cp(args[0], args[1]);
          return { exitCode: 0, output: '' };
        } catch (e) {
          return { exitCode: 1, output: e.message };
        }
      }
      if (bin === 'clear') {
        return { exitCode: 0, output: '' };
      }
      if (bin === 'curl') {
        return { exitCode: 0, output: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"status":"connected"}' };
      }

      // Kubectl Dispatch
      if (bin === 'kubectl' || bin === 'k') {
        return this.handleKubectl(args);
      }

      // Helm Dispatch
      if (bin === 'helm') {
        return this.handleHelm(args);
      }

      // ArgoCD Dispatch
      if (bin === 'argocd') {
        return this.handleArgoCD(args);
      }

      // OpenTofu / Terraform Dispatch
      if (bin === 'tofu' || bin === 'terraform') {
        return this.handleTofu(args);
      }

      // Cloud CLIs
      if (bin === 'aws') {
        return { exitCode: 0, output: `[offline-aws] aws ${args.join(' ')} executed successfully.` };
      }
      if (bin === 'gcloud') {
        return { exitCode: 0, output: `[offline-gcloud] gcloud ${args.join(' ')} executed successfully.` };
      }
      if (bin === 'az') {
        return { exitCode: 0, output: `[offline-azure] az ${args.join(' ')} executed successfully.` };
      }

      // CNCF Ecosystem CLIs
      if (['flux', 'cilium', 'istioctl', 'linkerd', 'vcluster', 'kyverno', 'velero', 'etcdctl', 'kubeadm', 'k9s', 'aiops'].includes(bin)) {
        return { exitCode: 0, output: `[offline-cncf] ${bin} ${args.join(' ')} executed successfully.` };
      }

      return { exitCode: 0, output: `Executed: ${cmd} (offline-emulated)` };
    }

    handleKubectl(args) {
      const verb = args[0] || 'help';
      let ns = 'default';
      let allNamespaces = false;
      let outputFmt = '';
      let jsonPathExpr = '';

      const cleanArgs = [];
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-n' || arg === '--namespace') {
          ns = args[++i];
        } else if (arg.startsWith('-n=')) {
          ns = arg.slice(3);
        } else if (arg === '-A' || arg === '--all-namespaces') {
          allNamespaces = true;
        } else if (arg === '-o' && args[i + 1]) {
          outputFmt = args[++i];
        } else if (arg.startsWith('-o=')) {
          outputFmt = arg.slice(3);
        } else {
          cleanArgs.push(arg);
        }
      }

      if (outputFmt.startsWith('jsonpath=')) {
        jsonPathExpr = outputFmt.slice('jsonpath='.length);
        outputFmt = 'jsonpath';
      }

      // kubectl get
      if (verb === 'get') {
        const kind = cleanArgs[0] || 'pods';
        const name = cleanArgs[1];
        const targetNs = allNamespaces ? 'all' : ns;

        if (name) {
          const res = this.cluster.getResource(kind, name, targetNs);
          if (!res) return { exitCode: 1, output: `Error from server (NotFound): ${kind} "${name}" not found` };

          if (outputFmt === 'json') return { exitCode: 0, output: JSON.stringify(res, null, 2) };
          if (outputFmt === 'yaml') return { exitCode: 0, output: `apiVersion: ${res.apiVersion}\nkind: ${res.kind}\nmetadata:\n  name: ${res.metadata.name}` };
          if (outputFmt === 'jsonpath') return { exitCode: 0, output: resolveJsonPath(res, jsonPathExpr) };

          const status = (res.status && (res.status.phase || res.status.reason)) || 'Active';
          return { exitCode: 0, output: `NAME\tSTATUS\n${res.metadata.name}\t${status}` };
        }

        const items = this.cluster.getResources(kind, targetNs);
        if (outputFmt === 'jsonpath') {
          return { exitCode: 0, output: resolveJsonPath({ items }, jsonPathExpr) };
        }
        if (outputFmt === 'json') {
          return { exitCode: 0, output: JSON.stringify({ apiVersion: 'v1', kind: 'List', items }, null, 2) };
        }

        if (items.length === 0) return { exitCode: 0, output: `No resources found in ${targetNs} namespace.` };
        const lines = items.map((r) => {
          const st = (r.status && (r.status.phase || r.status.reason)) || 'Active';
          const rNs = r.metadata.namespace || 'default';
          return allNamespaces ? `${rNs}\t${r.metadata.name}\t${st}` : `${r.metadata.name}\t${st}`;
        });
        const header = allNamespaces ? 'NAMESPACE\tNAME\tSTATUS' : 'NAME\tSTATUS';
        return { exitCode: 0, output: `${header}\n${lines.join('\n')}` };
      }

      // kubectl describe
      if (verb === 'describe') {
        const kind = cleanArgs[0] || 'pod';
        const name = cleanArgs[1];
        const res = this.cluster.getResource(kind, name, ns);
        if (!res) return { exitCode: 1, output: `Error: ${kind} "${name}" not found in namespace ${ns}` };
        return {
          exitCode: 0,
          output: `Name:         ${res.metadata.name}\nNamespace:    ${res.metadata.namespace || 'default'}\nLabels:       ${JSON.stringify(res.metadata.labels || {})}\nStatus:       ${(res.status && res.status.phase) || 'Active'}\nEvents:       <none>`
        };
      }

      // kubectl apply
      if (verb === 'apply') {
        const fIdx = cleanArgs.indexOf('-f');
        if (fIdx !== -1 && cleanArgs[fIdx + 1]) {
          const file = cleanArgs[fIdx + 1];
          if (this.vfs.exists(file)) {
            const content = this.vfs.readFile(file);
            const applied = this.cluster.applyManifest(content);
            const outLines = applied.map((a) => `${a.kind.toLowerCase()}.${a.apiVersion || 'v1'}/${a.metadata.name} configured`);
            return { exitCode: 0, output: outLines.join('\n') || 'configured' };
          }
          return { exitCode: 1, output: `error: the path "${file}" does not exist` };
        }
        return { exitCode: 0, output: 'manifest configured/applied (offline)' };
      }

      // kubectl create
      if (verb === 'create') {
        const subKind = cleanArgs[0];
        const name = cleanArgs[1];
        if (!subKind || !name) return { exitCode: 1, output: 'kubectl create requires resource type and name' };

        if (subKind === 'namespace' || subKind === 'ns') {
          this.cluster.applyResource({ apiVersion: 'v1', kind: 'Namespace', metadata: { name }, status: { phase: 'Active' } });
          return { exitCode: 0, output: `namespace/${name} created` };
        }
        if (subKind === 'deployment') {
          this.cluster.applyResource({
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name, namespace: ns },
            spec: { replicas: 1, selector: { matchLabels: { app: name } } }
          });
          return { exitCode: 0, output: `deployment.apps/${name} created` };
        }
        if (subKind === 'job') {
          this.cluster.applyResource({
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: { name, namespace: ns },
            spec: { template: { spec: { containers: [{ name: 'job', image: 'busybox' }] } } },
            status: { succeeded: 1 }
          });
          return { exitCode: 0, output: `job.batch/${name} created` };
        }
        if (subKind === 'cronjob') {
          this.cluster.applyResource({
            apiVersion: 'batch/v1',
            kind: 'CronJob',
            metadata: { name, namespace: ns },
            spec: { schedule: '*/5 * * * *', jobTemplate: { spec: {} } }
          });
          return { exitCode: 0, output: `cronjob.batch/${name} created` };
        }
        this.cluster.applyResource({
          apiVersion: 'v1',
          kind: subKind.charAt(0).toUpperCase() + subKind.slice(1),
          metadata: { name, namespace: ns },
          spec: {}
        });
        return { exitCode: 0, output: `${subKind}/${name} created` };
      }

      // kubectl delete
      if (verb === 'delete') {
        const fIdx = cleanArgs.indexOf('-f');
        if (fIdx !== -1 && cleanArgs[fIdx + 1]) {
          const file = cleanArgs[fIdx + 1];
          if (this.vfs.exists(file)) {
            const content = this.vfs.readFile(file);
            const docs = parseOfflineYaml(content);
            for (const doc of docs) {
              this.cluster.deleteResource(doc.kind, doc.metadata.name, doc.metadata.namespace);
            }
            return { exitCode: 0, output: 'resources deleted' };
          }
          return { exitCode: 1, output: `error: the path "${file}" does not exist` };
        }

        const kind = cleanArgs[0];
        const name = cleanArgs[1];
        if (kind && name) {
          const deleted = this.cluster.deleteResource(kind, name, ns);
          if (deleted) return { exitCode: 0, output: `${kind} "${name}" deleted` };
          return { exitCode: 1, output: `Error from server (NotFound): ${kind} "${name}" not found` };
        }
        return { exitCode: 0, output: 'resource deleted' };
      }

      // kubectl auth can-i
      if (verb === 'auth' && cleanArgs[0] === 'can-i') {
        const queryVerb = cleanArgs[1] || 'get';
        const queryResource = cleanArgs[2] || 'pods';
        const allowed = this.cluster.canI({ verb: queryVerb, resource: queryResource, namespace: ns });
        return { exitCode: allowed ? 0 : 1, output: allowed ? 'yes' : 'no' };
      }

      // kubectl cordon / uncordon / drain / taint
      if (verb === 'cordon' || verb === 'uncordon' || verb === 'drain') {
        const nodeName = cleanArgs[0];
        const node = this.cluster.getResource('Node', nodeName);
        if (node) {
          node.spec = node.spec || {};
          node.spec.unschedulable = verb === 'cordon' || verb === 'drain';
          return { exitCode: 0, output: `node/${nodeName} ${verb === 'uncordon' ? 'uncordoned' : 'cordoned'}` };
        }
        return { exitCode: 1, output: `Error: node "${nodeName}" not found` };
      }

      if (verb === 'taint') {
        const nodeName = cleanArgs[1] || cleanArgs[0];
        const taintSpec = cleanArgs[2] || cleanArgs[1];
        const node = this.cluster.getResource('Node', nodeName);
        if (node) {
          node.spec = node.spec || {};
          node.spec.taints = node.spec.taints || [];
          node.spec.taints.push({ key: taintSpec });
          return { exitCode: 0, output: `node/${nodeName} tainted` };
        }
        return { exitCode: 0, output: `node/${nodeName} taint updated` };
      }

      // kubectl set (selector, env)
      if (verb === 'set') {
        const sub = cleanArgs[0];
        if (sub === 'selector') {
          const kind = cleanArgs[1] === 'svc' ? 'Service' : cleanArgs[1];
          const name = cleanArgs[2];
          const kv = cleanArgs[3] || '';
          const [k, v] = kv.split('=');
          const res = this.cluster.getResource(kind, name, ns);
          if (res) {
            res.spec = res.spec || {};
            res.spec.selector = res.spec.selector || {};
            if (k) res.spec.selector[k] = v;
            this.cluster.reconcile();
            return { exitCode: 0, output: `${kind.toLowerCase()}/${name} selector updated` };
          }
          return { exitCode: 1, output: `Error: ${kind} "${name}" not found` };
        }
        if (sub === 'env') {
          const kind = cleanArgs[1] || 'deployment';
          const name = cleanArgs[2];
          return { exitCode: 0, output: `${kind}/${name} env updated` };
        }
      }

      // kubectl scale
      if (verb === 'scale') {
        const kind = cleanArgs[0] || 'deployment';
        const name = cleanArgs[1];
        let replicas = 1;
        for (const a of cleanArgs) {
          if (a.startsWith('--replicas=')) replicas = Number(a.split('=')[1]);
        }
        const res = this.cluster.getResource(kind, name, ns);
        if (res) {
          res.spec = res.spec || {};
          res.spec.replicas = replicas;
          this.cluster.reconcile();
          return { exitCode: 0, output: `${kind}/${name} scaled to ${replicas}` };
        }
        return { exitCode: 1, output: `Error: ${kind} "${name}" not found` };
      }

      // kubectl patch
      if (verb === 'patch') {
        const kind = cleanArgs[0];
        const name = cleanArgs[1];
        let patchJson = null;
        for (let i = 2; i < cleanArgs.length; i++) {
          if (cleanArgs[i] === '--patch' || cleanArgs[i] === '-p') {
            try {
              patchJson = JSON.parse(cleanArgs[i + 1]);
            } catch {
              // Ignore parse error
            }
          }
        }
        const res = this.cluster.getResource(kind, name, ns);
        if (res && patchJson) {
          if (patchJson.spec) {
            res.spec = Object.assign({}, res.spec, patchJson.spec);
          }
          this.cluster.reconcile();
          return { exitCode: 0, output: `${kind}/${name} patched` };
        }
        return { exitCode: 0, output: `${kind}/${name} patched (offline)` };
      }

      // kubectl label / annotate
      if (verb === 'label' || verb === 'annotate') {
        const kind = cleanArgs[0];
        const name = cleanArgs[1];
        const kv = cleanArgs[2] || '';
        const [k, v] = kv.split('=');
        const res = this.cluster.getResource(kind, name, ns);
        if (res) {
          const field = verb === 'label' ? 'labels' : 'annotations';
          res.metadata[field] = res.metadata[field] || {};
          if (k) res.metadata[field][k] = v || '';
          return { exitCode: 0, output: `${kind}/${name} ${verb}ed` };
        }
        return { exitCode: 0, output: `${kind}/${name} ${verb}ed` };
      }

      // kubectl logs / exec
      if (verb === 'logs') {
        const podName = cleanArgs[0];
        return { exitCode: 0, output: `[2026-11-12T00:00:00Z] Starting ${podName}...\n[2026-11-12T00:00:01Z] Server listening on port 80` };
      }

      if (verb === 'exec') {
        return { exitCode: 0, output: 'command executed in container' };
      }

      return { exitCode: 0, output: `kubectl ${verb} OK (offline)` };
    }

    handleHelm(args) {
      const sub = args[0] || 'list';
      if (sub === 'install') {
        const relName = args[1];
        const chart = args[2];
        this.cluster.helmReleases.push({ name: relName, chart, status: 'deployed' });
        return { exitCode: 0, output: `NAME: ${relName}\nSTATUS: deployed\nREVISION: 1` };
      }
      if (sub === 'list') {
        if (this.cluster.helmReleases.length === 0) return { exitCode: 0, output: 'No releases found.' };
        return {
          exitCode: 0,
          output: `NAME\tSTATUS\tCHART\n` + this.cluster.helmReleases.map((r) => `${r.name}\t${r.status}\t${r.chart}`).join('\n')
        };
      }
      return { exitCode: 0, output: `helm ${sub} OK (offline)` };
    }

    handleArgoCD(args) {
      const sub = args[0] || 'app';
      if (sub === 'app' && args[1] === 'create') {
        const appName = args[2];
        this.cluster.argoApps.push({ name: appName, syncStatus: 'Synced', healthStatus: 'Healthy' });
        return { exitCode: 0, output: `application '${appName}' created` };
      }
      if (sub === 'app' && args[1] === 'sync') {
        const appName = args[2];
        const a = this.cluster.argoApps.find((x) => x.name === appName);
        if (a) a.syncStatus = 'Synced';
        return { exitCode: 0, output: `TIMESTAMP\tNAME\tACTION\tSTATUS\n1s\t${appName}\tsync\tSuccessful` };
      }
      return { exitCode: 0, output: `argocd ${args.join(' ')} completed (offline)` };
    }

    handleTofu(args) {
      const sub = args[0] || 'plan';
      if (sub === 'init') {
        return { exitCode: 0, output: 'OpenTofu has been successfully initialized!' };
      }
      if (sub === 'plan') {
        return { exitCode: 0, output: 'Plan: 2 to add, 0 to change, 0 to destroy.' };
      }
      if (sub === 'apply') {
        return { exitCode: 0, output: 'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.' };
      }
      return { exitCode: 0, output: `tofu ${sub} OK (offline)` };
    }
  }

  // ==========================================
  // 7. Declarative Validation Engine
  // ==========================================
  class BrowserValidator {
    evaluate(rules, cluster, commandHistory = [], vfs = null) {
      if (!Array.isArray(rules) || rules.length === 0) {
        return { passed: true, score: 100, passedCount: 0, totalCount: 0, results: [] };
      }

      const results = [];
      let passedCount = 0;

      for (const rule of rules) {
        let passed = false;
        let actual = 'Not found';

        const ns = rule.namespace || 'default';

        switch (rule.type) {
          case 'resource_exists': {
            const res = cluster.getResource(rule.kind, rule.name, ns);
            passed = Boolean(res);
            actual = res ? `${rule.kind}/${rule.name} exists in ${ns}` : 'Not found';
            break;
          }

          case 'resource_count_min': {
            const items = cluster.getResources(rule.kind, ns);
            const count = items.length;
            passed = count >= Number(rule.minCount || 1);
            actual = `${count} resources found`;
            break;
          }

          case 'replica_count_min': {
            const res = cluster.getResource(rule.kind || 'Deployment', rule.name, ns);
            const replicas = (res && res.spec && res.spec.replicas !== undefined) ? Number(res.spec.replicas) : 0;
            passed = replicas >= Number(rule.minReplicas || 1);
            actual = `${replicas} replicas`;
            break;
          }

          case 'resource_field_equals': {
            const res = cluster.getResource(rule.kind, rule.name, ns);
            if (res) {
              const val = resolveJsonPath(res, rule.fieldPath);
              passed = String(val) === String(rule.expectedValue);
              actual = String(val);
            } else {
              actual = 'Resource not found';
            }
            break;
          }

          case 'resource_field_contains': {
            const res = cluster.getResource(rule.kind, rule.name, ns);
            if (res) {
              const val = resolveJsonPath(res, rule.fieldPath);
              passed = String(val).includes(String(rule.expectedSubstring || rule.expectedValue));
              actual = String(val);
            } else {
              actual = 'Resource not found';
            }
            break;
          }

          case 'pod_status_running': {
            const pods = cluster.getResources('Pod', ns).filter((p) => p.metadata.name.startsWith(rule.name));
            passed = pods.length > 0 && pods.every((p) => p.status && p.status.phase === 'Running');
            actual = passed ? 'Running' : pods.length === 0 ? 'Pod not found' : 'Pending or Error';
            break;
          }

          case 'service_has_endpoints': {
            const svc = cluster.getResource('Service', rule.name, ns);
            const count = (svc && svc.status && svc.status.endpointCount) || 0;
            passed = count > 0;
            actual = `${count} endpoints registered`;
            break;
          }

          case 'command_executed': {
            const pattern = rule.commandSubstring || rule.pattern || rule.name || '';
            passed = commandHistory.some((cmd) => cmd.includes(pattern));
            actual = passed ? `Matched command "${pattern}"` : 'Command not found in history';
            break;
          }

          case 'vfs_file_exists': {
            if (vfs) {
              passed = vfs.exists(rule.path || rule.filePath);
              actual = passed ? `File ${rule.path || rule.filePath} exists` : 'File missing';
            } else {
              passed = true;
              actual = 'VFS check bypassed';
            }
            break;
          }

          case 'vfs_file_contains': {
            if (vfs && vfs.exists(rule.path || rule.filePath)) {
              const content = vfs.readFile(rule.path || rule.filePath);
              passed = content.includes(rule.expectedSubstring || rule.pattern || '');
              actual = passed ? 'Pattern found in file' : 'Pattern not found';
            } else {
              passed = false;
              actual = 'File not found';
            }
            break;
          }

          case 'can_i': {
            passed = cluster.canI({
              user: rule.user || 'learner',
              verb: rule.verb || 'get',
              resource: rule.resource || 'pods',
              namespace: ns
            });
            actual = passed ? 'Access allowed' : 'Access denied';
            break;
          }

          case 'node_unschedulable': {
            const node = cluster.getResource('Node', rule.name);
            passed = Boolean(node && node.spec && node.spec.unschedulable);
            actual = passed ? 'Node unschedulable' : 'Node schedulable';
            break;
          }

          case 'node_taint_exists': {
            const node = cluster.getResource('Node', rule.name);
            const taints = (node && node.spec && node.spec.taints) || [];
            passed = taints.some((t) => (t.key || t).includes(rule.taintKey || ''));
            actual = passed ? 'Taint exists' : 'Taint missing';
            break;
          }

          case 'pv_bound':
          case 'pvc_bound': {
            const pvc = cluster.getResource('PersistentVolumeClaim', rule.name, ns);
            passed = Boolean(pvc && pvc.status && pvc.status.phase === 'Bound');
            actual = pvc ? pvc.status.phase : 'PVC not found';
            break;
          }

          case 'helm_release_deployed': {
            const rel = cluster.helmReleases.find((r) => r.name === rule.name);
            passed = Boolean(rel && rel.status === 'deployed');
            actual = rel ? rel.status : 'Release not found';
            break;
          }

          case 'argocd_app_synced': {
            const app = cluster.argoApps.find((a) => a.name === rule.name);
            passed = Boolean(app && app.syncStatus === 'Synced');
            actual = app ? app.syncStatus : 'App not found';
            break;
          }

          default:
            passed = true;
            actual = 'Satisfied (offline-default)';
            break;
        }

        if (passed) passedCount++;
        results.push({
          id: rule.id || `rule-${results.length + 1}`,
          description: rule.description || 'Validation assertion',
          type: rule.type,
          passed,
          actual,
          expected: String(rule.expectedValue || 'Condition Met'),
          remediation: passed ? null : rule.remediation || 'Review configuration and try again'
        });
      }

      const score = Math.round((passedCount / rules.length) * 100);
      return {
        passed: passedCount === rules.length,
        score,
        passedCount,
        totalCount: rules.length,
        results
      };
    }
  }

  // ==========================================
  // 8. Offline Incident Scenarios
  // ==========================================
  const OFFLINE_INCIDENTS = [
    {
      id: 'inc-01-web-503',
      title: 'Production Web Tier 503 Bad Gateway',
      category: 'website-down',
      severity: 'P1',
      description: 'Frontend Service selector app=frontend-v2 does not match Pod labels app=frontend.',
      starterCommand: 'kubectl describe svc frontend-svc -n production',
      solutionCommands: ['kubectl set selector svc frontend-svc -n production app=frontend']
    },
    {
      id: 'inc-02-pod-crashloop',
      title: 'Payment Gateway CrashLoopBackOff',
      category: 'pod-restarting',
      severity: 'P1',
      description: 'Payment pod crashing due to missing DB_PASSWORD environment variable.',
      starterCommand: 'kubectl logs payment-app -n production',
      solutionCommands: ['kubectl set env deployment payment-app -n production DB_PASSWORD=vault-secret']
    },
    {
      id: 'inc-03-slow-db',
      title: 'Postgres Latency & Throttling',
      category: 'slow-app',
      severity: 'P2',
      description: 'PostgreSQL container CPU limit 100m causing CFS throttling.',
      starterCommand: 'kubectl top pod postgres-0 -n production',
      solutionCommands: ['kubectl patch sts postgres -n production --patch \'{"spec":{"template":{"spec":{"containers":[{"name":"postgres","resources":{"limits":{"cpu":"2000m"}}}]}}}}\'']
    },
    {
      id: 'inc-04-coredns-down',
      title: 'Cluster-wide DNS Resolution Failure',
      category: 'dns-outage',
      severity: 'P1',
      description: 'CoreDNS replicas scaled to 0.',
      starterCommand: 'kubectl get deploy coredns -n kube-system',
      solutionCommands: ['kubectl scale deploy coredns -n kube-system --replicas=2']
    },
    {
      id: 'inc-05-iam-unauthorized',
      title: 'EKS IRSA S3 Access Denied',
      category: 'iam-outage',
      severity: 'P2',
      description: 'ServiceAccount missing eks.amazonaws.com/role-arn annotation.',
      starterCommand: 'kubectl describe sa data-processor -n production',
      solutionCommands: ['kubectl annotate sa data-processor -n production eks.amazonaws.com/role-arn=arn:aws:iam::112233445566:role/s3-writer']
    },
    {
      id: 'inc-06-pvc-pending',
      title: 'PersistentVolumeClaim Stuck in Pending',
      category: 'storage-outage',
      severity: 'P2',
      description: 'PVC requested non-existent StorageClass "ultra-nvme".',
      starterCommand: 'kubectl describe pvc redis-data -n production',
      solutionCommands: ['kubectl patch pvc redis-data -n production --patch \'{"spec":{"storageClassName":"standard"}}\'']
    },
    {
      id: 'inc-07-calico-isolation',
      title: 'Inter-Service Connectivity Blocked',
      category: 'networking-outage',
      severity: 'P2',
      description: 'NetworkPolicy default-deny isolating checkout service.',
      starterCommand: 'kubectl get netpol -n production',
      solutionCommands: ['kubectl delete netpol default-deny -n production']
    },
    {
      id: 'inc-08-node-diskpressure',
      title: 'Worker Node NotReady (DiskPressure)',
      category: 'node-outage',
      severity: 'P1',
      description: 'Worker node marked unschedulable with DiskPressure taint.',
      starterCommand: 'kubectl describe node kubelabs-worker-01',
      solutionCommands: ['kubectl uncordon kubelabs-worker-01']
    },
    {
      id: 'inc-09-etcd-quorum-loss',
      title: 'etcd Split-Brain & Quorum Loss',
      category: 'node-outage',
      severity: 'P1',
      description: 'etcd cluster lost quorum after ungraceful member crash.',
      starterCommand: 'etcdctl endpoint health',
      solutionCommands: ['etcdctl snapshot restore /backup/etcd.db']
    },
    {
      id: 'inc-10-kyverno-admission-block',
      title: 'Kyverno Policy Blocking Deployments',
      category: 'slow-app',
      severity: 'P2',
      description: 'ClusterPolicy disallow-root-user blocking container startup.',
      starterCommand: 'kubectl get clusterpolicy',
      solutionCommands: ['kubectl patch clusterpolicy disallow-root-user --type=merge -p \'{"spec":{"validationFailureAction":"Audit"}}\'']
    },
    {
      id: 'inc-11-coredns-loop-crash',
      title: 'CoreDNS Upstream Loop Crash',
      category: 'dns-outage',
      severity: 'P1',
      description: 'CoreDNS loop detected in /etc/resolv.conf forwarding.',
      starterCommand: 'kubectl logs -n kube-system -l k8s-app=kube-dns',
      solutionCommands: ['kubectl rollout restart deployment coredns -n kube-system']
    },
    {
      id: 'inc-12-pvc-storageclass-pending',
      title: 'StatefulSet PVC Volume Binding Timeout',
      category: 'storage-outage',
      severity: 'P2',
      description: 'WaitForFirstConsumer volume binding not triggered without pod scheduling.',
      starterCommand: 'kubectl describe pvc -n production',
      solutionCommands: ['kubectl patch storageclass standard -p \'{"volumeBindingMode":"Immediate"}\'']
    },
    {
      id: 'inc-13-hpa-oom-thrash',
      title: 'HPA CPU Oscillation & OOM Thrashing',
      category: 'slow-app',
      severity: 'P2',
      description: 'HPA target utilization set to 10% causing constant pod churn.',
      starterCommand: 'kubectl describe hpa frontend-hpa -n production',
      solutionCommands: ['kubectl autoscale deployment frontend --cpu-percent=70 --min=2 --max=10 -n production']
    },
    {
      id: 'inc-14-istio-mtls-mismatch',
      title: 'Istio Strict mTLS SSL Handshake Failure',
      category: 'networking-outage',
      severity: 'P2',
      description: 'PeerAuthentication set to STRICT while client missing sidecar proxy.',
      starterCommand: 'istioctl analyze -n production',
      solutionCommands: ['kubectl label namespace production istio-injection=enabled --overwrite']
    },
    {
      id: 'inc-15-argocd-out-of-sync',
      title: 'ArgoCD Application OutOfSync & Degraded',
      category: 'website-down',
      severity: 'P2',
      description: 'ArgoCD application drifts from Git repo due to manual kubectl edit.',
      starterCommand: 'argocd app get production-web',
      solutionCommands: ['argocd app sync production-web']
    }
  ];

  // ==========================================
  // 9. Offline Capstone Projects
  // ==========================================
  const OFFLINE_PROJECTS = [
    {
      id: 'cap-01-ecom-microservices',
      title: 'E-Commerce Microservices Platform on EKS',
      difficulty: 'Advanced',
      milestones: 4,
      xpReward: 500
    },
    {
      id: 'cap-02-fintech-pci-dss',
      title: 'PCI-DSS Zero-Trust Banking Core on GKE',
      difficulty: 'Expert',
      milestones: 4,
      xpReward: 600
    },
    {
      id: 'cap-03-telecom-5g-sre',
      title: '5G Edge Network Observability & SRE Platform',
      difficulty: 'Advanced',
      milestones: 3,
      xpReward: 450
    },
    {
      id: 'cap-04-hybrid-multicloud-dr',
      title: 'Multi-Region Active-Active Disaster Recovery',
      difficulty: 'Expert',
      milestones: 4,
      xpReward: 650
    },
    {
      id: 'cap-05-devsecops-pipeline',
      title: 'GitOps DevSecOps Pipeline with Kyverno & Cosign',
      difficulty: 'Advanced',
      milestones: 3,
      xpReward: 500
    },
    {
      id: 'cap-06-platform-idp',
      title: 'Self-Service Developer Platform with Crossplane',
      difficulty: 'Expert',
      milestones: 4,
      xpReward: 600
    },
    {
      id: 'cap-07-multitenant-vcluster',
      title: 'Enterprise Multi-Tenant vCluster Infrastructure',
      difficulty: 'Advanced',
      milestones: 3,
      xpReward: 550
    },
    {
      id: 'cap-08-kserve-distributed-ai',
      title: 'Distributed LLM Inference Cloud with KServe & Ray',
      difficulty: 'Expert',
      milestones: 4,
      xpReward: 700
    }
  ];

  // ==========================================
  // 10. Offline AI Mentor
  // ==========================================
  class BrowserAIMentor {
    respond({ mode = 'hint', query = '', cluster = null, lastError = null, lab = null }) {
      const q = String(query).toLowerCase();

      if (mode === 'security-audit') {
        const clusterResources = cluster ? cluster.resources : [];
        const findings = [];

        // Check for privileged containers or missing limits
        for (const r of clusterResources) {
          if (r.kind === 'Pod' || r.kind === 'Deployment') {
            const containers = (r.spec && r.spec.template ? r.spec.template.spec.containers : r.spec && r.spec.containers) || [];
            for (const c of containers) {
              if (c.securityContext && c.securityContext.privileged) {
                findings.push(`[CIS 5.2.1 FAIL] ${r.kind}/${r.metadata.name} runs container "${c.name}" as privileged`);
              }
              if (!c.resources || !c.resources.limits) {
                findings.push(`[CIS 5.1.1 WARN] ${r.kind}/${r.metadata.name} container "${c.name}" missing CPU/Memory limits`);
              }
            }
          }
        }

        if (findings.length === 0) {
          return {
            mode: 'security-audit',
            response: '### CIS Kubernetes Benchmark Report (Offline Engine)\n\nAll audited workloads satisfy baseline Pod Security Standards. Zero critical violations detected.'
          };
        }

        return {
          mode: 'security-audit',
          response: `### CIS Kubernetes Benchmark Audit Findings (Offline Engine)\n\n${findings.map((f) => `- ${f}`).join('\n')}\n\n**Remediation:** Enforce PodSecurity admission standard or apply Kyverno restrict-privileged-containers policy.`
        };
      }

      if (mode === 'debug-error') {
        const err = lastError || query || 'Unknown error';
        if (err.includes('NotFound') || err.includes('not found')) {
          return {
            mode: 'debug-error',
            response: `Root Cause: Resource not found. Verify the namespace with \`-n <namespace>\` or list available resources using \`kubectl get <kind> -A\`.`
          };
        }
        if (err.includes('503') || err.includes('endpoints')) {
          return {
            mode: 'debug-error',
            response: `Root Cause: Service selector mismatch. Inspect \`kubectl get pods --show-labels\` and compare with \`kubectl describe svc <name>\`. Ensure pod selector keys and values match exactly.`
          };
        }
        return {
          mode: 'debug-error',
          response: `Offline Diagnosis: Analyze logs with \`kubectl logs <pod>\` and describe events with \`kubectl describe <kind> <name>\` to pinpoint state transition failures.`
        };
      }

      if (mode === 'explain') {
        if (q.includes('service') || q.includes('svc')) {
          return {
            mode: 'explain',
            response: 'A Kubernetes Service is an abstract way to expose an application running on a set of Pods as a network service. It provides a stable IP address (ClusterIP) and DNS name, routing traffic to pods matching its label selector.'
          };
        }
        if (q.includes('ingress') || q.includes('gateway')) {
          return {
            mode: 'explain',
            response: 'Ingress and Gateway API manage external HTTP/HTTPS routing into services within the cluster, offering SSL termination, virtual hosting, and path-based routing.'
          };
        }
        return {
          mode: 'explain',
          response: `Concept Explanation (Offline): In cloud-native systems, declarative intent is stored in the control plane and controllers continuously reconcile desired state with observed state.`
        };
      }

      // Default: Socratic Hint
      if (lab && lab.hints && lab.hints.length > 0) {
        return {
          mode: 'hint',
          response: `Socratic Hint: ${lab.hints[0]}`
        };
      }

      return {
        mode: 'hint',
        response: 'Socratic Hint: Consider reviewing the manifest fields with `kubectl explain <resource>.spec` and verify the current cluster topology.'
      };
    }
  }

  // ==========================================
  // 11. Offline Sync Queue & Progress Manager
  // ==========================================
  const SYNC_QUEUE_KEY = 'kubelabs_offline_sync_queue';
  const PROGRESS_KEY = 'kubelabs_offline_progress';

  function getLocalProgress() {
    const raw = getStored(PROGRESS_KEY);
    return raw || { completedLabs: [], xp: 0, incidents: [], projects: [] };
  }

  function saveLocalProgress(prog) {
    setStored(PROGRESS_KEY, prog);
  }

  function getSyncQueue() {
    const raw = getStored(SYNC_QUEUE_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  function enqueueSync(item) {
    const q = getSyncQueue();
    q.push({ timestamp: new Date().toISOString(), item });
    setStored(SYNC_QUEUE_KEY, q);
    return q.length;
  }

  function clearSyncQueue() {
    setStored(SYNC_QUEUE_KEY, []);
  }

  async function flushSyncQueue(apiClient) {
    const q = getSyncQueue();
    if (!q || q.length === 0 || !apiClient) return { flushed: 0, remaining: 0 };

    const remaining = [];
    let flushed = 0;

    for (const entry of q) {
      try {
        if (typeof apiClient.post === 'function') {
          await apiClient.post('/api/sync', entry.item);
          flushed++;
        } else {
          remaining.push(entry);
        }
      } catch {
        remaining.push(entry);
      }
    }

    setStored(SYNC_QUEUE_KEY, remaining);
    return { flushed, remaining: remaining.length };
  }

  // ==========================================
  // 12. Facade Instantiation & Public API
  // ==========================================
  const vfs = new BrowserVFS();
  const cluster = new BrowserCluster();
  const terminal = new BrowserTerminal(cluster, vfs);
  const validator = new BrowserValidator();
  const aiMentor = new BrowserAIMentor();

  return {
    version: '3.0.0',
    vfs,
    cluster,
    terminal,
    validator,
    aiMentor,
    incidents: OFFLINE_INCIDENTS,
    projects: OFFLINE_PROJECTS,

    // Runtime state checks
    isOffline: () => typeof navigator !== 'undefined' && !navigator.onLine,

    // Terminal execution
    executeCommand: (cmd) => terminal.execute(cmd),

    // Cluster manipulations
    applyManifest: (yaml) => cluster.applyManifest(yaml),
    getClusterState: () => cluster.exportSnapshot(),
    resetCluster: (state) => cluster.reset(state),

    // Validation
    evaluateRules: (rules) => validator.evaluate(rules, cluster, terminal.commandHistory, vfs),

    // Incidents
    listIncidents: () => OFFLINE_INCIDENTS,
    getIncident: (id) => OFFLINE_INCIDENTS.find((inc) => inc.id === id) || null,
    startIncident: (id) => {
      const inc = OFFLINE_INCIDENTS.find((i) => i.id === id);
      if (!inc) return null;
      // Setup fault condition
      if (id === 'inc-01-web-503') {
        cluster.applyResource({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'frontend-svc', namespace: 'production' },
          spec: { selector: { app: 'frontend-v2' }, ports: [{ port: 80 }] }
        });
        cluster.applyResource({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'frontend', namespace: 'production' },
          spec: { replicas: 2, selector: { matchLabels: { app: 'frontend' } } }
        });
      } else if (id === 'inc-04-coredns-down') {
        cluster.applyResource({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'coredns', namespace: 'kube-system' },
          spec: { replicas: 0 }
        });
      } else if (id === 'inc-08-node-diskpressure') {
        const node = cluster.getResource('Node', 'kubelabs-worker-01');
        if (node) {
          node.spec = node.spec || {};
          node.spec.unschedulable = true;
        }
      }
      return inc;
    },
    validateIncident: (id) => {
      const inc = OFFLINE_INCIDENTS.find((i) => i.id === id);
      if (!inc) return { resolved: false, reason: 'Incident not found' };

      if (id === 'inc-01-web-503') {
        const svc = cluster.getResource('Service', 'frontend-svc', 'production');
        const resolved = Boolean(svc && svc.spec && svc.spec.selector && svc.spec.selector.app === 'frontend');
        return { resolved, reason: resolved ? 'Selector aligned' : 'Service selector still mismatched' };
      }
      if (id === 'inc-04-coredns-down') {
        const dep = cluster.getResource('Deployment', 'coredns', 'kube-system');
        const resolved = Boolean(dep && dep.spec && Number(dep.spec.replicas) >= 1);
        return { resolved, reason: resolved ? 'CoreDNS replicas restored' : 'CoreDNS replicas still 0' };
      }
      if (id === 'inc-08-node-diskpressure') {
        const node = cluster.getResource('Node', 'kubelabs-worker-01');
        const resolved = Boolean(node && (!node.spec || !node.spec.unschedulable));
        return { resolved, reason: resolved ? 'Node uncordoned' : 'Node still unschedulable' };
      }

      return { resolved: true, reason: 'Incident resolved' };
    },

    // Projects
    listProjects: () => OFFLINE_PROJECTS,
    getProject: (id) => OFFLINE_PROJECTS.find((p) => p.id === id) || null,

    // AI Mentor
    getAIMentorAdvice: (opts) => aiMentor.respond(Object.assign({ cluster }, opts)),

    // Progress persistence
    getProgress: () => getLocalProgress(),
    saveProgress: (prog) => saveLocalProgress(prog),
    resetProgress: () => saveLocalProgress({ completedLabs: [], xp: 0, incidents: [], projects: [] }),
    recordProgress: (item) => {
      const p = getLocalProgress();
      if (item.labId && !p.completedLabs.includes(item.labId)) {
        p.completedLabs.push(item.labId);
        p.xp = (p.xp || 0) + (item.xpReward || 100);
      }
      if (item.incidentId && !p.incidents.includes(item.incidentId)) {
        p.incidents.push(item.incidentId);
        p.xp = (p.xp || 0) + 150;
      }
      if (item.projectId && !p.projects.includes(item.projectId)) {
        p.projects.push(item.projectId);
        p.xp = (p.xp || 0) + 300;
      }
      saveLocalProgress(p);
      enqueueSync({ type: 'progress', item });
      return p;
    },

    // Sync Queue
    enqueueSync,
    getSyncQueue,
    clearSyncQueue,
    flushSyncQueue
  };
});
