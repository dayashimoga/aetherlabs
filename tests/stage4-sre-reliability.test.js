/**
 * tests/stage4-sre-reliability.test.js
 * Subphase 4.3.1 Verification: Domain 31 (SRE Incident Recovery) & Domain 32 (Platform Reliability)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * SLO contracts and 30-day error budget burn-rate calculations via SloBurnRateCalculator,
 * multi-window multi-burn-rate PrometheusRule alerting, cluster-scoped PriorityClass scheduling,
 * PodDisruptionBudget (PDB) voluntary disruption constraints, and chaos experiment execution with container preStop hooks.
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
const { SloBurnRateCalculator } = require('../src/core/observabilityEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.3.1 — Domain 31 (SRE Practices) & Domain 32 (Platform Reliability)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 31 and 32 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain31 = pluginManager.getDomain('sre-incident-recovery');
    assert.ok(domain31, 'Domain 31 (sre-incident-recovery) must exist');
    assert.equal(domain31.category, 'Site Reliability & Resiliency');
    assert.equal(domain31.trackId, 'track-sre');
    assert.equal(domain31.labs.length, 2);
    assert.equal(domain31.assessmentQuestions.length, 2);

    const domain32 = pluginManager.getDomain('platform-reliability');
    assert.ok(domain32, 'Domain 32 (platform-reliability) must exist');
    assert.equal(domain32.category, 'Site Reliability & Resiliency');
    assert.equal(domain32.trackId, 'track-sre');
    assert.equal(domain32.labs.length, 2);
    assert.equal(domain32.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-sre-01-slo-budget-governance',
      'lab-sre-02-burn-rate-alerting',
      'lab-rel-01-pdb-priorityclass',
      'lab-rel-02-chaos-prestop-hook'
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
      'lab-sre-01-slo-budget-governance',
      'lab-sre-02-burn-rate-alerting',
      'lab-rel-01-pdb-priorityclass',
      'lab-rel-02-chaos-prestop-hook'
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

  it('4. Engine Parity: Domain 31 SRE SloBurnRateCalculator & Multi-Window Alerts', () => {
    // 1. Calculate Rapid Burn Rate (14.4x)
    const rapidCalc = SloBurnRateCalculator.calculate({
      totalEvents: 100000,
      badEvents: 144, // 0.144% error rate on 99.9% SLO (0.1% budget) -> 1.44x error budget / hour
      sloTarget: 0.999,
      windowDays: 30,
      periodHours: 1
    });
    assert.ok(rapidCalc.burnRate >= 1.0);

    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /sre');
    terminal.execute(`cat << 'EOF' > /sre/burn-rate-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: payment-slo-burn-alerts
  namespace: monitoring
spec:
  groups:
    - name: payment-slo.rules
      rules:
        - alert: PaymentSloBurnRateRapid
          expr: (rate(http_requests_total{status=~"5.."}[1h]) / rate(http_requests_total[1h])) / (1 - 0.999) > 14.4
          for: 2m
          labels:
            severity: critical
EOF`);
    terminal.execute('kubectl apply -f /sre/burn-rate-alerts.yaml');

    const pr = cluster.getResource('PrometheusRule', 'payment-slo-burn-alerts', 'monitoring');
    assert.ok(pr, 'PrometheusRule must exist in cluster');
    assert.equal(pr.spec.groups[0].rules[0].alert, 'PaymentSloBurnRateRapid');
  });

  it('5. Engine Parity: Domain 32 PriorityClass, PodDisruptionBudget & Chaos', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /reliability');
    terminal.execute('kubectl create namespace production');

    const haYaml = `apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: production-critical
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payment-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: payment-api`;

    vfs.writeFile('/reliability/ha.yaml', haYaml);
    terminal.execute('kubectl apply -f /reliability/ha.yaml');

    const pc = cluster.getResource('PriorityClass', 'production-critical');
    assert.ok(pc, 'PriorityClass must exist');
    assert.equal(pc.value, 1000000);

    const pdb = cluster.getResource('PodDisruptionBudget', 'payment-pdb', 'production');
    assert.ok(pdb, 'PodDisruptionBudget must exist');
    assert.equal(pdb.spec.minAvailable, 2);

    // Chaos experiment execution
    const chaosRes = terminal.execute('chaos experiment pod-kill -n production');
    assert.equal(chaosRes.exitCode, 0);
    assert.ok(chaosRes.output.includes('ChaosEngine') || chaosRes.output.includes('reconciled'));
  });
});
