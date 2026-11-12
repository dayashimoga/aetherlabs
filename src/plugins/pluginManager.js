'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROLE_TRACKS = [
  {
    id: 'track-foundations',
    title: 'Cloud-Native Systems Foundations',
    role: 'Cloud-Native Systems Engineer',
    certificationTitle: 'Certified Cloud-Native Foundations Associate (CCNFA)',
    summary: 'Master Linux kernel isolation, OCI container runtimes, and cloud-native TCP/IP, DNS, CNI & eBPF networking.',
    domainIds: ['linux-fundamentals', 'containers-runtime', 'cloud-networking']
  },
  {
    id: 'track-k8s-admin',
    title: 'Kubernetes, CNCF, GitOps & CI/CD Administrator',
    role: 'Kubernetes & GitOps Administrator',
    certificationTitle: 'Certified Kubernetes & GitOps Administrator (CKGA)',
    summary: 'Operate production Kubernetes clusters, Helm/Kustomize packaging, Argo CD GitOps reconciliation, and cloud-native CI/CD.',
    domainIds: [
      'kubernetes-core',
      'cncf-packaging',
      'gitops-delivery',
      'devops-cicd',
      'k8s-control-plane-lifecycle',
      'gateway-api-cilium'
    ]
  },
  {
    id: 'track-devsecops',
    title: 'DevSecOps, Zero-Trust & Service Mesh Specialist',
    role: 'DevSecOps & Service Mesh Engineer',
    certificationTitle: 'Certified Cloud-Native Security Specialist (CCNSS)',
    summary: 'Harden workloads with Pod Security Standards, NetworkPolicies, Trivy/Falco, SLSA supply chain security, and Istio mTLS.',
    domainIds: [
      'devsecops-security',
      'service-mesh',
      'policy-as-code-kyverno',
      'zero-trust-spiffe-externalsecrets'
    ]
  },
  {
    id: 'track-sre',
    title: 'Site Reliability, Observability & Chaos Engineering',
    role: 'Principal Site Reliability Engineer',
    certificationTitle: 'Certified Site Reliability & Incident Commander (CSRIC)',
    summary: 'Instrument distributed systems with Prometheus/OpenTelemetry, enforce SLO error budgets, and lead chaos & incident recovery.',
    domainIds: [
      'observability-stack',
      'sre-incident-chaos',
      'autoscaling-keda-karpenter',
      'storage-csi-velero-dr'
    ]
  },
  {
    id: 'track-platform',
    title: 'Platform Engineering, IaC & Cloud FinOps',
    role: 'Platform Engineering Architect',
    certificationTitle: 'Certified Platform Engineering Architect (CPEA)',
    summary: 'Build Internal Developer Platforms with Golden Paths, Crossplane control planes, OpenTofu/Terraform automation, and OpenCost/Kepler FinOps.',
    domainIds: [
      'platform-engineering',
      'iac-opentofu-terraform',
      'finops-green-cloud',
      'multitenancy-vcluster-crossplane'
    ]
  },
  {
    id: 'track-multicloud-aiops',
    title: 'Multi-Cloud (AWS/Azure/GCP), Wasm/eBPF & Autonomous AI-Ops',
    role: 'Multi-Cloud & AI-Ops Principal Architect',
    certificationTitle: 'Certified Multi-Cloud & AI-Ops Principal (CMCAP)',
    summary: 'Architect federated workloads across AWS EKS, Azure AKS, and Google GKE with WebAssembly, eBPF Tetragon, GPU scheduling, and AI-Ops self-healing.',
    domainIds: [
      'cloud-aws',
      'cloud-azure-gcp',
      'aiops-autonomous',
      'wasm-ebpf-edge',
      'cloud-native-aiml-kserve'
    ]
  }
];

const VALID_RULE_TYPES = new Set([
  'resource_exists',
  'resource_field_equals',
  'resource_field_contains',
  'pod_status_running',
  'service_has_endpoints',
  'replica_count_min',
  'command_executed',
  'cloud_resource_exists',
  'helm_release_deployed',
  'argocd_app_synced'
]);

class PluginManager {
  constructor(pluginsDir, schemaPath) {
    this.pluginsDir = pluginsDir || path.join(__dirname, '..', '..', 'plugins');
    this.schemaPath = schemaPath || path.join(__dirname, '..', '..', 'schemas', 'plugin.schema.json');
    this.plugins = [];
    this.pluginMap = new Map();
    this.labMap = new Map();
    this.validationErrors = [];
    this.loadAllPlugins();
  }

