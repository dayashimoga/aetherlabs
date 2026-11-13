'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Multi-CLI Binary Dispatcher Engine
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let ResourceGraph;
try {
  ResourceGraph = require('./resourceGraph').ResourceGraph;
} catch {
  ResourceGraph = (typeof globalThis !== 'undefined' && globalThis.ResourceGraph);
}

let ControllerManager;
try {
  ControllerManager = require('./controllerManager').ControllerManager;
} catch {
  ControllerManager = (typeof globalThis !== 'undefined' && globalThis.ControllerManager);
}

let SchedulerEngine;
try {
  SchedulerEngine = require('./schedulerEngine').SchedulerEngine;
} catch {
  SchedulerEngine = (typeof globalThis !== 'undefined' && globalThis.SchedulerEngine);
}

let NetworkingEngine;
try {
  NetworkingEngine = require('./networkingEngine').NetworkingEngine;
} catch {
  NetworkingEngine = (typeof globalThis !== 'undefined' && globalThis.NetworkingEngine);
}

let VirtualFileSystem;
try {
  VirtualFileSystem = require('./virtualFileSystem').VirtualFileSystem;
} catch {
  VirtualFileSystem = (typeof globalThis !== 'undefined' && globalThis.VirtualFileSystem);
}

let yamlParser;
try {
  yamlParser = require('./yamlParser');
} catch {
  yamlParser = (typeof globalThis !== 'undefined' && globalThis.yamlParser) || {};
}

let jsonPath;
try {
  jsonPath = require('./jsonPath');
} catch {
  jsonPath = (typeof globalThis !== 'undefined' && globalThis.jsonPath) || {};
}

let cloudExtensions;
try {
  cloudExtensions = require('./cloudExtensions');
} catch {
  cloudExtensions = (typeof globalThis !== 'undefined' && globalThis.cloudExtensions) || {};
}

// ---------------------------------------------------------------------------
// Kind Alias & Normalization Map
// ---------------------------------------------------------------------------

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
  job: 'Job',
  jobs: 'Job',
  cj: 'CronJob',
  cronjob: 'CronJob',
  cronjobs: 'CronJob',
  svc: 'Service',
  service: 'Service',
  services: 'Service',
  ep: 'Endpoints',
  endpoints: 'Endpoints',
  endpointslice: 'EndpointSlice',
  endpointslices: 'EndpointSlice',
  cm: 'ConfigMap',
  configmap: 'ConfigMap',
  configmaps: 'ConfigMap',
  secret: 'Secret',
  secrets: 'Secret',
  pv: 'PersistentVolume',
  persistentvolume: 'PersistentVolume',
  persistentvolumes: 'PersistentVolume',
  pvc: 'PersistentVolumeClaim',
  persistentvolumeclaim: 'PersistentVolumeClaim',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  sc: 'StorageClass',
  storageclass: 'StorageClass',
  storageclasses: 'StorageClass',
  ing: 'Ingress',
  ingress: 'Ingress',
  ingresses: 'Ingress',
  ns: 'Namespace',
  namespace: 'Namespace',
  namespaces: 'Namespace',
  no: 'Node',
  node: 'Node',
  nodes: 'Node',
  netpol: 'NetworkPolicy',
  networkpolicy: 'NetworkPolicy',
  networkpolicies: 'NetworkPolicy',
  cr: 'ClusterRole',
  clusterrole: 'ClusterRole',
  clusterroles: 'ClusterRole',
  crb: 'ClusterRoleBinding',
  clusterrolebinding: 'ClusterRoleBinding',
  clusterrolebindings: 'ClusterRoleBinding',
  role: 'Role',
  roles: 'Role',
  rb: 'RoleBinding',
  rolebinding: 'RoleBinding',
  rolebindings: 'RoleBinding',
  sa: 'ServiceAccount',
  serviceaccount: 'ServiceAccount',
  serviceaccounts: 'ServiceAccount',
  hpa: 'HorizontalPodAutoscaler',
  horizontalpodautoscaler: 'HorizontalPodAutoscaler',
  pdb: 'PodDisruptionBudget',
  poddisruptionbudget: 'PodDisruptionBudget'
};

