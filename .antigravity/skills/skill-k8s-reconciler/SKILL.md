---
name: skill-k8s-reconciler
description: Specializes in writing controller reconciliation loops (Deployment, StatefulSet, DaemonSet, Job, HPA, VPA, Karpenter, CSI, RBAC, AdmissionWebhooks, NetworkPolicy packet tracer) with realistic status.conditions and Events.
---

# K8s Controller Reconciler Skill (`skill-k8s-reconciler`)

## Role & Mission
Responsible for designing, implementing, and validating deterministic Kubernetes control plane controllers and state reconcilers within the isomorphic core (`src/core/`).

## Scope & Capabilities
1. **Workload Controllers**:
   - `Deployment`: `ReplicaSet` creation/updating, rolling updates (`maxSurge`, `maxUnavailable`), revision history numbering, image updates, and `rollout undo/restart/status`.
   - `StatefulSet`: Ordinal pod numbering (`0..N-1`), persistent identity, headless DNS hostname simulation, and dynamic `volumeClaimTemplates` PVC binding.
   - `DaemonSet`: Per-node scheduled pods running across all schedulable nodes honoring node taints and tolerations.
   - `Job` & `CronJob`: One-off and recurring batch executions, completion tracking (`backoffLimit`, `completions`, `parallelism`), and child Pod lifecycle.
2. **Scheduling & Capacity Simulator**:
   - Evaluates `nodeSelector`, `nodeAffinity`, `podAffinity`, `podAntiAffinity`, `taints`/`tolerations`, and `topologySpreadConstraints`.
   - Simulates realistic scheduling blocks: `Unschedulable` (`0/N nodes available`), `PriorityClass` preemption, `ResourceQuota` limits, `LimitRange`, and `PodDisruptionBudget` (PDB).
3. **Pod State Machine & Health Probes**:
   - Models realistic statuses: `Pending`, `ContainerCreating`, `Running`, `CrashLoopBackOff`, `ImagePullBackOff`, `OOMKilled` (exit code 137), `NodeNotReady`, and CFS CPU quota throttling (`limits.cpu`).
   - Simulates container probes: `startupProbe`, `livenessProbe`, and `readinessProbe`.
4. **Networking Datapath & Packet Tracer**:
   - Service controller (`ClusterIP`, `NodePort`, `LoadBalancer`, `ExternalName`) and `EndpointSlice` binding.
   - CoreDNS internal resolution and upstream forward loop detection.
   - Ingress and Kubernetes Gateway API (`GatewayClass`, `Gateway`, `HTTPRoute`).
   - Deterministic packet tracing (`tracePacket(srcPod, dstIP, port, proto)`) asserting `NetworkPolicy` and `CiliumNetworkPolicy` ingress/egress rules.
5. **Storage CSI Engine**:
   - `StorageClass`, `PersistentVolume`, `PersistentVolumeClaim`, `VolumeSnapshot`, and `VolumeSnapshotClass`.
   - `WaitForFirstConsumer` deferred binding and ReadWriteOnce (RWO) cross-AZ multi-attach error detection.
6. **Admission & Security Controllers**:
   - RBAC engine (`Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`, evaluating `kubectl auth can-i`).
   - Pod Security Admission (`privileged`, `baseline`, `restricted`).
   - OPA Gatekeeper (`ConstraintTemplate`, constraints) and Kyverno `ClusterPolicy` validating and mutating webhooks.

## Invariants
- Code must be isomorphic (ES2024 modules, zero Node-only globals) so it executes identically in Node.js 22+, WebWorkers, and Desktop WebViews.
- Never mock status: always calculate `status.phase`, `status.conditions`, `status.readyReplicas`, and `events` from actual object state.

