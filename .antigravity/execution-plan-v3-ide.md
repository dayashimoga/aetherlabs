# KUBELABS v3.0: MASTER STAGE → PHASE → SUBPHASE EXECUTION PLAN

Document: `.antigravity/execution-plan-v3-ide.md`  
Status: ACTIVE REFERENCE

---

## Overview
This master execution plan details the 6 sequential stages designed to eliminate dual-engine drift, overhaul the workbench UI, provide production-fidelity control plane and CNI internals, expand the curriculum to 18 mandatory domains & 24 incidents, deliver live cluster bridging, and complete production release hardening.

---

## STAGE 1: Core Engine Unification, State Synchronization & Terminal PTY Overhaul
**Objective**: Eliminate dual-engine drift (`src/core` vs `src/engine` vs `offlineEngine.js`), fix the cross-lab validation desynchronization bug, and replace the detached input-box terminal with an authentic inline terminal emulator.

### Phase 1.1: Isomorphic Engine Consolidation & Deterministic Session Binding
- **Subphase 1.1.1**: Remove duplicate logic in `src/engine/*` by making `src/core/*` the single source of truth; create `scripts/bundle-isomorphic.js` to automatically generate `public/js/offlineEngine.js` from `src/core/*` on every build.
- **Subphase 1.1.2**: Fix `sessionManager.js`, `router.js`, and `public/js/app.js` state binding: when a user selects a Lab, Incident, or Capstone, atomically initialize target cluster state, bind `activeLabId` assertions in `validationEngine.js`, and clear stale validation results so assertions from previous labs (`commerce-sa`) never bleed into the current lab (`order-processor`).
- **Subphase 1.1.3**: Upgrade `storageAdapter.js` with Hybrid Logical Clocks (HLC) + IndexedDB/OPFS browser persistence and SQLite WAL server persistence for conflict-free offline/online sync across Windows, macOS, Linux, Android, and iOS.

### Phase 1.2: Authentic Inline Terminal Emulator & Context-Aware Quick-Key Engine
- **Subphase 1.2.1**: Rebuild the Terminal component (`public/js/terminalView.js` + `src/core/terminalEngine.js`) into a true inline terminal emulator featuring an inline `learner@kubelabs:~$ ` prompt, blinking cursor, arrow-key cursor navigation, command history (`↑`/`↓`), reverse history search (`Ctrl+R`), `Ctrl+C` interrupt, `Ctrl+L` clear, and multi-line YAML heredoc (`cat <<EOF > file.yaml`) support.
- **Subphase 1.2.2**: Fix the Mobile/Touch Quick-Key Bar: make chips context-aware so tapping `kubectl`, `describe`, `get`, `pods`, `-n` inserts tokens intelligently at the cursor with proper spacing and syntax order (preventing `describe kubectl`) without prematurely executing incomplete commands.
- **Subphase 1.2.3**: Implement context-sensitive `<Tab>` autocompletion that introspects the live `ResourceGraph` to autocomplete dynamic pod names, namespaces, deployment names, services, nodes, and file paths in VFS.

---

## STAGE 2: Enterprise UI/UX Workbench Redesign, Pan/Zoom Topology DAG & Drag-and-Drop Architecture Studio
**Objective**: Transform the UI into a clean, modern, customer-facing workspace with a real interactive SVG Topology Graph and a real Drag-and-Drop Architecture Designer.

### Phase 2.1: 3-Column IDE Workbench & Navigation Streamlining
- **Subphase 2.1.1**: Streamline top navigation to 5 customer-facing workspaces: 1. Learning Paths & Catalog, 2. Lab Workbench, 3. Incident War Room, 4. Architecture Studio, 5. Certifications. Move 11-Agent Quality Gate to an internal Diagnostics Modal (`Ctrl+Shift+D` or footer badge).
- **Subphase 2.1.2**: Redesign the Lab Workbench into a full-viewport (100vh, zero outer scrollbars) 3-column resizable IDE layout (Left: Lab Guide, Center: Tabbed Terminal / Code Editor / Observability Console, Right: Tabbed Topology / Objectives).
- **Subphase 2.1.3**: Redesign the Learning Paths & Catalog view with sticky search/filter sidebar, progressive track cards, domain accordions, and a dedicated Capstone Projects sub-view.

### Phase 2.2: Interactive Pan/Zoom Cluster Topology & Node-Port Architecture Studio
- **Subphase 2.2.1**: Replace static SVG box with interactive Hierarchical DAG Topology Visualizer (`public/js/topologyVisualizer.js`): mouse wheel zoom, drag panning, namespace filter, fullscreen toggle, animated traffic particles, status-colored badges, and click-to-inspect drawer.
- **Subphase 2.2.2**: Replace static flexbox boxes in Architecture Designer with an Interactive Node-and-Edge Canvas (`public/js/architectureCanvas.js`): draggable component nodes, input/output connection ports, cubic-bezier wires, live packet flow simulation, SPOF chaos fault injection, real-time 4-pillar Well-Architected scoring, and two-way YAML/HCL synchronization.

---

## STAGE 3: Production-Fidelity Control Plane, CNI, CSI, Security & Observability Engines
**Objective**: Eliminate simulation shortcuts and implement complete Kubernetes API, scheduling, networking, storage, security, and observability fidelity.

