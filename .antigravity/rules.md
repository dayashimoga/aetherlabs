# GLOBAL ENGINEERING CONTRACT (KUBELABS v3.0)

1. ZERO PLACEHOLDERS: Every controller, CLI flag, lab solver, and incident scenario must be 100% implemented. No `TODO`, `FIXME`, stub returns, or regex history grading.
2. ISOMORPHIC CORE INVARIANT: All code in `src/core/` MUST run in both Node.js 22+ and Browser WebWorkers without modification.
3. STATE-GRAPH GRADING: Labs and incidents are validated exclusively against the reconciled cluster resource graph, metrics time-series, and filesystem state—never by grepping terminal history.
4. DETERMINISTIC SOLVABILITY: Every lab/incident must fail validation at initial state (0%), pass 100% when its `canonicalSolution` commands are executed in a clean session, and clean up cleanly on reset.
5. CROSS-PLATFORM UX: Touch targets >= 44x44px, WCAG 2.1 AA contrast, responsive layout from 360px (iOS/Android) to 3840px (4K Desktop), and mobile quick-action terminal bar.
6. SECURITY PERIMETER: Strict CSP, parameterized SQLite queries, zero `child_process` execution in sandbox mode, and Ed25519 cryptographic signing for credentials.
