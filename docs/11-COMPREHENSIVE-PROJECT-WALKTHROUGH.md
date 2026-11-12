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
> *Version 3.0.0 • Zero Third-Party Runtime Dependencies (`"dependencies": {}`) • Native Node.js 22+ & SQLite WAL • 100% Offline-Capable PWA & Unified Isomorphic Core • Deterministic State-Graph Evaluation • 26 Domains • 52 Labs • 15 Production Incidents • 8 Capstones • 6 Certifications (Ed25519 Signed) • 40 Subphases (100% Verified) • 158 Automated Tests (100% Passing) • 53 Automated Quality Gates*

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Target-State Architecture & Invariants](#2-target-state-architecture--invariants)
3. [Deep Dive: The 22 Unified Isomorphic Core Subsystems (`src/core/`)](#3-deep-dive-the-22-unified-isomorphic-core-subsystems-srccore)
   - [3.1 Storage, State Synchronization & CRDT Tier](#31-storage-state-synchronization--crdt-tier)
   - [3.2 In-Memory POSIX Virtual File System](#32-in-memory-posix-virtual-file-system)
   - [3.3 Declarative Parsing & Object Graph Model](#33-declarative-parsing--object-graph-model)
   - [3.4 Virtual Kubernetes Control Plane & Controllers](#34-virtual-kubernetes-control-plane--controllers)
   - [3.5 Cloud, Mesh, GitOps & IaC Extensions](#35-cloud-mesh-gitops--iac-extensions)
   - [3.6 Sandboxed Shell Parser & Streaming Pipelines](#36-sandboxed-shell-parser--streaming-pipelines)
   - [3.7 Multi-CLI Sandboxed Terminal Engine](#37-multi-cli-sandboxed-terminal-engine)
   - [3.8 Advanced Schedulers & Infrastructure Engines](#38-advanced-schedulers--infrastructure-engines)
   - [3.9 Pedagogical, Evaluator & Certification Engines](#39-pedagogical-evaluator--certification-engines)
   - [3.10 Security Perimeter, Rate Limiting & Observability](#310-security-perimeter-rate-limiting--observability)
   - [3.11 Browser-Native Isomorphic Offline Engine & Service Worker v3](#311-browser-native-isomorphic-offline-engine--service-worker-v3)
4. [Master Curriculum Catalog (26 Domains & 6 Guided Tracks)](#4-master-curriculum-catalog-26-domains--6-guided-tracks)
5. [Production Outages & Capstones Catalog](#5-production-outages--capstones-catalog)
6. [User Interface & Interactive Workbench (UI/UX v3)](#6-user-interface--interactive-workbench-uiux-v3)
7. [Step-by-Step Hands-On Walkthroughs](#7-step-by-step-hands-on-walkthroughs)
   - [7.1 Walkthrough 1: Hands-On Lab Completion (Dynamic PVC & StorageClass)](#71-walkthrough-1-hands-on-lab-completion-dynamic-pvc--storageclass)
   - [7.2 Walkthrough 2: Resolving a SEV-1 Production Outage (etcd Quorum Loss)](#72-walkthrough-2-resolving-a-sev-1-production-outage-etcd-quorum-loss)
   - [7.3 Walkthrough 3: Resolving Cloud IAM Outage (AWS EKS IRSA Access Denied)](#73-walkthrough-3-resolving-cloud-iam-outage-aws-eks-irsa-access-denied)
   - [7.4 Walkthrough 4: Multi-Milestone Capstone (Multi-Tenant vCluster Platform)](#74-walkthrough-4-multi-milestone-capstone-multi-tenant-vcluster-platform)
   - [7.5 Walkthrough 5: Visual Architecture Design to Multi-Cloud IaC Export](#75-walkthrough-5-visual-architecture-design-to-multi-cloud-iac-export)
   - [7.6 Walkthrough 6: Asymmetric Ed25519 Certification Verification](#76-walkthrough-6-asymmetric-ed25519-certification-verification)
8. [The 11-Agent Autonomous Governance Framework](#8-the-11-agent-autonomous-governance-framework)
9. [Automated Verification Ledger & Test Matrix](#9-automated-verification-ledger--test-matrix)
10. [Cross-Platform Deployment & Packaging Matrix](#10-cross-platform-deployment--packaging-matrix)
11. [Running KubeLabs Locally & Operational Verification](#11-running-kubelabs-locally--operational-verification)
12. [Complete Repository Structure & File Index](#12-complete-repository-structure--file-index)

---

## 1. Executive Summary & Core Philosophy

**KubeLabs v3.0** is an enterprise-grade, standalone, zero-dependency, cross-platform learning laboratory and simulation platform for Kubernetes, the Cloud Native Computing Foundation (CNCF) ecosystem, GitOps, DevSecOps, Site Reliability Engineering (SRE), Platform Engineering, Service Mesh, and emerging cloud technologies (Wasm, eBPF, FinOps, and Cloud-Native AI/ML).

### The Inherent Flaws of Traditional Learning Platforms

| Dimension | Traditional VMs (Minikube / Kind) | Remote Ephemeral VMs (Katacoda / Killercoda) | KubeLabs v3.0 |
|---|---|---|---|
| **RAM Footprint** | 8 GB – 16 GB | 0 MB (Client) / Massive Cloud VM Host | **< 52 MB RSS** (Total Server or Browser) |
| **Startup Latency** | 2 to 5 minutes | 30 to 90 seconds queue | **< 250 milliseconds** (Instant) |
| **Hardware Reqs** | VT-x / AMD-V virtualization, 4+ cores | High-bandwidth internet required | Runs on budget laptops, mobile browsers, tablets |
| **Offline Capability** | Partial (requires pre-pulled Docker images) | 0% (Fails completely offline) | **100% Offline PWA** via Service Worker & Isomorphic Core |
| **Grading Model** | Fragile regex matching on shell history | Fragile bash command regex checks | **Deterministic State-Graph Reconciliation** |
| **Security Risk** | Root container escape / host exposure | Shared kernel security boundaries | **Zero Host Shell (`child_process.exec` forbidden)** |
| **Runtime Dependencies** | Hundreds of npm / OS packages | Proprietary cloud infrastructure | **Zero Third-Party Dependencies (`"dependencies": {}`)** |

### The KubeLabs Breakthrough

1. **Zero External Runtime Dependencies (`"dependencies": {}`)**: Everything runs on native Node.js 22+ standard libraries (`node:http`, `node:sqlite`, `node:crypto`, `node:test`, `node:fs`, `node:path`). There is zero npm supply-chain risk, zero vulnerability patching overhead, and instant installation.
2. **Microsecond Declarative Virtual Control Plane**: Rather than spinning up heavyweight Linux kernels and Docker daemons, KubeLabs executes a lightweight, in-process Kubernetes API and reconciliation loop simulation that handles Deployments, StatefulSets, DaemonSets, Services, Endpoints, NetworkPolicies, RBAC, PVC dynamic binding, CoreDNS, and taints/tolerations in under 52 MB RSS RAM.
3. **Deterministic State-Graph Validation**: Labs are graded against the actual reconciled cluster object graph, not shell history. Whether configured through imperative CLI commands or declarative multi-document YAML manifests, only true cluster state determines success.
4. **Universal Isomorphism**: All 22 modules in `src/core/` are designed to execute identically in Node.js 22+ servers, in-browser WebWorkers, Desktop webviews (Tauri/Electron), and Mobile webviews (Capacitor), guaranteeing 100% offline parity.

---

## 2. Target-State Architecture & Invariants

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
│   • Bounded Token-Bucket Rate Limiter (180 req/min/IP)                                    │
│   • Security Headers: Strict-CSP, HSTS (2yr), X-Content-Type-Options, X-Frame-Options      │
│   • Bounded Request Body (1 MB limit) • Native Prometheus /metrics • /livez & /readyz    │
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
│ │    SchedulerEngine    │ │    NetworkingEngine    │ │    StorageAndSecurityEngine      │ │
│ │ (Filter, Score, Taint,│ │ (7-Hop Virtual CNI,    │ │ (CSI Dynamic PV Binding, KMS,    │ │
│ │  Affinity, Quotas)    │ │  NetPol, CoreDNS Loop) │ │  Vault, SPIFFE/SPIRE SVID)       │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │  ObservabilityEngine  │ │ AutoscalingAndMesh     │ │        ValidationEngine          │ │
│ │ (PromQL, LogQL, SLO   │ │ (HPA v2, VPA, Karpenter│ │ (18 Declarative Evaluators,      │ │
│ │  Error Budget Burn)   │ │  Linkerd, Consul)      │ │  Deterministic Grading)          │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │     IncidentEngine    │ │     ProjectEngine      │ │       ArchitectureEngine         │ │
│ │ (15 SEV-1/2 Outages,  │ │ (8 Multi-Milestone     │ │ (4 Pillars, 8 Blueprints,        │ │
│ │  MTTR Stopwatch)      │ │  Enterprise Capstones) │ │  Kubernetes YAML & OpenTofu HCL) │ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │        AiMentor       │ │  CertificationEngine   │ │        CloudExtensions           │ │
│ │ (Socratic Guidance,   │ │ (Ed25519 Signatures,   │ │ (Helm Release Lifecycle, ArgoCD, │ │
│ │  CIS Benchmark Audit) │ │  Skill Radar, Offline) │ │  Istio Routing, Multi-Cloud)     │ │
│ └───────────────────────┘ └────────────────────────┘ └──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Invariants

1. **Zero External Runtime Dependencies**: `package.json` contains `"dependencies": {}`. No external npm modules are installed or imported during runtime.
2. **Strict Resource Budgets**: Startup `< 250ms`, Idle RSS Memory `< 60MB`, Peak Engine Load `< 150MB`.
3. **Deterministic Solvability**: 100% of labs (52/52), incidents (15/15), and capstones (8/8) deterministically fail prior to remediation and pass 100% with the canonical solution.
4. **Zero Host Execution**: Terminal commands are parsed and interpreted entirely in an in-memory state machine. No `child_process.exec`, `child_process.spawn`, or shell subprocesses are ever invoked.
5. **Universal Isomorphism**: All core engine algorithms are pure JavaScript without Node.js-only dependencies, enabling identical execution inside web browsers, WebWorkers, desktop apps, and mobile devices.

---

## 3. Deep Dive: The 22 Unified Isomorphic Core Subsystems (`src/core/`)

The core engine is located in [`src/core/`](file:///h:/kubelabs/src/core/). Every module operates independently with zero circular dependencies:

### 3.1 Storage, State Synchronization & CRDT Tier
- **`src/db/storageAdapter.js`**: Universal persistence abstraction supporting two backends:
  - `sqlite`: Native `node:sqlite` in WAL mode (`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`) for high-concurrency desktop/server persistence.
  - `memory`: High-performance in-memory Map driver for WebWorkers and ephemeral test runners.
  - **Conflict-Free Replicated Data Types (CRDT)**: Implements `VectorClock` comparison (`compare()`, `merge()`, `increment()`) and `CRDTStateMerger` utilizing Last-Write-Wins (LWW) entity resolution to synchronize learner progress seamlessly across offline desktop and mobile nodes.
- **`src/db/database.js`**: Manages SQLite schema migrations (tables: `learners`, `lab_progress`, `incident_records`, `project_progress`, `certifications`, `session_snapshots`), prepared statements, and transactional rollbacks.

### 3.2 In-Memory POSIX Virtual File System
- **`src/core/virtualFileSystem.js`**: A complete POSIX-compliant in-memory filesystem:
  - **Inode Structure**: Tracks permissions (`mode`, default `0o755` for dirs, `0o644` for files), `owner`, `group`, `size`, `mtime`, `ctime`. Supports `chmod`, `chown`, `stat`, and `lstat`.
  - **Symbolic Links**: True symlink resolution with loop detection (detects cyclic links within 32 hops).
  - **Stream Operations**: Stream redirection (`writeFile`, `appendFile`, `cat`, `truncate`), streaming chunks, and file watch listeners (`watch()`).
  - **Pre-populated Tree**: Pre-loaded with standard Linux & Kubernetes directories (`/etc/kubernetes/manifests`, `/var/log`, `/etc/cni/net.d`, `/root`).

### 3.3 Declarative Parsing & Object Graph Model
- **`src/core/yamlParser.js`**: Zero-dependency quote-safe YAML parser:
  - Multi-document stream splitting (`---`), literal block scalars (`|`, `|-`), folded scalars (`>`, `>-`), inline arrays (`[a, b]`), inline objects (`{k: v}`).
  - Anchors (`&`) and aliases (`*`) dereferencing.
  - Bi-directional YAML serialization (`stringifyYaml()`).
- **`src/core/jsonPath.js`**: RFC 9535 compliant JSONPath query evaluator:
  - Bracket/dot notation (`$.spec.template.spec.containers[0].image`).
  - Wildcard matching (`$.items[*].metadata.name`), recursive descent (`$..image`).
  - Slice indexing (`$[0:3]`), filter expressions (`[?(@.status == "Ready")]`).
  - Kubernetes custom column formatting.
- **`src/core/resourceGraph.js`**: Kubernetes Object Directed Acyclic Graph (DAG):
  - Primary compound indexing by `apiVersion/kind/namespace/name`.
  - Generation, ResourceVersion, and UID tracking.
  - Equality and set-based label selectors (`tier in (frontend, backend)`, `environment!=prod`).
  - OwnerReferences DAG with cascading deletion semantics (`Foreground`, `Background`, `Orphan`).
  - Finalizers queue preventing resource destruction until cleared.
  - Topological sorting and cycle detection.

### 3.4 Virtual Kubernetes Control Plane & Controllers
- **`src/core/controllerManager.js`**: Real-time reconciliation loops:
  - `DeploymentController`: Computes desired replica count, provisions/scales ReplicaSets, allocates unique Pod IPs (`10.244.x.x`), schedules Pods.
  - `StatefulSetController`: Enforces strict ordinal pod naming (`web-0`, `web-1`), manages volumeClaimTemplates, performs ordered rolling updates.
  - `DaemonSetController`: Automatically schedules exactly 1 pod replica per schedulable node.
  - `ServiceController` & `EndpointController`: Matches Service label selectors to Pod labels, dynamically binding Healthy Pod IPs to Endpoints.
  - `JobController` & `CronJobController`: Handles completion counts, parallelism, backoff limits, and cron schedules.
  - `RBAC Controller`: Evaluates `Role`, `ClusterRole`, `RoleBinding`, and `ClusterRoleBinding` rules for `can(subject, verb, resource, namespace)`.
- **`src/core/admissionController.js`**: Kubernetes admission security:
  - Mutating Admission Webhook: Modifies incoming manifests using RFC 6902 JSONPatch (`add`, `replace`, `remove`).
  - Validating Admission Webhook & ValidatingAdmissionPolicy.
  - Common Expression Language (`evaluateCEL`): Supports boolean logic, comparisons, `has()`, and string methods.
  - Pod Security Standards (PSS): Enforces `Privileged`, `Baseline`, and `Restricted` security profiles.

### 3.5 Cloud, Mesh, GitOps & IaC Extensions
- **`src/core/cloudExtensions.js`**:
  - `HelmReleaseManager`: Manages Helm chart release lifecycles (`install`, `upgrade`, `rollback`, `uninstall`) with atomic release history.
  - `ArgoCDController`: GitOps sync loop, drift detection comparing desired Git state vs live cluster state, automatic self-healing.
  - `IstioMeshEngine`: VirtualService weighted traffic routing, fault injection (delays/aborts), PeerAuthentication `STRICT` vs `PERMISSIVE` mTLS validation.
  - `OpenTofuStateGraph`: OpenTofu/Terraform state graph schema v4, drift detection, HCL synthesis.
  - `MultiCloudRegistry`: Cloud identity federation (AWS IRSA, Azure Workload Identity, GCP Workload Identity).

### 3.6 Sandboxed Shell Parser & Streaming Pipelines
- **`src/core/shellParser.js`**:
  - Bash tokenizer supporting single quotes (`'...'`), double quotes (`"..."`), ANSI-C escapes (`$'...'`), subshell expressions (`$(...)`), and environment variable expansion (`$VAR`, `${VAR:-default}`).
  - Abstract Syntax Tree (AST) generator: `Command`, `Pipeline`, `BinaryOp` (`&&`, `||`, `;`), `Redirection` (`>`, `>>`, `<`).
  - Flag parser: Parses POSIX flags (long `--flag=val`, short `-f`, combined short `-it`), automatic type coercion.
- **`src/core/pipelineDriver.js`**:
  - In-memory streaming pipelines: Connects stdout to stdin across chained commands without writing intermediate files to disk.
  - Implements POSIX text utilities: `grep` (regex, `-v`, `-i`, `-E`), `sed` (substitution `s/find/replace/g`), `awk` (`{print $1, $2}`), `sort` (`-r`, `-n`), `uniq` (`-c`), `cut` (`-d`, `-f`), `tr`, `head` (`-n`), `tail` (`-n`), `wc` (`-l`, `-w`, `-c`).
  - Exit code propagation and error short-circuiting.

### 3.7 Multi-CLI Sandboxed Terminal Engine
- **`src/core/multiCliDispatcher.js`**: Routes commands to 14 native cloud-native CLI simulators:
  - `kubectl`: Complete CRUD (`get`, `describe`, `apply`, `delete`, `edit`, `patch`, `scale`, `set env`, `set selector`, `cordon`, `drain`, `taint`, `auth can-i`).
  - `helm`: `install`, `upgrade`, `rollback`, `list`, `uninstall`.
  - `docker`: `build`, `run`, `ps`, `images`, `inspect`, `network ls`.
  - `etcdctl`: `snapshot save`, `snapshot restore`, `endpoint health`, `member list`.
  - `kubeadm`: `upgrade plan`, `upgrade apply`, `certs check-expiration`.
  - `argocd`: `app create`, `app sync`, `app get`, `app diff`.
  - `istioctl`: `analyze`, `proxy-status`, `authz check`.
  - `tofu`: `init`, `plan`, `apply`, `destroy`, `state list`.
  - `trivy`: `image`, `config`, `vulnerability scan`.
  - `aws`, `az`, `gcloud`: Cloud resource provisioning and IAM role assignment.
  - `vcluster`: `create`, `list`, `connect`, `delete`.
- **`src/core/terminalEngine.js`**: Manages interactive terminal sessions, command history, tab completion, environment variables, and ANSI color formatting.

### 3.8 Advanced Schedulers & Infrastructure Engines
- **`src/core/schedulerEngine.js`**: 3-Phase Kubernetes Scheduling Engine:
  - Filtering / Predicates: Node resource checks (`cpu`, `memory`), node unschedulable flag, taint filtering.
  - Taints and Tolerations: Evaluates `Key:Value:Effect` (`NoSchedule`, `PreferNoSchedule`, `NoExecute`) with operator matching (`Equal`, `Exists`).
  - Prioritizing / Scoring: Computes affinity scoring (`nodeAffinity`, `podAffinity`, `podAntiAffinity`).
  - Binding: Assigns selected node name and triggers node resource allocation.
  - ResourceQuotas & LimitRanges: Enforces namespace cpu/memory bounds and pod count limits.
- **`src/core/networkingEngine.js`**:
  - `NetworkTracer`: Simulates a 7-hop virtual CNI packet trace (`Pod Netns` → `veth pair` → `Bridge` → `iptables / eBPF filter` → `Routing table` → `Target Node Bridge` → `Target Pod Netns`).
  - NetworkPolicy Evaluator: Evaluates ingress/egress rules, CIDR `ipBlock` with `except` clauses, pod and namespace selectors.
  - CoreDNS Resolver: Resolves Kubernetes cluster domains (`svc.cluster.local`), upstream DNS forwarding, and loops detection.
  - Gateway API Engine: Evaluates `Gateway` and `HTTPRoute` hostnames and path routing.
  - Cilium eBPF Engine: Simulates eBPF TC/XDP packet drops and identity-based security policies.
- **`src/core/storageAndSecurityEngine.js`**:
  - CSI Storage Driver: Simulates dynamic volume provisioning, `StorageClass` binding modes (`Immediate`, `WaitForFirstConsumer`), volume access modes (`ReadWriteOnce`, `ReadOnlyMany`, `ReadWriteMany`).
  - KMS Envelope Encryption: Simulates secret encryption at rest using AES-GCM and key encryption keys.
  - External Secrets Operator: Simulates synchronization from AWS Secrets Manager / HashiCorp Vault.
  - SPIFFE/SPIRE: Verifies X.509 SVID identities and trust bundles.
- **`src/core/observabilityEngine.js`**:
  - PromQL Query Engine: Parses instant vector selectors, range vectors (`[5m]`), functions (`rate`, `irate`, `sum`, `avg`, `histogram_quantile`), label matching (`=`, `!=`, `=~`, `!~`).
  - LogQL Engine: Parses stream selectors (`{app="frontend"}`) and filter expressions (`|= "error" | json`).
  - Multi-Window Burn Rate Alert Calculator: Computes SLO error budget consumption across short and long lookback windows.
- **`src/core/autoscalingAndMeshEngine.js`**:
  - HPA v2 Engine: Evaluates target metrics (CPU/Memory utilization percentage) and calculates desired replicas using canonical formula:
    $$\text{desiredReplicas} = \lceil \text{currentReplicas} \times \frac{\text{currentMetricValue}}{\text{targetMetricValue}} \rceil$$
  - VPA Engine: Generates CPU/memory recommendation profiles (`MinAllowed`, `MaxAllowed`, `Target`).
  - Karpenter Simulator: Simulates node consolidation, bin-packing, and AWS spot instance interruption handling.
  - Service Mesh: Mutual TLS enforcement, Linkerd `ServiceProfile` retry policies, Consul `ServiceSplitter`.

### 3.9 Pedagogical, Evaluator & Certification Engines
- **`src/core/validationEngine.js`**: Multi-assertion grading engine with **18 declarative rule evaluators**:
  1. `packet_trace_allowed`: Asserts network packet traverses CNI without policy drops.
  2. `packet_trace_blocked`: Asserts unauthorized packet is dropped by NetworkPolicy.
  3. `promql_query_result`: Asserts PromQL metric query matches numeric condition.
  4. `slo_burn_rate_within_budget`: Asserts SRE error budget burn rate is healthy.
  5. `logql_filter_matches`: Asserts LogQL log stream matches expected pattern.
  6. `rbac_can_i`: Asserts authorization check matches expected allow/deny.
  7. `pod_security_standard`: Asserts pod satisfies baseline or restricted PSS profile.
  8. `resource_count`: Asserts count of matching cluster resources meets expectation.
  9. `resource_field_equals`: Asserts deep JSONPath matches expected scalar value.
  10. `resource_exists`: Asserts presence of specified Kind, Namespace, and Name.
  11. `service_endpoints_ready`: Asserts service has healthy, matching Pod IPs bound.
  12. `hpa_target_scale_achieved`: Asserts HPA has scaled workload to target replica threshold.
  13. `vpa_recommendation_present`: Asserts VPA recommendations have been calculated.
  14. `karpenter_node_consolidated`: Asserts node consolidation has executed.
  15. `istio_route_matches`: Asserts traffic split weights match target percentages.
  16. `circuit_breaker_tripped`: Asserts envoy circuit breaker triggered on error spike.
  17. `vfs_file_contains`: Asserts file in in-memory VFS contains required configuration.
  18. `dns_resolution_succeeds`: Asserts CoreDNS resolves service FQDN to ClusterIP.
- **`src/core/incidentEngine.js`**: Houses 15 high-impact production outages across 8 outage classes with an MTTR stopwatch and deterministic resolution.
- **`src/core/projectEngine.js`**: Houses 8 enterprise multi-milestone capstone projects with sequential milestone validation.
- **`src/core/architectureEngine.js`**: Visual architecture analyzer scoring 4 Well-Architected pillars (Security, Reliability, Performance, Cost), detecting SPOFs, and compiling visual topologies to Kubernetes YAML or OpenTofu HCL.
- **`src/core/aiMentor.js`**: Contextual Socratic tutor providing `hint`, `debug`, and `explain` modes without leaking answers, plus an automated 10-point CIS Kubernetes Benchmark Auditor.
- **`src/core/certificationEngine.js`**: Enterprise asymmetric cryptographic certification authority using Node.js native `crypto.generateKeyPairSync('ed25519')`. Issues verifiable digital certificates with 26-domain skill radar computation.

### 3.10 Security Perimeter, Rate Limiting & Observability
- **`src/api/router.js` & `src/server.js`**:
  - **Bounded Token-Bucket Rate Limiter**: Bounded cache restricting clients to 180 requests/minute per IP, returning `HTTP 429 Too Many Requests`.
  - **Strict Security Headers**: Content-Security-Policy (CSP), Strict-Transport-Security (HSTS 2 years), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - **Bounded Payload Protection**: Maximum request body size enforced at 1 MB to prevent memory exhaustion.
  - **OpenMetrics / Prometheus Telemetry**: Serves Prometheus metrics on `GET /metrics` tracking request counts, latencies, active sessions, and engine memory RSS.
  - **Kubernetes Probes**: Native `/api/livez` and `/api/readyz` endpoints.
  - **Graceful Server Draining**: `app.drainGracefully()` handles `SIGTERM` and `SIGINT`, cleanly terminating inflight requests and flushing SQLite WAL.

### 3.11 Browser-Native Isomorphic Offline Engine & Service Worker v3
- **`public/js/offlineEngine.js`**: A browser-native bundle mirroring all core engine capabilities (`BrowserVFS`, `BrowserCluster`, `BrowserTerminal`, `BrowserValidator`, Incidents, Projects, AI Mentor, and offline CRDT sync queue) that runs inside web browsers even when completely offline.
- **`public/sw.js`**: Service Worker v3 (`kubelabs-offline-v3`) that precaches all static workbench assets (`/`, `/index.html`, `/css/styles.css`, `/js/app.js`, `/js/offlineEngine.js`, `/manifest.json`, and all 26 plugin manifests).

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

### The 6 Guided Career Role Tracks

1. **Track 1: Cloud-Native Foundations (`track-foundations`)**
   - *Target Role*: Junior Cloud Engineer / DevOps Apprentice
   - *Domains*: 01 (Linux), 02 (Containers), 03 (Networking), 23 (Storage CSI & Velero)
   - *Credential*: **Certified Cloud-Native Foundations Associate (CCNFA)**
2. **Track 2: Kubernetes & CNCF Administrator (`track-k8s-admin`)**
   - *Target Role*: Kubernetes Administrator / Cluster Operator
   - *Domains*: 04 (K8s Core), 05 (CNCF Packaging), 06 (GitOps), 07 (CI/CD), 19 (Control Plane & Upgrades)
   - *Credential*: **Certified Kubernetes & GitOps Administrator (CKGA)**
3. **Track 3: DevSecOps & Zero-Trust Specialist (`track-devsecops`)**
   - *Target Role*: Cloud Security Engineer / DevSecOps Specialist
   - *Domains*: 08 (DevSecOps), 09 (Service Mesh), 21 (Policy-as-Code Kyverno), 25 (Zero-Trust SPIFFE & External Secrets)
   - *Credential*: **Certified Cloud-Native Security Specialist (CCNSS)**
4. **Track 4: SRE, Service Mesh & Resilience Lead (`track-sre`)**
   - *Target Role*: Site Reliability Engineer / Incident Commander
   - *Domains*: 10 (Observability), 11 (SRE & Chaos), 20 (Gateway API & Cilium eBPF), 22 (Autoscaling KEDA & Karpenter)
   - *Credential*: **Certified Site Reliability & Incident Commander (CSRIC)**
5. **Track 5: Platform Engineering & Multi-Tenancy Architect (`track-platform`)**
   - *Target Role*: Platform Engineer / Internal Developer Platform Architect
   - *Domains*: 12 (Platform Engineering), 13 (OpenTofu / Terraform), 18 (FinOps OpenCost), 24 (Multi-Tenancy vCluster & Crossplane)
   - *Credential*: **Certified Platform Engineering Architect (CPEA)**
6. **Track 6: Multi-Cloud, Cloud-Native AI/ML & Distributed Systems (`track-multicloud-aiops`)**
   - *Target Role*: Principal Cloud Architect / MLOps & Distributed Systems Lead
   - *Domains*: 14 (AWS EKS), 15 (Azure AKS & GCP GKE), 16 (AI-Ops & GPU Systems), 17 (Wasm & Tetragon), 26 (Cloud-Native AI/ML KServe)
   - *Credential*: **Certified Multi-Cloud & AI-Ops Principal (CMCAP)**

---

## 5. Production Outages & Capstones Catalog

### 15 High-Impact Production Outages (Incident Simulator)

| ID | Title | Category | Severity | Injected Fault | Canonical Resolution |
|---|---|---|---|---|---|
| `inc-01-selector-blackhole` | Service Selector Drift | Control Plane | SEV-2 | Service selector points to `app: web-v1`, pods labeled `app: web-v2` | `kubectl set selector svc/frontend app=web-v2` |
| `inc-02-bad-image-rollout` | Bad Image Rollout Crash | Workload Crash | SEV-2 | Deployment updated with non-existent tag `v2.9.9` (ImagePullBackOff) | `kubectl rollout undo deployment/api-server` |
| `inc-03-crashloop-missing-secret` | Missing Secret CrashLoop | Workload Crash | SEV-2 | Pod requires `DB_PASSWORD` secret key that does not exist | `kubectl create secret generic app-secrets --from-literal=DB_PASSWORD=...` |
| `inc-04-netpol-database-isolation` | Overly Strict NetPol | Networking | SEV-1 | Default-deny NetworkPolicy isolates database, dropping backend traffic | Update NetworkPolicy ingress rules to permit backend pod selector |
| `inc-05-cpu-starvation-pending` | Pod Pending CPU Starvation | Scaling | SEV-2 | Deployment pods request `cpu: 32` exceeding cluster node capacity | `kubectl set resources deployment/data-processor -c=worker --requests=cpu=250m` |
| `inc-06-istio-mtls-503-uc` | Istio mTLS 503 Mismatch | Networking | SEV-1 | DestinationRule sets `DISABLE` mTLS while namespace requires `STRICT` | Configure DestinationRule `trafficPolicy.tls.mode: ISTIO_MUTUAL` |
| `inc-07-argocd-drift-out-of-sync` | GitOps Out-of-Sync Drift | GitOps | SEV-2 | Imperative patch to replicas triggers OutOfSync state in ArgoCD | `argocd app sync e-commerce-app --force` |
| `inc-08-gpu-taint-scheduling-block` | GPU Taint Scheduling Block | Control Plane | SEV-2 | LLM Pod lacks toleration for node taint `sku=gpu:NoSchedule` | Add toleration `sku=gpu:NoSchedule:Exists` to Pod manifest |
| `inc-09-etcd-quorum-loss` | Control Plane etcd Quorum Loss | Control Plane | SEV-1 | Raft quorum lost, control plane frozen in read-only mode | `etcdctl snapshot restore /var/lib/etcd/backup.db` & restart apiserver |
| `inc-10-kyverno-admission-block` | Kyverno Webhook Block | Security | SEV-1 | Misconfigured webhook rejects all namespace creation | Fix webhook failurePolicy to `Ignore` or correct policy rules |
| `inc-11-coredns-loop-crash` | CoreDNS Loop CrashLoop | Networking | SEV-1 | Forwarding loop in CoreDNS ConfigMap causes cluster DNS failure | Edit ConfigMap `coredns` to remove circular forwarder |
| `inc-12-pvc-storageclass-pending` | PVC StorageClass Pending | Storage | SEV-2 | Stateful PVC specifies non-existent StorageClass `fast-nvme` | Create missing StorageClass or patch PVC storageClassName |
| `inc-13-slow-app-cpu-throttling` | CFS CPU Throttling P99 Spike | Scaling | SEV-2 | Pod throttled due to `limits.cpu: 5m`; missing HPA scaling | Increase CPU limits to `500m` and configure HPA min/max replicas |
| `inc-14-iam-irsa-access-denied` | AWS EKS S3 IRSA Access Denied | Cloud IAM | SEV-1 | Pod lacks `eks.amazonaws.com/role-arn` ServiceAccount annotation | `kubectl annotate sa s3-worker-sa eks.amazonaws.com/role-arn=arn:aws:iam:...` |
| `inc-15-node-notready-kubelet-down` | Worker Node NotReady Outage | Control Plane | SEV-1 | Worker node cordoned and NotReady due to stopped kubelet service | Restart kubelet daemon and run `kubectl uncordon <node>` |

### 8 Multi-Milestone Enterprise Capstones

1. `proj-01-enterprise-gitops-pipeline`: Automated GitOps Deployment Pipeline with ArgoCD and Helm.
2. `proj-02-zero-trust-service-mesh`: Zero-Trust Architecture with Istio mTLS, AuthorizationPolicies, and Ingress Gateway.
3. `proj-03-finops-cloud-cost-optimization`: Kubernetes Cost Allocation and Right-Sizing with OpenCost and Karpenter.
4. `proj-04-hybrid-cloud-disaster-recovery`: Cross-Region Cluster Disaster Recovery with Velero and S3 Object Storage.
5. `proj-05-edge-computing-wasm`: High-Density Edge Workload Deployment with WebAssembly (Wasm) and K3s.
6. `proj-06-ai-inference-platform`: Production LLM / AI Inference Platform with KServe, vLLM, and GPU Autoscaling.
7. `proj-07-multitenant-vcluster-platform`: Secure Multi-Tenant SaaS Platform with Virtual Clusters (vCluster) and Kyverno.
8. `proj-08-ebpf-runtime-security`: Kernel-Level Runtime Threat Detection and Observability with Cilium Tetragon.

---

## 6. User Interface & Interactive Workbench (UI/UX v3)

The interactive workbench is delivered via [`public/index.html`](file:///h:/kubelabs/public/index.html), [`public/css/styles.css`](file:///h:/kubelabs/public/css/styles.css), and [`public/js/app.js`](file:///h:/kubelabs/public/js/app.js):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  KubeLabs v3.0  [Track: K8s Admin ▼]  [Domain: All ▼]  [Theme: Dark ▼]  [XP: 2,450]   │
├────────────┬─────────────────────────────┬───────────────────────────────┬─────────────┤
│ NAVIGATION │ LAB INSTRUCTIONS & STEPS    │ INTERACTIVE TERMINAL          │ TOPOLOGY /  │
│ [Labs]     │ Lab 23.1: Dynamic Volume    │ learner@kubelabs:~$           │ MANIFESTS   │
│ [Terminal] │ Provisioning with CSI       │ kubectl get storageclass      │             │
│ [Editor]   │                             │ NAME      PROVISIONER         │ [SVG Graph] │
│ [Topology] │ Task: Create a StorageClass │ fast-ssd  kubernetes.io/no... │             │
│ [Incidents]│ named 'fast-ssd' and bind a │                               │ Ingress     │
│ [Canvas]   │ 20Gi PVC.                   │ kubectl get pvc               │    │        │
│ [Capstones]│                             │ database-pvc  Bound  20Gi     │ Service     │
│ [Certs]    │ [Starter YAML]  [Hint]      │                               │    │        │
│ [AI Mentor]│ [Validate Lab (100%)]       │ [Tab] [Ctrl+C] [|] [-] [clear]│ Pod (x3)    │
├────────────┴─────────────────────────────┴───────────────────────────────┴─────────────┤
│ Resizable Split Panes: Drag #resizer-left / #resizer-right • Mobile Quick-Key Bar      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### UI/UX v3 Capabilities:
- **Responsive Split-Pane Resizers**: Smooth dragging via `#resizer-left` and `#resizer-right` with touch and mouse pointer events.
- **Mobile Quick-Key Bar**: Dedicated touch buttons for common CLI characters (`Tab`, `Ctrl+C`, `|`, `-`, `/`, `kubectl`, `helm`, `clear`) sized ≥ 44x44px for WCAG 2.1 AA mobile compliance.
- **Interactive SVG Topology Visualizer**: Renders real-time cluster graph showing relationships (`Ingress` → `Service` → `Pod` → `Node`/`PVC`).
- **Manifest Editor**: Built-in editor with one-click YAML application to the session cluster.
- **Theme Support**: Seamless switching between Dark, Light, and High-Contrast themes.
- **Accessibility**: Full ARIA landmark regions, live screen reader announcer, and keyboard focus outlines.

---

## 7. Step-by-Step Hands-On Walkthroughs

### 7.1 Walkthrough 1: Hands-On Lab Completion (Dynamic PVC & StorageClass)
**Objective**: Complete **Lab 23.1: Dynamic Volume Provisioning** (`lab-stor-01`).

1. **Select Lab**: Click **Labs** tab → Domain 23 → `lab-stor-01`.
2. **Initial Validation**: Click **Validate Lab**. The validation engine runs against the cluster and reports:
   ```
   [FAIL] StorageClass 'fast-ssd' must exist
   [FAIL] PVC 'database-pvc' must be Bound
   Score: 0 / 100
   ```
3. **Apply StorageClass**: Open the Manifest Editor and apply:
   ```yaml
   apiVersion: storage.k8s.io/v1
   kind: StorageClass
   metadata:
     name: fast-ssd
   provisioner: kubernetes.io/no-provisioner
   volumeBindingMode: WaitForFirstConsumer
   ```
4. **Apply PersistentVolumeClaim**:
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
5. **Verify State via Terminal**:
   ```bash
   kubectl get storageclass
   kubectl get pvc database-pvc
   ```
6. **Re-Validate Lab**: Click **Validate Lab**. All assertions pass: **Score: 100 / 100 • +250 XP Awarded**.

### 7.2 Walkthrough 2: Resolving a SEV-1 Production Outage (etcd Quorum Loss)
**Objective**: Resolve **Incident 09: Control Plane etcd Quorum Loss** (`inc-09-etcd-quorum-loss`).

1. **Launch Incident**: Click **Incidents** tab → `inc-09-etcd-quorum-loss` → **Launch Incident**.
2. **Symptom Alert**: *SEV-1 Alert: API server returns 500 Internal Error; etcd cluster split-brain.* The MTTR stopwatch starts ticking.
3. **Diagnostic Commands**:
   ```bash
   etcdctl endpoint health
   # Output: 127.0.0.1:2379 is unhealthy: connection timed out
   ```
4. **Execute Disaster Recovery**:
   ```bash
   etcdctl snapshot restore /var/lib/etcd/backup.db --data-dir=/var/lib/etcd/new.etcd
   kubectl set env deployment/kube-apiserver -n kube-system ETCD_READY=true
   ```
5. **Verify Resolution**: Click **Verify Resolution**. The engine confirms etcd health and API server responsiveness.
   - Result: **SEV-1 Incident Resolved in 1m 12s • +350 XP Awarded**.

### 7.3 Walkthrough 3: Resolving Cloud IAM Outage (AWS EKS IRSA Access Denied)
**Objective**: Resolve **Incident 14: AWS EKS S3 Ingestion Outage** (`inc-14-iam-irsa-access-denied`).

1. **Launch Incident**: Click **Launch Incident 14**. Symptom: `AccessDenied: WebIdentityErr` in ingestion pods.
2. **Diagnose**:
   ```bash
   kubectl describe pod s3-sync-worker -n production
   # Output: ServiceAccount 's3-worker-sa' has no role-arn annotation
   ```
3. **Execute Remediation**:
   ```bash
   kubectl annotate serviceaccount s3-worker-sa eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/eks-s3-access -n production
   ```
4. **Reconcile**: Pod transitions from `CrashLoopBackOff` to `Running` once STS credentials mount.
5. **Verify Resolution**: Click **Verify Resolution** • **100% Solved • +300 XP Awarded**.

### 7.4 Walkthrough 4: Multi-Milestone Capstone (Multi-Tenant vCluster Platform)
**Objective**: Complete **Capstone 7** (`proj-07-multitenant-vcluster-platform`).

- **Milestone 1**: Create namespace `tenant-alpha` and a `ResourceQuota` limiting hard pods to `10`.
  ```bash
  kubectl create namespace tenant-alpha
  kubectl create quota tenant-quota --hard=pods=10 -n tenant-alpha
  ```
  Validate Milestone 1: **Pass (100%)**.
- **Milestone 2**: Deploy a Kyverno `ClusterPolicy` requiring a `team` label on all tenant pods.
- **Milestone 3**: Provision virtual cluster control plane:
  ```bash
  vcluster create alpha-vcluster -n tenant-alpha
  ```
- **Milestone 4**: Apply zero-trust `NetworkPolicy` isolating `tenant-alpha` from other namespaces.
- **Outcome**: Capstone 7 Completed • **+500 XP Awarded**.

### 7.5 Walkthrough 5: Visual Architecture Design to Multi-Cloud IaC Export
1. Click **Architecture Canvas** tab.
2. Select the `istio-service-mesh` reference blueprint.
3. Review computed Well-Architected scores: **Security: 95%, Reliability: 90%, Cost: 85%, Performance: 90%**.
4. Click **Export Kubernetes YAML**: Downloads validated multi-document manifests for Istio Gateway, VirtualService, and DestinationRule.
5. Click **Export OpenTofu HCL**: Downloads production OpenTofu/Terraform code provisioning VPC, subnets, and node groups.

### 7.6 Walkthrough 6: Asymmetric Ed25519 Certification Verification
1. Navigate to **Certifications** tab → **Certified Kubernetes & GitOps Administrator (CKGA)**.
2. Answer 10 rigorous scenario-based questions within the 30-minute exam window.
3. Submit exam: Score **95% (Pass)**.
4. The engine executes `crypto.sign(null, payload, privateKey)` using the platform's private Ed25519 key and issues a verifiable digital credential:
   ```json
   {
     "certificateId": "CERT-CKGA-A4B7D2F8",
     "trackId": "track-k8s-admin",
     "candidate": "Cloud Learner",
     "score": 95,
     "issuedAt": "2026-11-12T12:00:00.000Z",
     "algorithm": "Ed25519",
     "signature": "8a3f...d9e1=="
   }
   ```
5. Any third-party auditor can verify this credential offline by querying:
   `GET /api/certifications/verify?id=CERT-CKGA-A4B7D2F8`
   The endpoint verifies the signature against the server's public key (`GET /api/certifications/public-key`) without needing an external certificate authority.

---

## 8. The 11-Agent Autonomous Governance Framework

KubeLabs is engineered, maintained, and verified by 11 specialized autonomous agents orchestrated by [`src/agents/orchestrator.js`](file:///h:/kubelabs/src/agents/orchestrator.js):

| Agent Name | Identifier | Primary Responsibilities |
|---|---|---|
| **Product Engineering Agent** | `agent-product` | PRD specifications, career track alignment, learner journeys |
| **Principal Architect Agent** | `agent-architect` | System boundaries, ADRs, zero-dependency invariants |
| **Backend & Persistence Agent** | `agent-backend` | REST routing, SQLite WAL management, controller lifecycle |
| **Frontend & PWA Agent** | `agent-frontend` | Responsive UI/UX, touch targets, Service Worker v3 caching |
| **Kubernetes Control Plane Agent** | `agent-kubernetes` | API fidelity, controller loops, CNI packet tracing |
| **Curriculum Designer Agent** | `agent-curriculum` | Authors 52 labs, 15 incidents, starter manifests, solutions |
| **DevOps & Release Agent** | `agent-devops` | GitHub Actions CI/CD, Helm chart, Docker multi-arch packaging |
| **DevSecOps & Security Agent** | `agent-security` | Command sandboxing, zero-CVE posture, strict CSP/HSTS |
| **QA & Deterministic Solver Agent** | `agent-qa` | Validates deterministic solvers across all labs, incidents, projects |
| **Documentation & Knowledge Agent** | `agent-documentation` | Maintains runbooks, architecture docs, and technical guides |
| **Platform Engineering Agent** | `agent-platform` | Enforces memory budgets (< 150MB RSS) and zero-placeholder invariant |

### The 53 Quality Gates of `scripts/self-audit.js`

Every release must pass all 53 automated checks verified by `npm run audit:self`:
- **Product Gate**: PRD existence, 6 role tracks registered, 26 domains active (3 checks).
- **Architecture Gate**: Architecture doc, 10 ADRs, JSON schema, 8 reference architectures (4 checks).
- **Backend Gate**: 10 core backend modules implemented and non-empty (10 checks).
- **Frontend Gate**: 6 web/PWA assets present (HTML, CSS, App JS, Manifest, SW, OfflineEngine) (6 checks).
- **Kubernetes Gate**: Reconciles Deployments to Running Pods, binds Service Endpoints (2 checks).
- **Curriculum Gate**: Zero plugin schema errors, 52+ labs, all modules complete (3 checks).
- **DevOps Gate**: CODEOWNERS, PR template, 4 GitHub workflows, CI/CD docs (7 checks).
- **Security Gate**: Zero runtime dependencies, sandboxed CLI execution, parameterized SQL (3 checks).
- **QA Gate**: 52/52 labs deterministically pass, 15/15 incidents deterministically resolve (2 checks).
- **Documentation Gate**: 11 documentation artifacts complete with zero missing sections (11 checks).
- **Platform Gate**: Memory RSS under 150 MB (currently ~51 MB), zero TODO/placeholder markers (2 checks).

---

## 9. Automated Verification Ledger & Test Matrix

KubeLabs maintains an automated test matrix with **158 passing automated tests**:

```
========================================================================================
                      KUBELABS TEST MATRIX & SUITE LEDGER
========================================================================================
Test Suite                | Command                | Tests | Pass Rate | Duration
--------------------------|------------------------|-------|-----------|-------------
Stage 1: Core Subsystems  | npm run test:stage1    | 41    | 100%      | ~160ms
Stage 2: Parsing & Pipes  | npm run test:stage2    | 35    | 100%      | ~130ms
Stage 3: Engines & Sched. | npm run test:stage3    | 41    | 100%      | ~480ms
Stage 4: Curriculum & DR  | npm run test:stage4    | 13    | 100%      | ~190ms
Stage 5: UI, Offline & CI | npm run test:stage5    | 20    | 100%      | ~340ms
Master End-to-End Suite   | npm test               | 8     | 100%      | ~320ms
--------------------------|------------------------|-------|-----------|-------------
TOTAL AUTOMATED TESTS     |                        | 158   | 100%      | < 1.6s
========================================================================================
```

### The 40 Verified Subphases (`npm run verify:subphases`)
All 40 subphases across Stages 1 through 10 pass with 100% compliance in ~25 milliseconds.

---

## 10. Cross-Platform Deployment & Packaging Matrix

| Target Platform | Technology Stack | Deployment Artifact | Capabilities |
|---|---|---|---|
| **Web Browser (PWA)** | HTML5, CSS Grid, Vanilla JS, Service Worker | Precached via `public/sw.js` & `offlineEngine.js` | 100% offline-capable, responsive layout, zero install |
| **Desktop (Win/Mac/Linux)** | Tauri v2 (Rust backend) / Electron | [`deploy/desktop/tauri.conf.json`](file:///h:/kubelabs/deploy/desktop/tauri.conf.json) | Standalone desktop application with native window chrome |
| **Mobile (Android/iOS)** | Capacitor Native Wrapper | [`deploy/mobile/capacitor.config.json`](file:///h:/kubelabs/deploy/mobile/capacitor.config.json) | Native app packaging, mobile quick-key bar, offline sync |
| **Kubernetes (Self-Hosted)** | StatefulSet with PersistentVolumeClaim | [`deploy/kubernetes/kubelabs-k8s.yaml`](file:///h:/kubelabs/deploy/kubernetes/kubelabs-k8s.yaml) | Cloud-native deployment with health probes and SQLite WAL PV |
| **Helm 3 (Enterprise)** | Helm Chart with configurable values | [`deploy/helm/kubelabs/`](file:///h:/kubelabs/deploy/helm/kubelabs/) | Enterprise packaging supporting custom ingresses and replicas |
| **Container (OCI)** | Rootless Alpine Dockerfile | `docker build -t kubelabs:v3.0.0 .` | Lightweight container image (< 60MB), rootless security |

---

## 11. Running KubeLabs Locally & Operational Verification

### Prerequisites
- Node.js 22.5.0 or higher.
- No npm install or third-party dependencies required.

### 1. Launching the Live Server
Start the production server daemon:
```bash
npm start
```
The server will start listening on port 4100 (or the port specified by the `PORT` environment variable):
```
================================================================================
  KubeLabs v3.0 Server listening on http://127.0.0.1:4100
  Mode: Production • Database: SQLite WAL • Dependencies: 0
================================================================================
```
Open [http://localhost:4100](http://localhost:4100) in any web browser to interact with the workbench.

### 2. Operational Health Probes
```bash
# Liveness probe
curl -s http://127.0.0.1:4100/api/livez
# Output: {"status":"alive","timestamp":"2026-11-12T...","uptime":12.3}

# Readiness probe
curl -s http://127.0.0.1:4100/api/readyz
# Output: {"status":"ready","database":"connected","version":"3.0.0"}

# OpenMetrics telemetry
curl -s http://127.0.0.1:4100/metrics
```

### 3. Running Self-Audit & Test Suites
```bash
# Execute 53-check quality gate audit
npm run audit:self

# Execute 40-subphase verification ledger
npm run verify:subphases

# Execute master E2E test suite
npm test
```

---

## 12. Complete Repository Structure & File Index

```
h:\kubelabs/
├── README.md                                   # Master project overview & quickstart
├── package.json                                # Zero-dependency package manifest (v3.0.0)
├── Dockerfile                                  # Multi-stage rootless container build
├── .github/
│   ├── CODEOWNERS                              # Repository ownership rules
│   ├── PULL_REQUEST_TEMPLATE.md                # PR checklist & quality gate requirements
│   └── workflows/
│       ├── ci.yml                              # Continuous integration testing
│       ├── release.yml                         # Automated release packaging
│       ├── security-scan.yml                   # Automated zero-CVE security scanner
│       └── ci-release.yml                      # Production multi-arch build & release
├── deploy/
│   ├── desktop/
│   │   ├── tauri.conf.json                     # Tauri v2 desktop configuration
│   │   └── electron-main.js                    # Electron desktop entrypoint
│   ├── helm/kubelabs/                          # Enterprise Helm 3 deployment chart
│   ├── kubernetes/                             # High-availability Kubernetes StatefulSet
│   └── mobile/
│       └── capacitor.config.json               # Capacitor Android/iOS packaging config
├── docs/
│   ├── 01-GLOBAL-ENGINEERING-CONTRACT.md      # Global engineering rules & invariants
│   ├── 02-PRD.md                               # Comprehensive Product Requirements Doc
│   ├── 03-ARCHITECTURE.md                      # System, Data, Security & Lab Architecture
│   ├── 04-ADRS.md                              # 10 Architectural Decision Records
│   ├── 05-GITHUB-AND-CICD.md                   # Git branching & GitHub Actions standards
│   ├── 06-IMPLEMENTATION-PLAN.md               # Complete implementation roadmap
│   ├── 07-CURRICULUM-CATALOG.md                # 26 domains, 52 labs, 15 incidents, 8 capstones
│   ├── 08-OPERATIONS-AND-RUNBOOKS.md           # Production runbooks (RB-01 to RB-08)
│   ├── 11-COMPREHENSIVE-PROJECT-WALKTHROUGH.md # This complete project walkthrough
│   ├── 12-ENTERPRISE-GAP-ANALYSIS-AND-EXECUTION-PLAN.md # Gap analysis & v2 roadmap
│   └── 13-V3-STAGE-EXECUTION-BLUEPRINT.md      # Stage 1 to 5 v3.0 execution blueprint
├── plugins/                                    # 26 modular domain plugins (01 to 26)
├── public/
│   ├── css/styles.css                          # Responsive styles & theme definitions
│   ├── js/app.js                               # Interactive UI controller & SVG visualizer
│   ├── js/offlineEngine.js                     # Browser-native isomorphic fallback engine
│   ├── index.html                              # Single-page workbench interface
│   ├── manifest.json                           # PWA manifest
│   └── sw.js                                   # Service Worker precaching (v3)
├── schemas/
│   └── plugin.schema.json                      # Strict JSON schema for domain plugins
├── scripts/
│   ├── self-audit.js                           # 11-agent 53-check quality gate auditor
│   └── verify-subphases.js                     # 40-subphase validation runner
├── src/
│   ├── server.js                               # HTTP server & graceful shutdown handler
│   ├── agents/
│   │   └── orchestrator.js                     # 11-agent governance orchestrator
│   ├── api/
│   │   └── router.js                           # REST router, rate limiter & /metrics
│   ├── core/                                   # Unified Isomorphic Core Subsystems
│   │   ├── admissionController.js              # Mutating/Validating Webhooks & CEL
│   │   ├── aiMentor.js                         # Socratic mentor & CIS auditor
│   │   ├── architectureEngine.js               # Visual designer & IaC compiler
│   │   ├── autoscalingAndMeshEngine.js         # HPA v2, VPA, Karpenter & Mesh
│   │   ├── certificationEngine.js              # Ed25519 credential signing authority
│   │   ├── cloudExtensions.js                  # Helm, ArgoCD, Istio, OpenTofu, Multi-Cloud
│   │   ├── controllerManager.js                # Deployments, StatefulSets, Services, RBAC
│   │   ├── incidentEngine.js                   # 15 production incident simulations
│   │   ├── jsonPath.js                         # RFC 9535 JSONPath query evaluator
│   │   ├── multiCliDispatcher.js               # Multi-CLI command router (14 CLIs)
│   │   ├── networkingEngine.js                 # 7-hop CNI, NetPol, CoreDNS Loop, Gateway
│   │   ├── networkTracer.js                    # Virtual CNI packet tracer
│   │   ├── observabilityEngine.js              # PromQL, LogQL & SLO Burn Rate
│   │   ├── pipelineDriver.js                   # In-memory streaming pipelines & POSIX tools
│   │   ├── projectEngine.js                    # 8 multi-milestone capstone projects
│   │   ├── resourceGraph.js                    # Kubernetes Object DAG & Indexing
│   │   ├── schedulerEngine.js                  # 3-phase scheduling, taints & quotas
│   │   ├── shellParser.js                      # Bash tokenizer, AST & flag parser
│   │   ├── storageAndSecurityEngine.js         # CSI Dynamic Binding, KMS, Vault, SPIFFE
│   │   ├── terminalEngine.js                   # Sandboxed interactive terminal engine
│   │   ├── validationEngine.js                 # 18-evaluator declarative grading engine
│   │   └── yamlParser.js                       # Quote-safe multi-doc YAML parser
│   ├── db/
│   │   ├── database.js                         # Native SQLite WAL persistence tier
│   │   └── storageAdapter.js                   # VectorClock, CRDT Merger & Storage Abstraction
│   ├── engine/                                 # Compatibility bridge to src/core/
│   │   ├── aiMentor.js
│   │   ├── architectureEngine.js
│   │   ├── certificationEngine.js
│   │   ├── incidentEngine.js
│   │   ├── projectEngine.js
│   │   ├── sessionManager.js                   # Multi-tenant state isolation manager
│   │   ├── terminalEngine.js
│   │   ├── validationEngine.js
│   │   ├── virtualCluster.js                   # Virtual control plane orchestrator
│   │   └── virtualFileSystem.js
│   └── plugins/
│       └── pluginManager.js                    # Plugin discovery & career track manager
└── tests/
    ├── kubelabs.test.js                        # Master unit, E2E & solver test suite
    ├── stage1-core.test.js                     # Stage 1 Core test suite (41 tests)
    ├── stage2-core.test.js                     # Stage 2 Parsing & Pipelines (35 tests)
    ├── stage3-core.test.js                     # Stage 3 Schedulers & Engines (41 tests)
    ├── stage4-core.test.js                     # Stage 4 Curriculum & Incidents (13 tests)
    └── stage5-core.test.js                     # Stage 5 Hardening, UI & Audit (20 tests)
```
