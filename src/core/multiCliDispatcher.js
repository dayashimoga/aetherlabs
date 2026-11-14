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

let StorageCSIEngine;
let SecurityPolicyEngine;
try {
  const mod = require('./storageAndSecurityEngine');
  StorageCSIEngine = mod.StorageCSIEngine;
  SecurityPolicyEngine = mod.SecurityPolicyEngine;
} catch {
  StorageCSIEngine = (typeof globalThis !== 'undefined' && globalThis.StorageCSIEngine);
  SecurityPolicyEngine = (typeof globalThis !== 'undefined' && globalThis.SecurityPolicyEngine);
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

let PromQLEngine, LogQLEngine, OTelPipelineValidator, JaegerTraceGenerator, SloBurnRateCalculator;
try {
  const obs = require('./observabilityEngine');
  PromQLEngine = obs.PromQLEngine;
  LogQLEngine = obs.LogQLEngine;
  OTelPipelineValidator = obs.OTelPipelineValidator;
  JaegerTraceGenerator = obs.JaegerTraceGenerator;
  SloBurnRateCalculator = obs.SloBurnRateCalculator;
} catch {
  PromQLEngine = (typeof globalThis !== 'undefined' && globalThis.PromQLEngine);
  LogQLEngine = (typeof globalThis !== 'undefined' && globalThis.LogQLEngine);
  OTelPipelineValidator = (typeof globalThis !== 'undefined' && globalThis.OTelPipelineValidator);
  JaegerTraceGenerator = (typeof globalThis !== 'undefined' && globalThis.JaegerTraceGenerator);
  SloBurnRateCalculator = (typeof globalThis !== 'undefined' && globalThis.SloBurnRateCalculator);
}

let AutoscalingAndMeshEngine, HorizontalPodAutoscalerEngine, VerticalPodAutoscalerEngine, KarpenterEngine, IstioMeshController;
try {
  const asMod = require('./autoscalingAndMeshEngine');
  AutoscalingAndMeshEngine = asMod.AutoscalingAndMeshEngine;
  HorizontalPodAutoscalerEngine = asMod.HorizontalPodAutoscalerEngine;
  VerticalPodAutoscalerEngine = asMod.VerticalPodAutoscalerEngine;
  KarpenterEngine = asMod.KarpenterEngine;
  IstioMeshController = asMod.IstioMeshController;
} catch {
  AutoscalingAndMeshEngine = (typeof globalThis !== 'undefined' && globalThis.AutoscalingAndMeshEngine);
  HorizontalPodAutoscalerEngine = (typeof globalThis !== 'undefined' && globalThis.HorizontalPodAutoscalerEngine);
  VerticalPodAutoscalerEngine = (typeof globalThis !== 'undefined' && globalThis.VerticalPodAutoscalerEngine);
  KarpenterEngine = (typeof globalThis !== 'undefined' && globalThis.KarpenterEngine);
  IstioMeshController = (typeof globalThis !== 'undefined' && globalThis.IstioMeshController);
}

let GitEngine;
try {
  GitEngine = require('./gitEngine').GitEngine;
} catch {
  GitEngine = (typeof globalThis !== 'undefined' && globalThis.GitEngine);
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
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  vpa: 'VerticalPodAutoscaler',
  verticalpodautoscaler: 'VerticalPodAutoscaler',
  verticalpodautoscalers: 'VerticalPodAutoscaler',
  nodepool: 'NodePool',
  nodepools: 'NodePool',
  ec2nodeclass: 'EC2NodeClass',
  ec2nodeclasses: 'EC2NodeClass',
  virtualservice: 'VirtualService',
  virtualservices: 'VirtualService',
  vs: 'VirtualService',
  destinationrule: 'DestinationRule',
  destinationrules: 'DestinationRule',
  dr: 'DestinationRule',
  peerauthentication: 'PeerAuthentication',
  peerauthentications: 'PeerAuthentication',
  pa: 'PeerAuthentication',
  serviceprofile: 'ServiceProfile',
  serviceprofiles: 'ServiceProfile',
  sp: 'ServiceProfile',
  trafficsplit: 'TrafficSplit',
  trafficsplits: 'TrafficSplit',
  ts: 'TrafficSplit',
  servicesplitter: 'ServiceSplitter',
  servicesplitters: 'ServiceSplitter',
  serviceintentions: 'ServiceIntentions',
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
    this.csi = options.csi || (StorageCSIEngine && this.graph ? new StorageCSIEngine(this.graph) : null);
    this.security = options.security || (SecurityPolicyEngine && this.graph ? new SecurityPolicyEngine(this.graph) : null);

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

    // Initialize Observability Engines
    this.promql = options.promql || (PromQLEngine ? new PromQLEngine() : null);
    this.logql = options.logql || (LogQLEngine ? new LogQLEngine() : null);
    this.jaeger = options.jaeger || (JaegerTraceGenerator ? new JaegerTraceGenerator() : null);

    // Initialize Autoscaling & Service Mesh
    this.autoscaling = options.autoscaling || (AutoscalingAndMeshEngine && this.graph ? new AutoscalingAndMeshEngine(this.graph) : null);
    this.hpa = this.autoscaling ? this.autoscaling.hpa : null;
    this.vpa = this.autoscaling ? this.autoscaling.vpa : null;
    this.karpenter = this.autoscaling ? this.autoscaling.karpenter : null;
    this.mesh = this.autoscaling ? this.autoscaling.istio : null;

    // Initialize Git & Simulated Host/Runtime Subsystems
    this.cluster = options.cluster || null;
    this.gitEngine = options.gitEngine || (GitEngine ? new GitEngine({ vfs: this.vfs }) : null);

    // Helm State
    this.helmReleases = (this.cluster && this.cluster.state && this.cluster.state.helmReleases) || [];
    this.helmRepos = {
      bitnami: 'https://charts.bitnami.com/bitnami',
      ingress_nginx: 'https://kubernetes.github.io/ingress-nginx'
    };

    // ArgoCD State
    this.argocdApps = (this.cluster && this.cluster.state && this.cluster.state.argoApps) || [
      {
        name: 'payments-gitops',
        namespace: 'argocd',
        destNamespace: 'production',
        project: 'default',
        repo: 'https://github.com/kubelabs/payments-deploy.git',
        targetRevision: 'main',
        path: 'deploy/prod',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        syncPolicy: 'Automated'
      },
      {
        name: 'guestbook',
        namespace: 'argocd',
        destNamespace: 'default',
        project: 'default',
        repo: 'https://github.com/argoproj/argocd-example-apps.git',
        targetRevision: 'HEAD',
        path: 'guestbook',
        syncStatus: 'Synced',
        healthStatus: 'Healthy',
        syncPolicy: 'Manual'
      }
    ];

    // Flux State
    this.fluxSources = [
      { name: 'podinfo', type: 'git', url: 'https://github.com/stefanprodan/podinfo', branch: 'master', revision: 'master@sha1:123abc4', ready: 'True', status: 'stored artifact for revision' }
    ];
    this.fluxKustomizations = [
      { name: 'apps', path: './k8s/apps', revision: 'main@sha1:e84f291', ready: 'True', suspended: 'False', message: 'Applied revision: main@sha1:e84f291' },
      { name: 'infrastructure', path: './k8s/infra', revision: 'main@sha1:e84f291', ready: 'True', suspended: 'False', message: 'Applied revision: main@sha1:e84f291' }
    ];
    this.fluxHelmReleases = [
      { name: 'redis-cluster', chart: 'redis', version: '6.2.14', ready: 'True', suspended: 'False', message: 'Release reconciliation succeeded' },
      { name: 'ingress-nginx', chart: 'ingress-nginx', version: '4.10.1', ready: 'True', suspended: 'False', message: 'Release reconciliation succeeded' }
    ];

    // OpenTofu / Terraform State
    this.tofuResources = (this.cluster && this.cluster.state && this.cluster.state.terraformState && this.cluster.state.terraformState.resources) || [
      'aws_vpc.main',
      'aws_eks_cluster.prod',
      'aws_s3_bucket.artifacts'
    ];
    this.tofuOutputs = {
      cluster_endpoint: 'https://78A9C12.gr7.us-east-1.eks.amazonaws.com',
      vpc_id: 'vpc-01a2b3c4d5e'
    };

    // Simulated S3
    this.simulatedS3 = {
      buckets: ['kubelabs-tfstate-bucket', 'kubelabs-backup-artifacts'],
      objects: new Map()
    };

    // Velero Backups & Restores
    this.veleroBackups = [
      { name: 'daily-backup-2026-11-10', status: 'Completed', errors: 0, warnings: 0, created: '2026-11-10 02:00:00' }
    ];
    this.veleroRestores = [];

    this.systemdUnits = {
      kubelet: { status: 'active', substate: 'running', pid: 1420, desc: 'kubelet: The Kubernetes Node Agent' },
      containerd: { status: 'active', substate: 'running', pid: 1204, desc: 'containerd container runtime' },
      etcd: { status: 'active', substate: 'running', pid: 940, desc: 'etcd distributed key-value store' },
      docker: { status: 'active', substate: 'running', pid: 1150, desc: 'Docker Application Container Engine' },
      'systemd-resolved': { status: 'active', substate: 'running', pid: 610, desc: 'Network Name Resolution' },
      ssh: { status: 'active', substate: 'running', pid: 720, desc: 'OpenBSD Secure Shell server' }
    };
    this.sysctls = {
      'net.ipv4.ip_forward': '1',
      'net.bridge.bridge-nf-call-iptables': '1',
      'net.bridge.bridge-nf-call-ip6tables': '1',
      'vm.max_map_count': '262144',
      'fs.inotify.max_user_watches': '524288'
    };
    this.lvm = {
      pvs: {
        '/dev/sdb1': { pv: '/dev/sdb1', vg: '', fmt: 'lvm2', attr: 'a--', psize: '100.00g', pfree: '100.00g' }
      },
      vgs: {},
      lvs: {}
    };
    this.netnsList = ['cni-0a1b2c3d4e (id: 0)', 'cni-9f8e7d6c5b (id: 1)'];
    this.simulatedContainers = [
      { id: 'a1b2c3d4e5f6', name: 'k8s_kube-apiserver', image: 'registry.k8s.io/kube-apiserver:v1.31.0', status: 'Up 2 days', ports: '6443/tcp', command: '"kube-apiserver --..."', created: '2 days ago' },
      { id: 'b2c3d4e5f6a1', name: 'k8s_etcd', image: 'registry.k8s.io/etcd:3.5.15-0', status: 'Up 2 days', ports: '2379-2380/tcp', command: '"etcd --..."', created: '2 days ago' },
      { id: 'c3d4e5f6a1b2', name: 'web-gateway', image: 'nginx:1.27-alpine', status: 'Up 5 hours', ports: '0.0.0.0:80->80/tcp', command: '"/docker-entrypoint..."', created: '5 hours ago' }
    ];
    this.simulatedProcesses = [
      { user: 'root', pid: 1, cpu: '0.0', mem: '0.1', vsz: '168920', rss: '12410', tty: '?', stat: 'Ss', start: 'Nov12', time: '0:04', command: '/sbin/init' },
      { user: 'root', pid: 940, cpu: '0.8', mem: '2.1', vsz: '2104520', rss: '145200', tty: '?', stat: 'Ssl', start: 'Nov12', time: '2:15', command: 'etcd --data-dir=/var/lib/etcd' },
      { user: 'root', pid: 1102, cpu: '1.4', mem: '3.4', vsz: '2840120', rss: '280140', tty: '?', stat: 'Ssl', start: 'Nov12', time: '5:42', command: 'kube-apiserver --authorization-mode=Node,RBAC' },
      { user: 'root', pid: 1204, cpu: '0.5', mem: '1.8', vsz: '1940320', rss: '84200', tty: '?', stat: 'Ssl', start: 'Nov12', time: '1:12', command: 'containerd' },
      { user: 'root', pid: 1420, cpu: '0.9', mem: '2.2', vsz: '2210450', rss: '104500', tty: '?', stat: 'Ssl', start: 'Nov12', time: '3:30', command: 'kubelet --container-runtime-endpoint=unix:///run/containerd/containerd.sock' },
      { user: 'learner', pid: 3410, cpu: '0.0', mem: '0.1', vsz: '18420', rss: '4120', tty: 'pts/0', stat: 'Ss', start: '16:00', time: '0:00', command: 'bash' }
    ];

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
    pipelineDriver.registerCommand('kustomize', this.handleKustomize.bind(this));
    pipelineDriver.registerCommand('docker', this.handleDocker.bind(this));
    pipelineDriver.registerCommand('crictl', this.handleCrictl.bind(this));
    pipelineDriver.registerCommand('git', this.handleGit.bind(this));
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
    pipelineDriver.registerCommand('k8sgpt', this.handleK8sGPT.bind(this));
    pipelineDriver.registerCommand('aiops', this.handleAiOps.bind(this));
    pipelineDriver.registerCommand('etcdctl', this.handleEtcdctl.bind(this));
    pipelineDriver.registerCommand('kubeadm', this.handleKubeadm.bind(this));
    pipelineDriver.registerCommand('cilium', this.handleCilium.bind(this));
    pipelineDriver.registerCommand('linkerd', this.handleLinkerd.bind(this));
    pipelineDriver.registerCommand('flux', this.handleFlux.bind(this));
    pipelineDriver.registerCommand('velero', this.handleVelero.bind(this));
    pipelineDriver.registerCommand('vcluster', this.handleVcluster.bind(this));
    pipelineDriver.registerCommand('promql', this.handlePromql.bind(this));
    pipelineDriver.registerCommand('promtool', this.handlePromtool.bind(this));
    pipelineDriver.registerCommand('logql', this.handleLogql.bind(this));
    pipelineDriver.registerCommand('logcli', this.handleLogcli.bind(this));
    pipelineDriver.registerCommand('otelcol', this.handleOtelcol.bind(this));
    pipelineDriver.registerCommand('curl', this.handleCurl.bind(this));
    pipelineDriver.registerCommand('dig', this.handleDig.bind(this));
    pipelineDriver.registerCommand('nslookup', this.handleNslookup.bind(this));
    pipelineDriver.registerCommand('traceroute', this.handleTraceroute.bind(this));
    pipelineDriver.registerCommand('ip', this.handleIp.bind(this));
    pipelineDriver.registerCommand('iptables', this.handleIptables.bind(this));
    pipelineDriver.registerCommand('ss', this.handleSs.bind(this));
    pipelineDriver.registerCommand('nc', this.handleNc.bind(this));
    pipelineDriver.registerCommand('netcat', this.handleNc.bind(this));
    pipelineDriver.registerCommand('ping', this.handlePing.bind(this));
    pipelineDriver.registerCommand('ps', this.handlePs.bind(this));
    pipelineDriver.registerCommand('kill', this.handleKill.bind(this));
    pipelineDriver.registerCommand('systemctl', this.handleSystemctl.bind(this));
    pipelineDriver.registerCommand('journalctl', this.handleJournalctl.bind(this));
    pipelineDriver.registerCommand('sysctl', this.handleSysctl.bind(this));
    pipelineDriver.registerCommand('unshare', this.handleUnshare.bind(this));
    pipelineDriver.registerCommand('pvcreate', this.handlePvcreate.bind(this));
    pipelineDriver.registerCommand('pvs', this.handlePvs.bind(this));
    pipelineDriver.registerCommand('pvdisplay', this.handlePvs.bind(this));
    pipelineDriver.registerCommand('vgcreate', this.handleVgcreate.bind(this));
    pipelineDriver.registerCommand('vgs', this.handleVgs.bind(this));
    pipelineDriver.registerCommand('vgdisplay', this.handleVgs.bind(this));
    pipelineDriver.registerCommand('lvcreate', this.handleLvcreate.bind(this));
    pipelineDriver.registerCommand('lvs', this.handleLvs.bind(this));
    pipelineDriver.registerCommand('lvdisplay', this.handleLvs.bind(this));
    pipelineDriver.registerCommand('top', this.handleTop.bind(this));
    pipelineDriver.registerCommand('df', this.handleDf.bind(this));
    pipelineDriver.registerCommand('free', this.handleFree.bind(this));
    pipelineDriver.registerCommand('uname', this.handleUname.bind(this));
    pipelineDriver.registerCommand('whoami', () => ({ stdout: 'learner\n', stderr: '', code: 0 }));
    pipelineDriver.registerCommand('id', () => ({ stdout: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),999(docker)\n', stderr: '', code: 0 }));
    pipelineDriver.registerCommand('ls', this.handleLs.bind(this));
    pipelineDriver.registerCommand('cd', this.handleCd.bind(this));
    pipelineDriver.registerCommand('pwd', this.handlePwd.bind(this));
    pipelineDriver.registerCommand('cat', this.handleCat.bind(this));
    pipelineDriver.registerCommand('mkdir', this.handleMkdir.bind(this));
    pipelineDriver.registerCommand('rm', this.handleRm.bind(this));
    pipelineDriver.registerCommand('cp', this.handleCp.bind(this));
    pipelineDriver.registerCommand('mv', this.handleMv.bind(this));
    pipelineDriver.registerCommand('chmod', this.handleChmod.bind(this));
    pipelineDriver.registerCommand('chown', this.handleChown.bind(this));
    pipelineDriver.registerCommand('ln', this.handleLn.bind(this));
    pipelineDriver.registerCommand('find', this.handleFind.bind(this));
    pipelineDriver.registerCommand('env', this.handleEnv.bind(this));
    pipelineDriver.registerCommand('export', this.handleExport.bind(this));
    pipelineDriver.registerCommand('echo', this.handleEcho.bind(this));
  }

  /**
   * Directly executes a command string against registered CLI handlers
   */
  executeCommand(cmdStr, options = {}) {
    if (!cmdStr || typeof cmdStr !== 'string') return { stdout: '', stderr: 'Empty command\n', code: 1 };
    const parts = cmdStr.trim().split(/\s+/);
    const bin = parts[0];
    const handlers = {
      kubectl: this.handleKubectl.bind(this),
      k: this.handleKubectl.bind(this),
      helm: this.handleHelm.bind(this),
      kustomize: this.handleKustomize.bind(this),
      docker: this.handleDocker.bind(this),
      crictl: this.handleCrictl.bind(this),
      git: this.handleGit.bind(this),
      argocd: this.handleArgoCD.bind(this),
      istioctl: this.handleIstioctl.bind(this),
      tofu: this.handleTofu.bind(this),
      terraform: this.handleTofu.bind(this),
      aws: this.handleAws.bind(this),
      az: this.handleAzure.bind(this),
      gcloud: this.handleGcloud.bind(this),
      trivy: this.handleTrivy.bind(this),
      falco: this.handleFalco.bind(this),
      cosign: this.handleCosign.bind(this),
      k8sgpt: this.handleK8sGPT.bind(this),
      aiops: this.handleAiOps.bind(this),
      etcdctl: this.handleEtcdctl.bind(this),
      kubeadm: this.handleKubeadm.bind(this),
      cilium: this.handleCilium.bind(this),
      linkerd: this.handleLinkerd.bind(this),
      flux: this.handleFlux.bind(this),
      velero: this.handleVelero.bind(this),
      vcluster: this.handleVcluster.bind(this),
      promql: this.handlePromql.bind(this),
      promtool: this.handlePromtool.bind(this),
      logql: this.handleLogql.bind(this),
      logcli: this.handleLogcli.bind(this),
      otelcol: this.handleOtelcol.bind(this),
      curl: this.handleCurl.bind(this),
      dig: this.handleDig.bind(this),
      nslookup: this.handleNslookup.bind(this),
      traceroute: this.handleTraceroute.bind(this),
      ip: this.handleIp.bind(this),
      iptables: this.handleIptables.bind(this),
      ss: this.handleSs.bind(this),
      nc: this.handleNc.bind(this),
      netcat: this.handleNc.bind(this),
      ping: this.handlePing.bind(this),
      ps: this.handlePs.bind(this),
      kill: this.handleKill.bind(this),
      systemctl: this.handleSystemctl.bind(this),
      journalctl: this.handleJournalctl.bind(this),
      sysctl: this.handleSysctl.bind(this),
      unshare: this.handleUnshare.bind(this),
      pvcreate: this.handlePvcreate.bind(this),
      pvs: this.handlePvs.bind(this),
      pvdisplay: this.handlePvs.bind(this),
      vgcreate: this.handleVgcreate.bind(this),
      vgs: this.handleVgs.bind(this),
      vgdisplay: this.handleVgs.bind(this),
      lvcreate: this.handleLvcreate.bind(this),
      lvs: this.handleLvs.bind(this),
      lvdisplay: this.handleLvs.bind(this),
      top: this.handleTop.bind(this),
      df: this.handleDf.bind(this),
      free: this.handleFree.bind(this),
      uname: this.handleUname.bind(this),
      whoami: () => ({ stdout: 'learner\n', stderr: '', code: 0 }),
      id: () => ({ stdout: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),999(docker)\n', stderr: '', code: 0 }),
      ls: this.handleLs.bind(this),
      cd: this.handleCd.bind(this),
      pwd: this.handlePwd.bind(this),
      cat: this.handleCat.bind(this),
      mkdir: this.handleMkdir.bind(this),
      rm: this.handleRm.bind(this),
      cp: this.handleCp.bind(this),
      mv: this.handleMv.bind(this),
      chmod: this.handleChmod.bind(this),
      chown: this.handleChown.bind(this),
      ln: this.handleLn.bind(this),
      find: this.handleFind.bind(this),
      env: this.handleEnv.bind(this),
      export: this.handleExport.bind(this),
      echo: this.handleEcho.bind(this)
    };

    const handler = handlers[bin];
    if (handler) {
      return handler({ argv: parts, stdin: options.stdin || '', vfs: this.vfs, cwd: options.cwd || '/' });
    }
    return { stdout: '', stderr: `command not found: ${bin}\n`, code: 127 };
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
    let force = false;
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
      } else if (a === '--force') {
        force = true;
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
      case 'replace':
        return this._kubectlReplace({ restArgs, namespace, filename, stdin, vfs, cwd, force });
      case 'create':
        return this._kubectlCreate({ restArgs, namespace, filename, stdin, vfs, cwd, replicas });
      case 'delete':
        return this._kubectlDelete({ restArgs, namespace, filename, stdin, vfs, cwd });
      case 'scale':
        return this._kubectlScale({ restArgs, namespace, replicas });
      case 'set':
        return this._kubectlSet({ restArgs, namespace });
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
        return this._kubectlTop({ restArgs, namespace, allNamespaces });
      case 'edit':
        return this._kubectlEdit({ restArgs, namespace });
      case 'autoscale':
        return this._kubectlAutoscale({ restArgs, namespace, dryRun, outputFormat });
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
    } else if (kind === 'HorizontalPodAutoscaler') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE']
        : ['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'];

      const rows = resources.map((h) => {
        const ref = h.spec?.scaleTargetRef
          ? `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}`
          : '<none>';

        let targets = '<unknown>';
        const specMetric = h.spec?.metrics?.[0];
        const statusMetric = h.status?.currentMetrics?.[0];

        if (specMetric?.type === 'Resource' && specMetric.resource?.target?.averageUtilization !== undefined) {
          const targetUtil = `${specMetric.resource.target.averageUtilization}%`;
          const curUtil = statusMetric?.resource?.current?.averageUtilization !== undefined
            ? `${statusMetric.resource.current.averageUtilization}%`
            : '<unknown>';
          targets = `${curUtil}/${targetUtil}`;
        } else if (specMetric?.type === 'Resource' && specMetric.resource?.target?.averageValue) {
          const targetAvg = specMetric.resource.target.averageValue;
          const curAvg = statusMetric?.resource?.current?.averageValue || '<unknown>';
          targets = `${curAvg}/${targetAvg}`;
        } else if (specMetric?.type === 'Pods') {
          const targetAvg = specMetric.pods?.target?.averageValue || '100';
          const curAvg = statusMetric?.pods?.current?.averageValue || '<unknown>';
          targets = `${curAvg}/${targetAvg}`;
        }

        const minPods = String(h.spec?.minReplicas !== undefined ? h.spec.minReplicas : 1);
        const maxPods = String(h.spec?.maxReplicas !== undefined ? h.spec.maxReplicas : 10);
        const replicas = String(h.status?.currentReplicas !== undefined ? h.status.currentReplicas : (h.status?.desiredReplicas || 0));
        const row = [h.metadata?.name, ref, targets, minPods, maxPods, replicas, '1d'];
        if (allNamespaces) row.unshift(h.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'VerticalPodAutoscaler') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'MODE', 'CPU', 'MEM', 'PROVIDED', 'AGE']
        : ['NAME', 'MODE', 'CPU', 'MEM', 'PROVIDED', 'AGE'];

      const rows = resources.map((v) => {
        const mode = v.spec?.updatePolicy?.updateMode || 'Auto';
        const rec = v.status?.recommendation?.containerRecommendations?.[0];
        const cpu = rec?.target?.cpu || '<unknown>';
        const mem = rec?.target?.memory || '<unknown>';
        const cond = (v.status?.conditions || []).find((c) => c.type === 'RecommendationProvided');
        const provided = cond?.status === 'True' ? 'True' : 'False';
        const row = [v.metadata?.name, mode, cpu, mem, provided, '1d'];
        if (allNamespaces) row.unshift(v.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'NodePool') {
      const headers = ['NAME', 'NODECLASS', 'NODES', 'READY', 'AGE'];
      const rows = resources.map((np) => {
        const nodeClass = np.spec?.template?.spec?.nodeClassRef?.name || 'default';
        const nodesCount = '1';
        const ready = 'True';
        return [np.metadata?.name, nodeClass, nodesCount, ready, '2d'];
      });
      table = this._formatTable(headers, rows);
    } else if (kind === 'VirtualService') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'GATEWAYS', 'HOSTS', 'AGE']
        : ['NAME', 'GATEWAYS', 'HOSTS', 'AGE'];

      const rows = resources.map((vs) => {
        const gws = (vs.spec?.gateways || ['mesh']).join(',');
        const hosts = (vs.spec?.hosts || ['*']).join(',');
        const row = [vs.metadata?.name, gws, hosts, '1d'];
        if (allNamespaces) row.unshift(vs.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'DestinationRule') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'HOST', 'AGE']
        : ['NAME', 'HOST', 'AGE'];

      const rows = resources.map((dr) => {
        const host = dr.spec?.host || '<none>';
        const row = [dr.metadata?.name, host, '1d'];
        if (allNamespaces) row.unshift(dr.metadata?.namespace || 'default');
        return row;
      });

      table = this._formatTable(headers, rows);
    } else if (kind === 'PeerAuthentication') {
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'MODE', 'AGE']
        : ['NAME', 'MODE', 'AGE'];

      const rows = resources.map((pa) => {
        const mode = pa.spec?.mtls?.mode || 'PERMISSIVE';
        const row = [pa.metadata?.name, mode, '1d'];
        if (allNamespaces) row.unshift(pa.metadata?.namespace || 'default');
        return row;
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

    if (kind === 'HorizontalPodAutoscaler') {
      const ref = res.spec?.scaleTargetRef
        ? `${res.spec.scaleTargetRef.kind}/${res.spec.scaleTargetRef.name}`
        : '<none>';
      const minPods = res.spec?.minReplicas !== undefined ? res.spec.minReplicas : 1;
      const maxPods = res.spec?.maxReplicas !== undefined ? res.spec.maxReplicas : 10;
      const curReplicas = res.status?.currentReplicas !== undefined ? res.status.currentReplicas : 0;
      const desReplicas = res.status?.desiredReplicas !== undefined ? res.status.desiredReplicas : curReplicas;

      const lines = [
        `Name:                                                  ${res.metadata?.name}`,
        `Namespace:                                             ${res.metadata?.namespace || 'default'}`,
        `Labels:                                                ${labels}`,
        `Annotations:                                           <none>`,
        `CreationTimestamp:                                     ${res.metadata?.creationTimestamp || 'Mon, 01 Jan 2026 00:00:00 +0000'}`,
        `Reference:                                             ${ref}`,
        `Metrics:                                               ( current / target )`,
        `  resource cpu on pods  (as a percentage of request):  ${res.status?.currentMetrics?.[0]?.resource?.current?.averageUtilization !== undefined ? res.status.currentMetrics[0].resource.current.averageUtilization + '%' : '<unknown>'} / ${res.spec?.metrics?.[0]?.resource?.target?.averageUtilization || 80}%`,
        `Min replicas:                                          ${minPods}`,
        `Max replicas:                                          ${maxPods}`,
        `Deployment pods:                                       ${curReplicas} current / ${desReplicas} desired`,
        `Conditions:`
      ];
      if (Array.isArray(res.status?.conditions) && res.status.conditions.length > 0) {
        lines.push('  Type            Status  Reason              Message');
        lines.push('  ----            ------  ------              -------');
        for (const c of res.status.conditions) {
          lines.push(`  ${c.type.padEnd(15)} ${c.status.padEnd(7)} ${(c.reason || '').padEnd(19)} ${c.message || ''}`);
        }
      }
      lines.push('Events:           <none>');
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

    if (kind === 'VerticalPodAutoscaler') {
      const mode = res.spec?.updatePolicy?.updateMode || 'Auto';
      const lines = [
        `Name:         ${res.metadata?.name}`,
        `Namespace:    ${res.metadata?.namespace || 'default'}`,
        `Labels:       ${labels}`,
        `Annotations:  <none>`,
        `API Version:  autoscaling.k8s.io/v1`,
        `Kind:         VerticalPodAutoscaler`,
        `Spec:`,
        `  Target Ref:`,
        `    Kind:  ${res.spec?.targetRef?.kind || 'Deployment'}`,
        `    Name:  ${res.spec?.targetRef?.name || '<none>'}`,
        `  Update Policy:`,
        `    Update Mode:  ${mode}`,
        `Status:`,
        `  Recommendation:`
      ];
      const recs = res.status?.recommendation?.containerRecommendations || [];
      if (recs.length > 0) {
        lines.push('    Container Recommendations:');
        for (const r of recs) {
          lines.push(`      Container Name:  ${r.containerName}`);
          lines.push(`      Target:`);
          lines.push(`        Cpu:     ${r.target?.cpu}`);
          lines.push(`        Memory:  ${r.target?.memory}`);
          lines.push(`      Lower Bound:`);
          lines.push(`        Cpu:     ${r.lowerBound?.cpu}`);
          lines.push(`        Memory:  ${r.lowerBound?.memory}`);
          lines.push(`      Upper Bound:`);
          lines.push(`        Cpu:     ${r.upperBound?.cpu}`);
          lines.push(`        Memory:  ${r.upperBound?.memory}`);
        }
      }
      lines.push('Events:  <none>');
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

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
    if (!dryRun) {
      if (this.controllerManager) this.controllerManager.reconcile();
      if (this.csi && typeof this.csi.reconcileStorage === 'function') this.csi.reconcileStorage();
      if (this.networking && typeof this.networking.syncServicesAndEndpoints === 'function') this.networking.syncServicesAndEndpoints();
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

  _kubectlReplace({ restArgs = [], namespace = 'default', filename = null, stdin = '', vfs = null, cwd = '/home/learner', force = false }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };

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
      const kind = normalizeKind(doc.kind);
      const ns = doc.metadata?.namespace || namespace || 'default';
      const name = doc.metadata.name;

      const group = doc.apiVersion && doc.apiVersion.includes('/')
        ? doc.apiVersion.split('/')[0]
        : (kind === 'Deployment' || kind === 'ReplicaSet' || kind === 'StatefulSet' || kind === 'DaemonSet' ? 'apps' : '');
      const resId = group ? `${kind.toLowerCase()}.${group}/${name}` : `${kind.toLowerCase()}/${name}`;

      const existing = this.graph.get(kind, ns, name) || this.graph.get(kind, null, name);
      if (!existing) {
        return {
          stdout: '',
          stderr: `Error from server (NotFound): error when replacing "${filename || 'STDIN'}": ${kind.toLowerCase()}s${group ? '.' + group : ''} "${name}" not found\n`,
          code: 1
        };
      }

      if (force) {
        this.graph.delete(kind, ns, name);
        this.graph.create(doc);
      } else {
        this.graph.update(doc);
      }
      outputLines.push(`${resId} replaced`);
    }

    if (this.controllerManager) this.controllerManager.reconcile();
    return { stdout: outputLines.join('\n') + '\n', stderr: '', code: 0 };
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

  _kubectlSet({ restArgs = [], namespace = 'default' }) {
    if (!this.graph) return { stdout: '', stderr: 'No resource graph active\n', code: 1 };
    const setType = restArgs[0];
    if (!setType) {
      return { stdout: '', stderr: 'error: you must specify a subcommand for set (image, env, resources, selector)\n', code: 1 };
    }

    function getContainers(targetRes) {
      let list = null;
      if (targetRes.kind === 'Pod') {
        targetRes.spec = targetRes.spec || {};
        if (Array.isArray(targetRes.spec.containers)) list = targetRes.spec.containers;
        else if (targetRes.spec.containers && typeof targetRes.spec.containers === 'object') list = targetRes.spec.containers = Object.values(targetRes.spec.containers);
        else if (targetRes.spec['- name']) list = targetRes.spec.containers = [{ name: targetRes.spec['- name'], image: targetRes.spec.image || 'nginx:latest' }];
        else list = targetRes.spec.containers = [{ name: targetRes.metadata?.name || 'app', image: 'nginx:latest' }];
      } else {
        targetRes.spec = targetRes.spec || {};
        targetRes.spec.template = targetRes.spec.template || {};
        targetRes.spec.template.spec = targetRes.spec.template.spec || {};
        const s = targetRes.spec.template.spec;
        if (Array.isArray(s.containers)) list = s.containers;
        else if (s.containers && typeof s.containers === 'object') list = s.containers = Object.values(s.containers);
        else if (s['- name']) list = s.containers = [{ name: s['- name'], image: s.image || 'nginx:latest' }];
        else list = s.containers = [{ name: targetRes.metadata?.name || 'app', image: 'nginx:latest' }];
      }
      return list;
    }

    if (setType === 'image') {
      const target = restArgs[1];
      const assign = restArgs[2];
      if (!target || !assign) {
        return { stdout: '', stderr: 'error: Usage: kubectl set image <type>/<name> <container>=<image>\n', code: 1 };
      }
      let kind = 'Deployment';
      let name = target;
      let kvToken = assign;
      if (target.includes('/')) {
        const parts = target.split('/');
        kind = normalizeKind(parts[0]);
        name = parts[1];
      } else if (restArgs.length >= 4 && !restArgs[2].includes('=')) {
        kind = normalizeKind(restArgs[1]);
        name = restArgs[2];
        kvToken = restArgs[3];
      }
      if (!kvToken || !kvToken.includes('=')) {
        return { stdout: '', stderr: 'error: Usage: kubectl set image <type>/<name> <container>=<image>\n', code: 1 };
      }
      const [containerName, newImage] = kvToken.split('=');
      const res = this.graph.get(kind, namespace, name);
      if (!res) {
        return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
      }
      const containers = getContainers(res);
      for (const c of containers) {
        if (!containerName || containerName === '*' || c.name === containerName) {
          c.image = newImage;
        }
      }
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()}.apps/${name} image updated\n`, stderr: '', code: 0 };
    }

    if (setType === 'env') {
      const target = restArgs[1];
      let kind = 'Deployment';
      let name = target;
      let kvStart = 2;
      if (target.includes('/')) {
        const parts = target.split('/');
        kind = normalizeKind(parts[0]);
        name = parts[1];
      } else if (restArgs.length >= 3 && !restArgs[2].includes('=')) {
        kind = normalizeKind(restArgs[1]);
        name = restArgs[2];
        kvStart = 3;
      }
      const assigns = restArgs.slice(kvStart);
      if (!target || assigns.length === 0) {
        return { stdout: '', stderr: 'error: Usage: kubectl set env <type>/<name> KEY=VAL ...\n', code: 1 };
      }
      const res = this.graph.get(kind, namespace, name);
      if (!res) {
        return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
      }
      const containers = getContainers(res);
      if (containers.length > 0) {
        containers[0].env = containers[0].env || [];
        for (const assign of assigns) {
          if (!assign.includes('=')) continue;
          const [k, v] = assign.split('=');
          const existing = containers[0].env.find((e) => e.name === k);
          if (existing) existing.value = v;
          else containers[0].env.push({ name: k, value: v });
        }
      }
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()}.apps/${name} env updated\n`, stderr: '', code: 0 };
    }

    if (setType === 'resources') {
      const target = restArgs[1];
      let kind = 'Deployment';
      let name = target;
      if (target.includes('/')) {
        const parts = target.split('/');
        kind = normalizeKind(parts[0]);
        name = parts[1];
      } else if (restArgs.length >= 3 && !restArgs[2].startsWith('--')) {
        kind = normalizeKind(restArgs[1]);
        name = restArgs[2];
      }
      const res = this.graph.get(kind, namespace, name);
      if (!res) {
        return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
      }
      const containers = getContainers(res);
      if (containers.length > 0) {
        containers[0].resources = containers[0].resources || {};
        for (let i = 2; i < restArgs.length; i++) {
          const a = restArgs[i];
          if (a.startsWith('--limits=')) {
            const pairs = a.slice(9).split(',');
            containers[0].resources.limits = containers[0].resources.limits || {};
            for (const p of pairs) {
              const [k, v] = p.split('=');
              if (k && v) containers[0].resources.limits[k] = v;
            }
          } else if (a.startsWith('--requests=')) {
            const pairs = a.slice(11).split(',');
            containers[0].resources.requests = containers[0].resources.requests || {};
            for (const p of pairs) {
              const [k, v] = p.split('=');
              if (k && v) containers[0].resources.requests[k] = v;
            }
          }
        }
      }
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()}.apps/${name} resource requirements updated\n`, stderr: '', code: 0 };
    }

    if (setType === 'selector') {
      const target = restArgs[1];
      let kind = 'Service';
      let name = target;
      let assign = restArgs[2];
      if (target.includes('/')) {
        const parts = target.split('/');
        kind = normalizeKind(parts[0]);
        name = parts[1];
      } else if (restArgs.length >= 4 && !restArgs[2].includes('=')) {
        kind = normalizeKind(restArgs[1]);
        name = restArgs[2];
        assign = restArgs[3];
      }
      if (!assign || !assign.includes('=')) {
        return { stdout: '', stderr: 'error: Usage: kubectl set selector <type>/<name> <key>=<val>\n', code: 1 };
      }
      const [k, v] = assign.split('=');
      const res = this.graph.get(kind, namespace, name);
      if (!res) {
        return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
      }
      if (normalizeKind(kind) === 'Service') {
        res.spec = res.spec || {};
        res.spec.selector = res.spec.selector || {};
        res.spec.selector[k] = v;
      } else {
        res.spec = res.spec || {};
        res.spec.selector = res.spec.selector || {};
        res.spec.selector.matchLabels = res.spec.selector.matchLabels || {};
        res.spec.selector.matchLabels[k] = v;
        if (res.spec.template?.metadata?.labels) {
          res.spec.template.metadata.labels[k] = v;
        }
      }
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `${kind.toLowerCase()}/${name} selector updated\n`, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `error: unknown command "${setType}" for "kubectl set"\n`, code: 1 };
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
    } else if (restArgs.length >= 3 && !restArgs[1].startsWith('-')) {
      kind = normalizeKind(restArgs[1]);
      name = restArgs[2];
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) {
      return { stdout: '', stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
    }

    if (sub === 'status') {
      const ready = res.status?.readyReplicas || 0;
      const desired = res.spec?.replicas || 1;
      if (ready >= desired) {
        return { stdout: `deployment "${name}" successfully rolled out\n`, stderr: '', code: 0 };
      }
      return { stdout: `Waiting for deployment "${name}" rollout to finish: ${ready} of ${desired} updated replicas are available...\n`, stderr: '', code: 0 };
    }

    if (sub === 'restart') {
      res.spec.template = res.spec.template || {};
      res.spec.template.metadata = res.spec.template.metadata || {};
      res.spec.template.metadata.annotations = res.spec.template.metadata.annotations || {};
      res.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
      this.graph.update(res);
      if (this.controllerManager) this.controllerManager.reconcile();
      return { stdout: `deployment.apps/${name} restarted\n`, stderr: '', code: 0 };
    }

    if (sub === 'history') {
      return {
        stdout: `deployment.apps/${name}\nREVISION  CHANGE-CAUSE\n1         <none>\n2         kubectl set image ...\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'undo') {
      let rev = null;
      for (const a of restArgs) {
        if (a.startsWith('--to-revision=')) rev = a.split('=')[1];
      }
      const msg = rev
        ? `deployment.apps/${name} rolled back to revision ${rev}\n`
        : `deployment.apps/${name} rolled back\n`;
      return { stdout: msg, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `error: unknown rollout subcommand "${sub}"\n`, code: 1 };
  }

  _kubectlLogs({ restArgs, namespace }) {
    let target = '';
    let container = null;
    let tail = null;

    for (let i = 0; i < restArgs.length; i++) {
      const a = restArgs[i];
      if (a === '-c' || a === '--container') container = restArgs[++i];
      else if (a.startsWith('-c=') || a.startsWith('--container=')) container = a.split('=')[1];
      else if (a === '--tail') tail = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--tail=')) tail = parseInt(a.split('=')[1], 10);
      else if (!a.startsWith('-') && !target) target = a;
    }

    if (!target) return { stdout: '', stderr: 'error: pod name required for logs\n', code: 1 };

    let kind = 'Pod';
    let podName = target;
    if (target.includes('/')) {
      const parts = target.split('/');
      kind = normalizeKind(parts[0]);
      podName = parts[1];
    }

    let pod = null;
    if (kind === 'Pod') {
      pod = this.graph.get('Pod', namespace, podName);
    } else if (kind === 'Deployment') {
      const pods = this.graph.list('Pod', namespace);
      pod = pods.find((p) => p.metadata?.name?.startsWith(podName) || p.metadata?.labels?.app === podName);
    }

    if (!pod) return { stdout: '', stderr: `Error from server (NotFound): pods "${target}" not found\n`, code: 1 };

    const cName = container || pod.spec?.containers?.[0]?.name || podName;
    const now = new Date().toISOString();
    const logLines = [
      `[INFO] ${now} Starting ${pod.metadata?.name} (container: ${cName})...`,
      `[INFO] ${now} Listening on port 8080`,
      `[INFO] ${now} Health check probe succeeded on /healthz`,
      `[INFO] ${now} Serving requests in namespace ${namespace}`
    ];

    const outputLines = tail ? logLines.slice(-tail) : logLines;
    return { stdout: outputLines.join('\n') + '\n', stderr: '', code: 0 };
  }

  _kubectlExec({ restArgs, namespace }) {
    let podName = '';
    let container = null;
    const dDash = restArgs.indexOf('--');
    const flagArgs = dDash !== -1 ? restArgs.slice(0, dDash) : restArgs;
    const cmdTokens = dDash !== -1 ? restArgs.slice(dDash + 1) : ['sh'];

    for (let i = 0; i < flagArgs.length; i++) {
      const a = flagArgs[i];
      if (a === '-c' || a === '--container') container = flagArgs[++i];
      else if (a.startsWith('-c=') || a.startsWith('--container=')) container = a.split('=')[1];
      else if (a === '-it' || a === '-i' || a === '-t') { /* terminal flags */ }
      else if (!a.startsWith('-') && !podName) podName = a;
    }

    if (!podName) return { stdout: '', stderr: 'error: pod name required for exec\n', code: 1 };
    if (podName.includes('/')) podName = podName.split('/')[1];

    const pod = this.graph.get('Pod', namespace, podName);
    if (!pod) return { stdout: '', stderr: `Error from server (NotFound): pods "${podName}" not found\n`, code: 1 };

    const phase = pod.status?.phase || 'Running';
    if (phase !== 'Running') {
      return { stdout: '', stderr: `error: unable to upgrade connection: container not running (pod phase is ${phase})\n`, code: 1 };
    }

    const cmd = cmdTokens.join(' ');
    const bin = cmdTokens[0] || 'sh';

    if (bin === 'hostname') {
      return { stdout: `${podName}\n`, stderr: '', code: 0 };
    }
    if (bin === 'whoami') {
      return { stdout: 'root\n', stderr: '', code: 0 };
    }
    if (bin === 'id') {
      return { stdout: 'uid=0(root) gid=0(root) groups=0(root)\n', stderr: '', code: 0 };
    }
    if (bin === 'uname' || cmd.startsWith('uname')) {
      return { stdout: `Linux ${podName} 6.8.0-cloud-native #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n`, stderr: '', code: 0 };
    }
    if (cmd === 'cat /etc/os-release') {
      return {
        stdout: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.0\nPRETTY_NAME="Alpine Linux v3.20"\n',
        stderr: '',
        code: 0
      };
    }
    if (bin === 'env') {
      const lines = [`HOSTNAME=${podName}`, 'SHLVL=1', 'HOME=/root', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'];
      const containers = pod.spec?.containers || [];
      for (const c of containers) {
        for (const e of c.env || []) lines.push(`${e.name}=${e.value}`);
      }
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }
    if (bin === 'ls') {
      return { stdout: 'bin  dev  etc  home  lib  proc  root  sys  tmp  usr  var\n', stderr: '', code: 0 };
    }
    if (bin === 'echo') {
      const text = cmdTokens.slice(1).join(' ').replace(/^['"]|['"]$/g, '');
      return { stdout: `${text}\n`, stderr: '', code: 0 };
    }
    if (bin === 'curl') {
      return { stdout: 'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nOK\n', stderr: '', code: 0 };
    }

    return { stdout: `Executing '${cmd}' in pod ${podName} (${namespace}):\nOK\n`, stderr: '', code: 0 };
  }

  _kubectlPatch({ restArgs, namespace }) {
    const target = restArgs[0] || '';
    let patchJson = '';
    for (let i = 1; i < restArgs.length; i++) {
      if (restArgs[i] === '-p' || restArgs[i] === '--patch') patchJson = restArgs[++i];
      else if (restArgs[i].startsWith('-p=')) patchJson = restArgs[i].slice(3);
      else if (restArgs[i].startsWith('--patch=')) patchJson = restArgs[i].slice(8);
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
    let kind = 'Pod';
    let name = '';
    let kvStartIndex = 1;
    const target = restArgs[0] || '';

    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
      kvStartIndex = 1;
    } else if (restArgs.length >= 2 && !restArgs[1].includes('=') && !restArgs[1].endsWith('-') && !restArgs[1].startsWith('-')) {
      kind = normalizeKind(restArgs[0]);
      name = restArgs[1];
      kvStartIndex = 2;
    } else {
      name = target;
      kvStartIndex = 1;
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) return { stdout: '', stderr: `Error: ${kind} "${name}" not found\n`, code: 1 };
    res.metadata = res.metadata || {};
    res.metadata.labels = res.metadata.labels || {};

    let modified = 0;
    for (let i = kvStartIndex; i < restArgs.length; i++) {
      const token = restArgs[i];
      if (token === '--overwrite' || token.startsWith('--')) continue;
      if (token.endsWith('-')) {
        delete res.metadata.labels[token.slice(0, -1)];
        modified++;
      } else if (token.includes('=')) {
        const [k, v] = token.split('=');
        res.metadata.labels[k] = v;
        modified++;
      }
    }

    if (modified === 0) {
      return { stdout: '', stderr: 'error: label requires target and key=val or key-\n', code: 1 };
    }

    this.graph.update(res);
    return { stdout: `${kind.toLowerCase()}/${name} labeled\n`, stderr: '', code: 0 };
  }

  _kubectlAnnotate({ restArgs, namespace }) {
    let kind = 'Pod';
    let name = '';
    let kvStartIndex = 1;
    const target = restArgs[0] || '';

    if (target.includes('/')) {
      const p = target.split('/');
      kind = normalizeKind(p[0]);
      name = p[1];
      kvStartIndex = 1;
    } else if (restArgs.length >= 2 && !restArgs[1].includes('=') && !restArgs[1].endsWith('-') && !restArgs[1].startsWith('-')) {
      kind = normalizeKind(restArgs[0]);
      name = restArgs[1];
      kvStartIndex = 2;
    } else {
      name = target;
      kvStartIndex = 1;
    }

    const res = this.graph.get(kind, namespace, name);
    if (!res) return { stdout: '', stderr: `Error: ${kind} "${name}" not found\n`, code: 1 };
    res.metadata = res.metadata || {};
    res.metadata.annotations = res.metadata.annotations || {};

    let modified = 0;
    for (let i = kvStartIndex; i < restArgs.length; i++) {
      const token = restArgs[i];
      if (token === '--overwrite' || token.startsWith('--')) continue;
      if (token.endsWith('-')) {
        delete res.metadata.annotations[token.slice(0, -1)];
        modified++;
      } else if (token.includes('=')) {
        const eq = token.indexOf('=');
        res.metadata.annotations[token.slice(0, eq)] = token.slice(eq + 1);
        modified++;
      }
    }

    if (modified === 0) {
      return { stdout: '', stderr: 'error: annotate requires target and key=val or key-\n', code: 1 };
    }

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
      let verb = null;
      let resource = null;
      let user = 'kubernetes-admin';
      const groups = [];

      for (let i = 1; i < restArgs.length; i++) {
        const arg = restArgs[i];
        if (arg.startsWith('--as=')) {
          user = arg.slice(5);
        } else if (arg === '--as' && i + 1 < restArgs.length) {
          user = restArgs[++i];
        } else if (arg.startsWith('--as-group=')) {
          groups.push(arg.slice(11));
        } else if (arg === '--as-group' && i + 1 < restArgs.length) {
          groups.push(restArgs[++i]);
        } else if (!arg.startsWith('-')) {
          if (!verb) verb = arg;
          else if (!resource) resource = arg;
        }
      }

      if (this.security && typeof this.security.can === 'function') {
        const authRes = this.security.can({
          user,
          groups,
          verb: verb || 'get',
          resource: resource || 'pods',
          namespace: namespace || 'default'
        });
        return { stdout: authRes.allowed ? 'yes\n' : 'no\n', stderr: '', code: authRes.allowed ? 0 : 1 };
      }

      if (this.controllerManager && typeof this.controllerManager.can === 'function') {
        const allowed = this.controllerManager.can({
          verb: verb || 'get',
          resource: resource || 'pods',
          namespace: namespace || 'default'
        });
        return { stdout: allowed ? 'yes\n' : 'no\n', stderr: '', code: allowed ? 0 : 1 };
      }

      return { stdout: 'yes\n', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: 'error: unknown auth command\n', code: 1 };
  }

  _kubectlTop({ restArgs, namespace, allNamespaces = false }) {
    const sub = restArgs[0] || 'node';
    if (sub === 'node' || sub === 'nodes') {
      const targetNode = restArgs[1];
      const headers = ['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'];
      let rows = [
        ['control-plane-node', '250m', '12%', '1420Mi', '35%'],
        ['worker-node-1', '410m', '20%', '2100Mi', '52%'],
        ['worker-node-2', '320m', '16%', '1850Mi', '46%']
      ];
      if (this.graph) {
        const liveNodes = this.graph.list({ kind: 'Node' });
        if (liveNodes.length > 0) {
          rows = liveNodes.map((n, idx) => [
            n.metadata?.name || `node-${idx}`,
            `${250 + (idx * 80)}m`,
            `${12 + (idx * 4)}%`,
            `${1420 + (idx * 400)}Mi`,
            `${35 + (idx * 6)}%`
          ]);
        }
      }
      if (targetNode) {
        rows = rows.filter((r) => r[0] === targetNode);
        if (rows.length === 0) {
          return { stdout: '', stderr: `Error from server (NotFound): node "${targetNode}" not found\n`, code: 1 };
        }
      }
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }
    if (sub === 'pod' || sub === 'pods') {
      const targetPod = restArgs[1];
      const headers = allNamespaces
        ? ['NAMESPACE', 'NAME', 'CPU(cores)', 'MEMORY(bytes)']
        : ['NAME', 'CPU(cores)', 'MEMORY(bytes)'];
      let rows = [];
      if (this.graph) {
        const livePods = allNamespaces ? this.graph.list({ kind: 'Pod' }) : this.graph.list('Pod', namespace);
        rows = livePods.map((p, idx) => {
          const r = [p.metadata?.name || `pod-${idx}`, `${25 + (idx * 10)}m`, `${64 + (idx * 32)}Mi`];
          if (allNamespaces) r.unshift(p.metadata?.namespace || 'default');
          return r;
        });
      }
      if (rows.length === 0) {
        rows = [
          ['coredns-7c65d6cfc9-abc12', '4m', '18Mi'],
          ['coredns-7c65d6cfc9-xyz99', '3m', '17Mi'],
          ['kube-apiserver-control-plane', '45m', '310Mi']
        ];
        if (allNamespaces) {
          rows = rows.map((r) => ['kube-system', ...r]);
        }
      }
      if (targetPod) {
        rows = rows.filter((r) => (allNamespaces ? r[1] === targetPod : r[0] === targetPod));
        if (rows.length === 0) {
          return { stdout: '', stderr: `Error from server (NotFound): pods "${targetPod}" not found\n`, code: 1 };
        }
      }
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

  _kubectlAutoscale({ restArgs, namespace, dryRun: initialDryRun = false, outputFormat: initialOutput = null }) {
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
    let hpaName = null;
    let dryRun = initialDryRun;
    let outputFormat = initialOutput;

    for (let i = 0; i < restArgs.length; i++) {
      const a = restArgs[i];
      if (a.startsWith('--min=')) min = parseInt(a.split('=')[1], 10);
      else if (a === '--min') min = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--max=')) max = parseInt(a.split('=')[1], 10);
      else if (a === '--max') max = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--cpu-percent=')) cpuPercent = parseInt(a.split('=')[1], 10);
      else if (a === '--cpu-percent') cpuPercent = parseInt(restArgs[++i], 10);
      else if (a.startsWith('--name=')) hpaName = a.split('=')[1];
      else if (a === '--name') hpaName = restArgs[++i];
      else if (a.startsWith('--dry-run')) dryRun = true;
      else if (a.startsWith('-o=')) outputFormat = a.split('=')[1];
      else if (a === '-o') outputFormat = restArgs[++i];
    }

    hpaName = hpaName || targetName;

    const targetResource = this.graph.get(targetKind, namespace, targetName);
    if (!targetResource) {
      return { stdout: '', stderr: `Error from server (NotFound): ${targetKind} "${targetName}" not found in namespace "${namespace}"\n`, code: 1 };
    }

    const existingHpa = this.graph.get('HorizontalPodAutoscaler', namespace, hpaName);
    if (existingHpa && !dryRun) {
      return { stdout: '', stderr: `Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "${hpaName}" already exists\n`, code: 1 };
    }

    const hpa = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: hpaName,
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

    if (dryRun) {
      if (outputFormat === 'yaml') {
        const y = yamlParser.stringifyYaml ? yamlParser.stringifyYaml(hpa) : JSON.stringify(hpa, null, 2);
        return { stdout: y + '\n', stderr: '', code: 0 };
      }
      if (outputFormat === 'json') {
        return { stdout: JSON.stringify(hpa, null, 2) + '\n', stderr: '', code: 0 };
      }
      return { stdout: `horizontalpodautoscaler.autoscaling/${hpaName} autoscaled (server dry run)\n`, stderr: '', code: 0 };
    }

    this.graph.set(hpa);
    if (this.controllerManager) {
      this.controllerManager.reconcile();
    }
    return { stdout: `horizontalpodautoscaler.autoscaling/${hpaName} autoscaled\n`, stderr: '', code: 0 };
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

  handleHelm({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    if (!sub || sub === '--help' || sub === '-h') {
      return {
        stdout: 'The Kubernetes Package Manager\n\nCommon actions for Helm:\n- helm search:    search for charts\n- helm pull:      download a chart to your local directory to view\n- helm install:   upload the chart to Kubernetes\n- helm list:      list releases of charts\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'version') {
      return { stdout: 'version.BuildInfo{Version:"v3.16.2", GitCommit:"13651c8a", GitTreeState:"clean", GoVersion:"go1.22.7"}\n', stderr: '', code: 0 };
    }

    if (sub === 'list' || sub === 'ls') {
      const allNs = argv.includes('-A') || argv.includes('--all-namespaces');
      let targetNs = 'default';
      const nIdx = argv.findIndex((a) => a === '-n' || a === '--namespace');
      if (nIdx !== -1 && argv[nIdx + 1]) targetNs = argv[nIdx + 1];

      let list = this.helmReleases;
      if (!allNs && nIdx !== -1) {
        list = list.filter((r) => r.namespace === targetNs);
      }
      if (list.length === 0) {
        return { stdout: 'NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION\n', stderr: '', code: 0 };
      }
      const headers = ['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION'];
      const rows = list.map((r) => [r.name, r.namespace || 'default', String(r.revision || 1), r.updated || 'now', r.status || 'deployed', r.chart || 'chart', r.appVersion || '1.0.0']);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'install') {
      const name = argv[2];
      const chart = argv[3];
      if (!name || !chart || name.startsWith('-') || chart.startsWith('-')) {
        return { stdout: '', stderr: 'Error: install requires release name and chart\n', code: 1 };
      }
      let ns = 'default';
      let replicas = 1;
      const values = {};
      for (let i = 4; i < argv.length; i++) {
        if (argv[i] === '-n' || argv[i] === '--namespace') ns = argv[++i] || 'default';
        else if (argv[i].startsWith('--namespace=')) ns = argv[i].split('=')[1];
        else if (argv[i] === '--set' && argv[i + 1]) {
          const pairs = argv[++i].split(',');
          for (const p of pairs) {
            const [k, v] = p.split('=');
            if (k) values[k] = v;
            if (k === 'replicaCount' || k === 'replicas') replicas = parseInt(v, 10) || 1;
          }
        }
      }

      const existing = this.helmReleases.find((r) => r.name === name);
      if (existing) {
        return { stdout: '', stderr: `Error: cannot re-use a name that is still in use: ${name}\n`, code: 1 };
      }

      const newRelease = {
        name,
        namespace: ns,
        revision: 1,
        updated: new Date().toISOString(),
        status: 'deployed',
        chart,
        appVersion: '1.0.0',
        values
      };
      this.helmReleases.push(newRelease);
      if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.helmReleases) && !this.cluster.state.helmReleases.includes(newRelease)) {
        this.cluster.state.helmReleases.push(newRelease);
      }

      const shortChart = chart.split('/').pop();
      const depName = shortChart === name ? name : `${name}-${shortChart}`;
      if (this.graph) {
        this.graph.create({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            name: depName,
            namespace: ns,
            labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm', app: name }
          },
          spec: {
            replicas,
            selector: { matchLabels: { app: name } },
            template: {
              metadata: { labels: { app: name } },
              spec: { containers: [{ name: shortChart, image: `${shortChart}:latest` }] }
            }
          }
        });
        if (depName !== name) {
          this.graph.create({
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name,
              namespace: ns,
              labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm', app: name }
            },
            spec: {
              replicas,
              selector: { matchLabels: { app: name } },
              template: {
                metadata: { labels: { app: name } },
                spec: { containers: [{ name: shortChart, image: `${shortChart}:latest` }] }
              }
            }
          });
        }
        this.graph.create({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: depName,
            namespace: ns,
            labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm', app: name }
          },
          spec: {
            selector: { app: name },
            ports: [{ port: 80, targetPort: 80, protocol: 'TCP' }]
          }
        });
        if (this.controllerManager) this.controllerManager.reconcile();
      }

      if (this.cluster && typeof this.cluster.applyResource === 'function') {
        const createClusterDep = (dName) => {
          this.cluster.applyResource({
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: dName,
              namespace: ns,
              labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm', app: name }
            },
            spec: {
              replicas,
              selector: { matchLabels: { app: name } },
              template: {
                metadata: { labels: { app: name } },
                spec: { containers: [{ name: shortChart, image: `${shortChart}:latest` }] }
              }
            }
          });
        };
        createClusterDep(name);
        if (depName !== name) createClusterDep(depName);

        this.cluster.applyResource({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: depName,
            namespace: ns,
            labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm', app: name }
          },
          spec: {
            selector: { app: name },
            ports: [{ port: 80, targetPort: 80, protocol: 'TCP' }]
          }
        });
      }

      return {
        stdout: `NAME: ${name}\nLAST DEPLOYED: ${new Date().toUTCString()}\nNAMESPACE: ${ns}\nSTATUS: deployed\nREVISION: 1\nTEST SUITE: None\nNOTES:\nThank you for installing ${chart}.\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'upgrade') {
      const name = argv[2];
      const chart = argv[3];
      const isInstall = argv.includes('-i') || argv.includes('--install');
      let rel = this.helmReleases.find((r) => r.name === name);
      if (!rel) {
        if (isInstall) {
          return this.handleHelm({ argv: ['helm', 'install', ...argv.slice(2)], cwd, vfs });
        }
        return { stdout: '', stderr: `Error: release: not found\n`, code: 1 };
      }

      rel.revision = (rel.revision || 1) + 1;
      rel.updated = new Date().toISOString();
      if (chart && !chart.startsWith('-')) rel.chart = chart;

      return {
        stdout: `Release "${name}" has been upgraded. Happy Helming!\nNAME: ${name}\nLAST DEPLOYED: ${new Date().toUTCString()}\nNAMESPACE: ${rel.namespace}\nSTATUS: deployed\nREVISION: ${rel.revision}\nTEST SUITE: None\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'rollback') {
      const name = argv[2];
      const rev = argv[3] ? parseInt(argv[3], 10) : 1;
      const rel = this.helmReleases.find((r) => r.name === name);
      if (!rel) return { stdout: '', stderr: `Error: release: not found\n`, code: 1 };
      rel.revision = rev;
      rel.updated = new Date().toISOString();
      return { stdout: `Rollback was a success! Happy Helming!\n`, stderr: '', code: 0 };
    }

    if (sub === 'uninstall') {
      const name = argv[2];
      if (!name) return { stdout: '', stderr: 'Error: uninstall requires release name\n', code: 1 };
      const idx = this.helmReleases.findIndex((r) => r.name === name);
      if (idx === -1) {
        return { stdout: '', stderr: `Error: uninstall: Release not loaded: "${name}": release: not found\n`, code: 1 };
      }
      const [rel] = this.helmReleases.splice(idx, 1);
      if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.helmReleases)) {
        const cIdx = this.cluster.state.helmReleases.findIndex((r) => r.name === name);
        if (cIdx !== -1) this.cluster.state.helmReleases.splice(cIdx, 1);
      }
      if (this.graph) {
        const deps = this.graph.list({ kind: 'Deployment', labelSelector: `app.kubernetes.io/instance=${name}` });
        for (const d of deps) this.graph.delete('Deployment', d.metadata.namespace, d.metadata.name);
        const svcs = this.graph.list({ kind: 'Service', labelSelector: `app.kubernetes.io/instance=${name}` });
        for (const s of svcs) this.graph.delete('Service', s.metadata.namespace, s.metadata.name);
      }
      return { stdout: `release "${name}" uninstalled\n`, stderr: '', code: 0 };
    }

    if (sub === 'repo') {
      const action = argv[2];
      if (action === 'add') {
        const rName = argv[3];
        const rUrl = argv[4];
        if (!rName || !rUrl) return { stdout: '', stderr: 'Error: repo add requires name and url\n', code: 1 };
        this.helmRepos[rName] = rUrl;
        return { stdout: `"${rName}" has been added to your repositories\n`, stderr: '', code: 0 };
      }
      if (action === 'update') {
        const names = Object.keys(this.helmRepos);
        const updates = names.map((n) => `...Successfully got an update from the "${n}" chart repository`).join('\n');
        return { stdout: `Hang tight while we grab the latest from your chart repositories...\n${updates}\nUpdate Complete. ⎈Happy Helming!⎈\n`, stderr: '', code: 0 };
      }
      if (action === 'list') {
        const headers = ['NAME', 'URL'];
        const rows = Object.entries(this.helmRepos);
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (action === 'remove' || action === 'rm') {
        const rName = argv[3];
        delete this.helmRepos[rName];
        return { stdout: `"${rName}" has been removed from your repositories\n`, stderr: '', code: 0 };
      }
      return { stdout: 'repositories updated successfully\n', stderr: '', code: 0 };
    }

    if (sub === 'template') {
      const name = argv[2] || 'release-name';
      const chart = argv[3] || 'my-chart';
      const shortChart = chart.split('/').pop();
      const yaml = `---
# Source: ${shortChart}/templates/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${name}-${shortChart}
  labels:
    helm.sh/chart: ${shortChart}-1.0.0
    app.kubernetes.io/name: ${shortChart}
    app.kubernetes.io/instance: ${name}
---
# Source: ${shortChart}/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ${name}-${shortChart}
  labels:
    app.kubernetes.io/name: ${shortChart}
    app.kubernetes.io/instance: ${name}
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: ${shortChart}
    app.kubernetes.io/instance: ${name}
---
# Source: ${shortChart}/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}-${shortChart}
  labels:
    app.kubernetes.io/name: ${shortChart}
    app.kubernetes.io/instance: ${name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: ${shortChart}
      app.kubernetes.io/instance: ${name}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${shortChart}
        app.kubernetes.io/instance: ${name}
    spec:
      serviceAccountName: ${name}-${shortChart}
      containers:
        - name: ${shortChart}
          image: "${shortChart}:1.0.0"
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
`;
      return { stdout: yaml, stderr: '', code: 0 };
    }

    if (sub === 'lint') {
      const chartPath = argv[2] || '.';
      const absPath = chartPath.startsWith('/') ? chartPath : `${cwd}/${chartPath}`.replace(/\/+/g, '/');
      if (fs && fs.exists(`${absPath}/Chart.yaml`)) {
        return { stdout: `==> Linting ${chartPath}\n\n1 chart(s) linted, 0 chart(s) failed\n`, stderr: '', code: 0 };
      }
      if (fs && !fs.exists(`${absPath}/Chart.yaml`)) {
        return { stdout: `==> Linting ${chartPath}\n[ERROR] Chart.yaml: file does not exist\n\nError: 1 chart(s) linted, 1 chart(s) failed\n`, stderr: '', code: 1 };
      }
      return { stdout: `==> Linting ${chartPath}\n\n1 chart(s) linted, 0 chart(s) failed\n`, stderr: '', code: 0 };
    }

    if (sub === 'package') {
      const chartPath = argv[2] || '.';
      const absPath = chartPath.startsWith('/') ? chartPath : `${cwd}/${chartPath}`.replace(/\/+/g, '/');
      let chartName = chartPath.split('/').pop() || 'chart';
      let chartVer = '0.1.0';
      if (fs && fs.exists(`${absPath}/Chart.yaml`)) {
        try {
          const content = fs.readFile(`${absPath}/Chart.yaml`);
          const parsed = yamlParser.parseYaml ? yamlParser.parseYaml(content) : null;
          if (parsed && parsed.name) chartName = parsed.name;
          if (parsed && parsed.version) chartVer = parsed.version;
        } catch {}
      }
      const pkgFile = `${chartName}-${chartVer}.tgz`;
      const outDir = argv.includes('-d') ? argv[argv.indexOf('-d') + 1] : cwd;
      const targetPkg = `${outDir}/${pkgFile}`.replace(/\/+/g, '/');
      if (fs) {
        fs.writeFile(targetPkg, 'SIMULATED_GZIP_CHART_ARCHIVE');
      }
      return { stdout: `Successfully packaged chart and saved it to: ${targetPkg}\n`, stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `Error: unknown command "${sub}" for "helm"\n`, code: 1 };
  }

  // -------------------------------------------------------------------------
  // 2b. KUSTOMIZE CLI HANDLER
  // -------------------------------------------------------------------------

  handleKustomize({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    if (!sub || sub === '--help' || sub === '-h') {
      return {
        stdout: 'Manages declarative configuration of Kubernetes\n\nUsage:\n  kustomize [command]\n\nAvailable Commands:\n  build                   Build a kustomization target\n  edit                    Edits a kustomization file\n  version                 Prints the kustomize version\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'version') {
      return { stdout: '{Version:kustomize/v5.4.3 GitCommit:2a3e792c GoVersion:go1.22.5}\n', stderr: '', code: 0 };
    }

    if (sub === 'build') {
      const targetDir = argv[2] || '.';
      const absDir = targetDir.startsWith('/') ? targetDir : `${cwd}/${targetDir}`.replace(/\/+/g, '/').replace(/\/$/, '');
      if (!fs) {
        return { stdout: '', stderr: `Error: unable to access filesystem\n`, code: 1 };
      }

      let kustomizeFile = null;
      for (const candidate of ['kustomization.yaml', 'kustomization.yml', 'Kustomization']) {
        const full = `${absDir}/${candidate}`;
        if (fs.exists(full)) {
          kustomizeFile = full;
          break;
        }
      }

      if (!kustomizeFile) {
        return {
          stdout: '',
          stderr: `Error: unable to find one of 'kustomization.yaml', 'kustomization.yml' in directory "${targetDir}"\n`,
          code: 1
        };
      }

      let parsedKust = {};
      try {
        const raw = fs.readFile(kustomizeFile);
        parsedKust = yamlParser.parseYaml ? yamlParser.parseYaml(raw) : JSON.parse(raw);
        parsedKust = parsedKust || {};
      } catch (err) {
        return { stdout: '', stderr: `Error parsing ${kustomizeFile}: ${err.message}\n`, code: 1 };
      }

      const resources = parsedKust.resources || [];
      const outputDocs = [];

      for (const resPath of resources) {
        const resFullPath = resPath.startsWith('/') ? resPath : `${absDir}/${resPath}`.replace(/\/+/g, '/');
        if (fs.exists(resFullPath)) {
          const resRaw = fs.readFile(resFullPath);
          let docs = [];
          try {
            docs = yamlParser.parseAllYaml ? yamlParser.parseAllYaml(resRaw) : [yamlParser.parseYaml(resRaw)];
          } catch {
            docs = [];
          }
          for (const doc of docs) {
            if (!doc || typeof doc !== 'object') continue;
            // Apply namespace
            if (parsedKust.namespace) {
              doc.metadata = doc.metadata || {};
              doc.metadata.namespace = parsedKust.namespace;
            }
            // Apply namePrefix / nameSuffix
            if (parsedKust.namePrefix) {
              doc.metadata = doc.metadata || {};
              doc.metadata.name = `${parsedKust.namePrefix}${doc.metadata.name || ''}`;
            }
            if (parsedKust.nameSuffix) {
              doc.metadata = doc.metadata || {};
              doc.metadata.name = `${doc.metadata.name || ''}${parsedKust.nameSuffix}`;
            }
            // Apply commonLabels
            if (parsedKust.commonLabels && typeof parsedKust.commonLabels === 'object') {
              doc.metadata = doc.metadata || {};
              doc.metadata.labels = { ...(doc.metadata.labels || {}), ...parsedKust.commonLabels };
              if (doc.spec && doc.spec.template && doc.spec.template.metadata) {
                doc.spec.template.metadata.labels = {
                  ...(doc.spec.template.metadata.labels || {}),
                  ...parsedKust.commonLabels
                };
              }
            }
            // Apply commonAnnotations
            if (parsedKust.commonAnnotations && typeof parsedKust.commonAnnotations === 'object') {
              doc.metadata = doc.metadata || {};
              doc.metadata.annotations = { ...(doc.metadata.annotations || {}), ...parsedKust.commonAnnotations };
            }
            // Apply image transformations
            if (Array.isArray(parsedKust.images)) {
              const containers = doc.spec?.template?.spec?.containers || doc.spec?.containers || [];
              for (const c of containers) {
                for (const imgTransform of parsedKust.images) {
                  if (c.image && (c.image === imgTransform.name || c.image.startsWith(`${imgTransform.name}:`))) {
                    const newName = imgTransform.newName || imgTransform.name;
                    const newTag = imgTransform.newTag ? `:${imgTransform.newTag}` : '';
                    c.image = `${newName}${newTag}`;
                  }
                }
              }
            }
            outputDocs.push(doc);
          }
        }
      }

      if (outputDocs.length === 0) {
        return {
          stdout: `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${parsedKust.namePrefix || ''}kustomize-config\n  namespace: ${parsedKust.namespace || 'default'}\ndata:\n  env: production\n`,
          stderr: '',
          code: 0
        };
      }

      const formattedDocs = outputDocs.map((d) => (yamlParser.stringifyYaml ? yamlParser.stringifyYaml(d) : JSON.stringify(d, null, 2))).join('---\n');
      return { stdout: formattedDocs + '\n', stderr: '', code: 0 };
    }

    if (sub === 'edit') {
      const action = argv[2];
      const kustomizeFile = `${cwd}/kustomization.yaml`;
      let parsedKust = {};
      if (fs && fs.exists(kustomizeFile)) {
        try {
          parsedKust = yamlParser.parseYaml(fs.readFile(kustomizeFile)) || {};
        } catch {}
      }

      if (action === 'set') {
        const target = argv[3];
        if (target === 'namespace') {
          const ns = argv[4];
          parsedKust.namespace = ns;
          if (fs) fs.writeFile(kustomizeFile, yamlParser.stringifyYaml ? yamlParser.stringifyYaml(parsedKust) : JSON.stringify(parsedKust));
          return { stdout: '', stderr: '', code: 0 };
        }
        if (target === 'image') {
          const imgExpr = argv[4];
          if (imgExpr) {
            const [name, targetImg] = imgExpr.split('=');
            parsedKust.images = parsedKust.images || [];
            parsedKust.images.push({ name, newName: targetImg });
            if (fs) fs.writeFile(kustomizeFile, yamlParser.stringifyYaml ? yamlParser.stringifyYaml(parsedKust) : JSON.stringify(parsedKust));
          }
          return { stdout: '', stderr: '', code: 0 };
        }
      }

      if (action === 'add') {
        const target = argv[3];
        if (target === 'resource') {
          const res = argv[4];
          parsedKust.resources = parsedKust.resources || [];
          if (!parsedKust.resources.includes(res)) parsedKust.resources.push(res);
          if (fs) fs.writeFile(kustomizeFile, yamlParser.stringifyYaml ? yamlParser.stringifyYaml(parsedKust) : JSON.stringify(parsedKust));
          return { stdout: '', stderr: '', code: 0 };
        }
      }
    }

    return { stdout: '', stderr: `Error: unknown command "${sub}" for "kustomize"\n`, code: 1 };
  }

  // -------------------------------------------------------------------------
  // 3. DOCKER & CRICTL CONTAINER RUNTIME HANDLERS
  // -------------------------------------------------------------------------

  handleDocker({ argv = [], cwd = '/home/learner', vfs = null }) {
    const sub = argv[1];
    if (!sub || sub === 'ps') {
      const showAll = argv.includes('-a') || argv.includes('--all');
      const containers = showAll ? this.simulatedContainers : this.simulatedContainers.filter((c) => c.status.startsWith('Up'));
      const headers = ['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'];
      const rows = containers.map((c) => [c.id, c.image, c.command, c.created, c.status, c.ports, c.name]);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'images') {
      const headers = ['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'];
      const rows = [
        ['nginx', '1.27-alpine', 'e78d910a2f', '2 weeks ago', '42.8MB'],
        ['redis', '7.2-alpine', 'f49a1b8c0e', '3 weeks ago', '38.4MB'],
        ['registry.k8s.io/kube-apiserver', 'v1.31.0', '98a7b6c5d4', '1 month ago', '128MB'],
        ['registry.k8s.io/etcd', '3.5.15-0', '8f12c904e5', '1 month ago', '95.2MB'],
        ['gcr.io/distroless/static-debian12', 'nonroot', '4d9e8a1b2c', '3 weeks ago', '2.4MB']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'run') {
      let name = null;
      let ports = '80/tcp';
      let img = null;
      for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--name' && i + 1 < argv.length) {
          name = argv[++i];
        } else if (argv[i] === '-p' && i + 1 < argv.length) {
          ports = argv[++i] + '/tcp';
        } else if (!argv[i].startsWith('-') && !img) {
          img = argv[i];
        }
      }
      img = img || 'alpine:latest';
      const id = Math.random().toString(16).slice(2, 14);
      name = name || `container-${id.slice(0, 6)}`;
      this.simulatedContainers.push({
        id,
        name,
        image: img,
        status: 'Up 1 second',
        ports,
        command: '"/entrypoint.sh"',
        created: '1 second ago'
      });
      return { stdout: `${id}\n`, stderr: '', code: 0 };
    }

    if (sub === 'build') {
      let tag = 'app:latest';
      for (let i = 2; i < argv.length; i++) {
        if ((argv[i] === '-t' || argv[i] === '--tag') && i + 1 < argv.length) {
          tag = argv[++i];
        }
      }
      const lines = [
        '[+] Building 1.1s (7/7) FINISHED                                docker:default',
        ' => [internal] load build definition from Dockerfile                      0.0s',
        ' => => transferring dockerfile: 312B                                      0.0s',
        ' => [internal] load metadata for docker.io/library/alpine:latest          0.2s',
        ' => [1/3] FROM docker.io/library/alpine:latest                            0.0s',
        ' => [2/3] COPY . /app                                                     0.2s',
        ' => [3/3] RUN chmod +x /app/entrypoint.sh                                 0.4s',
        ' => exporting to image                                                    0.1s',
        ' => => exporting layers                                                   0.1s',
        ` => => naming to docker.io/library/${tag}                                   0.0s`
      ];
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

    if (sub === 'logs') {
      const target = argv[2] || 'container';
      return {
        stdout: `2026-11-12T16:00:00.123Z [INFO] Initializing service container ${target}\n2026-11-12T16:00:01.456Z [INFO] Listening for HTTP connections on port 8080\n2026-11-12T16:00:02.789Z [INFO] Ready to receive traffic.\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'exec') {
      const cmdParts = argv.slice(3).filter((a) => !a.startsWith('-'));
      const cmd = cmdParts.join(' ') || 'whoami';
      if (cmd === 'whoami' || cmd === 'id') {
        return { stdout: 'root\n', stderr: '', code: 0 };
      }
      if (cmd.includes('uname')) {
        return { stdout: 'Linux container 6.8.0-40-generic x86_64 Linux\n', stderr: '', code: 0 };
      }
      return { stdout: `${cmd}: execution successful\n`, stderr: '', code: 0 };
    }

    if (sub === 'inspect') {
      const target = argv[2] || 'container';
      const c = this.simulatedContainers.find((x) => x.id.startsWith(target) || x.name === target) || this.simulatedContainers[0];
      const doc = [{
        Id: c.id,
        Created: new Date().toISOString(),
        Path: '/entrypoint.sh',
        Args: [],
        State: {
          Status: c.status.startsWith('Up') ? 'running' : 'exited',
          Running: c.status.startsWith('Up'),
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Dead: false,
          Pid: 1204,
          ExitCode: 0
        },
        Image: c.image,
        NetworkSettings: {
          IPAddress: '172.17.0.2',
          Gateway: '172.17.0.1',
          Ports: { [c.ports]: null }
        }
      }];
      return { stdout: JSON.stringify(doc, null, 2) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'network') {
      const action = argv[2] || 'ls';
      if (action === 'ls') {
        const headers = ['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'];
        const rows = [
          ['8f12a3b4c5d6', 'bridge', 'bridge', 'local'],
          ['1a2b3c4d5e6f', 'host', 'host', 'local'],
          ['7e8d9c0b1a2f', 'none', 'null', 'local'],
          ['4c5d6e7f8a9b', 'cilium-net', 'overlay', 'global']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      return { stdout: `network ${action} succeeded\n`, stderr: '', code: 0 };
    }

    if (sub === 'stop') {
      const target = argv[2] || 'container';
      const c = this.simulatedContainers.find((x) => x.id.startsWith(target) || x.name === target);
      if (c) c.status = 'Exited (0) 1 second ago';
      return { stdout: `${target}\n`, stderr: '', code: 0 };
    }

    if (sub === 'rm') {
      const target = argv[2] || 'container';
      const idx = this.simulatedContainers.findIndex((x) => x.id.startsWith(target) || x.name === target);
      if (idx !== -1) this.simulatedContainers.splice(idx, 1);
      return { stdout: `${target}\n`, stderr: '', code: 0 };
    }

    if (sub === 'rmi') {
      const img = argv[2] || 'image';
      return { stdout: `Untagged: ${img}\nDeleted: sha256:4d9e8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9\n`, stderr: '', code: 0 };
    }

    if (sub === 'version' || argv.includes('--version') || argv.includes('-v')) {
      return { stdout: 'Docker version 26.1.4, build 5650f9b\n', stderr: '', code: 0 };
    }

    return { stdout: 'docker daemon active\n', stderr: '', code: 0 };
  }

  handleCrictl({ argv = [] }) {
    const sub = argv[1] || 'pods';
    if (sub === 'pods') {
      const pods = this.graph ? this.graph.list({ kind: 'Pod' }) : [];
      const headers = ['POD ID', 'CREATED', 'STATE', 'NAME', 'NAMESPACE', 'ATTEMPT', 'RUNTIME'];
      const rows = pods.map((p) => {
        const id = p.metadata?.uid?.slice(0, 13) || Math.random().toString(16).slice(2, 15);
        const name = p.metadata?.name || 'pod';
        const ns = p.metadata?.namespace || 'default';
        const state = (p.status?.phase === 'Running' || !p.status?.phase) ? 'Ready' : 'NotReady';
        return [id, '2 hours ago', state, name, ns, '0', '(default)'];
      });
      if (rows.length === 0) {
        rows.push(['a1b2c3d4e5f6a', '2 hours ago', 'Ready', 'coredns-7d8899c99c-c8k7p', 'kube-system', '0', '(default)']);
      }
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'ps') {
      const headers = ['CONTAINER', 'IMAGE', 'CREATED', 'STATE', 'NAME', 'ATTEMPT', 'POD ID'];
      const rows = [
        ['a1b2c3d4e5f6', 'registry.k8s.io/kube-apiserver:v1.31.0', '2 days ago', 'Running', 'kube-apiserver', '0', 'f1e2d3c4b5a6'],
        ['b2c3d4e5f6a1', 'registry.k8s.io/etcd:3.5.15-0', '2 days ago', 'Running', 'etcd', '0', 'e2d3c4b5a6f1'],
        ['c3d4e5f6a1b2', 'nginx:1.27-alpine', '5 hours ago', 'Running', 'gateway', '0', 'd3c4b5a6f1e2']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'inspect' || sub === 'inspectp') {
      const id = argv[2] || 'container';
      const doc = {
        status: {
          id,
          metadata: { name: id, attempt: 0 },
          state: 'CONTAINER_RUNNING',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          network: { ip: '10.244.1.15' }
        },
        info: { sandboxID: 'f1e2d3c4b5a6', pid: 1420 }
      };
      return { stdout: JSON.stringify(doc, null, 2) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'logs') {
      const id = argv[2] || 'container';
      return { stdout: `time="2026-11-12T16:00:00Z" level=info msg="CRI container ${id} healthy"\n`, stderr: '', code: 0 };
    }

    if (sub === 'images') {
      const headers = ['IMAGE', 'TAG', 'IMAGE ID', 'SIZE'];
      const rows = [
        ['registry.k8s.io/kube-apiserver', 'v1.31.0', '98a7b6c5d4', '128MB'],
        ['registry.k8s.io/etcd', '3.5.15-0', '8f12c904e5', '95.2MB'],
        ['registry.k8s.io/pause', '3.9', 'e78d910a2f', '750kB'],
        ['nginx', '1.27-alpine', 'c1b2a3f4e5', '42.8MB']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'stats') {
      const headers = ['CONTAINER', 'CPU %', 'MEM', 'DISK', 'INODES'];
      const rows = [
        ['a1b2c3d4e5f6', '1.42', '240MB', '4.2MB', '120'],
        ['b2c3d4e5f6a1', '0.81', '145MB', '28MB', '450'],
        ['c3d4e5f6a1b2', '0.12', '18MB', '1.1MB', '45']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    return { stdout: 'crictl CRI connection active on /run/containerd/containerd.sock\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 3b. ISOMORPHIC GIT CLI HANDLER
  // -------------------------------------------------------------------------

  handleGit({ argv = [], cwd = '/home/learner', vfs = null }) {
    if (!this.gitEngine) {
      this.gitEngine = new GitEngine({ vfs: vfs || this.vfs });
    }
    return this.gitEngine.execute(argv.slice(1), { cwd, vfs: vfs || this.vfs });
  }

  // -------------------------------------------------------------------------
  // 4. ARGOCD & GITOPS HANDLER
  // -------------------------------------------------------------------------

  handleArgoCD({ argv = [] }) {
    const sub = argv[1];
    if (!sub || sub === 'version' || sub === '--version') {
      return { stdout: 'argocd: v2.12.3+3c41551\n  BuildDate: 2024-08-20T14:02:18Z\n  GitCommit: 3c415515\n', stderr: '', code: 0 };
    }

    if (sub === 'app') {
      const action = argv[2];
      const appName = argv[3] || 'payments-gitops';

      if (action === 'list') {
        const headers = ['NAME', 'CLUSTER', 'NAMESPACE', 'PROJECT', 'STATUS', 'HEALTH', 'SYNCPOLICY'];
        const rows = this.argocdApps.map((a) => [
          a.name,
          'https://kubernetes.default.svc',
          a.destNamespace || 'default',
          a.project || 'default',
          a.syncStatus || 'Synced',
          a.healthStatus || 'Healthy',
          a.syncPolicy || 'Automated'
        ]);
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'get') {
        const app = this.argocdApps.find((a) => a.name === appName) || {
          name: appName,
          destNamespace: 'production',
          project: 'default',
          syncStatus: 'Synced',
          healthStatus: 'Healthy',
          syncPolicy: 'Automated'
        };
        const lines = [
          `Name:               ${app.name}`,
          `Project:            ${app.project || 'default'}`,
          `Server:             https://kubernetes.default.svc`,
          `Namespace:          ${app.destNamespace || 'production'}`,
          `URL:                https://argocd.example.com/applications/${app.name}`,
          `Repo:               ${app.repo || 'https://github.com/kubelabs/payments-deploy.git'}`,
          `Target:             ${app.targetRevision || 'main'}`,
          `Path:               ${app.path || 'deploy/prod'}`,
          `Sync Policy:        ${app.syncPolicy || 'Automated'}`,
          `Sync Status:        ${app.syncStatus || 'Synced'} to ${app.targetRevision || 'main'}`,
          `Health Status:      ${app.healthStatus || 'Healthy'}\n`,
          `GROUP  KIND        NAMESPACE   NAME      STATUS  HEALTH`,
          `apps   Deployment  ${app.destNamespace || 'production'}  ${app.name}    ${app.syncStatus || 'Synced'}  ${app.healthStatus || 'Healthy'}`
        ];
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }

      if (action === 'create') {
        let repo = 'https://github.com/kubelabs/app.git';
        let path = 'deploy';
        let destServer = 'https://kubernetes.default.svc';
        let destNs = 'default';
        let syncPolicy = 'Manual';

        for (let i = 4; i < argv.length; i++) {
          if (argv[i] === '--repo') repo = argv[++i];
          else if (argv[i] === '--path') path = argv[++i];
          else if (argv[i] === '--dest-server') destServer = argv[++i];
          else if (argv[i] === '--dest-namespace') destNs = argv[++i];
          else if (argv[i] === '--sync-policy') syncPolicy = argv[++i];
        }

        const newApp = {
          name: appName,
          repo,
          path,
          destServer,
          destNamespace: destNs,
          syncPolicy,
          syncStatus: 'OutOfSync',
          healthStatus: 'Missing',
          targetRevision: 'HEAD'
        };
        this.argocdApps.push(newApp);
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.argoApps)) {
          this.cluster.state.argoApps.push(newApp);
        }
        if (this.graph) {
          this.graph.create({
            apiVersion: 'argoproj.io/v1alpha1',
            kind: 'Application',
            metadata: { name: appName, namespace: 'argocd' },
            spec: {
              destination: { namespace: destNs, server: destServer },
              source: { repoURL: repo, path, targetRevision: 'HEAD' }
            },
            status: { sync: { status: 'OutOfSync' }, health: { status: 'Missing' } }
          });
        }
        return { stdout: `application '${appName}' created\n`, stderr: '', code: 0 };
      }

      if (action === 'sync') {
        let app = this.argocdApps.find((a) => a.name === appName);
        if (!app) {
          app = {
            name: appName,
            destNamespace: 'production',
            project: 'default',
            syncStatus: 'Synced',
            healthStatus: 'Healthy',
            syncPolicy: 'Automated'
          };
          this.argocdApps.push(app);
          if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.argoApps)) {
            this.cluster.state.argoApps.push(app);
          }
        } else {
          app.syncStatus = 'Synced';
          app.healthStatus = 'Healthy';
        }

        if (this.graph) {
          const appRes = this.graph.get('Application', 'argocd', appName);
          if (appRes) {
            appRes.status = { sync: { status: 'Synced' }, health: { status: 'Healthy' } };
          }
          const depName = appName;
          const ns = app.destNamespace || 'production';
          if (!this.graph.get('Deployment', ns, depName)) {
            this.graph.create({
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              metadata: { name: depName, namespace: ns, labels: { 'argocd.argoproj.io/instance': appName, app: appName } },
              spec: { replicas: 2, selector: { matchLabels: { app: appName } }, template: { metadata: { labels: { app: appName } }, spec: { containers: [{ name: appName, image: 'ghcr.io/kubelabs/app:v1.0.0' }] } } }
            });
            if (this.controllerManager) this.controllerManager.reconcile();
          }
        }

        if (this.cluster && typeof this.cluster.applyResource === 'function') {
          const depName = appName;
          const ns = app.destNamespace || 'production';
          this.cluster.applyResource({
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name: depName, namespace: ns, labels: { 'argocd.argoproj.io/instance': appName, app: appName } },
            spec: {
              replicas: 2,
              selector: { matchLabels: { app: appName } },
              template: {
                metadata: { labels: { app: appName } },
                spec: { containers: [{ name: appName, image: 'ghcr.io/kubelabs/app:v1.0.0' }] }
              }
            }
          });
          const appResource = typeof this.cluster.getResource === 'function' ? this.cluster.getResource('Application', appName, 'argocd') : null;
          if (appResource) {
            appResource.status = { syncStatus: 'Synced', healthStatus: 'Healthy' };
          }
        }

        return {
          stdout: `TIMESTAMP                  GROUP        KIND   NAMESPACE                  NAME    STATUS    HEALTH   HOOK  MESSAGE\n${new Date().toISOString()}   apps  Deployment     ${app.destNamespace || 'production'}             ${appName}    Synced   Healthy\n`,
          stderr: '',
          code: 0
        };
      }

      if (action === 'wait') {
        return { stdout: `Application '${appName}' is Synced and Healthy\n`, stderr: '', code: 0 };
      }

      if (action === 'diff') {
        const app = this.argocdApps.find((a) => a.name === appName);
        if (app && app.syncStatus === 'OutOfSync') {
          return {
            stdout: `===== apps/Deployment ${appName} =====\n12c12\n<         image: ghcr.io/kubelabs/app:v1.0.0\n---\n>         image: ghcr.io/kubelabs/app:v2.0.0\n`,
            stderr: '',
            code: 0
          };
        }
        return { stdout: '', stderr: '', code: 0 };
      }

      if (action === 'history') {
        const headers = ['ID', 'DATE', 'REVISION'];
        const rows = [
          ['1', '2026-11-12 10:00:00', 'main@sha1:e84f291'],
          ['2', '2026-11-13 14:00:00', 'main@sha1:c8a91f2']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'rollback') {
        const revId = argv[4] || '1';
        return { stdout: `Rolled back application '${appName}' to revision ${revId}\n`, stderr: '', code: 0 };
      }
    }

    if (sub === 'repo') {
      const action = argv[2];
      if (action === 'add') {
        const repoUrl = argv[3];
        return { stdout: `Repository '${repoUrl}' added\n`, stderr: '', code: 0 };
      }
      if (action === 'list') {
        const headers = ['TYPE', 'NAME', 'REPO', 'STATUS'];
        const rows = [['git', 'main', 'https://github.com/kubelabs/payments-deploy.git', 'Successful']];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
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
      let targetNs = 'default';
      let allNs = false;
      for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '-n' || argv[i] === '--namespace') targetNs = argv[++i];
        else if (argv[i].startsWith('-n=')) targetNs = argv[i].split('=')[1];
        else if (argv[i].startsWith('--namespace=')) targetNs = argv[i].split('=')[1];
        else if (argv[i] === '-A' || argv[i] === '--all-namespaces') allNs = true;
      }

      const issues = [];
      if (this.graph) {
        const vses = allNs
          ? this.graph.list('VirtualService')
          : this.graph.list('VirtualService', targetNs);
        const drs = this.graph.list('DestinationRule');
        const services = this.graph.list('Service');

        for (const vs of vses) {
          const vsNs = vs.metadata?.namespace || 'default';
          const vsName = vs.metadata?.name;

          for (const rule of (vs.spec?.http || [])) {
            let totalWeight = 0;
            const routes = rule.route || [];
            for (const r of routes) {
              const dest = r.destination || {};
              const host = dest.host;
              const subset = dest.subset;
              const weight = r.weight !== undefined ? r.weight : 100;
              totalWeight += weight;

              if (host) {
                const svcExists = services.some((s) => {
                  const sName = s.metadata?.name;
                  const sNs = s.metadata?.namespace || 'default';
                  return host === sName || host === `${sName}.${sNs}` || host === `${sName}.${sNs}.svc.cluster.local`;
                });

                if (!svcExists && !host.includes('.')) {
                  issues.push({
                    level: 'Warn',
                    code: 'IST0101',
                    target: `VirtualService ${vsName}.${vsNs}`,
                    message: `Referenced host not found: "${host}"`
                  });
                }

                if (subset) {
                  const dr = drs.find((d) => {
                    const dHost = d.spec?.host;
                    return dHost === host || dHost?.startsWith(host);
                  });
                  const subsetDefined = dr?.spec?.subsets?.some((s) => s.name === subset);
                  if (!dr || !subsetDefined) {
                    issues.push({
                      level: 'Error',
                      code: 'IST0101',
                      target: `VirtualService ${vsName}.${vsNs}`,
                      message: `Referenced host+subset not found: "${host}" subset: "${subset}"`
                    });
                  }
                }
              }
            }

            if (routes.length > 1 && totalWeight !== 100) {
              issues.push({
                level: 'Warn',
                code: 'IST0102',
                target: `VirtualService ${vsName}.${vsNs}`,
                message: `Total weight of routes across destinations should sum to 100, found: ${totalWeight}`
              });
            }
          }
        }
      }

      if (issues.length > 0) {
        const out = issues.map((iss) => `${iss.level} [${iss.code}] (${iss.target}) ${iss.message}`).join('\n') + '\n';
        const hasErrors = issues.some((i) => i.level === 'Error');
        return { stdout: out, stderr: '', code: hasErrors ? 1 : 0 };
      }

      const scope = allNs ? 'all namespaces' : `namespace: ${targetNs}`;
      return { stdout: `✔ No validation issues found when analyzing ${scope}.\n`, stderr: '', code: 0 };
    }

    if (sub === 'authn' && argv[2] === 'tls-check') {
      const headers = ['HOST:PORT', 'STATUS', 'SERVER', 'CLIENT', 'AUTHN POLICY', 'DESTINATION RULE'];
      const rows = [
        ['details.default.svc.cluster.local:9080', 'OK', 'mTLS', 'mTLS', 'default/default', 'details/default'],
        ['ratings.default.svc.cluster.local:9080', 'OK', 'mTLS', 'mTLS', 'default/default', 'ratings/default']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'proxy-status') {
      const headers = ['NAME', 'CDS', 'LDS', 'EDS', 'RDS', 'ISTIOD', 'VERSION'];
      const rows = [
        ['ingressgateway-7b9c.istio-system', 'SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'istiod-1', '1.23.0'],
        ['web-frontend-9f1.default', 'SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'istiod-1', '1.23.0']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'proxy-config' || sub === 'pc') {
      const configType = argv[2] || 'endpoints';
      const podName = argv[3] || 'web-frontend';

      if (configType === 'endpoints' || configType === 'ep') {
        const headers = ['ENDPOINT', 'STATUS', 'OUTLIER CHECK', 'CLUSTER'];
        const rows = [
          ['10.244.1.15:80', 'HEALTHY', 'OK', 'outbound|80||details.default.svc.cluster.local'],
          ['10.244.1.18:9080', 'HEALTHY', 'OK', 'outbound|9080||ratings.default.svc.cluster.local'],
          ['127.0.0.1:15000', 'HEALTHY', 'OK', 'prometheus_stats']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (configType === 'clusters' || configType === 'c') {
        const headers = ['SERVICE FQDN', 'PORT', 'SUBSET', 'DIRECTION', 'TYPE', 'DESTINATION RULE'];
        const rows = [
          ['details.default.svc.cluster.local', '80', '-', 'outbound', 'EDS', 'details.default'],
          ['ratings.default.svc.cluster.local', '9080', 'v1', 'outbound', 'EDS', 'ratings.default'],
          ['BlackHoleCluster', '-', '-', '-', 'STATIC', '-']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (configType === 'listeners' || configType === 'l') {
        const headers = ['ADDRESS', 'PORT', 'MATCH', 'DESTINATION'];
        const rows = [
          ['0.0.0.0', '15006', 'Trans: raw_buffer; App: HTTP', 'Route: 80'],
          ['0.0.0.0', '15001', 'ALL', 'PassthroughCluster']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (configType === 'routes' || configType === 'r') {
        const headers = ['NOTE', 'NAME', 'DOMAINS', 'MATCH', 'VIRTUAL SERVICE'];
        const rows = [
          ['*', '80', 'details.default.svc.cluster.local', '/*', 'details.default'],
          ['*', '9080', 'ratings.default.svc.cluster.local', '/api/v1/ratings', 'ratings.default']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      return { stdout: `Proxy configuration dump for ${podName} generated.\n`, stderr: '', code: 0 };
    }

    if (sub === 'dashboard') {
      const tool = argv[2] || 'kiali';
      const port = tool === 'kiali' ? 20001 : tool === 'jaeger' ? 16686 : 3000;
      return {
        stdout: `http://localhost:${port}/${tool}\nGenerated simulated port-forwarding to ${tool} dashboard.\n`,
        stderr: '',
        code: 0
      };
    }

    return { stdout: 'client version: 1.23.0\ncontrol plane version: 1.23.0\ndata plane version: 1.23.0 (2 proxies)\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 6. OPENTOFU / TERRAFORM HANDLER
  // -------------------------------------------------------------------------

  handleTofu({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    const binName = argv[0] || 'tofu';

    if (!sub || sub === 'version' || sub === '-v' || sub === '--version') {
      return { stdout: `${binName === 'terraform' ? 'Terraform' : 'OpenTofu'} v1.8.2\non linux_amd64\n+ provider registry.opentofu.org/hashicorp/aws v5.80.0\n`, stderr: '', code: 0 };
    }

    if (sub === 'init') {
      if (this.cluster && this.cluster.state && this.cluster.state.terraformState) {
        this.cluster.state.terraformState.initialized = true;
      }
      return {
        stdout: 'Initializing the backend...\nInitializing provider plugins...\n- Finding hashicorp/aws versions matching ">= 5.0"...\n- Installing hashicorp/aws v5.80.0...\n- Installed hashicorp/aws v5.80.0 (signed by HashiCorp)\n\nOpenTofu has been successfully initialized!\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'plan') {
      return {
        stdout: [
          'OpenTofu used the selected providers to generate the following execution plan.',
          'Resource actions are indicated with the following symbols:',
          '  + create\n',
          'OpenTofu will perform the following actions:\n',
          '  # aws_vpc.main will be created',
          '  + resource "aws_vpc" "main" {',
          '      + cidr_block           = "10.0.0.0/16"',
          '      + enable_dns_hostnames = true',
          '      + enable_dns_support   = true',
          '      + id                   = (known after apply)',
          '    }\n',
          '  # aws_eks_cluster.prod will be created',
          '  + resource "aws_eks_cluster" "prod" {',
          '      + arn      = (known after apply)',
          '      + endpoint = (known after apply)',
          '      + name     = "kubelabs-eks"',
          '      + version  = "1.31"',
          '    }\n',
          'Plan: 2 to add, 0 to change, 0 to destroy.\n',
          'Changes to Outputs:',
          '  + cluster_endpoint = (known after apply)'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'apply') {
      if (this.tofu && typeof this.tofu.applyResource === 'function') {
        this.tofu.applyResource('aws_vpc', 'main', 'aws', { cidr_block: '10.0.0.0/16' });
        this.tofu.applyResource('aws_eks_cluster', 'prod', 'aws', { name: 'kubelabs-eks' }, ['aws_vpc.main']);
      }
      for (const r of ['aws_vpc.main', 'aws_eks_cluster.prod', 'aws_s3_bucket.artifacts']) {
        if (!this.tofuResources.includes(r)) this.tofuResources.push(r);
        if (this.cluster && this.cluster.state) {
          if (this.cluster.state.terraformState) {
            this.cluster.state.terraformState.initialized = true;
            if (!this.cluster.state.terraformState.resources.includes(r)) {
              this.cluster.state.terraformState.resources.push(r);
            }
          }
          if (Array.isArray(this.cluster.state.cloudResources) && !this.cluster.state.cloudResources.some((c) => c.id === r)) {
            this.cluster.state.cloudResources.push({
              id: r,
              provider: 'aws',
              type: r.split('.')[0],
              name: r.split('.')[1],
              status: 'ACTIVE'
            });
          }
        }
      }
      if (fs) {
        fs.writeFile(`${cwd}/terraform.tfstate`, JSON.stringify({
          version: 4,
          terraform_version: '1.8.2',
          serial: 2,
          resources: this.tofuResources.map((res) => ({ mode: 'managed', type: res.split('.')[0], name: res.split('.')[1] })),
          outputs: this.tofuOutputs
        }, null, 2));
      }
      return {
        stdout: [
          'aws_vpc.main: Creating...',
          'aws_vpc.main: Creation complete after 2s [id=vpc-01a2b3c4d5e]',
          'aws_eks_cluster.prod: Creating...',
          'aws_eks_cluster.prod: Creation complete after 5s [id=kubelabs-eks]\n',
          'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.\n',
          'Outputs:\n',
          'cluster_endpoint = "https://78A9C12.gr7.us-east-1.eks.amazonaws.com"',
          'vpc_id = "vpc-01a2b3c4d5e"'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'destroy') {
      const count = this.tofuResources.length || 2;
      this.tofuResources.length = 0;
      if (this.cluster && this.cluster.state && this.cluster.state.terraformState) {
        this.cluster.state.terraformState.resources.length = 0;
      }
      if (fs && fs.exists(`${cwd}/terraform.tfstate`)) {
        fs.writeFile(`${cwd}/terraform.tfstate`, JSON.stringify({ version: 4, serial: 3, resources: [] }));
      }
      return {
        stdout: `Destroy complete! Resources: ${count} destroyed.\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'state') {
      const action = argv[2] || 'list';
      if (action === 'list') {
        const list = this.tofuResources.length > 0 ? this.tofuResources : ['aws_vpc.main', 'aws_eks_cluster.prod'];
        return { stdout: list.join('\n') + '\n', stderr: '', code: 0 };
      }
      if (action === 'show') {
        const addr = argv[3] || 'aws_vpc.main';
        const [type, name] = addr.split('.');
        const hcl = [
          `# ${addr}:`,
          `resource "${type || 'aws_vpc'}" "${name || 'main'}" {`,
          `    arn                  = "arn:aws:ec2:us-east-1:123456789012:vpc/vpc-01a2b3c4d5e"`,
          `    cidr_block           = "10.0.0.0/16"`,
          `    enable_dns_hostnames = true`,
          `    enable_dns_support   = true`,
          `    id                   = "vpc-01a2b3c4d5e"`,
          `    instance_tenancy     = "default"`,
          `}`
        ].join('\n') + '\n';
        return { stdout: hcl, stderr: '', code: 0 };
      }
      if (action === 'mv') {
        const src = argv[3];
        const dst = argv[4];
        const sIdx = this.tofuResources.indexOf(src);
        if (sIdx !== -1 && dst) this.tofuResources[sIdx] = dst;
        return { stdout: `Move "${src}" to "${dst}"\nSuccessfully moved 1 object(s).\n`, stderr: '', code: 0 };
      }
    }

    if (sub === 'output') {
      const isJson = argv.includes('-json');
      const targetName = argv.find((a, i) => i > 1 && !a.startsWith('-'));
      if (isJson) {
        return { stdout: JSON.stringify(this.tofuOutputs, null, 2) + '\n', stderr: '', code: 0 };
      }
      if (targetName && this.tofuOutputs[targetName]) {
        return { stdout: `"${this.tofuOutputs[targetName]}"\n`, stderr: '', code: 0 };
      }
      const lines = Object.entries(this.tofuOutputs).map(([k, v]) => `${k} = "${v}"`);
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
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
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === clusterName)) {
            this.cluster.state.cloudResources.push({
              id: `aws_eks_cluster.${clusterName}`,
              provider: 'aws',
              type: 'eks-cluster',
              name: clusterName,
              status: 'ACTIVE'
            });
          }
        }
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
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === clusterName)) {
            this.cluster.state.cloudResources.push({
              id: `aws_eks_cluster.${clusterName}`,
              provider: 'aws',
              type: 'eks-cluster',
              name: clusterName,
              status: 'ACTIVE'
            });
          }
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

    if (svc === 's3') {
      const action = argv[2];
      if (action === 'ls') {
        const target = argv[3];
        if (!target || target === 's3://' || target === 's3') {
          const rows = this.simulatedS3.buckets.map((b) => `2026-11-12 10:14:22 ${b}`);
          return { stdout: rows.join('\n') + '\n', stderr: '', code: 0 };
        }
        const bucket = target.replace(/^s3:\/\//, '').split('/')[0];
        const rows = [];
        for (const [k, v] of this.simulatedS3.objects.entries()) {
          if (k.startsWith(`${bucket}/`)) {
            rows.push(`2026-11-13 12:00:00        ${v.length} ${k.slice(bucket.length + 1)}`);
          }
        }
        if (rows.length === 0) {
          rows.push(`2026-11-13 12:00:00       1024 state.json`);
        }
        return { stdout: rows.join('\n') + '\n', stderr: '', code: 0 };
      }
      if (action === 'mb') {
        const bucket = (argv[3] || 'bucket').replace(/^s3:\/\//, '');
        if (!this.simulatedS3.buckets.includes(bucket)) this.simulatedS3.buckets.push(bucket);
        return { stdout: `make_bucket: s3://${bucket}\n`, stderr: '', code: 0 };
      }
      if (action === 'rb') {
        const bucket = (argv[3] || 'bucket').replace(/^s3:\/\//, '');
        this.simulatedS3.buckets = this.simulatedS3.buckets.filter((b) => b !== bucket);
        return { stdout: `remove_bucket: s3://${bucket}\n`, stderr: '', code: 0 };
      }
      if (action === 'cp') {
        const src = argv[3];
        const dst = argv[4];
        if (!src || !dst) return { stdout: '', stderr: 'Error: s3 cp requires src and dst\n', code: 1 };
        if (src.startsWith('s3://')) {
          const key = src.replace(/^s3:\/\//, '');
          const data = this.simulatedS3.objects.get(key) || 'SIMULATED_S3_DATA';
          const localPath = dst.startsWith('/') ? dst : `${cwd}/${dst}`.replace(/\/+/g, '/');
          if (vfs) vfs.writeFile(localPath, data);
          return { stdout: `download: ${src} to ${dst}\n`, stderr: '', code: 0 };
        } else {
          const localPath = src.startsWith('/') ? src : `${cwd}/${src}`.replace(/\/+/g, '/');
          const data = vfs && vfs.exists(localPath) ? vfs.readFile(localPath) : 'UPLOADED_CONTENT';
          const key = dst.replace(/^s3:\/\//, '');
          this.simulatedS3.objects.set(key, data);
          return { stdout: `upload: ${src} to ${dst}\n`, stderr: '', code: 0 };
        }
      }
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
    if (!sub || sub === 'version' || sub === '--version') {
      return { stdout: 'flux: v2.3.0\n', stderr: '', code: 0 };
    }

    if (sub === 'check') {
      const output = [
        '► checking prerequisites',
        '✔ Kubernetes 1.31.0 >=1.28.0-0',
        '✔ prerequisites checks passed',
        '► checking controllers',
        '✔ helm-controller: deployment ready',
        '✔ kustomize-controller: deployment ready',
        '✔ notification-controller: deployment ready',
        '✔ source-controller: deployment ready',
        '✔ all checks passed'
      ].join('\n') + '\n';
      return { stdout: output, stderr: '', code: 0 };
    }

    if (sub === 'get') {
      const resType = argv[2] || 'all';
      if (resType.startsWith('kustom') || resType === 'all') {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = this.fluxKustomizations.map((k) => [k.name, k.revision, k.suspended, k.ready, k.message]);
        if (resType.startsWith('kustom')) return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (resType.startsWith('helm') || resType === 'all') {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = this.fluxHelmReleases.map((h) => [h.name, h.version, h.suspended, h.ready, h.message]);
        if (resType.startsWith('helm')) return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (resType.startsWith('source') || resType === 'all') {
        const headers = ['NAME', 'REVISION', 'SUSPENDED', 'READY', 'MESSAGE'];
        const rows = this.fluxSources.map((s) => [s.name, s.revision, 'False', s.ready, s.status]);
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
    }

    if (sub === 'reconcile') {
      const kind = argv[2] || 'kustomization';
      const name = argv[3] || 'apps';
      return {
        stdout: `► annotating ${kind} ${name} in flux-system namespace\n✔ ${kind} reconciled successfully\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'create') {
      const entity = argv[2];
      const name = argv[4] || argv[3] || 'app';
      if (entity === 'source') {
        this.fluxSources.push({ name, type: 'git', revision: 'main@sha1:e84f291', ready: 'True', status: 'stored artifact' });
        return { stdout: `✔ GitRepository source created\n`, stderr: '', code: 0 };
      }
      if (entity === 'kustomization') {
        this.fluxKustomizations.push({ name, path: `./k8s/${name}`, revision: 'main@sha1:e84f291', ready: 'True', suspended: 'False', message: 'Applied revision' });
        return { stdout: `✔ Kustomization created\n`, stderr: '', code: 0 };
      }
      if (entity === 'helmrelease') {
        this.fluxHelmReleases.push({ name, chart: name, version: '1.0.0', ready: 'True', suspended: 'False', message: 'Release reconciliation succeeded' });
        return { stdout: `✔ HelmRelease created\n`, stderr: '', code: 0 };
      }
    }

    return { stdout: 'Flux GitOps CLI v2.3.0\n', stderr: '', code: 0 };
  }

  handleVelero({ argv = [] }) {
    this.veleroBackups = this.veleroBackups || [
      { name: 'daily-backup-2026-11-10', status: 'Completed', errors: 0, warnings: 0, created: '2026-11-10 02:00:00' }
    ];
    this.veleroRestores = this.veleroRestores || [];

    const entity = argv[1];
    const action = argv[2];

    if (!entity || entity === 'version' || entity === '--version') {
      return { stdout: 'Velero Disaster Recovery CLI v1.14.0\n', stderr: '', code: 0 };
    }

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
        const rName = `${fromBackup}-restore-${Math.random().toString(36).slice(2, 7)}`;
        this.veleroRestores.push({
          name: rName,
          backup: fromBackup,
          status: 'Completed',
          started: new Date().toISOString(),
          completed: new Date().toISOString()
        });
        return { stdout: `Restore request "${rName}" submitted successfully.\n`, stderr: '', code: 0 };
      }
      if (action === 'get') {
        const headers = ['NAME', 'BACKUP', 'STATUS', 'STARTED', 'COMPLETED'];
        const rows = this.veleroRestores.length > 0
          ? this.veleroRestores.map((r) => [r.name, r.backup, r.status, r.started, r.completed])
          : [['daily-backup-restore-1', 'daily-backup-2026-11-10', 'Completed', '2026-11-12 04:00:00', '2026-11-12 04:02:15']];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (action === 'describe') {
        const name = argv[3] || 'daily-backup-restore-1';
        const lines = [
          `Name:         ${name}`,
          `Namespace:    velero`,
          `Status:       Completed`,
          `Backup:       daily-backup-2026-11-10`,
          `Items Restored: 142 items`
        ];
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
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

  handleAzure({ argv = [], vfs = null, cwd = '/home/learner' }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    if (!sub || sub === '--version' || sub === '-v') {
      return { stdout: 'azure-cli 2.64.0\nPython 3.11.8\nLinux 6.8.0-generic\n', stderr: '', code: 0 };
    }

    if (sub === 'account') {
      return {
        stdout: JSON.stringify({
          environmentName: 'AzureCloud',
          id: 'sub-1234-abcd-5678-ef01',
          name: 'Enterprise-DevOps-Prod',
          state: 'Enabled',
          user: { name: 'learner@kubelabs.local', type: 'user' }
        }, null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'group') {
      return {
        stdout: JSON.stringify([
          {
            id: '/subscriptions/sub-1234/resourceGroups/rg-kubelabs-prod',
            location: 'eastus',
            name: 'rg-kubelabs-prod',
            properties: { provisioningState: 'Succeeded' }
          }
        ], null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'aks') {
      const action = argv[2];
      if (action === 'get-credentials') {
        let name = 'aks-production';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i] === '-n' || argv[i] === '--name') name = argv[++i];
          else if (argv[i].startsWith('--name=')) name = argv[i].split('=')[1];
        }
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === name)) {
            this.cluster.state.cloudResources.push({
              id: `azurerm_kubernetes_cluster.${name}`,
              provider: 'azure',
              type: 'aks-cluster',
              name,
              status: 'Succeeded'
            });
          }
        }
        if (fs) {
          try {
            fs.writeFile('/home/learner/.kube/config', `apiVersion: v1\ncurrent-context: ${name}\nkind: Config\n`);
          } catch {}
        }
        return { stdout: `Merged "${name}" as current context in /home/learner/.kube/config\n`, stderr: '', code: 0 };
      }

      if (action === 'show') {
        let name = 'aks-production';
        for (let i = 3; i < argv.length; i++) {
          if (argv[i] === '-n' || argv[i] === '--name') name = argv[++i];
        }
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === name)) {
            this.cluster.state.cloudResources.push({
              id: `azurerm_kubernetes_cluster.${name}`,
              provider: 'azure',
              type: 'aks-cluster',
              name,
              status: 'Succeeded'
            });
          }
        }
        return {
          stdout: JSON.stringify({
            name,
            resourceGroup: 'rg-kubelabs-prod',
            kubernetesVersion: '1.31.0',
            powerState: { code: 'Running' },
            dnsPrefix: `${name}-dns`,
            fqdn: `${name}-dns-1234.hcp.eastus.azmk8s.io`,
            provisioningState: 'Succeeded'
          }, null, 2) + '\n',
          stderr: '',
          code: 0
        };
      }

      return {
        stdout: JSON.stringify([
          {
            name: 'aks-production',
            resourceGroup: 'rg-kubelabs-prod',
            kubernetesVersion: '1.31.0',
            powerState: { code: 'Running' }
          }
        ], null, 2) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'network') {
      const entity = argv[2];
      if (entity === 'vnet') {
        return {
          stdout: JSON.stringify([
            {
              name: 'vnet-kubelabs-eastus',
              resourceGroup: 'rg-kubelabs-prod',
              location: 'eastus',
              addressSpace: { addressPrefixes: ['10.0.0.0/16'] },
              subnets: [{ name: 'snet-aks-nodes', addressPrefix: '10.0.1.0/24' }]
            }
          ], null, 2) + '\n',
          stderr: '',
          code: 0
        };
      }
      if (entity === 'nsg') {
        return {
          stdout: JSON.stringify([
            {
              name: 'nsg-aks-nodes',
              resourceGroup: 'rg-kubelabs-prod',
              securityRules: [
                { name: 'AllowKubeApiServer', access: 'Allow', direction: 'Inbound', priority: 100, destinationPortRange: '6443' }
              ]
            }
          ], null, 2) + '\n',
          stderr: '',
          code: 0
        };
      }
    }

    return { stdout: 'Azure CLI (az) connected to subscription: Enterprise-DevOps-Prod\n', stderr: '', code: 0 };
  }

  handleGcloud({ argv = [], vfs = null, cwd = '/home/learner' }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    if (!sub || sub === '--version' || sub === '-v') {
      return { stdout: 'Google Cloud SDK 490.0.0\nbq 2.1.8\ncore 2024.08.23\ngke-gcloud-auth-plugin 0.5.8\ngsutil 5.30\n', stderr: '', code: 0 };
    }

    if (sub === 'config') {
      return { stdout: '[core]\naccount = learner@kubelabs.local\nproject = aetherlabs-gke-prod\n', stderr: '', code: 0 };
    }

    if (sub === 'container' && argv[2] === 'clusters') {
      const action = argv[3];
      if (action === 'get-credentials') {
        const clusterName = argv[4] || 'gke-production';
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === clusterName)) {
            this.cluster.state.cloudResources.push({
              id: `google_container_cluster.${clusterName}`,
              provider: 'gcp',
              type: 'gke-cluster',
              name: clusterName,
              status: 'RUNNING'
            });
          }
        }
        if (fs) {
          try {
            fs.writeFile('/home/learner/.kube/config', `apiVersion: v1\ncurrent-context: gke_aetherlabs-gke-prod_us-central1-a_${clusterName}\nkind: Config\n`);
          } catch {}
        }
        return { stdout: `Fetching cluster endpoint and auth data.\nkubeconfig entry generated for ${clusterName}.\n`, stderr: '', code: 0 };
      }

      if (action === 'describe') {
        const clusterName = argv[4] || 'gke-production';
        if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.cloudResources)) {
          if (!this.cluster.state.cloudResources.some((c) => c.name === clusterName)) {
            this.cluster.state.cloudResources.push({
              id: `google_container_cluster.${clusterName}`,
              provider: 'gcp',
              type: 'gke-cluster',
              name: clusterName,
              status: 'RUNNING'
            });
          }
        }
        return {
          stdout: [
            `name: ${clusterName}`,
            `location: us-central1-a`,
            `status: RUNNING`,
            `currentMasterVersion: 1.31.0-gke.1000`,
            `currentNodeVersion: 1.31.0-gke.1000`,
            `endpoint: 34.120.45.10`,
            `currentNodeCount: 3`
          ].join('\n') + '\n',
          stderr: '',
          code: 0
        };
      }

      const headers = ['NAME', 'LOCATION', 'MASTER_VERSION', 'MASTER_IP', 'MACHINE_TYPE', 'NODE_VERSION', 'NUM_NODES', 'STATUS'];
      const rows = [
        ['gke-production', 'us-central1-a', '1.31.0-gke.1000', '34.120.45.10', 'e2-standard-4', '1.31.0-gke.1000', '3', 'RUNNING']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    if (sub === 'compute' && argv[2] === 'instances') {
      const headers = ['NAME', 'ZONE', 'MACHINE_TYPE', 'PREEMPTIBLE', 'INTERNAL_IP', 'EXTERNAL_IP', 'STATUS'];
      const rows = [
        ['gke-node-1', 'us-central1-a', 'e2-standard-4', 'false', '10.128.0.2', '34.68.10.12', 'RUNNING'],
        ['gke-node-2', 'us-central1-a', 'e2-standard-4', 'false', '10.128.0.3', '34.68.10.13', 'RUNNING']
      ];
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    return { stdout: 'Google Cloud SDK 490.0.0 (project: aetherlabs-gke-prod)\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 8. SECURITY & COMPLIANCE TOOLS (TRIVY, FALCO, COSIGN, K8SGPT)
  // -------------------------------------------------------------------------

  handleTrivy({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const sub = argv[1];
    if (!sub || sub === '--help' || sub === '-h') {
      return { stdout: 'Scanner for vulnerabilities in container images, file systems, and Git repositories\n\nUsage:\n  trivy [command]\n', stderr: '', code: 0 };
    }

    if (sub === 'image') {
      const target = argv[2] || 'nginx:latest';
      const isCritical = target.includes('node:14') || target.includes('vulnerable');
      const headers = ['LIBRARY', 'VULNERABILITY ID', 'SEVERITY', 'INSTALLED VERSION', 'FIXED VERSION', 'TITLE'];
      const rows = isCritical
        ? [
            ['openssl', 'CVE-2023-3817', 'HIGH', '1.1.1u', '1.1.1v', 'excessive time checking DH keys'],
            ['libssl3', 'CVE-2024-5535', 'CRITICAL', '3.0.13-0ubuntu3.1', '3.0.13-0ubuntu3.4', 'SSL_select_next_proto buffer overflow']
          ]
        : [
            ['libssl3', 'CVE-2024-5535', 'MEDIUM', '3.0.13-0ubuntu3.1', '3.0.13-0ubuntu3.4', 'SSL_select_next_proto buffer overflow'],
            ['glibc', 'CVE-2024-33599', 'LOW', '2.39-0ubuntu8.1', '2.39-0ubuntu8.2', 'nscd netgroup cache crash']
          ];
      return {
        stdout: `Scan Target: ${target}\nTotal: ${rows.length} (CRITICAL: ${isCritical ? 1 : 0}, HIGH: ${isCritical ? 1 : 0}, MEDIUM: 1, LOW: 1)\n\n` + this._formatTable(headers, rows) + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'fs') {
      const path = argv[2] || '.';
      const absPath = path.startsWith('/') ? path : `${cwd}/${path}`.replace(/\/+/g, '/');
      return {
        stdout: `Scan Target: ${absPath}\nTests: 24 (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0)\n\nMEDIUM: Misconfiguration detected in container configuration (runAsNonRoot not set)\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'k8s') {
      const target = argv[2] || 'all';
      return {
        stdout: `Kubernetes Security Scan: ${target}\n\nSummary:\n- Vulnerabilities: 0\n- Misconfigurations: 1 (HIGH: 0, MEDIUM: 1)\n- RBAC Assessment: 0 issues\n`,
        stderr: '',
        code: 0
      };
    }

    if (sub === 'config') {
      const path = argv[2] || '.';
      return {
        stdout: `Config Scan: ${path}\nSUCCESS: 0 high-severity policy violations found.\n`,
        stderr: '',
        code: 0
      };
    }

    return { stdout: 'Trivy security scanner v0.55.0\n', stderr: '', code: 0 };
  }

  handleFalco({ argv = [] }) {
    return {
      stdout: [
        'Falco version: 0.38.1 (x86_64)',
        'Driver: Modern eBPF probe',
        'Rules file(s): /etc/falco/falco_rules.yaml',
        'Starting engine...',
        '0 security violations detected. Cluster audit is clean.'
      ].join('\n') + '\n',
      stderr: '',
      code: 0
    };
  }

  handleCosign({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'verify') {
      const image = argv[argv.length - 1] || 'ghcr.io/kubelabs/app:v1.0.0';
      return {
        stdout: [
          `Verification for [${image}] --`,
          'The following checks were performed on each of these signatures:',
          '  - The cosign signature was verified against the supplied public key',
          '  - Certificate extensions were verified for OIDC issuer: https://accounts.google.com',
          JSON.stringify([
            {
              critical: {
                identity: { 'docker-reference': image },
                image: { 'docker-manifest-digest': 'sha256:7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e' },
                type: 'cosign container image signature'
              }
            }
          ], null, 2)
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }
    if (sub === 'sign') {
      const image = argv[argv.length - 1] || 'ghcr.io/kubelabs/app:v1.0.0';
      return { stdout: `Generating signature for ${image}\nPushing signature to: ${image}.sig\n`, stderr: '', code: 0 };
    }
    return { stdout: 'cosign: container signing, verification, and storage v2.4.0\n', stderr: '', code: 0 };
  }

  handleK8sGPT({ argv = [] }) {
    const sub = argv[1];
    if (!sub || sub === 'analyze') {
      let brokenPod = null;
      if (this.graph) {
        const pods = this.graph.list('Pod');
        brokenPod = pods.find((p) => {
          const ph = p.status?.phase;
          const waitReason = p.status?.containerStatuses?.[0]?.state?.waiting?.reason;
          return ph === 'Failed' || ph === 'CrashLoopBackOff' || waitReason === 'CrashLoopBackOff' || waitReason === 'ImagePullBackOff';
        });
      }

      if (brokenPod) {
        const name = brokenPod.metadata?.name;
        const ns = brokenPod.metadata?.namespace || 'default';
        const reason = brokenPod.status?.containerStatuses?.[0]?.state?.waiting?.reason || 'CrashLoopBackOff';
        return {
          stdout: [
            'AI Provider: local (OpenAI/KubeLabs AIOps)',
            '',
            `0: Pod/${ns}/${name} (${reason})`,
            `- Error: Container exited with non-zero exit code or failed to pull image`,
            `- Explanation: The pod is unable to start properly because of an initialization failure or missing dependency.`,
            `- Solution: Inspect container logs with \`kubectl logs ${name} -n ${ns}\` or check environment variables.`
          ].join('\n') + '\n',
          stderr: '',
          code: 0
        };
      }

      return {
        stdout: [
          'AI Provider: local (OpenAI/KubeLabs AIOps)',
          '',
          '0 problems detected in cluster. All resources healthy!'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    return { stdout: 'k8sgpt - Giving Kubernetes Superpowers to everyone v0.3.40\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 9. CONTROL PLANE UTILITIES (ETCDCTL, KUBEADM, CILIUM, LINKERD, AIOPS)
  // -------------------------------------------------------------------------

  handleEtcdctl({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'endpoint') {
      const action = argv[2] || 'health';
      if (action === 'status') {
        const headers = ['ENDPOINT', 'ID', 'VERSION', 'DB SIZE', 'IS LEADER', 'IS LEARNER', 'RAFT TERM', 'RAFT INDEX', 'RAFT APPLIED INDEX', 'ERRORS'];
        const rows = [
          ['https://127.0.0.1:2379', 'b07e1c841a029f12', '3.5.15', '28 MB', 'true', 'false', '4', '34892', '34892', '']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      return { stdout: '127.0.0.1:2379 is healthy: successfully committed proposal: took = 1.2ms\n', stderr: '', code: 0 };
    }
    if (sub === 'member' && (argv[2] === 'list' || !argv[2])) {
      return { stdout: 'b07e1c841a029f12, started, control-plane-node, https://192.168.1.10:2380, https://192.168.1.10:2379, false\n', stderr: '', code: 0 };
    }
    if (sub === 'snapshot') {
      const action = argv[2];
      let target = '/var/lib/etcd/backup.db';
      let dataDir = '/var/lib/etcd';

      for (let i = 3; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--data-dir=')) {
          dataDir = arg.slice(11);
        } else if (arg === '--data-dir' && i + 1 < argv.length) {
          dataDir = argv[++i];
        } else if (!arg.startsWith('-')) {
          target = arg;
        }
      }

      if (action === 'status') {
        const headers = ['HASH', 'REVISION', 'TOTAL KEYS', 'TOTAL SIZE'];
        const rows = [
          ['41fa2a87', '34892', '4520', '26 MB']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'restore') {
        if (this.vfs) {
          this.vfs.mkdir(dataDir);
          this.vfs.mkdir(`${dataDir}/member/snap`);
          this.vfs.writeFile(`${dataDir}/member/snap/db`, 'ETCD_RESTORED_DATABASE_V3\n', { overwrite: true });
        }

        if (this.graph) {
          const etcdPods = this.graph.list({ kind: 'Pod' }).filter(
            (p) => (p.metadata?.namespace === 'kube-system' || p.metadata?.namespace === 'default') &&
              (p.metadata?.name?.includes('etcd') || p.metadata?.labels?.component === 'etcd')
          );
          for (const p of etcdPods) {
            if (p.metadata?.labels) {
              delete p.metadata.labels['etcd-unhealthy'];
            }
            if (p.status) {
              p.status.phase = 'Running';
              p.status.ready = '1/1';
              p.status.restarts = 0;
              p.status.message = 'Snapshot restored; quorum established';
            }
            this.graph.set(p, { skipReconcileNotification: true });
          }
        }

        if (this.controllerManager && typeof this.controllerManager.reconcileStaticPods === 'function') {
          this.controllerManager.reconcileStaticPods();
        }

        return {
          stdout: `2026-11-13 06:00:00.000000 I | etcdmain: restored snapshot ${target} to ${dataDir}\nQuorum restored across all etcd members.\n`,
          stderr: '',
          code: 0
        };
      }
      return { stdout: `Snapshot saved at ${target}\n{"hash":1098273645,"revision":34892,"totalKey":4520,"totalSize":26843545}\n`, stderr: '', code: 0 };
    }
    return { stdout: 'etcdctl version: 3.5.15\n', stderr: '', code: 0 };
  }

  handleKubeadm({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'init') {
      if (this.vfs) {
        this.vfs.mkdir('/etc/kubernetes/pki');
        this.vfs.mkdir('/etc/kubernetes/manifests');
        this.vfs.mkdir('/home/learner/.kube');
        this.vfs.writeFile('/etc/kubernetes/admin.conf', 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\n', { overwrite: true });
        this.vfs.writeFile('/home/learner/.kube/config', 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\n', { overwrite: true });
      }
      if (this.graph) {
        const nodes = this.graph.list({ kind: 'Node' });
        const cpNode = nodes.find((n) => n.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined) || nodes[0];
        if (cpNode) {
          cpNode.metadata = cpNode.metadata || {};
          cpNode.metadata.labels = cpNode.metadata.labels || {};
          cpNode.metadata.labels['node-role.kubernetes.io/control-plane'] = '';
          this.graph.set(cpNode, { skipReconcileNotification: true });
        }
      }
      const out = [
        '[init] Using Kubernetes version: v1.31.0',
        '[preflight] Running pre-flight checks',
        '[certs] Generating "ca" certificate and key',
        '[certs] Generating "apiserver" certificate and key',
        '[certs] apiserver serving cert is signed for DNS names [kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local kubelabs-control-plane] and IPs [10.96.0.1 192.168.1.10]',
        '[certs] Generating "apiserver-kubelet-client" certificate and key',
        '[certs] Generating "front-proxy-ca" certificate and key',
        '[certs] Generating "front-proxy-client" certificate and key',
        '[certs] Generating "etcd/ca" certificate and key',
        '[certs] Generating "etcd/server" certificate and key',
        '[certs] Generating "etcd/peer" certificate and key',
        '[certs] Generating "etcd/healthcheck-client" certificate and key',
        '[certs] Generating "apiserver-etcd-client" certificate and key',
        '[certs] Generating "sa" key and public key',
        '[kubeconfig] Writing "admin.conf" kubeconfig file',
        '[kubeconfig] Writing "kubelet.conf" kubeconfig file',
        '[kubeconfig] Writing "controller-manager.conf" kubeconfig file',
        '[kubeconfig] Writing "scheduler.conf" kubeconfig file',
        '[control-plane] Using manifest folder "/etc/kubernetes/manifests"',
        '[control-plane] Creating static Pod manifest for "kube-apiserver"',
        '[control-plane] Creating static Pod manifest for "kube-controller-manager"',
        '[control-plane] Creating static Pod manifest for "kube-scheduler"',
        '[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"',
        '[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods',
        '[apiclient] All control plane components are healthy after 5.001 seconds',
        '[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace',
        '[kubelet] Creating a ConfigMap "kubelet-config" in namespace kube-system with the configuration for the kubelets in the cluster',
        '[mark-control-plane] Marking the node as control-plane by adding the labels: [node-role.kubernetes.io/control-plane]',
        '[addons] Applied Essential Addon: CoreDNS',
        '[addons] Applied Essential Addon: kube-proxy',
        '',
        'Your Kubernetes control-plane has initialized successfully!',
        '',
        'To start using your cluster, you need to run the following as a regular user:',
        '',
        '  mkdir -p $HOME/.kube',
        '  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config',
        '  sudo chown $(id -u):$(id -g) $HOME/.kube/config',
        '',
        'Then you can join any number of worker nodes by running the following on each as root:',
        '',
        'kubeadm join 192.168.1.10:6443 --token 9a01ea.8018e4a547741478 \\',
        '    --discovery-token-ca-cert-hash sha256:7c4a16198f121175654ebd310061e89df95b35c023d6a69efee52220d9f67a21'
      ].join('\n') + '\n';
      return { stdout: out, stderr: '', code: 0 };
    }

    if (sub === 'join') {
      const endpoint = argv[2] || '192.168.1.10:6443';
      if (this.graph) {
        const workerNode = this.graph.get('Node', null, 'kubelabs-worker-01') || this.graph.get('Node', null, 'worker-node-1');
        if (workerNode) {
          workerNode.status = workerNode.status || {};
          workerNode.status.conditions = [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }];
          this.graph.set(workerNode, { skipReconcileNotification: true });
        }
      }
      const out = [
        `[preflight] Running pre-flight checks to ${endpoint}`,
        '[preflight] Reading configuration from the cluster...',
        '[preflight] FYI: You can look at this config file with \'kubectl -n kube-system get cm kubeadm-config -o yaml\'',
        '[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"',
        '[kubelet-start] Starting the kubelet',
        '[kubelet-check] Waiting for a healthy kubelet. This can take up to 4m0s',
        '[kubelet-check] The kubelet is healthy after 1.502s',
        '',
        'This node has joined the cluster:',
        '* Certificate signing request was sent to apiserver and a response was received.',
        '* The Kubelet was informed of the new secure connection details.',
        '',
        'Run \'kubectl get nodes\' on the control-plane to see this node join the cluster.'
      ].join('\n') + '\n';
      return { stdout: out, stderr: '', code: 0 };
    }

    if (sub === 'upgrade') {
      const action = argv[2] || 'plan';
      if (action === 'plan') {
        const out = [
          '[upgrade/plan] Components that must be upgraded manually after you have upgraded the control plane with kubeadm upgrade apply:',
          'COMPONENT     CURRENT       AVAILABLE',
          'Kubelet       v1.31.0       v1.32.0',
          '',
          'Upgrade to the latest version in the v1.32 series:',
          'COMPONENT            CURRENT   AVAILABLE',
          'kube-apiserver       v1.31.0   v1.32.0',
          'kube-controller-mgr  v1.31.0   v1.32.0',
          'kube-scheduler       v1.31.0   v1.32.0',
          'kube-proxy           v1.31.0   v1.32.0',
          'CoreDNS              v1.11.1   v1.11.3',
          'etcd                 3.5.14-0  3.5.15-0',
          '',
          'You can now apply the upgrade by executing: kubeadm upgrade apply v1.32.0'
        ].join('\n') + '\n';
        return { stdout: out, stderr: '', code: 0 };
      }
      if (action === 'apply') {
        const ver = argv[3] || 'v1.32.0';
        return { stdout: `[upgrade/apply] SUCCESS! Your cluster was upgraded to "${ver}". Enjoy!\n`, stderr: '', code: 0 };
      }
    }

    if (sub === 'token') {
      const action = argv[2] || 'list';
      if (action === 'list') {
        const headers = ['TOKEN', 'TTL', 'EXPIRES', 'USAGES', 'DESCRIPTION', 'EXTRA GROUPS'];
        const rows = [
          ['9a01ea.8018e4a547741478', '23h', '2026-11-14T16:00:00Z', 'authentication,signing', 'The default bootstrap token generated by \'kubeadm init\'.', 'system:bootstrappers:kubeadm:default-node-token']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (action === 'create') {
        const printJoin = argv.includes('--print-join-command');
        const token = '9a01ea.8018e4a547741478';
        if (printJoin) {
          return {
            stdout: `kubeadm join 192.168.1.10:6443 --token ${token} --discovery-token-ca-cert-hash sha256:7c4a16198f121175654ebd310061e89df95b35c023d6a69efee52220d9f67a21\n`,
            stderr: '',
            code: 0
          };
        }
        return { stdout: `${token}\n`, stderr: '', code: 0 };
      }
    }

    if (sub === 'certs') {
      const action = argv[2];
      if (action === 'check-expiration') {
        const headers = ['CERTIFICATE', 'EXPIRES', 'RESIDUAL TIME', 'CERTIFICATE AUTHORITY'];
        const rows = [
          ['admin.conf', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
          ['apiserver', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
          ['apiserver-etcd-client', 'Nov 12, 2027 16:00 UTC', '364d', 'etcd-ca'],
          ['apiserver-kubelet-client', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
          ['controller-manager.conf', 'Nov 12, 2027 16:00 UTC', '364d', 'ca'],
          ['etcd-healthcheck-client', 'Nov 12, 2027 16:00 UTC', '364d', 'etcd-ca'],
          ['etcd-peer', 'Nov 12, 2027 16:00 UTC', '364d', 'etcd-ca'],
          ['etcd-server', 'Nov 12, 2027 16:00 UTC', '364d', 'etcd-ca'],
          ['front-proxy-client', 'Nov 12, 2027 16:00 UTC', '364d', 'front-proxy-ca'],
          ['scheduler.conf', 'Nov 12, 2027 16:00 UTC', '364d', 'ca']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
      if (action === 'renew') {
        const target = argv[3] || 'all';
        const certList = [
          'admin.conf',
          'apiserver',
          'apiserver-etcd-client',
          'apiserver-kubelet-client',
          'controller-manager.conf',
          'etcd-healthcheck-client',
          'etcd-peer',
          'etcd-server',
          'front-proxy-client',
          'scheduler.conf'
        ];
        const renewed = target === 'all' ? certList : [target];
        const lines = renewed.map((c) => `[certs] Certificate '${c}' renewed`);
        lines.push('Done renewing certificates. You must restart the control-plane pods to use the new certs.');

        if (this.vfs) {
          this.vfs.mkdir('/etc/kubernetes/pki');
          for (const c of renewed) {
            this.vfs.writeFile(`/etc/kubernetes/pki/${c}.crt`, `-----BEGIN CERTIFICATE-----\nRENEWED_${c.toUpperCase()}_CERT\n-----END CERTIFICATE-----\n`, { overwrite: true });
          }
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }
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
    const sub = argv[1];
    if (!sub || sub === 'version' || sub === '--version') {
      return { stdout: 'Client version: stable-2.15.2\nServer version: stable-2.15.2\n', stderr: '', code: 0 };
    }

    if (sub === 'check') {
      const output = [
        'kubernetes-api',
        '--------------',
        '√ can initialize the client',
        '√ can query the Kubernetes API',
        '',
        'linkerd-existence',
        '-----------------',
        '√ "linkerd-config" config map exists',
        '√ control plane controller pods are ready',
        '√ linkerd-viz extension is ready',
        '',
        'Status check succeeded'
      ].join('\n') + '\n';
      return { stdout: output, stderr: '', code: 0 };
    }

    if (sub === 'viz') {
      const action = argv[2];
      if (action === 'stat') {
        const headers = ['NAME', 'MESHED', 'SUCCESS', 'RPS', 'LATENCY_P50', 'LATENCY_P95', 'LATENCY_P99'];
        const rows = [
          ['web-frontend', '1/1', '100.00%', '24.2rps', '2ms', '5ms', '12ms'],
          ['orders-api', '2/2', '99.98%', '112.5rps', '4ms', '10ms', '25ms'],
          ['payment-vault', '1/1', '100.00%', '15.0rps', '3ms', '8ms', '18ms']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'tap') {
        const lines = [
          'req id=0:1 proxy=in src=10.244.1.5:41234 dst=10.244.1.8:8080 :method=GET :authority=orders.prod :path=/api/v1/orders',
          'rsp id=0:1 proxy=in src=10.244.1.5:41234 dst=10.244.1.8:8080 :status=200 latency=3120µs',
          'end id=0:1 proxy=in src=10.244.1.5:41234 dst=10.244.1.8:8080 duration=15µs response-length=242B'
        ];
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }

      if (action === 'top') {
        const headers = ['ROUTE', 'SERVICE', 'SUCCESS', 'RPS', 'LATENCY_P50', 'LATENCY_P99'];
        const rows = [
          ['GET /api/v1/orders', 'orders-api', '100.00%', '82.4rps', '3ms', '18ms'],
          ['POST /api/v1/checkout', 'orders-api', '99.95%', '30.1rps', '6ms', '24ms']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }

      if (action === 'edges') {
        const headers = ['SRC', 'DST', 'SRC_NS', 'DST_NS', 'SECURED'];
        const rows = [
          ['web-frontend', 'orders-api', 'production', 'production', '√'],
          ['orders-api', 'payment-vault', 'production', 'production', '√']
        ];
        return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
      }
    }

    return { stdout: 'linkerd: Service Mesh CLI v2.15.2\n', stderr: '', code: 0 };
  }

  handleAiOps({ argv = [] }) {
    return this.handleK8sGPT({ argv: ['k8sgpt', ...argv.slice(1)] });
  }

  // -------------------------------------------------------------------------
  // 10. LINUX & NETWORKING DIAGNOSTICS HANDLER
  // -------------------------------------------------------------------------

  handleCurl({ argv = [] }) {
    const isHead = argv.includes('-I') || argv.includes('--head');
    const isInclude = argv.includes('-i') || argv.includes('--include');
    const isVerbose = argv.includes('-v') || argv.includes('--verbose');
    const url = argv.find((a) => a.startsWith('http://') || a.startsWith('https://')) || 'http://kubernetes.default.svc';

    // Loki API integration
    if (url.includes('/loki/')) {
      const qMatch = url.match(/[?&]query=([^&]+)/);
      let logQuery = '';
      if (qMatch) {
        logQuery = decodeURIComponent(qMatch[1]);
      } else {
        const qIdx = argv.indexOf('--data-urlencode');
        if (qIdx !== -1 && argv[qIdx + 1]?.startsWith('query=')) {
          logQuery = argv[qIdx + 1].slice(6);
        }
      }
      if (this.logql && logQuery) {
        const res = this.logql.query(logQuery);
        return {
          stdout: JSON.stringify(res, null, 2) + '\n',
          stderr: '',
          code: res.status === 'success' ? 0 : 1
        };
      }
    }

    // Prometheus API integration
    if (url.includes('/api/v1/query')) {
      const qMatch = url.match(/[?&]query=([^&]+)/);
      let promQuery = '';
      if (qMatch) {
        promQuery = decodeURIComponent(qMatch[1]);
      } else {
        const qIdx = argv.indexOf('--data-urlencode');
        if (qIdx !== -1 && argv[qIdx + 1]?.startsWith('query=')) {
          promQuery = argv[qIdx + 1].slice(6);
        }
      }
      if (this.promql && promQuery) {
        const res = this.promql.query(promQuery);
        return {
          stdout: JSON.stringify(res, null, 2) + '\n',
          stderr: '',
          code: res.status === 'success' ? 0 : 1
        };
      }
    }

    if (url.includes('/livez') || url.includes('/readyz') || url.includes('/healthz')) {
      if (isHead) {
        const headers = [
          'HTTP/1.1 200 OK',
          'Audit-Id: 10a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
          'Cache-Control: no-cache, private',
          'Content-Type: text/plain; charset=utf-8',
          'X-Kubernetes-Pf-Flowschema-Uid: 8f12a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
          'X-Kubernetes-Pf-Prioritylevel-Uid: 2a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d',
          'Date: ' + new Date().toUTCString(),
          'Content-Length: 2'
        ];
        return { stdout: headers.join('\r\n') + '\r\n\r\n', stderr: '', code: 0 };
      }
      return {
        stdout: (isInclude || isVerbose ? 'HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' : '') + 'ok\n',
        stderr: '',
        code: 0
      };
    }

    if (isHead) {
      const headers = [
        'HTTP/1.1 200 OK',
        'Server: kubelabs-isomorphic-cluster/v4.0',
        'Date: ' + new Date().toUTCString(),
        'Content-Type: application/json'
      ];
      return { stdout: headers.join('\r\n') + '\r\n\r\n', stderr: '', code: 0 };
    }

    const payload = JSON.stringify({
      status: '200 OK',
      service: url,
      server: 'kubelabs-isomorphic-cluster/v4.0',
      timestamp: new Date().toISOString()
    }, null, 2);

    if (isInclude || isVerbose) {
      return {
        stdout: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n' + payload + '\n',
        stderr: '',
        code: 0
      };
    }

    return {
      stdout: payload + '\n',
      stderr: '',
      code: 0
    };
  }

  handlePromtool({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'check') {
      const target = argv[2];
      if (target === 'rules') {
        const file = argv[3];
        if (this.vfs && file && this.vfs.exists(file)) {
          const content = this.vfs.readFile(file);
          let parsed;
          try {
            parsed = yamlParser.parseYaml ? yamlParser.parseYaml(content) : JSON.parse(content);
          } catch (err) {
            return { stdout: '', stderr: `Checking ${file}  FAILED:\n  ${err.message}\n`, code: 1 };
          }
          if (parsed && (parsed.groups || Array.isArray(parsed))) {
            return { stdout: `Checking ${file}  SUCCESS\n`, stderr: '', code: 0 };
          }
          return { stdout: `Checking ${file}  SUCCESS\n`, stderr: '', code: 0 };
        }
        return { stdout: `Checking ${file || 'rules.yaml'}  SUCCESS\n`, stderr: '', code: 0 };
      }
    }

    if (sub === 'query') {
      const expr = argv[4] || argv[3] || 'up';
      if (this.promql) {
        const res = this.promql.query(expr);
        if (res.status === 'success' && res.data?.result?.length > 0) {
          const lines = res.data.result.map((r) => {
            const labels = Object.entries(r.metric || {}).map(([k, v]) => `${k}="${v}"`).join(',');
            return `{${labels}} => ${r.value[1]} @[${r.value[0]}]`;
          });
          return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
        }
        return { stdout: `promtool query result: 0 series matched.\n`, stderr: '', code: 0 };
      }
    }

    return {
      stdout: 'promtool - Tooling for the Prometheus monitoring system v2.54.0\nusage: promtool <command> [<args> ...]\n',
      stderr: '',
      code: 0
    };
  }

  handlePromql({ argv = [] }) {
    let expr = argv.slice(1).join(' ').trim();
    if (expr.startsWith('query ')) expr = expr.slice(6).trim();
    else if (expr.startsWith('query_range ')) expr = expr.slice(12).trim();
    expr = expr.replace(/^["']|["']$/g, '');
    if (!expr) expr = 'up';

    if (this.promql) {
      const res = this.promql.query(expr);
      if (res.status === 'success' && res.data?.result?.length > 0) {
        const lines = res.data.result.map((r) => {
          const labels = Object.entries(r.metric || {}).map(([k, v]) => `${k}="${v}"`).join(',');
          return `{${labels}} => ${r.value[1]} @[${r.value[0]}]`;
        });
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }
      return { stdout: `promql query result: 0 series matched.\n`, stderr: '', code: 0 };
    }
    return { stdout: `up{instance="192.168.1.10:9100",job="node-exporter"} => 1\n`, stderr: '', code: 0 };
  }

  handleLogql({ argv = [] }) {
    let expr = argv.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');
    if (!expr) expr = '{app="default"}';
    if (this.logql) {
      const res = this.logql.query(expr);
      if (res.status === 'success' && res.data?.result?.length > 0) {
        const lines = [];
        for (const item of res.data.result) {
          for (const val of item.values || []) {
            lines.push(`${new Date(Number(val[0]) / 1000000).toISOString()} ${val[1]}`);
          }
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }
    }
    return { stdout: `${new Date().toISOString()} [info] Application log event stream active\n`, stderr: '', code: 0 };
  }

  handleLogcli({ argv = [] }) {
    const sub = argv[1];
    if (sub === 'query') {
      const queryStr = argv.slice(2).find((a) => a.startsWith('{')) || argv[2] || '{app="default"}';
      if (this.logql) {
        const res = this.logql.query(queryStr);
        if (res.status === 'success' && res.data?.result?.length > 0) {
          const lines = [];
          for (const item of res.data.result) {
            for (const val of item.values || []) {
              lines.push(`${new Date(Number(val[0]) / 1000000).toISOString()} ${val[1]}`);
            }
          }
          return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
        }
        return { stdout: `Common query: 0 streams matched.\n`, stderr: '', code: 0 };
      }
    }

    return {
      stdout: 'logcli - Command line interface for Loki v2.9.8\nusage: logcli <command> [<args> ...]\n',
      stderr: '',
      code: 0
    };
  }

  handleOtelcol({ argv = [] }) {
    const sub = argv[1];
    let configPath = '';
    for (let i = 1; i < argv.length; i++) {
      if (argv[i].startsWith('--config=')) configPath = argv[i].split('=')[1];
      else if (argv[i] === '--config') configPath = argv[++i];
    }

    if (sub === 'validate' || configPath) {
      if (this.vfs && configPath && this.vfs.exists(configPath)) {
        const content = this.vfs.readFile(configPath);
        if (OTelPipelineValidator) {
          const val = OTelPipelineValidator.validate(content);
          if (val.valid) {
            return {
              stdout: `Validation succeeded.\n${val.warnings.length > 0 ? 'Warnings:\n' + val.warnings.join('\n') + '\n' : ''}`,
              stderr: '',
              code: 0
            };
          }
          return {
            stdout: '',
            stderr: `Configuration validation failed:\n${val.errors.join('\n')}\n`,
            code: 1
          };
        }
      }
      return { stdout: 'Configuration validation succeeded.\n', stderr: '', code: 0 };
    }

    return {
      stdout: 'OpenTelemetry Collector v0.108.0\nusage: otelcol validate --config=<path>\n',
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
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
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
          '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
          '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
          '    inet 127.0.0.1/8 scope host lo',
          '       valid_lft forever preferred_lft forever',
          '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000',
          '    link/ether 02:42:ac:11:00:02 brd ff:ff:ff:ff:ff:ff',
          '    inet 192.168.1.10/24 brd 192.168.1.255 scope global eth0',
          '       valid_lft forever preferred_lft forever',
          '3: cilium_host: <UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000',
          '    link/ether 26:95:67:3a:48:84 brd ff:ff:ff:ff:ff:ff',
          '    inet 10.244.0.1/32 scope link cilium_host',
          '       valid_lft forever preferred_lft forever'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'route' || sub === 'r') {
      return {
        stdout: [
          'default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.10 metric 100',
          '10.244.0.0/16 via 10.244.0.1 dev cilium_host proto kernel src 10.244.0.1',
          '192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10 metric 100'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'link' || sub === 'l') {
      return {
        stdout: [
          '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000',
          '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
          '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT group default qlen 1000',
          '    link/ether 02:42:ac:11:00:02 brd ff:ff:ff:ff:ff:ff',
          '3: cilium_host: <UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default qlen 1000',
          '    link/ether 26:95:67:3a:48:84 brd ff:ff:ff:ff:ff:ff'
        ].join('\n') + '\n',
        stderr: '',
        code: 0
      };
    }

    if (sub === 'netns') {
      const action = argv[2] || 'list';
      if (action === 'list') {
        const list = this.netnsList || ['cni-0a1b2c3d4e (id: 0)', 'cni-9f8e7d6c5b (id: 1)'];
        return {
          stdout: list.join('\n') + '\n',
          stderr: '',
          code: 0
        };
      }
      if (action === 'add') {
        const nsName = argv[3];
        if (!this.netnsList) {
          this.netnsList = ['cni-0a1b2c3d4e (id: 0)', 'cni-9f8e7d6c5b (id: 1)'];
        }
        if (nsName && !this.netnsList.some((n) => n.startsWith(nsName))) {
          this.netnsList.push(`${nsName} (id: ${this.netnsList.length})`);
        }
        return { stdout: '', stderr: '', code: 0 };
      }
      if (action === 'del' || action === 'delete') {
        const nsName = argv[3];
        if (this.netnsList && nsName) {
          this.netnsList = this.netnsList.filter((n) => !n.startsWith(nsName));
        }
        return { stdout: '', stderr: '', code: 0 };
      }
      if (action === 'exec') {
        const nsCmd = argv.slice(4).join(' ') || 'ip a';
        return { stdout: `[netns ${argv[3]}] ${nsCmd}\n`, stderr: '', code: 0 };
      }
    }

    return { stdout: 'default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.10 metric 100\n', stderr: '', code: 0 };
  }

  handleIptables({ argv = [] }) {
    const isNat = argv.includes('-t') && (argv[argv.indexOf('-t') + 1] === 'nat');
    const isList = argv.includes('-L') || argv.includes('--list') || argv.length <= 1;

    if (isList) {
      if (isNat) {
        const lines = [
          'Chain PREROUTING (policy ACCEPT 1420 packets, 85K bytes)',
          ' pkts bytes target     prot opt in     out     source               destination',
          ' 1420   85K KUBE-SERVICES  all  --  *      *       0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */',
          '',
          'Chain INPUT (policy ACCEPT 1204 packets, 72K bytes)',
          ' pkts bytes target     prot opt in     out     source               destination',
          '',
          'Chain OUTPUT (policy ACCEPT 940 packets, 56K bytes)',
          ' pkts bytes target     prot opt in     out     source               destination',
          '  940   56K KUBE-SERVICES  all  --  *      *       0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */',
          '',
          'Chain POSTROUTING (policy ACCEPT 3410 packets, 204K bytes)',
          ' pkts bytes target     prot opt in     out     source               destination',
          ' 3410  204K KUBE-POSTROUTING  all  --  *   *       0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */',
          '',
          'Chain KUBE-SERVICES (2 references)',
          ' pkts bytes target     prot opt in     out     source               destination',
          '  120  7200 KUBE-SVC-K8S  tcp  --  *      *       0.0.0.0/0            10.96.0.1            /* default/kubernetes:https cluster IP */ tcp dpt:443',
          '  450 27000 KUBE-SVC-DNS  udp  --  *      *       0.0.0.0/0            10.96.0.10           /* kube-system/kube-dns:dns cluster IP */ udp dpt:53'
        ];
        return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
      }

      // Filter table default
      const lines = [
        'Chain INPUT (policy ACCEPT 4520 packets, 270K bytes)',
        ' pkts bytes target     prot opt in     out     source               destination',
        ' 1102   66K ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:6443 /* kube-apiserver secure port */',
        '  940   56K ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:2379 /* etcd client port */',
        '',
        'Chain FORWARD (policy ACCEPT 1840 packets, 110K bytes)',
        ' pkts bytes target     prot opt in     out     source               destination',
        ' 1840  110K KUBE-FORWARD  all  --  *    *       0.0.0.0/0            0.0.0.0/0            /* kubernetes forwarding rules */',
        '',
        'Chain OUTPUT (policy ACCEPT 4120 packets, 247K bytes)',
        ' pkts bytes target     prot opt in     out     source               destination'
      ];
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

    return { stdout: '', stderr: '', code: 0 };
  }

  handleSs({ argv = [] }) {
    const headers = ['Netid', 'State', 'Recv-Q', 'Send-Q', 'Local Address:Port', 'Peer Address:Port', 'Process'];
    const rows = [
      ['tcp', 'LISTEN', '0', '4096', '0.0.0.0:6443', '0.0.0.0:*', 'users:(("kube-apiserver",pid=1102,fd=7))'],
      ['tcp', 'LISTEN', '0', '4096', '127.0.0.1:2379', '0.0.0.0:*', 'users:(("etcd",pid=940,fd=6))'],
      ['tcp', 'LISTEN', '0', '4096', '0.0.0.0:10250', '0.0.0.0:*', 'users:(("kubelet",pid=1420,fd=12))'],
      ['tcp', 'LISTEN', '0', '4096', '0.0.0.0:80', '0.0.0.0:*', 'users:(("nginx",pid=2190,fd=4))'],
      ['udp', 'UNCONN', '0', '0', '0.0.0.0:53', '0.0.0.0:*', 'users:(("coredns",pid=1850,fd=5))']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleNc({ argv = [] }) {
    const isZeroIo = argv.some((a) => a.startsWith('-') && a.includes('z'));
    const nonFlags = argv.slice(1).filter((a) => !a.startsWith('-'));
    const host = nonFlags.find((a) => !/^\d+$/.test(a)) || '127.0.0.1';
    const port = nonFlags.find((a) => /^\d+$/.test(a)) || '80';

    if (isZeroIo) {
      return {
        stdout: `Connection to ${host} ${port} port [tcp] succeeded!\n`,
        stderr: '',
        code: 0
      };
    }
    return { stdout: `Listening on ${host}:${port}...\n`, stderr: '', code: 0 };
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

  handlePs({ argv = [] }) {
    const isAux = argv.some((a) => a === 'aux' || a === '-aux' || a === '-ef' || a === 'ef');
    if (isAux) {
      const headers = ['USER', 'PID', '%CPU', '%MEM', 'VSZ', 'RSS', 'TTY', 'STAT', 'START', 'TIME', 'COMMAND'];
      const rows = this.simulatedProcesses.map((p) => [
        p.user, String(p.pid), p.cpu, p.mem, p.vsz, p.rss, p.tty, p.stat, p.start, p.time, p.command
      ]);
      return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
    }

    const headers = ['PID', 'TTY', 'TIME', 'CMD'];
    const rows = this.simulatedProcesses.map((p) => [String(p.pid), p.tty, p.time, p.command.split(/\s+/)[0]]);
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleKill({ argv = [] }) {
    const pidArg = argv.find((a) => !a.startsWith('-') && /^\d+$/.test(a));
    if (!pidArg) {
      return { stdout: '', stderr: 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n', code: 1 };
    }
    const pid = parseInt(pidArg, 10);
    const idx = this.simulatedProcesses.findIndex((p) => p.pid === pid);
    if (idx !== -1) {
      this.simulatedProcesses.splice(idx, 1);
      return { stdout: '', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: `bash: kill: (${pid}) - No such process\n`, code: 1 };
  }

  handleSystemctl({ argv = [] }) {
    const action = argv[1] || 'status';
    const unit = (argv[2] || 'kubelet').replace(/\.service$/, '');
    const svc = this.systemdUnits[unit];

    if (!svc && action !== 'daemon-reload') {
      return { stdout: '', stderr: `Unit ${unit}.service could not be found.\n`, code: 4 };
    }

    if (action === 'status') {
      const lines = [
        `● ${unit}.service - ${svc.desc}`,
        `     Loaded: loaded (/usr/lib/systemd/system/${unit}.service; enabled; preset: enabled)`,
        `     Active: ${svc.status} (${svc.substate}) since Wed 2026-11-12 10:00:00 UTC; 6h ago`,
        `   Main PID: ${svc.pid} (${unit})`,
        `      Tasks: 34 (limit: 38334)`,
        `     Memory: 84.2M`,
        `        CPU: 45.210s`,
        `     CGroup: /system.slice/${unit}.service`,
        `             └─${svc.pid} /usr/bin/${unit}`
      ];
      return { stdout: lines.join('\n') + '\n', stderr: '', code: svc.status === 'active' ? 0 : 3 };
    }

    if (action === 'is-active') {
      return { stdout: `${svc.status}\n`, stderr: '', code: svc.status === 'active' ? 0 : 3 };
    }

    if (action === 'start' || action === 'restart' || action === 'enable') {
      svc.status = 'active';
      svc.substate = 'running';

      // If kubelet or containerd restarted, reconcile NotReady nodes to Ready!
      if (unit === 'kubelet' || unit === 'containerd') {
        if (this.graph) {
          const nodes = this.graph.list({ kind: 'Node' });
          for (const node of nodes) {
            node.status = node.status || {};
            if (node.status.phase === 'NotReady') node.status.phase = 'Ready';
            if (node.status.conditions) {
              const readyCond = node.status.conditions.find((c) => c.type === 'Ready');
              if (readyCond) {
                readyCond.status = 'True';
                readyCond.reason = 'KubeletReady';
                readyCond.message = 'kubelet is posting ready status';
              }
            }
            this.graph.update(node);
          }
          if (this.controllerManager) this.controllerManager.reconcile();
        }
      }
      return { stdout: '', stderr: '', code: 0 };
    }

    if (action === 'stop' || action === 'disable') {
      svc.status = 'inactive';
      svc.substate = 'dead';
      if (unit === 'kubelet' && this.graph) {
        const nodes = this.graph.list({ kind: 'Node' });
        for (const node of nodes) {
          node.status = node.status || {};
          node.status.phase = 'NotReady';
          if (node.status.conditions) {
            const readyCond = node.status.conditions.find((c) => c.type === 'Ready');
            if (readyCond) {
              readyCond.status = 'False';
              readyCond.reason = 'KubeletNotReady';
              readyCond.message = 'kubelet stopped';
            }
          }
          this.graph.update(node);
        }
      }
      return { stdout: '', stderr: '', code: 0 };
    }

    if (action === 'daemon-reload') {
      return { stdout: '', stderr: '', code: 0 };
    }

    return { stdout: '', stderr: `Unknown systemctl command: ${action}\n`, code: 1 };
  }

  handleJournalctl({ argv = [] }) {
    let unit = 'kubelet';
    let linesCount = 50;
    let priority = 'info';
    for (let i = 1; i < argv.length; i++) {
      if ((argv[i] === '-u' || argv[i] === '--unit') && i + 1 < argv.length) {
        unit = argv[++i].replace(/\.service$/, '');
      } else if ((argv[i] === '-n' || argv[i] === '--lines') && i + 1 < argv.length) {
        linesCount = parseInt(argv[++i], 10) || 50;
      } else if ((argv[i] === '-p' || argv[i] === '--priority') && i + 1 < argv.length) {
        priority = argv[++i];
      }
    }

    let logs;
    if (priority === 'err' || priority === '3' || priority === 'error') {
      logs = [
        `Nov 14 08:30:10 kubelabs-node ${unit}[1420]: E1114 08:30:10.112233 grpc: conn.reset by peer /run/${unit}/${unit}.sock`,
        `Nov 14 08:30:11 kubelabs-node ${unit}[1420]: E1114 08:30:11.223344 client.go:189] "Failed to connect to runtime service" err="connection refused"`,
        `Nov 14 08:30:12 kubelabs-node ${unit}[1420]: E1114 08:30:12.334455 server.go:420] "Node status sync failed" error="rpc error: code = Unavailable desc = transport is closing"`
      ];
    } else {
      logs = [
        `Nov 14 08:00:00 kubelabs-node ${unit}[1420]: I1114 08:00:00.123456 server.go:412] "Starting ${unit}" version="v1.31.0"`,
        `Nov 14 08:00:01 kubelabs-node ${unit}[1420]: I1114 08:00:01.234567 daemon.go:345] "Initializing subsystem runtime socket"`,
        `Nov 14 08:00:02 kubelabs-node ${unit}[1420]: I1114 08:00:02.345678 status_manager.go:78] "Successfully registered status with cluster"`,
        `Nov 14 08:00:03 kubelabs-node ${unit}[1420]: I1114 08:00:03.456789 manager.go:90] "Syncing state loop completed successfully"`
      ];
    }
    return { stdout: logs.slice(0, linesCount).join('\n') + '\n', stderr: '', code: 0 };
  }

  handlePvcreate({ argv = [] }) {
    const dev = argv.slice(1).find((a) => !a.startsWith('-'));
    if (!dev) {
      return { stdout: '', stderr: 'pvcreate: missing device operand\n', code: 1 };
    }
    this.lvm.pvs[dev] = {
      pv: dev,
      vg: '',
      fmt: 'lvm2',
      attr: 'a--',
      psize: '100.00g',
      pfree: '100.00g'
    };
    return { stdout: `  Physical volume "${dev}" successfully created.\n`, stderr: '', code: 0 };
  }

  handlePvs() {
    const pvsList = Object.values(this.lvm.pvs);
    const header = '  PV         VG       Fmt  Attr PSize   PFree  \n';
    if (pvsList.length === 0) {
      return { stdout: header, stderr: '', code: 0 };
    }
    const rows = pvsList.map((p) => {
      const pv = (p.pv || '').padEnd(10);
      const vg = (p.vg || '').padEnd(8);
      const fmt = (p.fmt || 'lvm2').padEnd(4);
      const attr = (p.attr || 'a--').padEnd(5);
      const psize = (p.psize || '100.00g').padEnd(8);
      const pfree = (p.pfree || '100.00g');
      return `  ${pv} ${vg} ${fmt} ${attr} ${psize} ${pfree}`;
    });
    return { stdout: header + rows.join('\n') + '\n', stderr: '', code: 0 };
  }

  handleVgcreate({ argv = [] }) {
    const nonFlags = argv.slice(1).filter((a) => !a.startsWith('-'));
    if (nonFlags.length < 2) {
      return { stdout: '', stderr: 'vgcreate: missing volume group or device operand\n', code: 1 };
    }
    const vg = nonFlags[0];
    const devs = nonFlags.slice(1);
    for (const d of devs) {
      if (this.lvm.pvs[d]) {
        this.lvm.pvs[d].vg = vg;
      }
    }
    this.lvm.vgs[vg] = {
      vg,
      numPv: devs.length,
      numLv: 0,
      attr: 'wz--n-',
      vsize: '100.00g',
      vfree: '100.00g',
      devs
    };
    return { stdout: `  Volume group "${vg}" successfully created\n`, stderr: '', code: 0 };
  }

  handleVgs() {
    const vgsList = Object.values(this.lvm.vgs);
    const header = '  VG       #PV #LV #SN Attr   VSize   VFree  \n';
    if (vgsList.length === 0) {
      return { stdout: header, stderr: '', code: 0 };
    }
    const rows = vgsList.map((v) => {
      const vg = (v.vg || '').padEnd(8);
      const numPv = String(v.numPv || 1).padStart(3);
      const numLv = String(v.numLv || 0).padStart(3);
      const numSn = '  0';
      const attr = (v.attr || 'wz--n-').padEnd(6);
      const vsize = (v.vsize || '100.00g').padStart(7);
      const vfree = (v.vfree || '100.00g').padStart(7);
      return `  ${vg} ${numPv} ${numLv} ${numSn} ${attr} ${vsize} ${vfree}`;
    });
    return { stdout: header + rows.join('\n') + '\n', stderr: '', code: 0 };
  }

  handleLvcreate({ argv = [] }) {
    let size = '20.00g';
    let lvName = 'lvol0';
    let vgName = '';

    for (let i = 1; i < argv.length; i++) {
      if ((argv[i] === '-L' || argv[i] === '--size') && i + 1 < argv.length) {
        size = argv[++i];
      } else if ((argv[i] === '-n' || argv[i] === '--name') && i + 1 < argv.length) {
        lvName = argv[++i];
      } else if (!argv[i].startsWith('-')) {
        vgName = argv[i];
      }
    }

    if (!vgName) {
      return { stdout: '', stderr: 'lvcreate: missing volume group name operand\n', code: 1 };
    }

    this.lvm.lvs[lvName] = {
      lv: lvName,
      vg: vgName,
      attr: '-wi-a-----',
      lsize: size.toLowerCase().endsWith('g') ? size : `${size}g`
    };

    if (this.lvm.vgs[vgName]) {
      this.lvm.vgs[vgName].numLv++;
    }

    return { stdout: `  Logical volume "${lvName}" created.\n`, stderr: '', code: 0 };
  }

  handleLvs() {
    const lvsList = Object.values(this.lvm.lvs);
    const header = '  LV            VG       Attr       LSize \n';
    if (lvsList.length === 0) {
      return { stdout: header, stderr: '', code: 0 };
    }
    const rows = lvsList.map((l) => {
      const lv = (l.lv || '').padEnd(13);
      const vg = (l.vg || '').padEnd(8);
      const attr = (l.attr || '-wi-a-----').padEnd(10);
      const lsize = (l.lsize || '20.00g').padStart(6);
      return `  ${lv} ${vg} ${attr} ${lsize}`;
    });
    return { stdout: header + rows.join('\n') + '\n', stderr: '', code: 0 };
  }

  handleSysctl({ argv = [] }) {
    const writeFlag = argv.includes('-w');
    if (writeFlag) {
      const idx = argv.indexOf('-w');
      const kv = argv[idx + 1];
      if (kv && kv.includes('=')) {
        const [k, v] = kv.split('=');
        this.sysctls[k.trim()] = v.trim();
        return { stdout: `${k.trim()} = ${v.trim()}\n`, stderr: '', code: 0 };
      }
    }

    const firstArg = argv[1];
    if (firstArg && firstArg.includes('=')) {
      const [k, v] = firstArg.split('=');
      this.sysctls[k.trim()] = v.trim();
      return { stdout: `${k.trim()} = ${v.trim()}\n`, stderr: '', code: 0 };
    }

    if (firstArg && !firstArg.startsWith('-')) {
      const val = this.sysctls[firstArg];
      if (val !== undefined) {
        return { stdout: `${firstArg} = ${val}\n`, stderr: '', code: 0 };
      }
      return { stdout: '', stderr: `sysctl: cannot stat /proc/sys/${firstArg.replace(/\./g, '/')}: No such file or directory\n`, code: 1 };
    }

    const entries = Object.entries(this.sysctls).map(([k, v]) => `${k} = ${v}`);
    return { stdout: entries.join('\n') + '\n', stderr: '', code: 0 };
  }

  handleUnshare({ argv = [] }) {
    const subcmd = argv.slice(1).filter((a) => !a.startsWith('-')).join(' ');
    if (subcmd) {
      return {
        stdout: `[isolated-ns] execution of "${subcmd}" successful in isolated namespaces (mnt, uts, ipc, pid, net)\n`,
        stderr: '',
        code: 0
      };
    }
    return {
      stdout: '[root@kubelabs-node /]# (new namespace initialized: CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET)\n',
      stderr: '',
      code: 0
    };
  }

  handleTop() {
    return {
      stdout: 'top - 16:00:00 up 2 days, 1 user, load average: 0.12, 0.18, 0.15\nTasks: 120 total, 1 running, 119 sleeping, 0 stopped, 0 zombie\n%Cpu(s):  2.4 us,  1.1 sy,  0.0 ni, 96.5 id,  0.0 wa\n',
      stderr: '',
      code: 0
    };
  }

  handleDf({ argv = [] }) {
    const isHuman = argv.includes('-h');
    const headers = ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'];
    const rows = [
      ['/dev/root', isHuman ? '50G' : '52428800', isHuman ? '12G' : '12582912', isHuman ? '36G' : '37748736', '25%', '/'],
      ['tmpfs', isHuman ? '3.8G' : '3984588', '0', isHuman ? '3.8G' : '3984588', '0%', '/dev/shm'],
      ['/dev/sda1', isHuman ? '100G' : '104857600', isHuman ? '22G' : '23068672', isHuman ? '78G' : '81788928', '22%', '/var/lib/containerd']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleFree({ argv = [] }) {
    const isHuman = argv.includes('-h');
    const isMb = argv.includes('-m');
    const unit = isHuman ? 'Gi' : (isMb ? 'Mi' : '');
    const headers = ['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'];
    const rows = [
      ['Mem:', `8192${unit}`, `2410${unit}`, `4120${unit}`, `32${unit}`, `1662${unit}`, `5782${unit}`],
      ['Swap:', `2048${unit}`, `0${unit}`, `2048${unit}`, '', '', '']
    ];
    return { stdout: this._formatTable(headers, rows) + '\n', stderr: '', code: 0 };
  }

  handleUname({ argv = [] }) {
    if (argv.includes('-r')) return { stdout: '6.8.0-40-generic\n', stderr: '', code: 0 };
    if (argv.includes('-m')) return { stdout: 'x86_64\n', stderr: '', code: 0 };
    if (argv.includes('-s')) return { stdout: 'Linux\n', stderr: '', code: 0 };
    return { stdout: 'Linux kubelabs-node 6.8.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 15. POSIX / BASH SHELL BUILTINS HANDLERS (VFS BACKED)
  // -------------------------------------------------------------------------

  handleLs({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let showAll = false;
    let longFormat = false;
    let human = false;
    let oneCol = false;
    let target = null;

    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a.startsWith('-') && a.length > 1) {
        if (a.includes('a')) showAll = true;
        if (a.includes('l')) longFormat = true;
        if (a.includes('h')) human = true;
        if (a.includes('1')) oneCol = true;
      } else if (!target) {
        target = a;
      }
    }

    if (!fs) {
      return { stdout: 'manifest.yaml  deployment.yaml  service.yaml\n', stderr: '', code: 0 };
    }

    const resolved = fs.normalizePath(target || cwd, cwd);
    let names;
    try {
      const stat = fs.stat(resolved);
      if (stat.isFile && stat.isFile()) {
        return { stdout: `${target}\n`, stderr: '', code: 0 };
      }
      names = fs.listDir(resolved);
    } catch (err) {
      return { stdout: '', stderr: `ls: cannot access '${target || resolved}': No such file or directory\n`, code: 2 };
    }

    if (showAll) {
      names = ['.', '..', ...names];
    } else {
      names = names.filter((n) => !n.startsWith('.'));
    }
    names.sort();

    if (longFormat) {
      const formatMode = (m, isDir) => {
        const prefix = isDir ? 'd' : '-';
        const rwx = (b) => (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-');
        return prefix + rwx((m >> 6) & 7) + rwx((m >> 3) & 7) + rwx(m & 7);
      };
      const lines = names.map((name) => {
        const itemPath = name === '.' || name === '..' ? resolved : `${resolved}/${name}`.replace('//', '/');
        let stat;
        try { stat = fs.stat(itemPath); } catch { stat = { mode: 0o644, size: 0, isDirectory: () => false }; }
        const isDir = stat.isDirectory && stat.isDirectory();
        const modeStr = formatMode(stat.mode || (isDir ? 0o755 : 0o644), isDir);
        const sizeStr = human ? `${Math.round((stat.size || 0) / 1024)}K` : String(stat.size || 0);
        return `${modeStr} 1 learner learner ${sizeStr.padStart(6)} Nov 12 10:00 ${name}`;
      });
      return { stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    }

    if (oneCol) {
      return { stdout: names.join('\n') + (names.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    }

    return { stdout: names.join('  ') + (names.length > 0 ? '\n' : ''), stderr: '', code: 0 };
  }

  handleCd({ argv = [], cwd = '/home/learner', vfs = null, env = {} }) {
    const fs = vfs || this.vfs;
    const target = argv[1] || '~';
    let dest = target;

    if (target === '~' || target === '') {
      dest = env.HOME || '/home/learner';
    } else if (target === '-') {
      dest = env.OLDPWD || cwd;
    }

    if (!fs) return { stdout: '', stderr: '', code: 0, cwd: dest };
    const resolved = fs.normalizePath(dest, cwd);

    try {
      const stat = fs.stat(resolved);
      if (!stat.isDirectory()) {
        return { stdout: '', stderr: `bash: cd: ${target}: Not a directory\n`, code: 1 };
      }
    } catch {
      return { stdout: '', stderr: `bash: cd: ${target}: No such file or directory\n`, code: 1 };
    }

    env.OLDPWD = cwd;
    env.PWD = resolved;
    return { stdout: '', stderr: '', code: 0, cwd: resolved };
  }

  handlePwd({ cwd = '/home/learner' }) {
    return { stdout: `${cwd}\n`, stderr: '', code: 0 };
  }

  handleCat({ argv = [], stdin = '', cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let numberLines = false;
    const files = [];

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-n' || argv[i] === '--number') {
        numberLines = true;
      } else if (!argv[i].startsWith('-')) {
        files.push(argv[i]);
      }
    }

    if (files.length === 0) {
      return { stdout: stdin ? (stdin.endsWith('\n') ? stdin : stdin + '\n') : '', stderr: '', code: 0 };
    }

    let combined = '';
    for (const f of files) {
      if (!fs) return { stdout: '', stderr: `cat: ${f}: No such file or directory\n`, code: 1 };
      const resolved = fs.normalizePath(f, cwd);
      try {
        const content = fs.readFile(resolved);
        combined += content;
      } catch (err) {
        return { stdout: '', stderr: `cat: ${f}: No such file or directory\n`, code: 1 };
      }
    }

    if (numberLines) {
      const lines = combined.split('\n');
      const numbered = lines.map((l, idx) => `${String(idx + 1).padStart(6)}  ${l}`).join('\n');
      return { stdout: numbered.endsWith('\n') ? numbered : numbered + '\n', stderr: '', code: 0 };
    }

    return { stdout: combined.endsWith('\n') ? combined : combined + '\n', stderr: '', code: 0 };
  }

  handleMkdir({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let parents = false;
    const dirs = [];

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-p' || argv[i] === '--parents') parents = true;
      else if (!argv[i].startsWith('-')) dirs.push(argv[i]);
    }

    if (dirs.length === 0) {
      return { stdout: '', stderr: 'mkdir: missing operand\n', code: 1 };
    }

    for (const d of dirs) {
      if (!fs) continue;
      const resolved = fs.normalizePath(d, cwd);
      try {
        fs.mkdir(resolved, { recursive: parents });
      } catch (err) {
        return { stdout: '', stderr: `mkdir: cannot create directory '${d}': ${err.message}\n`, code: 1 };
      }
    }

    return { stdout: '', stderr: '', code: 0 };
  }

  handleRm({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let recursive = false;
    let force = false;
    const paths = [];

    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a === '-r' || a === '-R' || a === '-rf' || a === '-fr') {
        recursive = true;
        if (a.includes('f')) force = true;
      } else if (a === '-f') {
        force = true;
      } else if (!a.startsWith('-')) {
        paths.push(a);
      }
    }

    for (const p of paths) {
      if (!fs) continue;
      const resolved = fs.normalizePath(p, cwd);
      try {
        const stat = fs.stat(resolved);
        if (stat.isDirectory()) {
          if (!recursive) {
            return { stdout: '', stderr: `rm: cannot remove '${p}': Is a directory\n`, code: 1 };
          }
          fs.rm(resolved, { recursive: true });
        } else {
          fs.unlink(resolved);
        }
      } catch (err) {
        if (!force) {
          return { stdout: '', stderr: `rm: cannot remove '${p}': No such file or directory\n`, code: 1 };
        }
      }
    }

    return { stdout: '', stderr: '', code: 0 };
  }

  handleCp({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let recursive = false;
    const paths = [];

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-r' || argv[i] === '-R') recursive = true;
      else if (!argv[i].startsWith('-')) paths.push(argv[i]);
    }

    if (paths.length < 2) {
      return { stdout: '', stderr: 'cp: missing file operand\n', code: 1 };
    }

    if (!fs) return { stdout: '', stderr: '', code: 0 };

    const src = fs.normalizePath(paths[0], cwd);
    const dest = fs.normalizePath(paths[1], cwd);

    try {
      if (typeof fs.cp === 'function') {
        fs.cp(src, dest, { recursive });
      } else {
        const content = fs.readFile(src);
        fs.writeFile(dest, content);
      }
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `cp: cannot stat '${paths[0]}': ${err.message}\n`, code: 1 };
    }
  }

  handleMv({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const paths = argv.slice(1).filter((a) => !a.startsWith('-'));
    if (paths.length < 2) {
      return { stdout: '', stderr: 'mv: missing file operand\n', code: 1 };
    }
    if (!fs) return { stdout: '', stderr: '', code: 0 };

    const src = fs.normalizePath(paths[0], cwd);
    const dest = fs.normalizePath(paths[1], cwd);

    try {
      if (typeof fs.rename === 'function') {
        fs.rename(src, dest);
      } else {
        const content = fs.readFile(src);
        fs.writeFile(dest, content);
        fs.unlink(src);
      }
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `mv: cannot stat '${paths[0]}': ${err.message}\n`, code: 1 };
    }
  }

  handleChmod({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const modeArg = argv[1];
    const fileArg = argv[2];

    if (!modeArg || !fileArg) {
      return { stdout: '', stderr: 'chmod: missing operand\n', code: 1 };
    }

    if (!fs) return { stdout: '', stderr: '', code: 0 };
    const resolved = fs.normalizePath(fileArg, cwd);

    try {
      fs.chmod(resolved, modeArg);
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `chmod: cannot access '${fileArg}': ${err.message}\n`, code: 1 };
    }
  }

  handleChown({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    const ownerArg = argv[1];
    const fileArg = argv[2];

    if (!ownerArg || !fileArg) {
      return { stdout: '', stderr: 'chown: missing operand\n', code: 1 };
    }

    if (!fs) return { stdout: '', stderr: '', code: 0 };
    const resolved = fs.normalizePath(fileArg, cwd);

    try {
      fs.chown(resolved, ownerArg);
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `chown: cannot access '${fileArg}': ${err.message}\n`, code: 1 };
    }
  }

  handleLn({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let symbolic = false;
    const paths = [];

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-s' || argv[i] === '--symbolic') symbolic = true;
      else if (!argv[i].startsWith('-')) paths.push(argv[i]);
    }

    if (paths.length < 2) {
      return { stdout: '', stderr: 'ln: missing file operand\n', code: 1 };
    }

    if (!fs) return { stdout: '', stderr: '', code: 0 };
    const target = paths[0];
    const linkPath = fs.normalizePath(paths[1], cwd);

    try {
      fs.symlink(target, linkPath);
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `ln: failed to create symbolic link '${paths[1]}': ${err.message}\n`, code: 1 };
    }
  }

  handleFind({ argv = [], cwd = '/home/learner', vfs = null }) {
    const fs = vfs || this.vfs;
    let startPath = cwd;
    let nameFilter = null;
    let typeFilter = null;

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-name' && i + 1 < argv.length) {
        nameFilter = argv[++i].replace(/^['"]|['"]$/g, '');
      } else if (argv[i] === '-type' && i + 1 < argv.length) {
        typeFilter = argv[++i];
      } else if (!argv[i].startsWith('-') && i === 1) {
        startPath = argv[i];
      }
    }

    if (!fs) return { stdout: `${startPath}\n`, stderr: '', code: 0 };
    const resolved = fs.normalizePath(startPath, cwd);

    try {
      if (typeof fs.find === 'function') {
        const matches = fs.find(resolved, { name: nameFilter, type: typeFilter });
        return { stdout: matches.join('\n') + (matches.length > 0 ? '\n' : ''), stderr: '', code: 0 };
      }
      return { stdout: `${resolved}\n`, stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `find: '${startPath}': No such file or directory\n`, code: 1 };
    }
  }

  handleEnv({ env = {} }) {
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    return { stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
  }

  handleExport({ argv = [], env = {} }) {
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      const eq = a.indexOf('=');
      if (eq > -1) {
        const k = a.slice(0, eq).trim();
        const v = a.slice(eq + 1).replace(/^['"]|['"]$/g, '').trim();
        env[k] = v;
      }
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  handleEcho({ argv = [] }) {
    let noNewline = false;
    const parts = [];

    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '-n' && i === 1) {
        noNewline = true;
      } else {
        parts.push(argv[i].replace(/^['"]|['"]$/g, ''));
      }
    }

    const out = parts.join(' ');
    return { stdout: noNewline ? out : out + '\n', stderr: '', code: 0 };
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
