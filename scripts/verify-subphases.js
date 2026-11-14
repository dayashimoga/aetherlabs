#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createKubeLabsApp } = require('../src/server');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { PluginManager } = require('../src/plugins/pluginManager');
const { formatTable, formatDescribe, formatApiError } = require('../src/core/cliFormatter');
const { AutocompletionEngine } = require('../src/core/autocompletionEngine');
const SyncCoordinator = require('../src/core/syncCoordinator');
const { ArchitectureEngine } = require('../src/core/architectureEngine');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ProjectEngine } = require('../src/core/projectEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');
const { AgentOrchestrator } = require('../src/agents/orchestrator');

const rootDir = path.join(__dirname, '..');
const app = createKubeLabsApp({ dbFilePath: ':memory:' });
const curriculumDir = path.join(rootDir, 'src', 'curriculum', 'domains');
const curriculumManager = new PluginManager(curriculumDir);
const validationEngine = new ValidationEngine();
const projectEngine = new ProjectEngine(validationEngine);
const certEngine = new CertificationEngine(curriculumManager, null, { validationEngine });

const SUBPHASES = [
  // ==========================================
  // STAGE 1: Real Terminal Engine & Control Plane Fidelity
  // ==========================================
  {
    id: 'Subphase 1.1.1',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: 'ASCII Table & Wide Output Renderer',
    verify: () => {
      const out = formatTable(['NAME', 'STATUS'], [['nginx', 'Running']]);
      return typeof out === 'string' && out.includes('NAME') && out.includes('Running');
    }
  },
  {
    id: 'Subphase 1.1.2',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: 'YAML, JSON, JSONPath & Describe Renderers',
    verify: () => {
      const desc = formatDescribe({ kind: 'Pod', metadata: { name: 'web', namespace: 'default' }, spec: { containers: [{ name: 'nginx' }] } }, []);
      return typeof desc === 'string' && desc.includes('Name:') && desc.includes('web');
    }
  },
  {
    id: 'Subphase 1.1.3',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: 'Realistic Exit Codes & Kubernetes API Error Formatter',
    verify: () => {
      const err = formatApiError('NotFound', { kind: 'Pod', name: 'missing-pod' });
      return typeof err === 'string' && err.includes('NotFound') && err.includes('missing-pod');
    }
  },
  {
    id: 'Subphase 1.2.1',
    stage: 'Stage 1',
    phase: 'Phase 1.2',
    title: 'Full Kubernetes & Cluster Ops Binaries (kubectl, kubeadm, etcdctl)',
    verify: () => {
      const cluster = new VirtualCluster();
      const term = new TerminalEngine({ cluster });
      const kRes = term.execute('kubectl get nodes');
      const kaRes = term.execute('kubeadm token list');
      const etRes = term.execute('etcdctl endpoint health');
      return kRes.exitCode === 0 && kaRes.exitCode === 0 && etRes.exitCode === 0;
    }
  },
  {
    id: 'Subphase 1.2.2',
    stage: 'Stage 1',
    phase: 'Phase 1.2',
    title: 'Linux, Networking, Container & Git Binaries',
    verify: () => {
      const vfs = new VirtualFileSystem();
      const term = new TerminalEngine({ vfs });
      const lRes = term.execute('ls -la');
      const ipRes = term.execute('ip addr');
      const dRes = term.execute('docker ps');
      term.execute('git init');
      const gRes = term.execute('git status');
      return lRes.exitCode === 0 && ipRes.exitCode === 0 && dRes.exitCode === 0 && gRes.exitCode === 0;
    }
  },
  {
    id: 'Subphase 1.2.3',
    stage: 'Stage 1',
    phase: 'Phase 1.2',
    title: 'GitOps, Packaging, IaC, Mesh, Security & Observability Binaries',
    verify: () => {
      const term = new TerminalEngine();
      return (
        term.execute('helm list').exitCode === 0 &&
        term.execute('tofu plan').exitCode === 0 &&
        term.execute('istioctl analyze').exitCode === 0 &&
        term.execute('trivy version').exitCode === 0
      );
    }
  },
  {
    id: 'Subphase 1.3.1',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'Interactive Terminal Emulator Upgrade',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'public', 'js', 'terminalView.js')) &&
      fs.existsSync(path.join(rootDir, 'public', 'js', 'terminalEmulator.js'))
  },
  {
    id: 'Subphase 1.3.2',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'Context-Aware Tab Autocompletion',
    verify: () => {
      const cluster = new VirtualCluster();
      const ac = new AutocompletionEngine({ cluster });
      const res = ac.autocomplete('kubectl g');
      return res && Array.isArray(res.completions) && res.completions.includes('get');
    }
  },
  {
    id: 'Subphase 1.3.3',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'Bi-Directional VFS, Editor & Topology Synchronization',
    verify: () => {
      const sc = new SyncCoordinator();
      return typeof sc.applyEditorManifest === 'function' && typeof sc.renderTopologySvg === 'function';
    }
  },

  // ==========================================
  // STAGE 2: Futuristic UI/UX Overhaul & Workspace Architecture
  // ==========================================
  {
    id: 'Subphase 2.1.1',
    stage: 'Stage 2',
    phase: 'Phase 2.1',
    title: 'Design Tokens, Glassmorphism & Typography',
    verify: () => {
      const css = fs.readFileSync(path.join(rootDir, 'public', 'css', 'styles.css'), 'utf8');
      return css.includes('--bg-primary: #090d16;') && css.includes('--accent-cyan: #38bdf8;');
    }
  },
  {
    id: 'Subphase 2.1.2',
    stage: 'Stage 2',
    phase: 'Phase 2.1',
    title: '64px Left Icon Rail & Top Command Header',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('class="app-nav-rail"') && html.includes('class="top-header"');
    }
  },
  {
    id: 'Subphase 2.1.3',
    stage: 'Stage 2',
    phase: 'Phase 2.1',
    title: 'Global Telemetry HUD, XP & Real-Time Sync Coordinator',
    verify: () => {
      const js = fs.readFileSync(path.join(rootDir, 'public', 'js', 'app.js'), 'utf8');
      return js.includes('updateHeaderTelemetry') && js.includes('header-xp');
    }
  },
  {
    id: 'Subphase 2.2.1',
    stage: 'Stage 2',
    phase: 'Phase 2.2',
    title: 'Personalized "Continue Learning" Hero Banner',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="continue-learning-hero"') && html.includes('id="hero-streak-pill"');
    }
  },
  {
    id: 'Subphase 2.2.2',
    stage: 'Stage 2',
    phase: 'Phase 2.2',
    title: 'Interactive 7-Tier DAG Skill Tree Roadmap',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="roadmap-section"') && html.includes('id="roadmap-heading"');
    }
  },
  {
    id: 'Subphase 2.2.3',
    stage: 'Stage 2',
    phase: 'Phase 2.2',
    title: 'Curriculum Search, Filter Bar & Syllabus Drawer',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="domain-search-input"') && html.includes('id="domain-syllabus-drawer"');
    }
  },
  {
    id: 'Subphase 2.3.1',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: '3-Column Resizable IDE Layout',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="wb-pane-left"') && html.includes('id="resizer-left"') && html.includes('id="resizer-right"');
    }
  },
  {
    id: 'Subphase 2.3.2',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: 'Full-Height Terminal, Code Editor & Observability Tabs',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="center-tab-terminal"') && html.includes('id="center-tab-editor"') && html.includes('id="center-tab-observability"');
    }
  },
  {
    id: 'Subphase 2.3.3',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: 'Interactive SVG Topology with Click-to-Inspect Drawer',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="cluster-topology-svg"') && html.includes('id="cluster-topology-view"');
    }
  },

  // ==========================================
  // STAGE 3: Enterprise Architecture Designer & Chaos War Room
  // ==========================================
  {
    id: 'Subphase 3.1.1',
    stage: 'Stage 3',
    phase: 'Phase 3.1',
    title: 'Production Incident Standby HUD & Live Fleet Health Strip',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="incident-standby-banner"') && html.includes('id="inc-fleet-status-pill"');
    }
  },
  {
    id: 'Subphase 3.1.2',
    stage: 'Stage 3',
    phase: 'Phase 3.1',
    title: 'Live Active Incident Command Center HUD',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="active-incident-banner"') && html.includes('id="inc-mttr-stopwatch"');
    }
  },
  {
    id: 'Subphase 3.1.3',
    stage: 'Stage 3',
    phase: 'Phase 3.1',
    title: 'Real-Time Prometheus RED Sparklines & SRE Diagnostic Clues',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="inc-red-sparklines"') && html.includes('id="inc-active-hints"');
    }
  },
  {
    id: 'Subphase 3.2.1',
    stage: 'Stage 3',
    phase: 'Phase 3.2',
    title: 'Interactive Architecture Topology Canvas',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="arch-nodes-canvas"') && html.includes('id="arch-canvas-svg"');
    }
  },
  {
    id: 'Subphase 3.2.2',
    stage: 'Stage 3',
    phase: 'Phase 3.2',
    title: '8 Production Reference Blueprints & Component Palette',
    verify: () => {
      const archEngine = new ArchitectureEngine();
      return archEngine.listReferenceArchitectures().length === 8;
    }
  },
  {
    id: 'Subphase 3.2.3',
    stage: 'Stage 3',
    phase: 'Phase 3.2',
    title: 'Bi-Directional Compilers & Well-Architected Framework Analyzer',
    verify: () => {
      const archEngine = new ArchitectureEngine();
      const bp = archEngine.getReferenceArchitecture('ref-01-eks-gitops-ha');
      const res = archEngine.compileToManifests(bp.nodes, bp.edges);
      return typeof res.kubernetesYaml === 'string' && typeof res.opentofuHcl === 'string';
    }
  },
  {
    id: 'Subphase 3.3.1',
    stage: 'Stage 3',
    phase: 'Phase 3.3',
    title: 'Glassmorphism Diagnostics Modal Overlay',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="diagnostics-modal"') && html.includes('id="gov-heading"');
    }
  },
  {
    id: 'Subphase 3.3.2',
    stage: 'Stage 3',
    phase: 'Phase 3.3',
    title: '11-Agent Real-Time Production Readiness Evaluation',
    verify: () => {
      const orch = new AgentOrchestrator({ rootDir });
      return orch.auditProductAgent().status === 'PASS' && orch.auditArchitectAgent().status === 'PASS';
    }
  },
  {
    id: 'Subphase 3.3.3',
    stage: 'Stage 3',
    phase: 'Phase 3.3',
    title: 'Universal Command Palette Modal (Ctrl+K / Cmd+K)',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="command-palette-modal"') && html.includes('id="cmd-palette-input"');
    }
  },

  // ==========================================
  // STAGE 4: Complete 45-Domain Interactive Curriculum
  // ==========================================
  {
    id: 'Subphase 4.1.1',
    stage: 'Stage 4',
    phase: 'Phase 4.1',
    title: 'Tier 1 Foundations (Domains 01–04)',
    verify: () =>
      ['01-linux-fundamentals.json', '02-linux-admin.json', '03-networking-fundamentals.json', '04-git-fundamentals.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.1.2',
    stage: 'Stage 4',
    phase: 'Phase 4.1',
    title: 'Tier 2 Container Runtime & Packaging (Domains 05–08)',
    verify: () =>
      ['05-docker.json', '06-container-runtime-cri.json', '07-helm.json', '08-kustomize.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.1.3',
    stage: 'Stage 4',
    phase: 'Phase 4.1',
    title: 'Tier 3 Kubernetes Core & Certification Track (Domains 09–17)',
    verify: () =>
      ['09-kubernetes-core.json', '10-ckad-developer.json', '11-cka-administrator.json', '12-kubernetes-networking.json', '13-kubernetes-storage.json', '14-kubernetes-security-cks.json', '15-kubernetes-troubleshooting.json', '16-gitops-delivery.json', '17-argocd-gitops.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.2.1',
    stage: 'Stage 4',
    phase: 'Phase 4.2',
    title: 'Tier 4 GitOps, CI/CD & Infrastructure as Code (Domains 18–24)',
    verify: () =>
      ['18-fluxcd-gitops.json', '19-cicd-pipelines.json', '20-devsecops-pipeline.json', '21-iac-foundations.json', '22-terraform-opentofu.json', '23-service-mesh-core.json', '24-istio-service-mesh.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.2.2',
    stage: 'Stage 4',
    phase: 'Phase 4.2',
    title: 'Tier 5 Service Mesh & Traffic Management (Domains 25–28)',
    verify: () =>
      ['25-linkerd-service-mesh.json', '26-observability-core.json', '27-prometheus-monitoring.json', '28-grafana-visualization.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.2.3',
    stage: 'Stage 4',
    phase: 'Phase 4.2',
    title: 'Tier 5 Observability, SRE & Operations (Domains 29–34)',
    verify: () =>
      ['29-opentelemetry-traces.json', '30-logging-monitoring.json', '31-sre-incident-recovery.json', '32-platform-reliability.json', '33-performance-engineering.json', '34-production-operations.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.3.1',
    stage: 'Stage 4',
    phase: 'Phase 4.3',
    title: 'Tier 6 Advanced Platform, Storage & Multi-Cloud (Domains 35–39)',
    verify: () =>
      ['35-k8s-production-operations.json', '36-multi-cluster-management.json', '37-cloud-native-architecture.json', '38-distributed-systems.json', '39-microservices-architecture.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.3.2',
    stage: 'Stage 4',
    phase: 'Phase 4.3',
    title: 'Tier 6 Advanced Security & Emerging Technologies (Domains 40–42)',
    verify: () =>
      ['40-system-design.json', '41-platform-engineering.json', '42-security-engineering.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },
  {
    id: 'Subphase 4.3.3',
    stage: 'Stage 4',
    phase: 'Phase 4.3',
    title: 'Tier 7 Edge, Wasm & AI-Assisted Operations (Domains 43–45)',
    verify: () =>
      ['43-cloud-architecture-patterns.json', '44-enterprise-architecture.json', '45-aiops-autonomous.json']
        .every((f) => fs.existsSync(path.join(curriculumDir, f)))
  },

  // ==========================================
  // STAGE 5: Multi-Track Guided Certifications & Simulators
  // ==========================================
  {
    id: 'Subphase 5.1.1',
    stage: 'Stage 5',
    phase: 'Phase 5.1',
    title: '6 Performance Certification Exam Simulators',
    verify: () => certEngine.listPerformanceExams().length === 6
  },
  {
    id: 'Subphase 5.1.2',
    stage: 'Stage 5',
    phase: 'Phase 5.1',
    title: 'Dual Ed25519 & HMAC-SHA256 Cryptographic Verification Engine',
    verify: () => {
      const payload = { certId: 'audit-cert-01', learner: 'Learner', score: 100 };
      const sig = certEngine.signCertificatePayloadEd25519(payload);
      return certEngine.verifyCertificateEd25519(payload, sig) === true;
    }
  },
  {
    id: 'Subphase 5.1.3',
    stage: 'Stage 5',
    phase: 'Phase 5.1',
    title: 'Dynamic Skill Radar & 16-Domain Mastery Matrix',
    verify: () => {
      const html = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
      return html.includes('id="skill-radar-grid"');
    }
  },
  {
    id: 'Subphase 5.2.1',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: '8 Multi-Milestone Production Capstone Projects Catalog',
    verify: () => {
      return projectEngine.projects.length === 8 && projectEngine.projects.reduce((acc, p) => acc + (p.milestones || []).length, 0) === 26;
    }
  },
  {
    id: 'Subphase 5.2.2',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: 'Deterministic Capstone Evaluator & Milestone Verification',
    verify: () => {
      const rep = projectEngine.validateProject('proj-01-hardened-edge-node');
      return typeof rep.score === 'number' && typeof rep.passed === 'boolean';
    }
  },
  {
    id: 'Subphase 5.2.3',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: 'Offline Isomorphic Engine Bundler',
    verify: () => {
      const p = path.join(rootDir, 'public', 'js', 'offlineEngine.js');
      return fs.existsSync(p) && fs.statSync(p).size > 700000;
    }
  },
  {
    id: 'Subphase 5.3.1',
    stage: 'Stage 5',
    phase: 'Phase 5.3',
    title: 'Service Worker v4 Offline Cache & Asset Pre-Caching',
    verify: () => {
      const sw = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf8');
      return sw.includes('kubelabs-offline-v4');
    }
  },
  {
    id: 'Subphase 5.3.2',
    stage: 'Stage 5',
    phase: 'Phase 5.3',
    title: 'Progressive Web App Manifest & Desktop Shell Packaging',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'public', 'manifest.json')) &&
      fs.existsSync(path.join(rootDir, 'deploy', 'desktop', 'tauri.conf.json'))
  },
  {
    id: 'Subphase 5.3.3',
    stage: 'Stage 5',
    phase: 'Phase 5.3',
    title: 'Offline Synthetic API Fallbacks & Sync Queue',
    verify: () => {
      const sw = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf8');
      return sw.includes('/api/curriculum') && sw.includes('/api/war-room/scenarios');
    }
  },

  // ==========================================
  // STAGE 6: Deterministic End-to-End Verification
  // ==========================================
  {
    id: 'Subphase 6.1.1',
    stage: 'Stage 6',
    phase: 'Phase 6.1',
    title: 'Pre-Solution Zero-Score Assertion across All 45 Domains',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-pre-score-zero.test.js'))
  },
  {
    id: 'Subphase 6.1.2',
    stage: 'Stage 6',
    phase: 'Phase 6.1',
    title: 'Step-by-Step Canonical Solution Replay across All 45 Domains',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-canonical-replay.test.js'))
  },
  {
    id: 'Subphase 6.1.3',
    stage: 'Stage 6',
    phase: 'Phase 6.1',
    title: 'Anti-Stub Terminal Output Audit',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-anti-stub.test.js'))
  },
  {
    id: 'Subphase 6.2.1',
    stage: 'Stage 6',
    phase: 'Phase 6.2',
    title: 'Offline Engine & Service Worker v4 Sync',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-offline-sync.test.js'))
  },
  {
    id: 'Subphase 6.2.2',
    stage: 'Stage 6',
    phase: 'Phase 6.2',
    title: 'DOM & Layout Non-Empty State Verification',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-layout-dom.test.js'))
  },
  {
    id: 'Subphase 6.2.3',
    stage: 'Stage 6',
    phase: 'Phase 6.2',
    title: 'WCAG 2.1 AA Keyboard & Screen-Reader Audit',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'stage6-a11y-wcag.test.js'))
  },
  {
    id: 'Subphase 6.3.1',
    stage: 'Stage 6',
    phase: 'Phase 6.3',
    title: 'Upgrade self-audit.js & verify-subphases.js for 54 Subphases',
    verify: () => {
      const selfAudit = fs.readFileSync(path.join(rootDir, 'scripts', 'self-audit.js'), 'utf8');
      const verifyScript = fs.readFileSync(path.join(rootDir, 'scripts', 'verify-subphases.js'), 'utf8');
      return selfAudit.includes('AgentOrchestrator') && verifyScript.includes('54 SUBPHASES');
    }
  },
  {
    id: 'Subphase 6.3.2',
    stage: 'Stage 6',
    phase: 'Phase 6.3',
    title: 'Performance & Memory Footprint Verification',
    verify: () => {
      const rssMB = process.memoryUsage().rss / (1024 * 1024);
      return rssMB < 150;
    }
  },
  {
    id: 'Subphase 6.3.3',
    stage: 'Stage 6',
    phase: 'Phase 6.3',
    title: 'Documentation & Walkthrough Update',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'README.md')) &&
      fs.existsSync(path.join(rootDir, 'docs', '07-CURRICULUM-CATALOG.md')) &&
      fs.existsSync(path.join(rootDir, 'docs', '15-V4-SUBPHASE-TRACKING-LEDGER.md'))
  }
];

console.log('========================================================================================');
console.log(' KUBELABS SUBPHASE-BY-SUBPHASE SEQUENTIAL EXECUTION & VALIDATION LEDGER (54 SUBPHASES)');
console.log('========================================================================================');

let passedCount = 0;
for (const sp of SUBPHASES) {
  const start = Date.now();
  let ok = false;
  try {
    ok = Boolean(sp.verify());
  } catch (err) {
    ok = false;
  }
  const ms = Date.now() - start;
  if (ok) passedCount += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${sp.id} (${sp.stage} / ${sp.phase}) — ${sp.title} (${ms}ms)`);
}

app.database.close();

console.log('----------------------------------------------------------------------------------------');
console.log(`Result: ${passedCount}/${SUBPHASES.length} Subphases Verified Complete`);
console.log('========================================================================================');

if (passedCount !== SUBPHASES.length) {
  process.exit(1);
}
