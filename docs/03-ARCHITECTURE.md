# System, Component, Security, Data & Lab Architecture

**Document ID**: ARCH-KUBELABS-2026-001  
**Version**: 1.0.0  
**Status**: Production Reference

---

## 1. High-Level System Architecture

KubeLabs employs a **Dual-Mode Hybrid Execution Architecture**:
1. **Local Full-Stack Server Mode** (Node.js HTTP Server + `node:sqlite` + Stateful Virtual Cluster Engine) for desktop, CLI, container, and self-hosted deployments.
2. **Offline Client-Side Mirror Mode** (Service Worker + In-Browser State Synchronizer) enabling seamless operation on mobile devices (Android/iOS PWA) or disconnected environments.

```mermaid
flowchart TB
    subgraph Clients["Cross-Platform Client Layer (Web, Windows, macOS, Linux, Android, iOS)"]
        UI["Unified Workspace UI (Responsive Grid + ARIA)"]
        TERM["Interactive Multi-CLI Terminal"]
        YAML["Manifest & IaC Code Editor"]
        ARCH["Visual Architecture Designer Canvas"]
        INC["Incident Command Center & Chaos Console"]
        MENTOR["Contextual Socratic AI Mentor UI"]
        SW["Offline Service Worker & Local State Cache"]
    end

    subgraph CoreAPI["KubeLabs API & Security Gateway (Zero-Dependency Node HTTP)"]
        ROUTER["REST API Router & Static Asset Server"]
        SEC["Security Middleware (CSP, Input Sanitizer, Rate Guard)"]
    end

    subgraph Engine["Core Simulation & Intelligence Engines"]
        VCE["Stateful Virtual Cluster & Cloud Engine (src/engine/virtualCluster.js)"]
        CLI["Multi-CLI Parser & Executor (src/engine/terminalEngine.js)"]
        VAL["Deterministic Validation Engine (src/engine/validationEngine.js)"]
        SIM["Incident & Chaos Injection Engine (src/engine/incidentEngine.js)"]
        ADE["Architecture Analyzer & IaC Generator (src/engine/architectureEngine.js)"]
        AIM["Socratic AI Mentor & CIS Auditor (src/engine/aiMentor.js)"]
        CERT["Assessment & Cryptographic Certification Engine (src/engine/certificationEngine.js)"]
    end

    subgraph Extensibility["Modular Plugin & Data Layer"]
        PM["Plugin Manager & Schema Validator (src/plugins/pluginManager.js)"]
        PLUGINS["16 Domain Plugins (plugins/*.json)"]
        SQLITE[("SQLite Persistence Engine (node:sqlite)")]
    end

    UI --> ROUTER
    TERM --> ROUTER
    YAML --> ROUTER
    ARCH --> ROUTER
    INC --> ROUTER
    MENTOR --> ROUTER
    UI <--> SW

    ROUTER --> SEC
    SEC --> VCE
    SEC --> CLI
    SEC --> VAL
    SEC --> SIM
    SEC --> ADE
    SEC --> AIM
    SEC --> CERT
    SEC --> PM

    CLI --> VCE
    VAL --> VCE
    SIM --> VCE
    AIM --> VCE
    AIM --> VAL
    PM --> PLUGINS
    VCE <--> SQLITE
    CERT <--> SQLITE
```

---

## 2. Component Architecture

### 2.1 Stateful Virtual Cluster & Cloud Engine (`src/engine/virtualCluster.js`)
Rather than spinning up a 4GB RAM virtual machine for every lab, KubeLabs implements a deterministic **In-Memory + SQLite-Persisted Control Plane & Controller Manager**:
- **Resource Store**: Indexed by `apiVersion`, `kind`, `metadata.namespace`, and `metadata.name`.
- **Reconciliation Loop (`reconcile()`)**:
  - **Deployment Controller**: Automatically creates/updates child `ReplicaSet` and `Pod` objects matching `.spec.replicas` and `.spec.template`.
  - **Scheduler Simulator**: Evaluates Pod CPU/Memory requests against Node allocatable capacity, `nodeSelector`, and `taints`/`tolerations`. Sets Pod status to `Running`, `Pending` (`0/3 nodes are available: Insufficient cpu/memory`), `ImagePullBackOff` (when image tag is invalid/broken), `CrashLoopBackOff` (when command/env/secret reference fails), or `OOMKilled`.
  - **EndpointSlice Controller**: Evaluates `Service.spec.selector` against running Pods in the same namespace. Populates live endpoints (`10.244.x.y:port`) or leaves `0 endpoints` when labels mismatch.
  - **NetworkPolicy Evaluator**: Computes ingress/egress allow matrices between pods across namespaces.
  - **Cloud & IaC State Graph**: Tracks OpenTofu/Terraform resources (`aws_eks_cluster`, `aws_s3_bucket`, `azurerm_kubernetes_cluster`, `google_container_cluster`), Helm releases, Argo CD `Application` sync/health status, Istio `VirtualService`/`DestinationRule` traffic weights, and Prometheus alerts.

