# KubeLabs v3.0: Comprehensive Project Walkthrough & Technical Reference

```
  ██╗  ██╗██╗   ██╗██████╗ ███████╗██╗      █████╗ ██████╗ ███████╗
  ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██║     ██╔══██╗██╔══██╗██╔════╝
  █████╔╝ ██║   ██║██████╔╝█████╗  ██║     ███████║██████╔╝███████╗
  ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══██╗╚════██║
  ██║  ██╗╚██████╔╝██████╔╝███████╗███████╗██║  ██║██████╔╝███████║
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

> **Standalone, Low-Resource, Cross-Platform (Web, Desktop, Mobile), Learn-by-Doing Kubernetes & Cloud-Native Simulation Platform**
> 
> *Version 3.0.0 • Zero Third-Party Runtime Dependencies (`"dependencies": {}`) • Native Node.js 22+ & SQLite WAL • 100% Offline-Capable PWA & Unified Isomorphic Core • Deterministic State-Graph Evaluation • 26 Domains • 52 Labs • 15 Production Incidents • 8 Capstones • 6 Certifications (Ed25519 Signed) • 40 Subphases (100% Verified) • 206+ Automated Tests (100% Passing) • 53 Automated Quality Gates*

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Target-State Architecture & Unified Isomorphic Core](#2-target-state-architecture--unified-isomorphic-core)
3. [Core Engines Deep Dive (`src/core/`)](#3-core-engines-deep-dive-srccore)
4. [User Interface & Interactive Workbench (UI/UX v3)](#4-user-interface--interactive-workbench-uiux-v3)
5. [Master Curriculum, Incident & Capstone Catalog](#5-master-curriculum-incident--capstone-catalog)
6. [Practical Hands-On Walkthroughs](#6-practical-hands-on-walkthroughs)
7. [Local Usage, Deployment & Packaging Guide](#7-local-usage-deployment--packaging-guide)
8. [Governance, 11-Agent Quality Gate & Verification Ledger](#8-governance-11-agent-quality-gate--verification-ledger)
9. [Complete Repository Structure & File Index](#9-complete-repository-structure--file-index)

---

## 1. Executive Summary & Core Philosophy

**KubeLabs v3.0** is an enterprise-grade, standalone, zero-dependency, cross-platform learning laboratory and simulation platform for Kubernetes, the Cloud Native Computing Foundation (CNCF) ecosystem, GitOps, DevSecOps, Site Reliability Engineering (SRE), Platform Engineering, Service Mesh, and emerging cloud technologies (Wasm, eBPF Tetragon, FinOps, and Cloud-Native AI/ML).

### The Inherent Flaws of Traditional Learning Environments

| Dimension | Traditional VMs (Minikube / Kind) | Remote Ephemeral VMs (Katacoda / Killercoda) | KubeLabs v3.0 |
|---|---|---|---|
| **RAM Footprint** | 8 GB – 16 GB | 0 MB (Client) / Massive Cloud VM Host | **~51 MB RSS** (Server) / In-Browser PWA |
| **Startup Latency** | 2 to 5 minutes | 30 to 90 seconds queue | **< 250 milliseconds** (Instant) |
| **Hardware Reqs** | VT-x / AMD-V virtualization, 4+ cores | High-bandwidth internet required | Runs on budget laptops, mobile browsers, tablets |
| **Offline Capability** | Partial (requires pre-pulled Docker images) | 0% (Fails completely offline) | **100% Offline PWA** via Service Worker & Isomorphic Core |
| **Grading Model** | Fragile regex matching on shell history | Fragile bash command regex checks | **Deterministic State-Graph Reconciliation** |
| **Security Risk** | Root container escape / host exposure | Shared kernel security boundaries | **Zero Host Shell (`child_process.exec` forbidden)** |
| **Runtime Dependencies** | Hundreds of npm / OS packages | Proprietary cloud infrastructure | **Zero Third-Party Dependencies (`"dependencies": {}`)** |

### Core Architectural Breakthroughs

1. **Zero External Runtime Dependencies (`"dependencies": {}`)**:
   Everything runs exclusively on native Node.js 22+ standard libraries (`node:http`, `node:sqlite`, `node:crypto`, `node:test`, `node:fs`, `node:path`). There is zero npm supply-chain risk, zero vulnerability patching overhead, and instant installation.
2. **Microsecond Declarative Virtual Control Plane**:
   Rather than spinning up heavyweight Linux kernels and Docker daemons, KubeLabs executes a lightweight, in-process Kubernetes API and reconciliation loop simulation that handles Deployments, StatefulSets, DaemonSets, Services, Endpoints, NetworkPolicies, RBAC, PVC dynamic binding, CoreDNS, and taints/tolerations in under 55 MB RSS RAM.
3. **Deterministic State-Graph Validation**:
   Labs are graded against the actual reconciled cluster object graph, not shell history. Whether configured through imperative CLI commands or declarative multi-document YAML manifests, only true cluster state determines success.
4. **Universal Isomorphism**:
   All core modules in `src/core/` execute identically in Node.js 22+ servers, in-browser WebWorkers, Desktop webviews (Tauri/Electron), and Mobile webviews (Capacitor), guaranteeing 100% offline parity.

---

## 2. Target-State Architecture & Unified Isomorphic Core

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PRESENTATION LAYER                                      │
│   Responsive Multi-Platform Workbench (Web PWA, Desktop Tauri/Electron, Mobile Capacitor) │
│   [Labs (52)] [Terminal] [Manifest Editor] [SVG Topology] [Incidents (15)] [Canvas]       │
│   [Capstones (8)] [Certifications (6)] [Socratic AI Mentor] [Self-Audit Gate (53 Checks)] │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │ HTTP / REST & OpenMetrics Telemetry (Port 4100)
┌─────────────────────────────────────────────▼─────────────────────────────────────────────┐
│                              API GATEWAY & SECURITY PERIMETER                             │
│   • Bounded Token-Bucket Rate Limiter (180 req/min/IP, probe-immune)                      │
│   • Security Headers: Strict-CSP, HSTS (2yr), X-Content-Type-Options, X-Frame-Options      │
│   • Bounded Request Body (1 MB limit) • Native Prometheus /metrics • /livez, /readyz      │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
┌─────────────────────────────────────────────▼─────────────────────────────────────────────┐
│                         MULTI-TENANT SESSION & STORAGE LAYER                              │
│   • SessionManager: Isolated VirtualCluster & In-Memory VFS per Session/Tab               │
│   • StorageAdapter: Native SQLite (WAL Mode, Parameterized) + CRDT VectorClock Engine    │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
┌─────────────────────────────────────────────▼─────────────────────────────────────────────┐
│                          UNIFIED ISOMORPHIC CORE (src/core/)                              │
│ ┌───────────────────────┐ ┌────────────────────────┐ ┌──────────────────────────────────┐ │
│ │   VirtualFileSystem   │ │      YamlParser        │ │            JsonPath              │ │
│ │ (POSIX In-Memory,     │ │ (Quote-Safe, Scalars,  │ │ (RFC 9535 Filter Expressions,    │ │
│ │  Symlinks, Perms)     │ │  Multi-Doc, Anchors)   │ │  Wildcards, Slices, Recursion)   │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │     ResourceGraph     │ │   ControllerManager    │ │       AdmissionController        │ │
│ │ (Object DAG, Indexes, │ │ (Deployments, Replicas,│ │ (Mutating/Validating Webhooks,   │ │
│ │  Cascading Deletion)  │ │  Services, Endpoints)  │ │  CEL Evaluator, PodSecurity PSS) │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │      ShellParser      │ │     PipelineDriver     │ │       MultiCliDispatcher         │ │
│ │ (Tokenizing, AST,     │ │ (POSIX In-Memory Stream│ │ (kubectl, helm, etcdctl, docker, │ │
│ │  Bash Quote Rules)    │ │  Pipes: grep, sed, awk)│ │  kubeadm, tofu, istioctl, etc.)  │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │    SchedulerEngine    │ │    NetworkingEngine    │ │   StorageAndSecurityEngine       │ │
│ │ (Filtering, Scoring,  │ │ (7-Hop CNI, NetPol,    │ │ (CSI Dynamic Provisioning,       │ │
│ │  Taints, Quotas)      │ │  CoreDNS Loop, Gateway)│ │  RBAC can-i, OPA, Kyverno)       │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │  ObservabilityEngine  │ │ Autoscaling&MeshEngine │ │       ValidationEngine           │ │
│ │ (PromQL Evaluator,    │ │ (HPA v2, VPA,          │ │ (18 Deterministic Evaluators,    │ │
│ │  LogQL, Jaeger, SLO)  │ │  Karpenter, Istio Mesh)│ │  Live DAG & Trace Checks)        │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │    IncidentEngine     │ │     ProjectEngine      │ │      ArchitectureEngine          │ │
│ │ (15 Real Outages,     │ │ (8 Multi-Milestone     │ │ (8 Reference Blueprints,         │ │
│ │  MTTR Stopwatch)      │ │  Enterprise Capstones) │ │  SPOF Detection, YAML/HCL)       │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │       AiMentor        │ │  CertificationEngine   │ │        SessionManager            │ │
│ │ (Socratic Hints, CIS  │ │ (Ed25519 Authority,    │ │ (Multi-Tenant LRU State Isolation│ │
│ │  Benchmark Grader)    │ │  Skill Radar 26-Domain)│ │  Per-Session Cluster & VFS)      │ │
│ └───────────────────────┘ └────────────────────────┘ └──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Engines Deep Dive (`src/core/`)

### 3.1. In-Memory POSIX Virtual File System (`virtualFileSystem.js`)
- Full in-memory POSIX tree pre-populated with `/etc/kubernetes/manifests`, `/var/log/pods`, `/var/lib/etcd`, and `/home/learner/.kube/config`.
- Standard POSIX operations: `mkdir`, `writeFile`, `readFile`, `stat`, `chmod`, `chown`, `symlink`, `readlink`, `cp`, `mv`, and `rm`.
- Stream redirection support (`>`, `>>`) and directory event watchers used by kubelet static pod reconcilers.

### 3.2. Microsecond Kubernetes Control Plane (`virtualCluster.js` & `controllerManager.js`)
- **etcd State & Raft Quorum**: Models healthy, degraded, and quorum-loss states. Restoring via `etcdctl snapshot restore` seamlessly revives cluster API responsiveness.
- **kube-apiserver Pipeline**: Implements authentication, authorization, mutating admission webhooks, validating admission webhooks, Common Expression Language (CEL) validation, and Pod Security Standards (Privileged, Baseline, Restricted).
- **Workload Controllers**:
  - `PodController`: Probe state machines (`startupProbe`, `livenessProbe`, `readinessProbe`), init containers gating, ephemeral debug containers, restart backoff algorithms.
  - `DeploymentController`: ReplicaSet creation, rolling updates with `maxSurge` / `maxUnavailable`, revision histories, and rollbacks.
  - `StatefulSetController`: Ordinal scaling (`0..N-1`), stable network identities (`<pod>.<svc>.<ns>.svc.cluster.local`), and dynamic `volumeClaimTemplates`.
  - `DaemonSetController`: Guarantees exactly 1 pod per matching schedulable node.
  - `Job` & `CronJob` Controllers: Parallelism, completions counting, `backoffLimit`, cron scheduling, and historical pod pruning.

### 3.3. Scheduler Engine (`schedulerEngine.js`)
- Full 3-phase scheduling cycle:
  1. **Filtering (Predicates)**: NodeSelectors, `nodeAffinity` (`requiredDuringSchedulingIgnoredDuringExecution`), taints and tolerations, pod anti-affinity conflicts, resource capacity checks.
  2. **Scoring (Priorities)**: Preferred affinities, image locality, balanced resource allocation.
  3. **Reservation & Preemption**: PriorityClass comparison and graceful eviction of lower-priority pods.
- Topology Spread Constraints (`maxSkew`, `topologyKey: topology.kubernetes.io/zone`).

### 3.4. Networking Engine & Packet Tracer (`networkingEngine.js` & `networkTracer.js`)
- **7-Hop Virtual CNI Datapath**: Models container veth pairs, bridge, host iptables/eBPF, VXLAN/Geneve overlay encapsulation, cross-node routing, and return paths.
- **NetworkPolicy Engine**: Evaluates `Ingress` and `Egress` rules with `podSelector`, `namespaceSelector`, and `ipBlock` CIDRs (including exceptions).
- **CoreDNS Resolver**: Realistically simulates Kubernetes DNS resolution, search paths (`ndots:5`), upstream forwarders, and detects forwarding loops.
- **Virtual Packet Tracer**: `tracePacket(srcPod, dstIP, port, proto)` delivers deterministic hop-by-hop packet evaluation verifying whether traffic is allowed or blocked by policy.

### 3.5. Storage CSI & Security Engine (`storageAndSecurityEngine.js`)
- StorageClasses with `WaitForFirstConsumer` delayed binding and `Immediate` binding.
- PV and PVC matching against access modes (`ReadWriteOnce`, `ReadWriteMany`, `ReadOnlyMany`) and storage size requests.
- VolumeSnapshot and VolumeSnapshotClass lifecycle.
- RBAC Evaluator: `auth can-i <verb> <resource> [--namespace] [--as]`.

### 3.6. Sandboxed Multi-CLI Terminal Engine (`terminalEngine.js` & `multiCliDispatcher.js`)
- Pure AST tokenizer and parser supporting pipelines (`|`), logical operators (`&&`, `||`, `;`), environment variables, and heredocs (`<<EOF`).
- Built-in multi-CLI dispatcher supporting 14 cloud-native tools:
  - `kubectl`: Full standard command set (get, describe, apply, create, delete, edit, patch, scale, autoscale, rollout, logs, exec, debug, top, cordon, uncordon, drain, taint, label, annotate, auth can-i, explain, diff, wait, config).
  - `helm`: install, upgrade, rollback, uninstall, list, repo, template.
  - `etcdctl`: endpoint health, snapshot save, snapshot restore, member list.
  - `kubeadm`: certs check-expiration, certs renew, token.
  - `istioctl`: analyze, proxy-status, authn tls-check.
  - `cilium`: status, connectivity test.
  - `argocd`: app list, app get, app sync, app create.
  - `flux`: check, get, reconcile.
  - `velero`: backup, restore.
  - `trivy`: image, k8s scan.
  - `tofu`: init, plan, apply, destroy.
  - `aws`: eks, iam, sts, ec2 subcommands.
  - Built-in POSIX utilities: `cat`, `ls`, `grep`, `awk`, `sed`, `jq`, `curl`, `dig`, `nslookup`, `wc`, `openssl`, `ps`, `top`.

### 3.7. Observability Engine (`observabilityEngine.js`)
- **PromQL Evaluator**: Instant vector and range vector evaluation, metric aggregations (`sum by`, `avg`, `rate`, `irate`), linear interpolation `histogram_quantile(0.95, ...)`.
- **Loki LogQL Streamer**: Regex and line filtering over structured pod logs.
- **Jaeger Distributed Traces**: Hierarchical span trees with root spans, child RPC spans, latencies, and OpenTelemetry collector topology validation.
- **SLO Error Budget Burn-Rate Calculator**: Multi-window multi-burn-rate alerting algorithms.

### 3.8. Autoscaling & Service Mesh Engine (`autoscalingAndMeshEngine.js`)
- **HPA v2**: Evaluates multiple metrics (CPU utilization percentage, custom memory bytes), computes scaling targets, respects min/max boundaries, and automatically updates Deployment replica counts.
- **VPA**: Analyzes historical pod resource consumption and emits realistic target recommendations for container requests and limits.
- **Karpenter**: Simulates NodePool and EC2NodeClass node provisioning, optimal bin-packing, consolidation, and spot interruption draining.
- **Service Mesh (Istio)**: VirtualService canary traffic weight routing, DestinationRule circuit breaking (`maxConnections`, `consecutive5xxErrors`), outlier detection ejection, and strict `PeerAuthentication` mTLS.

### 3.9. Deterministic Validation Engine (`validationEngine.js`)
Grading is executed exclusively against the live cluster object DAG, VFS state, metrics, and network packet traces using 18 assertion evaluators:
1. `packet_trace_allowed`: Traffic between endpoints successfully traverses policies.
2. `packet_trace_blocked`: Traffic is blocked by NetworkPolicy.
3. `promql_query_result`: Evaluates instant PromQL assertions.
4. `rbac_can_i`: Evaluates permissions for subjects.
5. `pod_security_standard`: Validates pod baseline/restricted standards.
6. `slo_burn_rate_within_budget`: Validates error budgets.
7. `resource_count`: Validates quantity of resources matching filters.
8. `resource_field_equals`: Validates JSONPath expressions.
9. `resource_exists`: Validates resource existence.
10. `service_endpoints_ready`: Validates that service endpoints are populated by ready pods.
11. `logql_filter_matches`: Asserts expected log entries.
12. `hpa_target_scale_achieved`: Validates autoscaler targets.
13. `vpa_recommendation_present`: Asserts recommendations exist.
14. `karpenter_node_consolidated`: Validates node consolidation.
15. `istio_route_matches`: Asserts canary traffic weighting.
16. `circuit_breaker_tripped`: Asserts circuit breaker trip behavior.
17. `vfs_file_contains`: Validates file content and regex in VFS.
18. `dns_resolution_succeeds`: Asserts CoreDNS lookups succeed.

### 3.10. Production Incident Engine (`incidentEngine.js`)
- 15 realistic production outage scenarios across 8 failure categories.
- Real root-cause fault injection (e.g. corrupting static pod manifests in `/etc/kubernetes/manifests`, breaking service selectors, filling PVCs, dropping etcd quorum).
- High-resolution MTTR stopwatch tracking diagnostic and remediation time.

### 3.11. Architecture Designer Engine (`architectureEngine.js`)
- 8 enterprise reference blueprints (`ref-arch-01` through `ref-arch-08`).
- Drag-and-drop node-graph studio with live pulse packet animation.
- Automated Well-Architected 4-pillar scoring (Reliability, Security, Cost Optimization, Operational Excellence).
- Single Point of Failure (SPOF) detection and vulnerability risk matrix.
- Bi-directional IaC compiler generating production-ready multi-document Kubernetes YAML and OpenTofu HCL v1.9+.

### 3.12. Socratic AI Mentor (`aiMentor.js`)
- Contextual, offline-ready coaching with 4 operational modes:
  - `hint`: Analyzes active lab rules and observed cluster state to guide the learner with probing questions.
  - `debug-error`: Performs root-cause diagnostic analysis on CrashLoopBackOff pods, pending PVCs, or missing endpoints.
  - `explain`: Concept explanation with production architectural context.
  - `security-audit`: Runs an automated 12-point CIS Kubernetes Benchmark audit on the active cluster.

### 3.13. Certification Engine (`certificationEngine.js`)
- 6 role-based career certification exams (75%+ passing threshold).
- Issues tamper-proof, digitally signed digital credentials:
  - Asymmetric Ed25519 digital signature (`128-hex chars`).
  - Symmetric HMAC-SHA256 signature fallback (`64-hex chars`).
- Computes real-time 26-domain skill mastery radar scores.

---

## 4. User Interface & Interactive Workbench (UI/UX v3)

### 4.1. Responsive 3-Column Split-Pane Layout
- **Left Column**: Production scenario context, step-by-step instructions with 1-click execution buttons, production architecture diagram trigger, and expandable Socratic hint accordions.
- **Center Column**: Full-height tabbed workspace:
  - *Tab 1: Terminal*: Cloud-native shell with zoom controls (`A+`/`A-`), clear button, quick-command bar, and mobile virtual quick-key bar.
  - *Tab 2: Declarative Manifest Editor*: Code editor with line-number gutter, format YAML button, apply manifest button, and live cluster diff viewer.
  - *Tab 3: Observability Query Console*: Interactive PromQL metrics explorer with real-time canvas chart, Loki log stream tailer, and Jaeger distributed trace waterfall.
- **Right Column**: Tabbed inspection panel:
  - *Tab 1: Topology*: Interactive SVG cluster topology graph with live pulse animations and filterable resource cards.
  - *Tab 2: Objectives & CIS*: Deterministic validation rules grader and CIS security checklist.
  - *Tab 3: AI Mentor*: Multi-mode Socratic coaching panel.

### 4.2. Ergonomic Splitters & ARIA Accessibility
- Two draggable resizer dividers (`#resizer-left`, `#resizer-right`) with `role="separator"`, `aria-orientation="vertical"`, and dynamic `aria-valuenow` updates.
- Keyboard accessible: focus resizer and use `ArrowLeft` / `ArrowRight` to adjust pane widths (persisted to `localStorage`).

