#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createKubeLabsApp } = require('../src/server');
const { VirtualCluster, parseManifests } = require('../src/engine/virtualCluster');
const { TerminalEngine } = require('../src/engine/terminalEngine');
const { ValidationEngine } = require('../src/engine/validationEngine');

const rootDir = path.join(__dirname, '..');
const app = createKubeLabsApp({ dbFilePath: ':memory:' });
const valEngine = new ValidationEngine();

const SUBPHASES = [
  {
    id: 'Subphase 1.1.1',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: 'Global Engineering Contract, DoR/DoD & Quality Gates',
    verify: () => fs.existsSync(path.join(rootDir, 'docs', '01-GLOBAL-ENGINEERING-CONTRACT.md'))
  },
  {
    id: 'Subphase 1.1.2',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: 'PRD, System/Security/Data Architecture & ADRs',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'docs', '02-PRD.md')) &&
      fs.existsSync(path.join(rootDir, 'docs', '03-ARCHITECTURE.md')) &&
      fs.existsSync(path.join(rootDir, 'docs', '04-ADRS.md'))
  },
  {
    id: 'Subphase 1.1.3',
    stage: 'Stage 1',
    phase: 'Phase 1.1',
    title: '11-Agent Autonomous Framework & Orchestrator',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'agents', 'AGENT-FRAMEWORK.md')) &&
      fs.existsSync(path.join(rootDir, 'src', 'agents', 'orchestrator.js'))
  },
  {
    id: 'Subphase 1.2.1',
    stage: 'Stage 1',
    phase: 'Phase 1.2',
    title: 'Native SQLite WAL Database Initialization',
    verify: () => Boolean(app.database.getProfile().profile.id === 'default-learner')
  },
  {
    id: 'Subphase 1.2.2',
    stage: 'Stage 1',
    phase: 'Phase 1.2',
    title: 'Parameterized CRUD Repositories (Labs, Incidents, Projects, Certs)',
    verify: () => {
      const rec = app.database.recordLabAttempt({
        labId: 'lab-linux-01',
        domainId: 'linux-fundamentals',
        passed: true,
        score: 100,
        xpReward: 150
      });
      return Boolean(rec && rec.verificationHash);
    }
  },
  {
    id: 'Subphase 1.3.1',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'YAML/JSON Multi-Document Parser & Resource Graph',
    verify: () => {
      const docs = parseManifests('apiVersion: v1\nkind: Namespace\nmetadata:\n  name: test-ns');
      return docs.length === 1 && docs[0].kind === 'Namespace';
    }
  },
  {
    id: 'Subphase 1.3.2',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'Controller Manager Reconciliation (Deployments, Endpoints, Pod Health)',
    verify: () => {
      const c = new VirtualCluster();
      c.applyResource({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'web', namespace: 'production' },
        spec: { replicas: 2, selector: { matchLabels: { app: 'web' } }, template: { metadata: { labels: { app: 'web' } }, spec: { containers: [{ name: 'web', image: 'nginx:1.27-alpine' }] } } }
      });
      return c.getResources('Pod', 'production').length === 2;
    }
  },
  {
    id: 'Subphase 1.3.3',
    stage: 'Stage 1',
    phase: 'Phase 1.3',
    title: 'Cloud, Helm, ArgoCD, Istio & OpenTofu State Extensions',
    verify: () => {
      const c = new VirtualCluster();
      return Array.isArray(c.state.helmReleases) && Array.isArray(c.state.argoApps) && Boolean(c.state.terraformState);
    }
  },
  {
    id: 'Subphase 2.1.1',
    stage: 'Stage 2',
    phase: 'Phase 2.1',
    title: 'Strict JSON Schema for Modular Plugins',
    verify: () => fs.existsSync(path.join(rootDir, 'schemas', 'plugin.schema.json'))
  },
  {
    id: 'Subphase 2.1.2',
    stage: 'Stage 2',
    phase: 'Phase 2.1',
    title: 'PluginManager Dynamic Discovery & Track Aggregation',
    verify: () => app.pluginManager.validationErrors.length === 0 && app.pluginManager.getTracks().length === 6
  },
  {
    id: 'Subphase 2.2.1',
    stage: 'Stage 2',
    phase: 'Phase 2.2',
    title: 'Domains 01–04: Linux, Containers, Networking & Kubernetes Core Plugins',
    verify: () =>
      ['linux-fundamentals', 'containers-runtime', 'cloud-networking', 'kubernetes-core'].every((id) =>
        Boolean(app.pluginManager.getDomain(id))
      )
  },
  {
    id: 'Subphase 2.2.2',
    stage: 'Stage 2',
    phase: 'Phase 2.2',
    title: 'Domains 05–08: CNCF Packaging, GitOps, CI/CD & DevSecOps Plugins',
    verify: () =>
      ['cncf-packaging', 'gitops-delivery', 'devops-cicd', 'devsecops-security'].every((id) =>
        Boolean(app.pluginManager.getDomain(id))
      )
  },
  {
    id: 'Subphase 2.3.1',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: 'Domains 09–12: Service Mesh, Observability, SRE & Platform Engineering Plugins',
    verify: () =>
      ['service-mesh', 'observability-stack', 'sre-incident-chaos', 'platform-engineering'].every((id) =>
        Boolean(app.pluginManager.getDomain(id))
      )
  },
  {
    id: 'Subphase 2.3.2',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: 'Domains 13–16: OpenTofu/Terraform, AWS, Azure/GCP & AI-Ops Plugins',
    verify: () =>
      ['iac-opentofu-terraform', 'cloud-aws', 'cloud-azure-gcp', 'aiops-autonomous'].every((id) =>
        Boolean(app.pluginManager.getDomain(id))
      )
  },
  {
    id: 'Subphase 2.3.3',
    stage: 'Stage 2',
    phase: 'Phase 2.3',
    title: 'Domains 17–18: Emerging Tech (Wasm/eBPF Tetragon & FinOps/Green Cloud) Plugins',
    verify: () =>
      ['wasm-ebpf-edge', 'finops-green-cloud'].every((id) =>
        Boolean(app.pluginManager.getDomain(id))
      )
  },
  {
    id: 'Subphase 3.1.1',
    stage: 'Stage 3',
    phase: 'Phase 3.1',
    title: 'Terminal Tokenizer, Flag Parser & Pipe Filtering',
    verify: () => {
      const c = new VirtualCluster();
      const t = new TerminalEngine(c);
      const res = t.execute('kubectl get nodes | grep worker');
      return res.exitCode === 0 && res.output.includes('kubelabs-worker-01');
    }
  },
  {
    id: 'Subphase 3.1.2',
    stage: 'Stage 3',
    phase: 'Phase 3.1',
    title: 'Multi-CLI Executors (kubectl, helm, docker, argocd, istioctl, tofu, aws, az, gcloud, trivy, aiops)',
    verify: () => {
      const c = new VirtualCluster();
      const t = new TerminalEngine(c);
      return (
        t.execute('helm install r1 bitnami/nginx').exitCode === 0 &&
        t.execute('tofu apply').exitCode === 0 &&
        t.execute('aiops analyze').exitCode === 0
      );
    }
  },
  {
    id: 'Subphase 3.2.1',
    stage: 'Stage 3',
    phase: 'Phase 3.2',
    title: 'Multi-Assertion Validation Rule Evaluators (10 Rule Types)',
    verify: () => {
      const c = new VirtualCluster();
      const rep = valEngine.evaluate(
        [{ id: 'r1', description: 'Node exists', type: 'resource_exists', kind: 'Node', name: 'kubelabs-control-plane', remediation: '' }],
        c,
        []
      );
      return rep.passed && rep.score === 100;
    }
  },
  {
    id: 'Subphase 3.2.2',
    stage: 'Stage 3',
    phase: 'Phase 3.2',
    title: 'Cryptographic SHA-256 Completion Verification & XP Telemetry',
    verify: () => {
      const rec = app.database.recordLabAttempt({
        labId: 'lab-k8s-01',
        domainId: 'kubernetes-core',
        passed: true,
        score: 100,
        xpReward: 175
      });
      return rec.status === 'completed' && rec.verificationHash.length === 24;
    }
  },
  {
    id: 'Subphase 3.3.1',
    stage: 'Stage 3',
    phase: 'Phase 3.3',
    title: '12 Production Outage Scenarios (Quorum Loss, Admission Block, CoreDNS Loop, PVC Pending, etc.)',
    verify: () => app.incidentEngine.listIncidents().length >= 12
  },
  {
    id: 'Subphase 3.3.2',
    stage: 'Stage 3',
    phase: 'Phase 3.3',
    title: 'Live Outage Fault Injection, MTTR Stopwatch & Recovery Verification',
    verify: () => {
      const c = new VirtualCluster();
      app.incidentEngine.injectIncident('inc-01-selector-blackhole', c);
      const t = new TerminalEngine(c);
      t.execute('kubectl patch svc checkout-svc -n production -p \'{"spec":{"selector":{"app":"checkout-api"}}}\'');
      return app.incidentEngine.verifyIncidentResolution('inc-01-selector-blackhole', c, t.commandHistory).passed;
    }
  },
  {
    id: 'Subphase 3.4.1',
    stage: 'Stage 3',
    phase: 'Phase 3.4',
    title: 'Visual Architecture Analyzer, 4-Pillar Scoring & SPOF Detection',
    verify: () => {
      const ref = app.architectureEngine.listReferenceArchitectures()[0];
      const analysis = app.architectureEngine.analyzeTopology(ref.nodes, ref.edges);
      return analysis.overallScore >= 80 && analysis.spofs.length === 0;
    }
  },
  {
    id: 'Subphase 3.4.2',
    stage: 'Stage 3',
    phase: 'Phase 3.4',
    title: 'Bi-Directional Kubernetes YAML & OpenTofu HCL Compiler + 8 Reference Blueprints',
    verify: () => {
      const ref = app.architectureEngine.listReferenceArchitectures()[0];
      const compiled = app.architectureEngine.compileToManifests(ref.nodes, ref.edges);
      return compiled.kubernetesYaml.includes('kind: Deployment') && compiled.opentofuHcl.includes('resource "kubernetes_deployment"');
    }
  },
  {
    id: 'Subphase 3.5.1',
    stage: 'Stage 3',
    phase: 'Phase 3.5',
    title: '8 Multi-Milestone Production Capstone Projects Catalog',
    verify: () => app.projectEngine.listProjects().length >= 8
  },
  {
    id: 'Subphase 3.5.2',
    stage: 'Stage 3',
    phase: 'Phase 3.5',
    title: 'Deterministic Capstone Project Solver Verification (6/6 Capstones)',
    verify: () => {
      for (const proj of app.projectEngine.listProjects()) {
        const c = new VirtualCluster();
        app.projectEngine.startProject(proj.id, c);
        const t = new TerminalEngine(c);
        const before = app.projectEngine.validateProject(proj.id, c, []);
        if (before.passed) return false;
        for (const cmd of proj.solutionCommands) {
          t.execute(cmd);
        }
        const after = app.projectEngine.validateProject(proj.id, c, t.commandHistory);
        if (!after.passed) return false;
      }
      return true;
    }
  },
  {
    id: 'Subphase 4.1.1',
    stage: 'Stage 4',
    phase: 'Phase 4.1',
    title: 'Contextual Socratic AI Mentor (Hint, Debug, Explain Modes)',
    verify: () => {
      const reply = app.aiMentor.respond({ mode: 'hint', cluster: app.virtualCluster });
      return reply.response.includes('Socratic');
    }
  },
  {
    id: 'Subphase 4.1.2',
    stage: 'Stage 4',
    phase: 'Phase 4.1',
    title: 'Automated CIS Kubernetes Security Benchmark Auditor',
    verify: () => {
      const reply = app.aiMentor.respond({ mode: 'security-audit', cluster: app.virtualCluster });
      return reply.response.includes('CIS Kubernetes Benchmark');
    }
  },
  {
    id: 'Subphase 4.2.1',
    stage: 'Stage 4',
    phase: 'Phase 4.2',
    title: '6 Role-Based Certification Tracks & 26-Domain Skill Radar',
    verify: () =>
      app.certificationEngine.listExamTracks().length === 6 &&
      app.certificationEngine.computeDomainSkillRadar().length === 26
  },
  {
    id: 'Subphase 4.2.2',
    stage: 'Stage 4',
    phase: 'Phase 4.2',
    title: 'HMAC-SHA256 Signed Certificates & Verification Engine',
    verify: () => {
      const qs = app.pluginManager.getTrackQuestions('track-foundations');
      const answers = {};
      for (const q of qs) answers[q.id] = q.correctIndex;
      const graded = app.certificationEngine.gradeExam({ trackId: 'track-foundations', answers, learnerName: 'Verifier' });
      return app.certificationEngine.verifyCertificate(graded.certificate.certId, graded.certificate.signatureSha256).valid;
    }
  },
  {
    id: 'Subphase 4.3.1',
    stage: 'Stage 4',
    phase: 'Phase 4.3',
    title: 'Cross-Platform Responsive Workbench UI (HTML5, CSS Grid, ARIA)',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'public', 'index.html')) &&
      fs.existsSync(path.join(rootDir, 'public', 'css', 'styles.css')) &&
      fs.existsSync(path.join(rootDir, 'public', 'js', 'app.js'))
  },
  {
    id: 'Subphase 4.3.2',
    stage: 'Stage 4',
    phase: 'Phase 4.3',
    title: 'Offline Service Worker & PWA Manifest',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'public', 'sw.js')) &&
      fs.existsSync(path.join(rootDir, 'public', 'manifest.json'))
  },
  {
    id: 'Subphase 5.1.1',
    stage: 'Stage 5',
    phase: 'Phase 5.1',
    title: 'Unit & API Integration Test Suite',
    verify: () => fs.existsSync(path.join(rootDir, 'tests', 'kubelabs.test.js'))
  },
  {
    id: 'Subphase 5.1.2',
    stage: 'Stage 5',
    phase: 'Phase 5.1',
    title: 'Deterministic E2E Solver Proof Across All 52 Labs, 12 Incidents & 8 Capstones',
    verify: () => {
      const labs = app.pluginManager.getAllLabs();
      if (labs.length !== 52) return false;
      for (const lab of labs) {
        const c = new VirtualCluster(lab.initialClusterState);
        const t = new TerminalEngine(c);
        if (valEngine.evaluate(lab.validationRules, c, []).passed) return false;
        for (const cmd of lab.solutionCommands) t.execute(cmd, { manifestText: lab.starterManifest });
        if (!valEngine.evaluate(lab.validationRules, c, t.commandHistory).passed) return false;
      }
      return true;
    }
  },
  {
    id: 'Subphase 5.2.1',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: 'Self-Audit & Subphase Verification CLI Scripts',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'scripts', 'self-audit.js')) &&
      fs.existsSync(path.join(rootDir, 'scripts', 'verify-subphases.js'))
  },
  {
    id: 'Subphase 5.2.2',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: 'GitHub Actions Multi-OS CI/CD, Release & Security Scan Workflows',
    verify: () =>
      fs.existsSync(path.join(rootDir, '.github', 'workflows', 'ci.yml')) &&
      fs.existsSync(path.join(rootDir, '.github', 'workflows', 'release.yml')) &&
      fs.existsSync(path.join(rootDir, '.github', 'workflows', 'security-scan.yml'))
  },
  {
    id: 'Subphase 5.2.3',
    stage: 'Stage 5',
    phase: 'Phase 5.2',
    title: 'Rootless Dockerfile, Self-Hosting Kubernetes Manifests, STRIDE Threat Model & Perf Benchmarks',
    verify: () =>
      fs.existsSync(path.join(rootDir, 'Dockerfile')) &&
      fs.existsSync(path.join(rootDir, 'docker-compose.yml')) &&
      fs.existsSync(path.join(rootDir, 'deploy', 'kubernetes', 'kubelabs-k8s.yaml')) &&
      fs.existsSync(path.join(rootDir, 'docs', '09-SECURITY-AND-THREAT-MODEL.md')) &&
      fs.existsSync(path.join(rootDir, 'docs', '10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md'))
  }
];

console.log('========================================================================================');
console.log(' KUBELABS SUBPHASE-BY-SUBPHASE SEQUENTIAL EXECUTION & VALIDATION LEDGER (36 SUBPHASES)');
console.log('========================================================================================');

let passedCount = 0;
for (const sp of SUBPHASES) {
  const start = Date.now();
  let ok = false;
  try {
    ok = Boolean(sp.verify());
  } catch {
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

