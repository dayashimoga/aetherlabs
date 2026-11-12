'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const {
  AdmissionController,
  applyJsonPatch,
  evaluateCEL,
  validatePodSecurityStandards
} = require('../src/core/admissionController');

test('Subphase 1.2.3: applyJsonPatch executes add, replace, and remove operations', () => {
  const doc = {
    metadata: { name: 'test-app', labels: { app: 'test' } },
    spec: {
      containers: [{ name: 'web', image: 'nginx:1.26' }]
    }
  };

  const patches = [
    { op: 'replace', path: '/spec/containers/0/image', value: 'nginx:1.27' },
    { op: 'add', path: '/metadata/labels/tier', value: 'frontend' },
    {
      op: 'add',
      path: '/spec/containers/-',
      value: { name: 'sidecar', image: 'envoyproxy/envoy:v1.31' }
    }
  ];

  const mutated = applyJsonPatch(doc, patches);
  assert.equal(mutated.spec.containers[0].image, 'nginx:1.27');
  assert.equal(mutated.metadata.labels.tier, 'frontend');
  assert.equal(mutated.spec.containers.length, 2);
  assert.equal(mutated.spec.containers[1].name, 'sidecar');
});

test('Subphase 1.2.3: evaluateCEL validates boolean logic, comparisons, has(), and string methods', () => {
  const context = {
    object: {
      metadata: { name: 'prod-api-server', labels: { env: 'production', tier: 'backend' } },
      spec: { replicas: 3, hostNetwork: false }
    }
  };

  // Comparisons and property paths
  assert.equal(evaluateCEL('object.spec.replicas <= 5', context), true);
  assert.equal(evaluateCEL('object.spec.replicas > 10', context), false);

  // Logical operators
  assert.equal(evaluateCEL("object.spec.replicas == 3 && object.metadata.labels['env'] == 'production'", context), true);
  assert.equal(evaluateCEL("object.spec.replicas > 5 || object.metadata.labels['tier'] == 'backend'", context), true);

  // Negation
  assert.equal(evaluateCEL('!object.spec.hostNetwork', context), true);

  // Built-in functions
  assert.equal(evaluateCEL('has(object.spec.replicas)', context), true);
  assert.equal(evaluateCEL('has(object.spec.missingProperty)', context), false);
  assert.equal(evaluateCEL("object.metadata.name.startsWith('prod-')", context), true);
  assert.equal(evaluateCEL("object.metadata.name.contains('api')", context), true);
});

test('Subphase 1.2.3: PodSecurityStandards validates baseline and restricted profiles', () => {
  // Baseline violation: privileged container
  const privilegedPod = {
    containers: [
      {
        name: 'bad-container',
        image: 'busybox',
        securityContext: { privileged: true }
      }
    ]
  };
  const baselineCheck = validatePodSecurityStandards(privilegedPod, 'baseline');
  assert.equal(baselineCheck.allowed, false);
  assert.match(baselineCheck.message, /must not be privileged/);

  // Restricted violation: missing drop ALL capabilities
  const unhardenedPod = {
    containers: [
      {
        name: 'app',
        image: 'nginx',
        securityContext: { allowPrivilegeEscalation: false, runAsNonRoot: true }
      }
    ]
  };
  const restrictedCheck1 = validatePodSecurityStandards(unhardenedPod, 'restricted');
  assert.equal(restrictedCheck1.allowed, false);
  assert.match(restrictedCheck1.message, /must drop ALL capabilities/);

  // Fully compliant restricted pod
  const hardenedPod = {
    securityContext: { runAsNonRoot: true },
    containers: [
      {
        name: 'app',
        image: 'nginx',
        securityContext: {
          allowPrivilegeEscalation: false,
          capabilities: { drop: ['ALL'] }
        }
      }
    ]
  };
  const restrictedCheck2 = validatePodSecurityStandards(hardenedPod, 'restricted');
  assert.equal(restrictedCheck2.allowed, true);
});

test('Subphase 1.2.3: MutatingAdmissionWebhook automatically mutates incoming manifests', () => {
  const graph = new ResourceGraph();
  const admission = new AdmissionController(graph);

  // Configure MutatingWebhookConfiguration in cluster
  graph.set({
    kind: 'MutatingWebhookConfiguration',
    metadata: { name: 'vault-agent-injector' },
    webhooks: [
      {
        name: 'vault.hashicorp.com',
        rules: [{ operations: ['CREATE'], resources: ['pods'] }],
        patches: [
          {
            op: 'add',
            path: '/metadata/annotations',
            value: { 'vault.hashicorp.com/agent-injected': 'true' }
          }
        ]
      }
    ]
  });

  const pod = {
    kind: 'Pod',
    metadata: { name: 'secure-workload', namespace: 'default' },
    spec: { containers: [{ name: 'app', image: 'nginx' }] }
  };

  const result = admission.admit(pod, 'CREATE');
  assert.equal(result.allowed, true);
  assert.equal(result.resource.metadata.annotations['vault.hashicorp.com/agent-injected'], 'true');
});

test('Subphase 1.2.3: ValidatingAdmissionWebhook and ValidatingAdmissionPolicy enforce policy rules', () => {
  const graph = new ResourceGraph();
  const admission = new AdmissionController(graph);

  // Setup ValidatingAdmissionPolicy
  graph.set({
    kind: 'ValidatingAdmissionPolicy',
    metadata: { name: 'replica-limit-policy' },
    spec: {
      matchConstraints: {
        resourceRules: [{ operations: ['CREATE', 'UPDATE'], resources: ['deployments'] }]
      },
      validations: [
        {
          expression: 'object.spec.replicas <= 5',
          message: 'Deployment replicas must not exceed 5 in this cluster'
        }
      ]
    }
  });

  // Bind policy to all deployments
  graph.set({
    kind: 'ValidatingAdmissionPolicyBinding',
    metadata: { name: 'replica-limit-binding' },
    spec: { policyName: 'replica-limit-policy' }
  });

  // Valid deployment (replicas: 3)
  const validDeploy = {
    kind: 'Deployment',
    metadata: { name: 'small-app', namespace: 'default' },
    spec: { replicas: 3 }
  };
  const res1 = admission.admit(validDeploy, 'CREATE');
  assert.equal(res1.allowed, true);

  // Invalid deployment (replicas: 10)
  const invalidDeploy = {
    kind: 'Deployment',
    metadata: { name: 'huge-app', namespace: 'default' },
    spec: { replicas: 10 }
  };
  const res2 = admission.admit(invalidDeploy, 'CREATE');
  assert.equal(res2.allowed, false);
  assert.equal(res2.status.code, 403);
  assert.match(res2.status.message, /Deployment replicas must not exceed 5/);
});
