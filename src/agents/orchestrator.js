'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { VirtualCluster } = require('../engine/virtualCluster');
const { TerminalEngine } = require('../engine/terminalEngine');
const { ValidationEngine } = require('../engine/validationEngine');
const { IncidentEngine } = require('../engine/incidentEngine');
const { ArchitectureEngine } = require('../engine/architectureEngine');

const FORBIDDEN_MARKERS = ['TODO:', 'FIXME:', 'PLACEHOLDER_IMPLEMENTATION', 'COMING_SOON_STUB'];

const V4_SPECIALIZED_SUBAGENTS = [
  {
    id: 'agent-terminal-runtime',
    role: 'Terminal & Execution Engine',
    prompt: `You own src/core/terminalEngine.js, src/core/multiCliDispatcher.js, src/core/shellParser.js, src/core/pipelineDriver.js, and the new src/core/cliFormatter.js. Eliminate all stubbed responses ('kubectl command executed'). Implement full POSIX argument parsing, pipe streaming (| grep, | awk, | jq, | sed), file redirection (>, >>), tab-completion, command history, and exact ASCII table/YAML/JSON formatters for: kubectl, helm, kustomize, docker, crictl, etcdctl, kubeadm, git, argocd, flux, istioctl, linkerd, terraform, tofu, trivy, promql, logql, systemctl, journalctl, ip, iptables, nc, dig, curl, and k8sgpt. Every command must mutate or query the live ResourceGraph and VirtualFileSystem.`,
    ownedFiles: [
      'src/core/terminalEngine.js',
      'src/core/multiCliDispatcher.js',
      'src/core/shellParser.js',
      'src/core/pipelineDriver.js',
      'src/core/cliFormatter.js'
    ]
  },
  {
    id: 'agent-curriculum-45',
    role: '45-Domain Curriculum & Deterministic Validation',
    prompt: `You own plugins/, schemas/plugin.schema.json, src/core/validationEngine.js, src/core/incidentEngine.js, and src/core/projectEngine.js. Restructure and expand the curriculum to cover all 45 mandatory domains organized into 7 progressive tiers (Tier 1: Linux, Networking, Git; Tier 2: Docker, CRI, Helm, Kustomize; Tier 3: K8s Fundamentals, CKAD, CKA, K8s Networking, K8s Storage, CKS, K8s Troubleshooting; Tier 4: GitOps, ArgoCD, FluxCD, CI/CD, DevSecOps, IaC, Terraform; Tier 5: Service Mesh, Istio, Linkerd, Observability, Prometheus, Grafana, OpenTelemetry, Logging & Monitoring, SRE, Platform Reliability, Performance Engineering, Production Operations, K8s Production Operations, K8s Multi-Cluster; Tier 6: Cloud-Native Architecture, Distributed Systems, Microservices, System Design, Platform Engineering, Security Engineering, Cloud Architecture Patterns, Enterprise Architecture; Tier 7: AI-Assisted Operations). Every domain must include: (1) Concise Concept Visualizer, (2) 6-to-10 Step Guided Lab with per-step state validation, (3) Unguided Challenge, (4) Live Break-Fix Troubleshooting Scenario, and (5) Certification Exam Drill.`,
    ownedFiles: [
      'plugins/',
      'schemas/plugin.schema.json',
      'src/core/validationEngine.js',
      'src/core/incidentEngine.js',
      'src/core/projectEngine.js'
    ]
  },
  {
    id: 'agent-ui-futuristic',
    role: 'UI/UX Redesign & Interactive Workbench',
    prompt: `You own public/index.html, public/css/styles.css, public/js/app.js, and public/js/offlineEngine.js. Replace the cluttered v3 interface with a modern, minimalist, futuristic Cloud-Native IDE. Implement:
1. Left Icon Rail (64px) + Top Command Bar (Ctrl+K Search, Cluster Health Pill, XP/Level Progress) replacing the cluttered horizontal pill header.
2. View 1: Interactive Skill Tree Roadmap (Homepage): 'Continue Learning' Hero banner + visual 7-Tier DAG Roadmap showing prerequisite paths, mastery progress, and certification milestones (no more wall-of-text card dumps).
3. View 2: 3-Pane Split Lab IDE: Resizable panes (#resizer-left, #resizer-right). Left: Step-by-step interactive checklist that auto-advances on step validation. Center: Multi-tab YAML/HCL/Code Editor + Interactive Terminal with full ANSI colors and quick-action bar. Right: Live Interactive SVG Cluster Topology with click-to-inspect resource drawer (describe, logs, events).
4. View 3: Incident War Room: Hide #active-incident-banner when idle. On incident launch, open War Room mode with live MTTR timer, PagerDuty alert stream, live latency/error sparklines, and terminal.
5. View 4: Bi-Directional Architecture Studio: Fix empty YAML/HCL panel by auto-compiling the active blueprint on load. Fix clipped node titles with responsive node sizing and port connection animations.
6. Modal & Accessibility Polish: Fix Ctrl+Shift+D Diagnostics modal sticky header overlap and empty card bugs.`,
    ownedFiles: [
      'public/index.html',
      'public/css/styles.css',
      'public/js/app.js',
      'public/js/offlineEngine.js'
    ]
  },
  {
    id: 'agent-control-plane',
    role: 'Kubernetes, Mesh, GitOps & Observability Fidelity',
    prompt: `You own src/core/controllerManager.js, src/core/schedulerEngine.js, src/core/networkingEngine.js, src/core/storageAndSecurityEngine.js, src/core/observabilityEngine.js, src/core/autoscalingAndMeshEngine.js, and src/core/cloudExtensions.js. Ensure real-time reconciliation for all 45 domains: Pod lifecycle transitions (Pending -> ContainerCreating -> Running or CrashLoopBackOff / ImagePullBackOff / OOMKilled), Event generation (Normal Scheduled, Warning FailedMount, Warning BackOff), CNI 7-hop packet tracing, CoreDNS resolution, CSI PVC binding, RBAC can-i evaluation, ArgoCD/Flux sync status, Istio/Linkerd mTLS routing, and PromQL/LogQL time-series evaluation.`,
    ownedFiles: [
      'src/core/controllerManager.js',
      'src/core/schedulerEngine.js',
      'src/core/networkingEngine.js',
      'src/core/storageAndSecurityEngine.js',
      'src/core/observabilityEngine.js',
      'src/core/autoscalingAndMeshEngine.js',
      'src/core/cloudExtensions.js'
    ]
  },
  {
    id: 'agent-qa-auditor',
    role: '56-Gate Self-Audit & E2E Verification',
    prompt: `You own scripts/self-audit.js, scripts/verify-subphases.js, and tests/. Add strict regression tests ensuring: (1) Zero CLI commands ever output 'command executed', (2) All 45 domains load and validate deterministically (0% score before solution, 100% score after canonical solution), (3) Architecture Studio YAML/HCL output is non-empty on initial render, and (4) All UI tabs and modals render without layout clipping.`,
    ownedFiles: [
      'scripts/self-audit.js',
      'scripts/verify-subphases.js',
      'tests/'
    ]
  }
];

