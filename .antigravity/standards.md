# ANTIGRAVITY IDE STANDARDS & GATES (KUBELABS v3.0)

Document: `.antigravity/standards.md`  
Status: ACTIVE & ENFORCED

---

## 1. Coding Standards
- **Language Level**: Modern ES2024 strict mode across all modules.
- **State Transitions**: Immutable state mutations and pure functional transitions where possible.
- **Type Annotations**: Comprehensive JSDoc type annotations on all exported classes and public methods.
- **Complexity**: Maximum cyclomatic complexity of 15 per function.
- **Robustness**: Zero unhandled promise rejections; defensive error boundaries across all parsers.

## 2. Security Standards
- **Zero-Dependency Supply Chain**: Strictly `"dependencies": {}` in `package.json`.
- **Content-Security-Policy**: Enforce strict CSP headers (`default-src 'self'`).
- **SQL Sanitization**: All SQLite queries must use parameterized prepared statements.
- **DOM Sanitization**: Zero `innerHTML` with unsanitized user strings; all SVG/HTML renders must escape dynamic inputs.
- **Cryptographic Trust**: Ed25519 digital signatures for certification credentials.
- **Rate Limiting**: Bounded token-bucket rate limiting on all public API endpoints.

## 3. Testing Standards
- **Unit Tests**: Full coverage for controllers, parsers (YAML, JSONPath, shell, PromQL, LogQL), and VFS.
- **Integration Tests**: Verification of HTTP API endpoints, session isolation, and rate limiter.
- **Deterministic Solvers**: Automated test harness proving 100% of labs and incidents start at 0% and reach 100% with `canonicalSolution`.
- **UI State Synchronization**: Automated verification that changing labs/incidents atomically binds matching validation assertions.
- **Load & Memory Budgets**: Memory RSS < 65MB idle, < 150MB peak under 500 concurrent sessions.

## 4. Documentation Standards
- Architecture documents, API OpenAPI 3.1 specifications, operations runbooks, and user guides must be synchronized in the same commit as functional code changes.
- Zero stale references or mismatched scenario counts.

---

## 5. Definition of Ready (DoR) & Definition of Done (DoD)

### Definition of Ready (DoR)
1. Target files and modules identified.
2. State-graph inputs, outputs, and Kubernetes resource schemas specified.
3. Declarative validation assertions defined (minimum 4 per lab).
4. UI wireframe and layout constraints established.

### Definition of Done (DoD)
1. Code fully implemented with zero placeholders, stubs, or TODO comments.
2. Isomorphic bundle `public/js/offlineEngine.js` regenerated and verified.
3. Master test suite and stage tests passing 100% (`npm test`, `npm run test:stage*`).
4. Subphase verification ledger passing (`npm run verify:subphases`).
5. 11-agent self-audit passing 100% (`npm run audit:self`).
6. UI verified at 360px (Mobile), 1024px (Tablet), and 1920px (Desktop) viewports.
7. Documentation and release runbooks updated.

