# PRODUCT & UX/UI CONTRACT (KUBELABS v3.0)

Document: `.antigravity/contracts/02-PRODUCT-AND-UX-CONTRACT.md`  
Status: ACTIVE & ENFORCED

---

## 1. Focused 3-Column IDE Workbench (KodeKloud / Killercoda Standard)
The primary learning environment must present a full-viewport (100vh, zero outer window scrollbars), 3-column resizable layout:

### 1.1 Left Pane (28% width, collapsible)
- Progressive step-by-step interactive lab guide.
- Production scenario context & architecture diagram trigger.
- Progressive Socratic hints (Hint 1, Hint 2, Solution review).
- Real-time per-objective checkmarks.

### 1.2 Center Pane (44% width, tabbed full-height workspace)
- **Tab 1: Interactive xterm-style Terminal**:
  - Inline prompt (`learner@kubelabs:~$ `) with blinking cursor.
  - Full arrow-key cursor navigation (`←`/`→`), word jumping (`Ctrl+←`/`Ctrl+→`).
  - Command history navigation (`↑`/`↓`), reverse-i-search (`Ctrl+R`).
  - Terminal controls (`Ctrl+C` cancel, `Ctrl+L` clear).
  - Multi-line YAML heredoc (`cat <<EOF > manifest.yaml`) support.
  - Live resource-aware `<Tab>` completion.
- **Tab 2: Monaco-grade YAML/HCL Code Editor**:
  - Line numbers, syntax highlighting, schema validation/linting.
  - "Apply to Cluster" button with dry-run diff view.

### 1.3 Right Pane (28% width, tabbed)
- **Tab 1: Interactive Force-Directed / Layered DAG Topology Canvas**:
  - Pan, zoom, node search, click-to-inspect YAML/Logs.
  - Live network packet flow animation (`Ingress` → `Service` → `EndpointSlice` → `Pod` → `PVC`/`Node`).
- **Tab 2: Observability & Metrics Explorer**:
  - PromQL query runner, real-time time-series charts, Loki log tailer, Jaeger trace waterfall.
- **Tab 3: Validation & CIS Audit Details**:
  - Instant live assertion checks with deep diagnostic reports.

---

## 2. Customer-Facing Navigation Hierarchy
Replace any cluttered top bar with 5 clean, distinct customer-facing workspaces:
1. **Learning Paths & Catalog**: Curated tracks, domain accordions, and capstone project cards.
2. **Interactive Lab Workbench**: 3-column focused IDE for active labs.
3. **Incident Response War Room**: 24 production outages across 8 outage classes with live MTTR stopwatch.
4. **Interactive Architecture Studio**: Drag-and-drop node/edge canvas, Well-Architected 4-pillar scorer, and bi-directional YAML/HCL sync.
5. **Certifications & Skill Profile**: Timed exams, Ed25519 verifiable digital credentials, and 26-domain radar chart.

*Internal Governance Note*: The "11-Agent Quality Gate" is moved to an internal `/admin/diagnostics` route or footer developer modal accessible via `Ctrl+Shift+D`.

---

## 3. Cross-Platform & Accessibility (WCAG 2.1 AA)
- Touch targets must be strictly ≥ 44×44px.
- Context-aware Mobile Terminal Bar on Android/iOS: Inserts tokens at cursor without auto-executing incomplete or invalid syntax (preventing syntax errors like `describe kubectl`).
- Full keyboard navigation, visible focus indicators, and ARIA live regions for screen reader announcements.
- Dark, Light, and High-Contrast themes.