### 2.2 Multi-CLI Terminal Engine (`src/engine/terminalEngine.js`)
Parses command lines with support for flags (`-n`, `--namespace`, `-o`, `-l`, `--replicas`, `-f`), pipes (`| grep`), and heredocs/inline manifests.
- Supported binaries: `kubectl`, `helm`, `docker`, `crictl`, `argocd`, `istioctl`, `tofu`, `terraform`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `aiops`, `ls`, `cat`, `grep`, `ps`, `top`, `df`, `free`, `ip`, `ss`, `ping`, `curl`, `dig`, `nslookup`, `systemctl`, `journalctl`, `uname`, `whoami`, `id`, `help`, `clear`.

### 2.3 Deterministic Validation Engine (`src/engine/validationEngine.js`)
Executes a declarative list of validation checks defined in each lab or incident scenario:
```mermaid
sequenceDiagram
    participant Learner
    participant API as Validation API
    participant ValEngine as ValidationEngine
    participant Cluster as VirtualCluster
    participant DB as SQLite Store

    Learner->>API: POST /api/labs/:id/validate
    API->>Cluster: Reconcile controllers & endpoints
    API->>ValEngine: evaluate(lab.validationRules, clusterState, commandHistory)
    loop Every Validation Assertion
        ValEngine->>Cluster: Query resource / field / status / endpoints / logs
        ValEngine-->>ValEngine: Record pass/fail + diagnostic remediation hint
    end
    alt All Assertions Passed
        ValEngine->>DB: Mark lab completed, award XP, update domain radar, sign completion hash
    end
    ValEngine-->>Learner: Return structured validation report + progress update
```

### 2.4 Incident Simulation Engine (`src/engine/incidentEngine.js`)
Injects multi-layered production faults into the virtual cluster and tracks learner diagnostic workflow and Mean Time To Recovery (MTTR):
- **Fault Types**: Bad container image rollout, missing Secret/ConfigMap key causing `CrashLoopBackOff`, Service selector mismatch causing 503 Bad Gateway, restrictive `NetworkPolicy` blocking database egress, CoreDNS upstream misconfiguration, Istio `DestinationRule` mTLS conflict, Pod memory limit `OOMKilled`, Terraform production drift.

### 2.5 Visual Architecture Designer Engine (`src/engine/architectureEngine.js`)
Manages node-and-edge cloud-native topologies:
- Translates visual nodes (`ingress`, `waf`, `service`, `deployment`, `statefulset`, `database`, `cache`, `mesh`, `gitops`, `observability`, `iac`, `cloud-vpc`, `gpu-pool`) into valid Kubernetes YAML and OpenTofu HCL.
- Performs automated **Well-Architected Review** across 5 pillars: Reliability, Security, Operational Excellence, Performance Efficiency, and Cost Optimization.

---

## 3. Security Architecture

```mermaid
flowchart TD
    REQ["Incoming Client HTTP Request / CLI Input"] --> SIZE["Payload Size Guard (<= 1MB)"]
    SIZE --> HEADERS["Security Header Injector (CSP, X-Frame-Options, Nosniff)"]
    HEADERS --> SANITIZE["Input Schema & Type Validator"]
    SANITIZE --> SANDBOX["Sandboxed Virtual Execution (Zero Host OS Shell Access)"]
    SANDBOX --> SQL["Parameterized SQLite Prepared Statements"]
```

- **Isolation Boundary**: User terminal commands are tokenized and executed strictly against the in-memory/SQLite virtual cluster state tree. No child process (`child_process.exec` or `spawn`) is ever invoked from user input.
- **Cryptographic Verification**: Exam and lab completion certificates are signed with HMAC-SHA256 using `node:crypto` so learners and employers can verify authenticity.

---

## 4. Data Architecture & Schema (`src/db/database.js`)

KubeLabs uses Node's built-in `node:sqlite` (`DatabaseSync`) with WAL mode enabled for high concurrency and zero external dependencies:

