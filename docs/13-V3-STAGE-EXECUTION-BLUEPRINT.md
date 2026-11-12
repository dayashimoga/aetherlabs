# KubeLabs v3.0: Staged Technical Execution Blueprint

## Architecture Blueprint: Cross-Platform Architecture (Windows, macOS, Linux, Android, iOS)
- **Unified Isomorphic Core (`src/core/`)**: Pure ES2024 modules with zero Node-specific globals. Runs identically inside Node.js 22+, Web Workers (PWA/Mobile), and Desktop WebViews.
- **Desktop (Windows, macOS, Linux via Tauri v2)**: Rust host binary (< 10MB installer, < 60MB RAM) serves the UI and binds an optional local PTY bridge to execute real kubectl/docker/helm when the user toggles "Live Local Cluster Mode".
- **Mobile (Android & iOS via Capacitor 6 + Adaptive Mobile Workbench)**:
  - *Mobile Terminal Ergonomics*: Virtual touch keybar above the keyboard providing one-tap keys (`kubectl`, `get`, `describe`, `apply -f`, `-n`, `|`, `grep`, `Tab`, `Ctrl+C`, `↑`, `↓`) so mobile users never struggle with typing symbols.
  - *Offline Storage*: IndexedDB + OPFS with deterministic Conflict-Free Replicated Data Type (CRDT) vector clocks to sync progress seamlessly when transitioning between offline mobile and desktop.

---

## Non-Negotiable Global Engineering Contract
1. **ZERO PLACEHOLDERS**: Every controller, CLI flag, lab solver, and incident scenario must be 100% implemented. No `TODO`, `FIXME`, stub returns, or regex history grading.
2. **ISOMORPHIC CORE INVARIANT**: All code in `src/core/` MUST run in both Node.js 22+ and Browser WebWorkers without modification.
3. **STATE-GRAPH GRADING**: Labs and incidents are validated exclusively against the reconciled cluster resource graph, metrics time-series, and filesystem state—never by grepping terminal history.
4. **DETERMINISTIC SOLVABILITY**: Every lab/incident must fail validation at initial state (0%), pass 100% when its `canonicalSolution` commands are executed in a clean session, and clean up cleanly on reset.
5. **CROSS-PLATFORM UX**: Touch targets >= 44x44px, WCAG 2.1 AA contrast, responsive layout from 360px (iOS/Android) to 3840px (4K Desktop), and mobile quick-action terminal bar.
6. **SECURITY PERIMETER**: Strict CSP, parameterized SQLite queries, zero `child_process` execution in sandbox mode, and Ed25519 cryptographic signing for credentials.

---

## 5 Staged Execution Prompts & Subphases

### STAGE 1: Isomorphic Core, POSIX VFS, Strict YAML/JSONPath & Storage Layer
#### Phase 1.1: Isomorphic Storage, CRDT Offline Sync & POSIX VFS
- **Subphase 1.1.1**: Create package.json, directory tree, and `src/db/storageAdapter.js` supporting `node:sqlite` (WAL mode, parameterized statements, migrations) on Server/Desktop and IndexedDB/OPFS on Browser/Mobile with vector-clock CRDT state merging.
- **Subphase 1.1.2**: Implement `src/core/virtualFileSystem.js` with full in-memory POSIX tree (`/etc/kubernetes/manifests`, `/var/log/pods`, `/var/lib/etcd`, `/root/.kube/config`), permissions (`chmod`/`chown`), symlinks, stream redirection (`>`, `>>`), and file watch hooks for kubelet static pods.
- **Subphase 1.1.3**: Implement `src/core/yamlParser.js` and `src/core/jsonPath.js` supporting multi-document YAML (`---`), comments, block scalars (`|`, `>`), inline collections, RFC 6902 JSONPatch, StrategicMergePatch, and full `kubectl get -o jsonpath='{...}'` expressions.
#### Phase 1.2: Multi-Tenant Session Manager & Security Perimeter
- **Subphase 1.2.1**: Implement `src/core/sessionManager.js` with LRU eviction, per-session isolated VirtualCluster + VirtualFileSystem instances, snapshot serialization, and sub-millisecond reset.
- **Subphase 1.2.2**: Write unit tests in `tests/stage1-core.test.js` verifying VFS watch triggers, multi-doc YAML edge cases, JSONPath queries, and SQLite/CRDT snapshot round-trips.

