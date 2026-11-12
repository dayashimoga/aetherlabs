---
name: skill-topology-canvas
description: Builds the pan/zoom SVG/Canvas cluster topology graph and drag-and-drop node/edge Architecture Studio.
---

# skill-topology-canvas

## Purpose
Renders real-time cluster topology visualizations and interactive drag-and-drop cloud architecture canvases.

## Guidelines
1. **Interactive Cluster Topology (`public/js/topologyVisualizer.js`)**:
   - Hierarchical DAG layout rendering Ingress → Service → EndpointSlice → Pod → Node/PVC.
   - Smooth mouse wheel zoom, click-and-drag pan, and namespace filtering.
   - Animated packet particles along active connections.
   - Click node to inspect live YAML or stream pod logs.
2. **Architecture Studio (`public/js/architectureCanvas.js`)**:
   - Draggable component cards with input/output connection ports.
   - Directional cubic-bezier wire connections.
   - Real-time 4-pillar Well-Architected score calculation.
   - Chaos fault injection (e.g., "Kill AZ-1" SPOF testing).
   - Bi-directional synchronization with Kubernetes YAML and OpenTofu HCL code.