### 4.3. Mobile-First Quick-Action Keybar (`quickKeyEngine.js`)
- Virtual touch toolbar providing one-tap keys: `kubectl`, `get`, `describe`, `apply -f`, `-n`, `pods`, `svc`, `deploy`, `|`, `grep`, `Tab`, `Ctrl+C`, `↑`, `↓`, `Clear`.
- Powered by `ContextAwareQuickKeyEngine`:
  - **Syntax Order**: Automatically prefixes `kubectl` before action verbs if typed on an empty line (prevents the "describe kubectl" mobile bug).
  - **Verb Replacement**: Tapping `describe` when the line contains `kubectl get pods` cleanly replaces `get` with `describe`.
  - **Resource Chaining**: Tapping `svc` after `pods` produces comma-separated `pods,svc`.
  - **Automatic Piping**: Tapping `grep` automatically inserts ` | grep `.

### 4.4. Offline PWA Service Worker (`public/sw.js`)
- Pre-caches entire application shell under cache `kubelabs-offline-v3`.
- Provides synthetic offline JSON fallbacks for `/api/health`, `/api/livez`, `/api/readyz`, and `/api/overview`.
- Enables complete, zero-network, local offline execution.

---

## 5. Master Curriculum, Incident & Capstone Catalog

### 5.1. All 26 Technology Domain Plugins & 52 Interactive Labs

