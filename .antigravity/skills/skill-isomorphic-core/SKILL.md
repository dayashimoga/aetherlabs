---
name: skill-isomorphic-core
description: Designs and maintains src/core/* modules with zero Node-only leakage and compiles public/js/offlineEngine.js automatically.
---

# skill-isomorphic-core

## Purpose
Enforces universal isomorphism across all engine subsystems in `src/core/`. Ensures that every algorithm, data structure, and reconciler runs without modification in Node.js 22+, WebWorkers, Desktop webviews, and Mobile webviews.

## Guidelines
1. **Single Source of Truth**: All core engine modules reside in `src/core/`. Never maintain duplicate logic in `src/engine/`.
2. **Zero Node-Only Leakage**: Avoid un-polyfilled Node.js-only modules (`node:child_process`, raw C++ bindings) inside `src/core/`. Use pure JavaScript primitives or abstracted storage/crypto adapters.
3. **Automated Bundle Generation**: Automatically build `public/js/offlineEngine.js` using `scripts/bundle-isomorphic.js` during the build lifecycle.
4. **Offline Parity**: Every feature available in the backend API must be functionally identical when executed client-side via `offlineEngine.js`.

