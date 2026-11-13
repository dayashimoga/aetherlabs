'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const {
  PromQLEngine,
  LogQLEngine,
  OTelPipelineValidator,
  JaegerTraceGenerator,
  SloBurnRateCalculator
} = require('../src/core/observabilityEngine');

test('Subphase 3.2.1: promtool instant query and check rules integration', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  const promql = new PromQLEngine();
  const now = 1731420000;
  promql.recordSample('up', { job: 'node-exporter', instance: 'node-1:9100' }, 1, now);
  promql.recordSample('up', { job: 'kubelet', instance: 'node-1:10250' }, 1, now);

  const dispatcher = new MultiCliDispatcher({ graph, vfs, promql });

  // 1. promtool query instant
  const queryRes = dispatcher.handlePromtool({
    argv: ['promtool', 'query', 'instant', 'http://localhost:9090', 'up{job="node-exporter"}']
  });
  assert.equal(queryRes.code, 0);
  assert.ok(queryRes.stdout.includes('instance="node-1:9100"'));
  assert.ok(queryRes.stdout.includes('=> 1'));

  // 2. promtool check rules
  const rulesYaml = `
groups:
  - name: node_alerts
    rules:
      - alert: NodeDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Node is down"
`;
  vfs.writeFile('/etc/prometheus/alert.rules.yaml', rulesYaml);

  const checkRes = dispatcher.handlePromtool({
    argv: ['promtool', 'check', 'rules', '/etc/prometheus/alert.rules.yaml']
  });
  assert.equal(checkRes.code, 0);
  assert.ok(checkRes.stdout.includes('SUCCESS'));
});

test('Subphase 3.2.1: logcli query and Loki stream filtering integration', () => {
  const graph = new ResourceGraph();
  const logql = new LogQLEngine();
  const now = Date.now() * 1000000;

  logql.pushLog({ app: 'payment' }, 'Payment charge succeeded: $49.00', now);
  logql.pushLog({ app: 'payment' }, 'Payment timeout connecting to gateway', now + 1000000);

  const dispatcher = new MultiCliDispatcher({ graph, logql });

  const queryRes = dispatcher.handleLogcli({
    argv: ['logcli', 'query', '{app="payment"} |= "timeout"']
  });
  assert.equal(queryRes.code, 0);
  assert.ok(queryRes.stdout.includes('Payment timeout connecting to gateway'));
  assert.ok(!queryRes.stdout.includes('Payment charge succeeded'));
});

test('Subphase 3.2.1: otelcol validate --config with valid and invalid OpenTelemetry pipeline topologies', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();

  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // 1. Valid OTel Collector Config
  const validYaml = `
receivers:
  otlp:
    protocols:
      grpc: { endpoint: "0.0.0.0:4317" }
processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
  batch:
    timeout: 1s
exporters:
  otlp:
    endpoint: "tempo:4317"
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]
`;
  vfs.writeFile('/etc/otelcol/config.yaml', validYaml);

  const validRes = dispatcher.handleOtelcol({
    argv: ['otelcol', 'validate', '--config=/etc/otelcol/config.yaml']
  });
  assert.equal(validRes.code, 0);
  assert.ok(validRes.stdout.includes('Validation succeeded'));

  // 2. Broken OTel Collector Config (Missing exporters in pipeline)
  const brokenYaml = `
receivers:
  otlp: {}
processors: {}
exporters: {}
service:
  pipelines:
    traces:
      receivers: [otlp]
`;
  vfs.writeFile('/etc/otelcol/broken.yaml', brokenYaml);

  const brokenRes = dispatcher.handleOtelcol({
    argv: ['otelcol', 'validate', '--config=/etc/otelcol/broken.yaml']
  });
  assert.equal(brokenRes.code, 1);
  assert.ok(brokenRes.stderr.includes('must have at least one exporter'));
});

test('Subphase 3.2.1: curl endpoint queries against Prometheus and Loki APIs', () => {
  const graph = new ResourceGraph();
  const promql = new PromQLEngine();
  const logql = new LogQLEngine();

  promql.recordSample('node_memory_usage_bytes', { node: 'worker-1' }, 4294967296);
  logql.pushLog({ env: 'production' }, 'Database failover initiated');

  const dispatcher = new MultiCliDispatcher({ graph, promql, logql });

  // 1. curl Prometheus query API
  const promCurl = dispatcher.handleCurl({
    argv: ['curl', '-s', 'http://localhost:9090/api/v1/query?query=node_memory_usage_bytes']
  });
  assert.equal(promCurl.code, 0);
  const promJson = JSON.parse(promCurl.stdout);
  assert.equal(promJson.status, 'success');
  assert.equal(promJson.data.result[0].metric.node, 'worker-1');
  assert.equal(promJson.data.result[0].value[1], '4294967296');

  // 2. curl Loki query API
  const lokiCurl = dispatcher.handleCurl({
    argv: ['curl', '-s', 'http://localhost:3100/loki/api/v1/query?query={env="production"}']
  });
  assert.equal(lokiCurl.code, 0);
  const lokiJson = JSON.parse(lokiCurl.stdout);
  assert.equal(lokiJson.status, 'success');
  assert.ok(lokiJson.data.result[0].values[0][1].includes('Database failover initiated'));
});