| # | Domain Key | Domain Name | Core Focus & Tools | Labs Included |
|---|---|---|---|---|
| **01** | `01-linux-systems-internals` | Linux Systems & Cgroups | Kernel namespaces, cgroups v2, systemd, procfs | `lab-linux-01`, `lab-linux-02` |
| **02** | `02-containers-runtimes` | Container Runtimes & OCI | containerd, CRI, OCI specs, rootless containers | `lab-container-01`, `lab-container-02` |
| **03** | `03-networking-cni` | Container Networking & CNI | veth pairs, Calico, Flannel, IPAM, iptables | `lab-cni-01`, `lab-cni-02` |
| **04** | `04-kubernetes-core` | Kubernetes Core Workloads | Pods, Deployments, ReplicaSets, Services | `lab-k8s-01`, `lab-k8s-02` |
| **05** | `05-advanced-scheduling` | Advanced Scheduling & Affinity | NodeAffinity, Taints, Tolerations, PodTopologySpread | `lab-sched-01`, `lab-sched-02` |
| **06** | `06-storage-csi` | Persistent Storage & CSI | StorageClasses, PVCs, PVs, dynamic binding | `lab-csi-01`, `lab-csi-02` |
| **07** | `07-security-rbac-policy` | RBAC, Admission & Security | Roles, ClusterRoleBindings, Kyverno, Gatekeeper | `lab-sec-01`, `lab-sec-02` |
| **08** | `08-observability-telemetry` | Observability & OpenTelemetry | Prometheus PromQL, Grafana, OpenTelemetry | `lab-obs-01`, `lab-obs-02` |
| **09** | `09-service-mesh-istio` | Service Mesh & Traffic Mgmt | Istio VirtualServices, DestinationRules, mTLS | `lab-mesh-01`, `lab-mesh-02` |
| **10** | `10-gitops-argocd-flux` | GitOps & Continuous Delivery | Argo CD Applications, sync policies, drift | `lab-gitops-01`, `lab-gitops-02` |
| **11** | `11-sre-incident-chaos` | SRE Reliability & Chaos | Chaos engineering, SLO error budgets, MTTR | `lab-sre-01`, `lab-sre-02` |
| **12** | `12-platform-engineering` | Platform Engineering & Portals | Internal Developer Platforms, CRDs, Backstage | `lab-plat-01`, `lab-plat-02` |
| **13** | `13-opentofu-iac` | OpenTofu & Infrastructure as Code | OpenTofu HCL, state management, modules | `lab-tofu-01`, `lab-tofu-02` |
| **14** | `14-aws-eks-production` | AWS EKS Enterprise Production | EKS clusters, IRSA, Karpenter, VPC CNI | `lab-eks-01`, `lab-eks-02` |
| **15** | `15-azure-aks-gcp-gke` | Multi-Cloud AKS & GKE | Azure AKS, Workload Identity, GKE Autopilot | `lab-aks-01`, `lab-aks-02` |
| **16** | `16-aiops-cloud-native-ai` | Cloud-Native AI & GPU Workloads | NVIDIA GPU slicing, vLLM inference, Ray K8s | `lab-ai-01`, `lab-ai-02` |
| **17** | `17-wasm-ebpf-emerging` | Emerging Tech: Wasm & eBPF | WebAssembly runtimes, Cilium Tetragon, eBPF | `lab-ebpf-01`, `lab-ebpf-02` |
| **18** | `18-finops-green-cloud` | FinOps & Green Cloud Optimization| Carbon footprint reduction, Kubecost allocation | `lab-finops-01`, `lab-finops-02` |
| **19** | `19-api-gateway-ingress` | Modern API Gateway & Ingress | Gateway API, HTTPRoute, GRPCRoute, TLS | `lab-gw-01`, `lab-gw-02` |
| **20** | `20-multi-cluster-fleet` | Multi-Cluster Fleet Orchestration | Karmada, vcluster virtual clusters, failover | `lab-fleet-01`, `lab-fleet-02` |
| **21** | `21-supply-chain-security` | Supply-Chain & Image Security | Cosign signatures, SLSA provenance, Trivy scans | `lab-sc-01`, `lab-sc-02` |
| **22** | `22-database-operators` | Cloud-Native Database Operators | CloudNativePG, PostgreSQL HA, WAL archiving | `lab-db-01`, `lab-db-02` |
| **23** | `23-kafka-event-streaming` | Kafka & Event-Driven Streaming | Strimzi operator, Kafka topics, partitioning | `lab-event-01`, `lab-event-02` |
| **24** | `24-disaster-recovery` | Disaster Recovery & Backup | Velero cluster snapshots, etcd disaster restore | `lab-dr-01`, `lab-dr-02` |
| **25** | `25-ci-cd-pipelines` | Cloud-Native CI/CD Pipelines | Tekton pipelines, Kaniko container builds | `lab-cicd-01`, `lab-cicd-02` |
| **26** | `26-serverless-knative` | Serverless Cloud Computing | Knative Serving, scale-to-zero, event triggers | `lab-srv-01`, `lab-srv-02` |

