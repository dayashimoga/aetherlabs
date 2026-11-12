# KubeLabs: Comprehensive Project Walkthrough & System Guide

```
  ██╗  ██╗██╗   ██╗██████╗ ███████╗██╗      █████╗ ██████╗ ███████╗
  ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██║     ██╔══██╗██╔══██╗██╔════╝
  █████╔╝ ██║   ██║██████╔╝█████╗  ██║     ███████║██████╔╝███████╗
  ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══██╗╚════██║
  ██║  ██╗╚██████╔╝██████╔╝███████╗███████╗██║  ██║██████╔╝███████║
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```

> **Standalone, Low-Resource, Cross-Platform (Web, Desktop, Mobile), Learn-by-Doing Kubernetes & Cloud-Native Lab Platform**
> 
> *Zero External Dependencies (`"dependencies": {}`) • Native Node.js 22+ & SQLite • 100% Offline-Capable PWA & Isomorphic Engine • Deterministic Verification • 26 Domains • 52 Labs • 15 Production Incidents • 8 Capstones • 6 Certifications (Ed25519 Signed) • 40 Verified Subphases*

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Target-State Architecture & Invariants](#2-target-state-architecture--invariants)
3. [Deep-Dive: Engine Subsystems](#3-deep-dive-engine-subsystems)
   - [3.1 Multi-Tenant Session Manager (`sessionManager.js`)](#31-multi-tenant-session-manager-sessionmanagerjs)
   - [3.2 In-Memory POSIX Virtual File System (`virtualFileSystem.js`)](#32-in-memory-posix-virtual-file-system-virtualfilesystemjs)
   - [3.3 Virtual Control Plane & Cluster Controller (`virtualCluster.js`)](#33-virtual-control-plane--cluster-controller-virtualclusterjs)
   - [3.4 Multi-CLI Sandboxed Terminal Engine (`terminalEngine.js`)](#34-multi-cli-sandboxed-terminal-engine-terminalenginejs)
   - [3.5 Multi-Assertion Validation Engine (`validationEngine.js`)](#35-multi-assertion-validation-engine-validationenginejs)
   - [3.6 Production Incident Simulator (`incidentEngine.js`)](#36-production-incident-simulator-incidentenginejs)
   - [3.7 Visual Architecture Designer & IaC Compiler (`architectureEngine.js`)](#37-visual-architecture-designer--iac-compiler-architectureenginejs)
   - [3.8 Contextual Socratic AI Mentor & CIS Auditor (`aiMentor.js`)](#38-contextual-socratic-ai-mentor--cis-auditor-aimentorjs)
   - [3.9 Asymmetric Ed25519 Certification Engine (`certificationEngine.js`)](#39-asymmetric-ed25519-certification-engine-certificationenginejs)
   - [3.10 Enterprise Multi-Milestone Capstone Engine (`projectEngine.js`)](#310-enterprise-multi-milestone-capstone-engine-projectenginejs)
   - [3.11 SQLite WAL Persistence Tier (`database.js`)](#311-sqlite-wal-persistence-tier-databasejs)
   - [3.12 HTTP/REST Gateway, Rate Limiter & Prometheus Metrics (`router.js`, `server.js`)](#312-httprest-gateway-rate-limiter--prometheus-metrics-routerjs-serverjs)
   - [3.13 Browser-Native Isomorphic Offline Engine (`offlineEngine.js`, `sw.js`)](#313-browser-native-isomorphic-offline-engine-offlineenginejs-swjs)
4. [Master Curriculum Catalog (26 Domains & 6 Guided Tracks)](#4-master-curriculum-catalog-26-domains--6-guided-tracks)
5. [User Interface & Interactive Workbench (UI/UX v2)](#5-user-interface--interactive-workbench-uiux-v2)
6. [Step-by-Step Hands-On Walkthroughs](#6-step-by-step-hands-on-walkthroughs)
   - [6.1 Walkthrough 1: Hands-On Lab Completion (Dynamic PVC & StorageClass)](#61-walkthrough-1-hands-on-lab-completion-dynamic-pvc--storageclass)
   - [6.2 Walkthrough 2: Resolving a SEV-1 Production Incident (etcd Quorum Loss)](#62-walkthrough-2-resolving-a-sev-1-production-incident-etcd-quorum-loss)
   - [6.3 Walkthrough 3: Multi-Milestone Capstone (Multi-Tenant vCluster Platform)](#63-walkthrough-3-multi-milestone-capstone-multi-tenant-vcluster-platform)
   - [6.4 Walkthrough 4: Visual Architecture Design to Multi-Cloud IaC Export](#64-walkthrough-4-visual-architecture-design-to-multi-cloud-iac-export)
   - [6.5 Walkthrough 5: Earning an Ed25519 Asymmetric Verified Certification](#65-walkthrough-5-earning-an-ed25519-asymmetric-verified-certification)
7. [The 11-Agent Autonomous Governance Framework](#7-the-11-agent-autonomous-governance-framework)
8. [Automated Verification Ledger & Quality Gates](#8-automated-verification-ledger--quality-gates)
9. [Cross-Platform Deployment & Packaging Matrix](#9-cross-platform-deployment--packaging-matrix)
10. [Repository Structure & File Index](#10-repository-structure--file-index)

---

## 1. Executive Summary & Core Philosophy

**KubeLabs** is a standalone, ultra-low-resource, cross-platform learning laboratory and simulation platform for Kubernetes, the Cloud Native Computing Foundation (CNCF) ecosystem, GitOps, DevSecOps, SRE, Platform Engineering, Service Mesh, and advanced cloud technologies (Wasm, eBPF, FinOps, and Cloud-Native AI/ML).

### The Inherent Flaws of Traditional Learning Platforms
1. **Massive Compute Overhead**: Traditional tools (Minikube, Kind, k3s-in-Docker) demand 8 GB to 16 GB of RAM, virtualization extensions (VT-x/AMD-V), gigabytes of container image pulls, and several minutes of startup time. They cannot run on budget laptops, mobile browsers, or restricted corporate machines.
2. **Brittle Cloud VM Sandboxes**: Platforms like Katacoda and Killercoda rely on remote ephemeral VMs that suffer from queue delays, network dropouts, 30-minute timeouts, and astronomical cloud infrastructure costs.
3. **Flawed Evaluation Antipatterns**: Most online courses validate student work using fragile shell history regex patterns (e.g., checking if the learner typed `kubectl create deployment ...`). If a student uses declarative multi-document YAML manifests or aliases, the platform marks it incorrect.
4. **Severe Remote Code Execution (RCE) Hazards**: Handing raw terminal input to host shell processes (`child_process.exec`) opens massive security holes, container escapes, and host system compromise.

### The KubeLabs Breakthrough
KubeLabs solves these problems through an uncompromising architectural standard:
- **Zero External Dependencies (`"dependencies": {}`)**: Everything runs on native Node.js standard libraries (`node:http`, `node:sqlite`, `node:crypto`, `node:test`, `node:fs`, `node:path`). There is zero npm supply-chain risk, zero vulnerability maintenance, and instant startup.
- **Microsecond Declarative Virtual Control Plane**: Rather than spinning up Linux kernels, KubeLabs executes a lightweight, in-process Kubernetes API and controller loop simulation that handles Deployments, StatefulSets, DaemonSets, Services, Endpoints, NetworkPolicies, RBAC, PVC dynamic binding, CoreDNS, and taints/tolerations in **under 48 MB RSS RAM**.
- **Deterministic State-Graph Validation**: Labs are graded against the actual reconciled cluster object graph, not shell history. Whether configured through imperative CLI commands or declarative YAML files, only true cluster state determines success.
- **100% Offline-Capable Isomorphic Engine**: In addition to the backend server, the entire engine runs natively inside modern web browsers via Service Workers and client-side JavaScript (`offlineEngine.js`). Learners can solve complex labs and take certification exams completely disconnected from the internet.

---

## 2. Target-State Architecture & Invariants

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION LAYER                                      │
│  Responsive Workbench (Web, Electron/Tauri Desktop, Capacitor Mobile 360px Viewports)  │
│  [Labs] [Terminal] [Manifests] [Topology SVG] [Incidents] [Canvas] [Certs] [AI Mentor] │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ HTTP / REST & OpenMetrics (Port 3000)
┌────────────────────────────────────────────▼────────────────────────────────────────────┐
│                             API GATEWAY & SECURITY PERIMETER                            │
│  Rate Limiter (180 req/min/IP) • CSP Headers • 1MB Body Limit • /metrics • /livez/readyz│
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
┌────────────────────────────────────────────▼────────────────────────────────────────────┐
│                        MULTI-TENANT SESSION & STORAGE LAYER                             │
│  SessionManager (Isolated Cluster & VFS per Session) • SQLite (WAL Mode, Parameterized) │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
┌────────────────────────────────────────────▼────────────────────────────────────────────┐
│                                CORE ENGINE SUBSYSTEMS                                   │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────────────┐  │
│  │   VirtualFileSystem   │ │     VirtualCluster    │ │       TerminalEngine          │  │
│  │ (POSIX In-Memory,     │ │ (Reconcilers, RBAC,   │ │ (kubectl, helm, etcdctl,      │  │
│  │  Piping, Redirection) │ │  CSI, Taints, Webhook)│ │  kubeadm, vcluster, etc.)     │  │
│  └───────────┬───────────┘ └───────────┬───────────┘ └───────────────┬───────────────┘  │
│              │                         │                             │                  │
│  ┌───────────▼───────────┐ ┌───────────▼───────────┐ ┌───────────────▼───────────────┐  │
│  │    ValidationEngine   │ │     IncidentEngine    │ │     CertificationEngine       │  │
│  │ (10 Assertion Types,  │ │ (15 SEV-1/2 Outages,  │ │ (Ed25519 Digital Signatures,  │  │
│  │  Deterministic E2E)   │ │  MTTR Stopwatch)      │ │  Offline Verification)        │  │
│  └───────────┬───────────┘ └───────────┬───────────┘ └───────────────┬───────────────┘  │
│              │                         │                             │                  │
│  ┌───────────▼───────────┐ ┌───────────▼───────────┐ ┌───────────────▼───────────────┐  │
│  │   ArchitectureEngine  │ │       AIMentor        │ │        ProjectEngine          │  │
│  │ (4 Pillars, 8 Blue-   │ │ (Socratic Guidance,   │ │ (8 Multi-Milestone Capstones, │  │
│  │  prints, YAML/HCL)    │ │  CIS Benchmark Audit) │ │  Step-by-Step Validation)     │  │
│  └───────────────────────┘ └───────────────────────┘ └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Invariants:
1. **Zero External Runtime Dependencies**: `package.json` contains `"dependencies": {}`.
2. **Strict Resource Budgets**: Startup `< 250ms`, Idle RSS Memory `< 65MB`, Peak Engine Load `< 150MB`.
3. **Deterministic Solvability**: 100% of labs, incidents, and capstones fail before solution and pass 100% after canonical commands are executed.
4. **Zero Host Execution**: Terminal commands are parsed and interpreted entirely in an in-memory state machine. No `child_process.exec` or host shell access is ever invoked.

---

## 3. Deep-Dive: Engine Subsystems

### 3.1 Multi-Tenant Session Manager (`sessionManager.js`)
Located at [`src/engine/sessionManager.js`](file:///h:/kubelabs/src/engine/sessionManager.js), this subsystem provides isolated execution sandboxes for concurrent browser tabs, users, or API clients:
- **State Isolation**: Every session maintains its own private `VirtualCluster`, in-memory `VirtualFileSystem`, and terminal history. Actions in one tab cannot mutate or leak into another.
- **LRU Eviction & Idle Cleanup**: Automatically evicts stale sessions older than 2 hours or when active sessions exceed 500, preserving memory budgets.
- **SQLite Snapshot Synchronization**: Sessions can export and import their cluster and filesystem state to SQLite for seamless resume across restarts.

### 3.2 In-Memory POSIX Virtual File System (`virtualFileSystem.js`)
Located at [`src/engine/virtualFileSystem.js`](file:///h:/kubelabs/src/engine/virtualFileSystem.js), this module provides a complete in-memory UNIX filesystem:
- **POSIX Operations**: `mkdir`, `cd`, `pwd`, `ls`, `cat`, `touch`, `rm`, `writeFile`, and `readFile`.
- **Stream Redirection & Appending**: Supports shell redirection (`echo '...' > manifest.yaml`, `cat file >> output.txt`).
- **Path Resolution**: Handles relative and absolute paths (`.`, `..`, `/root`, `/tmp/manifests`).
- **Cluster Integration**: `kubectl apply -f /path/to/manifest.yaml` reads manifests directly from the session's VFS.

### 3.3 Virtual Control Plane & Cluster Controller (`virtualCluster.js`)
Located at [`src/engine/virtualCluster.js`](file:///h:/kubelabs/src/engine/virtualCluster.js), this is the platform's core Kubernetes reconciliation brain:
- **Quote-Safe YAML Parser**: Parses complex multi-document YAML with comments, inline arrays, block scalars (`|`, `|-`, `>`, `>-`), and nested configurations.
- **Controller Reconcilers**:
  - `DeploymentController`: Scales ReplicaSets and schedules Pods with IP allocation.
  - `ServiceController`: Discovers matching Pods via label selectors and binds dynamic Endpoints.
  - `DaemonSetController`: Automatically schedules pod instances across all schedulable nodes.
  - `PVCDynamicBinder`: Validates `StorageClass`, checks access modes, and provisions `PersistentVolume` bindings.
- **Advanced Kubernetes Primitives**:
  - `RBAC Engine`: Evaluates `Role`, `ClusterRole`, `RoleBinding`, and `ClusterRoleBinding` for `kubectl auth can-i`.
  - `Node Lifecycle`: Supports `cordon`, `uncordon`, `drain --ignore-daemonsets`, and taint/toleration evaluation.
  - `CoreDNS Loop Detector`: Detects upstream forwarding loops in CoreDNS ConfigMaps.
  - `etcd Member Health`: Tracks Raft quorum status and member endpoints.

### 3.4 Multi-CLI Sandboxed Terminal Engine (`terminalEngine.js`)
Located at [`src/engine/terminalEngine.js`](file:///h:/kubelabs/src/engine/terminalEngine.js), this engine parses and executes commands across multiple cloud-native CLIs:
- **Supported CLIs**:
  - `kubectl`: Core operations (`get`, `describe`, `apply`, `delete`, `set env`, `autoscale`, `cordon`, `drain`, `taint`, `auth can-i`, `patch`, `create quota/service/networkpolicy`).
  - `etcdctl`: `snapshot save`, `snapshot restore`, `endpoint health`, `member list`.
  - `kubeadm`: `upgrade plan`, `upgrade apply`, `certs check-expiration`.
  - `helm`: `install`, `upgrade`, `rollback`, `list`, `uninstall`.
  - `velero`: `backup create`, `restore create`, `schedule create`.
  - `kyverno`: `apply`, `test`.
  - `vcluster`: `create`, `list`, `connect`.
  - `crossplane`: `install`, `status`.
  - Cloud & Tooling CLIs: `aws`, `az`, `gcloud`, `docker`, `argocd`, `istioctl`, `tofu`, `trivy`, `aiops`.
- **Command Chaining & Pipes**: Supports `&&`, `;`, `| grep`, `| head`, `| tail`, and output redirection (`>`, `>>`).

### 3.5 Multi-Assertion Validation Engine (`validationEngine.js`)
Located at [`src/engine/validationEngine.js`](file:///h:/kubelabs/src/engine/validationEngine.js), this module evaluates lab completion using 10 declarative rule types:
1. `resource_exists`: Verifies resource existence by Kind, Namespace, and Name.
2. `pod_status_running`: Checks that all pods for a workload are in `Running` state.
3. `service_has_endpoints`: Asserts that a Service has active endpoint IPs bound.
4. `resource_field_equals`: Deep JSONPath evaluation (`spec.replicas`, `spec.template.spec.securityContext.runAsNonRoot`).
5. `resource_field_gte`: Numeric threshold assertions (`spec.replicas >= 3`).
6. `command_executed`: Validates execution of required CLI commands via substring or regex.
7. `network_policy_isolates`: Asserts zero-trust ingress/egress policy rules.
8. `hpa_configured`: Validates HorizontalPodAutoscaler targets and metrics.
9. `storage_bound`: Checks PVC `status.phase === 'Bound'`.
10. `security_hardened`: Validates dropped Linux capabilities and read-only filesystems.

### 3.6 Production Incident Simulator (`incidentEngine.js`)
Located at [`src/engine/incidentEngine.js`](file:///h:/kubelabs/src/engine/incidentEngine.js), provides 15 high-impact SEV-1/SEV-2 production outages:
- `inc-01-selector-blackhole`: Service selector drift leaving endpoints at zero (503 Service Unavailable).
- `inc-02-bad-image-rollout`: Defective canary tag causing `ImagePullBackOff`.
- `inc-03-crashloop-missing-secret`: Application crashing on start due to missing secret environment keys.
- `inc-04-netpol-database-isolation`: Overly strict default-deny NetworkPolicy breaking database egress.
- `inc-05-cpu-starvation-pending`: Pods unschedulable due to excessive CPU requests.
- `inc-06-istio-mtls-503-uc`: Istio strict mTLS mode mismatch causing connection resets.
- `inc-07-argocd-drift-out-of-sync`: Out-of-band imperative cluster mutation triggering GitOps drift.
- `inc-08-gpu-taint-scheduling-block`: LLM inference pod pending due to missing GPU node toleration.
- `inc-09-etcd-quorum-loss`: Control plane split-brain and read-only freeze from lost Raft quorum.
- `inc-10-kyverno-admission-block`: Misconfigured validating webhook rejecting all namespace creation.
- `inc-11-coredns-loop-crash`: CoreDNS forwarding loop causing cluster-wide DNS failure.
- `inc-12-pvc-storageclass-pending`: Stateful database PVC stuck pending due to missing StorageClass.
- `inc-13-slow-app-cpu-throttling`: Slow application & P99 latency spike caused by severe CFS CPU throttling (`limits.cpu: 5m`) and missing HPA.
- `inc-14-iam-irsa-access-denied`: AWS EKS S3 ingestion outage (`AccessDenied: WebIdentityErr`) caused by missing `eks.amazonaws.com/role-arn` annotation on ServiceAccount.
- `inc-15-node-notready-kubelet-down`: Worker node `kubelabs-worker-01` `NotReady` and cordoned due to stopped `kubelet` daemon.

### 3.7 Visual Architecture Designer & IaC Compiler (`architectureEngine.js`)
Located at [`src/engine/architectureEngine.js`](file:///h:/kubelabs/src/engine/architectureEngine.js):
- **4-Pillar Well-Architected Evaluation**: Computes real-time scores (0–100%) for Security, Reliability, Performance, and Cost Optimization.
- **Bi-Directional IaC Generation**: Compiles visual topologies into production-ready multi-document Kubernetes YAML or OpenTofu/Terraform HCL.
- **8 Reference Blueprints**: Pre-modeled enterprise topologies including Zero-Trust Mesh, FinOps Kepler, Edge Wasm, and Multi-Cloud EKS/GKE.

### 3.8 Contextual Socratic AI Mentor & CIS Auditor (`aiMentor.js`)
Located at [`src/engine/aiMentor.js`](file:///h:/kubelabs/src/engine/aiMentor.js):
- **Three Pedagogical Modes**: `hint` (Socratic diagnostic suggestions), `debug` (error analysis), and `explain` (architectural concepts).
- **CIS Kubernetes Benchmark Auditor**: Runs 10 automated security checks auditing root execution, capabilities, resource limits, and network policies.

### 3.9 Asymmetric Ed25519 Certification Engine (`certificationEngine.js`)
Located at [`src/engine/certificationEngine.js`](file:///h:/kubelabs/src/engine/certificationEngine.js):
- **Cryptographic Authority**: Generates an Ed25519 keypair upon startup (`crypto.generateKeyPairSync('ed25519')`).
- **Verifiable Credentials**: Produces cryptographically signed certificates containing candidate name, score, track ID, and base64 signature.
- **Public Key Endpoint**: Exposes `GET /api/certifications/public-key` for instant third-party offline credential verification.

### 3.10 Enterprise Multi-Milestone Capstone Engine (`projectEngine.js`)
Located at [`src/engine/projectEngine.js`](file:///h:/kubelabs/src/engine/projectEngine.js):
- Houses 8 multi-stage enterprise projects featuring step-by-step milestone progression, validation endpoints (`POST /api/projects/:id/milestones/:mNum/validate`), and comprehensive business scenarios.

### 3.11 SQLite WAL Persistence Tier (`database.js`)
Located at [`src/db/database.js`](file:///h:/kubelabs/src/db/database.js):
- Uses native `node:sqlite` in WAL mode (`PRAGMA journal_mode = WAL`) with foreign key constraints.
- Maintains schema migrations, learner profiles, lab completions, incident records, certifications, and session snapshots.

### 3.12 HTTP/REST Gateway, Rate Limiter & Prometheus Metrics (`router.js`, `server.js`)
Located at [`src/api/router.js`](file:///h:/kubelabs/src/api/router.js) and [`src/server.js`](file:///h:/kubelabs/src/server.js):
- **Token-Bucket Rate Limiter**: Restricts traffic to 180 requests/minute per client IP.
- **OpenMetrics Endpoint**: Serves Prometheus metrics on `GET /metrics` tracking request latency, active sessions, and status codes.
- **Kubernetes Probes**: Native `/api/livez` and `/api/readyz` endpoints.
- **Graceful Shutdown**: Intercepts `SIGTERM` and `SIGINT` to cleanly close connections and flush SQLite WAL logs.

### 3.13 Browser-Native Isomorphic Offline Engine (`offlineEngine.js`, `sw.js`)
Located at [`public/js/offlineEngine.js`](file:///h:/kubelabs/public/js/offlineEngine.js) and [`public/sw.js`](file:///h:/kubelabs/public/sw.js):
- Implements browser-side mirrors of `VirtualCluster`, `VirtualFileSystem`, `TerminalEngine`, and `ValidationEngine`.
- Service worker caches all static assets and triggers offline execution when network connectivity is lost.

---

## 4. Master Curriculum Catalog (26 Domains & 6 Guided Tracks)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          26 COMPREHENSIVE LEARNING DOMAINS                             │
├─────────────────────────┬──────────────────────────┬───────────────────────────────────┤
│ 01. Linux Fundamentals  │ 10. Observability Stack  │ 19. Control Plane & Upgrades      │
│ 02. Containers Runtime  │ 11. SRE & Chaos Eng.     │ 20. Gateway API & Cilium eBPF     │
│ 03. Cloud Networking    │ 12. Platform Engineering │ 21. Policy-as-Code (Kyverno)      │
│ 04. Kubernetes Core     │ 13. OpenTofu / Terraform │ 22. Autoscaling (KEDA/Karpenter)  │
│ 05. CNCF Packaging      │ 14. AWS EKS Architecture │ 23. Storage CSI & Velero DR       │
│ 06. GitOps Delivery     │ 15. Azure AKS & GCP GKE  │ 24. Multi-Tenancy (vCluster)      │
│ 07. DevOps CI/CD        │ 16. AI-Ops & GPU Systems │ 25. Zero-Trust SPIFFE / Secrets   │
│ 08. DevSecOps Security  │ 17. Wasm & eBPF Tetragon │ 26. Cloud-Native AI/ML (KServe)   │
│ 09. Service Mesh        │ 18. FinOps & Green Cloud │                                   │
└─────────────────────────┴──────────────────────────┴───────────────────────────────────┘
```

### The 6 Career Tracks & Included Domains:
1. **Track 1: Cloud-Native Foundations (`track-foundations`)**  
   *Domains*: 01 (Linux), 02 (Containers), 03 (Networking), 23 (Storage CSI & Velero).  
   *Credential*: Certified Cloud-Native Foundations Associate (CCNFA).
2. **Track 2: Kubernetes & CNCF Administrator (`track-k8s-admin`)**  
   *Domains*: 04 (K8s Core), 05 (Packaging), 06 (GitOps), 07 (CI/CD), 19 (Control Plane & Upgrades).  
   *Credential*: Certified Kubernetes & GitOps Administrator (CKGA).
3. **Track 3: DevSecOps & Zero-Trust Specialist (`track-devsecops`)**  
   *Domains*: 08 (DevSecOps), 09 (Service Mesh), 21 (Policy-as-Code Kyverno), 25 (Zero-Trust SPIFFE & External Secrets).  
   *Credential*: Certified Cloud-Native Security Specialist (CCNSS).
4. **Track 4: SRE, Service Mesh & Resilience Lead (`track-sre`)**  
   *Domains*: 10 (Observability), 11 (SRE & Chaos), 20 (Gateway API & Cilium), 22 (KEDA & Karpenter Autoscaling).  
   *Credential*: Certified Site Reliability & Incident Commander (CSRIC).
5. **Track 5: Platform Engineering & Multi-Tenancy Architect (`track-platform`)**  
   *Domains*: 12 (Platform Eng), 13 (OpenTofu), 18 (FinOps OpenCost), 24 (Multi-Tenancy vCluster & Crossplane).  
   *Credential*: Certified Platform Engineering Architect (CPEA).
6. **Track 6: Multi-Cloud, Cloud-Native AI/ML & Distributed Systems (`track-multicloud-aiops`)**  
   *Domains*: 14 (AWS), 15 (Azure/GCP), 16 (AI-Ops), 17 (Wasm & Tetragon), 26 (Cloud-Native AI/ML KServe).  
   *Credential*: Certified Multi-Cloud & AI-Ops Principal (CMCAP).

---

## 5. User Interface & Interactive Workbench (UI/UX v2)

The web client ([`public/index.html`](file:///h:/kubelabs/public/index.html), [`public/css/styles.css`](file:///h:/kubelabs/public/css/styles.css), [`public/js/app.js`](file:///h:/kubelabs/public/js/app.js)) provides an integrated, responsive development environment:
- **Header**: Tracks active profile, earned XP, domain/track filter, and theme selector (Dark, Light, High-Contrast).
- **Navigation Tabs**:
  - **Labs**: Filterable list of 52 labs with step instructions, hints, starter manifests, and one-click validation.
  - **Terminal**: Sandboxed terminal with command history (`ArrowUp`/`ArrowDown`), tab autocompletion (`Tab`), and clear (`Ctrl+L`).
  - **Manifest Editor**: Dual-pane editor with syntax highlighting, manifest linting, and instant cluster application.
  - **Cluster Topology**: Live interactive SVG directed graph rendering relationships (Ingress → Service → Pod → Node/PVC).
  - **Incidents**: Active outage dashboard with MTTR timer, symptoms, diagnostic hints, and recovery evaluation.
  - **Architecture Canvas**: Drag-and-drop designer calculating 4-pillar scores with instant YAML/HCL download.
  - **Capstone Projects**: 8 multi-milestone platform scenarios with milestone progress stepper and validation.
  - **Certifications**: Timed exam portal with question navigation, passing criteria, and Ed25519 signature verification.
  - **AI Mentor**: Socratic tutor modal with Hint, Debug, Explain modes, and automated CIS Benchmark auditing.
  - **Self-Audit**: Real-time display of the 11-agent governance ledger and 50 automated quality gates.

---

## 6. Step-by-Step Hands-On Walkthroughs

### 6.1 Walkthrough 1: Hands-On Lab Completion (Dynamic PVC & StorageClass)
Solving **Lab 23.1: Dynamic Volume Provisioning** (`lab-stor-01`):
1. **Navigate to Labs**: Select **23. Production Storage, CSI & Velero Disaster Recovery** → `lab-stor-01`.
2. **Initial Validation**: Click **Validate Lab**. Engine reports:
   ```
   [FAIL] StorageClass fast-ssd must exist
   Score: 0 / 100
   ```
3. **Create StorageClass Manifest**: Open Manifest Editor and apply:
   ```yaml
   apiVersion: storage.k8s.io/v1
   kind: StorageClass
   metadata:
     name: fast-ssd
   provisioner: kubernetes.io/no-provisioner
   volumeBindingMode: WaitForFirstConsumer
   ```
4. **Create PVC Manifest**:
   ```yaml
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: database-pvc
     namespace: default
   spec:
     accessModes:
       - ReadWriteOnce
     storageClassName: fast-ssd
     resources:
       requests:
         storage: 20Gi
   ```
5. **Verify via Terminal**: Run `kubectl get sc,pvc`. The PVC is bound dynamically to a generated PV.
6. **Final Validation**: Click **Validate Lab**. All assertions pass: **100% Score • +250 XP Awarded**.

### 6.2 Walkthrough 2: Resolving a SEV-1 Production Incident (etcd Quorum Loss)
Resolving **Incident 09: etcd Quorum Loss** (`inc-09-etcd-quorum-loss`):
1. **Launch Incident**: Click **Launch Incident 09**. MTTR timer starts. Alert reports: *Control plane read-only freeze; etcd cluster split-brain.*
2. **Diagnose**: Run `etcdctl endpoint health`. Output reveals:
   ```
   ENDPOINT                HEALTH    TOOK
   127.0.0.1:2379          false     timeout
   ```
3. **Execute Recovery**:
   ```bash
   etcdctl snapshot restore /var/lib/etcd/backup.db --data-dir=/var/lib/etcd/new.etcd
   ```
4. **Restart & Reconcile**:
   ```bash
   kubectl set env deployment/kube-apiserver -n kube-system ETCD_READY=true
   ```
5. **Verify Resolution**: Click **Verify Resolution**. Outage recovered in `1m 14s` • **SEV-1 Resolved • +350 XP**.

### 6.2.1 Walkthrough 2.1: Resolving a SEV-1 Outage (AWS EKS IAM IRSA Access Denied)
Resolving **Incident 14: AWS EKS S3 Ingestion Outage** (`inc-14-iam-irsa-access-denied`):
1. **Launch Incident**: Click **Launch Incident 14**. Alert reports: `CloudWatch Alert: S3AccessDeniedException: pod s3-sync-worker failed AssumeRoleWithWebIdentity.`
2. **Diagnose**: Run `kubectl describe pod s3-sync-worker -n production`. Output highlights that the pod's service account lacks the required AWS IAM role annotation.
3. **Execute Remediation**:
   ```bash
   kubectl annotate serviceaccount s3-worker-sa eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/eks-s3-access -n production
   ```
4. **Reconcile**: Pod automatically transitions from `CrashLoopBackOff` to `Running` once STS WebIdentity credentials mount successfully.
5. **Verify Resolution**: Click **Verify Resolution** • **100% Passing • +300 XP Awarded**.

### 6.3 Walkthrough 3: Multi-Milestone Capstone (Multi-Tenant vCluster Platform)
Solving **Capstone 7** (`proj-07-multitenant-vcluster-platform`):
- **Milestone 1**: Create namespace `tenant-alpha` and `ResourceQuota` limiting `hard.pods: "10"`.
- **Milestone 2**: Deploy Kyverno `ClusterPolicy` enforcing mandatory `team` ownership labels.
- **Milestone 3**: Run `vcluster create alpha-vcluster -n tenant-alpha` to provision virtual control plane.
- **Milestone 4**: Apply strict cross-tenant `NetworkPolicy` isolating ingress/egress.
- **Result**: All 4 milestones pass; **500 XP Awarded**.

### 6.4 Walkthrough 4: Visual Architecture Design to Multi-Cloud IaC Export
1. Open **Architecture Canvas** and select the `istio-service-mesh` blueprint.
2. Review calculated Well-Architected scores: **Security: 95%, Reliability: 90%, Cost: 85%, Performance: 90%**.
3. Click **Export Kubernetes YAML** to obtain production manifests for Istio Gateways, VirtualServices, and mTLS DestinationRules.
4. Click **Export OpenTofu HCL** to obtain cloud infrastructure code for VPCs and subnets.

### 6.5 Walkthrough 5: Earning an Ed25519 Asymmetric Verified Certification
1. Navigate to **Certifications** → **Certified Kubernetes & GitOps Administrator (CKGA)**.
2. Complete 10 rigorous scenario questions covering etcd restore, RBAC policies, and GitOps synchronization.
3. Click **Submit Exam**. Score: **95%**.
4. The engine generates an Ed25519 digital signature and issues a verifiable certificate ID.
5. Third-party auditors can query `GET /api/certifications/verify?id=CERT-CKGA-...` to cryptographically validate certificate authenticity using the platform's public key.

---

## 7. The 11-Agent Autonomous Governance Framework

KubeLabs is designed, implemented, and guarded by 11 specialized autonomous agents:
1. `agent-product`: Owns the PRD, user stories, career tracks, and learning progression.
2. `agent-architect`: Enforces system boundaries, ADRs, and zero-dependency invariants.
3. `agent-backend`: Manages server routing, state reconciliation, and SQLite operations.
4. `agent-frontend`: Delivers the responsive HTML5/CSS/JS workbench and PWA offline caching.
5. `agent-kubernetes`: Enforces Kubernetes API fidelity and controller reconciliation logic.
6. `agent-curriculum`: Authors pedagogical modules, hands-on labs, and assessment questions.
7. `agent-devops`: Manages GitHub Actions workflows, Helm charts, and release automation.
8. `agent-security`: Enforces sandboxed command execution, zero-CVE posture, and CSP security.
9. `agent-qa`: Validates deterministic solvers across all 52 labs, 15 incidents, and 8 capstones.
10. `agent-documentation`: Maintains comprehensive architectural documentation and runbooks.
11. `agent-platform`: Enforces memory budgets (< 150MB RSS) and zero-placeholder invariants.

---

## 8. Automated Verification Ledger & Quality Gates

KubeLabs provides 3 automated verification commands runnable from any environment:

### 1. Master Test Suite (`npm test`)
```bash
npm test
```
Executes 8 test suites verifying PluginManager schemas, VirtualCluster reconciliation, TerminalEngine execution, deterministic lab solvers (52/52), deterministic incident solvers (15/15), architecture compilation, Ed25519 signatures, and HTTP API integration in **~350ms**.

### 2. Subphase Verification Ledger (`npm run verify:subphases`)
```bash
npm run verify:subphases
```
Verifies all 40 sequential project subphases across all 10 implementation stages in **~25ms**.

### 3. 11-Agent Self-Audit (`npm run audit:self`)
```bash
npm run audit:self
```
Executes 50 distinct quality gates across all 11 autonomous agents, auditing code quality, memory RSS (< 150MB), documentation, and security perimeters in **~40ms**.

---

## 9. Cross-Platform Deployment & Packaging Matrix

| Target Platform | Technology Stack | Deployment Artifact |
|---|---|---|
| **Web / Browser** | HTML5, CSS Grid, Vanilla JS, PWA | Precached via `public/sw.js` & `offlineEngine.js` |
| **Kubernetes (Self-Hosted)** | StatefulSet with PersistentVolume | [`deploy/kubernetes/kubelabs-k8s.yaml`](file:///h:/kubelabs/deploy/kubernetes/kubelabs-k8s.yaml) |
| **Helm 3 (Enterprise)** | Helm Chart with configurable values | [`deploy/helm/kubelabs/`](file:///h:/kubelabs/deploy/helm/kubelabs/) |
| **Desktop (Win/Mac/Linux)** | Tauri (Rust) & Electron | [`deploy/desktop/tauri.conf.json`](file:///h:/kubelabs/deploy/desktop/tauri.conf.json), [`electron-main.js`](file:///h:/kubelabs/deploy/desktop/electron-main.js) |
| **Mobile (Android/iOS)** | Capacitor Native Wrapper | [`deploy/mobile/capacitor.config.json`](file:///h:/kubelabs/deploy/mobile/capacitor.config.json) |
| **Container (OCI)** | Rootless Alpine Dockerfile | `docker build -t kubelabs:v2.0 .` (under 60MB image) |

---

## 10. Repository Structure & File Index

```
h:\kubelabs/
├── README.md                                 # Master project overview & quickstart
├── package.json                              # Zero-dependency package manifest (v2.0.0)
├── deploy/
│   ├── desktop/                              # Tauri & Electron desktop configurations
│   ├── helm/kubelabs/                        # Enterprise Helm 3 deployment chart
│   ├── kubernetes/                           # High-availability Kubernetes StatefulSet
│   └── mobile/                               # Capacitor Android/iOS packaging config
├── docs/
│   ├── 01-GLOBAL-ENGINEERING-CONTRACT.md    # Global engineering rules & invariants
│   ├── 02-PRD.md                             # Comprehensive Product Requirements Doc
│   ├── 03-ARCHITECTURE.md                    # System, Data, Security & Lab Architecture
│   ├── 04-ADRS.md                            # 10 Architectural Decision Records
│   ├── 05-GITHUB-AND-CICD.md                 # Git branching & GitHub Actions standards
│   ├── 06-IMPLEMENTATION-PLAN.md             # Complete implementation roadmap
│   ├── 07-CURRICULUM-CATALOG.md              # 26 domains, 52 labs, 15 incidents, 8 capstones
│   ├── 08-OPERATIONS-AND-RUNBOOKS.md         # Production runbooks & DR procedures
│   ├── 11-COMPREHENSIVE-PROJECT-WALKTHROUGH.md # Complete project walkthrough
│   └── 12-ENTERPRISE-GAP-ANALYSIS-AND-EXECUTION-PLAN.md # Gap analysis & v2.0 roadmap
├── plugins/                                  # 26 modular domain plugins (01 to 26)
├── public/
│   ├── css/styles.css                        # Responsive styles & theme definitions
│   ├── js/app.js                             # Interactive UI controller & SVG visualizer
│   ├── js/offlineEngine.js                   # Browser-native isomorphic fallback engine
│   ├── index.html                            # Single-page workbench interface
│   ├── manifest.json                         # PWA manifest
│   └── sw.js                                 # Service Worker precaching v2
├── schemas/
│   └── plugin.schema.json                    # Strict JSON schema for domain plugins
├── scripts/
│   ├── self-audit.js                         # 11-agent 50-check quality gate auditor
│   └── verify-subphases.js                   # 40-subphase validation runner
├── src/
│   ├── server.js                             # HTTP server & graceful shutdown handler
│   ├── agents/orchestrator.js                # 11-agent governance orchestrator
│   ├── api/router.js                         # REST router, rate limiter & /metrics
│   ├── db/database.js                        # Native SQLite WAL persistence tier
│   ├── engine/
│   │   ├── aiMentor.js                       # Socratic mentor & CIS auditor
│   │   ├── architectureEngine.js             # Visual designer & IaC compiler
│   │   ├── certificationEngine.js            # Ed25519 credential signing authority
│   │   ├── incidentEngine.js                 # 15 production incident simulations
│   │   ├── projectEngine.js                  # 8 multi-milestone capstone projects
│   │   ├── sessionManager.js                 # Multi-tenant state isolation manager
│   │   ├── terminalEngine.js                 # Multi-CLI sandboxed terminal parser
│   │   ├── validationEngine.js               # 10-type declarative validation engine
│   │   ├── virtualCluster.js                 # Kubernetes control plane & controller loop
│   │   └── virtualFileSystem.js              # POSIX in-memory file system
│   └── plugins/pluginManager.js              # Plugin discovery & career track manager
└── tests/
    └── kubelabs.test.js                      # Unit, E2E, and deterministic solver test suite
```
