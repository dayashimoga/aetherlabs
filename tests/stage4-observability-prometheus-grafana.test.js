/**
 * tests/stage4-observability-prometheus-grafana.test.js
 * Subphase 4.2.2 Verification: Domain 26 (Observability Core), Domain 27 (Prometheus) & Domain 28 (Grafana)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * RED and USE observability frameworks, PromQL time-series evaluation,
 * Prometheus Operator ServiceMonitors, PrometheusRule alerts with promtool syntax verification,
 * and Grafana dashboards-as-code ConfigMaps and Alertmanager notification routing Secrets.
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

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.2.2 — Domain 26 (Observability), Domain 27 (Prometheus) & Domain 28 (Grafana)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 26, 27, and 28 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain26 = pluginManager.getDomain('observability-core');
    assert.ok(domain26, 'Domain 26 (observability-core) must exist');
    assert.equal(domain26.category, 'Observability & SRE');
    assert.equal(domain26.trackId, 'track-sre');
    assert.equal(domain26.labs.length, 2);
    assert.equal(domain26.assessmentQuestions.length, 2);

    const domain27 = pluginManager.getDomain('prometheus-monitoring');
    assert.ok(domain27, 'Domain 27 (prometheus-monitoring) must exist');
    assert.equal(domain27.category, 'Observability & SRE');
    assert.equal(domain27.trackId, 'track-sre');
    assert.equal(domain27.labs.length, 2);
    assert.equal(domain27.assessmentQuestions.length, 2);

    const domain28 = pluginManager.getDomain('grafana-visualization');
    assert.ok(domain28, 'Domain 28 (grafana-visualization) must exist');
    assert.equal(domain28.category, 'Observability & SRE');
    assert.equal(domain28.trackId, 'track-sre');
    assert.equal(domain28.labs.length, 2);
    assert.equal(domain28.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 6 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-obs-01-red-metrics-sli',
      'lab-obs-02-use-metrics-audit',
      'lab-prom-01-servicemonitor-discovery',
      'lab-prom-02-prometheusrule-promtool',
      'lab-graf-01-dashboard-as-code',
      'lab-graf-02-alertmanager-routing'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 6, 'Must find all 6 subphase labs');

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

  it('3. Deterministic Solver: All 6 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-obs-01-red-metrics-sli',
      'lab-obs-02-use-metrics-audit',
      'lab-prom-01-servicemonitor-discovery',
      'lab-prom-02-prometheusrule-promtool',
      'lab-graf-01-dashboard-as-code',
      'lab-graf-02-alertmanager-routing'
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

  it('4. Engine Parity: Domain 26 Observability Core RED & USE Frameworks', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /obs');
    terminal.execute('promql node_cpu_utilization > /obs/use-audit.txt');

    assert.ok(vfs.exists('/obs/use-audit.txt'));
    const content = vfs.readFile('/obs/use-audit.txt');
    assert.ok(content.includes('node_cpu_utilization') || content.includes('series matched'));

    terminal.execute(`cat << 'EOF' > /obs/red-telemetry.json
{
  "service": "checkout-service",
  "framework": "RED",
  "rateMetric": "http_requests_total"
}
EOF`);
    assert.ok(vfs.exists('/obs/red-telemetry.json'));
    assert.ok(vfs.readFile('/obs/red-telemetry.json').includes('http_requests_total'));
  });

  it('5. Engine Parity: Domain 27 Prometheus ServiceMonitors & promtool validation', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /monitoring');
    const smYaml = `cat << 'EOF' > /monitoring/payment-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: payment-servicemonitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: payment-api
  endpoints:
    - port: http-metrics
      path: /metrics
      interval: 15s
EOF`;
    terminal.execute(smYaml);
    terminal.execute('kubectl apply -f /monitoring/payment-servicemonitor.yaml');

    const sm = cluster.getResource('ServiceMonitor', 'payment-servicemonitor', 'monitoring');
    assert.ok(sm, 'ServiceMonitor must exist in cluster');
    assert.equal(sm.spec.selector.matchLabels.app, 'payment-api');
    assert.equal(sm.spec.endpoints[0].interval, '15s');

    const alertYaml = `cat << 'EOF' > /monitoring/payment-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: payment-alerts
  namespace: monitoring
spec:
  groups:
    - name: payment.rules
      rules:
        - alert: PaymentHigh5xxRate
          expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: Payment service 5xx error rate exceeds 5 percent
EOF`;
    terminal.execute(alertYaml);
    const checkRes = terminal.execute('promtool check rules /monitoring/payment-alerts.yaml');
    assert.equal(checkRes.exitCode, 0);
    assert.ok(checkRes.output.includes('SUCCESS'));

    terminal.execute('kubectl apply -f /monitoring/payment-alerts.yaml');
    const promRule = cluster.getResource('PrometheusRule', 'payment-alerts', 'monitoring');
    assert.ok(promRule, 'PrometheusRule must exist in cluster');
    assert.equal(promRule.spec.groups[0].rules[0].alert, 'PaymentHigh5xxRate');
  });

  it('6. Engine Parity: Domain 28 Grafana Dashboard as Code & Alertmanager Secret', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /grafana');
    const dashYaml = `cat << 'EOF' > /grafana/dashboard-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-golden-signals
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  golden-signals-dashboard.json: |
    {
      "title": "API Golden Signals RED/USE",
      "panels": [
        {"title": "Request Rate (RPS)", "type": "timeseries"},
        {"title": "Error Rate %", "type": "timeseries"},
        {"title": "Latency P99", "type": "timeseries"}
      ]
    }
EOF`;
    terminal.execute(dashYaml);
    terminal.execute('kubectl apply -f /grafana/dashboard-configmap.yaml');

    const cm = cluster.getResource('ConfigMap', 'grafana-dashboard-golden-signals', 'monitoring');
    assert.ok(cm, 'Dashboard ConfigMap must exist');
    assert.equal(cm.metadata.labels['grafana_dashboard'], '1');
    assert.ok(cm.data['golden-signals-dashboard.json'].includes('Latency P99'));

    terminal.execute('mkdir -p /monitoring');
    const amYaml = `cat << 'EOF' > /monitoring/alertmanager-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-main
  namespace: monitoring
data:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m
    route:
      group_by: ['alertname', 'namespace']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      receiver: pagerduty-critical
    receivers:
      - name: pagerduty-critical
EOF`;
    terminal.execute(amYaml);
    terminal.execute('kubectl apply -f /monitoring/alertmanager-secret.yaml');

    const secret = cluster.getResource('Secret', 'alertmanager-main', 'monitoring');
    assert.ok(secret, 'Alertmanager Secret must exist');
    assert.ok(secret.data['alertmanager.yaml'].includes('repeat_interval: 4h'));
  });
});
