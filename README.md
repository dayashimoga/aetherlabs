# KubeLabs — Enterprise Kubernetes & Cloud-Native Lab Platform (v4.0)

[![Quality Gate](https://img.shields.io/badge/Quality%20Gate-54%2F54%20PASS-brightgreen?style=flat-square)](scripts/self-audit.js)
[![Subphases](https://img.shields.io/badge/Subphases-54%2F54%20VERIFIED-blue?style=flat-square)](docs/15-V4-SUBPHASE-TRACKING-LEDGER.md)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0%20runtime-success?style=flat-square)](package.json)
[![Cold Boot](https://img.shields.io/badge/cold%20boot-%3C%20115ms-blueviolet?style=flat-square)](docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md)
[![Memory RSS](https://img.shields.io/badge/memory%20RSS-%3C%2046MB-informational?style=flat-square)](docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md)
[![Offline Parity](https://img.shields.io/badge/offline%20engine-100%25%20PWA%20v4-orange?style=flat-square)](public/sw.js)
[![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey?style=flat-square)](LICENSE)

**KubeLabs v4.0** is an enterprise-grade, standalone, ultra-low-resource (`< 46MB` idle RSS RAM, `< 115ms` cold boot), 100% offline-capable, cross-platform (Web/PWA, Windows, Linux, macOS, Android, iOS) Learn-by-Doing Kubernetes & Cloud-Native Engineering Platform with **zero third-party runtime dependencies** (`"dependencies": {}`).

---

## Key Capabilities (v4.0 Full-Stack Transformation)

1. **45 Modular Technology Domains across 7 Tiers (`src/curriculum/domains/*.json`)**:
   - **Tier 1 (Foundations)**: Linux Fundamentals & Pipelines (`linux-fundamentals`), Linux Admin & Cgroups v2 (`linux-admin`), Networking Fundamentals & Packet Filtering (`networking-fundamentals`), Git Internals & DAG (`git-fundamentals`).
   - **Tier 2 (Container Runtime & Packaging)**: Docker & OCI (`docker-containers`), Container Runtimes & CRI (`container-runtime-cri`), Helm v3 Packaging (`helm-packaging`), Kustomize Manifests (`kustomize-manifests`).
   - **Tier 3 (Kubernetes Core & Certifications)**: Kubernetes Core Architecture (`kubernetes-core-v4`), CKAD Application Developer (`ckad-developer`), CKA Cluster Administrator (`cka-administrator`), Kubernetes Networking & CNI (`k8s-networking`), Kubernetes Storage & CSI (`k8s-storage`), CKS Security & Defense (`k8s-security-cks`), Kubernetes Troubleshooting & RCA (`k8s-troubleshooting`).
   - **Tier 4 (GitOps, CI/CD & IaC)**: GitOps Delivery (`gitops-delivery`), Argo CD GitOps (`argocd-gitops`), FluxCD GitOps (`fluxcd-gitops`), CI/CD Pipelines & DORA (`cicd-pipelines`), DevSecOps & Kyverno (`devsecops-pipeline`), IaC & Crossplane (`iac-foundations`), Terraform & OpenTofu (`terraform-opentofu`).
   - **Tier 5 (Service Mesh, Observability & Reliability)**: Service Mesh Core & Envoy (`service-mesh-core`), Istio Service Mesh (`istio-service-mesh`), Linkerd Service Mesh (`linkerd-service-mesh`), Observability Core (`observability-core`), Prometheus Monitoring (`prometheus-monitoring`), Grafana Visualization (`grafana-visualization`), OpenTelemetry Traces (`opentelemetry-traces`), Logging & Loki (`logging-monitoring`), SRE Incident Recovery (`sre-incident-recovery`), Platform Reliability & Chaos (`platform-reliability`), Performance Engineering & CFS Throttling (`performance-engineering`), Production Operations & Velero DR (`production-operations`).
   - **Tier 6 (Advanced Ops, Architecture, Platform & Security)**: K8s Production Operations & APF (`k8s-production-operations`), Multi-Cluster Management & Cluster API (`multi-cluster-management`), Cloud-Native Architecture & 12-Factor (`cloud-native-architecture`), Distributed Systems & Raft/Sagas (`distributed-systems`), Microservices & Strangler Fig (`microservices-architecture`), System Design & Capacity Planning (`system-design`), Platform Engineering & Backstage IDP (`platform-engineering`), Security Engineering & SPIFFE/Tetragon (`security-engineering`).
   - **Tier 7 (Cloud Patterns, Enterprise & Autonomous AI-Ops)**: Cloud Architecture Patterns & CQRS (`cloud-architecture-patterns`), Enterprise Architecture & C4 Model (`enterprise-architecture`), Autonomous AI-Ops & GPU Serving (`aiops-autonomous`).

2. **90 Interactive Hands-On Labs (2 Per Domain)**:
   - Every lab is verified by a **Deterministic Multi-Assertion Validation Engine** evaluating the actual reconciled virtual cluster resource graph, Prometheus metrics, and in-memory POSIX VFS state—never brittle terminal history regex.
   - 100% pre-solution zero-score assertion and 100% post-solution canonical pass rate verified across all 90 labs.

3. **6 Guided Role Learning Tracks**:
   - `track-foundations`: Cloud-Native Systems Foundations (Linux, Containers, Networking).
   - `track-k8s-admin`: Kubernetes, CNCF, GitOps & CI/CD Administrator (CKA/CKAD track).
   - `track-devsecops`: DevSecOps, Zero-Trust & Service Mesh Specialist (CKS track).
   - `track-sre`: Site Reliability, Observability & Chaos Engineering (SLOs, Prometheus, SRE).
   - `track-platform`: Platform Engineering, IaC & Cloud FinOps Architect (IDP, Backstage, Crossplane).
   - `track-multicloud-aiops`: Multi-Cloud, Cloud Architecture Patterns & Autonomous AI-Ops.

4. **6 Hands-On Practical Performance Certification Simulators**:
   - `KCNA-SIM` (`perf-exam-kcna`): Certified Cloud-Native Associate (60 min, 4 tasks).
   - `CKA-SIM` (`perf-exam-cka`): Certified Kubernetes Administrator (120 min, 5 tasks).
   - `CKS-SIM` (`perf-exam-cks`): Certified Kubernetes Security Specialist (120 min, 5 tasks).
   - `CKRE-SIM` (`perf-exam-ckre`): Certified Kubernetes Reliability Engineer (90 min, 4 tasks).
   - `CPA-SIM` (`perf-exam-cpa`): Certified Platform Architect (90 min, 4 tasks).
   - `CMAOS-SIM` (`perf-exam-cmaos`): Certified Multi-Cloud & AI-Ops Specialist (90 min, 4 tasks).
   - Real-time stopwatch countdown, timed tasks, fault-injected initial cluster state, and **dual Ed25519 asymmetric and HMAC-SHA256 cryptographic credential signing** on passing score ($\ge 75\%$).

5. **25 Production Chaos War Room Incidents (SEV-1/SEV-2)**:
   - Comprehensive incident response simulation across all 8 failure domains: Compute, Networking, Storage, Control Plane, Security, Configuration, Scaling, and GitOps.
   - Real-time Incident Command Center HUD with MTTR stopwatch, Prometheus RED sparklines, and contextual SRE diagnostic clues.

6. **8 Multi-Milestone Production Capstone Projects (26 Milestones)**:
   - Real-world production engineering projects: Hardened Linux Node, GitOps E-Commerce, Zero-Trust PCI-DSS Payment Vault, SRE Observability Platform, Internal Developer Platform, Multi-Cloud AI Platform, Virtual Cluster Platform, and Distributed AI Cloud.

7. **5 Primary Workspace Views (UI/UX v4.0)**:
   - **View 1 (`view-paths`)**: Curriculum Catalog, 7-Tier DAG Roadmap & Syllabus Drawer.
   - **View 2 (`view-workbench`)**: 3-Column Resizable IDE, Monaco Editor, Multi-CLI Terminal, SVG Topology & Observability Tabs.
   - **View 3 (`view-incidents`)**: Chaos War Room Incident Command Center, Category Filtering & Live Fleet Strip.
   - **View 4 (`view-architect`)**: Architecture Studio Canvas, 8 Reference Blueprints, WAF 4-Pillar Analyzer & YAML/OpenTofu Compilers.
   - **View 5 (`view-certs`)**: Performance Certification Simulators, 16-Domain Mastery Radar & Cryptographic Credential Verifier.

8. **Sandboxed Multi-CLI Terminal & In-Memory POSIX VFS**:
   - Authentic multi-line terminal emulator supporting 57 CLI binaries: `kubectl`, `helm`, `kustomize`, `docker`, `crictl`, `git`, `argocd`, `flux`, `istioctl`, `linkerd`, `tofu`, `terraform`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `kyverno`, `etcdctl`, `kubeadm`, `cilium`, `velero`, `vcluster`, `crossplane`, `promtool`, `otelcol`, `aiops`, `k8sgpt`, and standard Linux tools (`curl`, `dig`, `ip`, `iptables`, `systemctl`, `journalctl`, `jq`, `sed`, `awk`).
   - Context-aware tab autocompletion and stream redirection (`|`, `>`, `>>`).

9. **100% Offline Simulation Parity & Zero Runtime Dependencies**:
   - Universal isomorphic core executes in Node.js 22+, WebWorkers, and Desktop/Mobile WebViews.
   - Offline engine bundled in `public/js/offlineEngine.js` (756 KB UMD bundle) precached via Service Worker v4 `public/sw.js` (`kubelabs-offline-v4`).
   - Entire platform runs with `"dependencies": {}`—zero npm dependencies, zero CVEs, zero supply chain attacks.

10. **Enterprise Quality Gate & Verification Ledger**:
    - **54 Quality Checks** evaluated across 11 autonomous engineering agents (`npm run audit:self`).
    - **54 Execution Subphases** verified sequentially in under 200ms (`npm run verify:subphases`).
    - **52 Stage 6 Verification Tests** passing across deterministic replay, anti-stub audits, WCAG 2.1 AA accessibility, and empirical memory footprinting.

---

## Quickstart

```bash
# 1. Start the Standalone Production Server (Default: http://127.0.0.1:4100)
npm start

# 2. Run the 11-Agent Autonomous Governance Quality Gate (54/54 Checks PASS)
npm run audit:self

# 3. Verify all 54 Execution Subphases Sequentially (< 200ms)
npm run verify:subphases

# 4. Run the Full End-to-End Deterministic Solver Suite
npm test

# 5. Run Stage 6 Deterministic Quality Gate Tests
node --test tests/stage6-*.test.js
```

---

## Empirical Performance Benchmarks (Node.js v25.8.2)

| Metric | Budget | Measured Production Value | Margin |
|---|---|---|---|
| **Cold Server Startup Latency** | `< 250 ms` | **`~113 ms`** | `2.2x` faster than budget |
| **Idle Memory Footprint (RSS)** | `< 65 MB` | **`~45.4 MB`** | `30%` below budget |
| **Full 45-Domain & 90-Lab Load (RSS)** | `< 150 MB` | **`~44.8 MB`** | `68%` below budget |
| **Peak Solver Suite Memory (RSS)** | `< 150 MB` | **`~93.3 MB`** | `38%` below budget |
| **Terminal Multi-CLI Execution (P99)** | `< 15 ms` | **`1.61 ms`** | `9.3x` faster than budget |
| **Validation Engine Latency (P99)** | `< 25 ms` | **`5.82 ms`** | `4.3x` faster than budget |
| **Control Plane Scale Reconciliation (100 Pods)** | `< 50 ms` | **`13.04 ms`** | `3.8x` faster than budget |
| **Offline Engine Isomorphic UMD Bundle** | `< 1000 KB` | **`756.4 KB`** | `24%` below budget |

*For complete benchmark methodology, profiling scripts, and scalability architecture, see [docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md](docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md).*

---

## Cross-Platform Packaging & Deployment Matrix

| Platform | Technology Stack | Deployment Artifact |
|---|---|---|
| **Web PWA** | HTML5, CSS Glassmorphism, Vanilla JS, Service Worker | Precached via `public/sw.js` (`kubelabs-offline-v4`) & `offlineEngine.js` |
| **Kubernetes (Self-Hosted)** | StatefulSet with PersistentVolume & ClientIP Affinity | [`deploy/kubernetes/kubelabs-k8s.yaml`](deploy/kubernetes/kubelabs-k8s.yaml) |
| **Helm 3 (Enterprise)** | Helm Chart with configurable values | [`deploy/helm/kubelabs/`](deploy/helm/kubelabs/) |
| **Desktop (Win/Mac/Linux)** | Tauri v2 (Rust) & Electron | [`deploy/desktop/tauri.conf.json`](deploy/desktop/tauri.conf.json), [`electron-main.js`](deploy/desktop/electron-main.js) |
| **Mobile (Android/iOS)** | Capacitor 6 Native Wrapper with Virtual Keybar | [`deploy/mobile/capacitor.config.json`](deploy/mobile/capacitor.config.json) |
| **Container (OCI)** | Rootless Alpine Multi-Stage Container | `docker build -t kubelabs:v4.0 .` (under 60MB image) |

---

## Documentation Index

- [01. Global Engineering Contract (GEC-v4.0)](docs/01-GLOBAL-ENGINEERING-CONTRACT.md)
- [02. Product Requirements Document (PRD)](docs/02-PRD.md)
- [03. System, Component, Security, Data & Lab Architecture](docs/03-ARCHITECTURE.md)
- [04. Architecture Decision Records (ADRs 001–010)](docs/04-ADRS.md)
- [05. GitHub Organization, Repo Structure & CI/CD](docs/05-GITHUB-AND-CICD.md)
- [06. Phased Implementation Plan (Stage → Phase → Subphase)](docs/06-IMPLEMENTATION-PLAN.md)
- [07. Master Curriculum Catalog (45 Domains, 90 Labs, 25 Incidents, 8 Capstones, 6 Exams)](docs/07-CURRICULUM-CATALOG.md)
- [08. Operational Runbooks, Deployment Guides & PRR](docs/08-OPERATIONS-AND-RUNBOOKS.md)
- [09. Security & Threat Model](docs/09-SECURITY-AND-THREAT-MODEL.md)
- [10. Performance, Resource Consumption & Scalability Benchmarks](docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md)
- [13. Staged Technical Execution Blueprint](docs/13-V3-STAGE-EXECUTION-BLUEPRINT.md)
- [14. Comprehensive Project Walkthrough & Technical Reference](docs/14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md)
- [15. V4 Subphase Tracking & Verification Ledger (54/54 Verified)](docs/15-V4-SUBPHASE-TRACKING-LEDGER.md)
- [11-Agent Autonomous Engineering Framework](agents/AGENT-FRAMEWORK.md)
