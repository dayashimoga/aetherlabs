# Operational Runbooks, Deployment Guides, Test Plans & Production Readiness Review

**Document ID**: OPS-KUBELABS-2026-001  
**Version**: 1.0.0

---

## 1. Cross-Platform Deployment Guide

### 1.1 Standalone Local Server (Windows, Linux, macOS)
Requires only Node.js (`>= 22.5.0`) with zero external dependencies or compilation steps:
```bash
# Start KubeLabs on default port 4100 (or set PORT=8080)
npm start

# Run automated Self-Audit & 11-Agent Quality Gate
npm run audit:self

# Run full Unit, Integration, Security & Lab Solver Test Suite
npm test
```

### 1.2 Web / Progressive Web App (PWA) & Mobile (Android / iOS)
1. Navigate to `http://localhost:4100` (or hosted HTTPS endpoint) on Chrome, Edge, Safari, or Firefox.
2. Click **"Install KubeLabs App"** (or **"Add to Home Screen"** on iOS/Android).
3. The Service Worker (`public/sw.js`) caches the application shell, curriculum catalog, and client-side simulation engine for 100% offline operation.

### 1.3 Containerized Deployment (Docker / Podman / Kubernetes)
```bash
node src/server.js
```
Exposes `/api/health` for Kubernetes `livenessProbe` and `readinessProbe` checks.

---

## 2. Operational Runbooks

### Runbook RB-01: Resetting Corrupted Learner State or Virtual Cluster
- **Symptom**: Learner wants a clean slate for a specific lab or the entire virtual cluster.
- **Procedure**:
  1. Via UI: Click **Reset Lab Cluster** in the Lab Workbench.
  2. Via API: `POST /api/labs/:id/start` or `POST /api/cluster/reset`.
  3. Complete database reset: Delete `data/kubelabs.sqlite` (it is automatically recreated and seeded on next request or server start).

### Runbook RB-02: Adding a New Curriculum Domain Plugin
- **Procedure**:
  1. Create `plugins/<NN>-<domain-slug>.json` adhering to `schemas/plugin.schema.json`.
  2. Include `curriculumModules`, `labs` (with `initialClusterState`, `validationRules`, and `solutionCommands`), and `assessmentQuestions`.
  3. Run `npm run audit:self` to validate schema compliance and `npm test` to verify that every lab's `solutionCommands` pass 100% of `validationRules`.

### Runbook RB-03: Verifying a Learner's Cryptographic Certificate
- **Procedure**:
  1. Call `POST /api/certifications/verify` with `{ "certId": "CERT-...", "signature": "..." }`.
  2. The Certification Engine recomputes the HMAC-SHA256 digest over the canonical certificate record and returns `{ "valid": true, "certificate": { ... } }`.

---

## 3. Master Test Plan

| Test Suite | Scope | Verification Method |
|---|---|---|
| **TS-01: Plugin & Schema Validation** | All 18 JSON plugins in `plugins/` | Validates required fields, non-empty labs, valid rule types, unique IDs. |
| **TS-02: Virtual Cluster Engine** | Deployment controller, Scheduler, Service Endpoints, YAML parser | Asserts pod creation, scaling, selector matching, `ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`, `Pending` states. |
| **TS-03: Multi-CLI Terminal Engine** | `kubectl`, `helm`, `docker`, `linux`, `argocd`, `istioctl`, `tofu`, `aws`, `az`, `gcloud`, `trivy`, `falco`, `cosign`, `aiops` | Executes representative commands across all CLI families and verifies stdout & cluster state mutations. |
| **TS-04: Deterministic E2E Lab Solver** | All 36 Labs across 18 Domains | Loads initial state -> asserts validation fails -> executes `solutionCommands` -> asserts 100% validation pass. |
| **TS-05: Live Incident Simulations** | All 8 Production Outage Scenarios | Injects fault -> asserts incident is unresolved -> executes remediation -> asserts incident resolved & MTTR recorded. |
| **TS-06: Production Capstone Projects** | All 6 Multi-Milestone Capstone Projects | Starts capstone -> asserts initial milestone fail -> executes solution commands -> asserts 100% milestone pass. |
| **TS-07: Architecture Designer & IaC** | Visual topology analysis & YAML/HCL export | Evaluates 8 reference architectures, SPOF detection, and manifest generation. |
| **TS-08: Socratic AI Mentor & CIS Audit** | Contextual hints, error diagnosis, security review | Verifies non-empty, context-aware responses for all 4 mentoring modes. |
| **TS-09: HTTP API, Security & SQLite** | REST endpoints, CSP headers, SQL persistence, Certificate signing | End-to-end HTTP integration tests against live server instance. |
| **TS-10: Subphase Sequential Proof** | All 36 Subphases across 5 Stages | `npm run verify:subphases` evaluates every subphase individually with granular millisecond telemetry. |

---

## 4. Security, Performance & Production Readiness Review Sign-Off

### 4.1 Security Review Summary
- **OS Shell Isolation**: Verified `0` calls to `child_process` in runtime code (`src/`). All terminal inputs are parsed inside `TerminalEngine`.
- **SQL Injection Immunity**: Verified `100%` of SQLite queries in `src/db/database.js` use parameterized prepared statements.
- **HTTP Hardening**: Strict CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `1MB` payload cap enforced on all routes.
- **Supply Chain**: `0` external npm dependencies (`dependencies: {}`).
- **STRIDE Threat Model**: Detailed threat model and mitigation matrix documented in `docs/09-SECURITY-AND-THREAT-MODEL.md`.

### 4.2 Performance Review Summary
- **Startup Time**: `< 120ms` cold boot (Target: `< 500ms`).
- **Memory Footprint**: `~45MB` RSS idle, `~54MB` RSS under full 36-lab + 8-incident + 6-project solver execution (Target: `< 150MB`).
- **API Latency**: `< 2ms` median, `< 5ms` P99 (Target: `< 25ms`).
- **Benchmark Ledger**: Documented in `docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md`.

### 4.3 Production Readiness Checklist
- [x] Global Engineering Contract enforced
- [x] Complete PRD, Architecture, ADRs, Implementation Plan, Curriculum Catalog, STRIDE Model, and Benchmarks published
- [x] 18 Technology Domain Plugins validated
- [x] 36 Interactive Labs + 8 Incident Simulations + 6 Capstone Projects + 8 Reference Architectures verified via automated solver tests
- [x] 11-Agent Framework (`npm run audit:self`) and 36-Subphase Ledger (`npm run verify:subphases`) green
- [x] Rootless Docker, Docker Compose, and Kubernetes self-hosting manifests configured in `deploy/kubernetes/`

