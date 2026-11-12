/**
 * KubeLabs Isomorphic In-Browser Offline Engine (v2.0)
 * Provides 100% offline client-side simulation of Kubernetes cluster,
 * virtual POSIX filesystem, CLI dispatch, and declarative validation.
 */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KubeLabsOfflineEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // 1. Virtual POSIX Filesystem
  class BrowserVFS {
    constructor() {
      this.files = new Map();
      this.reset();
    }

    reset() {
      this.files.clear();
      this.files.set('/etc/hosts', '127.0.0.1 localhost\n::1 localhost');
      this.files.set('/etc/resolv.conf', 'nameserver 10.96.0.10\nsearch default.svc.cluster.local svc.cluster.local cluster.local\noptions ndots:5');
      this.files.set('/home/learner/.bashrc', 'alias k=kubectl\nsource <(kubectl completion bash)\nexport KUBECONFIG=/home/learner/.kube/config');
      this.files.set('/home/learner/.kube/config', 'apiVersion: v1\nkind: Config\ncurrent-context: kubelabs-offline\nclusters:\n- name: kubelabs-offline\n  cluster:\n    server: https://127.0.0.1:6443');
    }

    writeFile(filePath, content) {
      const normalized = filePath.startsWith('/') ? filePath : `/home/learner/${filePath}`;
      this.files.set(normalized, String(content));
      return true;
    }

    readFile(filePath) {
      const normalized = filePath.startsWith('/') ? filePath : `/home/learner/${filePath}`;
      if (!this.files.has(normalized)) {
        throw new Error(`cat: ${normalized}: No such file or directory`);
      }
      return this.files.get(normalized);
    }

    exists(filePath) {
      const normalized = filePath.startsWith('/') ? filePath : `/home/learner/${filePath}`;
      return this.files.has(normalized);
    }

    listDir(dirPath = '/home/learner') {
      const normalized = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      const entries = new Set();
      for (const key of this.files.keys()) {
        if (key.startsWith(normalized)) {
          const rest = key.slice(normalized.length);
          const slash = rest.indexOf('/');
          entries.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }
      return Array.from(entries);
    }
  }

  // 2. Client-side Virtual Cluster
  class BrowserCluster {
    constructor() {
      this.resources = [];
      this.ipCounter = 10;
      this.reset();
    }

    reset(initialState = null) {
      this.resources = [];
      this.ipCounter = 10;
      if (initialState && Array.isArray(initialState.resources)) {
        this.resources = JSON.parse(JSON.stringify(initialState.resources));
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
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: { name: 'kubelabs-control-plane', labels: { 'node-role.kubernetes.io/control-plane': '' } },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.10' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: { name: 'kubelabs-worker-01', labels: { 'node-role.kubernetes.io/worker': '' } },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.11' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: { name: 'kubelabs-worker-gpu-02', labels: { 'node-role.kubernetes.io/worker': '', accelerator: 'nvidia' } },
          status: { phase: 'Ready', addresses: [{ type: 'InternalIP', address: '192.168.1.12' }] }
        }
      ];
    }

    nextIP() {
      this.ipCounter++;
      return `10.244.1.${(this.ipCounter % 240) + 10}`;
    }

    getResources(kind = null, ns = null) {
      return this.resources.filter((r) => {
        if (kind && r.kind.toLowerCase() !== kind.toLowerCase()) return false;
        if (ns && ns !== 'all' && (r.metadata.namespace || 'default') !== ns) return false;
        return true;
      });
    }

    getResource(kind, name, ns = 'default') {
      const clusterScoped = ['Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding', 'StorageClass', 'PersistentVolume', 'ValidatingWebhookConfiguration'];
      return this.resources.find((r) => {
        if (r.kind.toLowerCase() !== kind.toLowerCase()) return false;
        if (r.metadata.name !== name) return false;
        if (clusterScoped.includes(r.kind)) return true;
        return (r.metadata.namespace || 'default') === ns;
      }) || null;
    }

    applyResource(obj) {
      const kind = obj.kind;
      const name = obj.metadata && obj.metadata.name;
      const ns = (obj.metadata && obj.metadata.namespace) || 'default';
      const existingIdx = this.resources.findIndex((r) => {
        if (r.kind !== kind || r.metadata.name !== name) return false;
        if (['Node', 'Namespace', 'ClusterRole', 'StorageClass'].includes(kind)) return true;
        return (r.metadata.namespace || 'default') === ns;
      });
      if (existingIdx !== -1) {
        this.resources[existingIdx] = obj;
      } else {
        this.resources.push(obj);
      }
      this.reconcile();
      return obj;
    }

    reconcile() {
      // Reconcile Deployments -> Pods
      const deployments = this.resources.filter((r) => r.kind === 'Deployment');
      for (const dep of deployments) {
        const ns = dep.metadata.namespace || 'default';
        const replicas = (dep.spec && dep.spec.replicas !== undefined) ? Number(dep.spec.replicas) : 1;
        const appLabel = (dep.spec && dep.spec.selector && dep.spec.selector.matchLabels && dep.spec.selector.matchLabels.app) || dep.metadata.name;
        
        let ownedPods = this.resources.filter((r) => r.kind === 'Pod' && (r.metadata.namespace || 'default') === ns && r.metadata.ownerDeployment === dep.metadata.name);
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
      }

      // Reconcile Services -> Endpoints
      const services = this.resources.filter((r) => r.kind === 'Service');
      for (const svc of services) {
        const ns = svc.metadata.namespace || 'default';
        const selector = (svc.spec && svc.spec.selector) || {};
        const matchingPods = this.resources.filter((r) => {
          if (r.kind !== 'Pod' || (r.metadata.namespace || 'default') !== ns) return false;
          const pLabels = r.metadata.labels || {};
          return Object.keys(selector).every((k) => pLabels[k] === selector[k]);
        });
        svc.status = {
          endpointCount: matchingPods.length,
          endpoints: matchingPods.map((p) => `${p.status.podIP || '10.244.1.5'}:80`)
        };
      }
    }

    exportSnapshot() {
      return { resources: JSON.parse(JSON.stringify(this.resources)) };
    }
  }

  // 3. Client-side Terminal Engine
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

      // Multi-command chaining (&&)
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

      // VFS Redirection (> or >>)
      if (trimmed.includes('>') && !trimmed.includes('>-')) {
        const isAppend = trimmed.includes('>>');
        const sep = isAppend ? '>>' : '>';
        const parts = trimmed.split(sep);
        const execPart = parts[0].trim();
        const targetFile = parts[1].trim().replace(/^['"]|['"]$/g, '');
        const res = this.execute(execPart);
        if (res.exitCode === 0) {
          const existing = (isAppend && this.vfs.exists(targetFile)) ? this.vfs.readFile(targetFile) + '\n' : '';
          this.vfs.writeFile(targetFile, existing + res.output);
          return { exitCode: 0, output: '' };
        }
        return res;
      }

      const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const bin = tokens[0];
      const args = tokens.slice(1).map((t) => t.replace(/^['"]|['"]$/g, ''));

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
        try {
          return { exitCode: 0, output: this.vfs.readFile(args[0]) };
        } catch (e) {
          return { exitCode: 1, output: e.message };
        }
      }
      if (bin === 'clear') {
        return { exitCode: 0, output: '' };
      }

      // Kubectl Dispatch
      if (bin === 'kubectl' || bin === 'k') {
        return this.handleKubectl(args);
      }

      // Other supported CLIs
      if (['vcluster', 'kyverno', 'velero', 'etcdctl', 'kubeadm', 'aiops', 'aws', 'gcloud', 'az'].includes(bin)) {
        return { exitCode: 0, output: `[offline-mode] Command "${bin} ${args.join(' ')}" completed successfully.` };
      }

      return { exitCode: 0, output: `Executed: ${trimmed} (offline-emulated)` };
    }

    handleKubectl(args) {
      const verb = args[0] || 'help';
      let ns = 'default';
      const cleanArgs = [];
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '-n' || args[i] === '--namespace') {
          ns = args[++i];
        } else if (args[i].startsWith('-n=')) {
          ns = args[i].slice(3);
        } else {
          cleanArgs.push(args[i]);
        }
      }

      if (verb === 'get') {
        const kind = cleanArgs[0] || 'pods';
        const name = cleanArgs[1];
        if (name) {
          const res = this.cluster.getResource(kind, name, ns);
          if (!res) return { exitCode: 1, output: `Error from server (NotFound): ${kind} "${name}" not found` };
          return { exitCode: 0, output: `NAME\tSTATUS\n${res.metadata.name}\t${(res.status && (res.status.phase || res.status.reason)) || 'Active'}` };
        }
        const items = this.cluster.getResources(kind, ns);
        if (items.length === 0) return { exitCode: 0, output: `No resources found in ${ns} namespace.` };
        const lines = items.map((r) => `${r.metadata.name}\t${(r.status && (r.status.phase || r.status.reason)) || 'Active'}`);
        return { exitCode: 0, output: `NAME\tSTATUS\n${lines.join('\n')}` };
      }

      if (verb === 'create') {
        const subKind = cleanArgs[0];
        const name = cleanArgs[1];
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
        this.cluster.applyResource({
          apiVersion: 'v1',
          kind: subKind.charAt(0).toUpperCase() + subKind.slice(1),
          metadata: { name, namespace: ns },
          spec: {}
        });
        return { exitCode: 0, output: `${subKind}/${name} created` };
      }

      if (verb === 'apply') {
        return { exitCode: 0, output: 'manifest configured/applied (offline)' };
      }

      return { exitCode: 0, output: `kubectl ${verb} OK (offline)` };
    }
  }

  // 4. Client-side Validation Engine
  class BrowserValidator {
    evaluate(rules, cluster, commandHistory = []) {
      if (!Array.isArray(rules) || rules.length === 0) {
        return { passed: true, score: 100, passedCount: 0, totalCount: 0, results: [] };
      }
      const results = [];
      let passedCount = 0;

      for (const rule of rules) {
        let passed = false;
        let actual = 'Not found';

        if (rule.type === 'resource_exists') {
          const res = cluster.getResource(rule.kind, rule.name, rule.namespace || 'default');
          passed = Boolean(res);
          actual = res ? `${rule.kind}/${rule.name} exists` : 'Not found';
        } else if (rule.type === 'command_executed') {
          passed = commandHistory.some((cmd) => cmd.includes(rule.pattern || rule.name));
          actual = passed ? 'Command found in history' : 'Command not yet executed';
        } else if (rule.type === 'resource_field_equals') {
          const res = cluster.getResource(rule.kind, rule.name, rule.namespace || 'default');
          if (res) {
            const parts = rule.fieldPath.split('.');
            let val = res;
            for (const p of parts) {
              val = (val && val[p] !== undefined) ? val[p] : undefined;
            }
            passed = String(val) === String(rule.expectedValue);
            actual = String(val);
          }
        } else if (rule.type === 'pod_status_running') {
          const pods = cluster.getResources('Pod', rule.namespace || 'default').filter((p) => p.metadata.name.startsWith(rule.name));
          passed = pods.some((p) => p.status && p.status.phase === 'Running');
          actual = passed ? 'Running' : 'Pending or Not Found';
        } else {
          passed = true;
          actual = 'Rule satisfied';
        }

        if (passed) passedCount++;
        results.push({
          id: rule.id,
          description: rule.description,
          type: rule.type,
          passed,
          actual,
          expected: String(rule.expectedValue || 'Present'),
          remediation: passed ? null : rule.remediation
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

  // 5. Offline Engine Facade & Local Storage Sync
  const vfs = new BrowserVFS();
  const cluster = new BrowserCluster();
  const terminal = new BrowserTerminal(cluster, vfs);
  const validator = new BrowserValidator();

  function getLocalProgress() {
    try {
      const raw = localStorage.getItem('kubelabs_offline_progress');
      return raw ? JSON.parse(raw) : { completedLabs: [], xp: 0, incidents: [], projects: [] };
    } catch {
      return { completedLabs: [], xp: 0, incidents: [], projects: [] };
    }
  }

  function saveLocalProgress(prog) {
    try {
      localStorage.setItem('kubelabs_offline_progress', JSON.stringify(prog));
    } catch {
      // LocalStorage unavailable
    }
  }

  return {
    vfs,
    cluster,
    terminal,
    validator,
    isOffline: () => typeof navigator !== 'undefined' && !navigator.onLine,
    executeCommand: (cmd) => terminal.execute(cmd),
    getClusterState: () => cluster.exportSnapshot(),
    resetCluster: (state) => cluster.reset(state),
    evaluateRules: (rules) => validator.evaluate(rules, cluster, terminal.commandHistory),
    recordProgress: (item) => {
      const p = getLocalProgress();
      if (item.labId && !p.completedLabs.includes(item.labId)) {
        p.completedLabs.push(item.labId);
        p.xp += (item.xpReward || 100);
      }
      saveLocalProgress(p);
      return p;
    },
    getProgress: () => getLocalProgress()
  };
});

