'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PromQLEngine,
  LogQLEngine,
  OTelPipelineValidator,
  JaegerTraceGenerator,
  SloBurnRateCalculator
} = require('../src/core/observabilityEngine');

// ---------------------------------------------------------------------------
// 1. PROMQL ENGINE TESTS
// ---------------------------------------------------------------------------

test('Subphase 3.2.1: PromQLEngine instant vector selectors with label matchers', () => {
  const prom = new PromQLEngine();
  const now = 1731420000;

  prom.recordSample('http_requests_total', { service: 'checkout', status: '200', env: 'prod' }, 1500, now);
  prom.recordSample('http_requests_total', { service: 'checkout', status: '500', env: 'prod' }, 45, now);
  prom.recordSample('http_requests_total', { service: 'payment', status: '200', env: 'prod' }, 3200, now);
  prom.recordSample('http_requests_total', { service: 'payment', status: '503', env: 'dev' }, 12, now);

  // Exact match
  let res = prom.query('http_requests_total{service="checkout", status="500"}', now);
  assert.equal(res.status, 'success');
  assert.equal(res.data.result.length, 1);
  assert.equal(res.data.result[0].value[1], '45');

  // Negative match
  res = prom.query('http_requests_total{status!="200"}', now);
  assert.equal(res.data.result.length, 2);

  // Regex match
  res = prom.query('http_requests_total{status=~"5.."}', now);
  assert.equal(res.data.result.length, 2);

  // Negative regex match
  res = prom.query('http_requests_total{env!~"dev"}', now);
  assert.equal(res.data.result.length, 3);
});

test('Subphase 3.2.1: PromQLEngine rate and irate evaluation over range vectors', () => {
  const prom = new PromQLEngine();
  const t0 = 1000;

  // Counter increasing over 5 minutes (300 seconds)
  prom.setSamples('http_requests_total', { service: 'auth' }, [
    { time: t0, value: 100 },
    { time: t0 + 60, value: 160 },
    { time: t0 + 120, value: 240 },
    { time: t0 + 180, value: 330 },
    { time: t0 + 240, value: 430 },
    { time: t0 + 300, value: 550 } // Total increase = 450 over 300s -> 1.5 req/sec
  ]);

  // rate over 5m: (550 - 100) / 300s = 1.5
  let res = prom.query('rate(http_requests_total[5m])', t0 + 300);
  assert.equal(res.status, 'success');
  assert.equal(res.data.result.length, 1);
  assert.equal(parseFloat(res.data.result[0].value[1]), 1.5);

  // irate over last 2 samples: (550 - 430) / 60s = 2.0
  res = prom.query('irate(http_requests_total[5m])', t0 + 300);
  assert.equal(res.status, 'success');
  assert.equal(res.data.result.length, 1);
  assert.equal(parseFloat(res.data.result[0].value[1]), 2.0);
});

test('Subphase 3.2.1: PromQLEngine aggregations (sum, avg, count, min, max) and grouping', () => {
  const prom = new PromQLEngine();
  const now = 2000;

  prom.recordSample('node_cpu_seconds', { node: 'node-1', mode: 'idle' }, 80, now);
  prom.recordSample('node_cpu_seconds', { node: 'node-1', mode: 'system' }, 10, now);
  prom.recordSample('node_cpu_seconds', { node: 'node-1', mode: 'user' }, 10, now);
  prom.recordSample('node_cpu_seconds', { node: 'node-2', mode: 'idle' }, 60, now);
  prom.recordSample('node_cpu_seconds', { node: 'node-2', mode: 'system' }, 20, now);
  prom.recordSample('node_cpu_seconds', { node: 'node-2', mode: 'user' }, 20, now);

  // sum by (node)
  let res = prom.query('sum by (node) (node_cpu_seconds)', now);
  assert.equal(res.status, 'success');
  assert.equal(res.data.result.length, 2);

  const n1 = res.data.result.find((r) => r.metric.node === 'node-1');
  const n2 = res.data.result.find((r) => r.metric.node === 'node-2');
  assert.equal(parseFloat(n1.value[1]), 100);
  assert.equal(parseFloat(n2.value[1]), 100);

  // count by (mode)
  res = prom.query('count by (mode) (node_cpu_seconds)', now);
  assert.equal(res.data.result.length, 3);
  assert.equal(parseFloat(res.data.result[0].value[1]), 2);
});

