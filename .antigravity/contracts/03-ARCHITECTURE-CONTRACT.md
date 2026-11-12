# ARCHITECTURE CONTRACT (KUBELABS v3.0)

Document: `.antigravity/contracts/03-ARCHITECTURE-CONTRACT.md`  
Status: ACTIVE & ENFORCED

---

## 1. Atomic State Synchronization & Session Binding
- Switching between labs, incidents, or capstones must atomically:
  1. Reset or re-scope the active session's `VirtualCluster` and in-memory `VirtualFileSystem`.
  2. Re-bind the `ValidationEngine` assertion set to the exact `activeLabId`.
  3. Clear all stale validation results and error logs immediately (< 16ms).
- Assertions from previously completed or launched tasks (e.g., `production/commerce-sa`) must never bleed into the active lab (e.g., `order-processor`).

## 2. Storage & Offline-First State Synchronization
- Universal persistence abstraction (`StorageAdapter`):
  - **Server / Desktop**: Native `node:sqlite` in WAL mode (`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`).
  - **Browser / Mobile Webview**: `IndexedDB` and Origin Private File System (`OPFS`).
- **Conflict-Free Replicated Data Types (CRDT)**:
  - Synchronized via deterministic Hybrid Logical Clocks (HLC) and Last-Write-Wins (LWW) entity resolution.
  - Progress achieved offline on mobile or desktop automatically merges without conflict upon reconnection.

## 3. Interactive Topology & Canvas Engines
- **Cluster Topology Visualizer (`public/js/topologyVisualizer.js`)**:
  - Hierarchical Sugiyama/DAG layout with smooth mouse wheel zoom and pan drag.
  - Animated traffic particles along active network edges.
  - Interactive click drawer displaying live YAML manifests and container logs.
- **Architecture Designer (`public/js/architectureCanvas.js`)**:
  - HTML5 `<canvas>` / SVG node-graph with draggable component cards.
  - Input/output connection ports and cubic-bezier directional wiring.
  - Real-time 4-pillar Well-Architected calculation (Security, Reliability, Performance, Cost).
  - Single Point of Failure (SPOF) fault injection engine.
  - Bi-directional synchronization with Kubernetes YAML and OpenTofu HCL.
