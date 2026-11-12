'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseYaml, parseAllYaml, stringifyYaml } = require('../src/core/yamlParser');
const { jsonPath, formatJsonPath } = require('../src/core/jsonPath');

test('Subphase 1.1.3: YAML parser parses single and multi-document Kubernetes manifests', () => {
  const multiYaml = `
---
apiVersion: v1
kind: Namespace
metadata:
  name: prod
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: prod
  labels:
    app.kubernetes.io/name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
`;

  const docs = parseAllYaml(multiYaml);
  assert.equal(docs.length, 2);

  // Doc 1
  assert.equal(docs[0].apiVersion, 'v1');
  assert.equal(docs[0].kind, 'Namespace');
  assert.equal(docs[0].metadata.name, 'prod');

  // Doc 2
  assert.equal(docs[1].apiVersion, 'apps/v1');
  assert.equal(docs[1].kind, 'Deployment');
  assert.equal(docs[1].spec.replicas, 3);
  assert.equal(docs[1].spec.template.spec.containers[0].name, 'nginx');
  assert.equal(docs[1].spec.template.spec.containers[0].ports[0].containerPort, 80);
});

test('Subphase 1.1.3: YAML parser handles literal block scalars (|), comments, and type inference', () => {
  const configMapYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config # App configuration
data:
  app.properties: |
    server.port=8080
    debug.enabled=true
    database.url=postgres://db:5432/main
  enabled: true
  disabled: false
  retry_count: 5
  timeout_seconds: 12.5
  hex_mask: 0xFF
  octal_perm: 0o755
  null_field: ~
  quoted_string: "hello \\"world\\""
  single_quoted: 'single ''quoted'''
`;

  const cm = parseYaml(configMapYaml);
  assert.equal(cm.metadata.name, 'app-config');
  assert.equal(cm.data['app.properties'], 'server.port=8080\ndebug.enabled=true\ndatabase.url=postgres://db:5432/main\n');
  assert.equal(cm.data.enabled, true);
  assert.equal(cm.data.disabled, false);
  assert.equal(cm.data.retry_count, 5);
  assert.equal(cm.data.timeout_seconds, 12.5);
  assert.equal(cm.data.hex_mask, 255);
  assert.equal(cm.data.octal_perm, 493);
  assert.equal(cm.data.null_field, null);
  assert.equal(cm.data.quoted_string, 'hello "world"');
  assert.equal(cm.data.single_quoted, "single 'quoted'");
});

test('Subphase 1.1.3: YAML parser handles anchors (&) and aliases (*)', () => {
  const yamlWithAnchors = `
definitions:
  resources: &default_res
    limits:
      cpu: "500m"
      memory: "256Mi"
containers:
  - name: frontend
    resources: *default_res
  - name: backend
    resources: *default_res
`;

  const parsed = parseYaml(yamlWithAnchors);
  assert.deepEqual(parsed.containers[0].resources, {
    limits: { cpu: '500m', memory: '256Mi' }
  });
  assert.deepEqual(parsed.containers[1].resources, {
    limits: { cpu: '500m', memory: '256Mi' }
  });
});

test('Subphase 1.1.3: YAML serializer stringifyYaml formats objects to valid YAML', () => {
  const obj = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'test-pod',
      labels: { app: 'test' }
    },
    spec: {
      containers: [
        {
          name: 'c1',
          image: 'busybox',
          command: ['sh', '-c', 'echo hello']
        }
      ]
    }
  };

  const yamlStr = stringifyYaml(obj);
  assert.match(yamlStr, /apiVersion: v1/);
  assert.match(yamlStr, /kind: Pod/);

  // Round-trip parse
  const roundTrip = parseYaml(yamlStr);
  assert.equal(roundTrip.apiVersion, 'v1');
  assert.equal(roundTrip.kind, 'Pod');
  assert.equal(roundTrip.metadata.name, 'test-pod');
  assert.equal(roundTrip.spec.containers[0].image, 'busybox');
});

test('Subphase 1.1.3: JSONPath evaluator queries properties, brackets, wildcards, slices, and recursion', () => {
  const clusterData = {
    items: [
      {
        metadata: { name: 'pod-1', namespace: 'default' },
        status: { phase: 'Running', podIP: '10.244.0.1' },
        spec: { replicas: 1 }
      },
      {
        metadata: { name: 'pod-2', namespace: 'default' },
        status: { phase: 'Pending', podIP: null },
        spec: { replicas: 1 }
      },
      {
        metadata: { name: 'pod-3', namespace: 'kube-system' },
        status: { phase: 'Running', podIP: '10.244.0.2' },
        spec: { replicas: 2 }
      }
    ]
  };

  // Property access
  assert.deepEqual(jsonPath(clusterData, '$.items[0].metadata.name'), ['pod-1']);
  assert.deepEqual(jsonPath(clusterData, 'items[0].metadata.name'), ['pod-1']);
  assert.deepEqual(jsonPath(clusterData, '{.items[0].metadata.name}'), ['pod-1']);

  // Negative indexing
  assert.deepEqual(jsonPath(clusterData, '$.items[-1].metadata.name'), ['pod-3']);

  // Wildcard
  assert.deepEqual(jsonPath(clusterData, '$.items[*].metadata.name'), ['pod-1', 'pod-2', 'pod-3']);

  // Slice
  assert.deepEqual(jsonPath(clusterData, '$.items[0:2].metadata.name'), ['pod-1', 'pod-2']);

  // Recursive descent
  const names = jsonPath(clusterData, '$..name');
  assert.ok(names.includes('pod-1'));
  assert.ok(names.includes('pod-2'));
  assert.ok(names.includes('pod-3'));
});

test('Subphase 1.1.3: JSONPath filter expressions and Kubernetes output formatting', () => {
  const clusterData = {
    items: [
      {
        metadata: { name: 'web-prod', labels: { env: 'prod' } },
        status: { phase: 'Running', restarts: 0 },
        spec: { replicas: 3 }
      },
      {
        metadata: { name: 'web-dev', labels: { env: 'dev' } },
        status: { phase: 'Pending', restarts: 2 },
        spec: { replicas: 1 }
      },
      {
        metadata: { name: 'api-prod', labels: { env: 'prod' } },
        status: { phase: 'Running', restarts: 1 },
        spec: { replicas: 5 }
      }
    ]
  };

  // Filter by string equality
  const running = jsonPath(clusterData, "$.items[?(@.status.phase == 'Running')].metadata.name");
  assert.deepEqual(running, ['web-prod', 'api-prod']);

  // Filter by numeric comparison
  const scaled = jsonPath(clusterData, '$.items[?(@.spec.replicas > 1)].metadata.name');
  assert.deepEqual(scaled, ['web-prod', 'api-prod']);

  // Filter with logical AND
  const prodRunning = jsonPath(
    clusterData,
    "$.items[?(@.status.phase == 'Running' && @.spec.replicas > 3)].metadata.name"
  );
  assert.deepEqual(prodRunning, ['api-prod']);

  // Kubernetes formatJsonPath with range and literal escapes
  const tpl = '{range .items[?(@.status.phase == \'Running\')]}{.metadata.name}{"\\t"}{.status.phase}{"\\n"}{end}';
  const formatted = formatJsonPath(clusterData, tpl);
  assert.equal(formatted, 'web-prod\tRunning\napi-prod\tRunning\n');
});
