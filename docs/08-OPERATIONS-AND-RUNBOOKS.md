# KubeLabs: Operational Runbooks, Deployment Guides, Test Plans & Production Readiness Review

**Document ID**: OPS-KUBELABS-2026-001  
**Version**: 3.0.0  
**Scope**: Cross-Platform (Web, Desktop, Mobile, Self-Hosted Kubernetes, Helm 3)

---

## 1. Executive Overview & System Architecture

**KubeLabs v3.0** is an enterprise-grade, zero-dependency (`"dependencies": {}`), isomorphic learn-by-doing laboratory platform for Kubernetes, the CNCF cloud-native ecosystem, DevSecOps, SRE, Platform Engineering, Service Mesh, and AI-Ops.

### Key Architectural Invariants
1. **Zero External Runtime Dependencies**: Powered strictly by pure Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:test`).
2. **Unified Isomorphic Core (`src/core/`)**: Runs identically inside Node.js 22+, WebWorkers (PWA & Mobile), and Desktop WebViews with sub-millisecond execution.
3. **100% Offline Simulation Parity**: Precached by Service Worker `kubelabs-offline-v3` and bundled into `public/js/offlineEngine.js`.
4. **Deterministic State-Graph Grading**: Evaluates true cluster state, VFS files, and metrics—never brittle terminal history regex.
5. **Strict Cryptographic Integrity**: Asymmetric Ed25519 digital signatures with HMAC-SHA256 fallback for tamper-proof certifications.
6. **Low-Resource Envelope**: Cold boot `< 120ms`, idle RSS `< 45MB`, peak RSS `< 65MB` under full test suites (Budget: `< 150MB`).

---

## 2. Cross-Platform Deployment Guide

### 2.1 Standalone Local Server (Windows, Linux, macOS)
Requires only Node.js (`>= 22.5.0`):
```bash
# Start KubeLabs server on default port 4100 (or set PORT=8080)
npm start

# Run 11-Agent Self-Audit Gate (50 Quality Checks)
npm run audit:self

# Run 40-Subphase Sequential Verification Ledger
npm run verify:subphases

# Run all Stage Unit & Integration Test Suites
npm run test:stage1  # Core, VFS, YAML, Storage, Controllers (41 tests)
npm run test:stage2  # Shell AST, Pipelines, Scheduler, Network, Storage (35 tests)
npm run test:stage3  # Multi-CLI, Observability, Autoscaling, Validation (41 tests)
npm run test:stage4  # 26 Plugins, 15 Incidents, 8 Capstones, Ed25519 (13 tests)
npm run test:stage5  # UI Workbench, Offline Engine, Server Hardening (16 tests)
npm test             # Full End-to-End Solver Suite (8 tests)
```

### 2.2 Progressive Web App (PWA) & Mobile (Android / iOS)
1. Navigate to `http://localhost:4100` (or your production HTTPS domain).
2. Click **Install App** in Chrome/Edge, or **Add to Home Screen** on Safari iOS / Chrome Android.
3. The Service Worker (`public/sw.js` with cache `kubelabs-offline-v3`) pre-caches all critical assets (`/`, `/index.html`, `/css/styles.css`, `/js/offlineEngine.js`, `/js/app.js`, `/manifest.json`, `/api/overview`).
4. Disconnect Wi-Fi/cellular: KubeLabs immediately falls back to `offlineEngine.js` for full local terminal execution, manifest reconciliation, and lab grading.

### 2.3 Desktop Native Application (Tauri v2 & Electron)
- **Tauri v2 (`deploy/desktop/tauri.conf.json`)**:
  - App ID: `io.kubelabs.app`
  - Targets: Windows (`.msi`, `.nsis`), macOS (`.dmg`), Linux (`.deb`, `.appimage`).
  - Strict CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:*`.
- **Electron (`deploy/desktop/electron-main.js`)**:
  - Embeds the in-process KubeLabs HTTP server on an ephemeral loopback port (`127.0.0.1`) and loads the isolated Chromium BrowserWindow.

### 2.4 Mobile Native Wrapper (Capacitor 6 for Android & iOS)
- **Configuration (`deploy/mobile/capacitor.config.json`)**:
  - `appId`: `io.kubelabs.app`
  - `appName`: `KubeLabs`
  - `webDir`: `../../public`
  - Built-in touch-optimized keybar with one-tap shortcuts (`kubectl`, `get`, `describe`, `apply -f`, `grep`, `|`, `Tab`, `Ctrl+C`).

### 2.5 Enterprise Helm 3 Deployment (Kubernetes)
```bash
# Lint the chart
helm lint deploy/helm/kubelabs/

# Install into production namespace with persistent volume claims
helm install kubelabs deploy/helm/kubelabs/ \
  --namespace kubelabs-system \
  --create-namespace \
  --set replicaCount=2 \
  --set persistence.size=10Gi