---

### 5.2. All 15 Production Outage Scenarios

| Incident ID | Severity | Outage Category | Scenario Title & Symptoms | Root-Cause Injected & Remediation |
|---|---|---|---|---|
| `inc-01-web-503` | **SEV-1** | `Website Down` | Frontend 503 Bad Gateway Outage | Label selector mismatch on Service (`app=front-end` vs `app=frontend`). Fixed by updating service selector. |
| `inc-02-pod-oom` | **SEV-1** | `Pod Restarting` | Payments Worker OOMKilled Loop | Memory limit capped at 32Mi while JVM worker demands 128Mi. Remediated by patching container resource limits. |
| `inc-03-slow-app` | **SEV-2** | `Slow App` | Checkout Service Severe CPU Throttling | Aggressive CFS quota `10m` causing request latency spikes. Remediated by increasing CPU limits to `500m`. |
| `inc-04-dns-loop` | **SEV-1** | `DNS Outage` | CoreDNS Upstream Forwarding Loop | Upstream nameserver forwarded back to 10.96.0.10. Remediated by patching upstream to `1.1.1.1`. |
| `inc-05-iam-irsa` | **SEV-1** | `IAM Outage` | S3 File Upload AccessDenied (IRSA) | Missing IAM role annotation on ServiceAccount. Remediated by adding `eks.amazonaws.com/role-arn`. |
| `inc-06-pvc-pending` | **SEV-2** | `Storage Outage` | Database StatefulSet Volume Pending | Invalid StorageClassName `fast-ebs-storage`. Remediated by patching StorageClassName to `gp3-sc`. |
| `inc-07-netpol-drop` | **SEV-1** | `Networking Outage` | Zero-Trust NetworkPolicy Isolation | Missing ingress selector on backend DB. Remediated by allowing traffic from `payments-api` on port `5432`. |
| `inc-08-node-drain` | **SEV-1** | `Node NotReady` | Worker Node NotReady DiskPressure | Kubelet node condition DiskPressure set. Remediated by uncordoning node and clearing disk pressure. |
| `inc-09-etcd-quorum` | **SEV-1** | `etcd Outage` | etcd Cluster Quorum Loss | Corrupted static pod `/etc/kubernetes/manifests/etcd.yaml`. Remediated by executing `etcdctl snapshot restore`. |
| `inc-10-cert-expired` | **SEV-1** | `Control Plane Outage` | Control-Plane TLS Certificates Expired | Kube-apiserver certificates expired. Remediated by running `kubeadm certs renew all`. |
| `inc-11-ingress-504` | **SEV-1** | `Website Down` | Gateway Ingress Gateway Timeout | Ingress routing to non-existent backend port 8080 instead of 80. Remediated by patching backend target port. |
| `inc-12-admission-block` | **SEV-1** | `Control Plane Outage` | Admission Webhook Endpoint Unreachable | Validating webhook targeting failed endpoint with `failurePolicy: Fail`. Remediated by updating to `failurePolicy: Ignore`. |
| `inc-13-hpa-flapping` | **SEV-2** | `Slow App` | HPA Metric Target Oscillation | Flapping target CPU 10% causing constant scale up/down. Remediated by stabilizing target threshold to 70%. |
| `inc-14-image-pull` | **SEV-1** | `Pod Restarting` | Critical Microservice ImagePullBackOff | Typo in image repository tag (`v3.99-nonexistent`). Remediated by updating deployment to verified tag. |
| `inc-15-ro-fs-lock` | **SEV-1** | `Storage Outage` | ReadOnlyRootFilesystem CrashLoop | Container writing logs directly to `/var/log` with read-only root. Remediated by mounting `emptyDir` to `/var/log`. |

