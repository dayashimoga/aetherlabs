'use strict';

const INCIDENT_SCENARIOS = [
  {
    id: 'inc-01-selector-blackhole',
    title: 'SEV-1: Checkout Service 503 Outage (Zero Endpoints)',
    severity: 'SEV-1 (P0)',
    domainId: 'cloud-networking',
    estimatedMttrMinutes: 10,
    xpReward: 250,
    alertSummary: 'PagerDuty Alert: HTTP 503 spike (100% failure rate) on service production/checkout-svc.',
    customerImpact: 'Customers cannot complete orders; ingress gateway returns 503 Service Temporarily Unavailable.',
    symptoms: [
      'Pods for deployment production/checkout-api are Running (2/2), but traffic never reaches them.',
      'Running `kubectl get svc checkout-svc -n production` shows `<none>` under ENDPOINTS.'
    ],
    diagnosticHints: [
      'Compare the labels on pods in `production` (`kubectl get pods -n production --show-labels` or `kubectl describe deploy checkout-api -n production`) with `checkout-svc` selector (`kubectl describe svc checkout-svc -n production`).',
      'Notice `checkout-svc` selects `app: checkout-legacy` instead of `app: checkout-api`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'checkout-api', namespace: 'production', labels: { app: 'checkout-api' } },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'checkout-api' } },
            template: {
              metadata: { labels: { app: 'checkout-api', tier: 'backend' } },
              spec: { containers: [{ name: 'checkout', image: 'ghcr.io/kubelabs/checkout:v1.8.0' }] }
            }
          }
        },
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'checkout-svc', namespace: 'production' },
          spec: {
            type: 'ClusterIP',
            selector: { app: 'checkout-legacy' },
            ports: [{ port: 80, targetPort: 8080 }]
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-01-r1',
        description: 'Service production/checkout-svc selector matches app=checkout-api',
        type: 'resource_field_equals',
        kind: 'Service',
        name: 'checkout-svc',
        namespace: 'production',
        fieldPath: 'spec.selector.app',
        expectedValue: 'checkout-api',
        remediation: 'Patch service selector to {"spec":{"selector":{"app":"checkout-api"}}}'
      },
      {
        id: 'inc-01-r2',
        description: 'Service production/checkout-svc has at least 2 active endpoints',
        type: 'service_has_endpoints',
        kind: 'Service',
        name: 'checkout-svc',
        namespace: 'production',
        expectedValue: 2,
        remediation: 'Ensure checkout-api pods are Running and matched by checkout-svc selector.'
      }
    ],
    solutionCommands: [
      'kubectl patch svc checkout-svc -n production -p \'{"spec":{"selector":{"app":"checkout-api"}}}\''
    ]
  },
  {
    id: 'inc-02-bad-image-rollout',
    title: 'SEV-1: Bad Canary Image Tag Triggering ImagePullBackOff',
    severity: 'SEV-1 (P0)',
    domainId: 'kubernetes-core',
    estimatedMttrMinutes: 8,
    xpReward: 250,
    alertSummary: 'Prometheus Alert: KubePodImagePullBackOff in namespace production for deployment auth-service.',
    customerImpact: 'Authentication API rollout stalled; new pods stuck in ImagePullBackOff.',
    symptoms: [
      '`kubectl get pods -n production` shows `auth-service` pods in `ImagePullBackOff`.',
      'Container image was accidentally set to `ghcr.io/kubelabs/auth:v2.9-broken`.'
    ],
    diagnosticHints: [
      'Inspect the broken pod with `kubectl describe pod -n production`.',
      'Update the deployment image to `ghcr.io/kubelabs/auth:v2.9-stable` or run `kubectl rollout undo deployment/auth-service -n production`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'auth-service', namespace: 'production', labels: { app: 'auth-service' } },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'auth-service' } },
            template: {
              metadata: { labels: { app: 'auth-service' } },
              spec: { containers: [{ name: 'auth', image: 'ghcr.io/kubelabs/auth:v2.9-broken' }] }
            }
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-02-r1',
        description: 'All pods for production/auth-service are Running and Ready',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'auth-service',
        namespace: 'production',
        remediation: 'Update deployment/auth-service image to ghcr.io/kubelabs/auth:v2.9-stable'
      },
      {
        id: 'inc-02-r2',
        description: 'Deployment production/auth-service has 2 ready replicas',
        type: 'replica_count_min',
        kind: 'Deployment',
        name: 'auth-service',
        namespace: 'production',
        expectedValue: 2,
        remediation: 'Ensure 2 replicas of auth-service are Running.'
      }
    ],
    solutionCommands: [
      'kubectl set image deployment/auth-service auth=ghcr.io/kubelabs/auth:v2.9-stable -n production'
    ]
  },
  {
    id: 'inc-03-crashloop-secret',
    title: 'SEV-1: Billing Worker CrashLoopBackOff (Missing Secret)',
    severity: 'SEV-1 (P0)',
    domainId: 'sre-incident-chaos',
    estimatedMttrMinutes: 12,
    xpReward: 300,
    alertSummary: 'AlertManager: PodRestartRateHigh on production/billing-worker (CreateContainerConfigError / CrashLoop).',
    customerImpact: 'Invoice generation pipeline halted; pods unable to read `billing-db-secret`.',
    symptoms: [
      'Pods for `billing-worker` fail startup because secret `billing-db-secret` is missing in `production`.'
    ],
    diagnosticHints: [
      'Describe the failing pod in `production` to see which Secret name is referenced by `envFromSecret`.',
      'Create the missing secret `billing-db-secret` in `production` using `kubectl create secret generic billing-db-secret --from-literal=DB_URI=postgres://prod:5432/billing -n production`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'billing-worker', namespace: 'production', labels: { app: 'billing-worker' } },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'billing-worker' } },
            template: {
              metadata: { labels: { app: 'billing-worker' } },
              spec: {
                containers: [
                  {
                    name: 'worker',
                    image: 'ghcr.io/kubelabs/billing-worker:v1.4.2',
                    envFromSecret: 'billing-db-secret'
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
        id: 'inc-03-r1',
        description: 'Secret production/billing-db-secret exists',
        type: 'resource_exists',
        kind: 'Secret',
        name: 'billing-db-secret',
        namespace: 'production',
        remediation: 'Create secret billing-db-secret in namespace production.'
      },
      {
        id: 'inc-03-r2',
        description: 'Pods for production/billing-worker are Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'billing-worker',
        namespace: 'production',
        remediation: 'Ensure billing-worker pods transition to Running after secret creation.'
      }
    ],
    solutionCommands: [
      'kubectl create secret generic billing-db-secret --from-literal=DB_URI=postgres://prod:5432/billing -n production'
    ]
  },
  {
    id: 'inc-04-oomkilled-memory',
    title: 'SEV-2: Recommendation Engine OOMKilled Under Peak Load',
    severity: 'SEV-2 (P1)',
    domainId: 'observability-stack',
    estimatedMttrMinutes: 10,
    xpReward: 250,
    alertSummary: 'Prometheus Alert: ContainerOOMKilled on production/recommendation-engine (limit set to 4Mi).',
    customerImpact: 'Product recommendations timing out due to constant container OOM restarts.',
    symptoms: [
      '`recommendation-engine` pods show `OOMKilled` status because memory limit was misconfigured to `4Mi`.'
    ],
    diagnosticHints: [
      'Inspect container resource limits on `deployment/recommendation-engine` in `production`.',
      'Patch the memory limit to `512Mi` so the JVM/Go heap can initialize cleanly.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'recommendation-engine', namespace: 'production' },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'recommendation-engine' } },
            template: {
              metadata: { labels: { app: 'recommendation-engine' } },
              spec: {
                containers: [
                  {
                    name: 'engine',
                    image: 'ghcr.io/kubelabs/recommender:v3.1.0',
                    resources: { requests: { cpu: '200m', memory: '4Mi' }, limits: { cpu: '500m', memory: '4Mi' } }
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
        id: 'inc-04-r1',
        description: 'Memory limit on production/recommendation-engine increased to 512Mi',
        type: 'resource_field_equals',
        kind: 'Deployment',
        name: 'recommendation-engine',
        namespace: 'production',
        fieldPath: 'spec.template.spec.containers[0].resources.limits.memory',
        expectedValue: '512Mi',
        remediation: 'Patch memory limit to 512Mi on recommendation-engine deployment.'
      },
      {
        id: 'inc-04-r2',
        description: 'All recommendation-engine pods are Running without OOMKilled',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'recommendation-engine',
        namespace: 'production',
        remediation: 'Verify pods transition from OOMKilled to Running.'
      }
    ],
    solutionCommands: [
      'kubectl patch deployment recommendation-engine -n production -p \'{"spec":{"template":{"spec":{"containers":[{"name":"engine","image":"ghcr.io/kubelabs/recommender:v3.1.0","resources":{"limits":{"memory":"512Mi"},"requests":{"memory":"256Mi"}}}]}}}}\''
    ]
  },
  {
    id: 'inc-05-cpu-starvation-pending',
    title: 'SEV-2: Analytics Worker Stuck in Pending (Insufficient CPU)',
    severity: 'SEV-2 (P1)',
    domainId: 'kubernetes-core',
    estimatedMttrMinutes: 10,
    xpReward: 250,
    alertSummary: 'Scheduler Alert: PodUnschedulable on production/analytics-worker (requests 64000m CPU).',
    customerImpact: 'Real-time fraud analytics batch delayed; 0/2 replicas scheduled.',
    symptoms: [
      'Pods for `analytics-worker` are stuck in `Pending` with `0/3 nodes are available: 3 Insufficient cpu`.'
    ],
    diagnosticHints: [
      'A typo set `requests.cpu` to `64000m` (64 cores) instead of `500m`.',
      'Patch `deployment/analytics-worker` in `production` to request `500m` CPU.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'analytics-worker', namespace: 'production' },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'analytics-worker' } },
            template: {
              metadata: { labels: { app: 'analytics-worker' } },
              spec: {
                containers: [
                  {
                    name: 'analytics',
                    image: 'ghcr.io/kubelabs/analytics:v2.0.0',
                    resources: { requests: { cpu: '64000m', memory: '512Mi' } }
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
        id: 'inc-05-r1',
        description: 'CPU request on production/analytics-worker set to 500m',
        type: 'resource_field_equals',
        kind: 'Deployment',
        name: 'analytics-worker',
        namespace: 'production',
        fieldPath: 'spec.template.spec.containers[0].resources.requests.cpu',
        expectedValue: '500m',
        remediation: 'Patch spec.template.spec.containers[0].resources.requests.cpu to 500m.'
      },
      {
        id: 'inc-05-r2',
        description: 'Pods for production/analytics-worker are scheduled and Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'analytics-worker',
        namespace: 'production',
        remediation: 'Verify pods transition from Pending to Running.'
      }
    ],
    solutionCommands: [
      'kubectl patch deployment analytics-worker -n production -p \'{"spec":{"template":{"spec":{"containers":[{"name":"analytics","image":"ghcr.io/kubelabs/analytics:v2.0.0","resources":{"requests":{"cpu":"500m","memory":"512Mi"}}}]}}}}\''
    ]
  },
  {
    id: 'inc-06-gitops-drift',
    title: 'SEV-2: Argo CD Production Fleet OutOfSync & Degraded',
    severity: 'SEV-2 (P1)',
    domainId: 'gitops-delivery',
    estimatedMttrMinutes: 8,
    xpReward: 250,
    alertSummary: 'ArgoCD Alert: Application `payments-gitops` is OutOfSync and Degraded after manual hotfix drift.',
    customerImpact: 'Production payments deployment drifted from Git trunk; automated compliance check failing.',
    symptoms: [
      '`argocd app list` shows `payments-gitops` in `OutOfSync` and `Degraded` status.'
    ],
    diagnosticHints: [
      'Inspect drift with `argocd app list` and reconcile Git state to the cluster using `argocd app sync payments-gitops`.'
    ],
    initialClusterState: {
      argoApps: [
        {
          name: 'payments-gitops',
          namespace: 'argocd',
          destNamespace: 'production',
          repoURL: 'https://github.com/kubelabs-io/gitops-fleet',
          path: 'envs/production',
          targetRevision: 'main',
          syncStatus: 'OutOfSync',
          healthStatus: 'Degraded'
        }
      ],
      resources: [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'Application',
          metadata: { name: 'payments-gitops', namespace: 'argocd' },
          spec: {
            destination: { namespace: 'production' },
            source: { repoURL: 'https://github.com/kubelabs-io/gitops-fleet', targetRevision: 'main' }
          },
          status: { syncStatus: 'OutOfSync', healthStatus: 'Degraded' }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-06-r1',
        description: 'Argo CD Application payments-gitops is Synced and Healthy',
        type: 'argocd_app_synced',
        name: 'payments-gitops',
        remediation: 'Run `argocd app sync payments-gitops` to reconcile production state.'
      },
      {
        id: 'inc-06-r2',
        description: 'Deployment production/payments-gitops reconciled and Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'payments-gitops',
        namespace: 'production',
        remediation: 'Verify payments-gitops pods are Running in production namespace.'
      }
    ],
    solutionCommands: ['argocd app sync payments-gitops']
  },
  {
    id: 'inc-07-gpu-taint-unschedulable',
    title: 'SEV-2: LLM Inference Service Pending on GPU Taint',
    severity: 'SEV-2 (P1)',
    domainId: 'aiops-autonomous',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'AI-Ops Alert: Deployment `llm-gateway` stuck Pending — untolerated taint {nvidia.com/gpu: present}.',
    customerImpact: 'AI Copilot inference endpoint offline; GPU node idle while pods wait in scheduler queue.',
    symptoms: [
      '`llm-gateway` requests `nvidia.com/gpu: 1` but lacks a toleration for `nvidia.com/gpu`.'
    ],
    diagnosticHints: [
      'Add toleration `[{"key":"nvidia.com/gpu","operator":"Exists","effect":"NoSchedule"}]` to `deployment/llm-gateway` in `production`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'llm-gateway', namespace: 'production' },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'llm-gateway' } },
            template: {
              metadata: { labels: { app: 'llm-gateway' } },
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
      ]
    },
    validationRules: [
      {
        id: 'inc-07-r1',
        description: 'Deployment production/llm-gateway includes nvidia.com/gpu toleration',
        type: 'resource_field_equals',
        kind: 'Deployment',
        name: 'llm-gateway',
        namespace: 'production',
        fieldPath: 'spec.template.spec.tolerations[0].key',
        expectedValue: 'nvidia.com/gpu',
        remediation: 'Patch deployment llm-gateway to include toleration for key nvidia.com/gpu.'
      },
      {
        id: 'inc-07-r2',
        description: 'Pod for production/llm-gateway is Running on GPU worker node',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'llm-gateway',
        namespace: 'production',
        remediation: 'Ensure llm-gateway pod transitions to Running on kubelabs-worker-gpu-02.'
      }
    ],
    solutionCommands: [
      'kubectl patch deployment llm-gateway -n production -p \'{"spec":{"template":{"spec":{"tolerations":[{"key":"nvidia.com/gpu","operator":"Exists","effect":"NoSchedule"}]}}}}\''
    ]
  },
  {
    id: 'inc-08-zero-trust-db-exposure',
    title: 'SEV-1: Unprotected Production Ledger Database (Missing NetworkPolicy)',
    severity: 'SEV-1 (P0)',
    domainId: 'devsecops-security',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'Falco & Kyverno Security Alert: Pod `production/ledger-db` has no ingress NetworkPolicy isolation.',
    customerImpact: 'Compliance audit blocker: any compromised pod in the cluster can reach the ledger database on TCP 5432.',
    symptoms: [
      'No `NetworkPolicy` named `ledger-db-isolation` exists in `production`.'
    ],
    diagnosticHints: [
      'Apply a `NetworkPolicy` named `ledger-db-isolation` in `production` targeting `podSelector.matchLabels.app: ledger-db`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'StatefulSet',
          metadata: { name: 'ledger-db', namespace: 'production' },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'ledger-db' } },
            template: {
              metadata: { labels: { app: 'ledger-db', role: 'database' } },
              spec: { containers: [{ name: 'postgres', image: 'postgres:16-alpine' }] }
            }
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-08-r1',
        description: 'NetworkPolicy production/ledger-db-isolation exists',
        type: 'resource_exists',
        kind: 'NetworkPolicy',
        name: 'ledger-db-isolation',
        namespace: 'production',
        remediation: 'Create NetworkPolicy ledger-db-isolation in namespace production.'
      },
      {
        id: 'inc-08-r2',
        description: 'NetworkPolicy targets podSelector app=ledger-db',
        type: 'resource_field_equals',
        kind: 'NetworkPolicy',
        name: 'ledger-db-isolation',
        namespace: 'production',
        fieldPath: 'spec.podSelector.matchLabels.app',
        expectedValue: 'ledger-db',
        remediation: 'Set spec.podSelector.matchLabels.app to ledger-db.'
      }
    ],
    solutionCommands: [
      'kubectl create networkpolicy ledger-db-isolation -n production',
      'kubectl patch networkpolicy ledger-db-isolation -n production -p \'{"spec":{"podSelector":{"matchLabels":{"app":"ledger-db"}},"policyTypes":["Ingress"]}}\''
    ]
  },
  {
    id: 'inc-09-etcd-quorum-loss',
    title: 'SEV-1: etcd Quorum Loss & Control Plane Degradation',
    severity: 'SEV-1 (P0)',
    domainId: 'k8s-control-plane-lifecycle',
    estimatedMttrMinutes: 12,
    xpReward: 350,
    alertSummary: 'Prometheus Alert: etcdMemberUnhealthy: member etcd-2 quorum loss / corrupt snapshot database.',
    customerImpact: 'Kube-apiserver mutating webhooks and updates timing out; cluster in read-only degraded state.',
    symptoms: [
      '`kubectl get pods -n kube-system` shows `etcd-2` in CrashLoopBackOff with corrupt database snapshot.',
      '`etcdctl endpoint health` reports split-brain risk with only 2/3 voting members.'
    ],
    diagnosticHints: [
      'Restore the verified uncorrupted backup using `etcdctl snapshot restore /backup/etcd-snapshot.db`.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'etcd-0', namespace: 'kube-system', labels: { component: 'etcd', tier: 'control-plane' } },
          spec: { containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.15-0' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'etcd-1', namespace: 'kube-system', labels: { component: 'etcd', tier: 'control-plane' } },
          spec: { containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.15-0' }] }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: 'etcd-2',
            namespace: 'kube-system',
            labels: { component: 'etcd', tier: 'control-plane', 'etcd-unhealthy': 'true' }
          },
          spec: { containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.15-0' }] }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-09-r1',
        description: 'etcd-2 member restored and healthy in namespace kube-system',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'etcd-2',
        namespace: 'kube-system',
        remediation: 'Execute etcdctl snapshot restore /backup/etcd-snapshot.db to restore corrupted member.'
      },
      {
        id: 'inc-09-r2',
        description: 'Command etcdctl snapshot restore executed',
        type: 'command_executed',
        pattern: 'etcdctl snapshot restore',
        remediation: 'Run etcdctl snapshot restore /backup/etcd-snapshot.db.'
      }
    ],
    solutionCommands: [
      'etcdctl snapshot restore /backup/etcd-snapshot.db'
    ]
  },
  {
    id: 'inc-10-kyverno-admission-block',
    title: 'SEV-1: Kyverno Webhook Blocking All Production Deployments',
    severity: 'SEV-1 (P0)',
    domainId: 'policy-as-code-kyverno',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'PagerDuty Alert: Internal error occurred: admission webhook "validate.kyverno.svc" failed to call webhook.',
    customerImpact: 'All engineering teams blocked from deploying emergency hotfixes or rollouts.',
    symptoms: [
      'Admission webhooks configured with failurePolicy: Fail while webhook service is degraded.',
      'Any kubectl apply returns error contacting Kyverno admission controller.'
    ],
    diagnosticHints: [
      'Inspect ValidatingWebhookConfiguration named kyverno-resource-validating-webhook-cfg.',
      'Patch failurePolicy from Fail to Ignore to unblock critical production rollouts during webhook outage.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'admissionregistration.k8s.io/v1',
          kind: 'ValidatingWebhookConfiguration',
          metadata: { name: 'kyverno-resource-validating-webhook-cfg' },
          webhooks: [
            {
              name: 'validate.kyverno.svc',
              failurePolicy: 'Fail',
              rules: [{ operations: ['CREATE', 'UPDATE'], apiGroups: ['*'], apiVersions: ['*'], resources: ['*'] }]
            }
          ]
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-10-r1',
        description: 'ValidatingWebhookConfiguration kyverno-resource-validating-webhook-cfg exists',
        type: 'resource_exists',
        kind: 'ValidatingWebhookConfiguration',
        name: 'kyverno-resource-validating-webhook-cfg',
        remediation: 'Ensure ValidatingWebhookConfiguration exists.'
      },
      {
        id: 'inc-10-r2',
        description: 'Webhook failurePolicy patched to Ignore to prevent deployment blackhole',
        type: 'resource_field_equals',
        kind: 'ValidatingWebhookConfiguration',
        name: 'kyverno-resource-validating-webhook-cfg',
        fieldPath: 'webhooks.0.failurePolicy',
        expectedValue: 'Ignore',
        remediation: 'Patch webhooks.0.failurePolicy to "Ignore".'
      }
    ],
    solutionCommands: [
      'kubectl patch validatingwebhookconfiguration kyverno-resource-validating-webhook-cfg -p \'{"webhooks":[{"name":"validate.kyverno.svc","failurePolicy":"Ignore"}]}\''
    ]
  },
  {
    id: 'inc-11-coredns-loop-crash',
    title: 'SEV-1: Cluster-Wide DNS Blackhole (CoreDNS Loop Detected)',
    severity: 'SEV-1 (P0)',
    domainId: 'cloud-networking',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'Prometheus Alert: KubeDNSCrashLoopBackOff: plugin/loop: Loop (127.0.0.1:53 -> :53) detected.',
    customerImpact: 'Microservices unable to resolve database hostnames or internal services; 100% downstream traffic failing.',
    symptoms: [
      'CoreDNS pods crash immediately upon startup with loop detection logs.',
      'ConfigMap coredns in kube-system forwards traffic to 127.0.0.1.'
    ],
    diagnosticHints: [
      'Inspect Corefile in ConfigMap/coredns in kube-system.',
      'Change forward . 127.0.0.1 to a valid upstream resolver such as 1.1.1.1.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'coredns', namespace: 'kube-system' },
          data: {
            Corefile: '.:53 {\n    errors\n    health\n    ready\n    kubernetes cluster.local in-addr.arpa ip6.arpa\n    forward . 127.0.0.1\n    cache 30\n    reload\n}'
          }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'coredns-primary', namespace: 'kube-system', labels: { app: 'coredns', 'k8s-app': 'kube-dns' } },
          spec: { containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.11.3' }] }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-11-r1',
        description: 'CoreDNS Corefile ConfigMap points forwarder to valid upstream DNS 1.1.1.1',
        type: 'resource_field_contains',
        kind: 'ConfigMap',
        name: 'coredns',
        namespace: 'kube-system',
        fieldPath: 'data.Corefile',
        expectedValue: 'forward . 1.1.1.1',
        remediation: 'Patch ConfigMap coredns in kube-system with valid forward upstream: forward . 1.1.1.1.'
      },
      {
        id: 'inc-11-r2',
        description: 'CoreDNS pod recovers to Running phase',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'coredns-primary',
        namespace: 'kube-system',
        remediation: 'Ensure coredns-primary transitions to Running once loop is removed.'
      }
    ],
    solutionCommands: [
      'kubectl patch configmap coredns -n kube-system -p \'{"data":{"Corefile":".:53 {\\n    errors\\n    health\\n    ready\\n    kubernetes cluster.local in-addr.arpa ip6.arpa\\n    forward . 1.1.1.1\\n    cache 30\\n    reload\\n}"}}\''
    ]
  },
  {
    id: 'inc-12-pvc-storageclass-pending',
    title: 'SEV-2: Database Pod Stuck in Pending (Non-Existent StorageClass)',
    severity: 'SEV-2 (P1)',
    domainId: 'storage-csi-velero-dr',
    estimatedMttrMinutes: 8,
    xpReward: 250,
    alertSummary: 'Prometheus Alert: PersistentVolumeClaimPending: claim production/analytics-db-data has been pending > 15m.',
    customerImpact: 'Nightly analytics ingestion stalled; analytics reporting dashboard displays stale data.',
    symptoms: [
      'Pod analytics-db-0 stuck in Pending (ContainerCreating).',
      'PVC analytics-db-data references storageClassName: fast-nvme-ssd which is not provisioned in the cluster.'
    ],
    diagnosticHints: [
      'kubectl get sc shows available StorageClass is standard-csi.',
      'Update PVC analytics-db-data or re-apply with storageClassName: standard-csi.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'storage.k8s.io/v1',
          kind: 'StorageClass',
          metadata: { name: 'standard-csi' },
          provisioner: 'csi.kubelabs.io/driver',
          reclaimPolicy: 'Delete',
          volumeBindingMode: 'Immediate'
        },
        {
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: { name: 'analytics-db-data', namespace: 'production' },
          spec: {
            storageClassName: 'fast-nvme-ssd',
            accessModes: ['ReadWriteOnce'],
            resources: { requests: { storage: '20Gi' } }
          }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'analytics-db-0', namespace: 'production', labels: { app: 'analytics-db' } },
          spec: {
            containers: [{ name: 'postgres', image: 'postgres:16-alpine' }],
            volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'analytics-db-data' } }]
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-12-r1',
        description: 'PersistentVolumeClaim analytics-db-data uses available storageClassName standard-csi',
        type: 'resource_field_equals',
        kind: 'PersistentVolumeClaim',
        name: 'analytics-db-data',
        namespace: 'production',
        fieldPath: 'spec.storageClassName',
        expectedValue: 'standard-csi',
        remediation: 'Patch PVC analytics-db-data storageClassName to standard-csi.'
      },
      {
        id: 'inc-12-r2',
        description: 'Pod analytics-db-0 transitions to Running after PVC volume binding',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'analytics-db-0',
        namespace: 'production',
        remediation: 'Ensure analytics-db-0 pod is Running.'
      }
    ],
    solutionCommands: [
      'kubectl patch pvc analytics-db-data -n production -p \'{"spec":{"storageClassName":"standard-csi"}}\''
    ]
  },
  {
    id: 'inc-13-slow-app-cpu-throttling',
    title: 'SEV-2: Slow Application Response & P99 Latency Spike (CFS CPU Throttling)',
    severity: 'SEV-2 (P1)',
    domainId: 'autoscaling-karpenter-keda',
    estimatedMttrMinutes: 10,
    xpReward: 275,
    alertSummary: 'Prometheus Alert: HighRequestLatencyP99: order-processor P99 latency > 4.8s; container_cpu_cfs_throttled_periods_total > 96%.',
    customerImpact: 'Checkout order confirmation takes > 5 seconds and intermittently times out due to severe CPU throttling.',
    symptoms: [
      'Deployment order-processor in namespace production is severely throttled with limits.cpu: 5m.',
      'No HorizontalPodAutoscaler exists to scale order-processor during traffic spikes.'
    ],
    diagnosticHints: [
      'Inspect container resource limits on deployment/order-processor in namespace production.',
      'Update CPU/memory limits via kubectl set resources and create an HPA via kubectl autoscale.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'order-processor', namespace: 'production' },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'order-processor' } },
            template: {
              metadata: { labels: { app: 'order-processor' } },
              spec: {
                containers: [
                  {
                    name: 'order-processor',
                    image: 'registry.kubelabs.io/commerce/order-processor:v2.4.0',
                    resources: {
                      requests: { cpu: '5m', memory: '128Mi' },
                      limits: { cpu: '5m', memory: '256Mi' }
                    }
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
        id: 'inc-13-r1',
        description: 'Deployment order-processor CPU limit increased to 500m to eliminate CFS throttling',
        type: 'resource_field_equals',
        kind: 'Deployment',
        name: 'order-processor',
        namespace: 'production',
        fieldPath: 'spec.template.spec.containers.0.resources.limits.cpu',
        expectedValue: '500m',
        remediation: 'Run: kubectl set resources deployment/order-processor --limits=cpu=500m,memory=256Mi -n production'
      },
      {
        id: 'inc-13-r2',
        description: 'HorizontalPodAutoscaler order-processor configured in namespace production',
        type: 'resource_exists',
        kind: 'HorizontalPodAutoscaler',
        name: 'order-processor',
        namespace: 'production',
        remediation: 'Run: kubectl autoscale deployment order-processor --min=2 --max=10 --cpu-percent=70 -n production'
      },
      {
        id: 'inc-13-r3',
        description: 'All order-processor replicas are Running without CPU throttling',
        type: 'pod_status_running',
        kind: 'Deployment',
        name: 'order-processor',
        namespace: 'production',
        remediation: 'Ensure order-processor pods are Running.'
      }
    ],
    solutionCommands: [
      'kubectl set resources deployment/order-processor --limits=cpu=500m,memory=256Mi -n production',
      'kubectl autoscale deployment order-processor --min=2 --max=10 --cpu-percent=70 -n production'
    ]
  },
  {
    id: 'inc-14-iam-irsa-access-denied',
    title: 'SEV-1: AWS EKS S3 Ingestion Outage (IAM IRSA Role Annotation Missing)',
    severity: 'SEV-1 (P0)',
    domainId: 'aws-eks-cloud',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'CloudWatch Alert: S3AccessDeniedException: pod s3-sync-worker in namespace production failed AssumeRoleWithWebIdentity.',
    customerImpact: 'Customer invoice PDFs and audit exports cannot be uploaded to S3 bucket.',
    symptoms: [
      'Deployment s3-sync-worker in namespace production is crashing with CrashLoopBackOff (AccessDenied: WebIdentityErr).',
      'ServiceAccount s3-worker-sa is missing annotation eks.amazonaws.com/role-arn.'
    ],
    diagnosticHints: [
      'Check ServiceAccount s3-worker-sa in namespace production.',
      'Annotate ServiceAccount s3-worker-sa with eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/eks-s3-access.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'v1',
          kind: 'ServiceAccount',
          metadata: {
            name: 's3-worker-sa',
            namespace: 'production',
            annotations: {}
          }
        },
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 's3-sync-worker', namespace: 'production' },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 's3-sync-worker' } },
            template: {
              metadata: { labels: { app: 's3-sync-worker' } },
              spec: {
                serviceAccountName: 's3-worker-sa',
                containers: [
                  {
                    name: 's3-sync',
                    image: 'registry.kubelabs.io/cloud/s3-sync:v1.8.0',
                    env: [{ name: 'REQUIRE_IRSA_ROLE', value: 'true' }]
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
        id: 'inc-14-r1',
        description: 'ServiceAccount s3-worker-sa has valid AWS IAM role annotation (IRSA)',
        type: 'resource_field_equals',
        kind: 'ServiceAccount',
        name: 's3-worker-sa',
        namespace: 'production',
        fieldPath: 'metadata.annotations.eks.amazonaws.com/role-arn',
        expectedValue: 'arn:aws:iam::123456789012:role/eks-s3-access',
        remediation: 'Run: kubectl annotate serviceaccount s3-worker-sa eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/eks-s3-access -n production'
      },
      {
        id: 'inc-14-r2',
        description: 'Deployment s3-sync-worker pod transitions to Running with valid STS WebIdentity token',
        type: 'pod_status_running',
        kind: 'Deployment',
        name: 's3-sync-worker',
        namespace: 'production',
        remediation: 'Ensure s3-sync-worker pod is Running after annotating the ServiceAccount.'
      }
    ],
    solutionCommands: [
      'kubectl annotate serviceaccount s3-worker-sa eks.amazonaws.com/role-arn=arn:aws:iam::123456789012:role/eks-s3-access -n production'
    ]
  },
  {
    id: 'inc-15-node-notready-kubelet-down',
    title: 'SEV-1: Worker Node NotReady & Cordoned (Kubelet Daemon Stopped)',
    severity: 'SEV-1 (P0)',
    domainId: 'k8s-architecture',
    estimatedMttrMinutes: 10,
    xpReward: 300,
    alertSummary: 'PagerDuty P0: KubeNodeNotReady: Node kubelabs-worker-01 is NotReady and cordoned; pinned workloads degraded.',
    customerImpact: 'Edge payment gateway pods pinned to kubelabs-worker-01 are in NodeNotReady state.',
    symptoms: [
      'Node kubelabs-worker-01 has status.phase = NotReady and spec.unschedulable = true.',
      'kubelet systemd unit on the worker node is stopped.'
    ],
    diagnosticHints: [
      'Restart kubelet via systemctl restart kubelet.',
      'Uncordon node kubelabs-worker-01 via kubectl uncordon kubelabs-worker-01.'
    ],
    initialClusterState: {
      resources: [
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: {
            name: 'kubelabs-worker-01',
            labels: {
              'kubernetes.io/hostname': 'kubelabs-worker-01',
              'node-role.kubernetes.io/worker': 'true',
              'workload-tier': 'general'
            }
          },
          spec: { taints: [], unschedulable: true },
          status: {
            phase: 'NotReady',
            capacity: { cpu: '8', memory: '16Gi', pods: '110' },
            allocatable: { cpu: '7800m', memory: '15Gi', pods: '110' },
            nodeInfo: {
              kubeletVersion: 'v1.31.2',
              containerRuntimeVersion: 'containerd://2.0.0',
              osImage: 'Ubuntu 24.04.1 LTS'
            }
          }
        },
        {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'payments-edge-gw', namespace: 'production', labels: { app: 'payments-edge' } },
          spec: {
            nodeName: 'kubelabs-worker-01',
            containers: [{ name: 'edge-gw', image: 'registry.kubelabs.io/payments/edge-gw:v1.5.0' }]
          }
        }
      ]
    },
    validationRules: [
      {
        id: 'inc-15-r1',
        description: 'Node kubelabs-worker-01 status.phase is Ready',
        type: 'resource_field_equals',
        kind: 'Node',
        name: 'kubelabs-worker-01',
        namespace: 'default',
        fieldPath: 'status.phase',
        expectedValue: 'Ready',
        remediation: 'Restart kubelet with: systemctl restart kubelet'
      },
      {
        id: 'inc-15-r2',
        description: 'Node kubelabs-worker-01 is uncordoned (spec.unschedulable is false)',
        type: 'resource_field_equals',
        kind: 'Node',
        name: 'kubelabs-worker-01',
        namespace: 'default',
        fieldPath: 'spec.unschedulable',
        expectedValue: false,
        remediation: 'Uncordon node with: kubectl uncordon kubelabs-worker-01'
      },
      {
        id: 'inc-15-r3',
        description: 'Pod payments-edge-gw on kubelabs-worker-01 is Running',
        type: 'pod_status_running',
        kind: 'Pod',
        name: 'payments-edge-gw',
        namespace: 'production',
        remediation: 'Ensure payments-edge-gw transitions to Running once node is Ready.'
      }
    ],
    solutionCommands: [
      'systemctl restart kubelet',
      'kubectl uncordon kubelabs-worker-01'
    ]
  }
];

