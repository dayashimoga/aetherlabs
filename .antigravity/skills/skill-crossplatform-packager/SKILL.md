---
name: skill-crossplatform-packager
description: Manages PWA Service Worker precaching, OPFS/SQLite sync adapters, Tauri v2 desktop builds (Win/Mac/Linux), and Capacitor iOS/Android responsive touch layouts.
---

# Cross-Platform Packaging & Offline Sync Skill (`skill-crossplatform-packager`)

## Role & Mission
Responsible for cross-platform distribution, responsive client-side UI/UX ergonomics, PWA Service Worker offline caching, and seamless vector-clock CRDT data synchronization across Web, Desktop (Windows, macOS, Linux), and Mobile (Android, iOS).

## Scope & Capabilities
1. **Responsive UI & Mobile Terminal Ergonomics**:
   - Adaptive layouts scaling from 360px mobile viewports to 4K ultra-wide monitors.
   - Touch targets >= 44x44px adhering to WCAG 2.1 AA accessibility.
   - Mobile virtual touch keybar docked above the on-screen keyboard providing quick keys: `kubectl`, `get`, `describe`, `apply -f`, `-n`, `|`, `grep`, `Tab`, `Ctrl+C`, `↑`, `↓`.
2. **Unified Isomorphic Offline Runtime**:
   - Bundles the core engine (`src/core/`) into `public/js/offlineEngine.js` and `public/sw.js`.
   - Pre-caches application shell, icons, stylesheets, and domain plugins.
   - Falls back transparently to client-side simulation when `navigator.onLine` is false or fetch requests fail.
3. **CRDT Vector-Clock Offline Sync**:
   - Implements IndexedDB / Origin Private File System (OPFS) storage adapter on browser/mobile.
   - Generates vector-clock stamped synchronization payloads capturing lab attempts, incident MTTRs, and certification credentials.
   - Merges offline mobile and desktop progress deterministically without data loss or split-brain conflicts.
4. **Desktop Packaging (Tauri v2 & Electron)**:
   - Configures Tauri v2 (`deploy/desktop/tauri.conf.json`) delivering lightweight native binaries (< 10MB installer, < 60MB RAM).
   - Optional local PTY bridge enabling users to toggle "Live Local Cluster Mode" to connect to real Minikube/Kind/Docker clusters.
5. **Mobile Packaging (Capacitor 6)**:
   - Configures Capacitor (`deploy/mobile/capacitor.config.json`) for Android Studio and Xcode compilation.
   - Native status bar, haptic feedback on command execution, and safe-area inset adaptation.

## Invariants
- 100% feature parity across all platforms: No feature may be disabled or mocked on mobile or offline browser mode.