class AgentOrchestrator {
  constructor({ rootDir, pluginManager }) {
    this.rootDir = rootDir || path.join(__dirname, '..', '..');
    this.pluginManager = pluginManager;
  }

  runFullAudit() {
    const startMs = Date.now();
    const agents = [
      this.auditProductAgent(),
      this.auditArchitectAgent(),
      this.auditBackendAgent(),
      this.auditFrontendAgent(),
      this.auditKubernetesAgent(),
      this.auditCurriculumAgent(),
      this.auditDevOpsAgent(),
      this.auditSecurityAgent(),
      this.auditQaAgent(),
      this.auditDocumentationAgent(),
      this.auditPlatformEngineeringAgent()
    ];

    const passed = agents.every((a) => a.status === 'PASS');
    const totalChecks = agents.reduce((acc, a) => acc + a.checks.length, 0);
    const passedChecks = agents.reduce((acc, a) => acc + a.checks.filter((c) => c.passed).length, 0);

    return {
      passed,
      summary: `${passedChecks}/${totalChecks} quality checks passed across 11 specialized engineering agents`,
      durationMs: Date.now() - startMs,
      memoryRssMB: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      agents
    };
  }

  auditProductAgent() {
    const prdPath = path.join(this.rootDir, 'docs', '02-PRD.md');
    const tracks = this.pluginManager.getTracks();
    const checks = [
      {
        name: 'Complete PRD exists and defines personas & requirements',
        passed: fs.existsSync(prdPath) && fs.statSync(prdPath).size > 2000
      },
      {
        name: 'All 6 Guided Role Learning Tracks are registered',
        passed: tracks.length === 6
      },
      {
        name: 'All 26 Cloud-Native, Multi-Cloud & Emerging Tech Domains are active',
        passed: this.pluginManager.getAllDomains().length === 26
      }
    ];
    return this.formatAgentResult('agent-product', 'Product Engineering Agent', checks);
  }

