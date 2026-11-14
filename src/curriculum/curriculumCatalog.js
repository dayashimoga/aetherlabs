'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PluginManager } = require('../plugins/pluginManager');

const DOMAINS_DIR = path.join(__dirname, 'domains');
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'schemas', 'plugin.schema.json');

/**
 * 7-Tier Cloud-Native Architecture Curriculum DAG Structure
 * Maps 45 specialized domains across 7 progressive mastery tiers.
 */
const V4_CURRICULUM_TIERS = [
  {
    tier: 1,
    title: 'Tier 1: Systems & Networking Foundations',
    badge: 'Tier 1: Foundations',
    certTarget: 'CCNFA / LFCS',
    summary: 'Linux fundamentals, system administration, cgroups v2, namespaces, networking fundamentals, and Git internals.',
    domainIds: ['linux-fundamentals', 'linux-admin', 'networking-fundamentals', 'git-fundamentals']
  },
  {
    tier: 2,
    title: 'Tier 2: Containers & Packaging',
    badge: 'Tier 2: Packaging & Runtimes',
    certTarget: 'DCA / CCOA',
    summary: 'Docker containerization, OCI container runtimes (CRI / containerd), Helm v3 packaging, and Kustomize overlays.',
    domainIds: ['docker-containers', 'container-runtime-cri', 'helm-packaging', 'kustomize-manifests']
  },
  {
    tier: 3,
    title: 'Tier 3: Kubernetes Core & Administration',
    badge: 'Tier 3: Kubernetes Core',
    certTarget: 'CKA / CKAD / CKS',
    summary: 'Kubernetes core architecture, CKAD application development, CKA cluster administration, CNI networking, CSI storage, CKS security, and troubleshooting.',
    domainIds: [
      'kubernetes-core-v4',
      'ckad-developer',
      'cka-administrator',
      'k8s-networking',
      'k8s-storage',
      'k8s-security-cks',
      'k8s-troubleshooting'
    ]
  },
  {
    tier: 4,
    title: 'Tier 4: GitOps, CI/CD, IaC & Service Mesh',
    badge: 'Tier 4: Delivery & Mesh',
    certTarget: 'GitOps / ICA / HashiCorp Terraform',
    summary: 'GitOps reconciliation, ArgoCD, FluxCD, CI/CD automation, DevSecOps pipelines, Infrastructure as Code, Terraform/OpenTofu, Service Mesh, Istio, and Linkerd.',
    domainIds: [
      'gitops-delivery',
      'argocd-gitops',
      'fluxcd-gitops',
      'cicd-pipelines',
      'devsecops-pipeline',
      'iac-foundations',
      'terraform-opentofu',
      'service-mesh-core',
      'istio-service-mesh',
      'linkerd-service-mesh'
    ]
  },
  {
    tier: 5,
    title: 'Tier 5: Observability, SRE & Platform Operations',
    badge: 'Tier 5: SRE & Reliability',
    certTarget: 'PCA / SRE Certified / CKA Ops',
    summary: 'Full observability stack, Prometheus, Grafana, OpenTelemetry, logging & monitoring, SRE practices, platform reliability, performance engineering, and multi-cluster ops.',
    domainIds: [
      'observability-core',
      'prometheus-monitoring',
      'grafana-visualization',
      'opentelemetry-traces',
      'logging-monitoring',
      'sre-incident-recovery',
      'platform-reliability',
      'performance-engineering',
      'production-operations',
      'k8s-production-ops',
      'multicluster-management'
    ]
  },
  {
    tier: 6,
    title: 'Tier 6: Architecture, System Design & Security Engineering',
    badge: 'Tier 6: Architecture & Design',
    certTarget: 'Cloud Architect / CSEA',
    summary: 'Cloud-native architecture patterns, distributed systems, microservices architecture, large-scale system design, platform engineering, security engineering, and enterprise architecture.',
    domainIds: [
      'cloud-native-architecture',
      'distributed-systems',
      'microservices-architecture',
      'system-design',
      'platform-engineering-idp',
      'security-engineering',
      'cloud-architecture-patterns',
      'enterprise-architecture'
    ]
  },
  {
    tier: 7,
    title: 'Tier 7: Autonomous AI-Ops & Emerging Technologies',
    badge: 'Tier 7: AI-Ops & Emerging',
    certTarget: 'CMCAP / AI-Ops Specialist',
    summary: 'Autonomous self-healing AI-Ops, GPU scheduling, KServe LLM inference, WebAssembly, eBPF Tetragon, and FinOps unit economics.',
    domainIds: [
      'aiops-autonomous-v4'
    ]
  }
];

class CurriculumCatalog {
  constructor(domainsDir = DOMAINS_DIR, schemaPath = SCHEMA_PATH) {
    this.domainsDir = domainsDir;
    this.schemaPath = schemaPath;
    this.pluginManager = new PluginManager(this.domainsDir, this.schemaPath);
    this.tiers = V4_CURRICULUM_TIERS;
  }

  getAllDomains() {
    return this.pluginManager.getAllDomains();
  }

  getDomain(id) {
    return this.pluginManager.getDomain(id);
  }

  getAllLabs() {
    return this.pluginManager.getAllLabs();
  }

  getLab(id) {
    return this.pluginManager.getLab(id);
  }

  getTiers() {
    return this.tiers;
  }

  getValidationErrors() {
    return this.pluginManager.validationErrors;
  }
}

module.exports = {
  CurriculumCatalog,
  V4_CURRICULUM_TIERS,
  DOMAINS_DIR,
  SCHEMA_PATH
};