### Phase 3.1: Static Pods, Control Plane Internals, Workload Lifecycle & Advanced Scheduler
- **Subphase 3.1.1**: Upgrade `controllerManager.js` and `virtualFileSystem.js`: model `/etc/kubernetes/manifests/*.yaml` watched by kubelet. Support authentic etcd snapshot restore, static pod reconciliation, and `kubeadm certs check-expiration/renew`.
- **Subphase 3.1.2**: Complete workload lifecycle controllers: Pod (initContainers, native sidecars, ephemeralContainers, probes, OOMKilled 137), Deployment (rollingUpdate maxSurge/maxUnavailable, rollout commands), StatefulSet (ordinal DNS, volumeClaimTemplates), DaemonSet, Job, and CronJob.
- **Subphase 3.1.3**: Upgrade `schedulerEngine.js` with nodeSelector, affinities, taints/tolerations, topologySpreadConstraints, PriorityClass, ResourceQuota, LimitRange, and PodDisruptionBudget during drain.

### Phase 3.2: CNI Datapaths, CSI Storage, OPA/Kyverno/PSA Security & Observability
- **Subphase 3.2.1**: Upgrade `networkingEngine.js`: CNI modes (Calico, Cilium, Flannel, Weave), EndpointSlices, CoreDNS Corefile parser, Gateway API, cert-manager.
- **Subphase 3.2.2**: Upgrade `storageAndSecurityEngine.js`: CSI sidecars, VolumeSnapshot, online PVC resize, AZ multi-attach errors, PSA, OPA Gatekeeper Rego, Kyverno, Falco runtime syscall alerts, Trivy scanner.
- **Subphase 3.2.3**: Upgrade `observabilityEngine.js` and `autoscalingAndMeshEngine.js`: full PromQL execution, Loki LogQL, OpenTelemetry, Jaeger traces, HPA v2, VPA, Karpenter, and Istio/Linkerd/Consul mTLS.

---

## STAGE 4: Comprehensive Curriculum Expansion (18 Mandatory K8s Domains & 24 Production Incidents)
**Objective**: Synchronize UI titles, walkthrough docs, and deterministic solvers across all 18 Kubernetes domains and all 8 Incident Response categories.

### Phase 4.1: Deep Curriculum Expansion Across All 18 Mandatory Domains
- **Subphase 4.1.1**: Expand `plugins/01-*` through `plugins/13-*` with multi-step labs covering core architecture, scheduling, networking, storage, and security.
- **Subphase 4.1.2**: Expand `plugins/14-*` through `plugins/26-*` with multi-step labs covering autoscaling, Gateway API, service mesh, GitOps, multi-cluster, AWS EKS, SRE, and FinOps.

### Phase 4.2: Complete 24-Scenario Incident Simulator (All 8 Mandatory Outage Classes)
- **Subphase 4.2.1**: Deliver 24 realistic production incidents (3 per mandatory category across Website Down, Pod Restarting, Slow App, DNS Failures, IAM & Auth, Storage Outages, Networking & Mesh, Node NotReady / Cluster Outage).
- **Subphase 4.2.2**: Automated solver harness across 100% of labs, all 24 incidents, and all 8 capstones verifying 0% initial score to 100% post-canonical-solution score.

---

## STAGE 5: Live Local Cluster Bridge & Cross-Platform Native Packaging (Win, Mac, Linux, Android, iOS)
**Objective**: Deliver cross-platform packaging and an optional Live Cluster Bridge for desktop/server users.

### Phase 5.1: Live Cluster / Kubeconfig Bridge
- **Subphase 5.1.1**: Implement `src/core/liveClusterBridge.js` allowing connection to `~/.kube/config` context (`kind`, `k3d`, `minikube`) to stream PTY output and run validation against live API state.
- **Subphase 5.1.2**: Header mode selector ([Virtual Cluster (48MB)] vs [Live Local K8s Cluster]) with automatic offline fallback.

### Phase 5.2: Desktop (Tauri v2) & Mobile (Capacitor 6 + PWA v4) Packaging
- **Subphase 5.2.1**: Finalize `deploy/desktop/tauri.conf.json` and host wrapper for Windows, macOS, and Linux.
- **Subphase 5.2.2**: Finalize `deploy/mobile/capacitor.config.json` with safe-area insets, `visualViewport` keyboard adaptation, and Service Worker v4 offline precaching.

---

## STAGE 6: Security Hardening, Performance Benchmarking, Documentation & Release Gates
**Objective**: End-to-end security, chaos, load, accessibility, and documentation release verification.

### Phase 6.1: Security, Chaos, Load & Accessibility Verification
- **Subphase 6.1.1**: Threat model and harden against XSS, prototype pollution, YAML alias expansion bombs, ReDoS, and SQL injection.
- **Subphase 6.1.2**: Load benchmarks (`scripts/benchmark.js`): 500 concurrent sessions < 150MB RSS, P99 latency < 15ms.

### Phase 6.2: Documentation Synchronization & 60-Gate Production Audit
- **Subphase 6.2.1**: Synchronize all documentation (`docs/01` to `docs/13`, `project-walkthrough.md`) with 100% fidelity.
- **Subphase 6.2.2**: Upgrade `scripts/self-audit.js` to 60 automated production gates.