test('Subphase 3.2.1: PromQLEngine histogram_quantile P95/P99 linear interpolation', () => {
  const prom = new PromQLEngine();
  const now = 5000;

  // Latency buckets: 0.05s (10 req), 0.1s (25 req), 0.25s (80 req), 0.5s (150 req), 1.0s (190 req), +Inf (200 req)
  const buckets = [
    { le: '0.05', val: 10 },
    { le: '0.1', val: 25 },
    { le: '0.25', val: 80 },
    { le: '0.5', val: 150 },
    { le: '1.0', val: 190 },
    { le: '+Inf', val: 200 }
  ];

  for (const b of buckets) {
    prom.recordSample('http_request_duration_seconds_bucket', { service: 'api', le: b.le }, b.val, now);
  }

  // P50: Rank = 0.5 * 200 = 100 -> between bucket 0.25 (80) and 0.5 (150)
  // Fraction = (100 - 80) / (150 - 80) = 20 / 70 = 0.2857
  // Value = 0.25 + 0.2857 * (0.5 - 0.25) = 0.25 + 0.0714 = 0.3214s
  let res = prom.query('histogram_quantile(0.5, http_request_duration_seconds_bucket)', now);
  assert.equal(res.status, 'success');
  const p50 = parseFloat(res.data.result[0].value[1]);
  assert.ok(p50 >= 0.30 && p50 <= 0.35, `P50 expected ~0.32s, got ${p50}`);

  // P95: Rank = 0.95 * 200 = 190 -> exactly at bucket 1.0 (190)
  res = prom.query('histogram_quantile(0.95, http_request_duration_seconds_bucket)', now);
  assert.equal(res.status, 'success');
  const p95 = parseFloat(res.data.result[0].value[1]);
  assert.ok(p95 >= 0.95 && p95 <= 1.0, `P95 expected ~1.0s, got ${p95}`);
});

// ---------------------------------------------------------------------------
// 2. LOGQL ENGINE TESTS
// ---------------------------------------------------------------------------

test('Subphase 3.2.1: LogQLEngine stream selection, line filters, and JSON parsing', () => {
  const loki = new LogQLEngine();
  const baseTime = 1731420000000000;

  loki.pushLog({ app: 'checkout', env: 'prod' }, JSON.stringify({ level: 'info', status: 200, latency_ms: 45, msg: 'Cart retrieved' }), baseTime);
  loki.pushLog({ app: 'checkout', env: 'prod' }, JSON.stringify({ level: 'warn', status: 404, latency_ms: 12, msg: 'Item out of stock' }), baseTime + 1000);
  loki.pushLog({ app: 'checkout', env: 'prod' }, JSON.stringify({ level: 'error', status: 500, latency_ms: 320, msg: 'Database connection failed' }), baseTime + 2000);
  loki.pushLog({ app: 'checkout', env: 'prod' }, JSON.stringify({ level: 'error', status: 503, latency_ms: 510, msg: 'Payment gateway timeout' }), baseTime + 3000);
  loki.pushLog({ app: 'auth', env: 'prod' }, JSON.stringify({ level: 'error', status: 500, msg: 'Token validation error' }), baseTime + 4000);

  // 1. Basic stream selector
  let res = loki.query('{app="checkout"}');
  assert.equal(res.status, 'success');
  assert.equal(res.data.result.length, 4);

  // 2. Line filter contains: |= "timeout"
  res = loki.query('{app="checkout"} |= "timeout"');
  assert.equal(res.data.result.length, 1);
  assert.match(res.data.result[0].values[0][1], /Payment gateway timeout/);

  // 3. Line filter regex: |~ "failed|timeout"
  res = loki.query('{app="checkout"} |~ "failed|timeout"');
  assert.equal(res.data.result.length, 2);

  // 4. JSON parser and label filter: | json | status >= 500
  res = loki.query('{app="checkout"} | json | status >= 500');
  assert.equal(res.data.result.length, 2);

  // 5. JSON parser and equality filter: | json | level == "warn"
  res = loki.query('{app="checkout"} | json | level == "warn"');
  assert.equal(res.data.result.length, 1);
  assert.match(res.data.result[0].values[0][1], /Item out of stock/);
});

// ---------------------------------------------------------------------------
// 3. OPENTELEMETRY COLLECTOR PIPELINE VALIDATOR TESTS
// ---------------------------------------------------------------------------

test('Subphase 3.2.1: OTelPipelineValidator configuration validation and best-practice checks', () => {
  // 1. Valid OTel Collector Configuration
  const validConfig = `
receivers:
  otlp:
    protocols:
      grpc: { endpoint: "0.0.0.0:4317" }
      http: { endpoint: "0.0.0.0:4318" }
  prometheus:
    config:
      scrape_configs: []

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 75
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp:
    endpoint: "tempo:4317"
    tls: { insecure: true }
  prometheus:
    endpoint: "0.0.0.0:8889"
  logging:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp, logging]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
`;

  let val = OTelPipelineValidator.validate(validConfig);
  assert.equal(val.valid, true);
  assert.equal(val.errors.length, 0);

  // 2. Broken configuration referencing undefined processor & inverted memory_limiter order
  const invalidConfig = {
    receivers: { otlp: {} },
    processors: { batch: {}, memory_limiter: {} },
    exporters: { logging: {} },
    service: {
      pipelines: {
        traces: {
          receivers: ['otlp'],
          processors: ['batch', 'memory_limiter', 'non_existent_processor'],
          exporters: ['logging']
        }
      }
    }
  };

  val = OTelPipelineValidator.validate(invalidConfig);
  assert.equal(val.valid, false);
  assert.ok(val.errors.some((e) => e.includes('non_existent_processor')));
  assert.ok(val.warnings.some((w) => w.includes('memory_limiter" should precede "batch')));
});