```mermaid
erDiagram
    LEARNER_PROFILE ||--o{ LAB_PROGRESS : tracks
    LEARNER_PROFILE ||--o{ INCIDENT_RUNS : resolves
    LEARNER_PROFILE ||--o{ ASSESSMENT_ATTEMPTS : takes
    LEARNER_PROFILE ||--o{ CERTIFICATES : earns
    LEARNER_PROFILE ||--o{ SAVED_ARCHITECTURES : designs
    LEARNER_PROFILE ||--o{ TERMINAL_HISTORY : executes

    LEARNER_PROFILE {
        string id PK
        string display_name
        int xp
        int streak_days
        string active_lab_id
        string cluster_snapshot_json
        string updated_at
    }
    LAB_PROGRESS {
        string lab_id PK
        string domain_id
        string status
        int score
        int attempts
        string completed_at
        string verification_hash
    }
    INCIDENT_RUNS {
        string incident_id PK
        string status
        int mttr_seconds
        int hints_used
        string resolved_at
    }
    ASSESSMENT_ATTEMPTS {
        string attempt_id PK
        string track_id
        int score_percent
        boolean passed
        string domain_breakdown_json
        string created_at
    }
    CERTIFICATES {
        string cert_id PK
        string track_id
        string title
        string learner_name
        int score_percent
        string signature_sha256
        string issued_at
    }
    SAVED_ARCHITECTURES {
        string arch_id PK
        string name
        string description
        string nodes_json
        string edges_json
        int score
        string updated_at
    }
```

---

## 5. Modular Plugin Architecture (`schemas/plugin.schema.json`)

Every curriculum domain is packaged as a self-contained, schema-validated JSON plugin under `plugins/<domain-id>.json`. Adding a new technology (e.g., WebAssembly on Kubernetes, Quantum Cloud, eBPF Cilium Tetragon) requires **zero changes** to the core platform—simply drop a compliant JSON plugin into `plugins/`.

Each plugin defines:
- `id`, `title`, `category`, `version`, `icon`, `difficulty`, `estimatedHours`
- `prerequisites`: Array of domain IDs
- `learningObjectives`: Measurable outcomes
- `curriculumModules`: Deep theoretical and architectural lessons with production patterns
- `labs`: Interactive hands-on labs with `initialClusterState`, `starterManifest`, `steps`, `validationRules`, `solutionCommands`, `troubleshootingHint`, and `productionScenario`
- `assessmentQuestions`: Scenario and performance-based questions for certification exams

---

## 6. Module Dependency, API-Flow & Data-Flow Diagrams

### 6.1 Module Dependency Graph

```mermaid
flowchart LR
    SRV["src/server.js"] --> RTR["src/api/router.js"]
    SRV --> DB["src/db/database.js"]
    SRV --> PM["src/plugins/pluginManager.js"]
    SRV --> SM["src/engine/sessionManager.js"]
    SRV --> VCE["src/engine/virtualCluster.js"]
    SRV --> TE["src/engine/terminalEngine.js"]
    SRV --> VE["src/engine/validationEngine.js"]
    SRV --> IE["src/engine/incidentEngine.js"]
    SRV --> PE["src/engine/projectEngine.js"]
    SRV --> AE["src/engine/architectureEngine.js"]
    SRV --> AIM["src/engine/aiMentor.js"]
    SRV --> CE["src/engine/certificationEngine.js"]
    SRV --> AO["src/agents/orchestrator.js"]

    SM --> VCE
    SM --> TE
    SM --> VFS["src/engine/virtualFileSystem.js"]
    SM --> DB
    TE --> VCE
    TE --> VFS
    IE --> VE
    PE --> VE
    CE --> DB
    CE --> PM
```

### 6.2 Multi-Tenant Session & Offline Sync Data-Flow

```mermaid
sequenceDiagram
    participant Browser as Client (Web / Tauri / Capacitor)
    participant Router as ApiRouter (RateLimiter + W3C Traceparent)
    participant Sess as SessionManager (X-KubeLabs-Session)
    participant Cluster as VirtualCluster + VFS
    participant SQLite as SQLite WAL Store

    Browser->>Router: HTTP Request (+ X-KubeLabs-Session header)
    Router->>Router: Inject Traceparent, CSP & Security Headers, Check RateLimiter
    Router->>Sess: getSession(sessionId)
    alt Session Not in Memory
        Sess->>SQLite: getSessionSnapshot(sessionId)
        Sess->>Cluster: Hydrate VirtualCluster & VirtualFileSystem
    end
    Router->>Cluster: Execute CLI / Reconcile / Validate
    Sess->>SQLite: saveSessionSnapshot(sessionId, cluster, vfs)
    Router-->>Browser: JSON Response + Cluster Topology State
```


