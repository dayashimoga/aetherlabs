# KubeLabs — Cloud-Native & Kubernetes Learn-by-Doing Platform (v2.0)

**KubeLabs** is a standalone, low-resource (`< 65MB` idle RAM, `< 250ms` cold start), offline-capable, cross-platform (Web/PWA, Windows, Linux, macOS, Android, iOS) Learn-by-Doing Kubernetes & Cloud-Native Engineering Platform.

---

## Key Capabilities

1. **26 Modular Technology Domains (`plugins/*.json`)**:
   - Linux Fundamentals, Containers & OCI Runtimes, Cloud-Native Networking (CNI/eBPF), Kubernetes Core, CNCF Packaging (Helm/Kustomize/Operators), GitOps & Progressive Delivery (Argo CD/Rollouts), DevOps CI/CD, DevSecOps & Runtime Security (NetworkPolicies/Trivy/Falco/Cosign), Service Mesh (Istio mTLS), Observability (Prometheus/OpenTelemetry/Grafana), SRE & Chaos Engineering, Platform Engineering (Backstage/Crossplane), Infrastructure as Code (OpenTofu/Terraform), AWS (EKS/Karpenter/IRSA), Azure (AKS) & GCP (GKE), AI-Ops & GPU Workloads, Emerging Tech (Wasm/eBPF Tetragon & FinOps/Green Cloud), Control Plane Lifecycle & etcd Disaster Recovery, Gateway API & Cilium eBPF, Policy as Code (Kyverno & CEL), Autoscaling & Node Consolidation (KEDA & Karpenter), Storage & CSI VolumeSnapshots (Velero DR), Multi-Tenancy & Virtual Clusters (vCluster & Crossplane), Zero-Trust Workload Attestation & External Secrets (SPIFFE/SPIRE & ESO), and Cloud-Native AI/ML & Distributed Model Serving (Kubeflow & KServe).
2. **Stateful Virtual Kubernetes & Cloud Control Plane (`src/engine/virtualCluster.js`)**:
   - Real controller reconciliation (Deployment -> ReplicaSet -> Pods, Service -> EndpointSlices, DaemonSet per-node scheduling, PersistentVolumeClaim dynamic binding, Node cordon/uncordon/drain/taints, RBAC evaluation (`auth can-i`), Scheduler capacity & GPU taint/toleration checks, Crossplane claims, Argo CD apps, Helm releases, OpenTofu state, and failure simulation for `ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`, `Pending`, CoreDNS loop detection, and etcd quorum loss).
3. **In-Memory POSIX Virtual File System & Multi-Tenant Session Isolation**:
   - `VirtualFileSystem` (`src/engine/virtualFileSystem.js`) provides sandboxed in-memory filesystem emulation (`/etc/kubernetes/manifests/`, `/var/lib/etcd/`, `/home/learner/`, etc.) with redirection support (`>`, `>>`) and `kubectl apply -f <vfs-path>`.
   - `SessionManager` (`src/engine/sessionManager.js`) isolates virtual clusters and terminal states per session (`X-KubeLabs-Session` header) with SQLite snapshot persistence.
4. **Sandboxed Multi-CLI Built-In Terminal (`src/engine/terminalEngine.js`)**:
   - Supports `kubectl`, `helm`, `docker`, `crictl`, `argocd`, `istioctl`, `tofu`, `terraform`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `aiops`, `etcdctl`, `kubeadm`, `velero`, `kyverno`, `vcluster`, `crossplane`, and Linux/Networking utilities (`systemctl`, `sysctl`, `ss`, `ip`, `ps`, `free`, `df`, `dig`, `curl`, `mkdir`, `cat`, `ls`).
5. **52 Interactive Hands-On Labs, 12 Live Outages & 8 Multi-Milestone Capstone Projects**:
   - Every lab, incident, and capstone is verified by a **Deterministic Multi-Assertion Validation Engine** (`src/engine/validationEngine.js`) and proven solvable via automated E2E solver tests.