```

### 2.6 Native Kubernetes StatefulSet
```bash
kubectl apply -f deploy/kubernetes/kubelabs-k8s.yaml
```
Deploys a hardened `StatefulSet` with `ClientIP` session affinity, non-root user (`securityContext.runAsNonRoot: true`), read-only root filesystem, `/livez` and `/readyz` probes, and automatic persistent storage volume templates.

---

## 3. Operational Runbooks

### Runbook RB-01: Resetting Corrupted Learner State or Virtual Cluster
- **Objective**: Restore a clean baseline state for an individual lab, incident, or the entire session.
- **Procedure**:
  1. **Via Web Workbench**: Click the **Reset Cluster** button in the top navigation header.
  2. **Via REST API**:
     ```bash
     curl -X POST http://127.0.0.1:4100/api/cluster/reset \
       -H "X-KubeLabs-Session: <session-id>"
     ```
  3. **For an Individual Lab**:
     ```bash
     curl -X POST http://127.0.0.1:4100/api/labs/lab-k8s-01/start \
       -H "X-KubeLabs-Session: <session-id>"
     ```
  4. **Database Clean Reset**: Delete or rename `kubelabs.sqlite`. The database initializes automatically on next launch with full WAL schema migrations.

### Runbook RB-02: Adding a New Curriculum Domain Plugin
- **Objective**: Author a new technology domain adhering to strict KubeLabs schema validation.
- **Procedure**:
  1. Author `plugins/<NN>-<domain-name>.json` complying with `schemas/plugin.schema.json`.
  2. Each plugin must define:
     - `id`, `name`, `trackId`, `curriculumModules` (≥ 2 modules).
     - `labs`: ≥ 2 hands-on labs with `initialClusterState`, `starterManifest`, `validationRules` (≥ 2 rules using supported assertion types), and `solutionCommands`.
     - `assessmentQuestions`: ≥ 2 multi-choice questions with answer rationale.
  3. Validate schema and deterministic solvability:
     ```bash
     npm run audit:self
     npm run test:stage4
     ```

### Runbook RB-03: Verifying Cryptographic Certificates (Ed25519 & HMAC-SHA256)
- **Objective**: Cryptographically verify a learner credential without contacting a central authority.
- **Procedure**:
  1. Retrieve public key:
     ```bash
     curl -s http://127.0.0.1:4100/api/certifications/public-key
     ```
  2. Verify certificate signature via API:
     ```bash
     curl -X POST http://127.0.0.1:4100/api/certifications/verify \
       -H "Content-Type: application/json" \
       -d '{"certId": "CERT-FOUNDATIONS-default-learner", "signature": "<signature-string>"}'
     ```
  3. Returns `{ "valid": true, "algorithm": "Ed25519", "certificate": { ... } }`.

### Runbook RB-04: Offline Sync & CRDT Vector-Clock Reconciliation
- **Objective**: Synchronize offline progress from mobile/desktop nodes with the centralized server.
- **Procedure**:
  1. Offline nodes accumulate progress records in `localStorage` under `kubelabs_offline_progress` and queue events in `kubelabs_offline_sync_queue`.
  2. When network connectivity resumes, the client calls `KubeLabsOfflineEngine.flushSyncQueue(apiClient)`.
  3. Server endpoint `POST /api/sync` merges progress vectors using causal CRDT state resolution, awarding earned XP and recording lab completions without overwriting newer state.

### Runbook RB-05: Desktop Native Packaging (Tauri v2 & Electron)
- **Objective**: Compile and package cross-platform desktop executables.
- **Procedure**:
  ```bash
  # Test Tauri configuration
  node -e 'const conf = require("./deploy/desktop/tauri.conf.json"); console.log(conf.package.version);'
  
  # Run Electron desktop smoke test
  node deploy/desktop/electron-main.js
  ```

### Runbook RB-06: Mobile Native Packaging (Capacitor for Android & iOS)
- **Objective**: Synchronize web assets and build native Android APK / iOS IPA wrappers.
- **Procedure**:
  ```bash
  # Check Capacitor mobile configuration
  node -e 'const conf = require("./deploy/mobile/capacitor.config.json"); console.log(conf.appId);'
  ```

### Runbook RB-07: Incident Commander & MTTR Stopwatch Diagnostics
- **Objective**: Launch and resolve simulated production outages.
- **Procedure**:
  1. Start incident (e.g. etcd quorum loss):
     ```bash
     curl -X POST http://127.0.0.1:4100/api/incidents/inc-09-etcd-quorum-loss/start
     ```
  2. Inspect faulty state and execute remediation commands:
     ```bash
     # Inspect cluster state
     curl http://127.0.0.1:4100/api/cluster/resources?kind=Node
     ```
  3. Validate recovery:
     ```bash
     curl -X POST http://127.0.0.1:4100/api/incidents/inc-09-etcd-quorum-loss/validate
     ```
  4. Response includes `{ "resolved": true, "mttrSeconds": 42.5 }`.

### Runbook RB-08: Zero-Downtime Deployment, Probes & Graceful Connection Draining
- **Objective**: Execute rolling updates and verify graceful connection termination.
- **Procedure**:
  1. **Liveness Check**: `GET /api/livez` confirms server event loop is responsive.
  2. **Readiness Check**: `GET /api/readyz` confirms plugins and database are ready to accept traffic.
  3. **Graceful Drain**: When `SIGTERM` is received, the server:
     - Sets `isDraining = true`, causing `/readyz` to immediately return `503 Service Unavailable` so Kubernetes routes traffic away.
     - Permits in-flight requests to complete within the 5000ms safety window.
     - Closes keep-alive sockets and flushes the SQLite WAL database.

---

## 4. Master Test Plan & Quality Gates

| Test Suite | Scope | Verified Invariants |
|---|---|---|
| **`npm run test:stage1`** | `src/core/` VFS, YAML, JSONPath, Storage, Controllers | 41 tests: POSIX permissions, symlinks, stream redirection, multi-doc YAML, JSONPath recursion, SQLite WAL & CRDT sync. |
| **`npm run test:stage2`** | `src/core/` Shell AST, Pipelines, Scheduler, Network, Storage/Security | 35 tests: Streaming pipelines (grep, awk, sed), PTY VT100 buffer, scheduler affinities/taints, 7-stage packet tracer, CSI dynamic volumes. |
| **`npm run test:stage3`** | `src/core/` Multi-CLI, Observability, Autoscaling, Validation | 41 tests: kubectl subcommands, PromQL/LogQL evaluator, OTel pipeline validator, HPA/Karpenter, 18 assertion types. |
| **`npm run test:stage4`** | Curriculum Plugins, 15 Incidents, 8 Capstones, Ed25519 Certs | 13 tests: 26 domain plugins (52 labs), 8 incident classes, Well-Architected 4-pillar compiler, Ed25519 asymmetric signatures. |
| **`npm run test:stage5`** | UI Workbench, Offline Engine, Server Hardening | 16 tests: Split-pane layout, 44px touch targets, offlineEngine.js bundle, Service Worker v3, CSP/HSTS headers, rate limiter, Prometheus /metrics, probes, graceful drain. |
| **`npm test`** | Root Integration & Deterministic Solver Suite | 8 tests: Plugin manager verification, virtual cluster reconcilers, multi-CLI engine, 52/52 lab deterministic solvers, 15/15 incident solvers, Ed25519 validation. |
| **`npm run verify:subphases`** | 40-Subphase Sequential Ledger | 40/40 subphases PASS with granular millisecond execution telemetry. |
| **`npm run audit:self`** | 11-Agent Autonomous Governance Gate | 50/50 checks PASS: Zero external dependencies, memory RSS < 150MB, zero placeholders. |

---

## 5. Security & Threat Model Review Sign-Off

- **OS Shell Execution**: Zero `child_process` usage in runtime code (`src/` and `public/`). All commands execute in memory within the sandboxed `TerminalEngine`.
- **SQL Injection**: 100% of SQLite database queries in `src/db/` use parameterized prepared statements.
- **HTTP Hardening**: Strict Content-Security-Policy (CSP), Strict-Transport-Security (HSTS, 2 years), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, and `1MB` payload cap.
- **Memory Footprint**: Measured `~48MB` RSS during full 52-lab and 15-incident solver execution (well below the 150MB limit).
- **Asymmetric Trust**: Cryptographic certification records are signed with Ed25519 asymmetric keys and verifiable offline.

---

## 6. Production Readiness Checklist

- [x] Global Engineering Contract enforced (`"dependencies": {}`)
- [x] Complete PRD, System Architecture, 10 ADRs, and Staged Technical Blueprint published
- [x] 26 Technology Domain Plugins validated with zero schema errors
- [x] 52 Interactive Labs + 15 Production Incidents + 8 Capstones deterministically solved
- [x] 11-Agent Autonomous Framework (`npm run audit:self`) 50/50 checks green
- [x] 40-Subphase Sequential Execution Ledger (`npm run verify:subphases`) 40/40 green
- [x] Full Stage Test Suites (`test:stage1` through `test:stage5`) 146/146 tests green
- [x] Desktop (Tauri v2, Electron), Mobile (Capacitor), Helm 3, and Kubernetes StatefulSet configured
- [x] Observability Prometheus `/metrics`, `/livez`, `/readyz`, and graceful shutdown lifecycle verified
- [x] Final Production Sign-Off Complete.
