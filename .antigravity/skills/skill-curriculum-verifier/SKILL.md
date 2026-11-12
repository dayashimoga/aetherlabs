---
name: skill-curriculum-verifier
description: Authors production-grade labs and SEV-1 incidents and immediately writes an automated unit test executing the canonicalSolution to prove 0% -> 100% state transition.
---

# Curriculum & Deterministic Solver Verifier Skill (`skill-curriculum-verifier`)

## Role & Mission
Designs, implements, and certifies hands-on labs, real-world incident drills, capstones, and role-based certifications, ensuring 100% deterministic solvability and state-graph validation.

## Scope & Capabilities
1. **Curriculum Design Standards**:
   - Master 26 domains covering the complete CNCF, Linux, Kubernetes, DevOps, DevSecOps, SRE, Platform Engineering, Multi-Cloud, and AI-Ops spectrum.
   - Every lab must specify: `id`, `title`, `difficulty`, `estimatedMinutes`, `learningObjectives`, `prerequisites`, `initialClusterState`, `starterManifest`, `steps`, `validationRules`, `solutionCommands`, `troubleshootingHint`, and `productionScenario`.
2. **Production Incident Simulations (SEV-1 & SEV-2)**:
   - Covers all 8 mandatory incident classes: Website Down, Pod Restarting, Slow App, DNS Outage, IAM Outage, Storage Outage, Networking Outage, Node NotReady / Cluster Outage.
   - Real root-cause fault injection: CFS CPU throttling (`limits.cpu: 5m`), etcd quorum loss, CoreDNS loops, missing IRSA role annotations, broken StorageClasses, stopped kubelet, and expired apiserver certificates.
   - No shortcuts or mock flags (e.g. `ETCD_READY=true`): Outages must be resolved through authentic file edits, configuration changes, or CLI commands.
3. **Multi-Assertion Validation Engine**:
   - Grades against 18 declarative assertion types: `resource_exists`, `pod_status_running`, `service_has_endpoints`, `resource_field_equals`, `resource_field_gte`, `command_executed`, `network_policy_isolates`, `hpa_configured`, `storage_bound`, `security_hardened`, `packet_trace_allowed`, `packet_trace_blocked`, `promql_query_result`, `rbac_can_i`, `pod_security_standard`, `slo_burn_rate_within_budget`.
4. **Deterministic Solvability Testing**:
   - Every lab and incident MUST have an automated test suite verifying:
     1. Initial state evaluation fails (`passed: false`, score 0%).
     2. Sequential execution of `solutionCommands` succeeds cleanly (`exitCode: 0`).
     3. Post-execution evaluation passes (`passed: true`, score 100%).

## Invariants
- Zero placeholders: No `TODO`, `FIXME`, mock returns, or unfinished labs.
- Labs must be solvable via both imperative CLI and declarative YAML manifest application.