---

### 5.3. All 8 Multi-Milestone Enterprise Capstones

| Capstone ID | Guided Career Track | Capstone Title | Milestones Validated |
|---|---|---|---|
| `proj-01-resilient-microservices` | **Cloud-Native Architect** | High-Availability Resilient Microservices | 1. Namespace & RBAC<br>2. HA Deployments & PDB<br>3. Zero-Trust NetworkPolicies<br>4. Canary Ingress & Gateway |
| `proj-02-gitops-ha-commerce` | **DevOps & GitOps Specialist** | Enterprise GitOps E-Commerce Platform | 1. Argo CD App Declarations<br>2. Automated Sync & Self-Heal<br>3. SealedSecrets & Vault KMS<br>4. Rollback & Drift Verification |
| `proj-03-zero-trust-fintech` | **DevSecOps Engineer** | Zero-Trust Financial Ledger Security | 1. Restricted Pod Security Profiles<br>2. Kyverno ClusterPolicies<br>3. Mutual TLS PeerAuthentication<br>4. Trivy Supply-Chain Validation |
| `proj-04-observability-mesh-sre` | **SRE & Chaos Engineer** | Distributed Observability & Service Mesh | 1. OpenTelemetry Collector Pipeline<br>2. Prometheus Multi-Window Burn Rates<br>3. Loki Structured Log Streams<br>4. Istio Circuit Breaking Verification |
| `proj-05-idp-developer-portal` | **Platform Engineer** | Self-Service Internal Developer Portal | 1. Custom Resource Definitions (CRDs)<br>2. Tenant Namespace VFS Isolation<br>3. Automated ResourceQuota/Limits<br>4. Crossplane Cloud Abstraction |
| `proj-06-ai-inference-platform` | **AI-Ops Specialist** | High-Throughput GPU AI Inference Engine | 1. NVIDIA GPU Time-Slicing Pool<br>2. vLLM Distributed Serving<br>3. Ray Cluster Queue Autoscaling<br>4. Latency SLA Validation Under Load |
| `proj-07-hybrid-cloud-disaster-recovery` | **Cloud-Native Architect** | Multi-Region Active-Active DR Platform | 1. Karmada Multi-Cluster Topology<br>2. Velero Scheduled Backups<br>3. Cross-Region Headless DNS<br>4. RTO < 60s Simulated Outage |
| `proj-08-finops-carbon-optimizer` | **Platform Engineer** | Autonomous Cloud FinOps & Carbon Engine | 1. Karpenter Dynamic Consolidation<br>2. Spot Interruption Draining<br>3. Kubecost Allocation Rules<br>4. Carbon Intensity Workload Shifting |

