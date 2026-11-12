# KubeLabs — Enterprise Kubernetes & Cloud-Native Lab Platform (v3.0)

**KubeLabs** is a standalone, ultra-low-resource (`< 49MB` RSS RAM, `< 120ms` cold boot), 100% offline-capable, cross-platform (Web/PWA, Windows, Linux, macOS, Android, iOS) Learn-by-Doing Kubernetes & Cloud-Native Engineering Platform with **zero third-party runtime dependencies** (`"dependencies": {}`).

---

## Key Capabilities

1. **26 Modular Technology Domains (`plugins/*.json`)**:
   - Linux Fundamentals, Containers & OCI Runtimes, Cloud-Native Networking (CNI/eBPF), Kubernetes Core, CNCF Packaging (Helm/Kustomize/Operators), GitOps & Progressive Delivery (Argo CD/Rollouts), DevOps CI/CD, DevSecOps & Runtime Security (NetworkPolicies/Trivy/Falco/Cosign), Service Mesh (Istio mTLS), Observability (Prometheus/OpenTelemetry/Grafana), SRE & Chaos Engineering, Platform Engineering (Backstage/Crossplane), Infrastructure as Code (OpenTofu/Terraform), AWS (EKS/Karpenter/IRSA), Azure (AKS) & GCP (GKE), AI-Ops & GPU Workloads, Emerging Tech (Wasm/eBPF Tetragon & FinOps/Green Cloud), Control Plane Lifecycle & etcd Disaster Recovery, Gateway API & Cilium eBPF, Policy as Code (Kyverno & CEL), Autoscaling & Node Consolidation (KEDA & Karpenter), Storage & CSI VolumeSnapshots (Velero DR), Multi-Tenancy & Virtual Clusters (vCluster & Crossplane), Zero-Trust Workload Attestation & External Secrets (SPIFFE/SPIRE & ESO), and Cloud-Native AI/ML & Distributed Model Serving (Kubeflow & KServe).

2. **Unified Isomorphic Core Engine (`src/core/`)**:
   - Pure ES2024 modules with zero Node.js-specific runtime globals. Executes identically inside Node.js 22+, Browser WebWorkers, Desktop WebViews, and Mobile hybrid containers.
   - Comprehensive modules: `admissionController.js`, `controllerManager.js`, `networkingEngine.js`, `resourceGraph.js`, `schedulerEngine.js`, `shellParser.js`, `terminalEngine.js`, `validationEngine.js`, `virtualFileSystem.js`, `yamlParser.js`, `jsonPath.js`, `incidentEngine.js`, `projectEngine.js`, `architectureEngine.js`, `aiMentor.js`, and `certificationEngine.js`.

3. **In-Memory POSIX Virtual File System & Multi-Tenant Session Isolation**:
   - `VirtualFileSystem` provides sandboxed in-memory filesystem emulation (`/etc/kubernetes/manifests/`, `/var/lib/etcd/`, `/home/learner/`, etc.) with permissions (`chmod`/`chown`), symlinks, and stream redirection (`>`, `>>`).
   - `SessionManager` isolates virtual clusters and terminal states per session (`X-KubeLabs-Session` header) backed by native SQLite WAL persistence and vector-clock CRDT state synchronization.

4. **Sandboxed Multi-CLI Built-In Terminal**:
   - Supports `kubectl`, `helm`, `docker`, `crictl`, `argocd`, `flux`, `istioctl`, `linkerd`, `consul`, `tofu`, `terraform`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `opa`, `conftest`, `chaos`, `litmusctl`, `aiops`, `etcdctl`, `kubeadm`, `velero`, `kyverno`, `vcluster`, `crossplane`, and POSIX/Networking utilities (`cat`, `ls`, `mkdir`, `rm`, `cp`, `grep`, `awk`, `sed`, `jq`, `curl`, `dig`, `systemctl`, `journalctl`).

5. **52 Interactive Hands-On Labs, 15 Live Outages & 8 Multi-Milestone Capstone Projects**:
   - Every lab, incident, and capstone is verified by a **Deterministic Multi-Assertion Validation Engine** evaluating the actual reconciled resource graph, metrics, and VFS state—never brittle terminal history regex.

6. **Visual UI Architecture Designer & 8 Enterprise Reference Architectures**:
   - Interactive topology builder with automated Well-Architected 4-Pillar scoring, Single Point of Failure (SPOF) detection, bi-directional Kubernetes YAML + OpenTofu HCL compilation, and one-click deployment.

7. **Contextual Socratic AI Mentor & CIS Kubernetes Security Auditor**:
   - Works 100% offline with 4 coaching modes: Socratic Hint, Debug Cluster Error, Explain Concept, and CIS Benchmark Security Audit.

