---
name: skill-crossplatform-release
description: Configures Tauri v2 (Windows/macOS/Linux), Capacitor 6 (Android/iOS), Service Worker v4, Docker rootless builds, and GitHub Actions pipelines.
---

# skill-crossplatform-release

## Purpose
Manages cross-platform packaging, containerization, native app wrappers, and continuous delivery pipelines across Windows, macOS, Linux, Android, and iOS.

## Guidelines
1. **Desktop Packaging**: Maintain Tauri v2 configuration (`deploy/desktop/tauri.conf.json`) and Electron fallback (`deploy/desktop/electron-main.js`) with native window chrome and embedded SQLite storage.
2. **Mobile Packaging**: Maintain Capacitor 6 configuration (`deploy/mobile/capacitor.config.json`) with safe-area insets (`env(safe-area-inset-*)`), virtual keyboard viewport adaptation (`visualViewport`), and touch ergonomics (≥ 44×44px touch targets).
3. **Offline PWA**: Maintain Service Worker shell precaching (`public/sw.js`) and ensure offline bundle parity via `public/js/offlineEngine.js`.
4. **CI/CD & Security**: Maintain multi-arch container builds, zero-CVE posture, strict security headers (CSP, HSTS), and automated release workflows in `.github/workflows/`.