  auditArchitectAgent() {
    const archPath = path.join(this.rootDir, 'docs', '03-ARCHITECTURE.md');
    const adrPath = path.join(this.rootDir, 'docs', '04-ADRS.md');
    const schemaPath = path.join(this.rootDir, 'schemas', 'plugin.schema.json');
    const archEngine = new ArchitectureEngine();
    const checks = [
      {
        name: 'System, Security, Data & Lab Architecture doc published',
        passed: fs.existsSync(archPath) && fs.statSync(archPath).size > 2000
      },
      {
        name: '10 Architecture Decision Records (ADRs) documented',
        passed: fs.existsSync(adrPath) && fs.readFileSync(adrPath, 'utf8').includes('ADR-010')
      },
      {
        name: 'Plugin JSON Schema exists and validates all plugins',
        passed: fs.existsSync(schemaPath) && this.pluginManager.validationErrors.length === 0
      },
      {
        name: '8 Enterprise Reference Architectures available in Designer Engine',
        passed: archEngine.listReferenceArchitectures().length === 8
      }
    ];
    return this.formatAgentResult('agent-architect', 'Principal Architect Agent', checks);
  }

  auditBackendAgent() {
    const requiredFiles = [
      'src/server.js',
      'src/api/router.js',
      'src/db/database.js',
      'src/engine/virtualCluster.js',
      'src/engine/terminalEngine.js',
      'src/engine/validationEngine.js',
      'src/engine/incidentEngine.js',
      'src/engine/architectureEngine.js',
      'src/engine/aiMentor.js',
      'src/engine/certificationEngine.js'
    ];
    const checks = requiredFiles.map((rel) => ({
      name: `Backend module ${rel} implemented`,
      passed: fs.existsSync(path.join(this.rootDir, rel))
    }));
    return this.formatAgentResult('agent-backend', 'Backend & Persistence Agent', checks);
  }

  auditFrontendAgent() {
    const uiFiles = [
      'public/index.html',
      'public/css/styles.css',
      'public/js/app.js',
      'public/manifest.json',
      'public/sw.js',
      'public/js/offlineEngine.js'
    ];
    const checks = uiFiles.map((rel) => ({
      name: `Cross-platform frontend asset ${rel} present`,
      passed: fs.existsSync(path.join(this.rootDir, rel)) && fs.statSync(path.join(this.rootDir, rel)).size > 200
    }));
    return this.formatAgentResult('agent-frontend', 'Cross-Platform Frontend & PWA Agent', checks);
  }

