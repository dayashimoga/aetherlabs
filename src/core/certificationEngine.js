'use strict';

/**
 * KubeLabs v4.0 - Asymmetric Ed25519 Certification Engine & Hands-On Performance Simulators
 * 
 * Grades comprehensive role-based assessment exams, executes hands-on practical
 * performance certification simulators against live virtual cluster state graphs,
 * signs digital certificate credentials using Ed25519 asymmetric cryptography and HMAC-SHA256,
 * and evaluates 45-domain skill mastery radar metrics.
 * 
 * Pure ES2024 module with ZERO external runtime dependencies.
 */

const crypto = require('node:crypto');
const { ROLE_TRACKS } = require('../plugins/pluginManager');
const { ValidationEngine } = require('./validationEngine');

const SIGNING_SECRET = process.env.KUBELABS_CERT_SECRET || 'kubelabs-production-hmac-key-2026-v1';

const PERFORMANCE_EXAMS = [
  {
    id: 'perf-exam-kcna',
    code: 'KCNA-SIM',
    trackId: 'track-foundations',
    title: 'Certified Cloud-Native Associate (KCNA) Practical Exam',
    certificationTitle: 'Certified Cloud-Native Associate (KCNA) - Practical Performance Exam',
    role: 'Cloud-Native Associate',
    summary: 'Hands-on performance exam testing container architectures, multi-container pods, LimitRanges, workload scheduling, and RBAC.',
    durationMinutes: 60,
    passingScorePercent: 75,
    tasks: [
      {
        id: 'task-01',
        title: 'Multi-Container Shared Volume Pod',
        weight: 25,
        description: 'Deploy a multi-container Pod named "shared-app" in namespace "default" with containers "web" (nginx:1.27) and "helper" (busybox:1.36). Both containers must mount an emptyDir volume named "shared-data" at path "/var/log".',
        validationRules: [
          { type: 'resource_exists', kind: 'Pod', namespace: 'default', name: 'shared-app' },
          { type: 'resource_field_equals', kind: 'Pod', namespace: 'default', name: 'shared-app', fieldPath: 'spec.containers[0].volumeMounts[0].name', expectedValue: 'shared-data' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: shared-app
  namespace: default
spec:
  volumes:
  - name: shared-data
    emptyDir: {}
  containers:
  - name: web
    image: nginx:1.27
    volumeMounts:
    - name: shared-data
      mountPath: /var/log
  - name: helper
    image: busybox:1.36
    command: ["sleep", "3600"]
    volumeMounts:
    - name: shared-data
      mountPath: /var/log
EOF`
        ]
      },
      {
        id: 'task-02',
        title: 'Container Resource Ceilings & LimitRange Enforcement',
        weight: 25,
        description: 'Create a LimitRange named "core-limits" in namespace "default" that enforces a default container memory limit of 128Mi and a defaultRequest memory of 64Mi.',
        validationRules: [
          { type: 'resource_exists', kind: 'LimitRange', namespace: 'default', name: 'core-limits' },
          { type: 'resource_field_equals', kind: 'LimitRange', namespace: 'default', name: 'core-limits', fieldPath: 'spec.limits[0].default.memory', expectedValue: '128Mi' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: LimitRange
metadata:
  name: core-limits
  namespace: default
spec:
  limits:
  - type: Container
    default:
      memory: 128Mi
    defaultRequest:
      memory: 64Mi
EOF`
        ]
      },
      {
        id: 'task-03',
        title: 'NodeSelector Dedicated Workload Placement',
        weight: 25,
        description: 'Deploy a Deployment named "edge-processor" with 2 replicas in namespace "default" configured with a nodeSelector pinning pods to nodes labeled "disktype=ssd".',
        validationRules: [
          { type: 'resource_exists', kind: 'Deployment', namespace: 'default', name: 'edge-processor' },
          { type: 'resource_field_equals', kind: 'Deployment', namespace: 'default', name: 'edge-processor', fieldPath: 'spec.template.spec.nodeSelector.disktype', expectedValue: 'ssd' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edge-processor
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: edge-processor
  template:
    metadata:
      labels:
        app: edge-processor
    spec:
      nodeSelector:
        disktype: ssd
      containers:
      - name: processor
        image: alpine:3.20
        command: ["sleep", "3600"]
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'ClusterRole & ServiceAccount Access Delegation',
        weight: 25,
        description: 'Create a ServiceAccount named "metrics-reader-sa" in namespace "default" and bind it to the cluster-scoped role "view" via a ClusterRoleBinding named "metrics-reader-binding".',
        validationRules: [
          { type: 'resource_exists', kind: 'ServiceAccount', namespace: 'default', name: 'metrics-reader-sa' },
          { type: 'resource_exists', kind: 'ClusterRoleBinding', name: 'metrics-reader-binding' }
        ],
        solutionCommands: [
          'kubectl create sa metrics-reader-sa -n default',
          'kubectl create clusterrolebinding metrics-reader-binding --clusterrole=view --serviceaccount=default:metrics-reader-sa'
        ]
      }
    ]
  },
  {
    id: 'perf-exam-cka',
    code: 'CKA-SIM',
    trackId: 'track-k8s-admin',
    title: 'Certified Kubernetes Administrator (CKA) Practical Exam',
    certificationTitle: 'Certified Kubernetes Administrator (CKA) - Practical Performance Exam',
    role: 'Kubernetes Administrator',
    summary: 'Timed CKA practical performance exam covering Ingress routing, static pod troubleshooting, storage volumes, rolling recovery, and network policies.',
    durationMinutes: 120,
    passingScorePercent: 75,
    initialClusterResources: [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'web-frontend', namespace: 'production' },
        spec: {
          replicas: 0,
          template: {
            spec: {
              containers: [{ name: 'web', image: 'nginx:broken-v999' }]
            }
          }
        }
      }
    ],
    initialVfsFiles: [
      {
        path: '/etc/kubernetes/manifests/kube-apiserver.yaml',
        content: '# Kube-apiserver static pod manifest\nspec:\n  containers:\n  - command:\n    - kube-apiserver\n    - --etcd-servers=https://127.0.0.1:9999\n'
      }
    ],
    tasks: [
      {
        id: 'task-01',
        title: 'Ingress Controller Route Configuration',
        weight: 20,
        description: 'Expose internal service "billing-svc" on port 8080 via an Ingress resource "billing-ingress" in namespace "finance" with host "billing.kubelabs.io" and path "/pay" (Prefix).',
        validationRules: [
          { type: 'resource_exists', kind: 'Ingress', namespace: 'finance', name: 'billing-ingress' },
          { type: 'resource_field_equals', kind: 'Ingress', namespace: 'finance', name: 'billing-ingress', fieldPath: 'spec.rules[0].host', expectedValue: 'billing.kubelabs.io' }
        ],
        solutionCommands: [
          'kubectl create namespace finance',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  namespace: finance
spec:
  rules:
  - host: billing.kubelabs.io
    http:
      paths:
      - path: /pay
        pathType: Prefix
        backend:
          service:
            name: billing-svc
            port:
              number: 8080
EOF`
        ]
      },
      {
        id: 'task-02',
        title: 'Static Pod Manifest Troubleshooting',
        weight: 20,
        description: 'Diagnose and fix the kube-apiserver static pod manifest at "/etc/kubernetes/manifests/kube-apiserver.yaml". Correct the misconfigured etcd flag to "--etcd-servers=https://127.0.0.1:2379".',
        validationRules: [
          { type: 'vfs_file_contains', path: '/etc/kubernetes/manifests/kube-apiserver.yaml', expectedValue: ':2379' }
        ],
        solutionCommands: [
          "sed -i 's/:9999/:2379/g' /etc/kubernetes/manifests/kube-apiserver.yaml"
        ]
      },
      {
        id: 'task-03',
        title: 'Persistent Volume & PVC Claim Binding',
        weight: 20,
        description: 'Provision a PersistentVolume "data-pv" of 5Gi with ReadWriteOnce and hostPath "/mnt/data", and bind it to PersistentVolumeClaim "data-pvc" in namespace "production".',
        validationRules: [
          { type: 'resource_exists', kind: 'PersistentVolume', name: 'data-pv' },
          { type: 'resource_exists', kind: 'PersistentVolumeClaim', namespace: 'production', name: 'data-pvc' }
        ],
        solutionCommands: [
          'kubectl create namespace production',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: data-pv
spec:
  capacity:
    storage: 5Gi
  accessModes:
  - ReadWriteOnce
  hostPath:
    path: /mnt/data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
  namespace: production
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'Deployment Rollback from Crashloop',
        weight: 20,
        description: 'Deployment "web-frontend" in namespace "production" is failing with an invalid image. Restore its image to "nginx:1.27" and scale replicas to 3.',
        validationRules: [
          { type: 'resource_exists', kind: 'Deployment', namespace: 'production', name: 'web-frontend' },
          { type: 'resource_field_equals', kind: 'Deployment', namespace: 'production', name: 'web-frontend', fieldPath: 'spec.template.spec.containers[0].image', expectedValue: 'nginx:1.27' },
          { type: 'resource_field_equals', kind: 'Deployment', namespace: 'production', name: 'web-frontend', fieldPath: 'spec.replicas', expectedValue: 3 }
        ],
        solutionCommands: [
          'kubectl set image deployment/web-frontend web=nginx:1.27 -n production',
          'kubectl scale deployment/web-frontend --replicas=3 -n production'
        ]
      },
      {
        id: 'task-05',
        title: 'NetworkPolicy Strict Microservice Isolation',
        weight: 20,
        description: 'Create a NetworkPolicy "isolate-database" in namespace "production" protecting pods labeled "app=db", allowing ingress traffic exclusively from pods labeled "app=api" on TCP port 5432.',
        validationRules: [
          { type: 'resource_exists', kind: 'NetworkPolicy', namespace: 'production', name: 'isolate-database' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-database
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 5432
EOF`
        ]
      }
    ]
  },
  {
    id: 'perf-exam-cks',
    code: 'CKS-SIM',
    trackId: 'track-devsecops',
    title: 'Certified Kubernetes Security Specialist (CKS) Practical Exam',
    certificationTitle: 'Certified Kubernetes Security Specialist (CKS) - Practical Performance Exam',
    role: 'DevSecOps Specialist',
    summary: 'High-stakes CKS practical security exam covering Pod Security Standards, container hardening, Tetragon eBPF tracing policies, Trivy vulnerability audits, and SPIFFE identity federation.',
    durationMinutes: 120,
    passingScorePercent: 75,
    tasks: [
      {
        id: 'task-01',
        title: 'Restricted Pod Security Standard Admission',
        weight: 20,
        description: 'Label namespace "secure-zone" with "pod-security.kubernetes.io/enforce=restricted" to enforce Kubernetes baseline and restricted security admission.',
        validationRules: [
          { type: 'resource_exists', kind: 'Namespace', name: 'secure-zone' },
          { type: 'resource_field_equals', kind: 'Namespace', name: 'secure-zone', fieldPath: 'metadata.labels.pod-security.kubernetes.io/enforce', expectedValue: 'restricted' }
        ],
        solutionCommands: [
          'kubectl create namespace secure-zone',
          'kubectl label namespace secure-zone pod-security.kubernetes.io/enforce=restricted'
        ]
      },
      {
        id: 'task-02',
        title: 'Container SecurityContext & Capability Dropping',
        weight: 20,
        description: 'Deploy a hardened Deployment "secure-api" in namespace "secure-zone" with "runAsNonRoot: true" and "readOnlyRootFilesystem: true" in securityContext.',
        validationRules: [
          { type: 'resource_exists', kind: 'Deployment', namespace: 'secure-zone', name: 'secure-api' },
          { type: 'resource_field_equals', kind: 'Deployment', namespace: 'secure-zone', name: 'secure-api', fieldPath: 'spec.template.spec.securityContext.runAsNonRoot', expectedValue: true }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-api
  namespace: secure-zone
spec:
  replicas: 2
  selector:
    matchLabels:
      app: secure-api
  template:
    metadata:
      labels:
        app: secure-api
    spec:
      securityContext:
        runAsNonRoot: true
        readOnlyRootFilesystem: true
      containers:
      - name: api
        image: cgr.dev/chainguard/static:latest
EOF`
        ]
      },
      {
        id: 'task-03',
        title: 'eBPF Runtime Threat Neutralization with Tetragon',
        weight: 20,
        description: 'Deploy a Cilium Tetragon TracingPolicy "block-reverse-shell" in namespace "secure-zone" monitoring syscall "sys_execve" to detect unauthorized binary execution.',
        validationRules: [
          { type: 'resource_exists', kind: 'TracingPolicy', namespace: 'secure-zone', name: 'block-reverse-shell' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: cilium.io/v1alpha1
kind: TracingPolicy
metadata:
  name: block-reverse-shell
  namespace: secure-zone
spec:
  kprobes:
  - call: sys_execve
    syscall: true
    selectors:
    - matchArgs:
      - index: 0
        operator: Equal
        values:
        - /bin/nc
      matchActions:
      - action: Sigkill
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'Trivy Vulnerability Scan & Supply Chain Audit',
        weight: 20,
        description: 'Perform a container security audit using "trivy image --severity CRITICAL alpine:3.18" and save the report to "/security/trivy-scan.json".',
        validationRules: [
          { type: 'vfs_file_contains', path: '/security/trivy-scan.json', expectedValue: 'CVE' }
        ],
        solutionCommands: [
          'mkdir -p /security',
          'trivy image --severity CRITICAL alpine:3.18 > /security/trivy-scan.json'
        ]
      },
      {
        id: 'task-05',
        title: 'Workload Identity SPIFFE Federation',
        weight: 20,
        description: 'Create a ServiceAccount "vault-auth-sa" in namespace "secure-zone" annotated with SPIFFE ID "spiffe://prod.kubelabs.io/ns/secure-zone/sa/vault-auth-sa".',
        validationRules: [
          { type: 'resource_exists', kind: 'ServiceAccount', namespace: 'secure-zone', name: 'vault-auth-sa' },
          { type: 'resource_field_contains', kind: 'ServiceAccount', namespace: 'secure-zone', name: 'vault-auth-sa', fieldPath: 'metadata.annotations', expectedValue: 'spiffe://' }
        ],
        solutionCommands: [
          'kubectl create sa vault-auth-sa -n secure-zone',
          'kubectl annotate sa vault-auth-sa -n secure-zone spiffe.io/spiffe-id=spiffe://prod.kubelabs.io/ns/secure-zone/sa/vault-auth-sa'
        ]
      }
    ]
  },
  {
    id: 'perf-exam-ckre',
    code: 'CKRE-SIM',
    trackId: 'track-sre',
    title: 'Certified Kubernetes Reliability Engineer (CKRE) Practical Exam',
    certificationTitle: 'Certified Kubernetes Reliability Engineer (CKRE) - Practical Performance Exam',
    role: 'SRE & Incident Commander',
    summary: 'Practical SRE performance exam verifying Prometheus SLO/SLI alerting rules, KEDA event-driven autoscaling, PodDisruptionBudgets, and CoreDNS failure recovery.',
    durationMinutes: 90,
    passingScorePercent: 75,
    initialClusterResources: [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'coredns', namespace: 'kube-system' },
        spec: { replicas: 0 }
      }
    ],
    tasks: [
      {
        id: 'task-01',
        title: 'SLO/SLI Prometheus Alerting Rule Definition',
        weight: 25,
        description: 'Deploy a PrometheusRule named "latency-slo-alert" in namespace "monitoring" alerting on "HighErrorRate" with evaluation interval "15s".',
        validationRules: [
          { type: 'resource_exists', kind: 'PrometheusRule', namespace: 'monitoring', name: 'latency-slo-alert' }
        ],
        solutionCommands: [
          'kubectl create namespace monitoring',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: latency-slo-alert
  namespace: monitoring
spec:
  groups:
  - name: slo.rules
    interval: 15s
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
EOF`
        ]
      },
      {
        id: 'task-02',
        title: 'KEDA ScaledObject Event-Driven Autoscaling',
        weight: 25,
        description: 'Deploy a KEDA ScaledObject "queue-autoscaler" in namespace "production" targeting deployment "worker-service" with "minReplicaCount: 2".',
        validationRules: [
          { type: 'resource_exists', kind: 'ScaledObject', namespace: 'production', name: 'queue-autoscaler' },
          { type: 'resource_field_equals', kind: 'ScaledObject', namespace: 'production', name: 'queue-autoscaler', fieldPath: 'spec.minReplicaCount', expectedValue: 2 }
        ],
        solutionCommands: [
          'kubectl create namespace production',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: queue-autoscaler
  namespace: production
spec:
  scaleTargetRef:
    name: worker-service
  minReplicaCount: 2
  maxReplicaCount: 20
EOF`
        ]
      },
      {
        id: 'task-03',
        title: 'PodDisruptionBudget Reliability Guardrail',
        weight: 25,
        description: 'Create a PodDisruptionBudget "payment-pdb" in namespace "production" protecting pods labeled "app=payment" with "minAvailable: 2".',
        validationRules: [
          { type: 'resource_exists', kind: 'PodDisruptionBudget', namespace: 'production', name: 'payment-pdb' },
          { type: 'resource_field_equals', kind: 'PodDisruptionBudget', namespace: 'production', name: 'payment-pdb', fieldPath: 'spec.minAvailable', expectedValue: 2 }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payment-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: payment
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'CoreDNS Control Plane Recovery',
        weight: 25,
        description: 'Diagnose the disabled CoreDNS deployment in namespace "kube-system" and restore its replica count to 2.',
        validationRules: [
          { type: 'resource_exists', kind: 'Deployment', namespace: 'kube-system', name: 'coredns' },
          { type: 'resource_field_equals', kind: 'Deployment', namespace: 'kube-system', name: 'coredns', fieldPath: 'spec.replicas', expectedValue: 2 }
        ],
        solutionCommands: [
          'kubectl scale deployment/coredns --replicas=2 -n kube-system'
        ]
      }
    ]
  },
  {
    id: 'perf-exam-cpa',
    code: 'CPA-SIM',
    trackId: 'track-platform',
    title: 'Certified Platform Architect (CPA) Practical Exam',
    certificationTitle: 'Certified Platform Architect (CPA) - Practical Performance Exam',
    role: 'Platform Engineering Architect',
    summary: 'Advanced platform engineering practical exam testing tenant partitioning with ResourceQuotas, Backstage catalog manifests, DatabaseCluster CRDs, and ArgoCD applications.',
    durationMinutes: 90,
    passingScorePercent: 75,
    tasks: [
      {
        id: 'task-01',
        title: 'Multi-Tenant ResourceQuota & Namespace Partitioning',
        weight: 25,
        description: 'Provision namespace "tenant-analytics" with a ResourceQuota named "compute-quota" capping "requests.cpu: 4000m" and "requests.memory: 8Gi".',
        validationRules: [
          { type: 'resource_exists', kind: 'Namespace', name: 'tenant-analytics' },
          { type: 'resource_exists', kind: 'ResourceQuota', namespace: 'tenant-analytics', name: 'compute-quota' }
        ],
        solutionCommands: [
          'kubectl create namespace tenant-analytics',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: tenant-analytics
spec:
  hard:
    requests.cpu: 4000m
    requests.memory: 8Gi
EOF`
        ]
      },
      {
        id: 'task-02',
        title: 'Backstage Software Catalog Entity Specification',
        weight: 25,
        description: 'Declare Backstage Component "orders-api" via ConfigMap "backstage-catalog-orders" in namespace "default" with "type: service", "lifecycle: production", and "owner: checkout-team".',
        validationRules: [
          { type: 'resource_exists', kind: 'ConfigMap', namespace: 'default', name: 'backstage-catalog-orders' },
          { type: 'resource_field_contains', kind: 'ConfigMap', namespace: 'default', name: 'backstage-catalog-orders', fieldPath: 'data.component', expectedValue: 'orders-api' }
        ],
        solutionCommands: [
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: backstage-catalog-orders
  namespace: default
data:
  component: |
    apiVersion: backstage.io/v1alpha1
    kind: Component
    metadata:
      name: orders-api
    spec:
      type: service
      lifecycle: production
      owner: checkout-team
EOF`
        ]
      },
      {
        id: 'task-03',
        title: 'Custom Resource Operator State Machine',
        weight: 25,
        description: 'Deploy Custom Resource DatabaseCluster named "main-db" in namespace "production" with "engine: postgres" and "replicas: 3".',
        validationRules: [
          { type: 'resource_exists', kind: 'DatabaseCluster', namespace: 'production', name: 'main-db' },
          { type: 'resource_field_equals', kind: 'DatabaseCluster', namespace: 'production', name: 'main-db', fieldPath: 'spec.engine', expectedValue: 'postgres' }
        ],
        solutionCommands: [
          'kubectl create namespace production',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: databases.kubelabs.io/v1
kind: DatabaseCluster
metadata:
  name: main-db
  namespace: production
spec:
  engine: postgres
  version: "16"
  replicas: 3
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'ArgoCD GitOps Application Declaration',
        weight: 25,
        description: 'Create an ArgoCD Application "storefront-app" in namespace "argocd" targeting destination namespace "production".',
        validationRules: [
          { type: 'resource_exists', kind: 'Application', namespace: 'argocd', name: 'storefront-app' }
        ],
        solutionCommands: [
          'kubectl create namespace argocd',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: storefront-app
  namespace: argocd
spec:
  destination:
    namespace: production
    server: https://kubernetes.default.svc
EOF`
        ]
      }
    ]
  },
  {
    id: 'perf-exam-cmaos',
    code: 'CMAOS-SIM',
    trackId: 'track-multicloud-aiops',
    title: 'Certified Multi-Cloud & AI-Ops Specialist (CMAOS) Practical Exam',
    certificationTitle: 'Certified Multi-Cloud & AI-Ops Specialist (CMAOS) - Practical Performance Exam',
    role: 'Multi-Cloud & AI-Ops Specialist',
    summary: 'Cutting-edge performance simulator evaluating KServe LLM serving, k8sgpt AI diagnostics, FinOps governance policies, and Cilium ClusterMesh multi-cluster service exports.',
    durationMinutes: 90,
    passingScorePercent: 75,
    tasks: [
      {
        id: 'task-01',
        title: 'KServe InferenceService LLM Model Serving',
        weight: 25,
        description: 'Deploy KServe InferenceService "llm-mistral" in namespace "ai-workloads" with modelFormat "vllm" and resource ceiling "nvidia.com/gpu: 1".',
        validationRules: [
          { type: 'resource_exists', kind: 'InferenceService', namespace: 'ai-workloads', name: 'llm-mistral' },
          { type: 'resource_field_equals', kind: 'InferenceService', namespace: 'ai-workloads', name: 'llm-mistral', fieldPath: 'spec.predictor.model.modelFormat', expectedValue: 'vllm' }
        ],
        solutionCommands: [
          'kubectl create namespace ai-workloads',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: llm-mistral
  namespace: ai-workloads
spec:
  predictor:
    model:
      modelFormat: vllm
      storageUri: s3://models/mistral-7b
EOF`
        ]
      },
      {
        id: 'task-02',
        title: 'k8sgpt AI Root-Cause Diagnostic Automation',
        weight: 25,
        description: 'Configure ConfigMap "k8sgpt-config" in namespace "monitoring" enabling backend provider "local-llm".',
        validationRules: [
          { type: 'resource_exists', kind: 'ConfigMap', namespace: 'monitoring', name: 'k8sgpt-config' },
          { type: 'resource_field_contains', kind: 'ConfigMap', namespace: 'monitoring', name: 'k8sgpt-config', fieldPath: 'data.config', expectedValue: 'local-llm' }
        ],
        solutionCommands: [
          'kubectl create namespace monitoring',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: k8sgpt-config
  namespace: monitoring
data:
  config: |
    ai:
      provider: local-llm
      anonymize: true
EOF`
        ]
      },
      {
        id: 'task-03',
        title: 'FinOps Cost Allocation & Multi-Cloud Landing Zone',
        weight: 25,
        description: 'Deploy ConfigMap "landing-zone-finops" in namespace "enterprise-governance" enforcing costCenter "fintech-ops".',
        validationRules: [
          { type: 'resource_exists', kind: 'ConfigMap', namespace: 'enterprise-governance', name: 'landing-zone-finops' },
          { type: 'resource_field_contains', kind: 'ConfigMap', namespace: 'enterprise-governance', name: 'landing-zone-finops', fieldPath: 'data.policy', expectedValue: 'fintech-ops' }
        ],
        solutionCommands: [
          'kubectl create namespace enterprise-governance',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: landing-zone-finops
  namespace: enterprise-governance
data:
  policy: |
    finops:
      costCenter: fintech-ops
      budgetCapUSD: 10000
EOF`
        ]
      },
      {
        id: 'task-04',
        title: 'Cilium ClusterMesh Multi-Cluster Service Export',
        weight: 25,
        description: 'Expose Service "global-auth" across clusters in namespace "production" by annotating it with "service.cilium.io/global=true".',
        validationRules: [
          { type: 'resource_exists', kind: 'Service', namespace: 'production', name: 'global-auth' },
          { type: 'resource_field_contains', kind: 'Service', namespace: 'production', name: 'global-auth', fieldPath: 'metadata.annotations', expectedValue: 'service.cilium.io/global' }
        ],
        solutionCommands: [
          'kubectl create namespace production',
          `cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: global-auth
  namespace: production
  annotations:
    service.cilium.io/global: "true"
spec:
  ports:
  - port: 8443
    targetPort: 8443
EOF`
        ]
      }
    ]
  }
];

class CertificationEngine {
  constructor(pluginManager, database, options = {}) {
    this.pluginManager = pluginManager;
    this.database = database;
    this.validationEngine = options.validationEngine || new ValidationEngine();
    this.examStopwatches = new Map();

    if (options.publicKey && options.privateKey) {
      this.publicKey = options.publicKey;
      this.privateKey = options.privateKey;
    } else if (this.database && typeof this.database.getOrCreateSigningKeys === 'function') {
      const pair = this.database.getOrCreateSigningKeys();
      this.publicKey = pair.publicKey;
      this.privateKey = pair.privateKey;
    } else {
      const pair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      this.publicKey = pair.publicKey;
      this.privateKey = pair.privateKey;
    }
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPublicKeyPem() {
    return this.publicKey;
  }

  signCertificatePayloadEd25519({ certId, trackId, title, learnerName, scorePercent }) {
    const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
    const data = Buffer.from(canonical, 'utf8');
    return crypto.sign(null, data, this.privateKey).toString('hex');
  }

  verifyCertificateEd25519({ certId, trackId, title, learnerName, scorePercent }, signatureHex, publicKey = this.publicKey) {
    try {
      const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
      const data = Buffer.from(canonical, 'utf8');
      const sigBuffer = Buffer.from(signatureHex, 'hex');
      return crypto.verify(null, data, publicKey, sigBuffer);
    } catch {
      return false;
    }
  }

  listExamTracks() {
    return ROLE_TRACKS.map((track) => {
      const questions = this.pluginManager.getTrackQuestions(track.id);
      const perfExam = PERFORMANCE_EXAMS.find((e) => e.trackId === track.id);
      return {
        id: track.id,
        title: track.title,
        role: track.role,
        certificationTitle: track.certificationTitle,
        summary: track.summary,
        questionCount: questions.length,
        passingScorePercent: 75,
        durationMinutes: 30,
        domainIds: track.domainIds,
        performanceExamAvailable: Boolean(perfExam),
        performanceExamId: perfExam ? perfExam.id : null,
        performanceExamCode: perfExam ? perfExam.code : null,
        performanceTasksCount: perfExam ? perfExam.tasks.length : 0
      };
    });
  }

  getExamQuestionsForClient(trackId) {
    const track = ROLE_TRACKS.find((t) => t.id === trackId);
    if (!track) {
      throw new Error(`Certification track "${trackId}" not found`);
    }
    const questions = this.pluginManager.getTrackQuestions(trackId);
    return {
      trackId: track.id,
      title: track.title,
      certificationTitle: track.certificationTitle,
      passingScorePercent: 75,
      questions: questions.map((q) => ({
        id: q.id,
        domainId: q.domainId,
        domainTitle: q.domainTitle,
        question: q.question,
        options: q.options
      }))
    };
  }

  gradeExam({ trackId, answers = {}, learnerName = 'Cloud-Native Engineer' }) {
    const track = ROLE_TRACKS.find((t) => t.id === trackId);
    if (!track) {
      throw new Error(`Certification track "${trackId}" not found`);
    }
    const questions = this.pluginManager.getTrackQuestions(trackId);
    if (questions.length === 0) {
      throw new Error(`No assessment questions registered for track "${trackId}"`);
    }

    let correctCount = 0;
    const domainStats = {};
    const detailedResults = [];

    for (const q of questions) {
      const submittedIdx = answers[q.id] !== undefined ? Number(answers[q.id]) : -1;
      const isCorrect = submittedIdx === Number(q.correctIndex);
      if (isCorrect) correctCount += 1;

      if (!domainStats[q.domainId]) {
        domainStats[q.domainId] = { correct: 0, total: 0, title: q.domainTitle };
      }
      domainStats[q.domainId].total += 1;
      if (isCorrect) domainStats[q.domainId].correct += 1;

      detailedResults.push({
        id: q.id,
        domainId: q.domainId,
        question: q.question,
        submittedIndex: submittedIdx,
        correctIndex: q.correctIndex,
        correct: isCorrect,
        explanation: q.explanation
      });
    }

    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercent >= 75;
    const attemptId = `ATT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    if (this.database) {
      this.database.saveAssessmentAttempt({
        attemptId,
        trackId,
        scorePercent,
        passed,
        domainBreakdown: domainStats
      });
    }

    let certificate = null;
    if (passed) {
      const issuedAt = new Date().toISOString();
      const certId = `CERT-${track.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${crypto
        .createHash('sha256')
        .update(`${track.id}:${learnerName}:${scorePercent}`)
        .digest('hex')
        .slice(0, 8)
        .toUpperCase()}`;

      const signatureSha256 = this.signCertificatePayload({
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent
      });

      const signatureEd25519 = this.signCertificatePayloadEd25519({
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent
      });

      certificate = {
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent,
        signatureSha256,
        signatureEd25519,
        publicKeyPem: this.publicKey,
        issuedAt
      };

      if (this.database) {
        this.database.saveCertificate(certificate);
        const profileData = this.database.getProfile();
        const currentXp = (profileData.profile && profileData.profile.xp) || 0;
        this.database.updateProfileFields({ xp: currentXp + 500 });
      }
    }

    return {
      attemptId,
      trackId,
      certificationTitle: track.certificationTitle,
      scorePercent,
      correctCount,
      totalQuestions: questions.length,
      passed,
      domainBreakdown: domainStats,
      detailedResults,
      certificate
    };
  }

  signCertificatePayload({ certId, trackId, title, learnerName, scorePercent }) {
    const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
    return crypto.createHmac('sha256', SIGNING_SECRET).update(canonical).digest('hex');
  }

  verifyCertificate(certId, providedSignature) {
    if (!this.database) {
      return { valid: false, reason: 'Database unavailable' };
    }
    const cert = this.database.getCertificate(certId);
    if (!cert) {
      return { valid: false, reason: `Certificate "${certId}" not found` };
    }

    const payload = {
      certId: cert.cert_id,
      trackId: cert.track_id,
      title: cert.title,
      learnerName: cert.learner_name,
      scorePercent: cert.score_percent
    };

    let valid = false;
    let algorithm = 'hmac-sha256';

    if (providedSignature !== undefined && providedSignature !== null && String(providedSignature).trim() !== '') {
      const sigStr = String(providedSignature).trim();
      if (sigStr.length === 128) {
        valid = this.verifyCertificateEd25519(payload, sigStr);
        algorithm = 'ed25519';
      } else {
        const expectedShaSig = this.signCertificatePayload(payload);
        valid = sigStr === expectedShaSig;
        algorithm = 'hmac-sha256';
      }
    } else if (cert.signature_ed25519) {
      valid = this.verifyCertificateEd25519(payload, cert.signature_ed25519);
      algorithm = 'ed25519';
      if (!valid && cert.signature_sha256) {
        const expectedShaSig = this.signCertificatePayload(payload);
        valid = cert.signature_sha256 === expectedShaSig;
        algorithm = 'hmac-sha256';
      }
    } else {
      const expectedShaSig = this.signCertificatePayload(payload);
      valid = cert.signature_sha256 === expectedShaSig;
      algorithm = 'hmac-sha256';
    }

    return {
      valid,
      algorithm,
      certificate: cert,
      publicKeyPem: this.publicKey,
      verifiedAt: new Date().toISOString()
    };
  }

  computeDomainSkillRadar() {
    const domains = this.pluginManager.getAllDomains();
    const profileData = this.database ? this.database.getProfile() : { completedLabs: [] };
    const completedSet = new Set(
      (profileData.completedLabs || [])
        .filter((l) => l.status === 'completed')
        .map((l) => l.lab_id)
    );

    return domains.map((d) => {
      const totalLabs = (d.labs || []).length;
      const doneLabs = (d.labs || []).filter((l) => completedSet.has(l.id)).length;
      const masteryPercent = totalLabs > 0 ? Math.round((doneLabs / totalLabs) * 100) : 0;
      return {
        domainId: d.id,
        title: d.title,
        category: d.category,
        trackId: d.trackId,
        completedLabs: doneLabs,
        totalLabs,
        masteryPercent
      };
    });
  }

  // =========================================================================
  // Hands-On Performance Certification Simulators (CKA, CKS, SRE, Platform)
  // =========================================================================

  listPerformanceExams() {
    return PERFORMANCE_EXAMS.map((exam) => ({
      id: exam.id,
      code: exam.code,
      trackId: exam.trackId,
      title: exam.title,
      certificationTitle: exam.certificationTitle,
      role: exam.role,
      summary: exam.summary,
      durationMinutes: exam.durationMinutes,
      passingScorePercent: exam.passingScorePercent,
      taskCount: exam.tasks.length,
      totalWeight: exam.tasks.reduce((acc, t) => acc + (t.weight || 0), 0)
    }));
  }

  getPerformanceExam(examIdOrTrackId) {
    const id = String(examIdOrTrackId || '').trim().toLowerCase();
    return PERFORMANCE_EXAMS.find((e) =>
      e.id.toLowerCase() === id ||
      e.trackId.toLowerCase() === id ||
      e.code.toLowerCase() === id
    ) || null;
  }

  getPerformanceExamForClient(examIdOrTrackId) {
    const exam = this.getPerformanceExam(examIdOrTrackId);
    if (!exam) return null;
    return {
      id: exam.id,
      code: exam.code,
      trackId: exam.trackId,
      title: exam.title,
      certificationTitle: exam.certificationTitle,
      role: exam.role,
      summary: exam.summary,
      durationMinutes: exam.durationMinutes,
      passingScorePercent: exam.passingScorePercent,
      taskCount: exam.tasks.length,
      tasks: exam.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        weight: t.weight,
        description: t.description
      }))
    };
  }

  startPerformanceExam(examIdOrTrackId, virtualCluster, vfs = null) {
    const exam = this.getPerformanceExam(examIdOrTrackId);
    if (!exam) {
      throw new Error(`Performance exam "${examIdOrTrackId}" not found`);
    }
    if (virtualCluster && typeof virtualCluster.reset === 'function') {
      virtualCluster.reset();
    } else if (virtualCluster && typeof virtualCluster.resetCluster === 'function') {
      virtualCluster.resetCluster();
    }
    const targetVfs = vfs || (virtualCluster && virtualCluster.vfs ? virtualCluster.vfs : null);
    if (exam.initialClusterResources && virtualCluster) {
      for (const res of exam.initialClusterResources) {
        const cloned = typeof res === 'object' ? JSON.parse(JSON.stringify(res)) : res;
        if (typeof cloned === 'string') {
          virtualCluster.applyManifest(cloned);
        } else if (typeof virtualCluster.applyResource === 'function') {
          virtualCluster.applyResource(cloned);
        } else if (typeof virtualCluster.createResource === 'function') {
          virtualCluster.createResource(cloned);
        }
      }
    }
    if (exam.initialVfsFiles && targetVfs && typeof targetVfs.writeFile === 'function') {
      for (const file of exam.initialVfsFiles) {
        targetVfs.writeFile(file.path, file.content);
      }
    }
    const startedAt = Date.now();
    this.examStopwatches.set(exam.id, {
      examId: exam.id,
      startedAt,
      stoppedAt: null,
      durationMs: 0,
      active: true
    });
    return {
      examId: exam.id,
      code: exam.code,
      trackId: exam.trackId,
      title: exam.title,
      certificationTitle: exam.certificationTitle,
      startedAt,
      durationMinutes: exam.durationMinutes,
      taskCount: exam.tasks.length
    };
  }

  gradePerformanceTask(examIdOrTrackId, taskId, virtualCluster, commandHistory = [], vfs = null) {
    const exam = this.getPerformanceExam(examIdOrTrackId);
    if (!exam) {
      throw new Error(`Performance exam "${examIdOrTrackId}" not found`);
    }
    const task = exam.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found in performance exam "${exam.id}"`);
    }
    const targetVfs = vfs || (virtualCluster && virtualCluster.vfs ? virtualCluster.vfs : null);
    const context = targetVfs
      ? { cluster: virtualCluster, vfs: targetVfs, commandHistory }
      : virtualCluster;
    const report = this.validationEngine.evaluate(task.validationRules, context, commandHistory);
    return {
      taskId: task.id,
      title: task.title,
      weight: task.weight,
      passed: report.passed,
      score: report.score,
      rules: report.rules
    };
  }

  gradePerformanceExam({ examId, trackId, virtualCluster, commandHistory = [], vfs = null, learnerName = 'Cloud-Native Engineer' }) {
    const exam = this.getPerformanceExam(examId || trackId);
    if (!exam) {
      throw new Error(`Performance exam "${examId || trackId}" not found`);
    }
    let earnedPoints = 0;
    let totalPoints = 0;
    const taskResults = [];
    for (const task of exam.tasks) {
      const weight = task.weight || 0;
      totalPoints += weight;
      const taskReport = this.gradePerformanceTask(exam.id, task.id, virtualCluster, commandHistory, vfs);
      taskResults.push(taskReport);
      if (taskReport.passed) {
        earnedPoints += weight;
      }
    }
    const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = scorePercent >= exam.passingScorePercent;

    let sw = this.examStopwatches.get(exam.id);
    const now = Date.now();
    if (!sw) {
      sw = { examId: exam.id, startedAt: now, stoppedAt: now, durationMs: 0, active: false };
    } else {
      sw.stoppedAt = now;
      sw.durationMs = Math.max(0, sw.stoppedAt - sw.startedAt);
      sw.active = false;
    }
    this.examStopwatches.set(exam.id, sw);
    const totalSeconds = Math.floor(sw.durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const elapsedFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    const withinTimeLimit = sw.durationMs <= exam.durationMinutes * 60 * 1000;
    const stopwatch = {
      ...sw,
      elapsedMs: sw.durationMs,
      durationMs: sw.durationMs,
      elapsedFormatted,
      withinTimeLimit
    };

    let certificate = null;
    if (passed) {
      const issuedAt = new Date().toISOString();
      const certId = `CERT-PERF-${exam.code}-${crypto
        .createHash('sha256')
        .update(`${exam.id}:${learnerName}:${scorePercent}`)
        .digest('hex')
        .slice(0, 8)
        .toUpperCase()}`;

      const signatureSha256 = this.signCertificatePayload({
        certId,
        trackId: exam.trackId,
        title: exam.certificationTitle,
        learnerName,
        scorePercent
      });

      const signatureEd25519 = this.signCertificatePayloadEd25519({
        certId,
        trackId: exam.trackId,
        title: exam.certificationTitle,
        learnerName,
        scorePercent
      });

      certificate = {
        certId,
        examId: exam.id,
        examCode: exam.code,
        trackId: exam.trackId,
        title: exam.certificationTitle,
        learnerName,
        scorePercent,
        signatureSha256,
        signatureEd25519,
        publicKeyPem: this.publicKey,
        durationMs: sw.durationMs,
        issuedAt
      };

      if (this.database) {
        this.database.saveCertificate(certificate);
        const profileData = this.database.getProfile();
        const currentXp = (profileData.profile && profileData.profile.xp) || 0;
        this.database.updateProfileFields({ xp: currentXp + 1000 });
      }
    }

    const attemptId = `ATT-PERF-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    return {
      attemptId,
      examId: exam.id,
      examCode: exam.code,
      trackId: exam.trackId,
      title: exam.certificationTitle,
      scorePercent,
      passingScorePercent: exam.passingScorePercent,
      passed,
      earnedPoints,
      totalPoints,
      taskResults,
      certificate,
      stopwatch
    };
  }

  getExamStopwatch(examId) {
    const sw = this.examStopwatches.get(examId);
    if (!sw) return null;
    const durationMs = sw.stoppedAt ? sw.durationMs : Math.max(0, Date.now() - sw.startedAt);
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return {
      examId: sw.examId,
      startedAt: sw.startedAt,
      stoppedAt: sw.stoppedAt,
      durationMs,
      elapsedMs: durationMs,
      elapsedFormatted: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
      active: sw.active
    };
  }
}

module.exports = {
  CertificationEngine,
  PERFORMANCE_EXAMS
};
