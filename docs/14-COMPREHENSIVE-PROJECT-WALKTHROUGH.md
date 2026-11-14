# KubeLabs v4.0: Comprehensive Project Walkthrough & Technical Reference

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
> *Version 4.0.0 (Full-Stack Transformation Edition) • Zero Third-Party Runtime Dependencies (`"dependencies": {}`) • Native Node.js 22+ & SQLite WAL • 100% Offline-Capable PWA v4 & Unified Isomorphic Core • Deterministic State-Graph Evaluation • 45 Domains across 7 Tiers • 90 Interactive Labs • 25 Chaos War Room Incidents • 8 Capstones (26 Milestones) • 6 Practical Performance Certification Simulators (Dual Ed25519 & HMAC-SHA256 Signed) • 5 Primary Workspace Views • 54 Subphases (100% Verified) • 54 Automated Quality Gates across 11 Specialized Engineering Agents*

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Target-State Architecture & Unified Isomorphic Core](#2-target-state-architecture--unified-isomorphic-core)
3. [Core Engines Deep Dive (`src/core/`)](#3-core-engines-deep-dive-srccore)
4. [User Interface & Interactive Workbench (UI/UX v4.0)](#4-user-interface--interactive-workbench-uiux-v40)
5. [Master Curriculum, Incident & Capstone Catalog](#5-master-curriculum-incident--capstone-catalog)
6. [Practical Hands-On Walkthroughs](#6-practical-hands-on-walkthroughs)
7. [Local Usage, Deployment & Packaging Guide](#7-local-usage-deployment--packaging-guide)
8. [Governance, 11-Agent Quality Gate & Verification Ledger](#8-governance-11-agent-quality-gate--verification-ledger)
9. [Complete Repository Structure & File Index](#9-complete-repository-structure--file-index)

---

## 1. Executive Summary & Core Philosophy

**KubeLabs v4.0** represents the complete full-stack transformation of an enterprise-grade, standalone, zero-dependency, cross-platform learning laboratory and simulation platform for Kubernetes, the Cloud Native Computing Foundation (CNCF) ecosystem, GitOps, DevSecOps, Site Reliability Engineering (SRE), Platform Engineering, Service Mesh, High-Scale Cluster Operations, Distributed Systems, Cloud Architecture Patterns, Enterprise Architecture, and Autonomous AI-Ops.

### The Inherent Flaws of Traditional Learning Environments

| Dimension | Traditional VMs (Minikube / Kind) | Remote Ephemeral VMs (Katacoda / Killercoda) | KubeLabs v4.0 |
|---|---|---|---|
| **RAM Footprint** | 8 GB – 16 GB | 0 MB (Client) / Massive Cloud VM Host | **~45.4 MB RSS** (Idle) / **~44.8 MB** (45 Domains) |
| **Startup Latency** | 2 to 5 minutes | 30 to 90 seconds queue | **~113 milliseconds** (Instant Cold Boot) |
| **Hardware Reqs** | VT-x / AMD-V virtualization, 4+ cores | High-bandwidth internet required | Runs on budget laptops, mobile browsers, tablets |
| **Offline Capability** | Partial (requires pre-pulled Docker images) | 0% (Fails completely offline) | **100% Offline PWA** via Service Worker v4 & Isomorphic UMD Bundle |
| **Grading Model** | Fragile regex matching on shell history | Fragile bash command regex checks | **Deterministic State-Graph Reconciliation** |
| **Security Risk** | Root container escape / host exposure | Shared kernel security boundaries | **Zero Host Shell (`child_process.exec` forbidden)** |
| **Runtime Dependencies** | Hundreds of npm / OS packages | Proprietary cloud infrastructure | **Zero Third-Party Dependencies (`"dependencies": {}`)** |

### Core Architectural Breakthroughs

1. **Zero External Runtime Dependencies (`"dependencies": {}`)**:
   Everything executes exclusively on native Node.js standard libraries (`node:http`, `node:sqlite`, `node:crypto`, `node:test`, `node:fs`, `node:path`). There is zero npm supply-chain risk, zero vulnerability patching overhead, and instant installation.
2. **Microsecond Declarative Virtual Control Plane**:
   Rather than spinning up heavyweight Linux kernels and Docker daemons, KubeLabs executes an in-process Kubernetes API and reconciliation loop simulation handling Deployments, StatefulSets, DaemonSets, Services, Endpoints, NetworkPolicies, RBAC, PVC dynamic binding, CoreDNS, and taints/tolerations in under 46 MB RSS RAM.
3. **Deterministic State-Graph Validation**:
   Labs are graded against the actual reconciled cluster object graph, Prometheus metrics, and in-memory POSIX VFS state, not shell history. Whether configured through imperative CLI commands or declarative multi-document YAML manifests, only true cluster state determines success.
4. **Universal Isomorphism**:
   All core modules in `src/core/` execute identically in Node.js 22+ servers, in-browser WebWorkers, Desktop webviews (Tauri/Electron), and Mobile webviews (Capacitor), guaranteeing 100% offline parity.

---

## 2. Target-State Architecture & Unified Isomorphic Core

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PRESENTATION LAYER (v4.0)                               │
│   Responsive Multi-Platform Workbench (Web PWA v4, Desktop Tauri/Electron, Mobile)        │
│   [View 1: Paths] [View 2: Workbench] [View 3: War Room] [View 4: Arch] [View 5: Certs]  │
│   [45 Domains] [90 Labs] [25 Incidents] [8 Capstones] [6 Exams] [54 Quality Gates]        │
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
│   • SyncCoordinator: Bi-directional state sync between VFS, Editor, Terminal, & Topology  │
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
│ │  Pipes, Quotes)       │ │  Redirection |, >, >>) │ │  crictl, tofu, istioctl, 57 CLIs)│ │
│ └───────────┬───────────┘ └───────────┬────────────┘ └────────────────┬─────────────────┘ │
│             │                         │                               │                   │
│ ┌───────────▼───────────┐ ┌───────────▼────────────┐ ┌────────────────▼─────────────────┐ │
│ │    ValidationEngine   │ │     IncidentEngine     │ │      CertificationEngine         │ │
│ │ (18 Evaluator Rules,  │ │ (25 Chaos Incidents,   │ │ (6 Practical Performance Exams,  │ │
│ │  State Graph Check)   │ │  RED Sparklines, MTTR) │ │  Dual Ed25519 & HMAC Signatures) │ │
│ └───────────────────────┘ └────────────────────────┘ └──────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Engines Deep Dive (`src/core/`)

### 3.1. Virtual Cluster & Resource Graph (`virtualCluster.js` & `resourceGraph.js`)
- Full in-memory Kubernetes object store indexing resources by GVK (`Group/Version/Kind`), namespace, name, and UID.
- Implements owner-references and cascading garbage collection (e.g. deleting a Deployment cascades to its ReplicaSets and Pods).
- Direct support for 40+ Kubernetes resource kinds including CRDs (`InferenceService`, `TracingPolicy`, `ScaledObject`, `MachineDeployment`, `DatabaseCluster`, `Application`, `Kustomization`, `GitRepository`).

### 3.2. POSIX Virtual File System (`virtualFileSystem.js`)
- In-memory hierarchical filesystem supporting directories, regular files, and symlinks.
- Implements POSIX permission checking (`chmod`, `chown`, octal modes `0644`, `0755`), standard paths (`/etc/kubernetes/manifests`, `/var/log`, `/home/learner`), and streaming write redirection.

### 3.3. Deterministic Validation Engine (`validationEngine.js`)
- Evaluates multi-assertion validation rules against live virtual cluster state, metrics, and VFS files.
- Supports 18 specialized evaluators:
  1. `cluster_connectivity`: Pod-to-Pod L4/L7 connectivity.
  2. `packet_trace_blocked`: NetworkPolicy traffic blocking.
  3. `promql_query_result`: Instant PromQL time-series assertions.
  4. `rbac_can_i`: Subject permission checks (`verbs` on `resources`).
  5. `pod_security_standard`: Baseline/Restricted PSS compliance.
  6. `slo_burn_rate_within_budget`: Quantitative multi-window burn rate evaluation.
  7. `resource_count`: Quantity of resources matching label/namespace filters.
  8. `resource_field_equals`: JSONPath property validation.
  9. `resource_exists`: Resource presence assertion.
  10. `service_endpoints_ready`: Validates that service endpoints are populated by ready pods.
  11. `logql_filter_matches`: Asserts expected log entries.
  12. `hpa_target_scale_achieved`: Autoscaler target scaling verification.
  13. `vpa_recommendation_present`: Asserts recommendations exist.
  14. `karpenter_node_consolidated`: Validates node consolidation.
  15. `istio_route_matches`: Asserts canary traffic weighting.
  16. `circuit_breaker_tripped`: Asserts circuit breaker trip behavior.
  17. `vfs_file_contains`: Validates file content and regex in VFS.
  18. `dns_resolution_succeeds`: Asserts CoreDNS lookups succeed.

### 3.4. Chaos War Room Incident Engine (`incidentEngine.js`)
- 25 SEV-1/SEV-2 production outage scenarios spanning all 8 failure domains:
  - Compute, Networking, Storage, Control Plane, Security, Configuration, Scaling, GitOps.
- Injects real root causes (e.g. broken selectors, missing secrets, CFS CPU quota throttling, etcd quorum loss, CoreDNS loops, Tetragon eBPF kill loops, APF flow schema drops).
- High-resolution MTTR stopwatch tracking diagnostic and recovery duration.

### 3.5. Performance Certification Engine (`certificationEngine.js`)
- 6 role-based practical performance exam simulators (`KCNA-SIM`, `CKA-SIM`, `CKS-SIM`, `CKRE-SIM`, `CPA-SIM`, `CMAOS-SIM`).
- 100-point weighted tasks validated against live cluster state graphs.
- Issues digitally signed certificates using **asymmetric Ed25519** (`128-hex chars`) and HMAC-SHA256 (`64-hex chars`).
- Computes real-time 16-domain skill mastery radar scores.

### 3.6. Architecture Designer Engine (`architectureEngine.js`)
- 8 enterprise reference blueprints (`ref-arch-01` through `ref-arch-08`).
- Drag-and-drop node-graph studio with live pulse packet animation.
- Automated Well-Architected 4-pillar scoring (Reliability, Security, Cost Optimization, Operational Excellence).
- Single Point of Failure (SPOF) detection and vulnerability risk matrix.
- Bi-directional IaC compiler generating production-ready multi-document Kubernetes YAML and OpenTofu HCL v1.9+.

### 3.7. Socratic AI Mentor (`aiMentor.js`)
- Contextual, offline-ready coaching with 4 operational modes:
  - `hint`: Analyzes active lab rules and observed cluster state to guide the learner with probing questions.
  - `debug-error`: Performs root-cause diagnostic analysis on CrashLoopBackOff pods, pending PVCs, or missing endpoints.
  - `explain`: Concept explanation with production architectural context.
  - `security-audit`: Runs an automated 12-point CIS Kubernetes Benchmark audit on the active cluster.

---

## 4. User Interface & Interactive Workbench (UI/UX v4.0)

### 4.1. 5 Primary Application Workspace Views
The v4.0 application is organized into 5 dedicated workspace views accessible from the 64px left icon rail and universal command header:

1. **View 1: Learning Paths & Curriculum Roadmap (`view-paths`)**:
   - Hero banner with personalized "Continue Learning" shortcut.
   - Interactive 7-Tier DAG roadmap visualizing learning dependencies.
   - Domain search, difficulty filters, and slide-over Domain Syllabus Drawer.
2. **View 2: Interactive Lab Workbench (`view-workbench`)**:
   - 3-Column resizable layout (Scenario & Guidance | Terminal & Editor | Topology & Observability).
   - Monaco-style code editor with YAML syntax formatting and live cluster diffing.
   - Full-height multi-CLI terminal emulator with context-aware tab autocompletion.
   - Interactive SVG cluster topology graph with click-to-inspect resource drawer.
   - Observability tabs: PromQL chart explorer, LogQL stream tailer, and trace waterfall.
3. **View 3: Chaos War Room (`view-incidents`)**:
   - Production Incident Standby HUD and Live Fleet Health strip.
   - Live Active Incident Command Center with real-time MTTR stopwatch.
   - Real-time Prometheus RED sparklines (Rate, Errors, Duration) and SRE diagnostic clues.
   - Incident category filters (Website Down, Pod Restarting, Slow App, DNS, IAM, Storage, Networking, Node Outage).
4. **View 4: Enterprise Architecture Studio (`view-architect`)**:
   - Node-based visual architecture canvas with animated data-flow pulses.
   - 8 Production Reference Blueprints selector and cloud component palette.
   - Well-Architected Framework 4-pillar scorecard and SPOF risk matrix.
   - Bi-directional compiler: instant export to Kubernetes YAML and OpenTofu HCL.
5. **View 5: Certifications & Skill Profile (`view-certs`)**:
   - 6 Hands-on performance certification exam simulators with timed task suites.
   - 16-Domain skill mastery radar visualization.
   - Cryptographic certificate issuance and on-screen verification badge.

### 4.2. Ergonomic Accessibility & WCAG 2.1 AA Compliance
- **Skip Navigation**: Accessible `.skip-link` immediately focusing `#main-content`.
- **Keyboard Shortcuts**:
  - `Ctrl+K` / `Cmd+K`: Universal Command Palette with cyclic arrow navigation and instant action execution.
  - `Ctrl+Shift+D`: 11-Agent Diagnostics & Production Readiness modal.
  - `Escape`: Universal dismissal across all modals, drawers, and overlays.
- **Screen Reader Announcements**: Dedicated `#aria-live-announcer` (`aria-live="polite"`, `aria-atomic="true"`) announcing view transitions, terminal executions, and pane adjustments.
- **Mathematical Color Contrast**: All text styles adhere to WCAG 2.1 AA ($C \ge 4.5:1$ for regular text, $C \ge 7:1$ AAA for headers, and $21:1$ for High-Contrast mode).
- **Reduced Motion Support**: Fully respects `@media (prefers-reduced-motion: reduce)`.

---

## 5. Master Curriculum, Incident & Capstone Catalog

### 5.1. 45 Curriculum Domains across 7 Tiers (90 Labs)

| Tier | Domain IDs | Domain Title | Labs | Focus Areas |
|---|---|---|---|---|
| **Tier 1: Foundations** | `01`–`04` | Linux Fundamentals, Admin, Networking, Git | 8 | Cgroups v2, systemd, veth bridges, iptables, Git DAG |
| **Tier 2: Containers** | `05`–`08` | Docker, CRI Runtimes, Helm v3, Kustomize | 8 | Distroless OCI, crictl, Helm templates, Kustomize overlays |
| **Tier 3: K8s Core & Certs** | `09`–`15` | K8s Core, CKAD, CKA, Networking, Storage, CKS, Troubleshooting | 14 | HA Deployments, RBAC, CNI, CSI, PSS, static pods, RCA |
| **Tier 4: GitOps & IaC** | `16`–`22` | GitOps, ArgoCD, FluxCD, CI/CD, DevSecOps, IaC, OpenTofu | 14 | Pull reconciliation, sync waves, Tekton, Kyverno, Crossplane, HCL |
| **Tier 5: Mesh & O11y** | `23`–`34` | Mesh Core, Istio, Linkerd, O11y Core, Prometheus, Grafana, OTel, Loki, SRE, Chaos, Perf, Ops | 24 | Envoy xDS, mTLS, ServiceProfiles, PromQL, Grafana, OTel, Loki, SLOs, KEDA, Velero |
| **Tier 6: Platform & Sec** | `35`–`42` | K8s Ops, Multi-Cluster, Cloud Arch, Dist Systems, Microservices, System Design, Platform Eng, Security Eng | 16 | APF, CAPI, 12-factor, Raft/Sagas, Strangler Fig, Token Bucket, Backstage IDP, Tetragon |
| **Tier 7: Patterns & AI** | `43`–`45` | Cloud Patterns, Enterprise Arch, Autonomous AI-Ops | 6 | CQRS, C4 Model, FinOps Landing Zones, k8sgpt, vLLM GPU Serving |

### 5.2. 25 Chaos War Room Incidents (SEV-1/SEV-2)

- **`inc-01`**: SEV-1 Checkout Service 503 Outage (Zero Endpoints via Selector Drift)
- **`inc-02`**: SEV-1 Bad Canary Image Tag Triggering ImagePullBackOff
- **`inc-03`**: SEV-1 Billing Worker CrashLoopBackOff (Missing Secret Key)
- **`inc-04`**: SEV-2 Recommendation Engine OOMKilled Under Peak Load
- **`inc-05`**: SEV-2 Analytics Worker Stuck in Pending (Insufficient CPU Request)
- **`inc-06`**: SEV-2 Argo CD Production Fleet OutOfSync & Degraded
- **`inc-07`**: SEV-2 LLM Inference Service Pending on GPU Taint
- **`inc-08`**: SEV-1 Unprotected Production Ledger Database (Missing NetworkPolicy)
- **`inc-09`**: SEV-1 etcd Quorum Loss & Control Plane Degradation
- **`inc-10`**: SEV-1 Kyverno Webhook Blocking All Production Deployments
- **`inc-11`**: SEV-1 Cluster-Wide DNS Blackhole (CoreDNS Loop Detected)
- **`inc-12`**: SEV-2 Database Pod Stuck in Pending (Non-Existent StorageClass)
- **`inc-13`**: SEV-2 Slow Application Response & P99 Latency Spike (CFS CPU Throttling)
- **`inc-14`**: SEV-1 AWS EKS S3 Ingestion Outage (IAM IRSA Role Annotation Missing)
- **`inc-15`**: SEV-1 Worker Node NotReady & Cordoned (Kubelet Daemon Stopped)
- **`inc-16`**: SEV-1 Service Mesh Strict mTLS Traffic Drop (Missing Sidecar Proxy)
- **`inc-17`**: SEV-2 Linkerd ServiceProfile Retry Storm Rejection
- **`inc-18`**: SEV-2 Prometheus Operator Rule Evaluation Interval Invalid
- **`inc-19`**: SEV-1 KEDA ScaledObject Trigger Starvation Under Queue Spike
- **`inc-20`**: SEV-1 Disaster Recovery Velero Backup Target Unavailable
- **`inc-21`**: SEV-1 API Priority & Fairness (APF) Rate Limiting Dropping Admin Operations
- **`inc-22`**: SEV-1 Multi-Cluster Cilium ClusterMesh Network Partition
- **`inc-23`**: SEV-1 Tetragon eBPF Policy Terminating Critical Microservice Pod
- **`inc-24`**: SEV-2 CQRS Read Model Event Consumer Crash & Stale Projections
- **`inc-25`**: SEV-1 Enterprise Multi-Tenant Namespace Quota Exhaustion

### 5.3. 8 Multi-Milestone Production Capstone Projects (26 Milestones)

1. **`proj-01-hardened-edge-node`**: Hardened Linux Node, Distroless Runtime & L7 Ingress Gateway (3 Milestones, 300 XP).
2. **`proj-02-gitops-ha-commerce`**: Multi-AZ GitOps Commerce Platform with Helm, Argo CD & RBAC (3 Milestones, 300 XP).
3. **`proj-03-zero-trust-fintech`**: Zero-Trust PCI-DSS Payment Vault (NetworkPolicy + Istio mTLS + Non-Root) (3 Milestones, 300 XP).
4. **`proj-04-sre-autonomous-observability`**: High-Resilience SRE Platform (OpenTelemetry, SLO Alerting & HPA) (3 Milestones, 300 XP).
5. **`proj-05-idp-crossplane-finops`**: Internal Developer Platform (OpenTofu + Crossplane + OpenCost FinOps) (3 Milestones, 300 XP).
6. **`proj-06-multicloud-aiops-gpu`**: Multi-Cloud Federated AI Inference Platform & Autonomous AI-Ops (3 Milestones, 300 XP).
7. **`proj-07-multitenant-vcluster-platform`**: Multi-Tenant Virtual Cluster Platform with Kyverno & vCluster (4 Milestones, 400 XP).
8. **`proj-08-kserve-distributed-ai-cloud`**: Cloud-Native Distributed AI Cloud with KServe & Ray Autoscaler (4 Milestones, 400 XP).

### 5.4. 6 Practical Performance Certification Simulators

1. **`KCNA-SIM` (`perf-exam-kcna`)**: Certified Cloud-Native Associate (60 min, 4 tasks, 75% pass).
2. **`CKA-SIM` (`perf-exam-cka`)**: Certified Kubernetes Administrator (120 min, 5 tasks, 75% pass).
3. **`CKS-SIM` (`perf-exam-cks`)**: Certified Kubernetes Security Specialist (120 min, 5 tasks, 75% pass).
4. **`CKRE-SIM` (`perf-exam-ckre`)**: Certified Kubernetes Reliability Engineer (90 min, 4 tasks, 75% pass).
5. **`CPA-SIM` (`perf-exam-cpa`)**: Certified Platform Architect (90 min, 4 tasks, 75% pass).
6. **`CMAOS-SIM` (`perf-exam-cmaos`)**: Certified Multi-Cloud & AI-Ops Specialist (90 min, 4 tasks, 75% pass).

---

## 6. Practical Hands-On Walkthroughs

### Walkthrough 1: Launching & Exploring the Workbench
1. Open `http://localhost:4100` in Google Chrome or Microsoft Edge.
2. View 1 loads with the Curriculum Catalog and 7-Tier DAG Roadmap.
3. Select any domain (e.g. *Domain 09: Kubernetes Core Architecture*) and click **Launch Lab**.
4. The workbench seamlessly activates with scenario objectives, code editor, multi-CLI terminal, and live cluster topology.

### Walkthrough 2: Terminal Execution & Declarative Manifest Editing
1. Inspect running cluster workloads using the sandboxed terminal:
   ```bash
   kubectl get pods -n production
   kubectl get deployments -n production
   ```
2. Switch to the **YAML / HCL Editor** tab, view the manifest, edit replicas or probe configuration, and click **Apply to Cluster**.
3. The virtual cluster reconciles state in under 5ms and updates the interactive SVG topology immediately.
4. Click **Validate Objectives** in the top command header to verify assertions deterministically.

### Walkthrough 3: Incident Response in the Chaos War Room
1. Switch to **View 3: Incident Response War Room** (`Ctrl+K` -> `View: Chaos War Room`).
2. Select **`inc-01-selector-blackhole` (Checkout Service 503 Outage)** and click **Inject Outage**.
3. The Incident Command Center HUD illuminates red, the MTTR stopwatch starts ticking, and live RED sparklines reflect the 5xx error spike.
4. Diagnose and remediate using the terminal:
   ```bash
   kubectl get endpoints checkout-service -n production
   kubectl get pods -n production -l app=checkout-api
   kubectl set selector service checkout-service -n production app=checkout-api
   ```
5. Click **Verify Incident Recovery**. The incident engine validates endpoints binding and records achieved MTTR.

### Walkthrough 4: Designing Cloud Systems in Architecture Studio
1. Navigate to **View 4: Interactive Architecture Studio**.
2. Select a reference blueprint from the dropdown (e.g. `ref-arch-01: Enterprise Multi-Tier Microservices`).
3. Drag components across VPC tiers, inject simulated failures, and review the automated Well-Architected 4-pillar scorecard.
4. Click **Kubernetes YAML** or **OpenTofu HCL** to view generated production infrastructure code.

### Walkthrough 5: Passing a Timed Performance Certification Exam
1. Navigate to **View 5: Certifications & Skill Profile**.
2. Launch the **`CKA-SIM`** practical performance exam.
3. The 120-minute countdown starts with 5 real-world cluster administration tasks.
4. Solve tasks directly in the live cluster environment.
5. Upon completion, click **Submit & Grade Exam**. The certification engine scores all tasks against the live cluster state, issues an **Ed25519 cryptographically signed certificate**, and updates your skill mastery radar.

---

## 7. Local Usage, Deployment & Packaging Guide

### 7.1. Quick Launchers
- **Windows**: Run `kubelabs.cmd` in the repository root.
- **macOS / Linux**: Run `./kubelabs.sh`.

### 7.2. Node.js Local Execution
```bash
npm start                # Start production server (http://127.0.0.1:4100)
npm run audit:self       # Run 11-agent autonomous quality gate (54/54 PASS)
npm run verify:subphases # Verify all 54 execution subphases sequentially (< 200ms)
npm test                 # Run full deterministic test suite
```

### 7.3. Browser PWA Offline Installation
1. Visit `http://localhost:4100` in Google Chrome or Microsoft Edge.
2. Click the **Install KubeLabs** icon in the address bar.
3. KubeLabs launches in a dedicated window and operates 100% offline via Service Worker v4 (`kubelabs-offline-v4`).

### 7.4. Self-Hosting via Kubernetes & Helm
```bash
# Self-host in any Kubernetes cluster with StatefulSet and NetworkPolicy
kubectl apply -f deploy/kubernetes/kubelabs-k8s.yaml

# Or install via enterprise Helm chart
helm upgrade --install kubelabs deploy/helm/kubelabs/ -n kubelabs --create-namespace
```

---

## 8. Governance, 11-Agent Quality Gate & Verification Ledger

The platform enforces absolute architectural and operational integrity through two autonomous verification harnesses:

### 8.1. 11-Agent Autonomous PRR Quality Gate (`scripts/self-audit.js`)
Evaluates **54 quality checks** across 11 specialized autonomous engineering agents:
1. `agent-product`: PRD completeness, 6 role tracks, and 45 curriculum domains.
2. `agent-architect`: System architecture, 10 ADRs, JSON schemas, 8 reference architectures.
3. `agent-backend`: Isomorphic core modules, SQLite WAL persistence, REST routing.
4. `agent-frontend`: HTML5 glassmorphism, responsive CSS, PWA manifest, Service Worker v4.
5. `agent-kubernetes`: Control plane reconciliation, deployment scaling, endpoints binding.
6. `agent-curriculum`: Schema validation, 45 curriculum domains, 90 interactive labs.
7. `agent-devops`: Multi-OS CI/CD, GitHub workflows, release packaging, PR governance.
8. `agent-security`: Zero npm dependencies, 100% sandboxed CLI execution, parameterized SQL.
9. `agent-qa`: 100% pre-score zero assertion, 100% post-score canonical replay (90 labs & 25 incidents).
10. `agent-documentation`: Complete specification artifacts and technical indexes.
11. `agent-platform`: Low-resource memory budget (< 150MB RSS limit), zero stub markers.

### 8.2. 54-Subphase Sequential Ledger (`scripts/verify-subphases.js`)
Validates all **54 subphases** across 6 Stages and 18 Phases sequentially in under 200ms:
- **Stage 1 (Subphases 1.1.1–1.3.3)**: Shell, Terminal, VFS & Multi-CLI Binaries (9 Subphases).
- **Stage 2 (Subphases 2.1.1–2.3.3)**: Glassmorphism UI, 3-Column Layout & SVG Topology (9 Subphases).
- **Stage 3 (Subphases 3.1.1–3.3.3)**: Chaos War Room, Architecture Studio & Command Palette (9 Subphases).
- **Stage 4 (Subphases 4.1.1–4.3.3)**: Curriculum Expansion Part 2 (Domains 16–36) (9 Subphases).
- **Stage 5 (Subphases 5.1.1–5.3.3)**: Curriculum Expansion Part 3 (Domains 37–45), Capstones, Exams & PWA (9 Subphases).
- **Stage 6 (Subphases 6.1.1–6.3.3)**: End-to-End Deterministic Gates, Anti-Stub Audits, WCAG 2.1 AA, Benchmarks & Documentation (9 Subphases).

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
│   │   └── src/main.rs                         # Rust host entrypoint
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
│   ├── 07-CURRICULUM-CATALOG.md                # 45-domain curriculum catalog
│   ├── 08-OPERATIONS-AND-RUNBOOKS.md           # Production runbooks RB-01 to RB-08
│   ├── 09-SECURITY-AND-THREAT-MODEL.md         # STRIDE threat model v4.0.0
│   ├── 10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md # Empirical latency & RAM metrics
│   ├── 13-V3-STAGE-EXECUTION-BLUEPRINT.md      # Staged execution blueprint
│   ├── 14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md # This document
│   └── 15-V4-SUBPHASE-TRACKING-LEDGER.md       # 54-subphase verification ledger
├── plugins/                                    # Legacy domain JSON plugins
├── public/
│   ├── index.html                              # Responsive 5-view workbench UI
│   ├── manifest.json                           # PWA standalone manifest
│   ├── sw.js                                   # Offline caching Service Worker v4
│   ├── css/
│   │   └── styles.css                          # Modern glassmorphism stylesheet
│   └── js/
│       ├── app.js                              # Client-side workbench controller
│       ├── offlineEngine.js                    # Compiled isomorphic core bundle (756KB)
│       ├── autocompletionEngine.js             # Context-aware tab autocompletion
│       ├── syncCoordinator.js                 # Bi-directional state coordinator
│       └── terminalEmulator.js                 # Terminal emulator view component
├── schemas/
│   └── plugin.schema.json                      # Strict JSON schema for domain plugins
├── scripts/
│   ├── bundle-isomorphic.js                    # Isomorphic UMD bundler
│   ├── generate-curriculum-doc.js              # Curriculum documentation generator
│   ├── open-browser.js                         # Cross-platform browser launcher
│   ├── package-release.js                      # Universal distribution packager
│   ├── self-audit.js                           # 11-agent self-audit runner (54 checks)
│   └── verify-subphases.js                     # 54-subphase verification ledger
├── src/
│   ├── server.js                               # HTTP server & graceful drain handler
│   ├── agents/
│   │   └── orchestrator.js                     # 11-agent governance engine
│   ├── api/
│   │   └── router.js                           # REST API & probe router
│   ├── core/                                   # Unified isomorphic engines
│   │   ├── admissionController.js              # Webhooks & CEL validation
│   │   ├── aiMentor.js                         # Socratic coaching & CIS auditor
│   │   ├── architectureEngine.js               # Blueprints & WAF 4-pillar scorer
│   │   ├── certificationEngine.js              # 6 practical performance exams & Ed25519
│   │   ├── cliFormatter.js                     # Multi-line ASCII table renderer
│   │   ├── controllerManager.js                # Deployment & endpoints controllers
│   │   ├── incidentEngine.js                   # 25 Chaos War Room outage scenarios
│   │   ├── jsonPath.js                         # RFC 9535 JSONPath evaluator
│   │   ├── networkingEngine.js                 # CNI, CoreDNS & NetworkPolicies
│   │   ├── projectEngine.js                    # 8 Capstone projects (26 milestones)
│   │   ├── resourceGraph.js                    # Object DAG & cascading GC
│   │   ├── schedulerEngine.js                  # Taints, tolerations & node affinity
│   │   ├── shellParser.js                      # AST tokenizer, pipes & redirects
│   │   ├── syncCoordinator.js                 # Bi-directional VFS & topology sync
│   │   ├── terminalEngine.js                   # 57 sandboxed multi-CLI binaries
│   │   ├── validationEngine.js                 # 18 deterministic assertion evaluators
│   │   ├── virtualCluster.js                   # In-memory Kubernetes API server
│   │   ├── virtualFileSystem.js                # POSIX in-memory filesystem
│   │   └── yamlParser.js                       # Multi-document quote-safe parser
│   ├── curriculum/
│   │   └── domains/                            # 45 technology domain JSON plugins
│   └── db/
│       ├── database.js                         # Native SQLite WAL persistence
│       └── storageAdapter.js                   # CRDT VectorClock & HLC engine
├── tests/                                      # Master & stage test suites
├── capacitor.config.json                       # Root Capacitor config
├── docker-compose.yml                          # Rootless Docker Compose setup
├── Dockerfile                                  # Hardened multi-stage Dockerfile
├── kubelabs.cmd                                # Windows 1-click desktop launcher
├── kubelabs.sh                                 # Linux/macOS 1-click launcher
├── package.json                                # Zero-dependency configuration
└── README.md                                   # Project introduction & quickstart
```