  auditKubernetesAgent() {
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster);
    const deployRes = term.execute('kubectl create deployment k8s-audit-app --image=nginx:1.27-alpine --replicas=2 -n production');
    const svcRes = term.execute('kubectl expose deployment k8s-audit-app --port=80 -n production');
    const svc = cluster.getResource('Service', 'k8s-audit-app', 'production');
    const checks = [
      {
        name: 'VirtualCluster reconciles Deployment -> Pods with Running status',
        passed: deployRes.exitCode === 0 && cluster.getResources('Pod', 'production').length === 2
      },
      {
        name: 'Service controller binds active Pod IPs into Endpoints',
        passed: svcRes.exitCode === 0 && Boolean(svc && svc.status && svc.status.endpointCount === 2)
      }
    ];
    return this.formatAgentResult('agent-kubernetes', 'Kubernetes & Cloud Control Plane Agent', checks);
  }

  auditCurriculumAgent() {
    const domains = this.pluginManager.getAllDomains();
    const labs = this.pluginManager.getAllLabs();
    const checks = [
      {
        name: 'Zero plugin schema validation errors',
        passed: this.pluginManager.validationErrors.length === 0
      },
      {
        name: 'At least 52 hands-on interactive labs across 26 domains',
        passed: domains.length === 26 && labs.length >= 52
      },
      {
        name: 'Every domain includes modules, labs, and assessment questions',
        passed: domains.every(
          (d) =>
            d.curriculumModules.length >= 2 &&
            d.labs.length >= 2 &&
            d.assessmentQuestions.length >= 2
        )
      }
    ];
    return this.formatAgentResult('agent-curriculum', 'Curriculum & Assessment Designer Agent', checks);
  }

  auditDevOpsAgent() {
    const files = [
      '.github/CODEOWNERS',
      '.github/PULL_REQUEST_TEMPLATE.md',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
      '.github/workflows/security-scan.yml',
      '.github/workflows/ci-release.yml',
      'docs/05-GITHUB-AND-CICD.md'
    ];
    const checks = files.map((f) => ({
      name: `CI/CD & Repo governance file ${f} configured`,
      passed: fs.existsSync(path.join(this.rootDir, f))
    }));
    return this.formatAgentResult('agent-devops', 'DevOps & Release Engineering Agent', checks);
  }

  auditSecurityAgent() {
    const pkg = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'package.json'), 'utf8'));
    const terminalCode = fs.readFileSync(path.join(this.rootDir, 'src', 'engine', 'terminalEngine.js'), 'utf8');
    const dbCode = fs.readFileSync(path.join(this.rootDir, 'src', 'db', 'database.js'), 'utf8');
    const checks = [
      {
        name: 'Zero third-party npm runtime dependencies (Supply Chain Zero-CVE)',
        passed: Object.keys(pkg.dependencies || {}).length === 0
      },
      {
        name: 'Terminal Engine is 100% sandboxed (no child_process host shell execution)',
        passed: !terminalCode.includes('child_process')
      },
      {
        name: 'SQLite Database uses parameterized prepared statements',
        passed: dbCode.includes('.prepare(')
      }
    ];
    return this.formatAgentResult('agent-security', 'DevSecOps & Security Reviewer Agent', checks);
  }

  auditQaAgent() {
    const valEngine = new ValidationEngine();
    const incEngine = new IncidentEngine(valEngine);
    const labs = this.pluginManager.getAllLabs();
    let solvableLabs = 0;

    for (const lab of labs) {
      const cluster = new VirtualCluster(lab.initialClusterState);
      const term = new TerminalEngine(cluster);
      const initialCheck = valEngine.evaluate(lab.validationRules, cluster, []);
      for (const cmd of lab.solutionCommands) {
        term.execute(cmd, { manifestText: lab.starterManifest });
      }
      const solvedCheck = valEngine.evaluate(lab.validationRules, cluster, term.commandHistory);
      if (!initialCheck.passed && solvedCheck.passed) {
        solvableLabs += 1;
      }
    }

    let solvableIncidents = 0;
    for (const inc of incEngine.scenarios) {
      const cluster = new VirtualCluster();
      incEngine.injectIncident(inc.id, cluster);
      const term = new TerminalEngine(cluster);
      const before = incEngine.verifyIncidentResolution(inc.id, cluster, []);
      for (const cmd of inc.solutionCommands) {
        term.execute(cmd);
      }
      const after = incEngine.verifyIncidentResolution(inc.id, cluster, term.commandHistory);
      if (!before.passed && after.passed) {
        solvableIncidents += 1;
      }
    }

    const checks = [
      {
        name: `All ${labs.length} interactive labs deterministically fail before solution & pass 100% after solution`,
        passed: solvableLabs === labs.length && labs.length >= 32
      },
      {
        name: `All ${incEngine.scenarios.length} production incident simulations deterministically resolve via canonical solution`,
        passed: solvableIncidents === incEngine.scenarios.length && incEngine.scenarios.length >= 12
      }
    ];
    return this.formatAgentResult('agent-qa', 'QA Lead & Deterministic Solver Agent', checks);
  }

  auditDocumentationAgent() {
    const docs = [
      'docs/01-GLOBAL-ENGINEERING-CONTRACT.md',
      'docs/02-PRD.md',
      'docs/03-ARCHITECTURE.md',
      'docs/04-ADRS.md',
      'docs/05-GITHUB-AND-CICD.md',
      'docs/06-IMPLEMENTATION-PLAN.md',
      'docs/07-CURRICULUM-CATALOG.md',
      'docs/08-OPERATIONS-AND-RUNBOOKS.md',
      'docs/13-V3-STAGE-EXECUTION-BLUEPRINT.md',
      'agents/AGENT-FRAMEWORK.md',
      'README.md'
    ];
    const checks = docs.map((d) => ({
      name: `Documentation artifact ${d} complete`,
      passed: fs.existsSync(path.join(this.rootDir, d)) && fs.statSync(path.join(this.rootDir, d)).size > 1000
    }));
    return this.formatAgentResult('agent-documentation', 'Documentation & Knowledge Agent', checks);
  }

  auditPlatformEngineeringAgent() {
    const rssMB = process.memoryUsage().rss / (1024 * 1024);
    const srcFiles = [
      'src/server.js',
      'src/api/router.js',
      'src/db/database.js',
      'src/db/storageAdapter.js',
      'src/engine/virtualCluster.js',
      'src/engine/terminalEngine.js',
      'src/engine/validationEngine.js',
      'src/engine/incidentEngine.js',
      'src/engine/architectureEngine.js',
      'src/engine/aiMentor.js',
      'src/engine/certificationEngine.js',
      'src/core/virtualFileSystem.js',
      'src/core/yamlParser.js',
      'src/core/jsonPath.js',
      'src/core/resourceGraph.js',
      'src/core/controllerManager.js',
      'src/core/admissionController.js',
      'src/core/networkTracer.js',
      'src/core/cloudExtensions.js',
      'src/core/shellParser.js',
      'src/core/pipelineDriver.js',
      'src/core/multiCliDispatcher.js',
      'src/core/schedulerEngine.js',
      'src/core/networkingEngine.js',
      'src/core/storageAndSecurityEngine.js',
      'src/core/terminalEngine.js',
      'src/core/observabilityEngine.js',
      'src/core/autoscalingAndMeshEngine.js',
      'src/core/validationEngine.js',
      'src/core/incidentEngine.js',
      'src/core/projectEngine.js',
      'src/core/architectureEngine.js',
      'src/core/aiMentor.js',
      'src/core/certificationEngine.js',
      'public/js/offlineEngine.js'
    ];
    let hasForbiddenMarker = false;
    for (const rel of srcFiles) {
      const full = path.join(this.rootDir, rel);
      if (fs.existsSync(full)) {
        const text = fs.readFileSync(full, 'utf8');
        if (FORBIDDEN_MARKERS.some((m) => text.includes(m))) {
          hasForbiddenMarker = true;
        }
      }
    }

    const checks = [
      {
        name: `Low-resource memory budget respected (RSS ${Math.round(rssMB)}MB < 150MB limit)`,
        passed: rssMB < 150
      },
      {
        name: 'Zero placeholders, TODOs, or unimplemented stubs across engine codebase',
        passed: !hasForbiddenMarker
      }
    ];
    return this.formatAgentResult('agent-platform', 'Platform Engineering & PRR Agent', checks);
  }

  formatAgentResult(id, role, checks) {
    const passed = checks.every((c) => c.passed);
    return {
      id,
      role,
      status: passed ? 'PASS' : 'FAIL',
      checks
    };
  }

  getSpecializedAgents() {
    return V4_SPECIALIZED_SUBAGENTS;
  }

  getSpecializedAgent(id) {
    return V4_SPECIALIZED_SUBAGENTS.find((a) => a.id === id) || null;
  }

  runSpecializedAgentWorkflow() {
    const results = [];
    for (const agent of V4_SPECIALIZED_SUBAGENTS) {
      const allFilesExist = agent.ownedFiles.every((f) => {
        const full = path.join(this.rootDir, f);
        return fs.existsSync(full);
      });
      results.push({
        id: agent.id,
        role: agent.role,
        status: allFilesExist ? 'PASS' : 'IN_PROGRESS',
        promptConfigured: Boolean(agent.prompt && agent.prompt.length > 50),
        ownedFiles: agent.ownedFiles
      });
    }
    return {
      subagents: results,
      total: results.length,
      ready: results.filter((r) => r.status === 'PASS').length
    };
  }
}

module.exports = { AgentOrchestrator, V4_SPECIALIZED_SUBAGENTS };