class IncidentEngine {
  constructor(validationEngine) {
    this.validationEngine = validationEngine;
    this.scenarios = INCIDENT_SCENARIOS;
  }

  listIncidents() {
    return this.scenarios.map((inc) => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      domainId: inc.domainId,
      estimatedMttrMinutes: inc.estimatedMttrMinutes,
      xpReward: inc.xpReward,
      alertSummary: inc.alertSummary,
      customerImpact: inc.customerImpact
    }));
  }

  getIncident(incidentId) {
    return this.scenarios.find((inc) => inc.id === incidentId) || null;
  }

  injectIncident(incidentId, virtualCluster) {
    const inc = this.getIncident(incidentId);
    if (!inc) {
      throw new Error(`Incident scenario "${incidentId}" not found`);
    }
    virtualCluster.reset(inc.initialClusterState);
    return inc;
  }

  verifyIncidentResolution(incidentId, virtualCluster, commandHistory = []) {
    const inc = this.getIncident(incidentId);
    if (!inc) {
      throw new Error(`Incident scenario "${incidentId}" not found`);
    }
    const report = this.validationEngine.evaluate(inc.validationRules, virtualCluster, commandHistory);
    return {
      incidentId: inc.id,
      title: inc.title,
      severity: inc.severity,
      xpReward: inc.xpReward,
      ...report
    };
  }
}

module.exports = { IncidentEngine, INCIDENT_SCENARIOS };

