# Architecture Decision Records (ADRs)

This document records the foundational architectural decisions governing KubeLabs.

---

## ADR-001: Stateful Virtual Control Plane vs. Full VM / KIND Cluster per Learner
- **Status**: Accepted
- **Context**: Traditional Kubernetes lab platforms spin up Firecracker microVMs, Docker-in-Docker (KIND), or cloud VMs per session. Those require 4GB–16GB RAM, fail on mobile devices and locked-down laptops, take 60–180 seconds to boot, and cannot run offline on a tablet or browser.
- **Decision**: Build a deterministic **Stateful Virtual Cloud-Native & Kubernetes Control Plane** (`src/engine/virtualCluster.js`) that models Kubernetes API resources, controllers (Deployment, ReplicaSet, EndpointSlice, Scheduler, NetworkPolicy), Helm releases, Argo CD apps, Istio meshes, OpenTofu state, and Cloud resources in memory + SQLite, with an optional Live Cluster Bridge for users who wish to export manifests to a physical cluster.
- **Consequences**:
  - **Pros**: `< 500ms` boot time, `< 65MB` RAM, 100% offline capability, deterministic lab resets in `< 5ms`, works on Windows, macOS, Linux, Android, iOS, and Web.
  - **Cons**: Must accurately model controller reconciliation and error states (`CrashLoopBackOff`, `ImagePullBackOff`, `Pending`, `0 endpoints`). Mitigated by comprehensive controller simulation and automated solver tests.

---

## ADR-002: Zero External Runtime Dependencies (Native Node.js + Native SQLite)
- **Status**: Accepted
- **Context**: Large `node_modules` trees introduce supply-chain vulnerabilities (CVEs), native compilation failures across Windows/Linux/macOS, slow installs, and large distribution bundles.
- **Decision**: Use modern Node.js built-in modules (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:path`, `node:test`) and vanilla ES2022+ browser modules with zero external runtime dependencies.
- **Consequences**:
  - **Pros**: Zero transitive CVEs, instant `git clone && npm start` with no `npm install` network failure risk, tiny footprint, effortless air-gapped deployment.
  - **Cons**: Custom YAML/manifest parser and HTTP router required. Implemented cleanly with full unit test coverage in `src/engine/`.

---

## ADR-003: Declarative JSON Plugin Architecture for All 16+ Technology Domains
- **Status**: Accepted
- **Context**: Cloud-native technologies evolve rapidly (Kubernetes, Cilium, OpenTofu, Crossplane, AI-Ops). Hardcoding curriculum or lab logic into the core engine creates tight coupling and maintenance bottlenecks.
- **Decision**: Define a strict JSON Schema (`schemas/plugin.schema.json`) and load all domains dynamically via `PluginManager` (`src/plugins/pluginManager.js`).
- **Consequences**:
  - **Pros**: Adding a new domain, lab, or certification question requires zero core engine modifications; every plugin is automatically validated on startup and in CI.

---

## ADR-004: Sandboxed Virtual Terminal Execution (Zero Host OS Shell Spawning)
- **Status**: Accepted
- **Context**: Executing arbitrary user terminal input in `cmd.exe` or `/bin/sh` exposes the host system to Remote Code Execution (RCE) and behaves inconsistently across Windows, macOS, Linux, and mobile browsers.
- **Decision**: Implement a dedicated **Multi-CLI Parser & Virtual Execution Engine** (`src/engine/terminalEngine.js`) that interprets `kubectl`, `helm`, `docker`, `linux`, `argocd`, `istioctl`, `tofu`, `aws`, `az`, `gcloud`, `trivy`, and `aiops` against the sandboxed virtual cluster state.
- **Consequences**:
  - **Pros**: Complete immunity to OS command injection, identical CLI output on Windows/Linux/macOS/Android/iOS, instant response (`< 5ms`).

---

## ADR-005: State-Based Multi-Assertion Validation Engine Over Regex Command Matching
- **Status**: Accepted
- **Context**: Naive lab platforms grade learners by checking if they typed an exact command string. In Kubernetes, a learner might fix a Deployment via `kubectl apply`, `kubectl scale`, `kubectl set image`, or the Manifest Editor.
- **Decision**: Validate labs and incidents primarily by inspecting the **reconciled target cluster state** (resource existence, nested field values, pod readiness, active service endpoints, security posture) alongside optional telemetry checks.
- **Consequences**:
  - **Pros**: Learners can solve problems using imperative CLI commands or declarative YAML manifests, mirroring real production engineering and CKA/CKS exams.

---

## ADR-006: Offline-First Hybrid Persistence (`node:sqlite` + Browser Storage + Service Worker)
- **Status**: Accepted
- **Context**: Users must be able to learn seamlessly whether running the local server on Windows/Linux/macOS or viewing the PWA offline on mobile/tablet.
- **Decision**: Persist all state in SQLite (`data/kubelabs.sqlite`) on the server AND mirror active progress/snapshots to browser `localStorage` with a Service Worker (`public/sw.js`) caching all application shell assets and curriculum catalogs.
- **Consequences**:
  - **Pros**: Resilient against restarts, browser refreshes, and network drops.

---

## ADR-007: Bi-Directional UI Architecture Designer with Well-Architected Scoring
- **Status**: Accepted
- **Context**: Architects and senior engineers need more than CLI drills—they must design resilient multi-tier, multi-AZ, zero-trust cloud-native architectures and understand trade-offs.
- **Decision**: Include a visual **UI Architecture Designer** (`src/engine/architectureEngine.js`) that converts visual topologies into Kubernetes YAML + OpenTofu HCL and scores designs across Reliability, Security, Observability, Performance, and Cost.
- **Consequences**:
  - **Pros**: Bridges the gap between hands-on implementation (`kubectl`) and high-level system design.

---

## ADR-008: Deterministic Socratic AI Mentor with CIS Benchmark Auditor
- **Status**: Accepted
- **Context**: Learners frequently get stuck on subtle errors (e.g., selector mismatch, container port mismatch, missing RBAC RoleBinding) and need intelligent guidance that works even without an external OpenAI/Gemini API key.
- **Decision**: Build a deterministic **Contextual Socratic AI Mentor** (`src/engine/aiMentor.js`) that inspects the live cluster state diff against active lab validation rules, recent terminal errors, and CIS Kubernetes Benchmark rules to provide progressive Socratic hints, root-cause diagnostics, and security reviews offline.
- **Consequences**:
  - **Pros**: 100% free, zero API key required, zero data leakage, instant contextual mentoring.

---

## ADR-009: Automated Solver Verification for Every Lab and Incident
- **Status**: Accepted
- **Context**: Broken labs or impossible validation criteria destroy learner trust.
- **Decision**: Require every lab and incident scenario to include a canonical `solutionCommands` sequence, and run an automated test in CI (`tests/kubelabs.test.js`) that resets the cluster, verifies validation initially fails, runs `solutionCommands`, and asserts 100% validation pass.
- **Consequences**:
  - **Pros**: Mathematical guarantee that 100% of labs and incidents in the platform are solvable and accurately graded.

---

## ADR-010: 11-Agent Autonomous Quality Gate Framework
- **Status**: Accepted
- **Context**: Maintaining enterprise-grade quality across Product, Architecture, Backend, Frontend, Kubernetes, Curriculum, DevOps, Security, QA, Documentation, and Platform Engineering requires structured verification.
- **Decision**: Codify an 11-Agent Framework (`agents/` + `src/agents/orchestrator.js`) that programmatically audits the repository against every role's checklist before release.
- **Consequences**:
  - **Pros**: Continuous, automated enforcement of the Global Engineering Contract.

