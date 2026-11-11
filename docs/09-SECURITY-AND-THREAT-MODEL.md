# Security Architecture, STRIDE Threat Model & Compliance Matrix

**Document ID**: SEC-KUBELABS-2026-001  
**Version**: 1.0.0  
**Owner**: Security Reviewer Agent (`agent-security`)

---

## 1. STRIDE Threat Model

| Threat Category | Attack Vector | KubeLabs Architectural Mitigation | Verification Gate |
|---|---|---|---|
| **S — Spoofing** | Forged certification credentials or tampered exam completion payloads | All issued certificates are signed server-side using HMAC-SHA256 (`node:crypto`) in `src/engine/certificationEngine.js` and verified via `/api/certifications/verify`. | `tests/kubelabs.test.js` Suite 7 |
| **T — Tampering** | SQL injection via terminal history, lab IDs, or profile inputs | `100%` of database operations in `src/db/database.js` use parameterized prepared statements (`db.prepare(...)`). | `agent-security` Audit |
| **R — Repudiation** | Unaudited lab completion claims or silent state mutations | Every lab validation generates a deterministic SHA-256 verification hash and logs terminal history with timestamps and exit codes. | `src/db/database.js` |
| **I — Information Disclosure** | Path traversal (`../../etc/passwd`) on static asset server | `serveStaticAsset` in `src/api/router.js` normalizes paths and enforces `fullPath.startsWith(this.publicDir)` before serving any file. | `src/api/router.js` |
| **D — Denial of Service** | Memory exhaustion via oversized HTTP JSON payloads or heavy VM clusters | `readJsonBody` enforces a strict `1MB` payload ceiling and destroys sockets exceeding the cap; VirtualCluster runs in `< 50MB` RSS. | `src/api/router.js` |
| **E — Elevation of Privilege** | Remote Code Execution (RCE) via user terminal commands (`; rm -rf /`, backticks, subshells) | `TerminalEngine` (`src/engine/terminalEngine.js`) never invokes `child_process.exec`/`spawn`. Commands execute strictly against the in-memory `VirtualCluster` state tree. | `agent-security` Audit |

---

## 2. Supply-Chain & Runtime Hardening (SLSA & CIS Benchmarks)

1. **Zero Third-Party Runtime Dependencies**: `package.json` defines `"dependencies": {}`, eliminating transitive npm supply-chain attacks.
2. **Restricted Pod Security Profile**: Self-hosting manifest (`deploy/kubernetes/kubelabs-k8s.yaml`) and `Dockerfile` run as UID/GID `10001:10001` (`runAsNonRoot: true`), `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, and drop `ALL` Linux capabilities.
3. **Strict Content Security Policy (CSP)**: Every HTTP response injects `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.

