---
name: skill-curriculum-author
description: Authors the 18 mandatory K8s domain plugins, 24 production incidents across all 8 outage classes, and automated canonicalSolution E2E tests.
---

# skill-curriculum-author

## Purpose
Authors, structures, and validates curriculum plugins, hands-on multi-step labs, production outage scenarios, and deterministic verification suites.

## Guidelines
1. **Mandatory 4-Stage Lab Structure**:
   - Concept & Production Architecture Brief.
   - Guided Step-by-Step Implementation.
   - Broken State / Troubleshooting Challenge.
   - Multi-Assertion State-Graph Verification (minimum 4 assertions per lab).
2. **Deterministic Solvability**:
   - Labs must fail initial validation (0%).
   - Executing `canonicalSolution` in a clean session must achieve 100% passing score.
3. **24 Production Incidents**:
   - 3 realistic incidents per mandatory category across all 8 classes (Website Down, Pod Restarting, Slow App, DNS Failures, IAM & Auth, Storage Outages, Networking & Mesh, Node NotReady / Cluster Outage).
4. **Authentic Fixes**: Always mandate canonical Kubernetes and cloud-native remediation patterns.