---

### 5.4. All 6 Role-Based Career Certification Tracks

1. **Certified Cloud-Native Foundations Specialist (CCNFS)**: Linux internals, container runtimes, networking fundamentals, Kubernetes core.
2. **Certified Kubernetes Administrator & Operator (CKAO)**: Advanced scheduling, CSI storage, control-plane troubleshooting, static pods, etcd recovery.
3. **Certified DevSecOps & Security Specialist (CDSS)**: Zero-trust policies, RBAC, admission webhooks, supply chain security, Kyverno.
4. **Certified GitOps & Cloud Automation Engineer (CGAE)**: Argo CD, Flux, OpenTofu, multi-cloud EKS/AKS automation.
5. **Certified SRE & Service Mesh Reliability Engineer (CSRE)**: PromQL, LogQL, Jaeger tracing, SLO error budgets, Istio mesh traffic steering.
6. **Certified Enterprise Platform & AI-Ops Architect (CEPA)**: Internal developer platforms, GPU slicing, vLLM inference orchestration, multi-cluster federation.

---

## 6. Practical Hands-On Walkthroughs

### Walkthrough 1: Launching & Exploring the Workbench
1. Open **`http://localhost:4100`** in Chrome or Edge.
2. Click **View 1: Learning Paths & Catalog**.
3. Select any track (e.g. *Kubernetes Core Workloads*) and click **Launch Lab**.
4. The application seamlessly transitions into the 3-column resizable IDE.

### Walkthrough 2: Solving an Interactive Lab with Socratic AI Mentor
1. Inside the workbench, observe the scenario objectives in the left pane.
2. If uncertain about syntax, click **🤖 AI Mentor** in the right column and select **Socratic Hint**.
   - The mentor inspects your live cluster state, detects unmet rules, and poses a guiding discovery question without spoiling the challenge.