// ---------------------------------------------------------------------------
// 4. JAEGER TRACE GENERATOR TESTS
// ---------------------------------------------------------------------------

test('Subphase 3.2.1: JaegerTraceGenerator span trees and search queries', () => {
  const jaeger = new JaegerTraceGenerator();

  // Generate healthy trace
  const t1 = jaeger.generateTrace({
    serviceName: 'ingress-nginx',
    operationName: 'GET /api/checkout',
    durationMs: 85,
    error: false
  });
  assert.ok(t1.traceID);
  assert.equal(t1.spans.length, 4); // Root + 3 downstream
  assert.equal(t1.spans[0].tags.find((t) => t.key === 'http.status_code').value, 200);

  // Generate failed trace
  const t2 = jaeger.generateTrace({
    serviceName: 'ingress-nginx',
    operationName: 'POST /api/pay',
    durationMs: 250,
    error: true
  });
  assert.equal(t2.spans[0].tags.find((t) => t.key === 'error').value, true);

  // Search traces by service
  const searchByService = jaeger.findTraces({ service: 'ingress-nginx' });
  assert.equal(searchByService.length, 2);

  // Search traces by operation
  const searchByOp = jaeger.findTraces({ operation: 'POST /api/pay' });
  assert.equal(searchByOp.length, 1);
  assert.equal(searchByOp[0].traceID, t2.traceID);
});

// ---------------------------------------------------------------------------
// 5. SLO ERROR BUDGET BURN-RATE CALCULATOR TESTS
// ---------------------------------------------------------------------------

test('Subphase 3.2.1: SloBurnRateCalculator multi-window burn rate and alert tiering', () => {
  // Scenario 1: Normal steady-state (10 failures out of 100,000 requests over 1 hour)
  // SLO: 99.9% (Allowed error budget: 0.1% = 100 failures allowed)
  // Current error rate = 10 / 100000 = 0.01% -> Burn rate = 0.01% / 0.1% = 0.1x (Well within budget)
  let calc = SloBurnRateCalculator.calculate({
    totalEvents: 100000,
    badEvents: 10,
    sloTarget: 0.999,
    windowDays: 30,
    periodHours: 1
  });
  assert.equal(calc.currentAvailability, 0.9999);
  assert.equal(calc.burnRate, 0.1);
  assert.equal(calc.alertSeverity, 'NORMAL');

  // Scenario 2: Severe outage (1,500 failures out of 100,000 requests in 1 hour)
  // Error rate = 1.5% -> Burn rate = 1.5% / 0.1% = 15.0x (> 14.4 threshold -> CRITICAL_PAGE)
  // Time to exhaustion = (30 * 24) / 15.0 = 48 hours
  calc = SloBurnRateCalculator.calculate({
    totalEvents: 100000,
    badEvents: 1500,
    sloTarget: 0.999,
    windowDays: 30,
    periodHours: 1
  });
  assert.equal(calc.burnRate, 15.0);
  assert.equal(calc.alertSeverity, 'CRITICAL_PAGE');
  assert.equal(calc.hoursToExhaustion, 48.0);

  // Scenario 3: Elevated error rate (700 failures out of 100,000 requests in 1 hour)
  // Error rate = 0.7% -> Burn rate = 0.7% / 0.1% = 7.0x (Between 6.0 and 14.4 -> HIGH_PAGE)
  calc = SloBurnRateCalculator.calculate({
    totalEvents: 100000,
    badEvents: 700,
    sloTarget: 0.999,
    windowDays: 30,
    periodHours: 1
  });
  assert.equal(calc.burnRate, 7.0);
  assert.equal(calc.alertSeverity, 'HIGH_PAGE');

  // Scenario 4: Slow burn (200 failures out of 100,000 requests in 1 hour)
  // Error rate = 0.2% -> Burn rate = 0.2% / 0.1% = 2.0x (Between 1.0 and 6.0 -> TICKET)
  calc = SloBurnRateCalculator.calculate({
    totalEvents: 100000,
    badEvents: 200,
    sloTarget: 0.999,
    windowDays: 30,
    periodHours: 1
  });
  assert.equal(calc.burnRate, 2.0);
  assert.equal(calc.alertSeverity, 'TICKET');
});

