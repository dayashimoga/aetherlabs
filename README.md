# KubeLabs — Cloud-Native & Kubernetes Learn-by-Doing Platform

**KubeLabs** is a standalone, low-resource (`< 65MB` idle RAM), offline-capable, cross-platform (Web/PWA, Windows, Linux, macOS, Android, iOS) Learn-by-Doing Kubernetes & Cloud-Native Engineering Platform.

---

## Key Capabilities

1. **16 Modular Technology Domains (`plugins/*.json`)**:
   - Linux Fundamentals, Containers & OCI Runtimes, Cloud-Native Networking (CNI/eBPF), Kubernetes Core, CNCF Packaging (Helm/Kustomize/Operators), GitOps & Progressive Delivery (Argo CD/Rollouts), DevOps CI/CD, DevSecOps & Runtime Security (NetworkPolicies/Trivy/Falco/Cosign), Service Mesh (Istio mTLS), Observability (Prometheus/OpenTelemetry/Grafana), SRE & Chaos Engineering, Platform Engineering (Backstage/Crossplane), Infrastructure as Code (OpenTofu/Terraform), AWS (EKS/Karpenter/IRSA), Azure (AKS) & GCP (GKE), and AI-Ops & GPU Workloads.
2. **Stateful Virtual Kubernetes & Cloud Control Plane (`src/engine/virtualCluster.js`)**:
   - Real controller reconciliation (Deployment -> ReplicaSet -> Pods, Service -> EndpointSlices, Scheduler capacity & GPU taint/toleration checks, Crossplane claims, Argo CD apps, Helm releases, OpenTofu state, and failure simulation for `ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`, `Pending`, and `0 endpoints`).
3. **Sandboxed Multi-CLI Built-In Terminal (`src/engine/terminalEngine.js`)**:
   - Supports `kubectl`, `helm`, `docker`, `crictl`, `argocd`, `istioctl`, `tofu`, `terraform`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `aiops`, and Linux/Networking utilities (`systemctl`, `sysctl`, `ss`, `ip`, `ps`, `free`, `df`, `dig`, `curl`).
4. **32 Interactive Hands-On Labs & 8 Live Production Outage Simulations**:
   - Every lab and incident is verified by a **Deterministic Multi-Assertion Validation Engine** (`src/engine/validationEngine.js`) and proven solvable via automated E2E solver tests.
5. **Visual UI Architecture Designer & 8 Enterprise Reference Architectures (`src/engine/architectureEngine.js`)**:
   - Interactive topology builder with automated Well-Architected 4-Pillar scoring, Single Point of Failure (SPOF) detection, bi-directional Kubernetes YAML + OpenTofu HCL compilation, and one-click deployment to the virtual cluster.
6. **Contextual Socratic AI Mentor & CIS Kubernetes Security Auditor (`src/engine/aiMentor.js`)**:
   - Works 100% offline with 4 coaching modes: Socratic Hint, Debug Cluster Error, Explain Concept, and CIS Benchmark Security Audit.
7. **Role Certifications & Cryptographic Credentials (`src/engine/certificationEngine.js`)**:
   - 6 role-based certification exams issuing HMAC-SHA256 signed verifiable certificates backed by `node:sqlite`.

---

## Quickstart

```bash
# 1. Run the 11-Agent Engineering Quality Gate & Self-Audit
npm run audit:self

# 2. Run the Full Automated Test & E2E Lab Solver Suite
npm test

# 3. Start the Standalone Server (Default: http://127.0.0.1:4100)
npm start
```

---

## Documentation Index

- [Global Engineering Contract](docs/01-GLOBAL-ENGINEERING-CONTRACT.md)
- [Product Requirements Document (PRD)](docs/02-PRD.md)
- [System, Component, Security, Data & Lab Architecture](docs/03-ARCHITECTURE.md)
- [Architecture Decision Records (ADRs)](docs/04-ADRS.md)
- [GitHub Organization, Repo Structure & CI/CD](docs/05-GITHUB-AND-CICD.md)
- [Phased Implementation Plan (Stage → Phase → Subphase)](docs/06-IMPLEMENTATION-PLAN.md)
- [Master Curriculum Catalog (16 Domains, 32 Labs, 8 Incidents)](docs/07-CURRICULUM-CATALOG.md)
- [Operational Runbooks, Deployment Guides & PRR](docs/08-OPERATIONS-AND-RUNBOOKS.md)
- [11-Agent Autonomous Engineering Framework](agents/AGENT-FRAMEWORK.md)

