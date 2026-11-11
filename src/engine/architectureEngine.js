'use strict';

const ENTERPRISE_REFERENCE_ARCHITECTURES = [
  {
    id: 'ref-01-eks-gitops-ha',
    name: 'Multi-AZ Amazon EKS GitOps Production Platform',
    category: 'AWS & GitOps',
    summary: 'High-availability 3-AZ EKS architecture with ALB Ingress, Karpenter autoscaling, Argo CD GitOps, and RDS Multi-AZ.',
    nodes: [
      { id: 'n-waf', type: 'waf', label: 'AWS WAF & Shield', namespace: 'edge', replicas: 2, zone: 'multi-az' },
      { id: 'n-ing', type: 'ingress', label: 'ALB Ingress Controller', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-svc', type: 'service', label: 'orders-service (ClusterIP)', namespace: 'production', replicas: 1, port: 80 },
      { id: 'n-dep', type: 'deployment', label: 'orders-api (Deployment)', namespace: 'production', replicas: 3, image: 'ghcr.io/kubelabs/orders:v2.1.0', zone: 'multi-az' },
      { id: 'n-netpol', type: 'networkpolicy', label: 'orders-zero-trust-netpol', namespace: 'production', replicas: 1 },
      { id: 'n-db', type: 'database', label: 'Aurora Postgres Multi-AZ', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-argo', type: 'gitops', label: 'Argo CD Controller', namespace: 'argocd', replicas: 2 },
      { id: 'n-obs', type: 'observability', label: 'Prometheus + OpenTelemetry', namespace: 'monitoring', replicas: 2 }
    ],
    edges: [
      { from: 'n-waf', to: 'n-ing', protocol: 'HTTPS/443' },
      { from: 'n-ing', to: 'n-svc', protocol: 'HTTP/80' },
      { from: 'n-svc', to: 'n-dep', protocol: 'TCP/8080' },
      { from: 'n-dep', to: 'n-db', protocol: 'PostgreSQL/5432' },
      { from: 'n-argo', to: 'n-dep', protocol: 'GitOps Sync' },
      { from: 'n-obs', to: 'n-dep', protocol: 'Metrics/OTLP' }
    ]
  },
  {
    id: 'ref-02-zero-trust-mesh',
    name: 'Zero-Trust Financial Service Mesh (Istio mTLS + Falco)',
    category: 'DevSecOps & Service Mesh',
    summary: 'PCI-DSS compliant architecture enforcing strict mTLS, canary traffic splitting, NetworkPolicies, and eBPF Falco runtime auditing.',
    nodes: [
      { id: 'n-gw', type: 'ingress', label: 'Istio Ingress Gateway (TLS 1.3)', namespace: 'istio-system', replicas: 2, zone: 'multi-az' },
      { id: 'n-mesh', type: 'mesh', label: 'Istio Control Plane (Strict mTLS)', namespace: 'istio-system', replicas: 2 },
      { id: 'n-svc', type: 'service', label: 'ledger-svc', namespace: 'production', replicas: 1, port: 8443 },
      { id: 'n-dep', type: 'deployment', label: 'ledger-core', namespace: 'production', replicas: 3, image: 'ghcr.io/kubelabs/ledger:v4.0.0', zone: 'multi-az' },
      { id: 'n-np', type: 'networkpolicy', label: 'default-deny-plus-allowlist', namespace: 'production', replicas: 1 },
      { id: 'n-db', type: 'database', label: 'Encrypted Vault & Ledger DB', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Falco + Prometheus SIEM', namespace: 'security', replicas: 2 }
    ],
    edges: [
      { from: 'n-gw', to: 'n-svc', protocol: 'mTLS/8443' },
      { from: 'n-mesh', to: 'n-dep', protocol: 'xDS/mTLS' },
      { from: 'n-svc', to: 'n-dep', protocol: 'mTLS/8443' },
      { from: 'n-dep', to: 'n-db', protocol: 'TLS/5432' },
      { from: 'n-obs', to: 'n-dep', protocol: 'eBPF Audit' }
    ]
  },
  {
    id: 'ref-03-idp-crossplane',
    name: 'Internal Developer Platform (Backstage + Crossplane + Argo CD)',
    category: 'Platform Engineering',
    summary: 'Self-service Golden Path platform where developer claims provision cloud infrastructure and Kubernetes workloads declaratively.',
    nodes: [
      { id: 'n-ing', type: 'ingress', label: 'Platform Gateway', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-argo', type: 'gitops', label: 'Argo CD Fleet Manager', namespace: 'argocd', replicas: 2 },
      { id: 'n-iac', type: 'iac', label: 'Crossplane Universal Control Plane', namespace: 'kube-system', replicas: 2 },
      { id: 'n-svc', type: 'service', label: 'catalog-svc', namespace: 'production', replicas: 1, port: 80 },
      { id: 'n-dep', type: 'deployment', label: 'golden-path-microservice', namespace: 'production', replicas: 2, image: 'ghcr.io/kubelabs/golden-service:v1.2.0', zone: 'multi-az' },
      { id: 'n-db', type: 'database', label: 'Crossplane PostgresInstance', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Grafana + Loki + Tempo', namespace: 'monitoring', replicas: 2 }
    ],
    edges: [
      { from: 'n-ing', to: 'n-svc', protocol: 'HTTPS/443' },
      { from: 'n-svc', to: 'n-dep', protocol: 'HTTP/8080' },
      { from: 'n-argo', to: 'n-dep', protocol: 'GitOps Sync' },
      { from: 'n-iac', to: 'n-db', protocol: 'XRD Claim' },
      { from: 'n-dep', to: 'n-db', protocol: 'TCP/5432' }
    ]
  },
  {
    id: 'ref-04-multicloud-federation',
    name: 'Global Active-Active Multi-Cloud (AWS EKS + Azure AKS + GCP GKE)',
    category: 'Multi-Cloud & SRE',
    summary: 'Geo-distributed cloud-native architecture across AWS, Azure, and GCP with Cilium ClusterMesh and OpenTofu state management.',
    nodes: [
      { id: 'n-waf', type: 'waf', label: 'Global Anycast DNS & WAF', namespace: 'edge', replicas: 3, zone: 'multi-az' },
      { id: 'n-ing', type: 'ingress', label: 'Multi-Cloud Gateway API', namespace: 'production', replicas: 3, zone: 'multi-az' },
      { id: 'n-svc', type: 'service', label: 'global-checkout-svc', namespace: 'production', replicas: 1, port: 443 },
      { id: 'n-dep', type: 'deployment', label: 'checkout-federated-app', namespace: 'production', replicas: 4, image: 'ghcr.io/kubelabs/global-checkout:v3.0.0', zone: 'multi-az' },
      { id: 'n-iac', type: 'iac', label: 'OpenTofu Multi-Cloud State', namespace: 'kube-system', replicas: 2 },
      { id: 'n-db', type: 'database', label: 'CockroachDB / Spanner Distributed SQL', namespace: 'production', replicas: 3, zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Thanos Global Prometheus', namespace: 'monitoring', replicas: 2 }
    ],
    edges: [
      { from: 'n-waf', to: 'n-ing', protocol: 'Anycast HTTPS' },
      { from: 'n-ing', to: 'n-svc', protocol: 'HTTP2/443' },
      { from: 'n-svc', to: 'n-dep', protocol: 'TCP/8080' },
      { from: 'n-dep', to: 'n-db', protocol: 'Distributed SQL/26257' },
      { from: 'n-iac', to: 'n-dep', protocol: 'OpenTofu Provision' }
    ]
  },
  {
    id: 'ref-05-aiops-gpu-inference',
    name: 'AI-Ops & Distributed GPU LLM Inference Platform',
    category: 'AI-Ops & GPU Compute',
    summary: 'High-throughput vLLM/Triton GPU inference platform with NVIDIA A100 node pools, KEDA queue autoscaling, and AI-Ops anomaly remediation.',
    nodes: [
      { id: 'n-ing', type: 'ingress', label: 'AI Rate-Limiting Gateway', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-svc', type: 'service', label: 'llm-inference-svc', namespace: 'production', replicas: 1, port: 8000 },
      { id: 'n-gpu', type: 'gpu-pool', label: 'vLLM GPU Deployment (NVIDIA A100)', namespace: 'production', replicas: 2, image: 'ghcr.io/kubelabs/vllm-openai:v0.6.3', zone: 'multi-az' },
      { id: 'n-cache', type: 'cache', label: 'Redis KV Prompt & Vector Cache', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'DCGM GPU Exporter + AI-Ops RCA', namespace: 'monitoring', replicas: 2 },
      { id: 'n-np', type: 'networkpolicy', label: 'tenant-gpu-isolation', namespace: 'production', replicas: 1 }
    ],
    edges: [
      { from: 'n-ing', to: 'n-svc', protocol: 'HTTPS/443' },
      { from: 'n-svc', to: 'n-gpu', protocol: 'gRPC/8000' },
      { from: 'n-gpu', to: 'n-cache', protocol: 'RESP/6379' },
      { from: 'n-obs', to: 'n-gpu', protocol: 'DCGM Metrics' }
    ]
  },
  {
    id: 'ref-06-observability-lgtm',
    name: 'Enterprise LGTM Observability & SLO Burn-Rate Architecture',
    category: 'Observability & SRE',
    summary: 'OpenTelemetry collector pipeline feeding Loki (Logs), Grafana, Tempo (Traces), and Mimir/Prometheus with automated SLO alerting.',
    nodes: [
      { id: 'n-ing', type: 'ingress', label: 'OTLP Telemetry Ingress', namespace: 'monitoring', replicas: 2, zone: 'multi-az' },
      { id: 'n-svc', type: 'service', label: 'otel-collector-svc', namespace: 'monitoring', replicas: 1, port: 4317 },
      { id: 'n-dep', type: 'deployment', label: 'otel-collector-gateway', namespace: 'monitoring', replicas: 3, image: 'otel/opentelemetry-collector-contrib:0.114.0', zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Prometheus + Loki + Tempo + Grafana', namespace: 'monitoring', replicas: 2, zone: 'multi-az' },
      { id: 'n-db', type: 'database', label: 'S3 Long-Term Block Object Store', namespace: 'monitoring', replicas: 2, zone: 'multi-az' }
    ],
    edges: [
      { from: 'n-ing', to: 'n-svc', protocol: 'gRPC/4317' },
      { from: 'n-svc', to: 'n-dep', protocol: 'OTLP/4317' },
      { from: 'n-dep', to: 'n-obs', protocol: 'RemoteWrite' },
      { from: 'n-obs', to: 'n-db', protocol: 'HTTPS/S3' }
    ]
  },
  {
    id: 'ref-07-devsecops-supply-chain',
    name: 'SLSA Level 3 Secure Software Supply Chain & Runtime Factory',
    category: 'DevSecOps & CI/CD',
    summary: 'End-to-end Tekton/GitHub Actions build pipeline with Trivy scanning, Syft SBOM, Cosign keyless signing, and Kyverno admission control.',
    nodes: [
      { id: 'n-argo', type: 'gitops', label: 'Argo CD Verified Sync (Cosign Gate)', namespace: 'argocd', replicas: 2 },
      { id: 'n-np', type: 'networkpolicy', label: 'Kyverno + Zero-Trust Admission', namespace: 'security', replicas: 2 },
      { id: 'n-svc', type: 'service', label: 'secure-api-svc', namespace: 'production', replicas: 1, port: 8080 },
      { id: 'n-dep', type: 'deployment', label: 'signed-distroless-app', namespace: 'production', replicas: 3, image: 'gcr.io/distroless/static-debian12:nonroot', zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Trivy Operator + Falco', namespace: 'security', replicas: 2 }
    ],
    edges: [
      { from: 'n-argo', to: 'n-np', protocol: 'Admission Webhook' },
      { from: 'n-np', to: 'n-dep', protocol: 'Verified Image' },
      { from: 'n-svc', to: 'n-dep', protocol: 'TCP/8080' },
      { from: 'n-obs', to: 'n-dep', protocol: 'Continuous Scan' }
    ]
  },
  {
    id: 'ref-08-stateful-data-platform',
    name: 'Cloud-Native High-Throughput Stateful Streaming Platform',
    category: 'Data & Storage on K8s',
    summary: 'Strimzi Kafka + CloudNativePG Postgres + Redis Cluster using CSI volume snapshots and topology spread constraints.',
    nodes: [
      { id: 'n-ing', type: 'ingress', label: 'Event Ingestion Gateway', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-svc', type: 'service', label: 'stream-processor-svc', namespace: 'production', replicas: 1, port: 8080 },
      { id: 'n-dep', type: 'deployment', label: 'stream-consumer-pool', namespace: 'production', replicas: 3, image: 'ghcr.io/kubelabs/stream-worker:v2.2.0', zone: 'multi-az' },
      { id: 'n-cache', type: 'cache', label: 'Kafka / Redis Event Backbone', namespace: 'production', replicas: 3, zone: 'multi-az' },
      { id: 'n-db', type: 'database', label: 'CloudNativePG Primary + Standby', namespace: 'production', replicas: 2, zone: 'multi-az' },
      { id: 'n-obs', type: 'observability', label: 'Consumer Lag & CSI Metrics', namespace: 'monitoring', replicas: 2 }
    ],
    edges: [
      { from: 'n-ing', to: 'n-svc', protocol: 'HTTPS/443' },
      { from: 'n-svc', to: 'n-dep', protocol: 'TCP/8080' },
      { from: 'n-dep', to: 'n-cache', protocol: 'Kafka/9092' },
      { from: 'n-dep', to: 'n-db', protocol: 'PostgreSQL/5432' },
      { from: 'n-obs', to: 'n-dep', protocol: 'PromScrape' }
    ]
  }
];

class ArchitectureEngine {
  listReferenceArchitectures() {
    return ENTERPRISE_REFERENCE_ARCHITECTURES;
  }

  getReferenceArchitecture(id) {
    return ENTERPRISE_REFERENCE_ARCHITECTURES.find((a) => a.id === id) || null;
  }

  analyzeTopology(nodes = [], edges = []) {
    const spofs = [];
    const recommendations = [];

    const hasIngressOrGateway = nodes.some((n) => n.type === 'ingress' || n.type === 'waf');
    const hasService = nodes.some((n) => n.type === 'service');
    const hasWorkload = nodes.some((n) => n.type === 'deployment' || n.type === 'gpu-pool' || n.type === 'statefulset');
    const hasSecurity = nodes.some((n) => n.type === 'networkpolicy' || n.type === 'waf' || n.type === 'mesh');
    const hasObservability = nodes.some((n) => n.type === 'observability');
    const hasGitOpsOrIaC = nodes.some((n) => n.type === 'gitops' || n.type === 'iac');

    for (const node of nodes) {
      if (
        (node.type === 'deployment' || node.type === 'database' || node.type === 'ingress' || node.type === 'gpu-pool') &&
        Number(node.replicas || 1) < 2
      ) {
        spofs.push(`Single Point of Failure (SPOF): "${node.label}" has only ${node.replicas || 1} replica.`);
      }
    }

    if (!hasIngressOrGateway) {
      recommendations.push('Add an Ingress Controller or WAF node to manage external TLS termination and traffic routing.');
    }
    if (!hasService && hasWorkload) {
      recommendations.push('Add a Kubernetes Service (ClusterIP) in front of workloads to provide stable DNS and load balancing.');
    }
    if (!hasSecurity) {
      recommendations.push('Add a NetworkPolicy, Service Mesh (mTLS), or WAF node to enforce Zero-Trust security boundaries.');
    }
    if (!hasObservability) {
      recommendations.push('Add an Observability node (Prometheus / OpenTelemetry) for metrics, logs, and SLO alerting.');
    }
    if (!hasGitOpsOrIaC) {
      recommendations.push('Add an Argo CD GitOps or OpenTofu IaC node for declarative drift detection and repeatable delivery.');
    }

    const reliabilityScore = Math.min(100, Math.max(25, (hasWorkload ? 55 : 20) + (spofs.length === 0 ? 45 : Math.max(0, 35 - spofs.length * 15))));
    const securityScore = Math.min(100, (hasSecurity ? 70 : 35) + (hasIngressOrGateway ? 30 : 0));
    const observabilityScore = hasObservability ? 95 : 40;
    const operationalScore = (hasGitOpsOrIaC ? 60 : 30) + (edges.length >= Math.max(1, nodes.length - 2) ? 35 : 15);
    const overallScore = Math.round((reliabilityScore + securityScore + observabilityScore + operationalScore) / 4);

    const estimatedMonthlyCostUsd = nodes.reduce((acc, n) => {
      const rep = Number(n.replicas || 1);
      if (n.type === 'gpu-pool') return acc + rep * 650;
      if (n.type === 'database') return acc + rep * 140;
      if (n.type === 'deployment') return acc + rep * 45;
      return acc + 25;
    }, 0);

    return {
      overallScore,
      pillars: {
        reliability: reliabilityScore,
        security: securityScore,
        observability: observabilityScore,
        operationalExcellence: operationalScore
      },
      spofs,
      recommendations,
      estimatedMonthlyCostUsd,
      nodeCount: nodes.length,
      edgeCount: edges.length
    };
  }

  compileToManifests(nodes = [], edges = []) {
    const yamlDocs = [];
    const hclBlocks = [
      '# Generated by KubeLabs Architecture Designer (OpenTofu / Terraform v1.9+)',
      'terraform {',
      '  required_providers {',
      '    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.35" }',
      '  }',
      '}',
      ''
    ];

    for (const node of nodes) {
      const rawName = String(node.label || node.id)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 28) || 'component';
      const ns = node.namespace || 'production';
      const replicas = Number(node.replicas || 2);

      if (node.type === 'deployment' || node.type === 'gpu-pool') {
        const image = node.image || (node.type === 'gpu-pool' ? 'ghcr.io/kubelabs/vllm-openai:v0.6.3' : 'nginx:1.27-alpine');
        yamlDocs.push(
          [
            'apiVersion: apps/v1',
            'kind: Deployment',
            'metadata:',
            `  name: ${rawName}`,
            `  namespace: ${ns}`,
            '  labels:',
            `    app: ${rawName}`,
            'spec:',
            `  replicas: ${replicas}`,
            '  selector:',
            '    matchLabels:',
            `      app: ${rawName}`,
            '  template:',
            '    metadata:',
            '      labels:',
            `        app: ${rawName}`,
            '    spec:',
            '      containers:',
            `        - name: ${rawName}`,
            `          image: ${image}`
          ].join('\n')
        );

        hclBlocks.push(
          `resource "kubernetes_deployment" "${rawName.replace(/-/g, '_')}" {`,
          `  metadata {`,
          `    name      = "${rawName}"`,
          `    namespace = "${ns}"`,
          `  }`,
          `  spec {`,
          `    replicas = ${replicas}`,
          `  }`,
          `}`,
          ''
        );
      } else if (node.type === 'service') {
        const port = Number(node.port || 80);
        yamlDocs.push(
          [
            'apiVersion: v1',
            'kind: Service',
            'metadata:',
            `  name: ${rawName}`,
            `  namespace: ${ns}`,
            'spec:',
            '  type: ClusterIP',
            '  selector:',
            `    app: ${rawName}`,
            '  ports:',
            `    - port: ${port}`,
            `      targetPort: ${port}`
          ].join('\n')
        );
      } else if (node.type === 'ingress' || node.type === 'waf') {
        yamlDocs.push(
          [
            'apiVersion: networking.k8s.io/v1',
            'kind: Ingress',
            'metadata:',
            `  name: ${rawName}`,
            `  namespace: ${ns}`,
            'spec:',
            '  ingressClassName: cilium',
            '  rules:',
            '    - host: app.kubelabs.internal'
          ].join('\n')
        );
      } else if (node.type === 'networkpolicy') {
        yamlDocs.push(
          [
            'apiVersion: networking.k8s.io/v1',
            'kind: NetworkPolicy',
            'metadata:',
            `  name: ${rawName}`,
            `  namespace: ${ns}`,
            'spec:',
            '  podSelector:',
            '    matchLabels:',
            '      tier: backend',
            '  policyTypes:',
            '    - Ingress'
          ].join('\n')
        );
      } else if (node.type === 'database' || node.type === 'cache') {
        yamlDocs.push(
          [
            'apiVersion: apps/v1',
            'kind: StatefulSet',
            'metadata:',
            `  name: ${rawName}`,
            `  namespace: ${ns}`,
            'spec:',
            `  replicas: ${replicas}`,
            '  selector:',
            '    matchLabels:',
            `      app: ${rawName}`,
            '  template:',
            '    metadata:',
            '      labels:',
            `        app: ${rawName}`,
            '    spec:',
            '      containers:',
            `        - name: ${rawName}`,
            `          image: ${node.type === 'cache' ? 'redis:7.4-alpine' : 'postgres:16-alpine'}`
          ].join('\n')
        );
      }
    }

    const analysis = this.analyzeTopology(nodes, edges);
    return {
      kubernetesYaml: yamlDocs.join('\n---\n'),
      opentofuHcl: hclBlocks.join('\n'),
      analysis
    };
  }
}

module.exports = { ArchitectureEngine, ENTERPRISE_REFERENCE_ARCHITECTURES };

