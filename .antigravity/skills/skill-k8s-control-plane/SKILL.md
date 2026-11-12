---
name: skill-k8s-control-plane
description: Implements API server admission chains, etcd Raft state, kubelet static pod file watchers, scheduler predicates/priorities, CNI packet tracing, and CSI volume binding.
---

# skill-k8s-control-plane

## Purpose
Governs high-fidelity emulation of Kubernetes control plane internals, workload reconcilers, and core infrastructure controllers.

## Guidelines
1. **Authentic Reconcilers**: Implement full controller reconciliation loops for Pods, ReplicaSets, Deployments, StatefulSets, DaemonSets, Services, Jobs, and CronJobs.
2. **Static Pod Watcher**: Emulate kubelet watching `/etc/kubernetes/manifests/*.yaml`. Reconcile changes directly to cluster pods.
3. **Control Plane Internals**: Support authentic etcd Raft snapshot save and restore operations.
4. **Admission Chains**: Execute mutating webhooks, validating webhooks, Common Expression Language (CEL) policies, and Pod Security Standards (PSS).
5. **Scheduler & CNI**: Implement 3-phase scheduling (filtering, scoring, binding) with taints/tolerations, and 7-hop virtual CNI packet tracing with NetworkPolicy enforcement.