3. In the Center Tab, use the terminal to run:
   ```bash
   kubectl scale deployment payments-api --replicas=3 -n production
   ```
4. Switch to the **YAML / HCL Editor** tab, edit the manifest, and click **Diff with Live Cluster** to see exact property differences before applying.
5. Click **Validate Objectives** in the header. The deterministic engine evaluates all assertion rules and awards telemetry XP upon completion.

### Walkthrough 3: Responding to a SEV-1 Outage in the War Room
1. Click **View 3: Incident Response War Room**.
2. Select **`inc-01-web-503` (Frontend 503 Bad Gateway)** and click **Inject Outage**.
3. The MTTR stopwatch starts ticking.
4. Switch to the workbench terminal to diagnose:
   ```bash
   kubectl get pods -n production
   kubectl get svc frontend-svc -n production -o wide
   kubectl describe svc frontend-svc -n production
   ```
5. You observe `Endpoints: <none>` because the service selector specifies `app=front-end` while pods carry `app=frontend`.
6. Apply the remediation:
   ```bash
   kubectl set selector svc frontend-svc -n production app=frontend
   ```
7. Click **Verify Incident Recovery**. The incident engine confirms endpoints are bound and stops the MTTR stopwatch.

### Walkthrough 4: Designing & Deploying Reference Architectures
1. Click **View 4: Interactive Architecture Studio**.
2. In the top bar, select a reference blueprint (e.g. `Enterprise Microservices with Service Mesh & CloudNativePG`).
3. Examine the interactive canvas with animated packet pulses between WAF, Ingress, Services, and DB.
4. Drag components or click **⚡ Fault Injection** to simulate a database node failure.
5. Review the automated 4-Pillar Well-Architected scorecard and SPOF risk matrix.
6. Click **📄 Kubernetes YAML** to view the live compiled multi-document manifest, and click **▶ Apply to Cluster** to deploy it directly into your virtual cluster session.

### Walkthrough 5: Earning an Ed25519 Signed Digital Certification
1. Click **View 5: Certifications & Skill Profile**.
2. Select the **Certified Cloud-Native Foundations Specialist (CCNFS)** exam.
3. Answer the randomized questions covering Linux cgroups, CNI routing, and pod scheduling.
4. Upon scoring >= 75%, click **Submit Exam**.
5. The `CertificationEngine` records the score, awards +500 XP to your profile, updates your 26-domain skill radar, and generates an Ed25519 cryptographically signed certificate credential (`certId: CERT-track-foundations-...`).
6. The credential signature can be verified server-side via `/api/certifications/verify`.

---

## 7. Local Usage, Deployment & Packaging Guide

### 7.1. 1-Click Launchers
- **Windows**: Double-click `kubelabs.cmd` in the project root. It starts the server and opens your default browser to `http://localhost:4100`.
- **macOS / Linux**: Run `./kubelabs.sh` (or `bash kubelabs.sh`).

### 7.2. Node.js Local Execution
```bash
# Start server in background or foreground
npm start

# Automatically launch browser to active server
npm run app

# Run full master test suite
npm test

# Generate universal distribution archive
npm run package
```

### 7.3. Browser PWA Installation
1. Navigate to `http://localhost:4100` in Google Chrome or Microsoft Edge.
2. Click the **Install KubeLabs** icon in the URL address bar.
3. KubeLabs launches in a standalone native desktop window and works 100% offline.

### 7.4. Rootless Docker & Docker Compose
```bash
# Build and run hardened rootless container (UID 10001, read-only root)
docker compose up -d

# Verify logs and health
docker compose logs -f
curl http://127.0.0.1:4100/api/health
```

### 7.5. Production Kubernetes Self-Hosting
```bash
# Apply production StatefulSet, Service, Ingress, and Zero-Trust NetworkPolicy
kubectl apply -f deploy/kubernetes/kubelabs-k8s.yaml

# Verify pods in restricted namespace
kubectl get pods -n kubelabs-system
```

### 7.6. Downloading GitHub Actions Release Artifacts
Every push to the `main` branch automatically triggers the release packaging pipeline:
1. Navigate to the GitHub repository.
2. Click the **Actions** tab.
3. Select the latest workflow run (**KubeLabs Enterprise CI & Cross-Platform Release Pipeline**).
4. Under the **Artifacts** section at the bottom, click **`kubelabs-universal-release`** to download `kubelabs-v3.0.0-universal.tar.gz` and `SHA256SUMS.txt`.

---

## 8. Governance, 11-Agent Quality Gate & Verification Ledger

The project is governed by an **11-Agent Autonomous PRR Framework** (`scripts/self-audit.js`):

