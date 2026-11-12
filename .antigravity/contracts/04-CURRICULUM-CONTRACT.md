# CURRICULUM CONTRACT (KUBELABS v3.0)

Document: `.antigravity/contracts/04-CURRICULUM-CONTRACT.md`  
Status: ACTIVE & ENFORCED

---

## 1. 4-Stage Pedagogical Structure per Lab
Every hands-on lab across all 26 domains must implement an authentic 4-stage learning path:
1. **Stage 1: Production Concept & Architecture Brief**:
   Real-world enterprise context, architectural motivation, and diagrams explaining why the pattern exists.
2. **Stage 2: Guided Step-by-Step Implementation**:
   Explicit step instructions with copyable manifests and CLI verification commands.
3. **Stage 3: Broken State / Troubleshooting Challenge**:
   Injected real-world failure condition (e.g. OOMKilled, CrashLoopBackOff, selector drift, RBAC forbidden) requiring root-cause deduction.
4. **Stage 4: Multi-Assertion State-Graph Verification**:
   Minimum of **4 declarative assertions** per lab evaluating true object graph properties, pod status conditions, and network packet traces.

## 2. Authentic Resolution Mechanisms ("No Fake Fixes")
Every incident and lab must be solvable exclusively through canonical cloud-native patterns:
- Modifying static pod manifests in `/etc/kubernetes/manifests/*.yaml` watched by the kubelet.
- Correcting RBAC `ClusterRoleBinding` subjects or namespaces.
- Adjusting container `resources.limits.memory` or CFS CPU quotas.
- Restoring Raft snapshots using `etcdctl snapshot restore` and re-pointing data directories.
- Annotating ServiceAccounts with IAM roles (e.g., `eks.amazonaws.com/role-arn`).
- Configuring `DestinationRule` TLS modes matching namespace `PeerAuthentication`.
- Shortcut hacks (e.g., setting arbitrary environment variables on unrelated deployments) are prohibited.

