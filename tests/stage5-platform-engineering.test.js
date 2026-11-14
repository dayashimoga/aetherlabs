/**
 * tests/stage5-platform-engineering.test.js
 * Subphase 5.2.1 Verification: Domain 41 (Platform Engineering & Developer Portals)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Internal Developer Platform (IDP) Golden Paths, Backstage software catalog metadata specifications,
 * and self-service multi-tenant developer sandbox provisioning with ResourceQuotas and LimitRanges.
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

describe('Subphase 5.2.1 — Domain 41 (Platform Engineering & Developer Portals)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 41 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain41 = pluginManager.getDomain('platform-engineering');
    assert.ok(domain41, 'Domain 41 (platform-engineering) must exist');
    assert.equal(domain41.category, 'Platform Engineering & Security');
    assert.equal(domain41.trackId, 'track-platform');
    assert.equal(domain41.labs.length, 2);
    assert.equal(domain41.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-plat-01-backstage-catalog',
      'lab-plat-02-self-service-sandbox'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 2, 'Must find both subphase labs');

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

  it('3. Deterministic Solver: Both labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-plat-01-backstage-catalog',
      'lab-plat-02-self-service-sandbox'
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

  it('4. Engine Parity: Domain 41 Backstage Catalog & Multi-Tenant Sandbox Provisioning', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /idp');
    terminal.execute('kubectl create namespace production');

    // 1. Backstage Software Catalog Manifest
    const backstageYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: backstage-catalog-manifest
  namespace: production
data:
  componentName: "payment-gateway"
  componentType: "service"
  lifecycle: "production"
  owner: "team-fintech"
  catalogInfoYaml: "apiVersion: backstage.io/v1alpha1\\nkind: Component\\nmetadata:\\n  name: payment-gateway\\nspec:\\n  type: service\\n  lifecycle: production\\n  owner: team-fintech\\n"`;

    vfs.writeFile('/idp/backstage-catalog.yaml', backstageYaml);
    terminal.execute('kubectl apply -f /idp/backstage-catalog.yaml');

    const cm = cluster.getResource('ConfigMap', 'backstage-catalog-manifest', 'production');
    assert.ok(cm, 'ConfigMap backstage-catalog-manifest must exist');
    assert.equal(cm.data.componentName, 'payment-gateway');
    assert.equal(cm.data.owner, 'team-fintech');

    // 2. Tenant Sandbox with ResourceQuota and LimitRange
    const sandboxYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: sandbox-team-alpha
  labels:
    platform.kubelabs.io/tier: sandbox
    platform.kubelabs.io/tenant: team-alpha
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: sandbox-compute-quota
  namespace: sandbox-team-alpha
spec:
  hard:
    requests.cpu: "4000m"
    requests.memory: "8Gi"
    limits.memory: "16Gi"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: sandbox-limit-range
  namespace: sandbox-team-alpha
spec:
  limits:
    - type: Container
      default:
        memory: "1Gi"`;

    vfs.writeFile('/idp/tenant-sandbox.yaml', sandboxYaml);
    terminal.execute('kubectl apply -f /idp/tenant-sandbox.yaml');

    const ns = cluster.getResource('Namespace', 'sandbox-team-alpha');
    assert.ok(ns, 'Namespace sandbox-team-alpha must exist');

    const quota = cluster.getResource('ResourceQuota', 'sandbox-compute-quota', 'sandbox-team-alpha');
    assert.ok(quota, 'ResourceQuota sandbox-compute-quota must exist');
    assert.equal(quota.spec.hard['requests.cpu'], '4000m');
    assert.equal(quota.spec.hard['limits.memory'], '16Gi');

    const lr = cluster.getResource('LimitRange', 'sandbox-limit-range', 'sandbox-team-alpha');
    assert.ok(lr, 'LimitRange sandbox-limit-range must exist');
    assert.equal(lr.spec.limits[0].default.memory, '1Gi');
  });
});