---

### STAGE 2: High-Fidelity Kubernetes Control Plane, Scheduling, Storage & Security Engine
#### Phase 2.1: API Server, etcd Raft State, Kubelet & Core Workload Controllers
- **Subphase 2.1.1**: Implement `src/core/virtualCluster.js` modeling etcd Raft quorum/member health, kube-apiserver admission pipeline, kube-scheduler, kube-controller-manager, and kubelet (static pod watcher, PLEG health, node conditions Ready, DiskPressure, MemoryPressure, PIDPressure).
- **Subphase 2.1.2**: Implement workload controllers: Pod (probe state machine: startupProbe, livenessProbe, readinessProbe, initContainers, ephemeralContainers, OOMKilled vs CrashLoopBackOff vs ImagePullBackOff), ReplicaSet, Deployment (rollingUpdate maxSurge/maxUnavailable, revision history, rollback), StatefulSet (ordered creation 0..N-1, stable headless DNS, volumeClaimTemplates), DaemonSet, Job, and CronJob.
#### Phase 2.2: Advanced Scheduler, CNI Datapath, CSI Storage & Admission Security
- **Subphase 2.2.1**: Implement SchedulerEngine evaluating nodeSelector, nodeAffinity, podAffinity/podAntiAffinity, taints/tolerations, topologySpreadConstraints (maxSkew), PriorityClass preemption, ResourceQuota, LimitRange, and PodDisruptionBudget (minAvailable/maxUnavailable during kubectl drain).
- **Subphase 2.2.2**: Implement NetworkingEngine modeling CNI plugins (Calico BGP/IPPool, Cilium eBPF CiliumNetworkPolicy, Flannel, Weave), Service (ClusterIP, NodePort, LoadBalancer, ExternalName), Endpoints/EndpointSlices, CoreDNS resolver (detecting loops, ndots:5, stubDomains), Ingress, Gateway API (GatewayClass, Gateway, HTTPRoute, GRPCRoute), and a deterministic Packet Tracer (`tracePacket(srcPod, dstIP, port, proto)`) evaluating Ingress/Egress NetworkPolicy selectors.
- **Subphase 2.2.3**: Implement StorageCSIEngine (StorageClass, PersistentVolume, PersistentVolumeClaim, VolumeSnapshot, VolumeSnapshotClass, WaitForFirstConsumer, ReadWriteOnce vs ReadWriteMany multi-attach conflict detection across availability zones) and SecurityPolicyEngine (RBAC auth can-i, Pod Security Admission privileged/baseline/restricted, OPA Gatekeeper ConstraintTemplate/Constraint, and Kyverno ClusterPolicy validation/mutation).

---

