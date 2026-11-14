/**
 * tests/stage4-otel-logging.test.js
 * Subphase 4.2.3 Verification: Domain 29 (OpenTelemetry Traces) & Domain 30 (Logging & Monitoring)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * OTel Collector pipeline verification with otelcol CLI and OTelPipelineValidator,
 * W3C tracecontext header contracts, Vector log collection with inline PII scrubbing,
 * and Grafana Loki LogQL stream filtering and parsing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { OTelPipelineValidator, LogQLEngine } = require('../src/core/observabilityEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.2.3 — Domain 29 (OpenTelemetry) & Domain 30 (Logging & Monitoring)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 29 and 30 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain29 = pluginManager.getDomain('opentelemetry-traces');
    assert.ok(domain29, 'Domain 29 (opentelemetry-traces) must exist');
    assert.equal(domain29.category, 'Observability & SRE');
    assert.equal(domain29.trackId, 'track-sre');
    assert.equal(domain29.labs.length, 2);
    assert.equal(domain29.assessmentQuestions.length, 2);

    const domain30 = pluginManager.getDomain('logging-monitoring');
    assert.ok(domain30, 'Domain 30 (logging-monitoring) must exist');
    assert.equal(domain30.category, 'Observability & SRE');
    assert.equal(domain30.trackId, 'track-sre');
    assert.equal(domain30.labs.length, 2);
    assert.equal(domain30.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-otel-01-collector-pipeline',
      'lab-otel-02-trace-context',
      'lab-log-01-vector-pii-scrub',
      'lab-log-02-loki-logql'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 subphase labs');

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} pre-score must be 0%, but got ${report.score}%. Report: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, false, `Lab ${lab.id} must not pass before solution`);
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-otel-01-collector-pipeline',
      'lab-otel-02-trace-context',
      'lab-log-01-vector-pii-scrub',
      'lab-log-02-loki-logql'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands
      for (const cmd of lab.solutionCommands) {
        terminal.execute(cmd);
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} post-score must be 100%, but got ${report.score}%. Rules: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, true, `Lab ${lab.id} must pass after canonical solution`);
    }
  });

  it('4. Engine Parity: Domain 29 OpenTelemetry Collector & otelcol CLI', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /otel');
    const otelYaml = `receivers:
  otlp:
    protocols:
      grpc:
      http:
processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 75
  batch:
    timeout: 1s
exporters:
  otlp:
    endpoint: "tempo.monitoring.svc.cluster.local:4317"
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]`;

    vfs.writeFile('/otel/collector-config.yaml', otelYaml);

    // Validate using otelcol CLI in TerminalEngine
    const valRes = terminal.execute('otelcol validate --config=/otel/collector-config.yaml');
    assert.equal(valRes.exitCode, 0);
    assert.ok(valRes.output.includes('Validation succeeded') || valRes.output.includes('succeeded'));

    // Validate directly using OTelPipelineValidator
    const directVal = OTelPipelineValidator.validate(otelYaml);
    assert.equal(directVal.valid, true);
    assert.equal(directVal.errors.length, 0);
  });

  it('5. Engine Parity: Domain 30 Vector PII Redaction & Loki LogQL', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /logging');
    terminal.execute('kubectl create namespace logging');

    const vectorYaml = `sources:
  k8s_logs:
    type: kubernetes_logs
transforms:
  redact_pii:
    type: remap
    inputs: [k8s_logs]
    source: .message = replace(.message, r'[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}', "[REDACTED_CC]")
sinks:
  loki:
    type: loki
    inputs: [redact_pii]
    endpoint: "http://loki.logging.svc:3100"`;

    vfs.writeFile('/logging/vector.yaml', vectorYaml);
    assert.ok(vfs.readFile('/logging/vector.yaml').includes('REDACTED_CC'));

    // Test LogQL evaluation
    const logql = new LogQLEngine();
    logql.pushLog({ app: 'payment-api', env: 'production' }, 'Payment processed for order #10842');
    logql.pushLog({ app: 'payment-api', env: 'production' }, 'payment failed: card decline error code 4002');

    const queryRes = logql.query('{app="payment-api"} |= "payment failed"');
    assert.equal(queryRes.status, 'success');
    assert.ok(queryRes.data.result.length > 0);

    // Test LogQL CLI execution
    const cliRes = terminal.execute('logql \'{app="payment-api"} |= "payment failed"\' > /logging/error-audit.log');
    assert.equal(cliRes.exitCode, 0);
    assert.ok(vfs.exists('/logging/error-audit.log'));
  });
});