function normalizeKind(raw) {
  if (!raw) return 'Pod';
  const clean = raw.toLowerCase().trim();
  return KIND_ALIASES[clean] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

// ---------------------------------------------------------------------------
// MultiCliDispatcher Class
// ---------------------------------------------------------------------------

class MultiCliDispatcher {
  constructor(options = {}) {
    this.graph = options.graph || (ResourceGraph ? new ResourceGraph() : null);
    this.controllerManager = options.controllerManager || (ControllerManager && this.graph ? new ControllerManager(this.graph) : null);
    this.vfs = options.vfs || (VirtualFileSystem ? new VirtualFileSystem() : null);
    this.scheduler = options.scheduler || (SchedulerEngine && this.graph ? new SchedulerEngine(this.graph) : null);
    this.networking = options.networking || (NetworkingEngine && this.graph ? new NetworkingEngine(this.graph) : null);

    // Initialize Cloud Extensions
    const HelmReleaseManager = cloudExtensions.HelmReleaseManager;
    const ArgoCDController = cloudExtensions.ArgoCDController;
    const IstioMeshEngine = cloudExtensions.IstioMeshEngine;
    const OpenTofuStateGraph = cloudExtensions.OpenTofuStateGraph;
    const MultiCloudRegistry = cloudExtensions.MultiCloudRegistry;

    this.helm = options.helm || (HelmReleaseManager && this.graph ? new HelmReleaseManager(this.graph) : null);
    this.argocd = options.argocd || (ArgoCDController && this.graph ? new ArgoCDController(this.graph) : null);
    this.istio = options.istio || (IstioMeshEngine ? new IstioMeshEngine() : null);
    this.tofu = options.tofu || (OpenTofuStateGraph ? new OpenTofuStateGraph() : null);
    this.cloudRegistry = options.cloudRegistry || (MultiCloudRegistry ? new MultiCloudRegistry() : null);

    // Seed base cluster infrastructure if empty
    this._bootstrapDefaultResources();
  }

  _bootstrapDefaultResources() {
    if (!this.graph) return;

    // Default Namespaces
    const namespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
    for (const ns of namespaces) {
      if (!this.graph.get('Namespace', null, ns)) {
        this.graph.create({
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: { name: ns, creationTimestamp: new Date().toISOString() },
          status: { phase: 'Active' }
        });
      }
    }

    // Default Cluster Nodes
    const defaultNodes = [
      { name: 'control-plane-node', role: 'control-plane', ip: '192.168.1.10' },
      { name: 'worker-node-1', role: 'worker', ip: '192.168.1.11' },
      { name: 'worker-node-2', role: 'worker', ip: '192.168.1.12' }
    ];

    for (const n of defaultNodes) {
      if (!this.graph.get('Node', null, n.name)) {
        this.graph.create({
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: n.name,
            labels: {
              'kubernetes.io/hostname': n.name,
              'kubernetes.io/os': 'linux',
              'kubernetes.io/arch': 'amd64',
              [`node-role.kubernetes.io/${n.role}`]: ''
            },
            creationTimestamp: new Date().toISOString()
          },
          status: {
            conditions: [
              { type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }
            ],
            addresses: [
              { type: 'InternalIP', address: n.ip },
              { type: 'Hostname', address: n.name }
            ],
            nodeInfo: {
              kubeletVersion: 'v1.31.0',
              osImage: 'Ubuntu 24.04 LTS',
              containerRuntimeVersion: 'containerd://1.7.15'
            }
          }
        });
      }
    }

    // Default Control Plane Pods
    const systemPods = [
      { name: 'kube-apiserver-control-plane', component: 'kube-apiserver', ip: '192.168.1.10' },
      { name: 'etcd-control-plane', component: 'etcd', ip: '192.168.1.10' },
      { name: 'kube-controller-manager-control-plane', component: 'kube-controller-manager', ip: '192.168.1.10' },
      { name: 'kube-scheduler-control-plane', component: 'kube-scheduler', ip: '192.168.1.10' },
      { name: 'coredns-7c65d6cfc9-abc12', component: 'coredns', ip: '10.244.0.2' },
      { name: 'coredns-7c65d6cfc9-xyz99', component: 'coredns', ip: '10.244.1.2' },
      { name: 'kube-proxy-m4n8r', component: 'kube-proxy', ip: '192.168.1.10' }
    ];

    for (const p of systemPods) {
      if (!this.graph.get('Pod', 'kube-system', p.name)) {
        this.graph.create({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: p.name,
            namespace: 'kube-system',
            labels: { 'k8s-app': p.component, 'tier': 'control-plane' },
            creationTimestamp: new Date().toISOString()
          },
          spec: {
            nodeName: 'control-plane-node',
            containers: [{ name: p.component, image: `registry.k8s.io/${p.component}:v1.31.0` }]
          },
          status: {
            phase: 'Running',
            podIP: p.ip,
            hostIP: '192.168.1.10',
            containerStatuses: [
              { name: p.component, ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } } }
            ]
          }
        });
      }
    }

    // Default Kubernetes Core Services
    if (!this.graph.get('Service', 'default', 'kubernetes')) {
      this.graph.create({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'kubernetes', namespace: 'default' },
        spec: {
          type: 'ClusterIP',
          clusterIP: '10.96.0.1',
          ports: [{ name: 'https', port: 443, targetPort: 6443, protocol: 'TCP' }]
        }
      });
    }

    if (!this.graph.get('Service', 'kube-system', 'kube-dns')) {
      this.graph.create({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'kube-dns', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } },
        spec: {
          type: 'ClusterIP',
          clusterIP: '10.96.0.10',
          ports: [
            { name: 'dns', port: 53, protocol: 'UDP' },
            { name: 'dns-tcp', port: 53, protocol: 'TCP' }
          ]
        }
      });
    }

    // Default StorageClass
    if (!this.graph.get('StorageClass', null, 'standard')) {
      this.graph.create({
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: {
          name: 'standard',
          annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' }
        },
        provisioner: 'rancher.io/local-path',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'WaitForFirstConsumer'
      });
    }
  }

  /**
   * Registers all CLI commands into the given PipelineDriver instance
   */
  registerTo(pipelineDriver) {
    if (!pipelineDriver || typeof pipelineDriver.registerCommand !== 'function') {
      throw new Error('Valid PipelineDriver instance required to register CLIs');
    }

    const boundKubectl = this.handleKubectl.bind(this);
    pipelineDriver.registerCommand('kubectl', boundKubectl);
    pipelineDriver.registerCommand('k', boundKubectl);

    pipelineDriver.registerCommand('helm', this.handleHelm.bind(this));
    pipelineDriver.registerCommand('docker', this.handleDocker.bind(this));
    pipelineDriver.registerCommand('crictl', this.handleDocker.bind(this));
    pipelineDriver.registerCommand('argocd', this.handleArgoCD.bind(this));
    pipelineDriver.registerCommand('istioctl', this.handleIstioctl.bind(this));
    pipelineDriver.registerCommand('tofu', this.handleTofu.bind(this));
    pipelineDriver.registerCommand('terraform', this.handleTofu.bind(this));
    pipelineDriver.registerCommand('aws', this.handleAws.bind(this));
    pipelineDriver.registerCommand('az', this.handleAzure.bind(this));
    pipelineDriver.registerCommand('gcloud', this.handleGcloud.bind(this));
    pipelineDriver.registerCommand('trivy', this.handleTrivy.bind(this));
    pipelineDriver.registerCommand('falco', this.handleFalco.bind(this));
    pipelineDriver.registerCommand('cosign', this.handleCosign.bind(this));
    pipelineDriver.registerCommand('aiops', this.handleAiOps.bind(this));
    pipelineDriver.registerCommand('etcdctl', this.handleEtcdctl.bind(this));
    pipelineDriver.registerCommand('kubeadm', this.handleKubeadm.bind(this));
    pipelineDriver.registerCommand('cilium', this.handleCilium.bind(this));
    pipelineDriver.registerCommand('linkerd', this.handleLinkerd.bind(this));
    pipelineDriver.registerCommand('flux', this.handleFlux.bind(this));
    pipelineDriver.registerCommand('velero', this.handleVelero.bind(this));
    pipelineDriver.registerCommand('vcluster', this.handleVcluster.bind(this));
    pipelineDriver.registerCommand('curl', this.handleCurl.bind(this));
    pipelineDriver.registerCommand('dig', this.handleDig.bind(this));
    pipelineDriver.registerCommand('nslookup', this.handleNslookup.bind(this));
    pipelineDriver.registerCommand('traceroute', this.handleTraceroute.bind(this));
    pipelineDriver.registerCommand('ip', this.handleIp.bind(this));
    pipelineDriver.registerCommand('ss', this.handleSs.bind(this));
    pipelineDriver.registerCommand('ping', this.handlePing.bind(this));
    pipelineDriver.registerCommand('ps', this.handlePs.bind(this));
    pipelineDriver.registerCommand('top', this.handleTop.bind(this));
    pipelineDriver.registerCommand('df', this.handleDf.bind(this));
    pipelineDriver.registerCommand('free', this.handleFree.bind(this));
    pipelineDriver.registerCommand('uname', this.handleUname.bind(this));
    pipelineDriver.registerCommand('whoami', () => ({ stdout: 'learner\n', stderr: '', code: 0 }));
    pipelineDriver.registerCommand('id', () => ({ stdout: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),999(docker)\n', stderr: '', code: 0 }));
  }

  // -------------------------------------------------------------------------
  // 1. KUBECTL / K CLI HANDLER
  // -------------------------------------------------------------------------

  handleKubectl({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
    const subcmd = argv[1];
    if (!subcmd) {
      return {
        stdout: 'kubectl controls the Kubernetes cluster manager.\nFind more information at: https://kubernetes.io/docs/reference/kubectl/\n',
        stderr: '',
        code: 0
      };
    }

    // Common flag parsing
    let namespace = 'default';
    let allNamespaces = false;
    let outputFormat = null;
    let selector = null;
    let filename = null;
    let replicas = null;
    let dryRun = false;
    const restArgs = [];

    for (let i = 2; i < argv.length; i++) {
      const a = argv[i];
      if (a === '-n' || a === '--namespace') {
        namespace = argv[++i] || 'default';
      } else if (a.startsWith('--namespace=')) {
        namespace = a.split('=')[1];
      } else if (a === '-A' || a === '--all-namespaces') {
        allNamespaces = true;
      } else if (a === '-o' || a === '--output') {
        outputFormat = argv[++i];
      } else if (a.startsWith('-o=')) {
        outputFormat = a.slice(3);
      } else if (a === '-l' || a === '--selector') {
        selector = argv[++i];
      } else if (a.startsWith('-l=')) {
        selector = a.slice(3);
      } else if (a === '-f' || a === '--filename') {
        filename = argv[++i];
      } else if (a.startsWith('-f=')) {
        filename = a.slice(3);
      } else if (a.startsWith('--replicas=')) {
        replicas = parseInt(a.split('=')[1], 10);
      } else if (a === '--replicas') {
        replicas = parseInt(argv[++i], 10);
      } else if (a === '--dry-run=client' || a === '--dry-run') {
        dryRun = true;
      } else {
        restArgs.push(a);
      }
    }

    switch (subcmd) {
      case 'get':
        return this._kubectlGet({ restArgs, namespace, allNamespaces, outputFormat, selector });
      case 'describe':
        return this._kubectlDescribe({ restArgs, namespace });
      case 'apply':
        return this._kubectlApply({ filename, stdin, vfs, cwd, dryRun });
      case 'create':
        return this._kubectlCreate({ restArgs, namespace, filename, stdin, vfs, cwd, replicas });
      case 'delete':
        return this._kubectlDelete({ restArgs, namespace, filename, stdin, vfs, cwd });
      case 'scale':
        return this._kubectlScale({ restArgs, namespace, replicas });
      case 'rollout':
        return this._kubectlRollout({ restArgs, namespace });
      case 'logs':
        return this._kubectlLogs({ restArgs, namespace });
      case 'exec':
        return this._kubectlExec({ restArgs, namespace });
      case 'patch':
        return this._kubectlPatch({ restArgs, namespace });
      case 'label':
        return this._kubectlLabel({ restArgs, namespace });
      case 'annotate':
        return this._kubectlAnnotate({ restArgs, namespace });
      case 'cordon':
      case 'uncordon':
        return this._kubectlCordon(subcmd === 'cordon', restArgs);
      case 'drain':
        return this._kubectlDrain(restArgs);
      case 'auth':
        return this._kubectlAuth({ restArgs, namespace });
      case 'top':
        return this._kubectlTop({ restArgs, namespace });
      case 'edit':
        return this._kubectlEdit({ restArgs, namespace });
      case 'autoscale':
        return this._kubectlAutoscale({ restArgs, namespace });
      case 'diff':
        return this._kubectlDiff({ filename, stdin, vfs, cwd });
      case 'wait':
        return this._kubectlWait({ restArgs, namespace });
      case 'debug':
        return this._kubectlDebug({ restArgs, namespace });
      case 'taint':
        return this._kubectlTaint({ restArgs });
      case 'config':
        return this._kubectlConfig({ restArgs, vfs, cwd });
      case 'explain':
        return this._kubectlExplain({ restArgs });
      case 'cluster-info':
        return {
          stdout: 'Kubernetes control plane is running at https://192.168.1.10:6443\nCoreDNS is running at https://192.168.1.10:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n',
          stderr: '',
          code: 0
        };
      case 'version':
        return {
          stdout: 'Client Version: v1.31.0\nKustomize Version: v5.4.2\nServer Version: v1.31.0\n',
          stderr: '',
          code: 0
        };
      default:
        return { stdout: '', stderr: `error: unknown command "${subcmd}" for "kubectl"\n`, code: 1 };
    }
  }

  _kubectlGet({ restArgs, namespace, allNamespaces, outputFormat, selector }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    const rawKind = restArgs[0];
    if (!rawKind) {
      return { stdout: '', stderr: 'error: You must specify the type of resource to get.\n', code: 1 };
    }

    const kind = normalizeKind(rawKind);
    const targetName = restArgs[1] || null;

    const CLUSTER_SCOPED_KINDS = new Set([
      'Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding',
      'PersistentVolume', 'StorageClass', 'CustomResourceDefinition',
      'PriorityClass', 'APIService'
    ]);
    const isCluster = CLUSTER_SCOPED_KINDS.has(kind);
    const targetNs = isCluster || allNamespaces ? null : namespace;

    let resources = [];
    if (targetName) {
      const single = isCluster
        ? this.graph.get(kind, null, targetName)
        : allNamespaces
          ? this.graph.list(kind).find((r) => r.metadata?.name === targetName)
          : this.graph.get(kind, namespace, targetName);
      if (single) resources = [single];
    } else {
      resources = this.graph.list(kind, targetNs, selector);
    }

    if (targetName && resources.length === 0) {
      return { stdout: '', stderr: `Error from server (NotFound): ${rawKind} "${targetName}" not found\n`, code: 1 };
    }

    // Format output
    if (outputFormat === 'json') {
      const outputObj = targetName ? resources[0] : {
        apiVersion: 'v1',
        kind: 'List',
        items: resources
      };
      return { stdout: JSON.stringify(outputObj, null, 2) + '\n', stderr: '', code: 0 };
    }

    if (outputFormat === 'yaml') {
      const outputObj = targetName ? resources[0] : {
        apiVersion: 'v1',
        kind: 'List',
        items: resources
      };
      const yamlStr = yamlParser.stringifyYaml ? yamlParser.stringifyYaml(outputObj) : JSON.stringify(outputObj, null, 2);
      return { stdout: yamlStr + '\n', stderr: '', code: 0 };
    }

    if (outputFormat === 'name') {
      const names = resources.map((r) => `${kind.toLowerCase()}.${r.apiVersion || 'v1'}/${r.metadata.name}`);
      return { stdout: names.length > 0 ? names.join('\n') + '\n' : 'No resources found.\n', stderr: '', code: 0 };
    }

    if (outputFormat && outputFormat.startsWith('jsonpath=')) {
      const expr = outputFormat.slice('jsonpath='.length).replace(/^['"]|['"]$/g, '');
      const doc = targetName ? resources[0] : { items: resources };
      let formatted = '';
      if (jsonPath.formatJsonPath) {
        formatted = jsonPath.formatJsonPath(doc, expr.startsWith('{') ? expr : `{${expr}}`);
      } else if (jsonPath.jsonPath) {
        const clean = expr.replace(/^\{|\}$/g, '');
        const raw = jsonPath.jsonPath(doc, clean.startsWith('$') ? clean : `$.${clean.replace(/^\./, '')}`);
        formatted = Array.isArray(raw) ? raw.join(' ') : String(raw !== undefined && raw !== null ? raw : '');
      }
      return { stdout: formatted + '\n', stderr: '', code: 0 };
    }

    // Default Tabular Format
    if (resources.length === 0) {
      const scopeMsg = isCluster || allNamespaces ? 'No resources found' : `No resources found in ${namespace} namespace.`;
      return { stdout: `${scopeMsg}\n`, stderr: '', code: 0 };
    }

    let table = '';
    const isWide = outputFormat === 'wide';

    if (kind === 'Pod') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(isWide ? ['IP', 'NODE'] : [])]
        : ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(isWide ? ['IP', 'NODE'] : [])];

      const rows = resources.map((p) => {
        const statuses = p.status?.containerStatuses || [];
        const readyCount = statuses.filter((c) => c.ready).length;
        const totalCount = statuses.length || (p.spec?.containers || []).length || 1;
        const restarts = statuses.reduce((acc, c) => acc + (c.restartCount || 0), 0);
        const status = p.status?.phase || 'Pending';
        const age = '2d';
        const row = [
          p.metadata?.name,
          `${readyCount}/${totalCount}`,
          status,
          String(restarts),
          age
        ];
        if (allNamespaces) row.unshift(p.metadata?.namespace || 'default');
        if (isWide) {
          row.push(p.status?.podIP || '<none>');
          row.push(p.spec?.nodeName || '<none>');
        }
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'Deployment') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE']
        : ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'];

      const rows = resources.map((d) => {
        const ready = d.status?.readyReplicas || 0;
        const total = d.spec?.replicas || 0;
        const updated = d.status?.updatedReplicas || ready;
        const avail = d.status?.availableReplicas || ready;
        const row = [d.metadata?.name, `${ready}/${total}`, String(updated), String(avail), '5d'];
        if (allNamespaces) row.unshift(d.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'Service') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE']
        : ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'];

      const rows = resources.map((s) => {
        const type = s.spec?.type || 'ClusterIP';
        const ip = s.spec?.clusterIP || '<none>';
        const ext = s.status?.loadBalancer?.ingress?.[0]?.ip || '<none>';
        const ports = (s.spec?.ports || []).map((p) => `${p.port}/${p.protocol || 'TCP'}`).join(',');
        const row = [s.metadata?.name, type, ip, ext, ports || '<none>', '10d'];
        if (allNamespaces) row.unshift(s.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'Node') {
      const headers = ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'];
      const rows = resources.map((n) => {
        const readyCond = (n.status?.conditions || []).find((c) => c.type === 'Ready');
        const status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';
        const roles = Object.keys(n.metadata?.labels || {})
          .filter((k) => k.startsWith('node-role.kubernetes.io/'))
          .map((k) => k.split('/')[1])
          .join(',') || '<none>';
        return [n.metadata?.name, status, roles, '30d', n.status?.nodeInfo?.kubeletVersion || 'v1.31.0'];
      });
      table = this._formatTable(headers, rows);
    } else {
      // Generic resource table
      const headers = allNamespaces ? ['NAMESPACE', 'NAME', 'AGE'] : ['NAME', 'AGE'];
      const rows = resources.map((r) => {
        const row = [r.metadata?.name, '1d'];
        if (allNamespaces) row.unshift(r.metadata?.namespace || 'default');
        return row;
      });
      table = this._formatTable(headers, rows);
    }

    return { stdout: table + '\n', stderr: '', code: 0 };
  }

  _kubectlDescribe({ restArgs, namespace }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    const rawKind = restArgs[0];
    const name = restArgs[1];
    if (!rawKind || !name) {
      return { stdout: '', stderr: 'error: resource type and name required for describe\n', code: 1 };
    }

    const kind = normalizeKind(rawKind);
    const res = this.graph.get(kind, namespace, name) || this.graph.get(kind, null, name);
    if (!res) {
      return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
    }

    const labels = Object.entries(res.metadata?.labels || {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n                            ') || '<none>';

    const out = [
      `Name:         ${res.metadata?.name}`,
      `Namespace:    ${res.metadata?.namespace || '<none>'}`,
      `Labels:       ${labels}`,
      `Annotations:  <none>`,
      `Status:       ${res.status?.phase || 'Active'}`,
      `Events:       <none>`
    ].join('\n');

    return { stdout: out + '\n', stderr: '', code: 0 };
  }

  _kubectlApply({ filename, stdin, vfs, cwd, dryRun }) {
    let manifestContent = '';
    if (filename === '-' || (!filename && stdin)) {
      manifestContent = stdin;
    } else if (filename) {
      if (!vfs) return { stdout: '', stderr: `Error: VFS not accessible to read ${filename}\n`, code: 1 };
      try {
        const p = vfs.normalizePath(filename, cwd);
        manifestContent = vfs.readFile(p);
      } catch (err) {
        return { stdout: '', stderr: `error: the path "${filename}" does not exist\n`, code: 1 };
      }
    } else {
      return { stdout: '', stderr: 'error: you must specify a filename or pass via stdin with -f -\n', code: 1 };
    }

    let parsedDocs = [];
    try {
      if (yamlParser.parseYaml) {
        parsedDocs = yamlParser.parseYaml(manifestContent);
      } else {
        parsedDocs = [JSON.parse(manifestContent)];
      }
    } catch (err) {
      return { stdout: '', stderr: `error: error parsing manifest: ${err.message}\n`, code: 1 };
    }

    const docs = Array.isArray(parsedDocs) ? parsedDocs : [parsedDocs];
    const outputLines = [];

    for (const doc of docs) {
      if (!doc || !doc.kind || !doc.metadata?.name) continue;
      const kind = doc.kind;
      const ns = doc.metadata?.namespace || 'default';
      const name = doc.metadata.name;

      if (dryRun) {
        outputLines.push(`${kind.toLowerCase()}.${doc.apiVersion || 'v1'}/${name} created (dry run)`);
        continue;
      }

      const group = doc.apiVersion && doc.apiVersion.includes('/')
        ? doc.apiVersion.split('/')[0]
        : (doc.kind === 'Deployment' || doc.kind === 'ReplicaSet' || doc.kind === 'StatefulSet' || doc.kind === 'DaemonSet' ? 'apps' : '');
      const resId = group ? `${kind.toLowerCase()}.${group}/${name}` : `${kind.toLowerCase()}/${name}`;

      const existing = this.graph.get(kind, ns, name) || this.graph.get(kind, null, name);
      if (existing) {
        this.graph.update(doc);
        outputLines.push(`${resId} configured`);
      } else {
        this.graph.create(doc);
        outputLines.push(`${resId} created`);
      }
    }

    // Trigger reconciliation
    if (!dryRun && this.controllerManager) {
      this.controllerManager.reconcile();
    }

    return { stdout: outputLines.join('\n') + '\n', stderr: '', code: 0 };
  }

  _kubectlCreate({ restArgs, namespace, filename, stdin, vfs, cwd, replicas }) {
    if (filename) {
      return this._kubectlApply({ filename, stdin, vfs, cwd, dryRun: false });
    }

    const sub = restArgs[0];
    if (sub === 'namespace' || sub === 'ns') {
      const name = restArgs[1];
      if (!name) return { stdout: '', stderr: 'error: namespace name required\n', code: 1 };
      this.graph.create({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name },
        status: { phase: 'Active' }
      });
      return { stdout: `namespace/${name} created\n`, stderr: '', code: 0 };
    }

    if (sub === 'deployment') {
      const name = restArgs[1];
      let image = 'nginx:latest';
      for (const a of restArgs) {
        if (a.startsWith('--image=')) image = a.split('=')[1];
      }
      this.graph.create({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace },
        spec: {
          replicas: replicas !== null ? replicas : 1,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels: { app: name } },
            spec: { containers: [{ name, image }] }
          }
        }
      });
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `deployment.apps/${name} created\n`, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `error: unknown create subcommand "${sub}"\n`, code: 1 };
  }

  _kubectlDelete({ restArgs, namespace, filename, stdin, vfs, cwd }) {
    if (filename) {
      // Delete from manifest
      let content = '';
      if (filename === '-' && stdin) content = stdin;
      else if (vfs) {
        try { content = vfs.readFile(vfs.normalizePath(filename, cwd)); } catch {}
      }
      if (content && yamlParser.parseYaml) {
        const docs = [].concat(yamlParser.parseYaml(content));
        for (const doc of docs) {
          if (doc?.kind && doc.metadata?.name) {
            this.graph.delete(doc.kind, doc.metadata.namespace || namespace, doc.metadata.name);
          }
        }
        if (this.controllerManager) this.controllerManager.reconcile();
        return { stdout: 'resources deleted\n', stderr: '', code: 0 };
      }
    }

    const rawKind = restArgs[0];
    const name = restArgs[1];
    if (!rawKind || !name) {
      return { stdout: '', stderr: 'error: resource type and name required for delete\n', code: 1 };
    }

    const kind = normalizeKind(rawKind);
    const deleted = this.graph.delete(kind, namespace, name) || this.graph.delete(kind, null, name);
    if (deleted) {
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()} "${name}" deleted\n`, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
  }

  _kubectlScale({ restArgs, namespace, replicas }) {
    const target = restArgs[0] || '';
    let kind = 'Deployment';
    let name = target;

    if (target.includes('/')) {
      const parts = target.split('/');
      kind = normalizeKind(parts[0]);
      name = parts[1];
    } else if (restArgs.length >= 2) {
      kind = normalizeKind(restArgs[0]);
      name = restArgs[1];
    }

    if (replicas === null || isNaN(replicas)) {
      return { stdout: '', stderr: 'error: --replicas must be specified\n', code: 1 };
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) {
      return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
    }

    res.spec = res.spec || {};
    res.spec.replicas = replicas;
    this.graph.update(res);

    if (this.controllerManager) this.controllerManager.reconcile();
    return { stdout: `${kind.toLowerCase()}.apps/${name} scaled\n`, stderr: '', code: 0 };
  }

  _kubectlRollout({ restArgs, namespace }) {
    const sub = restArgs[0];
    const target = restArgs[1] || '';
    let kind = 'Deployment';
    let name = target;
    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) {
      return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
    }

    if (sub === 'status') {
      return { stdout: `deployment "${name}" successfully rolled out\n`, stderr: '', code: 0 };
    }

    if (sub === 'restart') {
      res.spec.template.metadata = res.spec.template.metadata || {};
      res.spec.template.metadata.annotations = res.spec.template.metadata.annotations || {};
      res.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `deployment.apps/${name} restarted\n`, stderr: '', code: 0 };
    }

    if (sub === 'history') {
      return {
        stdout: `deployment.apps/${name}\nREVISION  CHANGE-CAUSE\n1         <none>\n2         kubectl rollout restart\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'undo') {
      return { stdout: `deployment.apps/${name} rolled back\n`, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `error: unknown rollout subcommand "${sub}"\n`, code: 1 };
  }

  _kubectlLogs({ restArgs, namespace }) {
    const podName = restArgs[0];
    if (!podName) return { stdout: '', stderr: 'error: pod name required for logs\n', code: 1 };

    const pod = this.graph.get('Pod', namespace, podName);
    if (!pod) return { stdout: '', stderr: `Error from server (NotFound): pods "${podName}" not found\n`, code: 1 };

    const sampleLog = `[INFO] 2026-11-12T16:00:00Z Starting ${podName}...\n[INFO] 2026-11-12T16:00:01Z Listening on port 8080\n[INFO] 2026-11-12T16:00:02Z Health checks passing.\n`;
    return { stdout: sampleLog, stderr: '', code: 0 };
  }

  _kubectlExec({ restArgs, namespace }) {
    const podName = restArgs[0];
    const dDash = restArgs.indexOf('--');
    const cmd = dDash !== -1 ? restArgs.slice(dDash + 1).join(' ') : 'sh';

    return { stdout: `Executing '${cmd}' in pod ${podName} (${namespace}):\nOK\n`, stderr: '', code: 0 };
  }

  _kubectlPatch({ restArgs, namespace }) {
    const target = restArgs[0] || '';
    let patchJson = '';
    for (let i = 1; i < restArgs.length; i++) {
      if (restArgs[i] === '-p' || restArgs[i] === '--patch') patchJson = restArgs[++i];
      else if (restArgs[i].startsWith('-p=')) patchJson = restArgs[i].slice(3);
    }

    let kind = 'Deployment';
    let name = target;
    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
    } else if (restArgs.length >= 2 && !restArgs[1].startsWith('-')) {
      kind = normalizeKind(restArgs[0]);
      name = restArgs[1];
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) return { stdout: '', stderr: `Error: ${kind} "${name}" not found\n`, code: 1 };

    try {
      const parsedPatch = JSON.parse(patchJson);
      this.graph.patch(kind, namespace, name, parsedPatch);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()}.${res.apiVersion || 'v1'}/${name} patched\n`, stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `error: invalid patch JSON: ${err.message}\n`, code: 1 };
    }
  }

  _kubectlLabel({ restArgs, namespace }) {
    const target = restArgs[0];
    const kv = restArgs[1];
    if (!target || !kv || !kv.includes('=')) {
      return { stdout: '', stderr: 'error: label requires target and key=val\n', code: 1 };
    }
    const [k, v] = kv.split('=');
    let kind = 'Pod';
    let name = target;
    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
    }
    const res = this.graph.get(kind, namespace, name);
    if (!res) return { stdout: '', stderr: `Error: ${kind} "${name}" not found\n`, code: 1 };
    res.metadata = res.metadata || {};
    res.metadata.labels = res.metadata.labels || {};
    res.metadata.labels[k] = v;
    this.graph.update(res);
    return { stdout: `${kind.toLowerCase()}/${name} labeled\n`, stderr: '', code: 0 };
  }

  _kubectlAnnotate({ restArgs, namespace }) {
    const target = restArgs[0];
    const kv = restArgs[1];
    if (!target || !kv || !kv.includes('=')) {
      return { stdout: '', stderr: 'error: annotate requires target and key=val\n', code: 1 };
    }
    const [k, v] = kv.split('=');
    let kind = 'Pod';
    let name = target;
    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
    }
    const res = this.graph.get(kind, namespace, name);
    if (!res) return { stdout: '', stderr: `Error: ${kind} "${name}" not found\n`, code: 1 };
    res.metadata = res.metadata || {};
    res.metadata.annotations = res.metadata.annotations || {};
    res.metadata.annotations[k] = v;
    this.graph.update(res);
    return { stdout: `${kind.toLowerCase()}/${name} annotated\n`, stderr: '', code: 0 };
  }

  _kubectlCordon(cordon, restArgs) {
    const nodeName = restArgs[0];
    if (!nodeName) return { stdout: '', stderr: 'error: node name required\n', code: 1 };
    const node = this.graph.get('Node', null, nodeName);
    if (!node) return { stdout: '', stderr: `Error: node "${nodeName}" not found\n`, code: 1 };
    node.spec = node.spec || {};
    node.spec.unschedulable = cordon;
    this.graph.update(node);
    return { stdout: `node/${nodeName} ${cordon ? 'cordoned' : 'uncordoned'}\n`, stderr: '', code: 0 };
  }

  _kubectlDrain(restArgs) {
    let nodeName = null;
    let force = false;
    let ignoreDaemonSets = false;

    for (const arg of restArgs) {
      if (arg === '--force') {
        force = true;
      } else if (arg === '--ignore-daemonsets' || arg === '--ignore-daemonsets=true') {
        ignoreDaemonSets = true;
      } else if (!arg.startsWith('-') && !nodeName) {
        nodeName = arg;
      }
    }

    if (!nodeName) return { stdout: '', stderr: 'error: node name required\n', code: 1 };
    const node = this.graph.get('Node', null, nodeName);
    if (!node) return { stdout: '', stderr: `Error: node "${nodeName}" not found\n`, code: 1 };

    if (this.scheduler && typeof this.scheduler.drainNode === 'function') {
      const res = this.scheduler.drainNode(nodeName, { force, ignoreDaemonSets });
      if (!res.success) {
        return { stdout: `node/${nodeName} cordoned\n`, stderr: `error: ${res.error}\n`, code: 1 };
      }
      const evictMsg = (res.evicted && res.evicted.length > 0)
        ? `evicting pods on node "${nodeName}"\n`
        : '';
      return { stdout: `node/${nodeName} cordoned\n${evictMsg}node/${nodeName} drained\n`, stderr: '', code: 0 };
    }

    node.spec = node.spec || {};
    node.spec.unschedulable = true;
    this.graph.update(node);
    return { stdout: `node/${nodeName} cordoned\nevicting pods on node "${nodeName}"\nnode/${nodeName} drained\n`, stderr: '', code: 0 };
  }

  _kubectlAuth({ restArgs, namespace }) {
    if (restArgs[0] === 'can-i') {
      const verb = restArgs[1];
      const resource = restArgs[2];
      if (this.controllerManager && typeof this.controllerManager.can === 'function') {
        const allowed = this.controllerManager.can({
          verb,
          resource,
          namespace
        });
        return { stdout: allowed ? 'yes\n' : 'no\n', stderr: '', code: 0 };
      }
      return { stdout: 'yes\n', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: 'error: unknown auth command\n', code: 1 };
  }

  _kubectlTop({ restArgs, namespace }) {
    const sub = restArgs[0] || 'node';
    if (sub === 'node' || sub === 'nodes') {
      const headers = ['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'];
      const rows = [
        ['control-plane-node', '250m', '12%', '1420Mi', '35%'],
        ['worker-node-1', '410m', '20%', '2100Mi', '52%'],
        ['worker-node-2', '320m', '16%', '1850Mi', '46%']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }
    if (sub === 'pod' || sub === 'pods') {
      const headers = ['NAME', 'CPU(cores)', 'MEMORY(bytes)'];
      const rows = [
        ['coredns-7c65d6cfc9-abc12', '4m', '18Mi'],
        ['coredns-7c65d6cfc9-xyz99', '3m', '17Mi'],
        ['kube-apiserver-control-plane', '45m', '310Mi']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: 'error: top supports node or pod\n', code: 1 };
  }

  _kubectlEdit({ restArgs, namespace }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    let rawKind = restArgs[0];
    let targetName = restArgs[1];
    if (rawKind && rawKind.includes('/')) {
      const parts = rawKind.split('/');
      rawKind = parts[0];
      targetName = parts[1];
    }
    if (!rawKind || !targetName) {
      return { stdout: '', stderr: 'error: A resource type and name must be specified to edit\n', code: 1 };
    }
    const kind = normalizeKind(rawKind);
    const res = this.graph.get(kind, namespace, targetName);
    if (!res) {
      return { stdout: '', stderr: `Error from server (NotFound): ${rawKind} "${targetName}" not found\n`, code: 1 };
    }
    res.metadata = res.metadata || {};
    res.metadata.annotations = res.metadata.annotations || {};
    res.metadata.annotations['kubectl.kubernetes.io/last-edited'] = new Date().toISOString();
    this.graph.set(res);
    return { stdout: `${rawKind.toLowerCase()}/${targetName} edited\n`, stderr: '', code: 0 };
  }

  _kubectlAutoscale({ restArgs, namespace }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    let rawTarget = restArgs[0];
    let targetKind = 'Deployment';
    let targetName = null;

    if (rawTarget && rawTarget.includes('/')) {
      const parts = rawTarget.split('/');
      targetKind = normalizeKind(parts[0]);
      targetName = parts[1];
    } else if (rawTarget) {
      targetKind = normalizeKind(rawTarget);
      targetName = restArgs[1];
    }

    if (!targetName) {
      return { stdout: '', stderr: 'error: A resource type and name must be specified to autoscale\n', code: 1 };
    }

    let min = 1;
    let max = 5;
    let cpuPercent = 80;

    for (let i = 0; i < restArgs.length; i++) {
      const a = restArgs[i];
      if (a.startsWith('--min=')) min = parseInt(a.split('=')[1], 10);
      else if (a === '--min') min = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--max=')) max = parseInt(a.split('=')[1], 10);
      else if (a === '--max') max = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--cpu-percent=')) cpuPercent = parseInt(a.split('=')[1], 10);
      else if (a === '--cpu-percent') cpuPercent = parseInt(restArgs[++i], 10);
    }

    const targetResource = this.graph.get(targetKind, namespace, targetName);
    if (!targetResource) {
      return { stdout: '', stderr: `Error from server (NotFound): ${targetKind} "${targetName}" not found in namespace "${namespace}"\n`, code: 1 };
    }

    const hpa = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: targetName,
        namespace,
        creationTimestamp: new Date().toISOString()
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: targetKind,
          name: targetName
        },
        minReplicas: min,
        maxReplicas: max,
        metrics: [{
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: { type: 'Utilization', averageUtilization: cpuPercent }
          }
        }]
      },
      status: {
        currentReplicas: targetResource.spec?.replicas || 1,
        desiredReplicas: targetResource.spec?.replicas || 1
      }
    };

    this.graph.set(hpa);
    return { stdout: `horizontalpodautoscaler.autoscaling/${targetName} autoscaled\n`, stderr: '', code: 0 };
  }

  _kubectlDiff({ filename, stdin, vfs, cwd }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    let content = stdin;
    if (filename && vfs) {
      try {
        const resolved = vfs.normalizePath(filename, cwd);
        content = vfs.readFile(resolved);
      } catch (err) {
        return { stdout: '', stderr: `error: open ${filename}: no such file or directory\n`, code: 1 };
      }
    }
    if (!content || !content.trim()) {
      return { stdout: '', stderr: 'error: no manifest content provided for diff\n', code: 1 };
    }

    let docs = [];
    try {
      docs = yamlParser.parseAllYaml ? yamlParser.parseAllYaml(content) : (yamlParser.parseYaml ? [yamlParser.parseYaml(content)] : [JSON.parse(content)]);
    } catch {
      docs = [JSON.parse(content)];
    }

    const diffLines = [];
    for (const doc of docs) {
      if (!doc || !doc.kind || !doc.metadata?.name) continue;
      const ns = doc.metadata.namespace || 'default';
      const live = this.graph.get(doc.kind, ns, doc.metadata.name);
      if (!live) {
        diffLines.push(`--- /dev/null\n+++ /tmp/LIVE/${doc.metadata.name}.yaml`);
        diffLines.push(`+ apiVersion: ${doc.apiVersion}\n+ kind: ${doc.kind}\n+ metadata:\n+   name: ${doc.metadata.name}`);
      } else {
        const fieldDiffs = [];
        for (const k of Object.keys(doc.spec || {})) {
          if (JSON.stringify(doc.spec[k]) !== JSON.stringify(live.spec?.[k])) {
            fieldDiffs.push(`-   ${k}: ${JSON.stringify(live.spec?.[k])}`);
            fieldDiffs.push(`+   ${k}: ${JSON.stringify(doc.spec[k])}`);
          }
        }
        if (fieldDiffs.length > 0) {
          diffLines.push(`diff -u -N /tmp/LIVE/${doc.metadata.name}.yaml /tmp/CONFIG/${doc.metadata.name}.yaml`);
          diffLines.push(`--- /tmp/LIVE/${doc.metadata.name}.yaml`);
          diffLines.push(`+++ /tmp/CONFIG/${doc.metadata.name}.yaml`);
          diffLines.push(...fieldDiffs);
        }
      }
    }

    if (diffLines.length > 0) {
      return { stdout: diffLines.join('\n') + '\n', stderr: '', code: 1 };
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  _kubectlWait({ restArgs, namespace }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    let condition = 'Ready';
    let forDelete = false;
    let target = null;

    for (let i = 0; i < restArgs.length; i++) {
      const a = restArgs[i];
      if (a.startsWith('--for=condition=')) {
        condition = a.split('=')[2] || 'Ready';
      } else if (a.startsWith('--for=delete')) {
        forDelete = true;
      } else if (!a.startsWith('-')) {
        target = a;
      }
    }

    if (!target) {
      return { stdout: '', stderr: 'error: Must specify one or more resources to wait on\n', code: 1 };
    }

    let kind = 'Pod';
    let name = target;
    if (target.includes('/')) {
      const parts = target.split('/');
      kind = normalizeKind(parts[0]);
      name = parts[1];
    }

    const res = this.graph.get(kind, namespace, name);
    if (forDelete) {
      if (!res) {
        return { stdout: `${target} condition met\n`, stderr: '', code: 0 };
      }
      return { stdout: '', stderr: `timed out waiting for the condition on ${target}\n`, code: 1 };
    }

    if (!res) {
      return { stdout: '', stderr: `error: ${target} not found\n`, code: 1 };
    }

    const conditions = res.status?.conditions || [];
    const matched = conditions.some((c) => c.type === condition && c.status === 'True') || res.status?.phase === 'Running' || res.status?.phase === 'Active';

    if (matched) {
      return { stdout: `${target} condition met\n`, stderr: '', code: 0 };
    }
    return { stdout: '', stderr: `timed out waiting for the condition on ${target}\n`, code: 1 };
  }

  _kubectlDebug({ restArgs, namespace }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    const target = restArgs[0] || 'pod/app';
    let image = 'busybox:latest';

    for (let i = 1; i < restArgs.length; i++) {
      const a = restArgs[i];
      if (a.startsWith('--image=')) image = a.split('=')[1];
      else if (a === '--image') image = restArgs[++i];
    }

    let kind = 'Pod';
    let name = target;
    if (target.includes('/')) {
      const parts = target.split('/');
      kind = normalizeKind(parts[0]);
      name = parts[1];
    }

    if (kind === 'Pod') {
      const pod = this.graph.get('Pod', namespace, name);
      if (!pod) {
        return { stdout: '', stderr: `Error from server (NotFound): pods "${name}" not found\n`, code: 1 };
      }
      pod.spec = pod.spec || {};
      pod.spec.ephemeralContainers = pod.spec.ephemeralContainers || [];
      pod.spec.ephemeralContainers.push({
        name: 'debugger',
        image,
        stdin: true,
        tty: true
      });
      this.graph.set(pod);
      return {
        stdout: `Targeting container "debugger". If you don't see a command prompt, try pressing enter.\n`,
        stderr: '',
        code: 0
      };
    }

    if (kind === 'Node') {
      const debugPodName = `node-debugger-${name.slice(0, 10)}`;
      this.graph.set({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: debugPodName, namespace },
        spec: {
          nodeName: name,
          hostPID: true,
          hostNetwork: true,
          containers: [{ name: 'debugger', image }]
        },
        status: { phase: 'Running' }
      });
      return {
        stdout: `Creating debugging pod node-debugger-${name.slice(0, 10)} with container debugger on node ${name}.\n`,
        stderr: '',
        code: 0
      };
    }

    return { stdout: `Debugging started for ${target}\n`, stderr: '', code: 0 };
  }

  _kubectlTaint({ restArgs }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    const rawKind = restArgs[0];
    const nodeName = restArgs[1];
    const taintExpr = restArgs[2];

    if (!nodeName || !taintExpr) {
      return { stdout: '', stderr: 'error: exactly one node and at least one taint must be specified\n', code: 1 };
    }

    const node = this.graph.get('Node', null, nodeName);
    if (!node) {
      return { stdout: '', stderr: `Error from server (NotFound): nodes "${nodeName}" not found\n`, code: 1 };
    }

    node.spec = node.spec || {};
    node.spec.taints = node.spec.taints || [];

    if (taintExpr.endsWith('-')) {
      const cleanExpr = taintExpr.slice(0, -1);
      const colonIdx = cleanExpr.indexOf(':');
      const effect = colonIdx > -1 ? cleanExpr.slice(colonIdx + 1) : null;
      const keyPart = colonIdx > -1 ? cleanExpr.slice(0, colonIdx) : cleanExpr;
      const eqIdx = keyPart.indexOf('=');
      const key = eqIdx > -1 ? keyPart.slice(0, eqIdx) : keyPart;

      node.spec.taints = node.spec.taints.filter((t) => {
        if (effect && t.effect !== effect) return true;
        return t.key !== key;
      });
      this.graph.set(node);
      return { stdout: `node/${nodeName} untainted\n`, stderr: '', code: 0 };
    }

    const colonIdx = taintExpr.indexOf(':');
    const effect = colonIdx > -1 ? taintExpr.slice(colonIdx + 1) : 'NoSchedule';
    const keyPart = colonIdx > -1 ? taintExpr.slice(0, colonIdx) : taintExpr;
    const eqIdx = keyPart.indexOf('=');
    const key = eqIdx > -1 ? keyPart.slice(0, eqIdx) : keyPart;
    const value = eqIdx > -1 ? keyPart.slice(eqIdx + 1) : '';

    node.spec.taints = node.spec.taints.filter((t) => t.key !== key || t.effect !== effect);
    node.spec.taints.push({ key, value, effect });
    this.graph.set(node);
    return { stdout: `node/${nodeName} tainted\n`, stderr: '', code: 0 };
  }

  _kubectlConfig({ restArgs, vfs, cwd }) {
    this.kubeConfig = this.kubeConfig || {
      currentContext: 'kubernetes-admin@kubernetes',
      contexts: [
        { name: 'kubernetes-admin@kubernetes', cluster: 'kubernetes', user: 'kubernetes-admin', namespace: 'default' }
      ]
    };

    const action = restArgs[0];
    if (action === 'view') {
      const out = [
        'apiVersion: v1',
        'clusters:',
        '- cluster:',
        '    server: https://192.168.1.10:6443',
        '  name: kubernetes',
        'contexts:',
        ...this.kubeConfig.contexts.flatMap((c) => [
          `- context:`,
          `    cluster: ${c.cluster || 'kubernetes'}`,
          `    user: ${c.user || 'kubernetes-admin'}`,
          `    namespace: ${c.namespace || 'default'}`,
          `  name: ${c.name}`
        ]),
        `current-context: ${this.kubeConfig.currentContext}`,
        'kind: Config',
        'preferences: {}',
        'users:',
        '- name: kubernetes-admin',
        '  user:',
        '    client-certificate-data: REDACTED'
      ];
      return { stdout: out.join('\n') + '\n', stderr: '', code: 0 };
    }

    if (action === 'current-context') {
      return { stdout: `${this.kubeConfig.currentContext}\n`, stderr: '', code: 0 };
    }

    if (action === 'use-context') {
      const ctxName = restArgs[1];
      if (!ctxName) return { stdout: '', stderr: 'error: context name required\n', code: 1 };
      this.kubeConfig.currentContext = ctxName;
      return { stdout: `Switched to context "${ctxName}".\n`, stderr: '', code: 0 };
    }

    if (action === 'set-context') {
      const ctxName = restArgs[1];
      if (!ctxName) return { stdout: '', stderr: 'error: context name required\n', code: 1 };
      let ns = 'default';
      let cluster = 'kubernetes';
      let user = 'kubernetes-admin';
      for (let i = 2; i < restArgs.length; i++) {
        const a = restArgs[i];
        if (a.startsWith('--namespace=')) ns = a.split('=')[1];
        else if (a === '--namespace') ns = restArgs[++i];
        else if (a.startsWith('--cluster=')) cluster = a.split('=')[1];
        else if (a === '--cluster') cluster = restArgs[++i];
        else if (a.startsWith('--user=')) user = a.split('=')[1];
        else if (a === '--user') user = restArgs[++i];
      }
      const existing = this.kubeConfig.contexts.find((c) => c.name === ctxName);
      if (existing) {
        existing.namespace = ns;
        existing.cluster = cluster;
        existing.user = user;
      } else {
        this.kubeConfig.contexts.push({ name: ctxName, cluster, user, namespace: ns });
      }
      return { stdout: `Context "${ctxName}" modified.\n`, stderr: '', code: 0 };
    }

    if (action === 'get-contexts') {
      const headers = ['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'];
      const rows = this.kubeConfig.contexts.map((c) => [
        c.name === this.kubeConfig.currentContext ? '*' : '',
        c.name,
        c.cluster || 'kubernetes',
        c.user || 'kubernetes-admin',
        c.namespace || 'default'
      ]);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    return { stdout: 'kubectl config view/current-context/use-context/set-context/get-contexts\n', stderr: '', code: 0 };
  }

  _kubectlExplain({ restArgs }) {
    const target = restArgs[0] || 'pod';
    const kind = normalizeKind(target.split('.')[0]);

    const doc = {
      Pod: {
        version: 'v1',
        description: 'Pod is a collection of containers that can run on a host.',
        fields: {
          metadata: 'Standard object metadata.',
          spec: 'Specification of the desired behavior of the pod.',
          status: 'Most recently observed status of the pod.'
        }
      },
      Deployment: {
        version: 'apps/v1',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets.',
        fields: {
          metadata: 'Standard object metadata.',
          spec: 'Specification of the desired behavior of the Deployment.',
          status: 'Most recently observed status of the Deployment.'
        }
      },
      Service: {
        version: 'v1',
        description: 'Service is an abstract way to expose an application running on a set of Pods as a network service.',
        fields: {
          metadata: 'Standard object metadata.',
          spec: 'The list of ports that are exposed by this service.',
          status: 'Most recently observed status of the service.'
        }
      }
    };

    const entry = doc[kind] || {
      version: 'v1',
      description: `${kind} resource definition in Kubernetes API.`,
      fields: { metadata: 'Object metadata.', spec: 'Resource specification.' }
    };

    const lines = [
      `KIND:     ${kind}`,
      `VERSION:  ${entry.version}`,
      '',
      `DESCRIPTION:`,
      `    ${entry.description}`,
      '',
      `FIELDS:`
    ];
    for (const [fName, fDesc] of Object.entries(entry.fields)) {
      lines.push(`   ${fName.padEnd(16)} <Object>`);
      lines.push(`      ${fDesc}`);
    }

    return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 2. HELM CLI HANDLER
  // -------------------------------------------------------------------------

  handleHelm({ argv = [] }) {
    const sub = argv[1];
    if (!sub) return { stdout: 'The Kubernetes Package Manager\n', stderr: '', code: 0 };

    if (sub === 'list' || sub === 'ls') {
      const releases = this.helm ? this.helm.list() : [];
      if (releases.length === 0) {
        return { stdout: 'NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION\n', stderr: '', code: 0 };
      }
      const headers = ['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION'];
      const rows = releases.map((r) => [r.name, r.namespace, String(r.revision), r.updatedAt || r.updated || 'now', r.status, r.chart, '1.0.0']);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'install') {
      const name = argv[2];
      const chart = argv[3];
      if (!name || !chart) return { stdout: '', stderr: 'Error: install requires release name and chart\n', code: 1 };
      let ns = 'default';
      const nIdx = argv.indexOf('-n');
      if (nIdx !== -1) ns = argv[nIdx + 1] || 'default';

      if (this.helm) {
        this.helm.install(name, chart, {}, { namespace: ns });
      }
      // Provision simulated workload in cluster graph
      if (this.graph) {
        this.graph.create({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: `${name}-${chart}`, namespace: ns, labels: { 'app.kubernetes.io/instance': name } },
          spec: { replicas: 1, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name, image: chart }] } } }
        });
        if (this.controllerManager) this.controllerManager.reconcile();
      }
      return {
        stdout: `NAME: ${name}\nLAST DEPLOYED: ${new Date().toUTCString()}\nNAMESPACE: ${ns}\nSTATUS: deployed\nREVISION: 1\nTEST SUITE: None\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'upgrade') {
      const name = argv[2];
      const chart = argv[3];
      if (this.helm) this.helm.upgrade(name, {}, {});
      return { stdout: `Release "${name}" has been upgraded. Happy Helming!\n`, stderr: '', code: 0 };
    }

    if (sub === 'rollback') {
      const name = argv[2];
      const rev = argv[3] || 1;
      if (this.helm) this.helm.rollback(name, parseInt(rev, 10), {});
      return { stdout: `Rollback was a success! Happy Helming!\n`, stderr: '', code: 0 };
    }

    if (sub === 'uninstall') {
      const name = argv[2];
      if (this.helm) this.helm.uninstall(name, {});
      return { stdout: `release "${name}" uninstalled\n`, stderr: '', code: 0 };
    }

    if (sub === 'repo') {
      return { stdout: 'repositories updated successfully\n', stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `Error: unknown command "${sub}" for "helm"\n`, code: 1 };
  }

  // -------------------------------------------------------------------------
  // 3. DOCKER / CRICTL HANDLER
  // -------------------------------------------------------------------------

  handleDocker({ argv = [] }) {
    const sub = argv[1];
    if (!sub || sub === 'ps') {
      const headers = ['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'];
      const rows = [
        ['a1b2c3d4e5f6', 'registry.k8s.io/kube-apiserver:v1.31.0', '"kube-apiserver --..."', '2 days ago', 'Up 2 days', '6443/tcp', 'k8s_kube-apiserver'],
        ['b2c3d4e5f6a1', 'registry.k8s.io/etcd:3.5.15-0', '"etcd --..."', '2 days ago', 'Up 2 days', '2379-2380/tcp', 'k8s_etcd'],
        ['c3d4e5f6a1b2', 'nginx:1.27-alpine', '"/docker-entrypoint..."', '5 hours ago', 'Up 5 hours', '0.0.0.0:80->80/tcp', 'web-gateway']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'images') {
      const headers = ['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'];
      const rows = [
        ['nginx', '1.27-alpine', 'e78d910a2f', '2 weeks ago', '42.8MB'],
        ['redis', '7.2-alpine', 'f49a1b8c0e', '3 weeks ago', '38.4MB'],
        ['registry.k8s.io/kube-apiserver', 'v1.31.0', '98a7b6c5d4', '1 month ago', '128MB']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'run') {
      const img = argv[argv.length - 1];
      const id = Math.random().toString(16).slice(2, 14);
      return { stdout: `${id}\n`, stderr: '', code: 0 };
    }

    if (sub === 'stop' || sub === 'rm') {
      const id = argv[2] || 'container';
      return { stdout: `${id}\n`, stderr: '', code: 0 };
    }

    return { stdout: 'docker daemon active\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 4. ARGOCD & GITOPS HANDLER
  // -------------------------------------------------------------------------

  handleArgoCD({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'app') {
      const action = argv[2];
      const appName = argv[3] || 'guestbook';

      if (action === 'list') {
        const headers = ['NAME', 'CLUSTER', 'NAMESPACE', 'PROJECT', 'STATUS', 'HEALTH'];
        const rows = [
          [appName, 'https://192.168.1.10:6443', 'default', 'default', 'Synced', 'Healthy'],
          ['prod-payment', 'https://192.168.1.10:6443', 'prod', 'default', 'Synced', 'Healthy']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'sync') {
        if (this.argocd) this.argocd.syncApp(appName);
        return {
          stdout: `TIMESTAMP                  GROUP        KIND   NAMESPACE                  NAME    STATUS    HEALTH   HOOK  MESSAGE\n2026-11-12T16:00:00Z   apps  Deployment     default             ${appName}    Synced   Healthy\n`,
          stderr: '',
          code: 0
        };
      }

      if (action === 'get') {
        return {
          stdout: `Name:               ${appName}\nProject:            default\nServer:             https://192.168.1.10:6443\nNamespace:          default\nStatus:             Synced\nHealth:             Healthy\n`,
          stderr: '',
          code: 0
        };
      }
    }
    return { stdout: 'argocd GitOps controller connected\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 5. ISTIOCTL & SERVICE MESH HANDLER
  // -------------------------------------------------------------------------

  handleIstioctl({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'analyze') {
      return { stdout: '✔ No validation issues found when analyzing namespace: default.\n', stderr: '', code: 0 };
    }
    if (sub === 'proxy-status') {
      const headers = ['NAME', 'CDS', 'LDS', 'EDS', 'RDS', 'ISTIOD', 'VERSION'];
      const rows = [
        ['ingressgateway-7b9c.istio-system', 'SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'istiod-1', '1.23.0'],
        ['web-frontend-9f1.default', 'SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'istiod-1', '1.23.0']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }
    return { stdout: 'client version: 1.23.0\ncontrol plane version: 1.23.0\ndata plane version: 1.23.0 (2 proxies)\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 6. OPENTOFU / TERRAFORM HANDLER
  // -------------------------------------------------------------------------

  handleTofu({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'init') {
      return { stdout: 'Initializing the backend...\nInitializing provider plugins...\nOpenTofu has been successfully initialized!\n', stderr: '', code: 0 };
    }
    if (sub === 'plan') {
      return { stdout: 'Plan: 3 to add, 0 to change, 0 to destroy.\nChanges to Outputs:\n  + cluster_endpoint = "https://192.168.1.10:6443"\n', stderr: '', code: 0 };
    }
    if (sub === 'apply') {
      if (this.tofu && typeof this.tofu.applyResource === 'function') {
        this.tofu.applyResource('aws_vpc', 'main', 'aws', { cidr_block: '10.0.0.0/16' });
        this.tofu.applyResource('aws_eks_cluster', 'primary', 'aws', { name: 'kubelabs-eks' }, ['aws_vpc.main']);
        this.tofu.applyResource('aws_eks_node_group', 'workers', 'aws', { cluster_name: 'kubelabs-eks' }, ['aws_eks_cluster.primary']);
      }
      return { stdout: 'Apply complete! Resources: 3 added, 0 changed, 0 destroyed.\n', stderr: '', code: 0 };
    }
    if (sub === 'state') {
      if (this.tofu && typeof this.tofu.listResources === 'function') {
        const list = this.tofu.listResources();
        if (list.length > 0) {
          return { stdout: list.map((r) => `${r.type}.${r.name}`).join('\n') + '\n', stderr: '', code: 0 };
        }
      }
      return { stdout: 'module.vpc.aws_vpc.main\nmodule.eks.aws_eks_cluster.primary\nmodule.eks.aws_eks_node_group.workers\n', stderr: '', code: 0 };
    }
    return { stdout: 'OpenTofu v1.8.2\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 7. MULTI-CLOUD (AWS, AZURE, GCLOUD) HANDLER
  // -------------------------------------------------------------------------

  handleAws({ argv = [], vfs = null, cwd = '/home/learner' }) {
    const svc = argv[1];
    if (svc === 'sts' && argv[2] === 'get-caller-identity') {
      return {
        stdout: JSON.stringify({
          UserId: 'AIDAJQAB27XYZEXAMPLE',
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/cloud-engineer'
        }, null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (svc === 'eks') {
      const action = argv[2];
      if (action === 'update-kubeconfig') {
        let clusterName = 'kubelabs-production-eks';
        let region = 'us-east-1';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i].startsWith('--name=')) clusterName = argv[i].split('=')[1];
          else if (argv[i] === '--name') clusterName = argv[++i];
          else if (argv[i].startsWith('--region=')) region = argv[i].split('=')[1];
          else if (argv[i] === '--region') region = argv[++i];
        }
        const ctxArn = `arn:aws:eks:${region}:123456789012:cluster/${clusterName}`;
        if (vfs) {
          try {
            vfs.writeFile(
              '/home/learner/.kube/config',
              `apiVersion: v1\ncurrent-context: ${ctxArn}\nkind: Config\n`
            );
          } catch {
            // ignore
          }
        }
        return {
          stdout: `Updated context ${ctxArn} in /home/learner/.kube/config\n`,
          stderr: '',
          code: 0
        };
      }

      if (action === 'describe-cluster') {
        let clusterName = 'kubelabs-production-eks';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i].startsWith('--name=')) clusterName = argv[i].split('=')[1];
          else if (argv[i] === '--name') clusterName = argv[++i];
        }
        return {
          stdout: JSON.stringify({
            cluster: {
              name: clusterName,
              arn: `arn:aws:eks:us-east-1:123456789012:cluster/${clusterName}`,
              version: '1.31',
              endpoint: 'https://78A9C12.gr7.us-east-1.eks.amazonaws.com',
              roleArn: 'arn:aws:iam::123456789012:role/eks-cluster-role',
              status: 'ACTIVE'
            }
          }, null, 2) + '\n',
          stderr: '',
          code: 0
        };
      }

      return {
        stdout: JSON.stringify({ clusters: ['kubelabs-production-eks'] }, null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (svc === 'iam') {
      const action = argv[2];
      if (action === 'get-role') {
        let roleName = 'eks-pod-identity-role';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i].startsWith('--role-name=')) roleName = argv[i].split('=')[1];
          else if (argv[i] === '--role-name') roleName = argv[++i];
        }
        return {
          stdout: JSON.stringify({
            Role: {
              RoleName: roleName,
              RoleId: 'AROAIEXAMPLE',
              Arn: `arn:aws:iam::123456789012:role/${roleName}`,
              AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [{ Effect: 'Allow', Principal: { Service: 'pods.eks.amazonaws.com' }, Action: 'sts:AssumeRole' }]
              }
            }
          }, null, 2) + '\n',
          stderr: '',
          code: 0
        };
      }
      return {
        stdout: JSON.stringify({
          Roles: [
            { RoleName: 'eks-cluster-role', Arn: 'arn:aws:iam::123456789012:role/eks-cluster-role' },
            { RoleName: 'eks-node-role', Arn: 'arn:aws:iam::123456789012:role/eks-node-role' }
          ]
        }, null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (svc === 'ec2' && argv[2] === 'describe-instances') {
      return {
        stdout: JSON.stringify({
          Reservations: [{
            Instances: [
              { InstanceId: 'i-0a1b2c3d4e5f6g7h8', InstanceType: 'm6i.xlarge', State: { Name: 'running' }, PrivateIpAddress: '192.168.1.10' },
              { InstanceId: 'i-0b2c3d4e5f6g7h8i9', InstanceType: 't3.large', State: { Name: 'running' }, PrivateIpAddress: '192.168.1.11' }
            ]
          }]
        }, null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    return { stdout: 'AWS CLI v2.17.40\n', stderr: '', code: 0 };
  }

  handleFlux({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'get') {
      const resType = argv[2] || 'kustomizations';
      if (resType.startsWith('kustom')) {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = [
          ['apps', 'main@sha1:e84f291', 'False', 'True', 'Applied revision: main@sha1:e84f291'],
          ['infrastructure', 'main@sha1:e84f291', 'False', 'True', 'Applied revision: main@sha1:e84f291']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (resType.startsWith('helm')) {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = [
          ['redis-cluster', '6.2.14', 'False', 'True', 'Release reconciliation succeeded'],
          ['ingress-nginx', '4.10.1', 'False', 'True', 'Release reconciliation succeeded']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (resType.startsWith('source')) {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = [
          ['podinfo', 'master@sha1:123abc4', 'False', 'True', 'stored artifact for revision']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
    }
    if (sub === 'reconcile') {
      const name = argv[3] || argv[2] || 'apps';
      return {
        stdout: `► annotating Kustomization ${name} in flux-system namespace\n✔ Kustomization reconciled successfully\n`,
        stderr: '',
        code: 0
      };
    }
    return { stdout: 'Flux GitOps CLI v2.3.0\n', stderr: '', code: 0 };
  }

  handleVelero({ argv = [] }) {
    this.veleroBackups = this.veleroBackups || [
      { name: 'daily-backup-2026-11-10', status: 'Completed', errors: 0, warnings: 0, created: '2026-11-10 02:00:00' }
    ];

    const entity = argv[1];
    const action = argv[2];

    if (entity === 'backup') {
      if (action === 'create') {
        const name = argv[3] || `backup-${Date.now()}`;
        this.veleroBackups.push({
          name,
          status: 'Completed',
          errors: 0,
          warnings: 0,
          created: new Date().toISOString()
        });
        return { stdout: `Backup request "${name}" submitted successfully.\n`, stderr: '', code: 0 };
      }
      if (action === 'get') {
        const headers = ['NAME', 'STATUS', 'ERRORS', 'WARNINGS', 'CREATED', 'EXPIRES'];
        const rows = this.veleroBackups.map((b) => [b.name, b.status, String(b.errors), String(b.warnings), b.created, '28d']);
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (action === 'describe') {
        const name = argv[3] || (this.veleroBackups[0] ? this.veleroBackups[0].name : 'backup');
        const lines = [
          `Name:         ${name}`,
          `Namespace:    velero`,
          `Labels:       velero.io/storage-location=default`,
          `Phase:        Completed`,
          `Namespaces:   Included: *`,
          `Resources:    Included: *`,
          `Items Backed Up: 142 items`
        ];
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }
    }

    if (entity === 'restore') {
      if (action === 'create') {
        let fromBackup = 'daily-backup';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i].startsWith('--from-backup=')) fromBackup = argv[i].split('=')[1];
          else if (argv[i] === '--from-backup') fromBackup = argv[++i];
        }
        return { stdout: `Restore request "${fromBackup}-restore-${Math.random().toString(36).slice(2, 7)}" submitted successfully.\n`, stderr: '', code: 0 };
      }
      if (action === 'get') {
        const headers = ['NAME', 'BACKUP', 'STATUS', 'STARTED', 'COMPLETED'];
        const rows = [
          ['daily-backup-restore-1', 'daily-backup-2026-11-10', 'Completed', '2026-11-12 04:00:00', '2026-11-12 04:02:15']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
    }

    return { stdout: 'Velero Disaster Recovery CLI v1.14.0\n', stderr: '', code: 0 };
  }

  handleVcluster({ argv = [] }) {
    this.vclusters = this.vclusters || [
      { name: 'staging-tenant', namespace: 'vcluster-staging', status: 'Running', connected: 'False', age: '3d' }
    ];

    const action = argv[1];
    if (action === 'create') {
      const name = argv[2] || 'my-vcluster';
      let ns = name;
      for (let i = 3; i < argv.length; i++) {
        if (argv[i] === '-n' || argv[i] === '--namespace') ns = argv[++i];
        else if (argv[i].startsWith('-n=')) ns = argv[i].split('=')[1];
      }
      this.vclusters.push({ name, namespace: ns, status: 'Running', connected: 'True', age: '10s' });
      return {
        stdout: `[info] Creating vCluster "${name}" in namespace "${ns}"...\n[info] vCluster "${name}" successfully created and ready to use!\n`,
        stderr: '',
        code: 0
      };
    }

    if (action === 'list') {
      const headers = ['NAME', 'NAMESPACE', 'STATUS', 'CONNECTED', 'AGE'];
      const rows = this.vclusters.map((v) => [v.name, v.namespace, v.status, v.connected, v.age]);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (action === 'connect') {
      const name = argv[2] || (this.vclusters[0] ? this.vclusters[0].name : 'vcluster');
      return { stdout: `[info] Switched context to vcluster_${name}\n`, stderr: '', code: 0 };
    }

    if (action === 'delete') {
      const name = argv[2];
      this.vclusters = this.vclusters.filter((v) => v.name !== name);
      return { stdout: `[info] Successfully deleted vCluster "${name}"\n`, stderr: '', code: 0 };
    }

    return { stdout: 'vcluster: Virtual Kubernetes Clusters CLI v0.19.5\n', stderr: '', code: 0 };
  }

  handleAzure({ argv = [] }) {
    return { stdout: 'Azure CLI (az) connected to subscription: Enterprise-DevOps-Prod\n', stderr: '', code: 0 };
  }

  handleGcloud({ argv = [] }) {
    return { stdout: 'Google Cloud SDK 490.0.0 (project: aetherlabs-gke-prod)\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 8. SECURITY & COMPLIANCE TOOLS (TRIVY, FALCO, COSIGN)
  // -------------------------------------------------------------------------

  handleTrivy({ argv = [] }) {
    const sub = argv[1];
    const target = argv[2] || 'cluster';
    const headers = ['LIBRARY', 'VULNERABILITY ID', 'SEVERITY', 'INSTALLED VERSION', 'FIXED VERSION', 'TITLE'];
    const rows = [
      ['libssl3', 'CVE-2024-5535', 'MEDIUM', '3.0.13-0ubuntu3.1', '3.0.13-0ubuntu3.4', 'SSL_select_next_proto buffer overflow'],
      ['glibc', 'CVE-2024-33599', 'LOW', '2.39-0ubuntu8.1', '2.39-0ubuntu8.2', 'nscd netgroup cache crash']
    ];
    return {
      stdout: `Scan Target: ${target}\nTotal: 2 (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1)\n\n` + this._formatTable(headers, rows) + '\n',
      stderr: '',
      code: 0
    };
  }

  handleFalco() {
    return {
      stdout: 'Falco rule engine active. 0 security anomalies or syscall violations detected.\n',
      stderr: '',
      code: 0
    };
  }

  handleCosign({ argv = [] }) {
    return { stdout: 'Verification for image successful. Signed by OIDC provider.\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 9. CONTROL PLANE UTILITIES (ETCDCTL, KUBEADM, CILIUM, LINKERD, AIOPS)
  // -------------------------------------------------------------------------

  handleEtcdctl({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'endpoint') {
      return { stdout: '127.0.0.1:2379 is healthy: successfully committed proposal: took = 1.2ms\n', stderr: '', code: 0 };
    }
    if (sub === 'member' && argv[2] === 'list') {
      return { stdout: 'b07e1c841a029f12, started, control-plane-node, https://192.168.1.10:2380, https://192.168.1.10:2379, false\n', stderr: '', code: 0 };
    }
    if (sub === 'snapshot') {
      const action = argv[2];
      const target = argv[3] || '/var/lib/etcd/backup.db';
      if (action === 'restore') {
        if (this.graph) {
          const etcdPods = this.graph.findByKind('Pod').filter(
            (p) => p.metadata && p.metadata.namespace === 'kube-system' && p.metadata.labels && p.metadata.labels.component === 'etcd'
          );
          for (const p of etcdPods) {
            if (p.metadata && p.metadata.labels) {
              delete p.metadata.labels['etcd-unhealthy'];
            }
          }
        }
        return {
          stdout: `2026-11-12 06:00:00.000000 I | etcdmain: restored snapshot ${target} to /var/lib/etcd/default.etcd\nQuorum restored across all etcd members.\n`,
          stderr: '',
          code: 0
        };
      }
      return { stdout: `Snapshot saved at ${target}\n`, stderr: '', code: 0 };
    }
    return { stdout: 'etcdctl version: 3.5.15\n', stderr: '', code: 0 };
  }

  handleKubeadm({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'certs' && argv[2] === 'check-expiration') {
      const headers = ['CERTIFICATE', 'EXPIRES', 'RESIDUAL TIME', 'CERTIFICATE AUTHORITY'];
      const rows = [
        ['admin.conf', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
        ['apiserver', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
        ['etcd-server', 'Nov 12, 2027 16:00 UTC', '364d', 'etcd-ca']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }
    return { stdout: 'kubeadm cluster administration utility v1.31.0\n', stderr: '', code: 0 };
  }

  handleCilium({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'connectivity' && argv[2] === 'test') {
      if (this.networking) {
        const pods = this.graph.list({ kind: 'Pod' }).filter((p) => p.status?.phase === 'Running');
        const srcPod = pods[0] || { metadata: { name: 'client-pod', namespace: 'default' }, status: { podIP: '10.244.1.10' } };
        const dstPod = pods[1] || { metadata: { name: 'server-pod', namespace: 'prod' }, status: { podIP: '10.244.2.20' } };
        const trace = this.networking.tracePacket(srcPod, dstPod, 80, 'TCP');

        const lines = [
          `[.] Connectivity test using src: ${srcPod.metadata.namespace}/${srcPod.metadata.name} -> dst: ${dstPod.metadata.namespace}/${dstPod.metadata.name}`,
          '--------------------------------------------------------------------------------'
        ];
        trace.hops.forEach((h, i) => {
          lines.push(`[${i + 1}/${trace.hops.length}] ${h.name}: ${h.status} (${h.details})`);
        });
        lines.push('--------------------------------------------------------------------------------');
        if (trace.allowed) {
          lines.push('All connectivity checks successful (0 drops)');
          return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
        } else {
          lines.push(`Connectivity test failed: ${trace.dropReason}`);
          return { stdout: lines.join('\n') + '\n', stderr: `drop: ${trace.dropReason}\n`, code: 1 };
        }
      }
      return { stdout: 'Cilium connectivity test passed: all 1/1 flows allowed\n', stderr: '', code: 0 };
    }
    return { stdout: '    /¯¯\\\n/¯¯\\__/¯¯\\    Cilium:             OK\n\\__/¯¯\\__/    Operator:           OK\n    \\__/      Datapath:           eBPF (Kernel 6.8)\n', stderr: '', code: 0 };
  }

  handleLinkerd({ argv = [] }) {
    return { stdout: 'linkerd-existence\n-----------------\n√ Control plane is running\n√ Data plane proxies are up\nStatus check succeeded\n', stderr: '', code: 0 };
  }

  handleAiOps({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'analyze') {
      return {
        stdout: [
          '=== AIOPS AUTONOMOUS SRE DIAGNOSIS ===',
          'Analyzed: 12 metrics time-series, 24 logs, 8 controller loops',
          'Root Cause: Normal baseline operating state. No OOM, DNS loop, or CrashLoop detected.',
          'Confidence: 99.4%'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }
    return { stdout: 'AIOps Engine v3.0 ready.\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 10. LINUX & NETWORKING DIAGNOSTICS HANDLER
  // -------------------------------------------------------------------------

  handleCurl({ argv = [] }) {
    const url = argv.find((a) => a.startsWith('http://') || a.startsWith('https://')) || 'http://kubernetes.default.svc';
    return {
      stdout: JSON.stringify({
        status: '200 OK',
        service: url,
        server: 'kubelabs-isomorphic-cluster/v3.0',
        timestamp: new Date().toISOString()
      }, null, 2) + '\n',
      stderr: '',
      code: 0
    };
  }

  handleDig({ argv = [] }) {
    const host = argv.find((a, i) => i > 0 && !a.startsWith('-')) || 'kubernetes.default.svc.cluster.local';
    let resolvedIp = '10.96.0.1';
    let status = 'NOERROR';
    let errorMsg = '';

    if (this.networking) {
      const corednsCm = this.graph.get('ConfigMap', 'kube-system', 'coredns');
      if (corednsCm && corednsCm.data && corednsCm.data.Corefile && corednsCm.data.Corefile.includes('127.0.0.1')) {
        this.networking.upstreamDns = '127.0.0.1';
      }
      const dnsRes = this.networking.resolveDNS(host);
      status = dnsRes.rcode;
      if (dnsRes.records && dnsRes.records.length > 0) {
        resolvedIp = dnsRes.records[0].ip;
      } else {
        errorMsg = dnsRes.error || '';
      }
    }

    if (status !== 'NOERROR') {
      return {
        stdout: [
          `; <<>> DiG 9.18.28 <<>> ${host}`,
          ';; Got answer:',
          `;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: 41285`,
          errorMsg ? `;; WARNING: ${errorMsg}` : '',
          ';; QUESTION SECTION:',
          `;${host}.\t\tIN\tA`,
          '',
          ';; SERVER: 10.96.0.10#53(10.96.0.10)'
        ].filter(Boolean).join('\n') + '\n',
        stderr: '',
        code: status === 'SERVFAIL' ? 1 : 0
      };
    }

    return {
      stdout: [
        `; <<>> DiG 9.18.28 <<>> ${host}`,
        ';; Got answer:',
        ';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41285',
        ';; QUESTION SECTION:',
        `;${host}.\t\tIN\tA`,
        '',
        ';; ANSWER SECTION:',
        `${host}.\t30\tIN\tA\t${resolvedIp}`,
        '',
        ';; SERVER: 10.96.0.10#53(10.96.0.10)',
        ';; WHEN: ' + new Date().toUTCString(),
        ';; MSG SIZE  rcvd: 78'
      ].join('\n') + '\n',
      stderr: '',
      code: 0
    };
  }

  handleNslookup({ argv = [] }) {
    const host = argv.find((a, i) => i > 0 && !a.startsWith('-')) || 'kubernetes.default.svc';
    let resolvedIp = '10.96.0.1';
    let status = 'NOERROR';
    let errorMsg = '';

    if (this.networking) {
      const corednsCm = this.graph.get('ConfigMap', 'kube-system', 'coredns');
      if (corednsCm && corednsCm.data && corednsCm.data.Corefile && corednsCm.data.Corefile.includes('127.0.0.1')) {
        this.networking.upstreamDns = '127.0.0.1';
      }
      const dnsRes = this.networking.resolveDNS(host);
      status = dnsRes.rcode;
      if (dnsRes.records && dnsRes.records.length > 0) {
        resolvedIp = dnsRes.records[0].ip;
      } else {
        errorMsg = dnsRes.error || '';
      }
    }

    if (status !== 'NOERROR') {
      return {
        stdout: `Server:\t\t10.96.0.10\nAddress:\t10.96.0.10#53\n\n** server can't find ${host}: ${status}${errorMsg ? ' - ' + errorMsg : ''}\n`,
        stderr: '',
        code: 1
      };
    }

    return {
      stdout: `Server:\t\t10.96.0.10\nAddress:\t10.96.0.10#53\n\nName:\t${host}\nAddress: ${resolvedIp}\n`,
      stderr: '',
      code: 0
    };
  }

  handleTraceroute({ argv = [] }) {
    const target = argv.find((a, i) => i > 0 && !a.startsWith('-')) || '10.96.0.1';
    if (this.networking) {
      const pods = this.graph.list({ kind: 'Pod' }).filter((p) => p.status?.phase === 'Running');
      const srcPod = pods[0] || { metadata: { name: 'tracer-pod', namespace: 'default' }, status: { podIP: '10.244.1.10' } };
      const trace = this.networking.tracePacket(srcPod, target, 80, 'TCP');

      const lines = [`traceroute to ${target}, 30 hops max, 60 byte packets`];
      trace.hops.forEach((h, i) => {
        lines.push(` ${i + 1}  ${h.name} (${h.status}): ${h.details}`);
      });
      return { stdout: lines.join('\n') + '\n', stderr: '', code: trace.allowed ? 0 : 1 };
    }
    return {
      stdout: `traceroute to ${target}, 30 hops max\n 1  10.244.0.1 (cbr0)  0.214 ms\n 2  ${target}  0.412 ms\n`,
      stderr: '',
      code: 0
    };
  }

  handleIp({ argv = [] }) {
    const sub = argv[1] || 'addr';
    if (sub === 'addr' || sub === 'a') {
      return {
        stdout: [
          '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN',
          '    inet 127.0.0.1/8 scope host lo',
          '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP',
          '    inet 192.168.1.10/24 brd 192.168.1.255 scope global eth0',
          '3: cbr0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UP',
          '    inet 10.244.0.1/24 scope global cbr0'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }
    return { stdout: 'default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.10 metric 100\n10.244.0.0/16 dev cbr0 proto kernel scope link src 10.244.0.1\n', stderr: '', code: 0 };
  }

  handleSs({ argv = [] }) {
    const headers = ['Netid', 'State', 'Recv-Q', 'Send-Q', 'Local Address:Port', 'Peer Address:Port'];
    const rows = [
      ['tcp', 'LISTEN', '0', '4096', '0.0.0.0:6443', '0.0.0.0:*'],
      ['tcp', 'LISTEN', '0', '4096', '127.0.0.1:2379', '0.0.0.0:*'],
      ['tcp', 'LISTEN', '0', '4096', '0.0.0.0:10250', '0.0.0.0:*'],
      ['udp', 'UNCONN', '0', '0', '0.0.0.0:53', '0.0.0.0:*']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handlePing({ argv = [] }) {
    const host = argv.find((a) => !a.startsWith('-')) || '10.96.0.1';
    return {
      stdout: [
        `PING ${host} (${host}) 56(84) bytes of data.`,
        `64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.042 ms`,
        `64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.038 ms`,
        `--- ${host} ping statistics ---`,
        '2 packets transmitted, 2 received, 0% packet loss, time 1001ms'
      ].join('\n') + '\n',
      stderr: '',
      code: 0
    };
  }

  handlePs() {
    const headers = ['PID', 'TTY', 'TIME', 'CMD'];
    const rows = [
      ['1', '?', '00:00:02', 'systemd'],
      ['1420', '?', '00:01:14', 'containerd'],
      ['2100', '?', '00:04:32', 'kubelet --config=/var/lib/kubelet/config.yaml'],
      ['3410', 'pts/0', '00:00:00', 'bash']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleTop() {
    return {
      stdout: 'top - 16:00:00 up 2 days, 1 user, load average: 0.12, 0.18, 0.15\nTasks: 120 total, 1 running, 119 sleeping, 0 stopped, 0 zombie\n%Cpu(s):  2.4 us,  1.1 sy,  0.0 ni, 96.5 id,  0.0 wa\n',
      stderr: '',
      code: 0
    };
  }

  handleDf() {
    const headers = ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'];
    const rows = [
      ['/dev/root', '50G', '12G', '36G', '25%', '/'],
      ['tmpfs', '3.8G', '0', '3.8G', '0%', '/dev/shm'],
      ['/dev/sda1', '100G', '22G', '78G', '22%', '/var/lib/containerd']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleFree() {
    const headers = ['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'];
    const rows = [
      ['Mem:', '8192', '2410', '4120', '32', '1662', '5782'],
      ['Swap:', '2048', '0', '2048', '', '', '']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleUname() {
    return { stdout: 'Linux kubelabs-node 6.8.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // Helper: Tabular Alignment Formatter
  // -------------------------------------------------------------------------

  _formatTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      for (const row of rows) {
        const val = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
        if (val.length > max) max = val.length;
      }
      return max + 3; // 3 spaces padding between columns
    });

    const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('').trimEnd();
    const rowLines = rows.map((row) => {
      return row.map((cell, i) => {
        const str = cell !== undefined && cell !== null ? String(cell) : '';
        return str.padEnd(colWidths[i]);
      }).join('').trimEnd();
    });

    return [headerLine, ...rowLines].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Module Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MultiCliDispatcher,
    normalizeKind,
    KIND_ALIASES
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.MultiCliDispatcher = MultiCliDispatcher;
  globalThis.normalizeKind = normalizeKind;
  globalThis.KIND_ALIASES = KIND_ALIASES;
}