```
================================================================================
 KUBELABS 11-AGENT SELF-AUDIT & PRODUCTION READINESS GATE
================================================================================

[PASS] Product Engineering Agent (agent-product)
  ✔ Complete PRD exists and defines personas & requirements
  ✔ All 6 Guided Role Learning Tracks are registered
  ✔ All 26 Cloud-Native, Multi-Cloud & Emerging Tech Domains are active

[PASS] Principal Architect Agent (agent-architect)
  ✔ System, Security, Data & Lab Architecture doc published
  ✔ 10 Architecture Decision Records (ADRs) documented
  ✔ Plugin JSON Schema exists and validates all plugins
  ✔ 8 Enterprise Reference Architectures available in Designer Engine

[PASS] Backend & Persistence Agent (agent-backend)
  ✔ All backend & isomorphic core modules implemented
  ✔ Database migration and SQLite WAL mode active

[PASS] Cross-Platform Frontend & PWA Agent (agent-frontend)
  ✔ All responsive UI assets (HTML5, CSS Grid, PWA Service Worker) present

[PASS] Kubernetes & Cloud Control Plane Agent (agent-kubernetes)
  ✔ VirtualCluster reconciles Deployment -> Pods with Running status
  ✔ Service controller binds active Pod IPs into Endpoints

[PASS] Curriculum & Assessment Designer Agent (agent-curriculum)
  ✔ Zero plugin schema validation errors
  ✔ At least 52 hands-on interactive labs across 26 domains
  ✔ Every domain includes modules, labs, and assessment questions

[PASS] DevOps & Release Engineering Agent (agent-devops)
  ✔ Multi-OS CI/CD, release packaging & security scan workflows configured

[PASS] DevSecOps & Security Reviewer Agent (agent-security)
  ✔ Zero third-party npm runtime dependencies (Supply Chain Zero-CVE)
  ✔ Terminal Engine is 100% sandboxed (no child_process host shell execution)
  ✔ SQLite Database uses parameterized prepared statements

[PASS] QA Lead & Deterministic Solver Agent (agent-qa)
  ✔ All 52 interactive labs deterministically fail before solution & pass 100% after solution
  ✔ All 15 production incident simulations deterministically resolve via canonical solution

[PASS] Documentation & Knowledge Agent (agent-documentation)
  ✔ All 14 technical specification and runbook artifacts complete

[PASS] Platform Engineering & PRR Agent (agent-platform)
  ✔ Low-resource memory budget respected (RSS ~51MB idle / ~90MB solver < 150MB limit)
  ✔ Zero placeholders, TODOs, or unimplemented stubs across engine codebase

--------------------------------------------------------------------------------
Summary     : 53/53 quality checks passed across 11 specialized engineering agents
Memory RSS  : ~90.5 MB (Budget: < 150 MB)
Overall Gate: GREEN (PRODUCTION READY)
================================================================================
```

---

## 9. Complete Repository Structure & File Index

```
h:/kubelabs/
├── .github/
│   ├── CODEOWNERS                              # Branch ownership rules
│   ├── PULL_REQUEST_TEMPLATE.md                # Standard PR review template
│   └── workflows/
│       ├── ci.yml                              # Multi-OS CI & artifact upload
│       ├── ci-release.yml                      # Full release pipeline & verification
│       ├── release.yml                         # Tagged release distribution
│       └── security-scan.yml                   # Security scanning workflow
├── agents/
│   └── AGENT-FRAMEWORK.md                      # 11-agent governance architecture
├── deploy/
│   ├── desktop/
│   │   ├── Cargo.toml                          # Tauri v2 desktop host package
│   │   ├── electron-main.js                    # Electron desktop entrypoint
│   │   ├── tauri.conf.json                     # Tauri v2 desktop configuration
│   │   └── src/
│   │       └── main.rs                         # Rust host entrypoint
│   ├── helm/                                   # KubeLabs Helm chart templates
│   ├── kubernetes/
│   │   └── kubelabs-k8s.yaml                   # Self-hosting StatefulSet & NetPol
│   └── mobile/
│       └── capacitor.config.json               # Capacitor Android/iOS config
├── docs/
│   ├── 01-GLOBAL-ENGINEERING-CONTRACT.md       # Quality gates & invariants
│   ├── 02-PRD.md                               # Product Requirements Document
│   ├── 03-ARCHITECTURE.md                      # Target-state architecture
│   ├── 04-ADRS.md                              # 10 Architecture Decision Records
│   ├── 05-GITHUB-AND-CICD.md                   # CI/CD and release runbooks
│   ├── 06-IMPLEMENTATION-PLAN.md               # Implementation roadmap
│   ├── 07-CURRICULUM-CATALOG.md                # 26-domain curriculum catalog
│   ├── 08-OPERATIONS-AND-RUNBOOKS.md           # Production runbooks RB-01 to RB-08
│   ├── 09-SECURITY-AND-THREAT-MODEL.md         # STRIDE threat model v3.0.0
│   ├── 10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md # Empirical latency & RAM metrics
│   ├── 13-V3-STAGE-EXECUTION-BLUEPRINT.md      # Staged execution blueprint
│   └── 14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md # This document
├── plugins/                                    # 26 technology domain JSON plugins
├── public/
│   ├── index.html                              # Responsive 3-column workbench UI
│   ├── manifest.json                           # PWA standalone manifest
│   ├── sw.js                                   # Offline caching Service Worker
│   ├── css/
│   │   └── styles.css                          # Modern dark-theme stylesheet
│   └── js/
│       ├── app.js                              # Client-side workbench controller
│       ├── offlineEngine.js                    # Compiled isomorphic core bundle (44KB)
│       ├── quickKeyEngine.js                   # Grammar-aware mobile quick-key engine
│       └── terminalView.js                     # Terminal emulator view component
├── schemas/
│   └── plugin.schema.json                      # Strict JSON schema for domain plugins
├── scripts/
│   ├── bundle-isomorphic.js                    # Isomorphic UMD bundler
│   ├── open-browser.js                         # Cross-platform browser launcher
│   ├── package-release.js                      # Universal distribution packager
│   ├── self-audit.js                           # 11-agent self-audit runner
│   └── verify-subphases.js                     # 40-subphase verification ledger
├── src/
│   ├── server.js                               # HTTP server & graceful drain handler
│   ├── agents/
│   │   └── orchestrator.js                     # 11-agent governance engine
│   ├── api/
│   │   └── router.js                           # REST API & probe router
│   ├── core/                                   # 26 unified isomorphic engines
│   ├── db/
│   │   ├── database.js                         # Native SQLite WAL persistence
│   │   └── storageAdapter.js                   # CRDT VectorClock & HLC engine
│   └── plugins/
│       └── pluginManager.js                    # Plugin catalog & schema validator
├── tests/                                      # Master & stage test suites (206+ tests)
├── capacitor.config.json                       # Root Capacitor config
├── docker-compose.yml                          # Rootless Docker Compose setup
├── Dockerfile                                  # Hardened multi-stage Dockerfile
├── kubelabs.cmd                                # Windows 1-click desktop launcher
├── kubelabs.sh                                 # Linux/macOS 1-click launcher
├── package.json                                # Zero-dependency configuration
└── README.md                                   # Project introduction & quickstart
```
