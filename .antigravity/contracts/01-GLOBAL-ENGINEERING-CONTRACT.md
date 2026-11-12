# GLOBAL ENGINEERING CONTRACT (KUBELABS v3.0)

Document: `.antigravity/contracts/01-GLOBAL-ENGINEERING-CONTRACT.md`  
Status: ACTIVE & ENFORCED

---

## 1. Zero-Mock / Zero-Placeholder Invariant
Every Kubernetes controller, CLI flag, YAML/HCL parser, PromQL evaluator, and lab validator must be 100% implemented. Stubs, `TODO` comments, fake UI cards, or regex command-history grading are strictly prohibited. State transitions must reflect true Kubernetes control plane and Linux operating system semantics.

## 2. Single Source of Truth Isomorphic Core
Consolidate all engine modules exclusively inside `src/core/`. Delete duplicate implementations in `src/engine/` and build `public/js/offlineEngine.js` directly from `src/core/` via an automated bundler script (`scripts/bundle-isomorphic.js`) so Server, Desktop, Mobile, and Offline PWA never diverge. Any enhancement to core logic must be made in `src/core/` only.

## 3. Dual-Execution Architecture
- **Mode A (Deterministic In-Memory Engine)**: Runs on all platforms (Web, iOS, Android, Windows, macOS, Linux) with <60MB RAM footprint and full state-graph reconciliation without host dependencies.
- **Mode B (Live Kubeconfig / Container Bridge)**: On Desktop (Win/Mac/Linux via Tauri) and Server, users can attach a real local cluster (`kind`, `k3s`, `minikube`, `eks`) via WebSocket PTY + Kubeconfig proxy to execute real Linux binaries and Kubernetes API calls.

## 4. Strict Quality Gate Enforcement
No subphase is complete until:
- `npm test` passes with 0 errors.
- `npm run verify:subphases` passes all subphases with 0 errors.
- `npm run audit:self` passes all quality gates with 0 errors and 0 warnings.
- Low-resource budget is respected (<65MB idle, <150MB peak RSS).