  loadAllPlugins() {
    this.plugins = [];
    this.pluginMap.clear();
    this.labMap.clear();
    this.validationErrors = [];

    if (!fs.existsSync(this.pluginsDir)) {
      return;
    }

    const files = fs
      .readdirSync(this.pluginsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(this.pluginsDir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const plugin = JSON.parse(raw);
      const errors = this.validatePlugin(plugin, file);
      if (errors.length > 0) {
        this.validationErrors.push(...errors);
      }
      this.plugins.push(plugin);
      this.pluginMap.set(plugin.id, plugin);

      for (const lab of plugin.labs || []) {
        this.labMap.set(lab.id, {
          ...lab,
          domainId: plugin.id,
          domainTitle: plugin.title,
          trackId: plugin.trackId,
          category: plugin.category
        });
      }
    }
  }

  validatePlugin(plugin, sourceFile = 'unknown') {
    const errors = [];
    const requiredRoot = [
      'id',
      'title',
      'category',
      'trackId',
      'version',
      'difficulty',
      'estimatedHours',
      'summary',
      'prerequisites',
      'learningObjectives',
      'curriculumModules',
      'labs',
      'assessmentQuestions'
    ];

    for (const field of requiredRoot) {
      if (plugin[field] === undefined || plugin[field] === null) {
        errors.push(`[${sourceFile}] Missing required root field '${field}'`);
      }
    }

    if (!Array.isArray(plugin.learningObjectives) || plugin.learningObjectives.length < 3) {
      errors.push(`[${sourceFile}] 'learningObjectives' must have at least 3 items`);
    }

    if (!Array.isArray(plugin.curriculumModules) || plugin.curriculumModules.length < 2) {
      errors.push(`[${sourceFile}] 'curriculumModules' must have at least 2 modules`);
    }

    if (!Array.isArray(plugin.labs) || plugin.labs.length < 2) {
      errors.push(`[${sourceFile}] 'labs' must have at least 2 hands-on labs`);
    } else {
      for (const lab of plugin.labs) {
        const reqLabFields = [
          'id',
          'title',
          'difficulty',
          'durationMinutes',
          'xpReward',
          'scenario',
          'productionContext',
          'objectives',
          'initialClusterState',
          'starterManifest',
          'steps',
          'validationRules',
          'solutionCommands',
          'troubleshootingGuide'
        ];
        for (const lf of reqLabFields) {
          if (lab[lf] === undefined || lab[lf] === null) {
            errors.push(`[${sourceFile}:${lab.id || 'unnamed'}] Missing lab field '${lf}'`);
          }
        }
        if (!Array.isArray(lab.validationRules) || lab.validationRules.length < 2) {
          errors.push(`[${sourceFile}:${lab.id}] Must have at least 2 validationRules`);
        } else {
          for (const rule of lab.validationRules) {
            if (!VALID_RULE_TYPES.has(rule.type)) {
              errors.push(`[${sourceFile}:${lab.id}] Invalid validation rule type '${rule.type}'`);
            }
          }
        }
        if (!Array.isArray(lab.solutionCommands) || lab.solutionCommands.length < 1) {
          errors.push(`[${sourceFile}:${lab.id}] Must have at least 1 solutionCommand`);
        }
      }
    }

    if (!Array.isArray(plugin.assessmentQuestions) || plugin.assessmentQuestions.length < 2) {
      errors.push(`[${sourceFile}] 'assessmentQuestions' must have at least 2 items`);
    }

    return errors;
  }

  getTracks() {
    return ROLE_TRACKS.map((track) => {
      const domains = track.domainIds
        .map((id) => this.pluginMap.get(id))
        .filter(Boolean);
      const labsCount = domains.reduce((acc, d) => acc + (d.labs ? d.labs.length : 0), 0);
      const totalHours = domains.reduce((acc, d) => acc + (d.estimatedHours || 0), 0);
      return {
        ...track,
        labsCount,
        totalHours,
        domains: domains.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          difficulty: d.difficulty,
          estimatedHours: d.estimatedHours,
          summary: d.summary,
          labsCount: d.labs.length
        }))
      };
    });
  }

  getAllDomains() {
    return this.plugins;
  }

  getDomain(domainId) {
    return this.pluginMap.get(domainId) || null;
  }

  getAllLabs() {
    return Array.from(this.labMap.values());
  }

  getLab(labId) {
    return this.labMap.get(labId) || null;
  }

  getTrackQuestions(trackId) {
    const track = ROLE_TRACKS.find((t) => t.id === trackId);
    if (!track) return [];
    const questions = [];
    for (const domainId of track.domainIds) {
      const domain = this.pluginMap.get(domainId);
      if (domain && Array.isArray(domain.assessmentQuestions)) {
        for (const q of domain.assessmentQuestions) {
          questions.push({
            ...q,
            domainId: domain.id,
            domainTitle: domain.title
          });
        }
      }
    }
    return questions;
  }
}

module.exports = { PluginManager, ROLE_TRACKS, VALID_RULE_TYPES };