### STAGE 3: Sandboxed Multi-CLI AST Terminal, Observability, Autoscaling & Mesh Engine
#### Phase 3.1: POSIX Shell AST & Cloud-Native CLI Suite
- **Subphase 3.1.1**: Implement `src/core/terminalEngine.js` with AST pipeline parsing (`|`, `&&`, `||`, `;`, `>`, `>>`), environment variable expansion, autocomplete engine, and POSIX utilities (`cat`, `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `grep`, `awk`, `sed`, `jq`, `curl`, `dig`, `nslookup`, `openssl`, `ps`, `top`, `df`, `free`, `systemctl`, `journalctl`).
- **Subphase 3.1.2**: Implement complete CLI subcommands and flags for `kubectl` (get, describe, apply, create, delete, edit, patch, scale, autoscale, rollout, logs, exec, debug, top, cordon, uncordon, drain, taint, label, annotate, auth can-i, explain, diff, wait, config), `helm`, `etcdctl`, `kubeadm`, `istioctl`, `linkerd`, `cilium`, `argocd`, `flux`, `velero`, `trivy`, `falco`, `vcluster`, `tofu`, and `aws eks/iam/ec2/sts`.
#### Phase 3.2: Observability (PromQL/LogQL/OTel), Autoscaling & Service Mesh Engines
- **Subphase 3.2.1**: Implement `src/core/observabilityEngine.js` providing an interactive PromQL evaluator (rate, irate, sum by, histogram_quantile), Loki LogQL filter, OpenTelemetry Collector pipeline validator, Jaeger trace span generator, and SLI/SLO Error Budget burn-rate calculator.
- **Subphase 3.2.2**: Implement `src/core/autoscalingAndMeshEngine.js` modeling HPA v2, VPA recommendations, Cluster Autoscaler, Karpenter (NodePool + EC2NodeClass consolidation & Spot interruption handling), and Service Mesh (Istio VirtualService, DestinationRule circuit breaking/outlierDetection, PeerAuthentication mTLS, Linkerd, Consul).
- **Subphase 3.2.3**: Implement `src/core/validationEngine.js` with 18 deterministic assertion evaluators (including packet_trace_allowed, packet_trace_blocked, promql_query_result, rbac_can_i, pod_security_standard, slo_burn_rate_within_budget).

---

### STAGE 4: Full Production Curriculum, 18 Real-World Incidents & Capstones
#### Phase 4.1: Complete 18-Topic Kubernetes & Platform Engineering Curriculum
- **Subphase 4.1.1**: Audit and expand `plugins/` so every topic in the Mandatory K8s Curriculum has dedicated, multi-step hands-on labs with real YAML manifests, architecture diagrams, Socratic hints, and canonicalSolution verification:
  - Core Workloads, Control Plane Internals, Advanced Scheduling, Networking & CNI, Storage & CSI, Security & Policy, Observability, Autoscaling, API Gateway & Ingress, Service Mesh, GitOps & CI/CD, Multi-Cluster / Multi-Region / Federation, AWS EKS Production, Reliability & Chaos, Runtime & Supply-Chain Security, Cost Optimization & FinOps, Disaster Recovery.
#### Phase 4.2: All 8 Production Incident Classes (18 Real-World Outages) & Capstones
- **Subphase 4.2.1**: Upgrade `src/core/incidentEngine.js` so all scenarios use authentic root-cause remediation (replacing any `ETCD_READY=true` env hack with real `/etc/kubernetes/manifests/etcd.yaml` + `etcdctl snapshot restore` reconciliation) and cover all 8 mandatory incident categories (Website Down, Pod Restarting, Slow App, DNS Outage, IAM Outage, Storage Outage, Networking Outage, Node NotReady / Cluster Outage).
- **Subphase 4.2.2**: Expand `projectEngine.js`, `architectureEngine.js`, `aiMentor.js`, and `certificationEngine.js` (Ed25519 signed credentials) to align with all 18 curriculum tracks.

---

### STAGE 5: Cross-Platform UI/UX Workbench, Packaging & 11-Agent Quality Gate
#### Phase 5.1: Multi-Platform Interactive Workbench (Desktop, Web, Mobile)
- **Subphase 5.1.1**: Upgrade `public/index.html`, `public/css/styles.css`, and `public/js/app.js` with split-pane resizable layout, mobile-first 360px layout with virtual quick-key bar, and WCAG 2.1 AA accessibility.
- **Subphase 5.1.2**: Bundle the unified `src/core/` engine into `public/js/offlineEngine.js` and `public/sw.js` for 100% offline execution, plus configure Tauri v2 (`deploy/desktop/`) and Capacitor (`deploy/mobile/`).
#### Phase 5.2: Observability, DevSecOps CI/CD & 11-Agent Self-Audit Verification
- **Subphase 5.2.1**: Harden `src/api/router.js` and `src/server.js` (CSP, HSTS, rate limiting, /metrics, /api/livez, /api/readyz, graceful drain) and create `.github/workflows/ci-release.yml`.
- **Subphase 5.2.2**: Update `scripts/self-audit.js` and `scripts/verify-subphases.js` to enforce 100% deterministic lab/incident pass rates, memory RSS < 150MB, zero external dependencies, and complete documentation in `docs/08-OPERATIONS-AND-RUNBOOKS.md`.