6. **Visual UI Architecture Designer & 8 Enterprise Reference Architectures (`src/engine/architectureEngine.js`)**:
   - Interactive topology builder with automated Well-Architected 4-Pillar scoring, Single Point of Failure (SPOF) detection, bi-directional Kubernetes YAML + OpenTofu HCL compilation, and one-click deployment to the virtual cluster.
7. **Contextual Socratic AI Mentor & CIS Kubernetes Security Auditor (`src/engine/aiMentor.js`)**:
   - Works 100% offline with 4 coaching modes: Socratic Hint, Debug Cluster Error, Explain Concept, and CIS Benchmark Security Audit.
8. **Ed25519 Asymmetric Cryptographic Credentials & Public Key API (`src/engine/certificationEngine.js`)**:
   - 6 role-based career certification exams issuing **Ed25519** and HMAC-SHA256 verifiable credentials with `GET /api/certifications/public-key` and `POST /api/certifications/verify`.
9. **Production Observability, Probes & Rate Limiting**:
   - Prometheus OpenMetrics `/metrics` endpoint, Kubernetes `/api/livez` and `/api/readyz` probes, token-bucket rate limiter (`180 req/min/IP`), and graceful `SIGTERM` connection draining.
10. **Isomorphic Offline Engine & Interactive SVG Topology Visualizer**:
    - Browser-native offline runtime (`public/js/offlineEngine.js`) paired with PWA Service Worker (`public/sw.js` v2) and live SVG directed graph visualizer (Ingress → Service → Pod → Node / PVC) with theme toggling (Dark / Light / High-Contrast).

---

## Quickstart

```bash
# 1. Run the 11-Agent Engineering Quality Gate & Self-Audit (50/50 Quality Checks)
npm run audit:self

# 2. Run the Full Automated Test Suite (All 52 Labs, 12 Incidents, 8 Capstones)
npm test

# 3. Verify all 36 Execution Subphases Sequentially
npm run verify:subphases

# 4. Start the Standalone Production Server (Default: http://127.0.0.1:4100)
npm start
```

---

## Cross-Platform Packaging & Deployment

- **Kubernetes StatefulSet**: `deploy/kubernetes/kubelabs-k8s.yaml` (StatefulSet + PVC volumeClaimTemplates + ClientIP session affinity).
- **Helm 3 Chart**: `deploy/helm/kubelabs/` (`helm install kubelabs deploy/helm/kubelabs`).
- **Desktop (Windows, macOS, Linux)**: `deploy/desktop/tauri.conf.json` & `deploy/desktop/electron-main.js`.
- **Mobile (Android, iOS)**: `deploy/mobile/capacitor.config.json`.
- **Container**: `Dockerfile` (Multi-stage non-root distroless container).

---

## Documentation Index

- [Global Engineering Contract (GEC-v2.0)](docs/01-GLOBAL-ENGINEERING-CONTRACT.md)
- [Product Requirements Document (PRD)](docs/02-PRD.md)
- [System, Component, Security, Data & Lab Architecture](docs/03-ARCHITECTURE.md)
- [Architecture Decision Records (ADRs)](docs/04-ADRS.md)
- [GitHub Organization, Repo Structure & CI/CD](docs/05-GITHUB-AND-CICD.md)
- [Phased Implementation Plan (Stage → Phase → Subphase)](docs/06-IMPLEMENTATION-PLAN.md)
- [Master Curriculum Catalog (26 Domains, 52 Labs, 12 Incidents, 8 Capstones)](docs/07-CURRICULUM-CATALOG.md)
- [Operational Runbooks, Deployment Guides & PRR](docs/08-OPERATIONS-AND-RUNBOOKS.md)
- [Comprehensive Project Walkthrough](docs/11-COMPREHENSIVE-PROJECT-WALKTHROUGH.md)
- [Enterprise Gap Analysis & Execution Plan](docs/12-ENTERPRISE-GAP-ANALYSIS-AND-EXECUTION-PLAN.md)
- [11-Agent Autonomous Engineering Framework](agents/AGENT-FRAMEWORK.md)