8. **Ed25519 Asymmetric Cryptographic Credentials & Public Key API**:
   - 6 role-based career certification exams issuing **Ed25519** and HMAC-SHA256 verifiable credentials with `GET /api/certifications/public-key` and `POST /api/certifications/verify`.

9. **Production Observability, Probes & Hardened Security Perimeter**:
   - Prometheus OpenMetrics `/metrics` endpoint, Kubernetes `/api/livez` and `/api/readyz` probes, token-bucket rate limiter (`180 req/min/IP`), strict Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), and graceful `SIGTERM` connection draining.

10. **100% Offline Simulation Parity & Responsive Multi-Device Workbench**:
    - Complete isomorphic offline engine bundled into `public/js/offlineEngine.js` and cached via Service Worker `public/sw.js` (`kubelabs-offline-v3`).
    - Responsive split-pane resizable layout, mobile-first virtual quick-keybar with one-tap touch keys (≥ 44x44px touch targets), WCAG 2.1 AA high-contrast focus rings, and live SVG directed topology graph.

---

## Quickstart

```bash
# 1. Start the Standalone Production Server (Default: http://127.0.0.1:4100)
npm start

# 2. Run the 11-Agent Autonomous Governance Quality Gate (53/53 Checks PASS)
npm run audit:self

# 3. Verify all 40 Execution Subphases Sequentially
npm run verify:subphases

# 4. Run the Full End-to-End Deterministic Solver Suite
npm test

# 5. Run Individual Stage Verification Test Suites
npm run test:stage1  # Core, VFS, YAML, Storage, Controllers (41 tests)
npm run test:stage2  # Shell AST, Streaming Pipelines, Scheduler, Network, CSI (35 tests)
npm run test:stage3  # Multi-CLI, Observability, Autoscaling, 18 Evaluators (41 tests)
npm run test:stage4  # 26 Plugins, 15 Incidents, 8 Capstones, Ed25519 (13 tests)
npm run test:stage5  # UI Workbench, Offline Engine, Server Hardening (20 tests)
```

---

## Cross-Platform Packaging & Deployment Matrix

| Platform | Technology Stack | Deployment Artifact |
|---|---|---|
| **Web PWA** | HTML5, CSS Grid, Vanilla JS, Service Worker | Precached via `public/sw.js` (`kubelabs-offline-v3`) & `offlineEngine.js` |
| **Kubernetes (Self-Hosted)** | StatefulSet with PersistentVolume & ClientIP Affinity | [`deploy/kubernetes/kubelabs-k8s.yaml`](deploy/kubernetes/kubelabs-k8s.yaml) |
| **Helm 3 (Enterprise)** | Helm Chart with configurable values | [`deploy/helm/kubelabs/`](deploy/helm/kubelabs/) |
| **Desktop (Win/Mac/Linux)** | Tauri v2 (Rust) & Electron | [`deploy/desktop/tauri.conf.json`](deploy/desktop/tauri.conf.json), [`electron-main.js`](deploy/desktop/electron-main.js) |
| **Mobile (Android/iOS)** | Capacitor 6 Native Wrapper with Virtual Keybar | [`deploy/mobile/capacitor.config.json`](deploy/mobile/capacitor.config.json) |
| **Container (OCI)** | Rootless Alpine Multi-Stage Container | `docker build -t kubelabs:v3.0 .` (under 60MB image) |

---

## Documentation Index

- [Global Engineering Contract (GEC-v3.0)](docs/01-GLOBAL-ENGINEERING-CONTRACT.md)
- [Product Requirements Document (PRD)](docs/02-PRD.md)
- [System, Component, Security, Data & Lab Architecture](docs/03-ARCHITECTURE.md)
- [Architecture Decision Records (ADRs)](docs/04-ADRS.md)
- [GitHub Organization, Repo Structure & CI/CD](docs/05-GITHUB-AND-CICD.md)
- [Phased Implementation Plan (Stage → Phase → Subphase)](docs/06-IMPLEMENTATION-PLAN.md)
- [Master Curriculum Catalog (26 Domains, 52 Labs, 15 Incidents, 8 Capstones)](docs/07-CURRICULUM-CATALOG.md)
- [Operational Runbooks, Deployment Guides & PRR](docs/08-OPERATIONS-AND-RUNBOOKS.md)
- [Comprehensive Project Walkthrough](docs/11-COMPREHENSIVE-PROJECT-WALKTHROUGH.md)
- [Staged Technical Execution Blueprint](docs/13-V3-STAGE-EXECUTION-BLUEPRINT.md)
- [11-Agent Autonomous Engineering Framework](agents/AGENT-FRAMEWORK.md)
