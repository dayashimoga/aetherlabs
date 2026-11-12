'use strict';

const CAPSTONE_PROJECTS = [
  {
    id: 'proj-01-hardened-edge-node',
    trackId: 'track-foundations',
    title: 'Capstone 1: Hardened Linux Node, Distroless Runtime & L7 Ingress Gateway',
    difficulty: 'Intermediate',
    xpReward: 400,
    summary: 'Build a complete foundation stack from kernel sysctl tuning to a distroless microservice exposed via ClusterIP Service and L7 Ingress.',
    businessProblem: 'A retail edge platform must run on low-resource Linux nodes with kernel IP forwarding persisted, distroless containers, and L7 Ingress routing.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Persist Linux Kernel Forwarding ConfigMap',
        instruction: 'Create ConfigMap `kube-system/edge-sysctl` with `ip_forward=1`.'
      },
      {
        milestoneNumber: 2,
        title: 'Deploy Distroless Edge API',
        instruction: 'Create Deployment `edge-api` in `production` with 2 replicas using `gcr.io/distroless/static-debian12:nonroot`.'
      },
      {
        milestoneNumber: 3,
        title: 'Expose Service & Configure L7 Ingress',
        instruction: 'Expose `deployment/edge-api` on port 8080 in `production` and create Ingress `edge-ingress` in `production`.'
      }
    ],
    initialClusterState: { resources: [] },
    validationRules: [
      {
        id: 'proj-01-r1',
        description: 'ConfigMap kube-system/edge-sysctl has ip_forward=1',
        type: 'resource_field_equals',
        kind: 'ConfigMap',
        name: 'edge-sysctl',
        namespace: 'kube-system',
        fieldPath: 'data.ip_forward',
        expectedValue: '1',
        remediation: 'Run `kubectl create configmap edge-sysctl --from-literal=ip_forward=1 -n kube-system`.'
      },
      {
        id: 'proj-01-r2',
        description: 'Deployment production/edge-api has 2 running distroless replicas',
        type: 'replica_count_min',
        kind: 'Deployment',
        name: 'edge-api',
        namespace: 'production',
        expectedValue: 2,
        remediation: 'Run `kubectl create deployment edge-api --image=gcr.io/distroless/static-debian12:nonroot --replicas=2 -n production`.'
      },
      {
        id: 'proj-01-r3',
        description: 'Service production/edge-api has 2 active endpoints',
        type: 'service_has_endpoints',
        kind: 'Service',
        name: 'edge-api',
        namespace: 'production',
        expectedValue: 2,
        remediation: 'Run `kubectl expose deployment edge-api --port=8080 -n production`.'
      },
      {
        id: 'proj-01-r4',
        description: 'Ingress production/edge-ingress exists',
        type: 'resource_exists',
        kind: 'Ingress',
        name: 'edge-ingress',
        namespace: 'production',
        remediation: 'Run `kubectl create ingress edge-ingress -n production`.'
      }
    ],
    solutionCommands: [
      'kubectl create configmap edge-sysctl --from-literal=ip_forward=1 -n kube-system',
      'kubectl create deployment edge-api --image=gcr.io/distroless/static-debian12:nonroot --replicas=2 -n production',
      'kubectl expose deployment edge-api --port=8080 -n production',
      'kubectl create ingress edge-ingress -n production'
    ]
  },
  {
    id: 'proj-02-gitops-ha-commerce',
    trackId: 'track-k8s-admin',
    title: 'Capstone 2: Multi-AZ GitOps Commerce Platform with Helm, Argo CD & RBAC',
    difficulty: 'Advanced',
    xpReward: 450,
    summary: 'Architect and reconcile a production commerce stack combining least-privilege RBAC, Helm chart packaging, and Argo CD GitOps synchronization.',
    businessProblem: 'Engineering leadership mandates that all production services use scoped ServiceAccounts, Helm releases, and Argo CD pull-based reconciliation.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Provision Scoped RBAC Identity',
        instruction: 'Create ServiceAccount `commerce-sa` and Role `commerce-role` in `production`.'
      },
      {
        milestoneNumber: 2,
        title: 'Deploy Redis Cache via Helm v3',
        instruction: 'Install Helm release `commerce-cache` using `bitnami/redis` in `production`.'
      },
      {
        milestoneNumber: 3,
        title: 'Synchronize Argo CD Commerce Fleet',
        instruction: 'Run `argocd app sync commerce-gitops` to reconcile the production fleet.'
      }
    ],
    initialClusterState: {
      argoApps: [
        {
          name: 'commerce-gitops',
          namespace: 'argocd',
          destNamespace: 'production',
          syncStatus: 'OutOfSync',
          healthStatus: 'Progressing'
        }
      ],
      resources: []
    },
    validationRules: [
      {
        id: 'proj-02-r1',
        description: 'ServiceAccount production/commerce-sa exists',
        type: 'resource_exists',
        kind: 'ServiceAccount',
        name: 'commerce-sa',
        namespace: 'production',
        remediation: 'Run `kubectl create serviceaccount commerce-sa -n production`.'
      },
      {
        id: 'proj-02-r2',
        description: 'Role production/commerce-role exists',
        type: 'resource_exists',
        kind: 'Role',
        name: 'commerce-role',
        namespace: 'production',
        remediation: 'Run `kubectl create role commerce-role -n production`.'
      },
      {
        id: 'proj-02-r3',
        description: 'Helm release commerce-cache is deployed',
        type: 'helm_release_deployed',
        name: 'commerce-cache',
        namespace: 'production',
        remediation: 'Run `helm install commerce-cache bitnami/redis -n production`.'
      },
      {
        id: 'proj-02-r4',
        description: 'Argo CD Application commerce-gitops is Synced & Healthy',
        type: 'argocd_app_synced',
        name: 'commerce-gitops',
        remediation: 'Run `argocd app sync commerce-gitops`.'
      }
    ],
    solutionCommands: [
      'kubectl create serviceaccount commerce-sa -n production',
      'kubectl create role commerce-role -n production',
      'helm install commerce-cache bitnami/redis -n production',
      'argocd app sync commerce-gitops'
    ]
  },
  {
    id: 'proj-03-zero-trust-fintech',
    trackId: 'track-devsecops',
    title: 'Capstone 3: Zero-Trust PCI-DSS Payment Vault (NetworkPolicy + Istio mTLS + Non-Root)',
    difficulty: 'Advanced',
    xpReward: 500,
    summary: 'Enforce defense-in-depth across L3/L4 (NetworkPolicy), L7 (Istio STRICT mTLS), and container runtime (non-root SecurityContext + Trivy scan).',
    businessProblem: 'External security auditors require cryptographic mTLS in transit, micro-segmented network policies, and non-root execution before approving launch.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Scan & Harden Payment Vault Workload',
        instruction: 'Run `trivy image nginx:1.27-alpine` and patch `deployment/payment-vault` in `production` with `securityContext.runAsNonRoot=true`.'
      },
      {
        milestoneNumber: 2,
        title: 'Isolate Vault with Zero-Trust NetworkPolicy',
        instruction: 'Create `NetworkPolicy` `payment-vault-netpol` in `production`.'
      },
      {
        milestoneNumber: 3,
        title: 'Enforce Istio STRICT mTLS',
        instruction: 'Create `PeerAuthentication` `strict-mesh-mtls` in `production` with `spec.mtls.mode=STRICT`.'
      }
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'payment-vault', namespace: 'production' },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'payment-vault' } },
            template: {
              metadata: { labels: { app: 'payment-vault' } },
              spec: {
                securityContext: { runAsNonRoot: false },
                containers: [{ name: 'vault', image: 'nginx:1.27-alpine' }]
              }
            }
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'proj-03-r1',
        description: 'Scanned container image with Trivy',
        type: 'command_executed',
        commandSubstring: 'trivy image',
        remediation: 'Run `trivy image nginx:1.27-alpine`.'
      },
      {
        id: 'proj-03-r2',
        description: 'Deployment production/payment-vault enforces runAsNonRoot=true',
        type: 'resource_field_equals',
        kind: 'Deployment',
        name: 'payment-vault',
        namespace: 'production',
        fieldPath: 'spec.template.spec.securityContext.runAsNonRoot',
        expectedValue: true,
        remediation: 'Patch payment-vault with `{"spec":{"template":{"spec":{"securityContext":{"runAsNonRoot":true}}}}}`.'
      },
      {
        id: 'proj-03-r3',
        description: 'NetworkPolicy production/payment-vault-netpol exists',
        type: 'resource_exists',
        kind: 'NetworkPolicy',
        name: 'payment-vault-netpol',
        namespace: 'production',
        remediation: 'Run `kubectl create networkpolicy payment-vault-netpol -n production`.'
      },
      {
        id: 'proj-03-r4',
        description: 'PeerAuthentication production/strict-mesh-mtls has mode=STRICT',
        type: 'resource_field_equals',
        kind: 'PeerAuthentication',
        name: 'strict-mesh-mtls',
        namespace: 'production',
        fieldPath: 'spec.mtls.mode',
        expectedValue: 'STRICT',
        remediation: 'Create and patch PeerAuthentication strict-mesh-mtls with `{"spec":{"mtls":{"mode":"STRICT"}}}`.'
      }
    ],
    solutionCommands: [
      'trivy image nginx:1.27-alpine',
      'kubectl patch deployment payment-vault -n production -p \'{"spec":{"template":{"spec":{"securityContext":{"runAsNonRoot":true}}}}}\'',
      'kubectl create networkpolicy payment-vault-netpol -n production',
      'kubectl create peerauthentication strict-mesh-mtls -n production',
      'kubectl patch peerauthentication strict-mesh-mtls -n production -p \'{"spec":{"mtls":{"mode":"STRICT"}}}\''
    ]
  },
  {
    id: 'proj-04-sre-autonomous-observability',
    trackId: 'track-sre',
    title: 'Capstone 4: High-Resilience SRE Platform (OpenTelemetry, SLO Alerting & HPA)',
    difficulty: 'Advanced',
    xpReward: 450,
    summary: 'Recover a crashing tier, deploy OpenTelemetry telemetry collection, configure Prometheus SLO alerts, and enable HPA elastic scaling.',
    businessProblem: 'The checkout tier suffered an outage during peak load due to a bad environment flag, lack of elastic autoscaling, and missing SLO burn-rate alerts.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Recover Crashing Checkout Tier',
        instruction: 'Set `CRASH_ON_START=false` on `deployment/sre-checkout` in `production`.'
      },
      {
        milestoneNumber: 2,
        title: 'Configure HPA Elastic Autoscaling',
        instruction: 'Autoscale `deployment/sre-checkout` in `production` with `--min=3 --max=15 --cpu-percent=70`.'
      },
      {
        milestoneNumber: 3,
        title: 'Deploy PrometheusRule SLO Alert',
        instruction: 'Create `PrometheusRule` `checkout-slo-burn` in `monitoring`.'
      }
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'sre-checkout', namespace: 'production' },
          spec: {
            replicas: 3,
            selector: { matchLabels: { app: 'sre-checkout' } },
            template: {
              metadata: { labels: { app: 'sre-checkout' } },
              spec: {
                containers: [
                  {
                    name: 'checkout',
                    image: 'ghcr.io/kubelabs/checkout:v2.0.0',
                    env: [{ name: 'CRASH_ON_START', value: 'true' }]
                  }
                ]
              }
            }
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'proj-04-r1',
        description: 'All pods for production/sre-checkout are Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'sre-checkout',
        namespace: 'production',
        remediation: 'Run `kubectl set env deployment/sre-checkout CRASH_ON_START=false -n production`.'
      },
      {
        id: 'proj-04-r2',
        description: 'HorizontalPodAutoscaler production/sre-checkout configured with maxReplicas=15',
        type: 'resource_field_equals',
        kind: 'HorizontalPodAutoscaler',
        name: 'sre-checkout',
        namespace: 'production',
        fieldPath: 'spec.maxReplicas',
        expectedValue: 15,
        remediation: 'Run `kubectl autoscale deployment sre-checkout --min=3 --max=15 --cpu-percent=70 -n production`.'
      },
      {
        id: 'proj-04-r3',
        description: 'PrometheusRule monitoring/checkout-slo-burn exists',
        type: 'resource_exists',
        kind: 'PrometheusRule',
        name: 'checkout-slo-burn',
        namespace: 'monitoring',
        remediation: 'Run `kubectl create prometheusrule checkout-slo-burn -n monitoring`.'
      }
    ],
    solutionCommands: [
      'kubectl set env deployment/sre-checkout CRASH_ON_START=false -n production',
      'kubectl autoscale deployment sre-checkout --min=3 --max=15 --cpu-percent=70 -n production',
      'kubectl create prometheusrule checkout-slo-burn -n monitoring'
    ]
  },
  {
    id: 'proj-05-idp-crossplane-finops',
    trackId: 'track-platform',
    title: 'Capstone 5: Internal Developer Platform (OpenTofu + Crossplane + OpenCost FinOps)',
    difficulty: 'Principal',
    xpReward: 500,
    summary: 'Provision foundational cloud infrastructure with OpenTofu, expose self-service databases via Crossplane claims, and enforce FinOps cost-center governance.',
    businessProblem: 'Platform Engineering must deliver a unified IDP where base cloud VPC/EKS state is managed by OpenTofu, app databases are claimed via Crossplane, and costs are tracked by OpenCost.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Initialize & Apply OpenTofu Cloud Foundation',
        instruction: 'Run `tofu init` and `tofu apply` to provision the cloud infrastructure.'
      },
      {
        milestoneNumber: 2,
        title: 'Provision Self-Service Crossplane Database Claim',
        instruction: 'Create `PostgresInstance` `idp-shared-db` in `production`.'
      },
      {
        milestoneNumber: 3,
        title: 'Deploy OpenCost in Monitoring Namespace',
        instruction: 'Create deployment `idp-opencost` in `monitoring` with image `quay.io/kubecost1/kubecost-cost-model:v1.113.0`.'
      }
    ],
    initialClusterState: {
      resources: [],
      cloudResources: [],
      terraformState: { initialized: false, resources: [], outputs: {} }
    },
    validationRules: [
      {
        id: 'proj-05-r1',
        description: 'Cloud resource aws_eks_cluster.prod provisioned via OpenTofu',
        type: 'cloud_resource_exists',
        name: 'aws_eks_cluster.prod',
        remediation: 'Run `tofu init` and `tofu apply`.'
      },
      {
        id: 'proj-05-r2',
        description: 'Crossplane Service production/idp-shared-db-db reconciled with active endpoint',
        type: 'service_has_endpoints',
        kind: 'Service',
        name: 'idp-shared-db-db',
        namespace: 'production',
        expectedValue: 1,
        remediation: 'Run `kubectl create postgresinstance idp-shared-db -n production`.'
      },
      {
        id: 'proj-05-r3',
        description: 'Deployment monitoring/idp-opencost is Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'idp-opencost',
        namespace: 'monitoring',
        remediation: 'Run `kubectl create deployment idp-opencost --image=quay.io/kubecost1/kubecost-cost-model:v1.113.0 -n monitoring`.'
      }
    ],
    solutionCommands: [
      'tofu init',
      'tofu apply',
      'kubectl create postgresinstance idp-shared-db -n production',
      'kubectl create deployment idp-opencost --image=quay.io/kubecost1/kubecost-cost-model:v1.113.0 -n monitoring'
    ]
  },
  {
    id: 'proj-06-multicloud-aiops-gpu',
    trackId: 'track-multicloud-aiops',
    title: 'Capstone 6: Multi-Cloud Federated AI Inference Platform & Autonomous AI-Ops',
    difficulty: 'Principal',
    xpReward: 550,
    summary: 'Operate a multi-cloud fleet across AWS EKS, Azure AKS, and Google GKE, schedule GPU-accelerated LLM workloads, and run AI-Ops self-healing.',
    businessProblem: 'Global AI operations require multi-cloud control planes (EKS + GKE), GPU taint-tolerant LLM scheduling, and automated AI-Ops anomaly remediation.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Verify Multi-Cloud EKS & GKE Control Planes',
        instruction: 'Run `aws eks describe-cluster --name eks-ai-fleet` and `gcloud container clusters describe gke-ai-fleet`.'
      },
      {
        milestoneNumber: 2,
        title: 'Schedule GPU LLM Inference Workload',
        instruction: 'Patch `deployment/global-llm` in `production` to tolerate `nvidia.com/gpu`.'
      },
      {
        milestoneNumber: 3,
        title: 'Execute AI-Ops Autonomous Self-Healing',
        instruction: 'Run `aiops analyze` and `aiops remediate`.'
      }
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'global-llm', namespace: 'production' },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'global-llm' } },
            template: {
              metadata: { labels: { app: 'global-llm' } },
              spec: {
                containers: [
                  {
                    name: 'vllm',
                    image: 'ghcr.io/kubelabs/vllm-openai:v0.6.3',
                    resources: { limits: { 'nvidia.com/gpu': 1 } }
                  }
                ]
              }
            }
          }
        }
      ],
      cloudResources: []
    },
    validationRules: [
      {
        id: 'proj-06-r1',
        description: 'AWS EKS cluster eks-ai-fleet active',
        type: 'cloud_resource_exists',
        name: 'eks-ai-fleet',
        remediation: 'Run `aws eks describe-cluster --name eks-ai-fleet`.'
      },
      {
        id: 'proj-06-r2',
        description: 'Google GKE cluster gke-ai-fleet active',
        type: 'cloud_resource_exists',
        name: 'gke-ai-fleet',
        remediation: 'Run `gcloud container clusters describe gke-ai-fleet`.'
      },
      {
        id: 'proj-06-r3',
        description: 'Pod for production/global-llm is scheduled and Running on GPU node',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'global-llm',
        namespace: 'production',
        remediation: 'Patch deployment global-llm with toleration for nvidia.com/gpu.'
      },
      {
        id: 'proj-06-r4',
        description: 'AI-Ops remediation report recorded in monitoring/aiops-remediation-report',
        type: 'resource_exists',
        kind: 'ConfigMap',
        name: 'aiops-remediation-report',
        namespace: 'monitoring',
        remediation: 'Run `aiops analyze` and `aiops remediate`.'
      }
    ],
    solutionCommands: [
      'aws eks describe-cluster --name eks-ai-fleet',
      'gcloud container clusters describe gke-ai-fleet',
      'kubectl patch deployment global-llm -n production -p \'{"spec":{"template":{"spec":{"tolerations":[{"key":"nvidia.com/gpu","operator":"Exists","effect":"NoSchedule"}]}}}}\'',
      'aiops analyze',
      'aiops remediate'
    ]
  },
  {
    id: 'proj-07-multitenant-vcluster-platform',
    trackId: 'track-platform',
    title: 'Capstone 7: Multi-Tenant Virtual Cluster Platform with Kyverno & vCluster',
    difficulty: 'Principal',
    xpReward: 500,
    summary: 'Architect an enterprise multi-tenant developer platform using vCluster virtual control planes, Kyverno security admission policies, and hard resource quota governance.',
    businessProblem: 'Hundreds of feature teams need rapid isolated Kubernetes clusters without the infrastructure cost and slow provisioning times of dedicated cloud EKS/GKE clusters.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Provision Isolated Tenant Namespace & ResourceQuota',
        instruction: 'Create namespace `tenant-alpha` and ResourceQuota `alpha-quota` setting `hard.pods: "10"`.'
      },
      {
        milestoneNumber: 2,
        title: 'Enforce Governance with Kyverno ClusterPolicy',
        instruction: 'Deploy Kyverno ClusterPolicy `require-team-label` to mandate team ownership labels on all workloads.'
      },
      {
        milestoneNumber: 3,
        title: 'Deploy Lightweight Virtual Control Plane (vCluster)',
        instruction: 'Deploy virtual cluster `alpha-vcluster` inside namespace `tenant-alpha` using the vCluster CLI.'
      },
      {
        milestoneNumber: 4,
        title: 'Isolate Tenant Traffic via NetworkPolicy',
        instruction: 'Create NetworkPolicy `deny-cross-tenant` in `tenant-alpha` to isolate network ingress and egress.'
      }
    ],
    initialClusterState: { resources: [] },
    validationRules: [
      {
        id: 'proj-07-r1',
        description: 'ResourceQuota alpha-quota in namespace tenant-alpha limits hard.pods to 10',
        type: 'resource_field_equals',
        kind: 'ResourceQuota',
        name: 'alpha-quota',
        namespace: 'tenant-alpha',
        fieldPath: 'spec.hard.pods',
        expectedValue: '10',
        remediation: 'Run `kubectl create quota alpha-quota --hard=pods=10 -n tenant-alpha`.'
      },
      {
        id: 'proj-07-r2',
        description: 'ClusterPolicy require-team-label exists',
        type: 'resource_exists',
        kind: 'ClusterPolicy',
        name: 'require-team-label',
        remediation: 'Run `kubectl create clusterpolicy require-team-label`.'
      },
      {
        id: 'proj-07-r3',
        description: 'Command vcluster create executed for alpha-vcluster in tenant-alpha',
        type: 'command_executed',
        pattern: 'vcluster create alpha-vcluster',
        remediation: 'Run `vcluster create alpha-vcluster -n tenant-alpha`.'
      },
      {
        id: 'proj-07-r4',
        description: 'NetworkPolicy deny-cross-tenant exists in namespace tenant-alpha',
        type: 'resource_exists',
        kind: 'NetworkPolicy',
        name: 'deny-cross-tenant',
        namespace: 'tenant-alpha',
        remediation: 'Run `kubectl create networkpolicy deny-cross-tenant -n tenant-alpha`.'
      }
    ],
    solutionCommands: [
      'kubectl create namespace tenant-alpha',
      'kubectl create quota alpha-quota --hard=pods=10 -n tenant-alpha',
      'kubectl create clusterpolicy require-team-label',
      'vcluster create alpha-vcluster -n tenant-alpha',
      'kubectl create networkpolicy deny-cross-tenant -n tenant-alpha'
    ]
  },
  {
    id: 'proj-08-kserve-distributed-ai-cloud',
    trackId: 'track-multicloud-aiops',
    title: 'Capstone 8: Cloud-Native Distributed AI Cloud with KServe & Ray Autoscaler',
    difficulty: 'Principal',
    xpReward: 500,
    summary: 'Build a planetary-scale AI/ML platform orchestrating distributed PyTorch training jobs and serverless LLM model serving endpoints with hardware acceleration.',
    businessProblem: 'Generative AI product demands low-latency streaming responses with auto-scaling down to zero when idle, plus multi-node distributed model fine-tuning runs.',
    milestones: [
      {
        milestoneNumber: 1,
        title: 'Deploy Distributed Training Job with Kubeflow PyTorchJob',
        instruction: 'Create namespace `ai-platform` and deploy PyTorchJob `foundation-llm-finetune`.'
      },
      {
        milestoneNumber: 2,
        title: 'Provision Serverless LLM Predictor with KServe',
        instruction: 'Deploy KServe InferenceService `gpt-distributed-inference` in `ai-platform`.'
      },
      {
        milestoneNumber: 3,
        title: 'Configure AI Inference Gateway Service',
        instruction: 'Expose model endpoint via ClusterIP Service `inference-gw` on port 8000 in `ai-platform`.'
      },
      {
        milestoneNumber: 4,
        title: 'Run AI-Ops Autonomous Analysis',
        instruction: 'Execute `aiops analyze` to evaluate inference latency and cluster GPU saturation.'
      }
    ],
    initialClusterState: { resources: [] },
    validationRules: [
      {
        id: 'proj-08-r1',
        description: 'PyTorchJob foundation-llm-finetune exists in namespace ai-platform',
        type: 'resource_exists',
        kind: 'PyTorchJob',
        name: 'foundation-llm-finetune',
        namespace: 'ai-platform',
        remediation: 'Run `kubectl create pytorchjob foundation-llm-finetune -n ai-platform`.'
      },
      {
        id: 'proj-08-r2',
        description: 'InferenceService gpt-distributed-inference exists in namespace ai-platform',
        type: 'resource_exists',
        kind: 'InferenceService',
        name: 'gpt-distributed-inference',
        namespace: 'ai-platform',
        remediation: 'Run `kubectl create inferenceservice gpt-distributed-inference -n ai-platform`.'
      },
      {
        id: 'proj-08-r3',
        description: 'Service inference-gw exists in namespace ai-platform',
        type: 'resource_exists',
        kind: 'Service',
        name: 'inference-gw',
        namespace: 'ai-platform',
        remediation: 'Run `kubectl create service clusterip inference-gw --tcp=8000:8000 -n ai-platform`.'
      },
      {
        id: 'proj-08-r4',
        description: 'Command aiops analyze executed',
        type: 'command_executed',
        pattern: 'aiops analyze',
        remediation: 'Run `aiops analyze`.'
      }
    ],
    solutionCommands: [
      'kubectl create namespace ai-platform',
      'kubectl create pytorchjob foundation-llm-finetune -n ai-platform',
      'kubectl create inferenceservice gpt-distributed-inference -n ai-platform',
      'kubectl create service clusterip inference-gw --tcp=8000:8000 -n ai-platform',
      'aiops analyze'
    ]
  }
];

class ProjectEngine {
  constructor(validationEngine) {
    this.validationEngine = validationEngine;
    this.projects = CAPSTONE_PROJECTS;
  }

  listProjects() {
    return this.projects;
  }

  getProject(projectId) {
    return this.projects.find((p) => p.id === projectId) || null;
  }

  startProject(projectId, virtualCluster) {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Capstone project "${projectId}" not found`);
    }
    virtualCluster.reset(project.initialClusterState);
    return project;
  }

  validateProject(projectId, virtualCluster, commandHistory = []) {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Capstone project "${projectId}" not found`);
    }
    const report = this.validationEngine.evaluate(project.validationRules, virtualCluster, commandHistory);
    return {
      projectId: project.id,
      title: project.title,
      trackId: project.trackId,
      xpReward: project.xpReward,
      ...report
    };
  }

  validateMilestone(projectId, milestoneNumber, virtualCluster, commandHistory = []) {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Capstone project "${projectId}" not found`);
    }
    const mNum = parseInt(milestoneNumber, 10);
    const milestone = (project.milestones || []).find((m) => m.milestoneNumber === mNum);
    if (!milestone) {
      throw new Error(`Milestone ${mNum} not found in project "${projectId}"`);
    }

    const rulesForMilestone = (project.validationRules || []).filter((r, idx) => {
      if (r.milestoneNumber !== undefined) return r.milestoneNumber === mNum;
      return idx + 1 === mNum;
    });
    const rulesToEval = rulesForMilestone.length > 0 ? rulesForMilestone : [project.validationRules[mNum - 1] || project.validationRules[0]];
    const report = this.validationEngine.evaluate(rulesToEval, virtualCluster, commandHistory);
    return {
      projectId: project.id,
      milestoneNumber: mNum,
      milestoneTitle: milestone.title,
      ...report
    };
  }
}

module.exports = { ProjectEngine, CAPSTONE_PROJECTS };

